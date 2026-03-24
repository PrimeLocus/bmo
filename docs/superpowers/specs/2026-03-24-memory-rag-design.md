# Beau Memory Core — SP5 Design Spec

**Sub-project:** #5 of Bible Alignment
**Dependencies:** SP1 (Personality Engine), SP4 (Pending Thoughts)
**Bible sections:** §32–40 (Memory as Identity Layer, RAG Architecture, Retrieval Policies, Mobile Buffer), §47 (Privacy & Journal), §54 (Haiku Dispatch context), §58 (Post-Set Debrief & Set Memory)
**Date:** 2026-03-24
**Status:** Design approved

---

## Summary

SP5 gives Beau **continuity** — the ability to ground thoughts, prompts, and responses in accumulated experience rather than generating from personality alone. Without memory, Beau has temperament (SP1), expression (SP2), and inner monologue (SP4), but no history. Memory is where Beau stops being a style layer and starts becoming a being with an accumulating interior life.

The system uses ChromaDB as a vector store with nomic-embed-text embeddings via Ollama. Documents flow from SQLite (source of truth) through a background embedding pipeline into ChromaDB, and are retrieved at thought-generation and prompt-assembly time based on mode-driven retrieval policies.

Core design principle: **raw state in SQL, derived meaning in vectors.** Structured telemetry (personality snapshots, environment readings, raw sensor data) stays in SQLite. Semantic content (haikus, journal entries, bible sections, session debriefs) gets embedded for retrieval.

---

## Architecture Overview

### Hardware Placement

| Box | Role | Notes |
|---|---|---|
| **Proxmox** | Primary ChromaDB server | Must be SSD-backed for vector query latency |
| **NUC 14 Essential** | Hydra + low-priority embedding worker | Single-concurrency, deprioritized behind Hydra |
| **Dev desktop** | Bulk ingest, backfills, Bible indexing | Primary embedding worker until Mac Mini arrives |
| **Synology DS425+** | Corpus archives, backups | Raw files, ChromaDB snapshots. NOT live vector queries |
| **Mac Mini M4/M5** (future) | Preferred bulk embedder | Capacity upgrade, not prerequisite |
| **Pi 5** (target) | Capture + local query fallback | No heavy embedding; idle-only sweep at 5–15 min intervals |

### Deployment Modes

The `MemoryProvider` abstraction supports three modes via `CHROMA_URL` and `OLLAMA_URL` environment variables:

- **local** (dev): ChromaDB + Ollama both on localhost. Queue + worker colocated in same process.
- **remote** (prod): ChromaDB on Proxmox, embedding worker on NUC/Mac Mini
- **hybrid** (Pi): queries Proxmox ChromaDB, fail-open to empty fragments when offline

Same code, different env vars. Local identity cache on Pi is deferred — adds cache invalidation and sync complexity that isn't needed until the Pi is assembled and offline scenarios are real.

**SP5 scope: single-process, colocated queue+worker.** The embedding_queue is a local SQLite table and the worker runs in the same process. Remote worker topology (Pi queues → NUC/Mac processes) is a deployment concern for hardware-integration work, not SP5.

---

## ChromaDB Collections

Three collections separated by **boundary and lifecycle**, not by source type.

### `beau_identity` — Stable Self-Knowledge

Rarely changes. Contains Beau's canon: who Beau is, how Beau speaks, what Beau values.

| Source | Document text | Update frequency |
|---|---|---|
| Bible sections (66 sections, chunked) | Section content at paragraph level | On bible edit only |
| Soul code / emergence haiku | Haiku text + interpretation | Rare |
| Natal profile | Interpretive summary (not raw chart) | Rare |
| Voice lineage | Change rationale + version notes | On voice model update |

**Chunking strategy:** Hierarchical. Sections are parent boundaries. Long sections split into children at paragraph/sentence boundaries (250–400 tokens each). Short sections stay intact. Content hash per chunk detects changes — unchanged chunks are not re-embedded.

