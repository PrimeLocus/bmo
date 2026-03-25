// Queue Indexer — manages the embedding_queue SQLite table
// Pure queue management: does NOT call ChromaDB or Ollama.

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type Database from 'better-sqlite3';
import { eq, and, sql } from 'drizzle-orm';
import { embeddingQueue } from '../db/schema.js';
import { chunkText, contentHash } from './chunker.js';
import {
	collectionForSource,
	MAX_CHUNK_TOKENS,
	MAX_RETRY_COUNT,
	EMBEDDING_MODEL,
	CHUNKER_VERSION,
} from './types.js';
import type { MemoryDocument, SourceType, UpsertStatus } from './types.js';

const MAX_CHARS = MAX_CHUNK_TOKENS * 4;

export interface QueueStats {
	pending: number;
	processing: number;
	indexed: number;
	failed: number;
}

export interface ClaimedRow {
	id: number;
	source: string;
	entityId: string;
	collection: string;
	contentHash: string;
	text: string;
	chunkIndex: number;
	metadata: string;
	embeddingModel: string;
	chunkerVersion: string;
	status: string;
	retryCount: number;
	lastError: string | null;
	lockedAt: string | null;
	lockedBy: string | null;
	nextAttemptAt: string | null;
	createdAt: string;
	processedAt: string | null;
	updatedAt: string;
}

export class QueueIndexer {
	private db: BetterSQLite3Database<any>;
	private sqlite: Database.Database;

	constructor(db: BetterSQLite3Database<any>, sqlite: Database.Database) {
		this.db = db;
		this.sqlite = sqlite;
	}

	/**
	 * Upsert a document into the embedding queue.
	 * Chunks long documents, deduplicates by content hash,
	 * and cleans up orphan chunks on re-upsert with fewer chunks.
	 */
	async upsert(doc: MemoryDocument): Promise<{ status: UpsertStatus; chunkCount: number }> {
		const collection = collectionForSource(doc.source);
		const chunks = doc.text.length > MAX_CHARS ? chunkText(doc.text) : [doc.text];
		const metadataJson = JSON.stringify(doc.metadata);

		let overallStatus: UpsertStatus = 'skipped_unchanged';

		for (let i = 0; i < chunks.length; i++) {
			const hash = contentHash(chunks[i]);

			// Check for existing row with same (source, entityId, collection, chunkIndex)
			const existing = this.db
				.select()
				.from(embeddingQueue)
				.where(
					and(
						eq(embeddingQueue.source, doc.source),
						eq(embeddingQueue.entityId, doc.entityId),
						eq(embeddingQueue.collection, collection),
						eq(embeddingQueue.chunkIndex, i),
					),
				)
				.get();

			if (!existing) {
				// New chunk — insert as 'pending'
				this.db.insert(embeddingQueue).values({
					source: doc.source,
					entityId: doc.entityId,
					collection,
					contentHash: hash,
					text: chunks[i],
					chunkIndex: i,
					metadata: metadataJson,
					embeddingModel: EMBEDDING_MODEL,
					chunkerVersion: CHUNKER_VERSION,
					status: 'pending',
				}).run();
				overallStatus = 'queued';
			} else if (existing.contentHash === hash) {
				// Hash unchanged — skip (overallStatus stays 'skipped_unchanged' unless another chunk changed)
			} else {
				// Hash changed — update text/hash/metadata, reset to pending
				this.db
					.update(embeddingQueue)
					.set({
						text: chunks[i],
						contentHash: hash,
						metadata: metadataJson,
						status: 'pending',
						retryCount: 0,
						lastError: null,
						lockedAt: null,
						lockedBy: null,
						nextAttemptAt: null,
						processedAt: null,
						updatedAt: sql`datetime('now')`,
					})
					.where(eq(embeddingQueue.id, existing.id))
					.run();
				if (overallStatus !== 'queued') {
					overallStatus = 'requeued';
				}
			}
		}

		// Delete orphan chunks: if new chunk count < old, delete higher-index rows
		this.db
			.delete(embeddingQueue)
			.where(
				and(
					eq(embeddingQueue.source, doc.source),
					eq(embeddingQueue.entityId, doc.entityId),
					eq(embeddingQueue.collection, collection),
					sql`${embeddingQueue.chunkIndex} >= ${chunks.length}`,
				),
			)
			.run();

		return { status: overallStatus, chunkCount: chunks.length };
	}

	/**
	 * Remove ALL chunks for an entity from the queue.
	 * The provider handles ChromaDB deletion separately.
	 */
	async remove(ref: { source: SourceType; entityId: string }): Promise<void> {
		const collection = collectionForSource(ref.source);
		this.db
			.delete(embeddingQueue)
			.where(
				and(
					eq(embeddingQueue.source, ref.source),
					eq(embeddingQueue.entityId, ref.entityId),
					eq(embeddingQueue.collection, collection),
				),
			)
			.run();
	}

