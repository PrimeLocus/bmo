# Beau Memory Core (SP5) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Beau continuity by grounding thoughts and prompts in accumulated experience via ChromaDB + nomic-embed-text RAG.

**Architecture:** Three ChromaDB collections (identity/experience/private) with structural privacy boundaries. Background embedding pipeline via SQLite queue + Ollama. Mode-driven retrieval policies inject fragments into thought generation and system prompts. Fail-open: unreachable ChromaDB returns empty fragments, never crashes.

**Tech Stack:** ChromaDB (chromadb npm), Ollama nomic-embed-text, better-sqlite3/Drizzle, SvelteKit

**Spec:** `docs/superpowers/specs/2026-03-24-memory-rag-design.md`

---

## File Map

### New Files (6)

| File | Responsibility |
|---|---|
| `src/lib/server/memory/types.ts` | All interfaces, types, constants (SourceType, CollectionName, MemoryFragment, MemoryRetriever, MemoryIndexer, MemoryOps) |
| `src/lib/server/memory/chunker.ts` | Bible section splitting by `## N.` headings, paragraph chunking (250-400 tokens), content hashing (SHA-256) |
| `src/lib/server/memory/indexer.ts` | Queue management (upsert/remove), batch processing (atomic claim + CAS), startup reconciliation, Ollama embed calls, ChromaDB upserts |
| `src/lib/server/memory/retriever.ts` | ChromaDB queries, reranking (similarity + freshness + source priors), token budget trimming, fragment formatting |
| `src/lib/server/memory/provider.ts` | MemoryProvider class composing retriever + indexer + ops. Health checks. Collection initialization. |
| `src/lib/server/memory/index.ts` | Singleton accessor: `registerMemoryProvider()` + `getMemoryProvider()` |

### Modified Files (5)

| File | Change |
|---|---|
| `src/lib/server/db/schema.ts` | Add `embeddingQueue` table definition |
| `src/lib/server/reflective/memory.ts` | Add `getCollectionPolicy(mode, caller)` alongside existing `getRetrievalPolicy()` |
| `src/lib/server/mqtt/bridge.ts` | Instantiate MemoryProvider, start sweep setInterval, enqueue on thought surfaced |
| `src/lib/server/thoughts/dispatcher.ts` | `assembleRequest()` async + dispatch mutex + retrieve for `recentActivity` |
| `src/hooks.server.ts` | Initialize MemoryProvider, trigger Bible indexing after seed |

### Test Files (6)

| File | Covers |
|---|---|
| `src/lib/server/memory/chunker.test.ts` | Section splitting, paragraph chunking, hash stability |
| `src/lib/server/memory/indexer.test.ts` | Upsert dedup, remove cleanup, backoff calculation, atomic claim, CAS |
| `src/lib/server/memory/retriever.test.ts` | Policy mapping, reranking, token trimming, fragment formatting, fail-open |
| `src/lib/server/memory/provider.test.ts` | Health checks, collection init, reconciliation |
| `src/lib/server/memory/policy.test.ts` | getCollectionPolicy mode x caller matrix |
| `src/lib/server/thoughts/dispatcher.test.ts` | (existing file updated for async assembleRequest) |

---

## Task 1: Install chromadb + Types

**Files:**
- Modify: `beau-terminal/package.json`
- Create: `src/lib/server/memory/types.ts`

- [ ] **Step 1: Install chromadb npm package**

```bash
cd beau-terminal && npm install chromadb
```

- [ ] **Step 2: Create types.ts with all interfaces and constants**

```typescript
// src/lib/server/memory/types.ts

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
  rawSimilarity: number;
  finalScore: number;
  createdAt: string;
}

export interface RetrieveContext {
  mode: string;
  caller: 'prompt' | 'thoughts' | 'internal';
  maxTokens: number;
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
  collection: CollectionName;
  metadata: Record<string, string | number>;
}

export type UpsertStatus = 'queued' | 'skipped_unchanged' | 'requeued';

export interface MemoryIndexer {
  upsert(doc: MemoryDocument): Promise<{ status: UpsertStatus; jobId?: number }>;
  remove(ref: { source: SourceType; entityId: string; collection: CollectionName }): Promise<void>;
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

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function formatFragments(fragments: MemoryFragment[]): string {
  return fragments.map(f => `[${f.source}] ${f.text}`).join('\n');
}

export const EMBEDDING_MODEL = 'nomic-embed-text';
export const CHUNKER_VERSION = 'v1';
export const MAX_CHUNK_TOKENS = 400;
export const MIN_CHUNK_TOKENS = 50;
export const SWEEP_DEFAULT_MS = 60_000;
export const RETRIEVAL_TIMEOUT_MS = 2_000;
export const MAX_RETRY_COUNT = 5;
export const STUCK_JOB_THRESHOLD_MS = 5 * 60 * 1000;
```

