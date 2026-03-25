// Memory/RAG types, interfaces, and constants — SP5

export type SourceType = 'canon' | 'haiku' | 'journal' | 'session' | 'capture' | 'noticing' | 'photo';
export type CollectionName = 'beau_identity' | 'beau_experience' | 'beau_private';

export const COLLECTION_NAMES: CollectionName[] = ['beau_identity', 'beau_experience', 'beau_private'];

export const SOURCE_TO_COLLECTION: Record<SourceType, CollectionName> = {
	canon: 'beau_identity',
	haiku: 'beau_experience',
	capture: 'beau_experience',
	session: 'beau_experience',
	photo: 'beau_experience',
	journal: 'beau_private',
	noticing: 'beau_private',
};

export interface MemoryFragment {
	id: string;
	text: string;
	source: SourceType;
	collection: CollectionName;
	entityId: string;
	tokenCount: number;
	rawDistance: number;
	finalScore: number;
	createdAt: string;
}

export interface RetrieveContext {
	mode: string;
	caller: 'prompt' | 'thoughts' | 'internal';
	maxTokens?: number; // optional override — clamped to policy max if provided
	filters?: { sources?: SourceType[]; after?: string; before?: string };
	debug?: boolean;
}

export interface RetrieveResult {
	fragments: MemoryFragment[];
	usedTokens: number;
}

export interface MemoryRetriever {
	retrieve(query: string, ctx: RetrieveContext): Promise<RetrieveResult>;
}

export interface MemoryDocument {
	source: SourceType;
	entityId: string;
	text: string;
	metadata: Record<string, string | number>;
}

/** Derive collection from source type — callers cannot override */
export function collectionForSource(source: SourceType): CollectionName {
	return SOURCE_TO_COLLECTION[source];
}

export type UpsertStatus = 'queued' | 'skipped_unchanged' | 'requeued';

export interface MemoryIndexer {
	upsert(doc: MemoryDocument): Promise<{ status: UpsertStatus; chunkCount: number }>;
	remove(ref: { source: SourceType; entityId: string }): Promise<void>;
}

export interface MemoryHealth {
	chroma: 'ok' | 'unreachable';
	ollama: 'ok' | 'unreachable';
	queue: { pending: number; processing: number; failed: number; indexed: number };
	collections: { name: string; count: number }[];
}

export interface BatchStats {
	processed: number;
	failed: number;
	pending: number;
}

export interface MemoryOps {
	health(): Promise<MemoryHealth>;
	processBatch(limit?: number): Promise<BatchStats>;
	rebuildCollection(collection: CollectionName): Promise<{ cleared: number; requeued: number }>;
}

/** Estimate token count from text length (~4 chars per token) */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/** Format fragments as "[source] text" lines for prompt/thought injection */
export function formatFragments(fragments: MemoryFragment[]): string {
	return fragments.map((f) => `[${f.source}] ${f.text}`).join('\n');
}

// Constants
export const EMBEDDING_MODEL = 'nomic-embed-text';
export const CHUNKER_VERSION = 'v1';
export const MAX_CHUNK_TOKENS = 400;
export const MIN_CHUNK_TOKENS = 50;
export const SWEEP_DEFAULT_MS = 60_000;
export const RETRIEVAL_TIMEOUT_MS = 2_000;
export const MAX_RETRY_COUNT = 5;
export const STUCK_JOB_THRESHOLD_MS = 5 * 60 * 1000;