	/**
	 * Atomically claim a batch of pending queue items for processing.
	 * Uses raw SQL with RETURNING for atomic claim.
	 */
	claimBatch(workerId: string, limit: number): ClaimedRow[] {
		const stmt = this.sqlite.prepare(`
			UPDATE embedding_queue
			SET status = 'processing', locked_by = ?, locked_at = datetime('now'), updated_at = datetime('now')
			WHERE id IN (
				SELECT id FROM embedding_queue
				WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= datetime('now'))
				ORDER BY created_at, id
				LIMIT ?
			)
			RETURNING
				id, source, entity_id AS entityId, collection, content_hash AS contentHash,
				text, chunk_index AS chunkIndex, metadata, embedding_model AS embeddingModel,
				chunker_version AS chunkerVersion, status, retry_count AS retryCount,
				last_error AS lastError, locked_at AS lockedAt, locked_by AS lockedBy,
				next_attempt_at AS nextAttemptAt, created_at AS createdAt,
				processed_at AS processedAt, updated_at AS updatedAt
		`);
		return stmt.all(workerId, limit) as ClaimedRow[];
	}

	/**
	 * CAS (compare-and-swap) mark a queue item as indexed.
	 * Only succeeds if the content hash hasn't changed during processing.
	 * If hash changed (content was re-upserted), resets to 'pending'.
	 */
	markIndexed(id: number, workerId: string, claimedHash: string): boolean {
		const result = this.sqlite.prepare(`
			UPDATE embedding_queue
			SET status = 'indexed', processed_at = datetime('now'), updated_at = datetime('now')
			WHERE id = ? AND locked_by = ? AND content_hash = ?
		`).run(id, workerId, claimedHash);

		if (result.changes === 0) {
			// Hash changed during processing — reset to pending
			this.sqlite.prepare(`
				UPDATE embedding_queue
				SET status = 'pending', locked_by = NULL, locked_at = NULL, updated_at = datetime('now')
				WHERE id = ? AND locked_by = ?
			`).run(id, workerId);
			return false;
		}
		return true;
	}

	/**
	 * Mark a queue item as failed with exponential backoff.
	 * After MAX_RETRY_COUNT failures, leaves as 'failed' permanently.
	 */
	markFailed(id: number, error: string): void {
		const row = this.db
			.select({ retryCount: embeddingQueue.retryCount })
			.from(embeddingQueue)
			.where(eq(embeddingQueue.id, id))
			.get();

		if (!row) return;

		const newRetryCount = row.retryCount + 1;

		if (newRetryCount >= MAX_RETRY_COUNT) {
			// Permanent failure
			this.db
				.update(embeddingQueue)
				.set({
					status: 'failed',
					retryCount: newRetryCount,
					lastError: error,
					lockedAt: null,
					lockedBy: null,
					updatedAt: sql`datetime('now')`,
				})
				.where(eq(embeddingQueue.id, id))
				.run();
		} else {
			// Exponential backoff: 2^retryCount seconds (2, 4, 8, 16...)
			const backoffSeconds = Math.pow(2, newRetryCount);
			this.db
				.update(embeddingQueue)
				.set({
					status: 'pending',
					retryCount: newRetryCount,
					lastError: error,
					lockedAt: null,
					lockedBy: null,
					nextAttemptAt: sql`datetime('now', '+${sql.raw(String(backoffSeconds))} seconds')`,
					updatedAt: sql`datetime('now')`,
				})
				.where(eq(embeddingQueue.id, id))
				.run();
		}
	}

	/**
	 * Recover stuck jobs that have been 'processing' longer than threshold.
	 * Resets them back to 'pending' so they can be re-claimed.
	 */
	recoverStuckJobs(thresholdMs: number): number {
		const thresholdSeconds = Math.floor(thresholdMs / 1000);
		const result = this.sqlite.prepare(`
			UPDATE embedding_queue
			SET status = 'pending', locked_by = NULL, locked_at = NULL, updated_at = datetime('now')
			WHERE status = 'processing'
			  AND locked_at IS NOT NULL
			  AND locked_at <= datetime('now', '-${thresholdSeconds} seconds')
		`).run();
		return result.changes;
	}

	/**
	 * Count rows grouped by status.
	 */
	getQueueStats(): QueueStats {
		const rows = this.sqlite.prepare(`
			SELECT status, COUNT(*) as count FROM embedding_queue GROUP BY status
		`).all() as { status: string; count: number }[];

		const stats: QueueStats = { pending: 0, processing: 0, indexed: 0, failed: 0 };
		for (const row of rows) {
			if (row.status in stats) {
				stats[row.status as keyof QueueStats] = row.count;
			}
		}
		return stats;
	}
}