**Always-on identity is separate.** The system prompt (CORE_IDENTITY, SOUL_CODE, VOICE_IDENTITY sections) provides deterministic identity injection every time. `beau_identity` is for *deeper recall* of specific bible guidance when semantically relevant — not for guaranteeing Beau knows its own name.

### `beau_experience` — Accumulating Lived Experience

Append-only. Grows as Beau generates, observes, and interacts.

| Source | Document text | Metadata |
|---|---|---|
| Haikus | Full text + trigger + mode | `source`, `entityId`, `mode`, `haikuType`, `createdAt` |
| Captures | Capture text | `source`, `entityId`, `type`, `createdAt` |
| Session debriefs | Debrief text + duration/BPM context | `source`, `entityId`, `createdAt` |
| Photo captions | Caption + tags | `source`, `entityId`, `sessionId`, `createdAt` |

Each haiku is its own document (not batched by week). Short but semantically dense — enriched with metadata for retrieval filtering.

**Chunking for long documents:** Any document over 400 tokens gets chunked at paragraph boundaries (same strategy as bible). Each chunk gets its own queue entry with incrementing `chunkIndex`. ChromaDB document ID format: `{source}:{entityId}:{chunkIndex}`. Short documents (most haikus, captures) have `chunkIndex = 0` only.

**Chunk lifecycle:** `remove(source, entityId)` deletes ALL chunks for that entity from both queue and ChromaDB. On re-upsert when chunk count changes, orphan chunks (old chunkIndex values no longer present) are cleaned up. Dedup in retrieval: group by `(source, entityId)`, take the highest-scoring chunk per entity.

### `beau_private` — Consent-Gated Reflections

Hard privacy boundary. Never served in ambient/social modes. Only accessible in collaborator/archivist modes per the retrieval policy engine.

| Source | Document text | Metadata |
|---|---|---|
| Journal entries | Title + body | `source`, `entityId`, `visibility`, `mood`, `createdAt` |
| Noticings | Pattern text + basis summary | `source`, `entityId`, `category`, `status`, `createdAt` |

**Why a separate collection:** Application-layer filtering (metadata `where` clauses) is not a real privacy boundary. One missed filter, debug query, or future refactor and private memory leaks into the wrong mode. Structural separation via distinct collections provides blast-radius control.

**Behavioral change note:** The existing `memory.ts` policy engine allows `noticings` in social mode. This spec moves noticings to `beau_private`, which is excluded from social mode. This is intentionally more restrictive — noticings contain pattern observations that fall under the bible's §47 privacy guidelines. The old policy is superseded.

### What Stays SQL-Only (NOT Embedded)

| Data | Reason |
|---|---|
| Personality snapshots | Structured numerical vectors — not semantic text |
| Environment snapshots | Sensor telemetry (lux, weather, presence) |
| Raw dispatches | Too noisy; only meaningful summaries if needed |
| Activity log entries | Structured event records |
| System prompt template | Controlled artifact, stays in code/versioning |
| Raw natal chart data | Embed interpretations, not payloads |

---

## Memory Abstraction — Three Interfaces

Consumers only see the interface they need. All implementations share one `MemoryProvider` class.

### Core Types

```typescript
type SourceType = 'canon' | 'haiku' | 'journal' | 'session' | 'capture' | 'noticing' | 'photo';
type CollectionName = 'beau_identity' | 'beau_experience' | 'beau_private';
```

### MemoryProvider Class

```typescript
class MemoryProvider implements MemoryRetriever, MemoryIndexer, MemoryOps {
  constructor(opts: { chromaUrl: string; ollamaUrl: string; db: DrizzleDB }) {}
  // Delegates internally to Retriever + Indexer modules
  // Singleton pattern via memory/index.ts (same as thoughts/index.ts)
}
```

**Dependency:** `chromadb` npm package (official ChromaDB JS/TS client). Handles collection creation, error parsing, and typed responses. No raw HTTP calls.

