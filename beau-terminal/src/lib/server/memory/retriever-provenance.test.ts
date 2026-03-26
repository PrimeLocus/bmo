import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { MemoryRetrieverImpl } from './retriever.js';
import type { RetrieveContext, SourceType } from './types.js';
import type { RetrievalProvenance } from '../training/types.js';

// --- Mock helpers (shared pattern from retriever.test.ts) ---

function mockQueryResult(opts: {
	ids: string[];
	documents: (string | null)[];
	metadatas: (Record<string, string | number> | null)[];
	distances: (number | null)[];
}) {
	return {
		ids: [opts.ids],
		documents: [opts.documents],
		metadatas: [opts.metadatas],
		distances: [opts.distances],
		embeddings: [[]],
		include: [],
		uris: [[]],
		rows: () => [[]],
	};
}

function mockCollection(queryResult: ReturnType<typeof mockQueryResult>) {
	return {
		query: vi.fn().mockResolvedValue(queryResult),
		add: vi.fn(),
		update: vi.fn(),
		upsert: vi.fn(),
		search: vi.fn(),
		modify: vi.fn(),
		fork: vi.fn(),
		hasStringKnnQuery: vi.fn(),
	};
}

function makeChromaClient(collectionMap: Record<string, ReturnType<typeof mockCollection>>) {
	return {
		getCollection: vi.fn(async ({ name }: { name: string }) => {
			const coll = collectionMap[name];
			if (!coll) throw new Error(`Collection ${name} not found`);
			return coll;
		}),
		collection: vi.fn(),
		listCollections: vi.fn(),
		createCollection: vi.fn(),
		getOrCreateCollection: vi.fn(),
		deleteCollection: vi.fn(),
		heartbeat: vi.fn(),
		reset: vi.fn(),
		version: vi.fn(),
	} as any;
}

const FAKE_EMBEDDING = Array(768).fill(0.01);
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetchMock = vi.fn().mockResolvedValue({
		ok: true,
		json: async () => ({ embeddings: [FAKE_EMBEDDING] }),
	});
	vi.stubGlobal('fetch', fetchMock);
});

// --- Tests ---

