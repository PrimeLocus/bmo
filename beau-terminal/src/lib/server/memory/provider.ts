// MemoryProvider — composes QueueIndexer + MemoryRetrieverImpl + ChromaDB + Ollama
// Implements MemoryRetriever, MemoryIndexer, and MemoryOps interfaces.
// TODO-B: extract for Pi deployment

import * as fs from 'fs';
import { join } from 'path';
import { ChromaClient } from 'chromadb';
import type Database from 'better-sqlite3';
import { QueueIndexer } from './indexer.js';
import { MemoryRetrieverImpl } from './retriever.js';
import { chunkBible } from './chunker.js';
import { db, sqlite } from '../db/index.js';
import {
	COLLECTION_NAMES,
	EMBEDDING_MODEL,
	CHUNKER_VERSION,
	STUCK_JOB_THRESHOLD_MS,
	collectionForSource,
} from './types.js';
import type {
	MemoryRetriever,
	MemoryIndexer,
	MemoryOps,
	MemoryDocument,
	MemoryHealth,
	BatchStats,
	RetrieveContext,
	RetrieveResult,
	CollectionName,
	SourceType,
	UpsertStatus,
} from './types.js';

const WORKER_ID = `memory-${process.pid}`;

export class MemoryProvider implements MemoryRetriever, MemoryIndexer, MemoryOps {
	private indexer: QueueIndexer;
	private retriever: MemoryRetrieverImpl;
	private chroma: ChromaClient;
	private ollamaUrl: string;
	private sqlite: Database.Database;

	constructor(opts: { chromaUrl: string; ollamaUrl: string }) {
		this.chroma = new ChromaClient({ path: opts.chromaUrl });
		this.ollamaUrl = opts.ollamaUrl;
		this.sqlite = sqlite;
		this.indexer = new QueueIndexer(db, sqlite);
		this.retriever = new MemoryRetrieverImpl(this.chroma as any, this.ollamaUrl);
	}

	// --- MemoryRetriever ---

	async retrieve(query: string, ctx: RetrieveContext): Promise<RetrieveResult> {
		return this.retriever.retrieve(query, ctx);
	}

	// --- MemoryIndexer ---

	async upsert(doc: MemoryDocument): Promise<{ status: UpsertStatus; chunkCount: number }> {
		return this.indexer.upsert(doc);
	}

	async remove(ref: { source: SourceType; entityId: string }): Promise<void> {
		// Remove from queue
		await this.indexer.remove(ref);

		// Remove from ChromaDB — fail-open
		try {
			const collectionName = collectionForSource(ref.source);
			const collection = await this.chroma.getOrCreateCollection({ name: collectionName });
			// Delete all docs with IDs matching pattern {source}:{entityId}:*
			// ChromaDB delete supports a where filter, but we use ID prefix matching.
			// Since ChromaDB doesn't support wildcard ID deletion, we query for matching IDs first.
			const prefix = `${ref.source}:${ref.entityId}:`;
			const results = await collection.get({
				where: { source: ref.source as string },
			});
			const matchingIds = (results.ids ?? []).filter((id: string) => id.startsWith(prefix));
			if (matchingIds.length > 0) {
				await collection.delete({ ids: matchingIds });
			}
		} catch {
			// Fail-open: ChromaDB unreachable or error — queue removal already succeeded
		}
	}

	// --- MemoryOps ---

	async health(): Promise<MemoryHealth> {
		// ChromaDB heartbeat
		let chromaStatus: 'ok' | 'unreachable' = 'unreachable';
		try {
			await this.chroma.heartbeat();
			chromaStatus = 'ok';
		} catch {
			// unreachable
		}

		// Ollama tags endpoint
		let ollamaStatus: 'ok' | 'unreachable' = 'unreachable';
		try {
			const res = await fetch(`${this.ollamaUrl}/api/tags`);
			if (res.ok) ollamaStatus = 'ok';
		} catch {
			// unreachable
		}

		// Queue stats
		const queue = this.indexer.getQueueStats();

		// Collection counts
		const collections: { name: string; count: number }[] = [];
		for (const name of COLLECTION_NAMES) {
			try {
				const coll = await this.chroma.getOrCreateCollection({ name });
				const count = await coll.count();
				collections.push({ name, count });
			} catch {
				collections.push({ name, count: 0 });
			}
		}

		return {
			chroma: chromaStatus,
			ollama: ollamaStatus,
			queue,
			collections,
		};
	}