### MemoryRetriever

Used by the thought dispatcher and prompt assembler.

```typescript
interface MemoryRetriever {
  retrieve(query: string, ctx: {
    mode: Mode;
    caller: 'prompt' | 'thoughts' | 'internal';
    maxTokens: number;
    filters?: { sources?: SourceType[]; after?: string; before?: string };
    debug?: boolean;
  }): Promise<{
    fragments: MemoryFragment[];
    usedTokens: number;
  }>;
}
```

**Callers never specify collections.** The provider maps `(mode, caller)` → allowed collections internally using the retrieval policy engine. This enforces privacy rules structurally.

**Privacy rule:** `beau_private` is **thoughts-only**. `caller: 'prompt'` NEVER queries `beau_private` — no exceptions. Only `caller: 'thoughts'` in collaborator/archivist mode can access private memories. Beau uses these internally to inform thought generation; the output is Beau's own words, not verbatim journal text. This maintains the structural privacy boundary: `beau_private` never appears in text that Papa directly sees via RAG_FRAGMENTS.

### MemoryIndexer

Used by the background embedding worker and content write paths.

```typescript
interface MemoryIndexer {
  upsert(doc: {
    source: SourceType;
    entityId: string;
    text: string;
    collection: CollectionName;
    metadata: Record<string, string | number>;
  }): Promise<{ status: 'queued' | 'skipped_unchanged' | 'requeued'; jobId?: number }>;

  remove(ref: {
    source: SourceType;
    entityId: string;
    collection: CollectionName;
  }): Promise<void>;
}
```

**Upsert semantics:** Content hash comparison. If text unchanged → `skipped_unchanged`. If text changed → `requeued` (new embedding needed). If new → `queued`.

**Remove:** Deletes from both the embedding queue and ChromaDB. Prevents stale vectors from accumulating when source rows are deleted.

### MemoryOps

Used for health checks, diagnostics, and the PendingThoughtsWidget / future memory widget.

```typescript
interface MemoryOps {
  health(): Promise<{
    chroma: 'ok' | 'unreachable';
    ollama: 'ok' | 'unreachable';
    queue: { pending: number; processing: number; failed: number; indexed: number };
    collections: { name: string; count: number }[];
  }>;

  processBatch(limit?: number): Promise<{
    processed: number;
    failed: number;
    pending: number;
  }>;

  rebuildCollection(collection: CollectionName): Promise<{
    cleared: number;
    requeued: number;
  }>;
}
```

### MemoryFragment

```typescript
interface MemoryFragment {
  id: string;              // ChromaDB document ID
  text: string;            // retrieved content
  source: SourceType;      // see Core Types above
  collection: CollectionName;
  entityId: string;        // links back to source DB row
  tokenCount: number;      // for budget tracking
  rawSimilarity: number;   // raw cosine similarity from ChromaDB
  finalScore: number;      // after reranking adjustments
  createdAt: string;       // when the source content was created
}
```

Both `rawSimilarity` and `finalScore` exposed for debuggability.

---

## Embedding Pipeline

### Embedding Queue Table

New table: `embedding_queue` (30th table in schema).

