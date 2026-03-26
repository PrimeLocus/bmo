// Memory retriever — queries ChromaDB collections and reranks results
// SP5 Task 6: retrieve + deduplicate + rerank + trim to token budget

import { createHash } from 'node:crypto';
import type { ChromaClient } from 'chromadb';
import type {
	CollectionName,
	MemoryFragment,
	MemoryRetriever,
	RetrieveContext,
	RetrieveResult,
	SourceType,
} from './types.js';
import { EMBEDDING_MODEL, RETRIEVAL_TIMEOUT_MS, estimateTokens } from './types.js';
import type { RetrievalProvenance } from '../training/types.js';
import { getCollectionPolicy } from '../reflective/memory.js';

const RESULTS_PER_COLLECTION = 10;
const IDENTITY_SOURCE_BONUS = 0.02;
const MAX_FRESHNESS_BONUS = 0.05;
/** Freshness decay window — docs within this age get full bonus, older docs decay */
const FRESHNESS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class MemoryRetrieverImpl implements MemoryRetriever {
	constructor(
		private chromaClient: ChromaClient,
		private ollamaUrl: string,
	) {}

	async retrieve(query: string, ctx: RetrieveContext): Promise<RetrieveResult> {
		const empty: RetrieveResult = { fragments: [], usedTokens: 0, provenance: [] };

		// 1. Get collection policy for this mode + caller
		const policy = getCollectionPolicy(ctx.mode, ctx.caller);
		const maxTokens = ctx.maxTokens ? Math.min(ctx.maxTokens, policy.maxTokens) : policy.maxTokens;

		// 2. Embed the query text via Ollama
		let embedding: number[];
		try {
			embedding = await this.embedQuery(query);
		} catch {
			// Fail-open: if Ollama is unreachable, return empty
			return empty;
		}

		// 3. Query each allowed collection in parallel (with timeout)
		const rawFragments = await this.queryCollections(policy.collections, embedding, ctx);

		// 4. Deduplicate by (source, entityId) — keep highest-scoring
		const deduped = this.deduplicate(rawFragments);

		// 5. Rerank
		const ranked = this.rerank(deduped);

		// 6. Trim to token budget
		const trimmed = this.trimToBudget(ranked, maxTokens);

		// 7. Build provenance from ALL ranked candidates
		const selectedIds = new Set(trimmed.map((f) => f.id));
		const provenance = this.buildProvenance(ranked, selectedIds);

		const usedTokens = trimmed.reduce((sum, f) => sum + f.tokenCount, 0);
		return { fragments: trimmed, usedTokens, provenance };
	}

	/** Embed query text via Ollama HTTP API */
	private async embedQuery(query: string): Promise<number[]> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), RETRIEVAL_TIMEOUT_MS);

		try {
			const res = await fetch(`${this.ollamaUrl}/api/embed`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: EMBEDDING_MODEL, input: query }),
				signal: controller.signal,
			});

			if (!res.ok) {
				throw new Error(`Ollama embed failed: ${res.status}`);
			}

			const data = (await res.json()) as { embeddings: number[][] };
			return data.embeddings[0];
		} finally {
			clearTimeout(timeout);
		}
	}

	/** Query all allowed collections in parallel, fail-open per collection */
	private async queryCollections(
		collections: CollectionName[],
		embedding: number[],
		ctx: RetrieveContext,
	): Promise<MemoryFragment[]> {
		const results = await Promise.allSettled(
			collections.map((name) => this.queryOneCollection(name, embedding, ctx)),
		);

		const fragments: MemoryFragment[] = [];
		for (const result of results) {
			if (result.status === 'fulfilled') {
				fragments.push(...result.value);
			}
			// Partial failure: rejected collections are silently skipped
		}
		return fragments;
	}

	/** Query a single ChromaDB collection */
	private async queryOneCollection(
		collectionName: CollectionName,
		embedding: number[],
		ctx: RetrieveContext,
	): Promise<MemoryFragment[]> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), RETRIEVAL_TIMEOUT_MS);

		try {
			const collection = await this.chromaClient.getCollection({ name: collectionName });

			const queryResult = await collection.query({
				queryEmbeddings: [embedding],
				nResults: RESULTS_PER_COLLECTION,
			});

			const fragments: MemoryFragment[] = [];

			// QueryResult has nested arrays: ids[queryIdx][resultIdx]
			const ids = queryResult.ids[0] ?? [];
			const documents = queryResult.documents[0] ?? [];
			const metadatas = queryResult.metadatas[0] ?? [];
			const distances = queryResult.distances[0] ?? [];

			for (let i = 0; i < ids.length; i++) {
				const text = documents[i];
				if (!text) continue;

				const meta = (metadatas[i] ?? {}) as Record<string, string | number>;
				const source = (meta.source as SourceType) ?? 'canon';
				const entityId = (meta.entityId as string) ?? ids[i];
				const createdAt = (meta.createdAt as string) ?? '';

				// Apply source filter if specified
				if (ctx.filters?.sources && !ctx.filters.sources.includes(source)) {
					continue;
				}

				// Apply time filters if specified
				if (ctx.filters?.after && createdAt && createdAt < ctx.filters.after) {
					continue;
				}
				if (ctx.filters?.before && createdAt && createdAt > ctx.filters.before) {
					continue;
				}

				const rawDistance = distances[i] ?? 1;
				const tokenCount = estimateTokens(text);

				fragments.push({
					id: ids[i],
					text,
					source,
					collection: collectionName,
					entityId,
					tokenCount,
					rawDistance,
					finalScore: 0, // computed in rerank step
					createdAt,
				});
			}

			return fragments;
		} finally {
			clearTimeout(timeout);
		}
	}

	/** Deduplicate by (source, entityId) — keep highest similarity (lowest distance) */
	private deduplicate(fragments: MemoryFragment[]): MemoryFragment[] {
		const best = new Map<string, MemoryFragment>();

		for (const frag of fragments) {
			const key = `${frag.source}::${frag.entityId}`;
			const existing = best.get(key);
			if (!existing || frag.rawDistance < existing.rawDistance) {
				best.set(key, frag);
			}
		}

		return Array.from(best.values());
	}

	/** Rerank fragments: base similarity + freshness bonus + identity prior */
	private rerank(fragments: MemoryFragment[]): MemoryFragment[] {
		const now = Date.now();

		for (const frag of fragments) {
			// Base: 1 - distance (ChromaDB L2 normalized cosine → lower distance = more similar)
			const baseSimilarity = 1 - frag.rawDistance;

			// Freshness bonus: recent docs get up to MAX_FRESHNESS_BONUS
			let freshnessBonus = 0;
			if (frag.createdAt) {
				const ageMs = now - new Date(frag.createdAt).getTime();
				if (ageMs >= 0 && ageMs < FRESHNESS_WINDOW_MS) {
					const recency = 1 - ageMs / FRESHNESS_WINDOW_MS;
					freshnessBonus = Math.min(MAX_FRESHNESS_BONUS, recency * MAX_FRESHNESS_BONUS);
				}
			}

			// Identity source prior
			const identityBonus = frag.collection === 'beau_identity' ? IDENTITY_SOURCE_BONUS : 0;

			frag.finalScore = baseSimilarity + freshnessBonus + identityBonus;
		}

		// Sort descending by finalScore
		fragments.sort((a, b) => b.finalScore - a.finalScore);
		return fragments;
	}

	/** Trim to token budget — greedily add top-scored fragments until budget exhausted */
	private trimToBudget(fragments: MemoryFragment[], maxTokens: number): MemoryFragment[] {
		const result: MemoryFragment[] = [];
		let used = 0;

		for (const frag of fragments) {
			if (used + frag.tokenCount > maxTokens) continue;
			result.push(frag);
			used += frag.tokenCount;
		}

		return result;
	}

	/** Build provenance metadata for all ranked candidates, marking selected vs trimmed */
	private buildProvenance(
		ranked: MemoryFragment[],
		selectedIds: Set<string>,
	): RetrievalProvenance[] {
		return ranked.map((frag, index) => ({
			fragmentId: frag.id,
			collection: frag.collection,
			sourceType: frag.source,
			sourceEntityId: frag.entityId,
			rank: index,
			baseScore: 1 - frag.rawDistance,
			finalScore: frag.finalScore,
			selected: selectedIds.has(frag.id),
			tokenCount: frag.tokenCount,
			excerptHash: createHash('sha256').update(frag.text).digest('hex'),
		}));
	}
}
