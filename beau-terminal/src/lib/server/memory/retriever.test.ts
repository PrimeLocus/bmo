import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRetrieverImpl } from './retriever.js';
import type { RetrieveContext, SourceType, CollectionName } from './types.js';
import { estimateTokens } from './types.js';

// --- Mock helpers ---

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
		// Stub out other methods to satisfy type
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

// Mock Ollama embed endpoint
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

describe('MemoryRetrieverImpl', () => {
	const ollamaUrl = 'http://localhost:11434';

	function defaultCtx(overrides?: Partial<RetrieveContext>): RetrieveContext {
		return {
			mode: 'collaborator',
			caller: 'thoughts',
			...overrides,
		};
	}

	describe('policy mapping', () => {
		it('queries correct collections for collaborator/thoughts', async () => {
			const identity = mockCollection(mockQueryResult({ ids: [], documents: [], metadatas: [], distances: [] }));
			const experience = mockCollection(mockQueryResult({ ids: [], documents: [], metadatas: [], distances: [] }));
			const priv = mockCollection(mockQueryResult({ ids: [], documents: [], metadatas: [], distances: [] }));

			const client = makeChromaClient({
				beau_identity: identity,
				beau_experience: experience,
				beau_private: priv,
			});

			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			await retriever.retrieve('test query', defaultCtx({ mode: 'collaborator', caller: 'thoughts' }));

			// collaborator/thoughts gets all 3 collections
			expect(client.getCollection).toHaveBeenCalledWith({ name: 'beau_identity' });
			expect(client.getCollection).toHaveBeenCalledWith({ name: 'beau_experience' });
			expect(client.getCollection).toHaveBeenCalledWith({ name: 'beau_private' });
		});

		it('queries only identity for ambient/prompt', async () => {
			const identity = mockCollection(mockQueryResult({ ids: [], documents: [], metadatas: [], distances: [] }));

			const client = makeChromaClient({ beau_identity: identity });

			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			await retriever.retrieve('test query', defaultCtx({ mode: 'ambient', caller: 'prompt' }));

			expect(client.getCollection).toHaveBeenCalledTimes(1);
			expect(client.getCollection).toHaveBeenCalledWith({ name: 'beau_identity' });
		});
	});

	describe('privacy invariant', () => {
		it('prompt caller NEVER queries beau_private', async () => {
			const identity = mockCollection(mockQueryResult({ ids: [], documents: [], metadatas: [], distances: [] }));
			const experience = mockCollection(mockQueryResult({ ids: [], documents: [], metadatas: [], distances: [] }));
			const priv = mockCollection(mockQueryResult({ ids: [], documents: [], metadatas: [], distances: [] }));

			const client = makeChromaClient({
				beau_identity: identity,
				beau_experience: experience,
				beau_private: priv,
			});

			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);

			// Test all modes with prompt caller
			for (const mode of ['ambient', 'witness', 'collaborator', 'archivist', 'social']) {
				await retriever.retrieve('test', defaultCtx({ mode, caller: 'prompt' }));
			}

			// beau_private should NEVER have been queried
			const calledCollections = client.getCollection.mock.calls.map((c: any) => c[0].name);
			expect(calledCollections).not.toContain('beau_private');
		});
	});

	describe('embedding', () => {
		it('calls Ollama embed with correct model and input', async () => {
			const identity = mockCollection(mockQueryResult({ ids: [], documents: [], metadatas: [], distances: [] }));
			const client = makeChromaClient({ beau_identity: identity });

			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			await retriever.retrieve('what is wonder?', defaultCtx({ mode: 'ambient', caller: 'prompt' }));

			expect(fetchMock).toHaveBeenCalledWith(
				'http://localhost:11434/api/embed',
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify({ model: 'nomic-embed-text', input: 'what is wonder?' }),
				}),
			);
		});

		it('passes embedding to ChromaDB query', async () => {
			const coll = mockCollection(mockQueryResult({ ids: [], documents: [], metadatas: [], distances: [] }));
			const client = makeChromaClient({ beau_identity: coll });

			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			await retriever.retrieve('test', defaultCtx({ mode: 'ambient', caller: 'prompt' }));

			expect(coll.query).toHaveBeenCalledWith(
				expect.objectContaining({
					queryEmbeddings: [FAKE_EMBEDDING],
					nResults: 10,
				}),
			);
		});
	});

	describe('result merging and basic retrieval', () => {
		it('returns fragments from multiple collections', async () => {
			const identity = mockCollection(
				mockQueryResult({
					ids: ['id-1'],
					documents: ['Beau is wonder-first.'],
					metadatas: [{ source: 'canon', entityId: 'bible-1', createdAt: '2026-01-01' }],
					distances: [0.2],
				}),
			);
			const experience = mockCollection(
				mockQueryResult({
					ids: ['id-2'],
					documents: ['Today I watched the sunset.'],
					metadatas: [{ source: 'haiku', entityId: 'haiku-5', createdAt: '2026-03-20' }],
					distances: [0.3],
				}),
			);
			const priv = mockCollection(
				mockQueryResult({
					ids: ['id-3'],
					documents: ['Journal entry about solitude.'],
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

			expect(result.fragments).toHaveLength(3);
			expect(result.usedTokens).toBeGreaterThan(0);

			const sources = result.fragments.map((f) => f.source);
			expect(sources).toContain('canon');
			expect(sources).toContain('haiku');
			expect(sources).toContain('journal');
		});
	});

	describe('deduplication', () => {
		it('keeps highest-scoring chunk per (source, entityId)', async () => {
			const coll = mockCollection(
				mockQueryResult({
					ids: ['chunk-1', 'chunk-2', 'chunk-3'],
					documents: ['First chunk of bible section.', 'Second chunk, lower distance.', 'Different entity.'],
					metadatas: [
						{ source: 'canon', entityId: 'bible-1', createdAt: '2026-01-01' },
						{ source: 'canon', entityId: 'bible-1', createdAt: '2026-01-01' },
						{ source: 'canon', entityId: 'bible-2', createdAt: '2026-01-01' },
					],
					distances: [0.4, 0.1, 0.3],
				}),
			);

			const client = makeChromaClient({ beau_identity: coll });

			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			const result = await retriever.retrieve('test', defaultCtx({ mode: 'ambient', caller: 'prompt' }));

			// Two unique (source, entityId) pairs: canon::bible-1 and canon::bible-2
			expect(result.fragments).toHaveLength(2);

			const bible1 = result.fragments.find((f) => f.entityId === 'bible-1');
			expect(bible1).toBeDefined();
			// Should keep the one with lower distance (0.1 = more similar)
			expect(bible1!.rawDistance).toBe(0.1);
			expect(bible1!.text).toBe('Second chunk, lower distance.');
		});

		it('allows same entityId in different sources', async () => {
			// entityId "5" exists in both canon and haiku — both should survive dedup
			const identity = mockCollection(
				mockQueryResult({
					ids: ['id-a'],
					documents: ['Canon text.'],
					metadatas: [{ source: 'canon', entityId: '5', createdAt: '2026-01-01' }],
					distances: [0.2],
				}),
			);
			const experience = mockCollection(
				mockQueryResult({
					ids: ['id-b'],
					documents: ['Haiku text.'],
					metadatas: [{ source: 'haiku', entityId: '5', createdAt: '2026-03-01' }],
					distances: [0.3],
				}),
			);

			const client = makeChromaClient({
				beau_identity: identity,
				beau_experience: experience,
			});

			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			const result = await retriever.retrieve('test', defaultCtx({ mode: 'witness', caller: 'prompt' }));

			expect(result.fragments).toHaveLength(2);
		});
	});

	describe('reranking', () => {
		it('base score is 1 - distance', async () => {
			const coll = mockCollection(
				mockQueryResult({
					ids: ['id-1'],
					documents: ['Some text.'],
					metadatas: [{ source: 'haiku', entityId: 'h-1', createdAt: '2020-01-01' }],
					distances: [0.3],
				}),
			);

			const client = makeChromaClient({ beau_identity: coll });

			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			const result = await retriever.retrieve('test', defaultCtx({ mode: 'ambient', caller: 'prompt' }));

			// Old doc (2020) → negligible freshness bonus, not identity → score ~= 1 - 0.3 = 0.7
			const frag = result.fragments[0];
			expect(frag.finalScore).toBeCloseTo(0.7, 1);
		});

		it('identity collection gets +0.02 bonus', async () => {
			const identity = mockCollection(
				mockQueryResult({
					ids: ['id-1'],
					documents: ['Canon text.'],
					metadatas: [{ source: 'canon', entityId: 'b-1', createdAt: '2020-01-01' }],
					distances: [0.3],
				}),
			);
			const experience = mockCollection(
				mockQueryResult({
					ids: ['id-2'],
					documents: ['Haiku text.'],
					metadatas: [{ source: 'haiku', entityId: 'h-1', createdAt: '2020-01-01' }],
					distances: [0.3],
				}),
			);

			const client = makeChromaClient({
				beau_identity: identity,
				beau_experience: experience,
			});

			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			const result = await retriever.retrieve('test', defaultCtx({ mode: 'witness', caller: 'prompt' }));

			const canon = result.fragments.find((f) => f.source === 'canon')!;
			const haiku = result.fragments.find((f) => f.source === 'haiku')!;

			// Same distance, same old date — identity bonus should make canon score higher
			expect(canon.finalScore).toBeGreaterThan(haiku.finalScore);
			expect(canon.finalScore - haiku.finalScore).toBeCloseTo(0.02, 2);
		});

		it('recent documents get freshness bonus up to 0.05', async () => {
			const now = new Date().toISOString();
			const old = '2020-01-01T00:00:00.000Z';

			const coll = mockCollection(
				mockQueryResult({
					ids: ['new-doc', 'old-doc'],
					documents: ['Fresh observation.', 'Ancient memory.'],
					metadatas: [
						{ source: 'haiku', entityId: 'h-new', createdAt: now },
						{ source: 'haiku', entityId: 'h-old', createdAt: old },
					],
					distances: [0.3, 0.3],
				}),
			);

			const client = makeChromaClient({ beau_experience: coll });

			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			const result = await retriever.retrieve('test', defaultCtx({ mode: 'witness', caller: 'prompt' }));

			const fresh = result.fragments.find((f) => f.entityId === 'h-new')!;
			const stale = result.fragments.find((f) => f.entityId === 'h-old')!;

			expect(fresh.finalScore).toBeGreaterThan(stale.finalScore);
			// Freshness bonus should be bounded at MAX_FRESHNESS_BONUS (0.05)
			// Use toBeCloseTo to handle floating point precision
			expect(fresh.finalScore - stale.finalScore).toBeLessThanOrEqual(0.05 + 1e-10);
		});

		it('results are sorted by finalScore descending', async () => {
			const coll = mockCollection(
				mockQueryResult({
					ids: ['far', 'close', 'mid'],
					documents: ['Far away.', 'Very close match.', 'Middling match.'],
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

			// Should be sorted: close (0.1) → mid (0.4) → far (0.8) by distance
			expect(result.fragments[0].entityId).toBe('b-2'); // distance 0.1 → highest score
			expect(result.fragments[1].entityId).toBe('b-3'); // distance 0.4
			expect(result.fragments[2].entityId).toBe('b-1'); // distance 0.8 → lowest score

			for (let i = 1; i < result.fragments.length; i++) {
				expect(result.fragments[i - 1].finalScore).toBeGreaterThanOrEqual(result.fragments[i].finalScore);
			}
		});
	});

	describe('token budget trimming', () => {
		it('trims fragments to stay within maxTokens', async () => {
			// Each doc is ~50 chars = ~13 tokens. With 3 docs, ~39 tokens total.
			const coll = mockCollection(
				mockQueryResult({
					ids: ['a', 'b', 'c'],
					documents: [
						'A'.repeat(200), // ~50 tokens
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

			// Set a tight budget that only fits ~1.5 docs
			const result = await retriever.retrieve('test', defaultCtx({ mode: 'ambient', caller: 'prompt', maxTokens: 75 }));

			// Should include first doc (50 tokens) but not all three (150 tokens)
			expect(result.usedTokens).toBeLessThanOrEqual(75);
			expect(result.fragments.length).toBeLessThan(3);
			expect(result.fragments.length).toBeGreaterThanOrEqual(1);
		});

		it('uses policy maxTokens when ctx.maxTokens not provided', async () => {
			// ambient/prompt policy maxTokens = 175
			const longText = 'A'.repeat(600); // ~150 tokens each
			const coll = mockCollection(
				mockQueryResult({
					ids: ['a', 'b'],
					documents: [longText, longText],
					metadatas: [
						{ source: 'canon', entityId: 'e-1', createdAt: '2020-01-01' },
						{ source: 'canon', entityId: 'e-2', createdAt: '2020-01-01' },
					],
					distances: [0.1, 0.2],
				}),
			);

			const client = makeChromaClient({ beau_identity: coll });
			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);

			const result = await retriever.retrieve('test', defaultCtx({ mode: 'ambient', caller: 'prompt' }));

			// 175 token budget can fit 1 doc at 150 tokens but not 2 (300 tokens)
			expect(result.usedTokens).toBeLessThanOrEqual(175);
			expect(result.fragments).toHaveLength(1);
		});

		it('clamps ctx.maxTokens to policy max', async () => {
			// ambient/prompt policy maxTokens = 175. If ctx asks for 9999, still clamp to 175.
			const longText = 'A'.repeat(600); // ~150 tokens each
			const coll = mockCollection(
				mockQueryResult({
					ids: ['a', 'b'],
					documents: [longText, longText],
					metadatas: [
						{ source: 'canon', entityId: 'e-1', createdAt: '2020-01-01' },
						{ source: 'canon', entityId: 'e-2', createdAt: '2020-01-01' },
					],
					distances: [0.1, 0.2],
				}),
			);

			const client = makeChromaClient({ beau_identity: coll });
			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);

			const result = await retriever.retrieve('test', defaultCtx({ mode: 'ambient', caller: 'prompt', maxTokens: 9999 }));

			// Even though ctx asks for 9999, policy says 175 → still clamped
			expect(result.usedTokens).toBeLessThanOrEqual(175);
		});

		it('returns empty when no fragments fit budget', async () => {
			const coll = mockCollection(
				mockQueryResult({
					ids: ['a'],
					documents: ['A'.repeat(400)], // ~100 tokens
					metadatas: [{ source: 'canon', entityId: 'e-1', createdAt: '2020-01-01' }],
					distances: [0.1],
				}),
			);

			const client = makeChromaClient({ beau_identity: coll });
			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);

			const result = await retriever.retrieve('test', defaultCtx({ mode: 'ambient', caller: 'prompt', maxTokens: 5 }));

			expect(result.fragments).toHaveLength(0);
			expect(result.usedTokens).toBe(0);
		});
	});

	describe('fail-open', () => {
		it('returns empty when Ollama embed fails', async () => {
			fetchMock.mockRejectedValueOnce(new Error('Connection refused'));

			const client = makeChromaClient({});
			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);

			const result = await retriever.retrieve('test', defaultCtx());

			expect(result).toEqual({ fragments: [], usedTokens: 0, provenance: [] });
		});

		it('returns empty when Ollama returns non-OK status', async () => {
			fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

			const client = makeChromaClient({});
			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);

			const result = await retriever.retrieve('test', defaultCtx());

			expect(result).toEqual({ fragments: [], usedTokens: 0, provenance: [] });
		});

		it('returns empty when ChromaDB is unreachable (all collections fail)', async () => {
			const client = makeChromaClient({});
			// getCollection will throw for any name since no collections are registered

			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			const result = await retriever.retrieve('test', defaultCtx());

			expect(result).toEqual({ fragments: [], usedTokens: 0, provenance: [] });
		});
	});

	describe('partial failure', () => {
		it('returns results from surviving collections when one fails', async () => {
			const identity = mockCollection(
				mockQueryResult({
					ids: ['id-1'],
					documents: ['Canon text survives.'],
					metadatas: [{ source: 'canon', entityId: 'b-1', createdAt: '2026-01-01' }],
					distances: [0.2],
				}),
			);

			// experience will throw
			const client = makeChromaClient({ beau_identity: identity });
			// getCollection for beau_experience will throw (not in map)
			// getCollection for beau_private will also throw

			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			const result = await retriever.retrieve('test', defaultCtx({ mode: 'collaborator', caller: 'thoughts' }));

			// Only identity results survive — experience and private failed
			expect(result.fragments).toHaveLength(1);
			expect(result.fragments[0].source).toBe('canon');
			expect(result.usedTokens).toBeGreaterThan(0);
		});

		it('returns empty usedTokens=0 when all collections fail', async () => {
			const client = makeChromaClient({}); // all will fail

			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			const result = await retriever.retrieve('test', defaultCtx());

			expect(result.fragments).toHaveLength(0);
			expect(result.usedTokens).toBe(0);
		});
	});

	describe('source filters', () => {
		it('filters by ctx.filters.sources', async () => {
			const coll = mockCollection(
				mockQueryResult({
					ids: ['id-1', 'id-2'],
					documents: ['Canon text.', 'Haiku text.'],
					metadatas: [
						{ source: 'canon', entityId: 'b-1', createdAt: '2026-01-01' },
						{ source: 'haiku', entityId: 'h-1', createdAt: '2026-03-01' },
					],
					distances: [0.2, 0.3],
				}),
			);

			const client = makeChromaClient({ beau_identity: coll, beau_experience: coll });

			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);
			const result = await retriever.retrieve('test', defaultCtx({
				mode: 'witness',
				caller: 'prompt',
				filters: { sources: ['canon' as SourceType] },
			}));

			// Only canon fragments should survive
			for (const frag of result.fragments) {
				expect(frag.source).toBe('canon');
			}
		});
	});

	describe('token estimation consistency', () => {
		it('usedTokens matches sum of fragment tokenCounts', async () => {
			const coll = mockCollection(
				mockQueryResult({
					ids: ['a', 'b'],
					documents: ['Hello world, this is a test.', 'Another fragment with some text.'],
					metadatas: [
						{ source: 'canon', entityId: 'e-1', createdAt: '2020-01-01' },
						{ source: 'canon', entityId: 'e-2', createdAt: '2020-01-01' },
					],
					distances: [0.1, 0.2],
				}),
			);

			const client = makeChromaClient({ beau_identity: coll });
			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);

			const result = await retriever.retrieve('test', defaultCtx({ mode: 'ambient', caller: 'prompt' }));

			const expectedTokens = result.fragments.reduce((sum, f) => sum + f.tokenCount, 0);
			expect(result.usedTokens).toBe(expectedTokens);
		});

		it('fragment tokenCount uses estimateTokens()', async () => {
			const text = 'Exactly forty characters for this test!!';
			const coll = mockCollection(
				mockQueryResult({
					ids: ['a'],
					documents: [text],
					metadatas: [{ source: 'canon', entityId: 'e-1', createdAt: '2020-01-01' }],
					distances: [0.1],
				}),
			);

			const client = makeChromaClient({ beau_identity: coll });
			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);

			const result = await retriever.retrieve('test', defaultCtx({ mode: 'ambient', caller: 'prompt' }));

			expect(result.fragments[0].tokenCount).toBe(estimateTokens(text));
		});
	});

	describe('null document handling', () => {
		it('skips documents that are null', async () => {
			const coll = mockCollection(
				mockQueryResult({
					ids: ['has-text', 'no-text'],
					documents: ['Real document.', null],
					metadatas: [
						{ source: 'canon', entityId: 'e-1', createdAt: '2020-01-01' },
						{ source: 'canon', entityId: 'e-2', createdAt: '2020-01-01' },
					],
					distances: [0.1, 0.2],
				}),
			);

			const client = makeChromaClient({ beau_identity: coll });
			const retriever = new MemoryRetrieverImpl(client, ollamaUrl);

			const result = await retriever.retrieve('test', defaultCtx({ mode: 'ambient', caller: 'prompt' }));

			expect(result.fragments).toHaveLength(1);
			expect(result.fragments[0].text).toBe('Real document.');
		});
	});
});
