import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
import { QueueIndexer } from './indexer.js';
import { contentHash } from './chunker.js';
import type { MemoryDocument } from './types.js';
import { MAX_RETRY_COUNT, MAX_CHUNK_TOKENS } from './types.js';

function makeDoc(overrides: Partial<MemoryDocument> = {}): MemoryDocument {
	return {
		source: 'haiku',
		entityId: 'h-1',
		text: 'autumn wind blows through',
		metadata: { trigger: 'time' },
		...overrides,
	};
}

/** Build a string that exceeds MAX_CHUNK_TOKENS * 4 chars to trigger chunking */
function makeLongText(paragraphs = 30): string {
	return Array(paragraphs)
		.fill('A substantial paragraph with enough content to push past the token limit when combined with other paragraphs of similar length.')
		.join('\n\n');
}

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

describe('QueueIndexer', () => {
	let sqlite: Database.Database;
	let db: ReturnType<typeof drizzle>;
	let indexer: QueueIndexer;

	beforeEach(() => {
		sqlite = new Database(':memory:');
		sqlite.pragma('journal_mode = WAL');
		sqlite.pragma('foreign_keys = ON');
		sqlite.exec(TABLE_SQL);
		sqlite.exec(INDEX_SQL);
		db = drizzle(sqlite, { schema });
		indexer = new QueueIndexer(db, sqlite);
	});

	afterEach(() => {
		sqlite.close();
	});

	// ── upsert ────────────────────────────────────────────────────────────────

	describe('upsert', () => {
		it('inserts a new document as pending with correct collection', async () => {
			const result = await indexer.upsert(makeDoc());
			expect(result.status).toBe('queued');
			expect(result.chunkCount).toBe(1);

			const rows = sqlite.prepare('SELECT * FROM embedding_queue').all() as any[];
			expect(rows).toHaveLength(1);
			expect(rows[0].source).toBe('haiku');
			expect(rows[0].entity_id).toBe('h-1');
			expect(rows[0].collection).toBe('beau_experience'); // haiku -> beau_experience
			expect(rows[0].status).toBe('pending');
			expect(rows[0].chunk_index).toBe(0);
			expect(rows[0].content_hash).toBe(contentHash('autumn wind blows through'));
		});

		it('derives collection from source — journal goes to beau_private', async () => {
			await indexer.upsert(makeDoc({ source: 'journal', entityId: 'j-1' }));
			const row = sqlite.prepare('SELECT collection FROM embedding_queue').get() as any;
			expect(row.collection).toBe('beau_private');
		});

		it('derives collection from source — canon goes to beau_identity', async () => {
			await indexer.upsert(makeDoc({ source: 'canon', entityId: 'c-1' }));
			const row = sqlite.prepare('SELECT collection FROM embedding_queue').get() as any;
			expect(row.collection).toBe('beau_identity');
		});

		it('skips unchanged content on re-upsert', async () => {
			await indexer.upsert(makeDoc());
			const result = await indexer.upsert(makeDoc());
			expect(result.status).toBe('skipped_unchanged');

			const rows = sqlite.prepare('SELECT * FROM embedding_queue').all() as any[];
			expect(rows).toHaveLength(1);
		});

		it('requeues when content hash changes', async () => {
			await indexer.upsert(makeDoc());
			const result = await indexer.upsert(makeDoc({ text: 'updated text here' }));
			expect(result.status).toBe('requeued');

			const rows = sqlite.prepare('SELECT * FROM embedding_queue').all() as any[];
			expect(rows).toHaveLength(1);
			expect(rows[0].text).toBe('updated text here');
			expect(rows[0].content_hash).toBe(contentHash('updated text here'));
			expect(rows[0].status).toBe('pending');
			expect(rows[0].retry_count).toBe(0);
		});

		it('chunks long documents and inserts multiple rows', async () => {
			const longText = makeLongText();
			const result = await indexer.upsert(makeDoc({ text: longText }));
			expect(result.status).toBe('queued');
			expect(result.chunkCount).toBeGreaterThan(1);

			const rows = sqlite.prepare('SELECT * FROM embedding_queue ORDER BY chunk_index').all() as any[];
			expect(rows).toHaveLength(result.chunkCount);
			for (let i = 0; i < rows.length; i++) {
				expect(rows[i].chunk_index).toBe(i);
				expect(rows[i].entity_id).toBe('h-1');
			}
		});

		it('deletes orphan chunks when re-upsert has fewer chunks', async () => {
			// First upsert: long text produces multiple chunks
			const longText = makeLongText();
			const first = await indexer.upsert(makeDoc({ text: longText }));
			expect(first.chunkCount).toBeGreaterThan(1);

			const rowsBefore = sqlite.prepare('SELECT * FROM embedding_queue').all() as any[];
			expect(rowsBefore).toHaveLength(first.chunkCount);

			// Second upsert: short text produces single chunk
			const second = await indexer.upsert(makeDoc({ text: 'short replacement' }));
			expect(second.chunkCount).toBe(1);

			const rowsAfter = sqlite.prepare('SELECT * FROM embedding_queue').all() as any[];
			expect(rowsAfter).toHaveLength(1);
			expect(rowsAfter[0].chunk_index).toBe(0);
			expect(rowsAfter[0].text).toBe('short replacement');
		});

		it('stores metadata as JSON', async () => {
			await indexer.upsert(makeDoc({ metadata: { mood: 'peaceful', haikuId: 42 } }));
			const row = sqlite.prepare('SELECT metadata FROM embedding_queue').get() as any;
			expect(JSON.parse(row.metadata)).toEqual({ mood: 'peaceful', haikuId: 42 });
		});

		it('returns skipped_unchanged when all chunks match on re-upsert', async () => {
			const longText = makeLongText();
			await indexer.upsert(makeDoc({ text: longText }));

			const same = await indexer.upsert(makeDoc({ text: longText }));
			expect(same.status).toBe('skipped_unchanged');
		});

		it('resets retry state on requeue', async () => {
			await indexer.upsert(makeDoc());

			// Simulate a failed row with retry state
			sqlite.prepare(`UPDATE embedding_queue SET retry_count = 3, last_error = 'timeout', status = 'pending'`).run();

			// Re-upsert with changed content
			await indexer.upsert(makeDoc({ text: 'changed content now' }));

			const row = sqlite.prepare('SELECT retry_count, last_error, status FROM embedding_queue').get() as any;
			expect(row.retry_count).toBe(0);
			expect(row.last_error).toBeNull();
			expect(row.status).toBe('pending');
		});
	});

	// ── remove ────────────────────────────────────────────────────────────────

	describe('remove', () => {
		it('deletes all chunks for an entity', async () => {
			const longText = makeLongText();
			await indexer.upsert(makeDoc({ text: longText }));
			const before = sqlite.prepare('SELECT COUNT(*) as c FROM embedding_queue').get() as any;
			expect(before.c).toBeGreaterThan(1);

			await indexer.remove({ source: 'haiku', entityId: 'h-1' });
			const after = sqlite.prepare('SELECT COUNT(*) as c FROM embedding_queue').get() as any;
			expect(after.c).toBe(0);
		});

		it('does not affect other entities', async () => {
			await indexer.upsert(makeDoc({ entityId: 'h-1' }));
			await indexer.upsert(makeDoc({ entityId: 'h-2', text: 'other haiku text' }));

			await indexer.remove({ source: 'haiku', entityId: 'h-1' });

			const rows = sqlite.prepare('SELECT * FROM embedding_queue').all() as any[];
			expect(rows).toHaveLength(1);
			expect(rows[0].entity_id).toBe('h-2');
		});

		it('is a no-op for non-existent entity', async () => {
			await indexer.remove({ source: 'haiku', entityId: 'nonexistent' });
			// No error thrown
		});
	});

	// ── claimBatch ────────────────────────────────────────────────────────────

	describe('claimBatch', () => {
		it('claims pending rows and marks them processing', async () => {
			await indexer.upsert(makeDoc({ entityId: 'h-1' }));
			await indexer.upsert(makeDoc({ entityId: 'h-2', text: 'second haiku' }));

			const claimed = indexer.claimBatch('worker-1', 10);
			expect(claimed).toHaveLength(2);
			expect(claimed[0].status).toBe('processing');
			expect(claimed[0].lockedBy).toBe('worker-1');
			expect(claimed[0].lockedAt).toBeTruthy();
		});

		it('respects the limit parameter', async () => {
			await indexer.upsert(makeDoc({ entityId: 'h-1' }));
			await indexer.upsert(makeDoc({ entityId: 'h-2', text: 'second' }));
			await indexer.upsert(makeDoc({ entityId: 'h-3', text: 'third' }));

			const claimed = indexer.claimBatch('worker-1', 2);
			expect(claimed).toHaveLength(2);
		});

		it('does not claim already-processing rows', async () => {
			await indexer.upsert(makeDoc({ entityId: 'h-1' }));
			indexer.claimBatch('worker-1', 10);

			const second = indexer.claimBatch('worker-2', 10);
			expect(second).toHaveLength(0);
		});

		it('does not claim rows with future nextAttemptAt', async () => {
			await indexer.upsert(makeDoc({ entityId: 'h-1' }));

			// Set next_attempt_at far in the future
			sqlite.prepare(`UPDATE embedding_queue SET next_attempt_at = datetime('now', '+1 hour')`).run();

			const claimed = indexer.claimBatch('worker-1', 10);
			expect(claimed).toHaveLength(0);
		});

		it('claims rows where nextAttemptAt is in the past', async () => {
			await indexer.upsert(makeDoc({ entityId: 'h-1' }));

			// Set next_attempt_at in the past
			sqlite.prepare(`UPDATE embedding_queue SET next_attempt_at = datetime('now', '-1 hour')`).run();

			const claimed = indexer.claimBatch('worker-1', 10);
			expect(claimed).toHaveLength(1);
		});

		it('returns empty array when no pending rows exist', () => {
			const claimed = indexer.claimBatch('worker-1', 10);
			expect(claimed).toHaveLength(0);
		});

		it('selects oldest pending rows first (FIFO by created_at)', async () => {
			// Insert 3 rows: h-old (earliest), h-mid, h-new (latest)
			sqlite.prepare(`INSERT INTO embedding_queue (source, entity_id, collection, content_hash, text, chunk_index, created_at, updated_at)
				VALUES ('haiku', 'h-old', 'beau_experience', 'hash1', 'oldest', 0, '2026-01-01 00:00:00', datetime('now'))`).run();
			sqlite.prepare(`INSERT INTO embedding_queue (source, entity_id, collection, content_hash, text, chunk_index, created_at, updated_at)
				VALUES ('haiku', 'h-mid', 'beau_experience', 'hash2', 'middle', 0, '2026-01-02 00:00:00', datetime('now'))`).run();
			sqlite.prepare(`INSERT INTO embedding_queue (source, entity_id, collection, content_hash, text, chunk_index, created_at, updated_at)
				VALUES ('haiku', 'h-new', 'beau_experience', 'hash3', 'newest', 0, '2026-01-03 00:00:00', datetime('now'))`).run();

			// Claim only 2 — the oldest two should be claimed, newest left pending
			const claimed = indexer.claimBatch('worker-1', 2);
			expect(claimed).toHaveLength(2);

			const claimedIds = claimed.map((r) => r.entityId).sort();
			expect(claimedIds).toEqual(['h-mid', 'h-old']);

			// h-new should still be pending
			const remaining = sqlite.prepare(`SELECT entity_id, status FROM embedding_queue WHERE status = 'pending'`).all() as any[];
			expect(remaining).toHaveLength(1);
			expect(remaining[0].entity_id).toBe('h-new');
		});
	});

	// ── markIndexed ───────────────────────────────────────────────────────────

	describe('markIndexed', () => {
		it('marks a row as indexed when hash matches', async () => {
			await indexer.upsert(makeDoc());
			const claimed = indexer.claimBatch('worker-1', 1);
			expect(claimed).toHaveLength(1);

			const success = indexer.markIndexed(claimed[0].id, 'worker-1', claimed[0].contentHash);
			expect(success).toBe(true);

			const row = sqlite.prepare('SELECT status, processed_at FROM embedding_queue WHERE id = ?').get(claimed[0].id) as any;
			expect(row.status).toBe('indexed');
			expect(row.processed_at).toBeTruthy();
		});

		it('resets to pending when hash changed during processing (CAS failure)', async () => {
			await indexer.upsert(makeDoc());
			const claimed = indexer.claimBatch('worker-1', 1);

			// Simulate content change during processing
			sqlite.prepare(`UPDATE embedding_queue SET content_hash = 'changed-hash' WHERE id = ?`).run(claimed[0].id);

			const success = indexer.markIndexed(claimed[0].id, 'worker-1', claimed[0].contentHash);
			expect(success).toBe(false);

			const row = sqlite.prepare('SELECT status, locked_by, locked_at FROM embedding_queue WHERE id = ?').get(claimed[0].id) as any;
			expect(row.status).toBe('pending');
			expect(row.locked_by).toBeNull();
			expect(row.locked_at).toBeNull();
		});

		it('fails when workerId does not match', async () => {
			await indexer.upsert(makeDoc());
			const claimed = indexer.claimBatch('worker-1', 1);

			const success = indexer.markIndexed(claimed[0].id, 'wrong-worker', claimed[0].contentHash);
			expect(success).toBe(false);
		});
	});

	// ── markFailed ────────────────────────────────────────────────────────────

	describe('markFailed', () => {
		it('increments retry count and sets exponential backoff', async () => {
			await indexer.upsert(makeDoc());
			const claimed = indexer.claimBatch('worker-1', 1);

			indexer.markFailed(claimed[0].id, 'connection timeout');

			const row = sqlite.prepare('SELECT retry_count, last_error, status, next_attempt_at, locked_by FROM embedding_queue WHERE id = ?').get(claimed[0].id) as any;
			expect(row.retry_count).toBe(1);
			expect(row.last_error).toBe('connection timeout');
			expect(row.status).toBe('pending'); // back to pending for retry
			expect(row.next_attempt_at).toBeTruthy();
			expect(row.locked_by).toBeNull();
		});

		it('marks as permanently failed after MAX_RETRY_COUNT', async () => {
			await indexer.upsert(makeDoc());

			// Set retry_count to MAX_RETRY_COUNT - 1 so next failure hits the limit
			sqlite.prepare(`UPDATE embedding_queue SET retry_count = ?`).run(MAX_RETRY_COUNT - 1);

			const row = sqlite.prepare('SELECT id FROM embedding_queue').get() as any;
			indexer.markFailed(row.id, 'final failure');

			const updated = sqlite.prepare('SELECT status, retry_count, last_error FROM embedding_queue WHERE id = ?').get(row.id) as any;
			expect(updated.status).toBe('failed');
			expect(updated.retry_count).toBe(MAX_RETRY_COUNT);
			expect(updated.last_error).toBe('final failure');
		});

		it('progressively increases backoff on successive failures', async () => {
			await indexer.upsert(makeDoc());
			const row = sqlite.prepare('SELECT id FROM embedding_queue').get() as any;

			indexer.markFailed(row.id, 'error 1');
			const after1 = sqlite.prepare('SELECT next_attempt_at FROM embedding_queue WHERE id = ?').get(row.id) as any;

			// Reset to processing so we can fail again
			sqlite.prepare(`UPDATE embedding_queue SET status = 'processing'`).run();
			indexer.markFailed(row.id, 'error 2');
			const after2 = sqlite.prepare('SELECT next_attempt_at FROM embedding_queue WHERE id = ?').get(row.id) as any;

			// Both should have a next_attempt_at set
			expect(after1.next_attempt_at).toBeTruthy();
			expect(after2.next_attempt_at).toBeTruthy();
		});

		it('is a no-op for non-existent row', () => {
			// Should not throw
			indexer.markFailed(99999, 'no such row');
		});
	});

	// ── recoverStuckJobs ──────────────────────────────────────────────────────

	describe('recoverStuckJobs', () => {
		it('resets stuck processing jobs back to pending', async () => {
			await indexer.upsert(makeDoc());
			indexer.claimBatch('worker-1', 1);

			// Backdate the locked_at to simulate a stuck job
			sqlite.prepare(`UPDATE embedding_queue SET locked_at = datetime('now', '-10 minutes')`).run();

			const recovered = indexer.recoverStuckJobs(5 * 60 * 1000); // 5 minute threshold
			expect(recovered).toBe(1);

			const row = sqlite.prepare('SELECT status, locked_by, locked_at FROM embedding_queue').get() as any;
			expect(row.status).toBe('pending');
			expect(row.locked_by).toBeNull();
			expect(row.locked_at).toBeNull();
		});

		it('does not touch recently-claimed processing jobs', async () => {
			await indexer.upsert(makeDoc());
			indexer.claimBatch('worker-1', 1);

			// Job was just claimed, locked_at is now()
			const recovered = indexer.recoverStuckJobs(5 * 60 * 1000);
			expect(recovered).toBe(0);

			const row = sqlite.prepare('SELECT status FROM embedding_queue').get() as any;
			expect(row.status).toBe('processing');
		});

		it('does not touch pending or indexed rows', async () => {
			await indexer.upsert(makeDoc({ entityId: 'h-1' }));
			await indexer.upsert(makeDoc({ entityId: 'h-2', text: 'indexed row' }));

			// Mark second as indexed
			sqlite.prepare(`UPDATE embedding_queue SET status = 'indexed' WHERE entity_id = 'h-2'`).run();

			const recovered = indexer.recoverStuckJobs(0); // threshold = 0 means recover everything stuck
			expect(recovered).toBe(0); // nothing is 'processing'
		});

		it('returns 0 when queue is empty', () => {
			const recovered = indexer.recoverStuckJobs(1000);
			expect(recovered).toBe(0);
		});
	});

	// ── getQueueStats ─────────────────────────────────────────────────────────

	describe('getQueueStats', () => {
		it('returns zeroes for empty queue', () => {
			const stats = indexer.getQueueStats();
			expect(stats).toEqual({ pending: 0, processing: 0, indexed: 0, failed: 0 });
		});

		it('counts rows grouped by status', async () => {
			await indexer.upsert(makeDoc({ entityId: 'h-1' }));
			await indexer.upsert(makeDoc({ entityId: 'h-2', text: 'second' }));
			await indexer.upsert(makeDoc({ entityId: 'h-3', text: 'third' }));
			await indexer.upsert(makeDoc({ entityId: 'h-4', text: 'fourth' }));

			// Claim one -> processing
			indexer.claimBatch('worker-1', 1);

			// Mark one as indexed directly
			sqlite.prepare(`UPDATE embedding_queue SET status = 'indexed' WHERE entity_id = 'h-2'`).run();

			// Mark one as failed
			sqlite.prepare(`UPDATE embedding_queue SET status = 'failed' WHERE entity_id = 'h-3'`).run();

			const stats = indexer.getQueueStats();
			expect(stats.pending).toBe(1);     // h-4
			expect(stats.processing).toBe(1);  // claimed h-1
			expect(stats.indexed).toBe(1);     // h-2
			expect(stats.failed).toBe(1);      // h-3
		});
	});

	// ── Full lifecycle ────────────────────────────────────────────────────────

	describe('full lifecycle', () => {
		it('upsert then claim then markIndexed flow', async () => {
			await indexer.upsert(makeDoc());

			const claimed = indexer.claimBatch('w1', 10);
			expect(claimed).toHaveLength(1);

			const ok = indexer.markIndexed(claimed[0].id, 'w1', claimed[0].contentHash);
			expect(ok).toBe(true);

			const stats = indexer.getQueueStats();
			expect(stats.indexed).toBe(1);
			expect(stats.pending).toBe(0);
		});

		it('upsert then claim then fail then retry then succeed flow', async () => {
			await indexer.upsert(makeDoc());

			// Claim and fail
			const claimed1 = indexer.claimBatch('w1', 10);
			indexer.markFailed(claimed1[0].id, 'timeout');

			let stats = indexer.getQueueStats();
			expect(stats.pending).toBe(1); // back to pending

			// Next attempt has backoff; force it to be in the past for retry
			sqlite.prepare(`UPDATE embedding_queue SET next_attempt_at = datetime('now', '-1 second')`).run();

			// Re-claim and succeed
			const claimed2 = indexer.claimBatch('w1', 10);
			expect(claimed2).toHaveLength(1);

			const ok = indexer.markIndexed(claimed2[0].id, 'w1', claimed2[0].contentHash);
			expect(ok).toBe(true);

			stats = indexer.getQueueStats();
			expect(stats.indexed).toBe(1);
		});

		it('content changes during processing triggers CAS reset', async () => {
			await indexer.upsert(makeDoc());

			const claimed = indexer.claimBatch('w1', 10);

			// Simulate re-upsert with new content while processing
			await indexer.upsert(makeDoc({ text: 'new content arrived' }));

			// Old worker tries to mark indexed with stale hash; should fail
			const ok = indexer.markIndexed(claimed[0].id, 'w1', claimed[0].contentHash);
			expect(ok).toBe(false);

			// Row should be pending with new content
			const row = sqlite.prepare('SELECT status, text FROM embedding_queue').get() as any;
			expect(row.status).toBe('pending');
			expect(row.text).toBe('new content arrived');
		});
	});
});