	async processBatch(limit = 5): Promise<BatchStats> {
		const claimed = this.indexer.claimBatch(WORKER_ID, limit);
		let processed = 0;
		let failed = 0;

		for (const row of claimed) {
			try {
				// 1. Embed text via Ollama
				const embedRes = await fetch(`${this.ollamaUrl}/api/embed`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ model: EMBEDDING_MODEL, input: row.text }),
				});

				if (!embedRes.ok) {
					throw new Error(`Ollama embed failed: ${embedRes.status}`);
				}

				const embedData = (await embedRes.json()) as { embeddings: number[][] };
				const embedding = embedData.embeddings[0];

				// 2. Upsert to ChromaDB
				const chromaDocId = `${row.source}:${row.entityId}:${row.chunkIndex}`;
				const collection = await this.chroma.getOrCreateCollection({ name: row.collection });

				const meta = JSON.parse(row.metadata);
				await collection.upsert({
					ids: [chromaDocId],
					embeddings: [embedding],
					documents: [row.text],
					metadatas: [{
						source: row.source,
						entityId: row.entityId,
						createdAt: meta.createdAt ?? '',
						embeddingModel: row.embeddingModel,
						chunkerVersion: row.chunkerVersion,
					}],
				});

				// 3. Mark indexed (CAS)
				this.indexer.markIndexed(row.id, WORKER_ID, row.contentHash);
				processed++;
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				this.indexer.markFailed(row.id, message);
				failed++;
			}
		}

		const stats = this.indexer.getQueueStats();
		return { processed, failed, pending: stats.pending };
	}

	async rebuildCollection(collection: CollectionName): Promise<{ cleared: number; requeued: number }> {
		// 1. Delete and recreate the ChromaDB collection
		let cleared = 0;
		try {
			const coll = await this.chroma.getOrCreateCollection({ name: collection });
			cleared = await coll.count();
			await this.chroma.deleteCollection({ name: collection });
			await this.chroma.getOrCreateCollection({ name: collection });
		} catch {
			// ChromaDB unreachable — still reset queue entries
		}

		// 2. Reset all queue rows for this collection to pending
		const result = this.sqlite.prepare(`
			UPDATE embedding_queue
			SET status = 'pending', retry_count = 0, last_error = NULL,
			    locked_at = NULL, locked_by = NULL, next_attempt_at = NULL,
			    processed_at = NULL, updated_at = datetime('now')
			WHERE collection = ?
		`).run(collection);

		return { cleared, requeued: result.changes };
	}

	async ensureCollections(): Promise<void> {
		for (const name of COLLECTION_NAMES) {
			await this.chroma.getOrCreateCollection({ name });
		}
		console.log('[memory] Ensured all 3 collections exist');
	}

	async indexBible(): Promise<void> {
		const biblePath = join(process.cwd(), '..', 'docs', 'bible', 'beaus-bible.md');

		let content: string;
		try {
			content = fs.readFileSync(biblePath, 'utf8') as string;
		} catch {
			console.warn(`[memory] Bible not found at ${biblePath} — skipping indexBible`);
			return;
		}

		const chunks = chunkBible(content);
		const now = new Date().toISOString();

		for (const chunk of chunks) {
			await this.upsert({
				source: 'canon',
				entityId: `bible-${chunk.sectionId}-${chunk.chunkIndex}`,
				text: chunk.text,
				metadata: {
					sectionId: chunk.sectionId,
					title: chunk.title,
					createdAt: now,
				},
			});
		}

		console.log(`[memory] Indexed bible: ${chunks.length} chunks queued`);
	}

	async reconcileAll(): Promise<void> {
		const recovered = this.indexer.recoverStuckJobs(STUCK_JOB_THRESHOLD_MS);
		if (recovered > 0) {
			console.log(`[memory] Recovered ${recovered} stuck jobs`);
		}
	}

	recoverStuckJobs(): number {
		return this.indexer.recoverStuckJobs(STUCK_JOB_THRESHOLD_MS);
	}
}