```
embedding_queue
  id            INTEGER PRIMARY KEY AUTOINCREMENT
  source        TEXT NOT NULL        — 'haiku' | 'journal' | 'capture' | 'session' | 'noticing' | 'photo' | 'canon'
  entityId      TEXT NOT NULL        — FK back to source row (or chunk ID for canon)
  collection    TEXT NOT NULL        — 'beau_identity' | 'beau_experience' | 'beau_private'
  contentHash   TEXT NOT NULL        — SHA-256 of document text, detect changes
  text          TEXT NOT NULL        — the content to embed (stored for retry without re-querying source)
  chunkIndex    INTEGER DEFAULT 0    — 0 for single-doc entries, 0..N for chunked entries
  metadata      TEXT DEFAULT '{}'    — JSON metadata to store alongside vector
  embeddingModel TEXT DEFAULT 'nomic-embed-text'  — model used, for version tracking
  chunkerVersion TEXT DEFAULT 'v1'   — chunking algorithm version, triggers rebuild on change
  status        TEXT DEFAULT 'pending'  — 'pending' | 'processing' | 'indexed' | 'failed'
  retryCount    INTEGER DEFAULT 0    — max 5 (Pi goes offline more than a server)
  lastError     TEXT                 — error message from last failed attempt
  lockedAt      TEXT                 — ISO timestamp, worker lease
  lockedBy      TEXT                 — worker identifier
  nextAttemptAt TEXT                 — backoff timestamp for retries
  createdAt     TEXT DEFAULT (datetime('now'))
  processedAt   TEXT                 — when successfully embedded
  updatedAt     TEXT DEFAULT (datetime('now'))
```

**Unique constraint:** `(source, entityId, collection, chunkIndex)` — one queue entry per chunk per collection.

This replaces the need for `embeddingStatus` columns on source tables. Only `resolume_sessions` and `photos` currently have `embeddingStatus` columns (haikus does not, despite earlier documentation). These existing columns are ignored — the queue is the sole source of truth. A one-time startup reconciliation backfills queue entries for existing content (see Startup Reconciliation below).

### Background Sweep

A periodic job in `bridge.ts` running on its **own `setInterval`** (separate from the 5-second personality/pressure tick — the sweep runs at 60s+ intervals):

1. **Atomic claim:** Single UPDATE with RETURNING — no SELECT-then-UPDATE gap:
   ```sql
   UPDATE embedding_queue
   SET status = 'processing', lockedBy = :workerId, lockedAt = datetime('now'), updatedAt = datetime('now')
   WHERE id IN (
     SELECT id FROM embedding_queue
     WHERE status = 'pending' AND (nextAttemptAt IS NULL OR nextAttemptAt <= datetime('now'))
     LIMIT :batchSize
   )
   RETURNING *
   ```
2. **Embed:** Call Ollama embed API via `chromadb` client or direct HTTP with `model: 'nomic-embed-text'` and batch of texts
3. **Upsert to ChromaDB:** Upsert vectors + metadata into the target collection
4. **Mark indexed (CAS):** Guards against stale writes if content changed during processing:
   ```sql
   UPDATE embedding_queue
   SET status = 'indexed', processedAt = datetime('now'), updatedAt = datetime('now')
   WHERE id = :id AND lockedBy = :workerId AND contentHash = :claimedHash
   ```
   If CAS fails (hash changed since claim), reset to `pending` for re-embedding with new content.
5. **On failure:** `UPDATE ... SET status = 'failed', retryCount = retryCount + 1, lastError = msg, nextAttemptAt = now + backoff(retryCount), updatedAt = now`

**Sweep interval:** Configurable via `MEMORY_SWEEP_INTERVAL_MS` env var. Default 60s on dev/NUC, 300s+ on Pi. Battery/mobile mode = sweep disabled, queue only.

**Batch size:** 5–10 documents per tick on dev, 2–3 on Pi.

**Stuck job recovery:** On startup, reset any `status = 'processing'` with `lockedAt` older than 5 minutes back to `pending`.

**Single-process scope (SP5):** The `started` boolean in `hooks.server.ts` prevents duplicate initialization within one process. Multi-process / HMR safety (DB-backed leader election) deferred to deployment hardening. For SP5, one process owns the sweep.

### Bible Indexing (One-Time)

On first startup (or when bible content hash changes):