- [ ] **Step 3: Verify types compile**

Run: `cd beau-terminal && npm run check 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/memory/types.ts package.json package-lock.json
git commit -m "feat(memory): types, interfaces, constants -- SP5 task 1"
```

---

## Task 2: Schema -- embedding_queue Table

**Files:**
- Modify: `src/lib/server/db/schema.ts`

- [ ] **Step 1: Add embeddingQueue table to schema.ts**

Add after the `pendingThoughts` table definition (around line 368):

```typescript
export const embeddingQueue = sqliteTable('embedding_queue', {
  id:              integer('id').primaryKey({ autoIncrement: true }),
  source:          text('source').notNull(),
  entityId:        text('entity_id').notNull(),
  collection:      text('collection').notNull(),
  contentHash:     text('content_hash').notNull(),
  text:            text('text').notNull(),
  chunkIndex:      integer('chunk_index').notNull().default(0),
  metadata:        text('metadata').notNull().default('{}'),
  embeddingModel:  text('embedding_model').notNull().default('nomic-embed-text'),
  chunkerVersion:  text('chunker_version').notNull().default('v1'),
  status:          text('status').notNull().default('pending'),
  retryCount:      integer('retry_count').notNull().default(0),
  lastError:       text('last_error'),
  lockedAt:        text('locked_at'),
  lockedBy:        text('locked_by'),
  nextAttemptAt:   text('next_attempt_at'),
  createdAt:       text('created_at').notNull().default(sql`(datetime('now'))`),
  processedAt:     text('processed_at'),
  updatedAt:       text('updated_at').notNull().default(sql`(datetime('now'))`),
});
```

- [ ] **Step 2: Verify dev server starts and auto-migrates**

Run: `cd beau-terminal && timeout 10 npm run dev 2>&1 | grep -E 'seed|migration|error'`

- [ ] **Step 3: Verify table exists in SQLite**

```bash
cd beau-terminal && node -e "
const Database = require('better-sqlite3');
const db = new Database('data/beau.db');
const cols = db.pragma('table_info(embedding_queue)');
console.log(cols.map(c => c.name).join(', '));
"
```

Expected: all 19 columns listed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/db/schema.ts
git commit -m "feat(memory): embedding_queue table schema -- SP5 task 2"
```

---

## Task 3: Chunker

**Files:**
- Create: `src/lib/server/memory/chunker.ts`
- Create: `src/lib/server/memory/chunker.test.ts`

- [ ] **Step 1: Write chunker tests**

Key test cases:
- `contentHash` returns stable 64-char SHA-256 hex, different for different input
- `chunkText` returns single chunk for short text
- `chunkText` splits long text at paragraph boundaries, respects max token limit
- `chunkText` never produces empty chunks
- `chunkBible` splits by `## N.` headings, returns sectionId/title/chunkIndex/text/hash
- `chunkBible` chunks long sections into multiple pieces with incrementing chunkIndex
- `chunkBible` keeps short sections intact (chunkIndex 0 only)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/memory/chunker.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement chunker.ts**

Exports: `contentHash(text) -> string`, `chunkText(text) -> string[]`, `chunkBible(markdown) -> BibleChunk[]`

`chunkBible` splits on `/^## (\d+)\.\s+(.+)$/gm`, extracts body between headings, applies `chunkText` to long bodies. Each chunk gets a SHA-256 content hash.

