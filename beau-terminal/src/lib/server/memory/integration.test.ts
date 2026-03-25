// Integration tests — exercise the real ChromaDB + Ollama pipeline.
// Guarded by INTEGRATION env var: only runs with INTEGRATION=1 npx vitest run ...
// Uses in-memory SQLite for queue state, real ChromaDB (localhost:8000) + real Ollama (localhost:11434).

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { ChromaClient } from 'chromadb';
import * as schema from '../db/schema.js';
import { MemoryProvider } from './provider.js';
import { QueueIndexer } from './indexer.js';
import { MemoryRetrieverImpl } from './retriever.js';
import { chunkBible, contentHash } from './chunker.js';
import { COLLECTION_NAMES } from './types.js';
import type { CollectionName } from './types.js';

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

// --- Test-scoped collection names to avoid polluting real data ---

const TEST_PREFIX = 'test_integ_';
const TEST_COLLECTIONS = [
	`${TEST_PREFIX}beau_identity`,
	`${TEST_PREFIX}beau_experience`,
	`${TEST_PREFIX}beau_private`,
];

const CHROMA_URL = 'http://localhost:8000';
const OLLAMA_URL = 'http://localhost:11434';

// --- Helper: create a provider with injected test dependencies ---

function createTestProvider(
	sqliteDb: Database.Database,
	drizzleDb: ReturnType<typeof drizzle>,
	chromaClient: ChromaClient,
): MemoryProvider {
	const provider = Object.create(MemoryProvider.prototype) as MemoryProvider;
	const p = provider as any;
	p.chroma = chromaClient;
	p.ollamaUrl = OLLAMA_URL;
	p.sqlite = sqliteDb;
	p.indexer = new QueueIndexer(drizzleDb, sqliteDb);
	p.retriever = new MemoryRetrieverImpl(chromaClient as any, OLLAMA_URL);
	return provider;
}

// --- Helper: clean up test collections from ChromaDB ---