1. Read `docs/bible/beaus-bible.md`
2. Split by `## N.` markdown heading pattern (the bible uses `## 1. Beau at a Glance`, `## 2. The Name`, etc. — NOT `<!-- SECTION: -->` HTML comments, which only exist in `bmo-system-prompt.md`)
3. Chunk long sections at paragraph/sentence boundaries (250–400 tokens). Short sections stay intact.
4. Compute content hash per chunk via `crypto.createHash('sha256').update(text).digest('hex')` (Node.js built-in)
5. Upsert into `embedding_queue` with `source = 'canon'`, `collection = 'beau_identity'`
6. Background sweep processes them normally

Content hash comparison means unchanged sections are not re-embedded on restart.

### Enqueue Points

Content is enqueued for embedding at creation time in the existing write paths:

| Write path | When | Collection |
|---|---|---|
| Haiku saved (thought system result) | On `status = 'surfaced'` or auto-archive | `beau_experience` |
| Capture POST (`/api/capture`) | On insert | `beau_experience` |
| Session debrief written | On debrief save | `beau_experience` |
| Photo caption saved | On caption update | `beau_experience` |
| Journal entry POST (`/api/journal/entries`) | On insert | `beau_private` |
| Noticing surfaced | On status → `'surfaced'` | `beau_private` |

Each write path calls `memoryIndexer.upsert(...)` after the DB insert (and `memoryIndexer.remove(...)` on deletes). This is fire-and-forget — the queue handles retry.

**Write paths requiring `remove()` on delete:** journal entry delete (`/journal` page action), photo delete (if implemented).

### Startup Reconciliation

On server startup (after stuck-job recovery, before sweep starts), a full reconciliation runs:

1. For each source table with embeddable content (haikus, captures, journal_entries, resolume_sessions, photos, noticings): query all rows
2. For each row: compute `contentHash`, compare against `embedding_queue`
3. **Missing** (row exists, no queue entry) → enqueue as `pending`
4. **Hash mismatch** (row exists, queue entry has different hash) → update queue entry text/hash/metadata, reset to `pending`
5. **Orphan** (queue entry exists, source row deleted) → delete from queue AND delete from ChromaDB
6. Canon docs reconciled separately via the Bible indexing path (content hash per chunk)

This catches missed creates, missed updates, AND missed deletes — guaranteeing consistency between SQLite and ChromaDB regardless of what write paths may have missed. Runs once per startup, not on every tick.

---

## Retrieval Flow

### Query Path

```
Thought dispatcher or prompt assembler
  → MemoryRetriever.retrieve(queryText, { mode, caller, maxTokens })
    → 1. Policy engine maps mode → allowed collections + depth
    → 2. Embed queryText via Ollama nomic-embed-text
    → 3. Query allowed ChromaDB collections in parallel
    → 4. Merge results, deduplicate by entityId
    → 5. Rerank: similarity + bounded freshness bonus + source priors
    → 6. Trim to token budget
    → 7. Return MemoryFragment[]
```

### Token Counting