`chunkText` splits on `\n\n+` paragraph boundaries, accumulates paragraphs until exceeding `MAX_CHUNK_TOKENS * 4` chars, then starts a new chunk.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/memory/chunker.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/memory/chunker.ts src/lib/server/memory/chunker.test.ts
git commit -m "feat(memory): bible/document chunker with SHA-256 hashing -- SP5 task 3"
```

---

## Task 4: Collection Policy Engine

**Files:**
- Modify: `src/lib/server/reflective/memory.ts`
- Create: `src/lib/server/memory/policy.test.ts`

- [ ] **Step 1: Write policy tests**

Key test cases (all 5 modes x 2 callers = 10 combinations):
- `ambient/prompt` -> identity only, 100-250 tokens
- `collaborator/thoughts` -> includes private
- `collaborator/prompt` -> NEVER includes private
- `archivist/prompt` -> NEVER includes private
- `archivist/thoughts` -> all three collections
- `social/*` -> excludes private for both callers
- Unknown mode -> falls back to identity only

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/memory/policy.test.ts`

- [ ] **Step 3: Add getCollectionPolicy to memory.ts**

New function `getCollectionPolicy(mode: string, caller: 'prompt' | 'thoughts' | 'internal')` returns `{ collections: CollectionName[], maxTokens: number }`. Uses a `COLLECTION_POLICIES` lookup table with the (mode, caller) matrix from the spec. Fallback: identity only, 175 tokens.

Does NOT modify existing `getRetrievalPolicy()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/memory/policy.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/reflective/memory.ts src/lib/server/memory/policy.test.ts
git commit -m "feat(memory): collection policy engine (mode x caller -> collections) -- SP5 task 4"
```

---

## Task 5: Indexer -- Queue Management

**Files:**
- Create: `src/lib/server/memory/indexer.ts`
- Create: `src/lib/server/memory/indexer.test.ts`

- [ ] **Step 1: Write indexer tests**

Use an in-memory SQLite DB for tests. Key test cases:
- `upsert` new content -> status 'queued', returns jobId
- `upsert` identical contentHash -> status 'skipped_unchanged'
- `upsert` changed contentHash -> status 'requeued', text/hash updated
- `remove` deletes all chunks for (source, entityId, collection)
- `recoverStuckJobs` resets old 'processing' rows to 'pending'
- `claimBatch` returns claimed rows with lockedBy set
- `markIndexed` with matching hash succeeds (CAS)
- `markIndexed` with mismatched hash resets to pending
- `markFailed` increments retryCount, sets exponential backoff
- `getQueueStats` returns correct counts by status

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/memory/indexer.test.ts`

- [ ] **Step 3: Implement indexer.ts**

Class `QueueIndexer` with constructor taking Drizzle DB instance. Methods:
- `upsert(doc)` -- content hash comparison, insert or update queue row
- `remove(ref)` -- delete all chunks for (source, entityId, collection)
- `claimBatch(workerId, limit)` -- atomic UPDATE ... RETURNING *
- `markIndexed(id, workerId, claimedHash)` -- CAS update
- `markFailed(id, error)` -- increment retryCount, set backoff
- `recoverStuckJobs(thresholdMs)` -- reset old processing rows
- `getQueueStats()` -- count by status

All SQL uses the `embeddingQueue` Drizzle schema for type safety.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/memory/indexer.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/memory/indexer.ts src/lib/server/memory/indexer.test.ts
git commit -m "feat(memory): indexer -- queue management, atomic claim, CAS -- SP5 task 5"
```

---

## Task 6: Retriever -- ChromaDB Queries + Reranking

**Files:**
- Create: `src/lib/server/memory/retriever.ts`
- Create: `src/lib/server/memory/retriever.test.ts`

- [ ] **Step 1: Write retriever tests**

Inject mock ChromaDB client via constructor. Key test cases:
- Policy mapping: mode+caller -> correct collections queried
- Privacy: `caller: 'prompt'` never queries `beau_private`
- Reranking: freshness bonus boosts recent docs, identity prior boosts canon
- Token budget: fragments trimmed, higher-scored preferred
- Dedup: multiple chunks same entity -> highest-scoring kept
- Format: `formatFragments()` produces `[source] text` lines
- Fail-open: ChromaDB throws -> returns `{ fragments: [], usedTokens: 0 }`
- Timeout: slow response -> returns empty after RETRIEVAL_TIMEOUT_MS

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/memory/retriever.test.ts`

- [ ] **Step 3: Implement retriever.ts**

Class `MemoryRetrieverImpl` with constructor taking ChromaDB client + Ollama URL. The `retrieve()` method:
1. Calls `getCollectionPolicy(mode, caller)`
2. Embeds query via Ollama `/api/embed`
3. Queries each allowed collection in parallel
4. Merges, deduplicates by (source, entityId)
5. Reranks: raw similarity + bounded freshness bonus (capped at 0.05) + identity prior (0.02 for beau_identity)
6. Trims to token budget
7. Returns MemoryFragment[]

All external calls wrapped in try/catch with timeout. On failure: `{ fragments: [], usedTokens: 0 }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/memory/retriever.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/memory/retriever.ts src/lib/server/memory/retriever.test.ts
git commit -m "feat(memory): retriever -- ChromaDB queries, reranking, fail-open -- SP5 task 6"
```

---

## Task 7: Provider + Singleton

**Files:**
- Create: `src/lib/server/memory/provider.ts`
- Create: `src/lib/server/memory/index.ts`
- Create: `src/lib/server/memory/provider.test.ts`

- [ ] **Step 1: Write provider tests**

Key test cases:
- `health()` reports ChromaDB reachable/unreachable
- `ensureCollections()` creates 3 collections
- `processBatch()` claims jobs, embeds via Ollama, upserts to ChromaDB, marks indexed
- `processBatch()` handles embed failure gracefully (marks failed, sets backoff)
- `rebuildCollection()` clears collection + requeues all entries

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/memory/provider.test.ts`

- [ ] **Step 3: Implement provider.ts**

`MemoryProvider` class composing `QueueIndexer` + `MemoryRetrieverImpl`. Constructor takes `{ chromaUrl, ollamaUrl, db }`. Creates ChromaDB client, Ollama embed helper, queue indexer.

Key methods:
- `retrieve()` -- delegates to retriever
- `upsert()` / `remove()` -- delegates to indexer
- `processBatch(limit)` -- claims batch from indexer, embeds via Ollama, upserts to ChromaDB, marks indexed/failed
- `health()` -- pings ChromaDB heartbeat + Ollama tags endpoint + queue stats
- `ensureCollections()` -- creates 3 collections if they don't exist
- `rebuildCollection(collection)` -- deletes ChromaDB collection, recreates it, resets all queue entries for that collection to pending
- `indexBible()` -- reads beaus-bible.md, chunks via chunker, upserts all chunks
- `reconcileAll()` -- for each source table, hash-compare + enqueue missing + requeue changed + delete orphans

- [ ] **Step 4: Implement singleton index.ts**

```typescript
import type { MemoryProvider } from './provider.js';

let _provider: MemoryProvider | null = null;

export function registerMemoryProvider(provider: MemoryProvider) {
  _provider = provider;
}

export function getMemoryProvider(): MemoryProvider | null {
  return _provider;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/memory/provider.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/memory/provider.ts src/lib/server/memory/index.ts src/lib/server/memory/provider.test.ts
git commit -m "feat(memory): MemoryProvider + singleton accessor -- SP5 task 7"
```

---

## Task 8: Bridge Integration -- Sweep + Bible Indexing

**Files:**
- Modify: `src/lib/server/mqtt/bridge.ts`
- Modify: `src/hooks.server.ts`

- [ ] **Step 1: Add MemoryProvider initialization to bridge.ts**

Inside `connectMQTT()`, after the thought system setup, instantiate MemoryProvider and register singleton. Call `ensureCollections()` (catch errors -- fail-open).

- [ ] **Step 2: Add sweep setInterval**

After existing setIntervals in bridge.ts, add a new one at `MEMORY_SWEEP_INTERVAL_MS` (env var, default 60s). Calls `memoryProvider.processBatch(5)`. Logs only when work was done.

- [ ] **Step 3: Add Bible indexing + reconciliation to hooks.server.ts**

After `connectMQTT()` in the startup block, call `getMemoryProvider()?.indexBible()` and `getMemoryProvider()?.reconcileAll()` with `.catch()` for fail-open.

- [ ] **Step 4: Test by starting dev server with ChromaDB running**

Run: `cd beau-terminal && npm run dev`
Check console for `[memory]` log lines confirming initialization, bible indexing, and sweep activity.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/mqtt/bridge.ts src/hooks.server.ts
git commit -m "feat(memory): bridge sweep + bible indexing + startup reconciliation -- SP5 task 8"
```

---

## Task 9: Write-Path Enqueue Points

**Files:**
- Modify: `src/routes/api/capture/+server.ts`
- Modify: `src/routes/api/journal/entries/+server.ts`
- Modify: `src/lib/server/mqtt/bridge.ts` (thought surfaced handler)

- [ ] **Step 1: Add enqueue to capture POST**

After db.insert in the capture API route, call `getMemoryProvider()?.upsert(...)` with source='capture', collection='beau_experience'. Fire-and-forget (`.catch(() => {})`).

- [ ] **Step 2: Add enqueue to journal entry POST**

Same pattern. Source='journal', collection='beau_private'.

- [ ] **Step 3: Add enqueue to thought surfaced handler in bridge.ts**

When a thought is surfaced, enqueue with source='haiku', collection='beau_experience'.

- [ ] **Step 4: Verify with manual test**

Start dev server, create a capture, check embedding_queue table has a new row.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/capture/+server.ts src/routes/api/journal/entries/+server.ts src/lib/server/mqtt/bridge.ts
git commit -m "feat(memory): enqueue at write paths -- captures, journal, thoughts -- SP5 task 9"
```

---

## Task 10: Thought Dispatcher Integration

**Files:**
- Modify: `src/lib/server/thoughts/dispatcher.ts`
- Modify: `src/lib/server/thoughts/dispatcher.test.ts`
- Modify: `src/lib/server/mqtt/bridge.ts`

- [ ] **Step 1: Update dispatcher tests for async**

Add `await` to all `assembleRequest()` calls. Add test: when memory provider returns fragments, `recentActivity` is populated with formatted text.

- [ ] **Step 2: Make assembleRequest async with retrieval**

Change signature to `async assembleRequest(...)`. Inside, call `getMemoryProvider()?.retrieve()` with 2s timeout via `Promise.race`. On success, format fragments into `recentActivity`. On failure/timeout, proceed with empty string.

- [ ] **Step 3: Add dispatch mutex in bridge.ts pressure tick**

Add `let isDispatching = false` guard. Wrap the async dispatch call. Clear in `finally` block. Prevents overlapping dispatches from the 5-second setInterval.

- [ ] **Step 4: Run all tests**

Run: `cd beau-terminal && npx vitest run`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/thoughts/dispatcher.ts src/lib/server/thoughts/dispatcher.test.ts src/lib/server/mqtt/bridge.ts
git commit -m "feat(memory): async dispatcher + retrieval for recentActivity + mutex -- SP5 task 10"
```

---

## Task 11: Integration Tests

**Files:**
- Create: `src/lib/server/memory/integration.test.ts`

- [ ] **Step 1: Write integration tests**

Guard with `describe.skipIf(!process.env.INTEGRATION)` so they only run when ChromaDB + Ollama are live. Key tests:
- Embedding round-trip: enqueue -> processBatch -> verify in ChromaDB
- Retrieval round-trip: index known content -> retrieve -> verify fragment returned
- Bible indexing: run indexBible -> verify beau_identity has documents
- Fail-open: unreachable CHROMA_URL -> empty fragments, no crash
- Reconciliation: insert source row directly -> reconcile -> verify queue entry

- [ ] **Step 2: Run integration tests**

Run: `cd beau-terminal && INTEGRATION=1 npx vitest run src/lib/server/memory/integration.test.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/memory/integration.test.ts
git commit -m "test(memory): integration tests -- embedding + retrieval round-trips -- SP5 task 11"
```

---

## Task 12: Run All Tests + Doc Sync

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/reference.md`

- [ ] **Step 1: Run full test suite**

Run: `cd beau-terminal && npx vitest run`
Expected: All pass

- [ ] **Step 2: Update CLAUDE.md**

- Add `src/lib/server/memory/` files to Key Files section
- Update schema table count (30 -> 31 with embedding_queue)
- Add memory/RAG system to Architecture notes
- Update seed.ts comment (add memory note)

- [ ] **Step 3: Update docs/reference.md**

- Add embedding_queue to schema table listing
- Update table count

- [ ] **Step 4: Update MEMORY.md**

Add SP5 completion entry with key details.

- [ ] **Step 5: Commit all docs**

```bash
git add CLAUDE.md docs/reference.md
git commit -m "docs: sync for SP5 memory system -- 31 tables, memory architecture"
```

---

## Execution Notes

- **ChromaDB must be running** for tasks 8+ (end-to-end): `chroma run --host 0.0.0.0 --port 8000 --path C:\Users\Chili\chroma-data`
- **Ollama must have nomic-embed-text**: already pulled
- **Tasks 1-7** can be developed and tested WITHOUT ChromaDB (unit tests with mocks)
- **Tasks 8-11** need live ChromaDB + Ollama for full integration
- The `chromadb` npm package handles collection creation and typed responses
- All file paths relative to `beau-terminal/src/`
- The `assembler.ts` is NOT modified -- callers pass pre-fetched `RAG_FRAGMENTS` value