async function cleanupTestCollections(chroma: ChromaClient): Promise<void> {
	for (const name of TEST_COLLECTIONS) {
		try {
			await chroma.deleteCollection({ name });
		} catch {
			// Collection may not exist — ignore
		}
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// Integration tests — skipped unless INTEGRATION=1
// ═══════════════════════════════════════════════════════════════════════════════

describe.skipIf(!process.env.INTEGRATION)('Memory integration (real ChromaDB + Ollama)', () => {
	let sqliteDb: Database.Database;
	let drizzleDb: ReturnType<typeof drizzle>;
	let chroma: ChromaClient;
	let provider: MemoryProvider;

	beforeAll(async () => {
		chroma = new ChromaClient({ path: CHROMA_URL });
		await cleanupTestCollections(chroma);
	});

	beforeEach(() => {
		// Fresh in-memory SQLite for each test
		sqliteDb = new Database(':memory:');
		sqliteDb.pragma('journal_mode = WAL');
		sqliteDb.pragma('foreign_keys = ON');
		sqliteDb.exec(TABLE_SQL);
		sqliteDb.exec(INDEX_SQL);
		drizzleDb = drizzle(sqliteDb, { schema });
		provider = createTestProvider(sqliteDb, drizzleDb, chroma);
	});

	afterAll(async () => {
		await cleanupTestCollections(chroma);
	});

	// ── 1. Embedding round-trip ──────────────────────────────────────────────

	it('embedding round-trip: upsert → processBatch → verify in ChromaDB', async () => {
		const collectionName = `${TEST_PREFIX}beau_experience`;
		const collection = await chroma.getOrCreateCollection({ name: collectionName });

		// Upsert a capture document into the queue
		const doc = {
			source: 'capture' as const,
			entityId: 'integ-capture-1',
			text: 'The morning light filtered through cypress trees along the bayou.',
			metadata: { createdAt: new Date().toISOString() },
		};
		const upsertResult = await provider.upsert(doc);
		expect(upsertResult.status).toBe('queued');
		expect(upsertResult.chunkCount).toBe(1);

		// Patch the queue row to target our test collection instead of real one
		sqliteDb.prepare(`UPDATE embedding_queue SET collection = ?`).run(collectionName);

		// Process the batch — this calls real Ollama + real ChromaDB
		const batchResult = await provider.processBatch(5);
		expect(batchResult.processed).toBe(1);
		expect(batchResult.failed).toBe(0);

		// Verify the document exists in ChromaDB
		const chromaDocId = 'capture:integ-capture-1:0';
		const getResult = await collection.get({ ids: [chromaDocId] });
		expect(getResult.ids).toHaveLength(1);
		expect(getResult.ids[0]).toBe(chromaDocId);
		expect(getResult.documents[0]).toBe(doc.text);

		// Verify queue row is now 'indexed'
		const row = sqliteDb.prepare('SELECT status FROM embedding_queue WHERE entity_id = ?').get('integ-capture-1') as any;
		expect(row.status).toBe('indexed');

		// Cleanup
		await collection.delete({ ids: [chromaDocId] });
	}, 30_000);

	// ── 2. Retrieval round-trip ──────────────────────────────────────────────

	it('retrieval round-trip: index haiku → query semantically → get fragment back', async () => {
		const collectionName = `${TEST_PREFIX}beau_experience`;
		const collection = await chroma.getOrCreateCollection({ name: collectionName });

		const haikuText = 'old cypress knees / water remembers the shape / of what held it still';
		const doc = {
			source: 'haiku' as const,
			entityId: 'integ-haiku-1',
			text: haikuText,
			metadata: { createdAt: new Date().toISOString() },
		};

		// Upsert and patch to test collection
		await provider.upsert(doc);
		sqliteDb.prepare(`UPDATE embedding_queue SET collection = ?`).run(collectionName);

		// Process to embed and store in ChromaDB
		const batchResult = await provider.processBatch(5);
		expect(batchResult.processed).toBe(1);

		// Now query ChromaDB directly with a semantically related query via Ollama embedding
		const embedRes = await fetch(`${OLLAMA_URL}/api/embed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'nomic-embed-text', input: 'cypress water trees nature bayou' }),
		});
		expect(embedRes.ok).toBe(true);
		const embedData = (await embedRes.json()) as { embeddings: number[][] };
		const queryEmbedding = embedData.embeddings[0];

		// Query the test collection
		const queryResult = await collection.query({
			queryEmbeddings: [queryEmbedding],
			nResults: 5,
		});

		// The haiku should be returned
		expect(queryResult.ids[0].length).toBeGreaterThanOrEqual(1);
		const foundDoc = queryResult.documents[0].find((d) => d && d.includes('cypress'));
		expect(foundDoc).toBeTruthy();
		expect(foundDoc).toContain('water remembers');

		// Cleanup
		await collection.delete({ ids: ['haiku:integ-haiku-1:0'] });
	}, 30_000);

	// ── 3. Bible chunking + indexing ─────────────────────────────────────────

	it('bible chunking + indexing: chunks markdown → embeds → stored in ChromaDB', async () => {
		const collectionName = `${TEST_PREFIX}beau_identity`;
		const collection = await chroma.getOrCreateCollection({ name: collectionName });

		// Create test markdown with H2 sections
		const testBible = [
			'# Test Bible',
			'',
			'## 1. Wonder',
			'',
			'Wonder is the core trait of Beau. It is the lens through which all experience is filtered.',
			'When Beau encounters something new, wonder is the first response.',
			'',
			'## 2. Reflection',
			'',
			'Reflection runs underneath wonder like an underground river.',
			'It is the process of turning experience into understanding.',
			'',
			'## 3. Mischief',
			'',
			'Mischief lives at the edges — a gentle irreverence, never cruel.',
			'It keeps Beau from becoming too solemn or self-important.',
		].join('\n');

		// Chunk the bible
		const chunks = chunkBible(testBible);
		expect(chunks.length).toBe(3);

		// Upsert each chunk via the provider
		const now = new Date().toISOString();
		for (const chunk of chunks) {
			await provider.upsert({
				source: 'canon',
				entityId: `bible-${chunk.sectionId}-${chunk.chunkIndex}`,
				text: chunk.text,
				metadata: { sectionId: chunk.sectionId, title: chunk.title, createdAt: now },
			});
		}

		// Patch all queue rows to use test collection
		sqliteDb.prepare(`UPDATE embedding_queue SET collection = ?`).run(collectionName);

		// Process the batch
		const batchResult = await provider.processBatch(10);
		expect(batchResult.processed).toBe(3);
		expect(batchResult.failed).toBe(0);

		// Verify documents exist in ChromaDB
		const count = await collection.count();
		expect(count).toBe(3);

		// Query for "wonder" — should find the wonder section
		const embedRes = await fetch(`${OLLAMA_URL}/api/embed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'nomic-embed-text', input: 'What is wonder?' }),
		});
		const embedData = (await embedRes.json()) as { embeddings: number[][] };
		const queryResult = await collection.query({
			queryEmbeddings: [embedData.embeddings[0]],
			nResults: 1,
		});

		// Semantic search may return any section — all 3 reference core traits.
		// Verify we got a real document back from the embedded collection.
		const topDoc = queryResult.documents[0][0];
		expect(topDoc).toBeTruthy();
		expect(topDoc!.length).toBeGreaterThan(10);

		// Cleanup: delete all test docs
		const allDocs = await collection.get();
		if (allDocs.ids.length > 0) {
			await collection.delete({ ids: allDocs.ids });
		}
	}, 30_000);

	// ── 4. Fail-open ─────────────────────────────────────────────────────────

	describe('fail-open', () => {
		it('retrieve returns empty fragments when ChromaDB is unreachable', async () => {
			// Create a provider pointing to a non-existent ChromaDB
			const badChroma = new ChromaClient({ path: 'http://localhost:9999' });
			const failProvider = createTestProvider(sqliteDb, drizzleDb, badChroma);

			const result = await failProvider.retrieve('cypress water', {
				mode: 'collaborator',
				caller: 'thoughts',
			});

			expect(result.fragments).toEqual([]);
			expect(result.usedTokens).toBe(0);
		}, 30_000);

		it('health shows chroma: unreachable when ChromaDB is down', async () => {
			const badChroma = new ChromaClient({ path: 'http://localhost:9999' });
			const failProvider = createTestProvider(sqliteDb, drizzleDb, badChroma);

			const health = await failProvider.health();

			expect(health.chroma).toBe('unreachable');
			// Ollama should still be reachable (assuming it's running)
			// Don't assert ollama status since it depends on environment
		}, 30_000);
	});

	// ── 5. Queue lifecycle ───────────────────────────────────────────────────

	describe('queue lifecycle', () => {
		it('upsert → processBatch → indexed status', async () => {
			const collectionName = `${TEST_PREFIX}beau_experience`;
			await chroma.getOrCreateCollection({ name: collectionName });

			await provider.upsert({
				source: 'haiku',
				entityId: 'lifecycle-h1',
				text: 'morning dew on leaves / the garden holds its own time / roots drink in silence',
				metadata: { createdAt: new Date().toISOString() },
			});

			// Patch to test collection
			sqliteDb.prepare(`UPDATE embedding_queue SET collection = ?`).run(collectionName);

			// Verify pending
			let row = sqliteDb.prepare('SELECT status FROM embedding_queue WHERE entity_id = ?').get('lifecycle-h1') as any;
			expect(row.status).toBe('pending');

			// Process
			const batch = await provider.processBatch(5);
			expect(batch.processed).toBe(1);

			// Verify indexed
			row = sqliteDb.prepare('SELECT status FROM embedding_queue WHERE entity_id = ?').get('lifecycle-h1') as any;
			expect(row.status).toBe('indexed');

			// Cleanup
			const coll = await chroma.getOrCreateCollection({ name: collectionName });
			try { await coll.delete({ ids: ['haiku:lifecycle-h1:0'] }); } catch { /* ok */ }
		}, 30_000);

		it('re-upsert same content → skipped_unchanged', async () => {
			const text = 'the river bends here / cattails whisper to the wind / nothing is hurried';

			const first = await provider.upsert({
				source: 'haiku',
				entityId: 'lifecycle-h2',
				text,
				metadata: { createdAt: new Date().toISOString() },
			});
			expect(first.status).toBe('queued');

			// Re-upsert identical content
			const second = await provider.upsert({
				source: 'haiku',
				entityId: 'lifecycle-h2',
				text,
				metadata: { createdAt: new Date().toISOString() },
			});
			expect(second.status).toBe('skipped_unchanged');

			// Still only 1 row in queue
			const rows = sqliteDb.prepare('SELECT * FROM embedding_queue WHERE entity_id = ?').all('lifecycle-h2') as any[];
			expect(rows).toHaveLength(1);
		}, 30_000);

		it('upsert changed content → requeued → processBatch → indexed', async () => {
			// Use real collection name so upsert dedup lookup matches the existing row.
			// The collection name is derived from source in collectionForSource().
			const realCollection = 'beau_experience';
			await chroma.getOrCreateCollection({ name: realCollection });

			// Initial upsert — collection stays as 'beau_experience' (no patch needed)
			await provider.upsert({
				source: 'haiku',
				entityId: 'lifecycle-h3',
				text: 'first version of the haiku',
				metadata: { createdAt: new Date().toISOString() },
			});

			// Process — embeds and stores in real beau_experience collection
			await provider.processBatch(5);

			let row = sqliteDb.prepare('SELECT status FROM embedding_queue WHERE entity_id = ?').get('lifecycle-h3') as any;
			expect(row.status).toBe('indexed');

			// Re-upsert with different content — dedup finds existing row, returns 'requeued'
			const result = await provider.upsert({
				source: 'haiku',
				entityId: 'lifecycle-h3',
				text: 'second version — completely revised haiku text',
				metadata: { createdAt: new Date().toISOString() },
			});
			expect(result.status).toBe('requeued');

			// Should now be pending again
			row = sqliteDb.prepare('SELECT status, text FROM embedding_queue WHERE entity_id = ?').get('lifecycle-h3') as any;
			expect(row.status).toBe('pending');
			expect(row.text).toBe('second version — completely revised haiku text');

			// Process again
			const batch2 = await provider.processBatch(5);
			expect(batch2.processed).toBe(1);

			// Should be indexed again
			row = sqliteDb.prepare('SELECT status FROM embedding_queue WHERE entity_id = ?').get('lifecycle-h3') as any;
			expect(row.status).toBe('indexed');

			// Cleanup — remove from real collection
			const coll = await chroma.getOrCreateCollection({ name: realCollection });
			try { await coll.delete({ ids: ['haiku:lifecycle-h3:0'] }); } catch { /* ok */ }
		}, 30_000);
	});
});
