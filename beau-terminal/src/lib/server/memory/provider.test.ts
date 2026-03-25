import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
import * as fs from 'fs';
import { MemoryProvider } from './provider.js';
import { QueueIndexer } from './indexer.js';
import { MemoryRetrieverImpl } from './retriever.js';
import { COLLECTION_NAMES, EMBEDDING_MODEL, CHUNKER_VERSION } from './types.js';
import type { CollectionName } from './types.js';
import { contentHash } from './chunker.js';
import { registerMemoryProvider, getMemoryProvider } from './index.js';

vi.mock('fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('fs')>();
	return {
		...actual,
		readFileSync: vi.fn(actual.readFileSync),
	};
});

// --- Schema DDL for in-memory SQLite ---

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS embedding_queue (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	source TEXT NOT NULL,
	entity_id TEXT NOT NULL,
	collection TEXT NOT NULL,
	content_hash TEXT NOT NULL,
	text TEXT NOT NULL,
	chunk_index INTEGER NOT NULL DEFAULT 0,
	metadata TEXT NOT NULL DEFAULT '{}',
	embedding_model TEXT NOT NULL DEFAULT 'nomic-embed-text',
	chunker_version TEXT NOT NULL DEFAULT 'v1',
	status TEXT NOT NULL DEFAULT 'pending',
	retry_count INTEGER NOT NULL DEFAULT 0,
	last_error TEXT,
	locked_at TEXT,
	locked_by TEXT,
	next_attempt_at TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	processed_at TEXT,
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

const INDEX_SQL = `CREATE UNIQUE INDEX IF NOT EXISTS eq_source_entity_collection_chunk
	ON embedding_queue(source, entity_id, collection, chunk_index)`;

// --- Mock ChromaDB ---

function mockCollection() {
	return {
		query: vi.fn().mockResolvedValue({
			ids: [[]], documents: [[]], metadatas: [[]], distances: [[]],
			embeddings: [[]], include: [], uris: [[]], rows: () => [[]],
		}),
		get: vi.fn().mockResolvedValue({ ids: [], documents: [], metadatas: [] }),
		add: vi.fn(),
		update: vi.fn(),
		upsert: vi.fn().mockResolvedValue(undefined),
		delete: vi.fn().mockResolvedValue({ deleted: 0 }),
		count: vi.fn().mockResolvedValue(42),
		search: vi.fn(),
		modify: vi.fn(),
		fork: vi.fn(),
		hasStringKnnQuery: vi.fn(),
	};
}

function mockChromaClient(collectionMap?: Record<string, ReturnType<typeof mockCollection>>) {
	const map = collectionMap ?? {};
	// Auto-create collections for any name
	return {
		getCollection: vi.fn(async ({ name }: { name: string }) => {
			if (!map[name]) throw new Error(`Collection ${name} not found`);
			return map[name];
		}),
		getOrCreateCollection: vi.fn(async ({ name }: { name: string }) => {
			if (!map[name]) map[name] = mockCollection();
			return map[name];
		}),
		deleteCollection: vi.fn().mockResolvedValue(undefined),
		heartbeat: vi.fn().mockResolvedValue(Date.now()),
		listCollections: vi.fn(),
		createCollection: vi.fn(),
		collection: vi.fn(),
		reset: vi.fn(),
		version: vi.fn(),
	} as any;
}

// --- Mock Ollama ---

const FAKE_EMBEDDING = Array(768).fill(0.01);
let fetchMock: ReturnType<typeof vi.fn>;

// --- Test helpers ---

function createProvider(
	sqliteDb: Database.Database,
	drizzleDb: ReturnType<typeof drizzle>,
	chromaClient: ReturnType<typeof mockChromaClient>,
) {
	// Bypass the constructor to inject mocks.
	const provider = Object.create(MemoryProvider.prototype) as MemoryProvider;
	const p = provider as any;
	p.chroma = chromaClient;
	p.ollamaUrl = 'http://localhost:11434';
	p.sqlite = sqliteDb;
	p.indexer = new QueueIndexer(drizzleDb, sqliteDb);
	p.retriever = new MemoryRetrieverImpl(chromaClient, p.ollamaUrl);
	return provider;
}

// --- Tests ---

describe('MemoryProvider', () => {
	let sqliteDb: Database.Database;
	let drizzleDb: ReturnType<typeof drizzle>;
	let chroma: ReturnType<typeof mockChromaClient>;
	let provider: MemoryProvider;

	beforeEach(() => {
		sqliteDb = new Database(':memory:');
		sqliteDb.pragma('journal_mode = WAL');
		sqliteDb.pragma('foreign_keys = ON');
		sqliteDb.exec(TABLE_SQL);
		sqliteDb.exec(INDEX_SQL);
		drizzleDb = drizzle(sqliteDb, { schema });

		chroma = mockChromaClient();
		provider = createProvider(sqliteDb, drizzleDb, chroma);

		// Mock fetch for Ollama calls
		fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ embeddings: [FAKE_EMBEDDING] }),
		});
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		sqliteDb.close();
		vi.restoreAllMocks();
	});

	// --- upsert ---

	describe('upsert', () => {
		it('delegates to indexer and enqueues document', async () => {
			const result = await provider.upsert({
				source: 'haiku',
				entityId: 'h-1',
				text: 'autumn wind blows through',
				metadata: { trigger: 'time' },
			});

			expect(result.status).toBe('queued');
			expect(result.chunkCount).toBe(1);

			// Verify row in queue
			const row = sqliteDb.prepare('SELECT * FROM embedding_queue WHERE entity_id = ?').get('h-1') as any;
			expect(row).toBeTruthy();
			expect(row.source).toBe('haiku');
			expect(row.collection).toBe('beau_experience');
			expect(row.status).toBe('pending');
		});

		it('skips unchanged content', async () => {
			await provider.upsert({
				source: 'haiku',
				entityId: 'h-1',
				text: 'autumn wind blows through',
				metadata: { trigger: 'time' },
			});

			const result = await provider.upsert({
				source: 'haiku',
				entityId: 'h-1',
				text: 'autumn wind blows through',
				metadata: { trigger: 'time' },
			});

			expect(result.status).toBe('skipped_unchanged');
		});
	});

	// --- remove ---

	describe('remove', () => {
		it('removes from queue and attempts ChromaDB deletion', async () => {
			await provider.upsert({
				source: 'haiku',
				entityId: 'h-1',
				text: 'autumn wind blows through',
				metadata: {},
			});

			const coll = mockCollection();
			coll.get.mockResolvedValue({
				ids: ['haiku:h-1:0', 'haiku:h-1:1', 'canon:c-1:0'],
				documents: [], metadatas: [],
			});
			chroma.getOrCreateCollection.mockResolvedValue(coll);

			await provider.remove({ source: 'haiku', entityId: 'h-1' });

			// Queue should be empty
			const row = sqliteDb.prepare('SELECT * FROM embedding_queue WHERE entity_id = ?').get('h-1');
			expect(row).toBeUndefined();

			// ChromaDB delete should have been called with matching IDs
			expect(coll.delete).toHaveBeenCalledWith({ ids: ['haiku:h-1:0', 'haiku:h-1:1'] });
		});

		it('fails open if ChromaDB is unreachable during remove', async () => {
			await provider.upsert({
				source: 'haiku',
				entityId: 'h-1',
				text: 'autumn wind blows through',
				metadata: {},
			});

			chroma.getOrCreateCollection.mockRejectedValue(new Error('connection refused'));

			// Should not throw
			await provider.remove({ source: 'haiku', entityId: 'h-1' });

			// Queue removal still happened
			const row = sqliteDb.prepare('SELECT * FROM embedding_queue WHERE entity_id = ?').get('h-1');
			expect(row).toBeUndefined();
		});
	});

	// --- health ---

	describe('health', () => {
		it('reports ok when both services are reachable', async () => {
			const result = await provider.health();

			expect(result.chroma).toBe('ok');
			expect(result.ollama).toBe('ok');
			expect(result.queue).toEqual({ pending: 0, processing: 0, indexed: 0, failed: 0 });
			expect(result.collections).toHaveLength(3);
			expect(result.collections[0].name).toBe('beau_identity');
		});

		it('reports unreachable when ChromaDB heartbeat fails', async () => {
			chroma.heartbeat.mockRejectedValue(new Error('connection refused'));

			const result = await provider.health();

			expect(result.chroma).toBe('unreachable');
			expect(result.ollama).toBe('ok');
		});

		it('reports unreachable when Ollama tags endpoint fails', async () => {
			fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

			const result = await provider.health();

			// ChromaDB still ok (mock heartbeat resolves)
			expect(result.chroma).toBe('ok');
			expect(result.ollama).toBe('unreachable');
		});

		it('includes queue stats in health response', async () => {
			await provider.upsert({ source: 'haiku', entityId: 'h-1', text: 'test', metadata: {} });
			await provider.upsert({ source: 'haiku', entityId: 'h-2', text: 'test2', metadata: {} });

			const result = await provider.health();

			expect(result.queue.pending).toBe(2);
		});

		it('includes collection counts', async () => {
			const result = await provider.health();

			expect(result.collections).toEqual([
				{ name: 'beau_identity', count: 42 },
				{ name: 'beau_experience', count: 42 },
				{ name: 'beau_private', count: 42 },
			]);
		});
	});

	// --- processBatch ---

	describe('processBatch', () => {
		it('claims, embeds, upserts to ChromaDB, and marks indexed', async () => {
			await provider.upsert({
				source: 'haiku',
				entityId: 'h-1',
				text: 'autumn wind blows through',
				metadata: { createdAt: '2026-03-24T00:00:00Z' },
			});

			const coll = mockCollection();
			chroma.getOrCreateCollection.mockResolvedValue(coll);

			const result = await provider.processBatch(5);

			expect(result.processed).toBe(1);
			expect(result.failed).toBe(0);
			expect(result.pending).toBe(0);

			// Verify Ollama was called with correct model
			expect(fetchMock).toHaveBeenCalledWith(
				'http://localhost:11434/api/embed',
				expect.objectContaining({
					method: 'POST',
					body: expect.stringContaining(EMBEDDING_MODEL),
				}),
			);

			// Verify ChromaDB upsert was called
			expect(coll.upsert).toHaveBeenCalledWith({
				ids: ['haiku:h-1:0'],
				embeddings: [FAKE_EMBEDDING],
				documents: ['autumn wind blows through'],
				metadatas: [expect.objectContaining({
					source: 'haiku',
					entityId: 'h-1',
					embeddingModel: EMBEDDING_MODEL,
					chunkerVersion: CHUNKER_VERSION,
				})],
			});

			// Verify row is now indexed
			const row = sqliteDb.prepare('SELECT status FROM embedding_queue WHERE entity_id = ?').get('h-1') as any;
			expect(row.status).toBe('indexed');
		});

		it('marks failed when Ollama embed returns non-200', async () => {
			await provider.upsert({
				source: 'haiku',
				entityId: 'h-1',
				text: 'autumn wind blows through',
				metadata: {},
			});

			fetchMock.mockResolvedValue({ ok: false, status: 503 });

			const result = await provider.processBatch(5);

			expect(result.processed).toBe(0);
			expect(result.failed).toBe(1);

			// Row should be back to pending with retryCount=1
			const row = sqliteDb.prepare('SELECT status, retry_count, last_error FROM embedding_queue WHERE entity_id = ?').get('h-1') as any;
			expect(row.status).toBe('pending');
			expect(row.retry_count).toBe(1);
			expect(row.last_error).toContain('503');
		});

		it('marks failed when Ollama fetch throws', async () => {
			await provider.upsert({
				source: 'haiku',
				entityId: 'h-1',
				text: 'autumn wind blows through',
				metadata: {},
			});

			fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

			const result = await provider.processBatch(5);

			expect(result.processed).toBe(0);
			expect(result.failed).toBe(1);
		});

		it('returns zeroes when queue is empty', async () => {
			const result = await provider.processBatch(5);

			expect(result.processed).toBe(0);
			expect(result.failed).toBe(0);
			expect(result.pending).toBe(0);
		});

		it('processes multiple items in a batch', async () => {
			await provider.upsert({ source: 'haiku', entityId: 'h-1', text: 'one', metadata: {} });
			await provider.upsert({ source: 'haiku', entityId: 'h-2', text: 'two', metadata: {} });
			await provider.upsert({ source: 'haiku', entityId: 'h-3', text: 'three', metadata: {} });

			const coll = mockCollection();
			chroma.getOrCreateCollection.mockResolvedValue(coll);

			const result = await provider.processBatch(10);

			expect(result.processed).toBe(3);
			expect(result.failed).toBe(0);
			expect(coll.upsert).toHaveBeenCalledTimes(3);
		});
	});

	// --- rebuildCollection ---

	describe('rebuildCollection', () => {
		it('deletes and recreates collection, resets queue entries', async () => {
			// Seed some indexed rows for beau_experience
			await provider.upsert({ source: 'haiku', entityId: 'h-1', text: 'test', metadata: {} });
			await provider.upsert({ source: 'haiku', entityId: 'h-2', text: 'test2', metadata: {} });
			// Mark them as indexed manually
			sqliteDb.prepare("UPDATE embedding_queue SET status = 'indexed'").run();

			const coll = mockCollection();
			coll.count.mockResolvedValue(10);
			chroma.getOrCreateCollection.mockResolvedValue(coll);

			const result = await provider.rebuildCollection('beau_experience');

			expect(result.cleared).toBe(10);
			expect(result.requeued).toBe(2);

			// Verify ChromaDB was asked to delete + recreate
			expect(chroma.deleteCollection).toHaveBeenCalledWith({ name: 'beau_experience' });

			// Verify queue rows reset
			const rows = sqliteDb.prepare("SELECT * FROM embedding_queue WHERE status = 'pending'").all();
			expect(rows).toHaveLength(2);
		});

		it('still resets queue even if ChromaDB is unreachable', async () => {
			await provider.upsert({ source: 'haiku', entityId: 'h-1', text: 'test', metadata: {} });
			sqliteDb.prepare("UPDATE embedding_queue SET status = 'indexed'").run();

			chroma.getOrCreateCollection.mockRejectedValue(new Error('unreachable'));

			const result = await provider.rebuildCollection('beau_experience');

			expect(result.cleared).toBe(0);
			expect(result.requeued).toBe(1);
		});
	});

	// --- ensureCollections ---

	describe('ensureCollections', () => {
		it('creates all 3 collections', async () => {
			await provider.ensureCollections();

			expect(chroma.getOrCreateCollection).toHaveBeenCalledTimes(3);
			expect(chroma.getOrCreateCollection).toHaveBeenCalledWith({ name: 'beau_identity' });
			expect(chroma.getOrCreateCollection).toHaveBeenCalledWith({ name: 'beau_experience' });
			expect(chroma.getOrCreateCollection).toHaveBeenCalledWith({ name: 'beau_private' });
		});
	});

	// --- indexBible ---

	describe('indexBible', () => {
		it('chunks bible and enqueues all chunks', async () => {
			vi.mocked(fs.readFileSync).mockReturnValue(
				'# Beau\'s Bible\n\n## 1. Wonder\n\nWonder is the core trait.\n\n## 2. Reflection\n\nReflection runs underneath.\n'
			);

			await provider.indexBible();

			// Should have enqueued 2 chunks (2 H2 sections)
			const rows = sqliteDb.prepare('SELECT * FROM embedding_queue').all() as any[];
			expect(rows.length).toBe(2);
			expect(rows[0].source).toBe('canon');
			expect(rows[0].entity_id).toBe('bible-1-0');
			expect(rows[1].entity_id).toBe('bible-2-0');
		});

		it('fails gracefully if bible file does not exist', async () => {
			vi.mocked(fs.readFileSync).mockImplementation(() => {
				throw new Error('ENOENT');
			});

			// Should not throw
			await provider.indexBible();

			// No rows enqueued
			const rows = sqliteDb.prepare('SELECT * FROM embedding_queue').all();
			expect(rows).toHaveLength(0);
		});
	});

	// --- reconcileAll ---

	describe('reconcileAll', () => {
		it('recovers stuck processing jobs', async () => {
			await provider.upsert({ source: 'haiku', entityId: 'h-1', text: 'test', metadata: {} });

			// Simulate a stuck job (processing with old locked_at)
			sqliteDb.prepare(`
				UPDATE embedding_queue
				SET status = 'processing', locked_by = 'old-worker',
				    locked_at = datetime('now', '-600 seconds')
			`).run();

			await provider.reconcileAll();

			const row = sqliteDb.prepare('SELECT status FROM embedding_queue WHERE entity_id = ?').get('h-1') as any;
			expect(row.status).toBe('pending');
		});
	});

	// --- recoverStuckJobs ---

	describe('recoverStuckJobs', () => {
		it('delegates to indexer and returns count', async () => {
			await provider.upsert({ source: 'haiku', entityId: 'h-1', text: 'test', metadata: {} });
			sqliteDb.prepare(`
				UPDATE embedding_queue
				SET status = 'processing', locked_by = 'old-worker',
				    locked_at = datetime('now', '-600 seconds')
			`).run();

			const recovered = provider.recoverStuckJobs();

			expect(recovered).toBe(1);
		});
	});
});

// --- Singleton tests ---

describe('memory singleton', () => {
	it('returns null before registration', () => {
		// Reset state
		registerMemoryProvider(null as any);
		expect(getMemoryProvider()).toBeNull();
	});

	it('register and get round-trips', () => {
		const fakeProvider = { fake: true } as any;
		registerMemoryProvider(fakeProvider);
		expect(getMemoryProvider()).toBe(fakeProvider);

		// Clean up
		registerMemoryProvider(null as any);
	});
});