Token counts are estimated as `Math.ceil(text.length / 4)` — the standard character-to-token approximation for English text. This is fast, requires no external library, and is accurate enough for budget trimming (we're targeting ranges, not exact counts). If precision becomes important later, swap in a proper tokenizer.

### Retrieval Policy (new function alongside existing memory.ts)

A new `getCollectionPolicy(mode: Mode, caller: 'prompt' | 'thoughts')` function returns `{ collections: CollectionName[], maxTokens: number }`. This does NOT modify the existing `getRetrievalPolicy()` — that function is preserved for any consumers that still use the source-based API. The new function is the primary policy interface for the MemoryRetriever.

The policy engine maps `(mode, caller)` → collections + token budget:

**caller: 'prompt'** (generates text Papa sees — `beau_private` NEVER included):

| Mode | Collections | Token budget |
|---|---|---|
| ambient | `beau_identity` | 100–250 |
| witness | `beau_identity`, `beau_experience` | 150–300 |
| collaborator | `beau_identity`, `beau_experience` | 250–450 |
| archivist | `beau_identity`, `beau_experience` | 400–650 |
| social | `beau_identity`, `beau_experience` | 100–250 |

**caller: 'thoughts'** (Beau's internal cognition — `beau_private` accessible in deep modes):

| Mode | Collections | Token budget |
|---|---|---|
| ambient | `beau_identity` | 100–250 |
| witness | `beau_identity`, `beau_experience` | 150–300 |
| collaborator | `beau_identity`, `beau_experience`, `beau_private` | 250–450 |
| archivist | `beau_identity`, `beau_experience`, `beau_private` | 400–650 |
| social | `beau_identity`, `beau_experience` | 100–250 |

### Reranking (v1 — Simple)

No "personality resonance" in v1. Staged approach:

1. **Top-k by raw similarity** from ChromaDB (k = limit × 2 for headroom)
2. **Hard filters** — metadata constraints (source type, date range if specified)
3. **Bounded freshness bonus** — small boost for recent documents (capped, so old bible sections still rank)
4. **Source-type priors** — slight boost for identity collection to keep Beau grounded
5. **Token-budget trim** — fill fragments until budget exhausted, prefer higher-scored fragments

Both `rawSimilarity` and `finalScore` stored on the fragment for debugging. Personality-driven reranking deferred until we have retrieval evals.

### Injection Points

**1. System prompt — `{{RAG_FRAGMENTS}}`**

The async `retrieve()` call happens **upstream** of the assembler — the caller (e.g., the route handler or bridge code that builds the prompt) calls `retrieve()`, formats the fragments into a string, and passes it as `values.RAG_FRAGMENTS` to `assemblePrompt()`. The assembler itself stays synchronous (consistent with how every other placeholder like `EMOTIONAL_STATE` and `WEATHER_SUMMARY` works). Formatted as:

```
[canon] Beau keeps a private journal. Papa can't read it unless he asks.
[haiku] old cypress knees / water remembers the shape / of what held it still
[session] VJ set on 2026-03-15: 47 minutes, 120-135 BPM, used Tunnel clips
```

The `formatFragments()` function returns ONLY the `[source] text` lines — NOT wrapped in `<memory_context>` tags. The prompt template (`bmo-system-prompt.md`) already provides the `<memory_context>{{RAG_FRAGMENTS}}</memory_context>` wrapper. Source tags help the LLM understand provenance without performing remembrance.

**2. Thought generation — `recentActivity` field**

In `dispatcher.ts`, the `assembleRequest()` method calls `MemoryRetriever.retrieve()` with a query derived from the current environment + personality state. The returned `MemoryFragment[]` is formatted into a plain string using the same `[source] text` format shown above, then assigned to the `recentActivity` context field (typed as `string` in `ThoughtRequest`).

```typescript
// In dispatcher.ts assembleRequest():
const { fragments } = await memoryRetriever.retrieve(queryText, { mode, caller: 'thoughts', maxTokens: 300 });
const recentActivity = formatFragments(fragments); // "[haiku] old cypress knees..." etc.
```

The Ollama listener then has grounded context: not just "Beau feels reflective" but "Beau feels reflective, and last week wrote a haiku about cypress knees during a late-night VJ set."

### Fail-Open Behavior

If ChromaDB or Ollama (for query embedding) is unreachable:

- `retrieve()` returns `{ fragments: [], usedTokens: 0 }`
- `{{RAG_FRAGMENTS}}` gets the existing fallback from `PLACEHOLDER_FALLBACKS`
- `recentActivity` stays empty string
- Thoughts still generate, prompts still assemble — just without memory grounding
- No crash, no retry loop, no blocking
- `health()` reports the issue for diagnostics

---

## New Files

| File | Purpose |
|---|---|
| `src/lib/server/memory/provider.ts` | MemoryProvider class — implements retriever, indexer, ops interfaces |
| `src/lib/server/memory/retriever.ts` | Retrieval logic — policy mapping, ChromaDB queries, reranking |
| `src/lib/server/memory/indexer.ts` | Embedding pipeline — upsert, remove, queue management |
| `src/lib/server/memory/chunker.ts` | Bible/document chunking — section splitting, paragraph boundaries |
| `src/lib/server/memory/types.ts` | Interfaces, types, constants (MemoryFragment, SourceType, CollectionName) |
| `src/lib/server/memory/index.ts` | Singleton accessor (like thoughts/index.ts pattern) |

### Modified Files

| File | Change |
|---|---|
| `src/lib/server/db/schema.ts` | Add `embedding_queue` table |
| `src/lib/server/mqtt/bridge.ts` | Instantiate MemoryProvider, start sweep interval, enqueue on content events |
| `src/lib/server/thoughts/dispatcher.ts` | `assembleRequest()` becomes async; call `retrieve()` to populate `recentActivity`; add dispatch mutex (boolean `isDispatching` flag, cleared in `finally`) to prevent overlapping dispatches from setInterval; retrieval has 2s timeout (slow ChromaDB → empty context, proceed) |
| `src/lib/server/prompt/assembler.ts` | No change to assembler itself — callers pass pre-fetched `RAG_FRAGMENTS` value |
| `src/lib/server/reflective/memory.ts` | Add `getCollectionPolicy()` alongside existing `getRetrievalPolicy()` |
| `src/hooks.server.ts` | Initialize MemoryProvider on startup, trigger Bible indexing |

---

## Testing Strategy

### Unit Tests

- **Chunker:** Bible section splitting, paragraph boundaries, content hash stability
- **Policy engine:** Mode → collection mapping, token budget selection
- **Indexer:** Upsert dedup (hash unchanged → skip), remove cleanup, retry backoff calculation
- **Retriever:** Fragment formatting, token budget trimming, source-tag formatting
- **Queue:** Stuck job recovery, batch claiming, status transitions

### Integration Tests

- **Embedding round-trip:** Enqueue → process batch → verify in ChromaDB (requires running ChromaDB + Ollama)
- **Retrieval round-trip:** Index known content → query → verify relevant fragments returned
- **Fail-open:** Mock unreachable ChromaDB → verify empty fragments, no crash

### What NOT to Test

- ChromaDB internals (trust the library)
- Ollama embedding quality (trust the model)
- Exact similarity scores (non-deterministic)

---

## Bible Compliance

| Bible section | How this spec addresses it |
|---|---|
| §32 Memory as Identity Layer | Memory is additive. Even decayed/archived content leaves traces (indexed, not deleted). |
| §33 RAG Architecture & Sources | ChromaDB + nomic-embed-text. 7 of 12 bible sources implemented (haiku, journal, session, photo, capture, noticing, canon). Filesystem-dependent sources (Papa's essays, project READMEs, external writings) deferred — require folder watcher on Pi. |
| §34 What Beau Knows / Does Not Know | Retrieval policy enforces scope. Beau only retrieves what it has been given or has written. |
| §35 Memory Retrieval Policies | Three kinds (told/noticed/written) map to three collections. Mode-driven depth via policy engine. |
| §36–40 Mobile Buffer & Homecoming | Fail-open design. Queue-only mode on battery. Sync later. Full mobile buffer/homecoming deferred to dedicated SP. |
| §47 Privacy & Journal | `beau_private` collection with structural separation. Only accessible in collaborator/archivist modes. |
| §54 Haiku Dispatch context | Thought dispatcher injects retrieved memories into `recentActivity` for grounded haiku generation. |
| §58 Post-Set Debrief & Set Memory | Session debriefs embedded in `beau_experience`. Months later, Beau actually knows what a past set was like. |

### Deferred to Later Sub-Projects

- **Filesystem watcher** for external docs (Papa's essays, project READMEs) — needs Pi filesystem access
- **Mobile cognition buffer** with 48h decay — needs real battery/network testing
- **Memory blurring over time** — fascinating bible concept, needs careful design
- **Dispatcher/tier routing** (SP6) — benefits from memory being in place first