describe('MemoryRetrieverImpl — retrieval provenance', () => {
	const ollamaUrl = 'http://localhost:11434';

	function defaultCtx(overrides?: Partial<RetrieveContext>): RetrieveContext {
		return {
			mode: 'collaborator',
			caller: 'thoughts',
			...overrides,
		};
	}

	function sha256(text: string): string {
		return createHash('sha256').update(text).digest('hex');
	}

	describe('provenance array structure', () => {
		it('returns provenance as an array of RetrievalProvenance objects', async () => {
			const coll = mockCollection(
				mockQueryResult({
					ids: ['id-1'],
					documents: ['Beau is wonder-first.'],
					metadatas: [{ source: 'canon', entityId: 'bible-1', createdAt: '2026-01-01' }],
					distances: [0.2],
				}),
			);

			const client = makeChromaClient({ beau_identity: coll });
			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			const result = await retriever.retrieve('wonder', defaultCtx({ mode: 'ambient', caller: 'prompt' }));

			expect(result.provenance).toBeDefined();
			expect(Array.isArray(result.provenance)).toBe(true);
			expect(result.provenance).toHaveLength(1);
		});

		it('each provenance entry has all required fields', async () => {
			const text = 'Beau is wonder-first.';
			const coll = mockCollection(
				mockQueryResult({
					ids: ['id-1'],
					documents: [text],
					metadatas: [{ source: 'canon', entityId: 'bible-1', createdAt: '2026-01-01' }],
					distances: [0.2],
				}),
			);

			const client = makeChromaClient({ beau_identity: coll });
			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			const result = await retriever.retrieve('wonder', defaultCtx({ mode: 'ambient', caller: 'prompt' }));

			const prov = result.provenance[0];
			expect(prov).toEqual(
				expect.objectContaining({
					fragmentId: 'id-1',
					collection: 'beau_identity',
					sourceType: 'canon',
					sourceEntityId: 'bible-1',
					rank: 0,
					baseScore: expect.any(Number),
					finalScore: expect.any(Number),
					selected: true,
					tokenCount: expect.any(Number),
					excerptHash: sha256(text),
				}),
			);
		});
	});

	describe('selected vs unselected fragments', () => {
		it('marks trimmed fragments as selected: false', async () => {
			// Three 200-char docs (~50 tokens each). Budget of 75 fits only ~1.
			const coll = mockCollection(
				mockQueryResult({
					ids: ['a', 'b', 'c'],
					documents: [
						'A'.repeat(200), // ~50 tokens, best score
						'B'.repeat(200), // ~50 tokens
						'C'.repeat(200), // ~50 tokens
					],
					metadatas: [
						{ source: 'canon', entityId: 'e-1', createdAt: '2020-01-01' },
						{ source: 'canon', entityId: 'e-2', createdAt: '2020-01-01' },
						{ source: 'canon', entityId: 'e-3', createdAt: '2020-01-01' },
					],
					distances: [0.1, 0.2, 0.3],
				}),
			);

			const client = makeChromaClient({ beau_identity: coll });
			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);

			const result = await retriever.retrieve(
				'test',
				defaultCtx({ mode: 'ambient', caller: 'prompt', maxTokens: 75 }),
			);

			// Provenance should include ALL candidates, not just selected
			expect(result.provenance.length).toBe(3);

			const selectedCount = result.provenance.filter((p) => p.selected).length;
			const unselectedCount = result.provenance.filter((p) => !p.selected).length;

			expect(selectedCount).toBeGreaterThanOrEqual(1);
			expect(unselectedCount).toBeGreaterThanOrEqual(1);
			expect(selectedCount + unselectedCount).toBe(3);

			// Selected fragments match the result.fragments
			expect(selectedCount).toBe(result.fragments.length);
		});

		it('all fragments selected when budget is generous', async () => {
			const coll = mockCollection(
				mockQueryResult({
					ids: ['a', 'b'],
					documents: ['Short text.', 'Also short.'],
					metadatas: [
						{ source: 'canon', entityId: 'e-1', createdAt: '2020-01-01' },
						{ source: 'canon', entityId: 'e-2', createdAt: '2020-01-01' },
					],
					distances: [0.1, 0.2],
				}),
			);

			const client = makeChromaClient({ beau_identity: coll });
			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			const result = await retriever.retrieve(
				'test',
				defaultCtx({ mode: 'ambient', caller: 'prompt', maxTokens: 9999 }),
			);

			expect(result.provenance.every((p) => p.selected)).toBe(true);
		});
	});

	describe('excerptHash', () => {
		it('is SHA-256 hex of fragment text', async () => {
			const text = 'Beau watches the rain.';
			const coll = mockCollection(
				mockQueryResult({
					ids: ['id-1'],
					documents: [text],
					metadatas: [{ source: 'haiku', entityId: 'h-1', createdAt: '2026-03-20' }],
					distances: [0.2],
				}),
			);

			const client = makeChromaClient({ beau_identity: coll });
			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			const result = await retriever.retrieve('rain', defaultCtx({ mode: 'ambient', caller: 'prompt' }));

			expect(result.provenance[0].excerptHash).toBe(sha256(text));
			// Verify it's a 64-char hex string (SHA-256)
			expect(result.provenance[0].excerptHash).toMatch(/^[0-9a-f]{64}$/);
		});
	});

	describe('ordering', () => {
		it('provenance is ordered by rank (0-indexed)', async () => {
			const coll = mockCollection(
				mockQueryResult({
					ids: ['far', 'close', 'mid'],
					documents: ['Far away.', 'Very close.', 'Middling.'],
					metadatas: [
						{ source: 'canon', entityId: 'b-1', createdAt: '2020-01-01' },
						{ source: 'canon', entityId: 'b-2', createdAt: '2020-01-01' },
						{ source: 'canon', entityId: 'b-3', createdAt: '2020-01-01' },
					],
					distances: [0.8, 0.1, 0.4],
				}),
			);

			const client = makeChromaClient({ beau_identity: coll });
			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			const result = await retriever.retrieve('test', defaultCtx({ mode: 'ambient', caller: 'prompt' }));

			// Provenance ranks should be 0, 1, 2
			expect(result.provenance.map((p) => p.rank)).toEqual([0, 1, 2]);

			// Rank 0 should be the closest (highest finalScore)
			expect(result.provenance[0].fragmentId).toBe('close');
			expect(result.provenance[1].fragmentId).toBe('mid');
			expect(result.provenance[2].fragmentId).toBe('far');

			// finalScore should be descending
			for (let i = 1; i < result.provenance.length; i++) {
				expect(result.provenance[i - 1].finalScore).toBeGreaterThanOrEqual(
					result.provenance[i].finalScore,
				);
			}
		});
	});

	describe('baseScore vs finalScore', () => {
		it('baseScore is 1 - rawDistance, finalScore includes bonuses', async () => {
			const now = new Date().toISOString();
			const coll = mockCollection(
				mockQueryResult({
					ids: ['id-1'],
					documents: ['Canon text.'],
					metadatas: [{ source: 'canon', entityId: 'b-1', createdAt: now }],
					distances: [0.3],
				}),
			);

			const client = makeChromaClient({ beau_identity: coll });
			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			const result = await retriever.retrieve('test', defaultCtx({ mode: 'ambient', caller: 'prompt' }));

			const prov = result.provenance[0];
			// baseScore = 1 - 0.3 = 0.7
			expect(prov.baseScore).toBeCloseTo(0.7, 5);
			// finalScore should be >= baseScore (includes freshness + identity bonus)
			expect(prov.finalScore).toBeGreaterThanOrEqual(prov.baseScore);
		});
	});

	describe('fail-open provenance', () => {
		it('returns empty provenance when Ollama embed fails', async () => {
			fetchMock.mockRejectedValueOnce(new Error('Connection refused'));

			const client = makeChromaClient({});
			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			const result = await retriever.retrieve('test', defaultCtx());

			expect(result.provenance).toEqual([]);
		});

		it('returns empty provenance when all collections fail', async () => {
			const client = makeChromaClient({});
			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			const result = await retriever.retrieve('test', defaultCtx());

			expect(result.provenance).toEqual([]);
		});
	});

	describe('entityId fallback', () => {
		it('uses ChromaDB document ID when entityId is missing from metadata', async () => {
			const coll = mockCollection(
				mockQueryResult({
					ids: ['chroma-doc-id-42'],
					documents: ['No entityId in metadata.'],
					metadatas: [{ source: 'canon', createdAt: '2026-01-01' }],
					distances: [0.2],
				}),
			);

			const client = makeChromaClient({ beau_identity: coll });
			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			const result = await retriever.retrieve('test', defaultCtx({ mode: 'ambient', caller: 'prompt' }));

			expect(result.provenance[0].sourceEntityId).toBe('chroma-doc-id-42');
		});
	});

	describe('multi-collection provenance', () => {
		it('includes provenance from all queried collections', async () => {
			const identity = mockCollection(
				mockQueryResult({
					ids: ['id-1'],
					documents: ['Canon text.'],
					metadatas: [{ source: 'canon', entityId: 'bible-1', createdAt: '2026-01-01' }],
					distances: [0.2],
				}),
			);
			const experience = mockCollection(
				mockQueryResult({
					ids: ['id-2'],
					documents: ['Haiku about rain.'],
					metadatas: [{ source: 'haiku', entityId: 'haiku-5', createdAt: '2026-03-20' }],
					distances: [0.3],
				}),
			);
			const priv = mockCollection(
				mockQueryResult({
					ids: ['id-3'],
					documents: ['Journal about solitude.'],
					metadatas: [{ source: 'journal', entityId: 'journal-2', createdAt: '2026-03-22' }],
					distances: [0.25],
				}),
			);

			const client = makeChromaClient({
				beau_identity: identity,
				beau_experience: experience,
				beau_private: priv,
			});

			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			const result = await retriever.retrieve('wonder', defaultCtx());

			expect(result.provenance).toHaveLength(3);

			const collections = result.provenance.map((p) => p.collection);
			expect(collections).toContain('beau_identity');
			expect(collections).toContain('beau_experience');
			expect(collections).toContain('beau_private');
		});
	});
});
