# Training Readiness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument BMO's brain dispatcher so every inference produces a replayable, training-grade trace — with async capture, RAG provenance, prompt versioning, eligibility classification, model lineage, and implicit feedback signals.

**Architecture:** An async trace outbox captures full prompt/response payloads after each brain dispatch attempt, flushes to SQLite on a background interval (1-2s), and classifies each trace for training eligibility using a pure function of consent scope and privacy class. A model lineage registry tracks all LLM variants. Implicit feedback from the thought lifecycle (surfaced/decayed/dismissed) writes to the feedback table.

**Tech Stack:** TypeScript, SQLite via better-sqlite3 + Drizzle ORM, existing brain dispatcher + memory retriever + thought queue

**Spec:** `docs/superpowers/specs/2026-03-26-training-readiness-design.md`

---

## File Map

### New Files (Create)

| File | Responsibility |
|------|---------------|
| `src/lib/server/training/schema.ts` | All 9 training-readiness Drizzle table definitions |
| `src/lib/server/training/eligibility.ts` | Pure function: consentScope + privacyClass + trainingEligibility classification |
| `src/lib/server/training/trace-outbox.ts` | In-memory append-only queue + background SQLite flush writer |
| `src/lib/server/training/trace-capture.ts` | Collects trace payload from dispatch data, enqueues to outbox |
| `src/lib/server/training/model-registry.ts` | CRUD for llm_model_variants table (mirrors voice.ts pattern) |
| `src/lib/server/training/feedback.ts` | Insert generation_feedback rows from lifecycle events |
| `src/lib/server/training/index.ts` | Singleton accessor + init function for trace outbox |
| `src/lib/server/training/types.ts` | TracePayload, PromptProvenance, RetrievalProvenance interfaces |
| `src/lib/server/training/eligibility.test.ts` | Tests for eligibility classifier |
| `src/lib/server/training/trace-outbox.test.ts` | Tests for outbox enqueue/flush behavior |
| `src/lib/server/training/trace-capture.test.ts` | Tests for trace payload assembly |
| `src/lib/server/training/model-registry.test.ts` | Tests for model lineage CRUD |
| `src/lib/server/training/feedback.test.ts` | Tests for feedback insertion |
| `src/lib/server/brain/prepare-provenance.test.ts` | Tests for prompt hash + version capture |
| `src/lib/server/memory/retriever-provenance.test.ts` | Tests for RAG fragment metadata pass-through |
| `src/lib/server/training/dispatch-tracing.test.ts` | Tests for trace capture wiring in dispatcher |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/server/db/schema.ts` | Re-export training tables from `training/schema.ts` |
| `src/lib/server/brain/types.ts` | Add `PromptProvenance` to `RoutePlan` or `BrainResponse` |
| `src/lib/server/brain/prepare.ts` | Return `PrepareResult` (prompt string + provenance metadata) instead of bare string |
| `src/lib/server/brain/index.ts` | After execute: assemble trace payload, enqueue to outbox |
| `src/lib/server/brain/executor.ts` | Preserve rejected response text on quality escalation |
| `src/lib/server/memory/retriever.ts` | Return `RetrievalProvenance[]` alongside fragments |
| `src/lib/server/memory/types.ts` | Add `RetrievalProvenance` interface |
| `src/lib/server/thoughts/queue.ts` | On surface/decay: call feedback.ts insertion |
| `src/lib/server/db/seed.ts` | Seed 4 initial LLM model variants (one per tier) |
| `src/hooks.server.ts` | Init trace outbox on startup |

---

## Task 1: Training Readiness Schema

**Files:**
- Create: `beau-terminal/src/lib/server/training/schema.ts`
- Modify: `beau-terminal/src/lib/server/db/schema.ts`

All 9 tables in a single file, added in one migration. Tables are empty until later tasks populate them.

- [ ] **Step 1: Create the training schema file**

Create `src/lib/server/training/schema.ts` with all 9 table definitions using the project's Drizzle pattern (see spec for full column listing):

1. `generationTraces` — one row per attempt with full prompt/response/provenance
2. `traceRetrievals` — RAG provenance per trace (fragment IDs, scores, rank)
3. `generationFeedback` — human/system outcome labels
4. `artifactGovernanceEvents` — consent policy log (Stage 1 populate)
5. `trainingExamples` — curated examples (Stage 1 populate)
6. `datasetExports` — named export snapshots (Stage 1 populate)
7. `evaluationRuns` — offline evaluation history (Stage 1 populate)
8. `evaluationScores` — per-metric scores within a run
9. `llmModelVariants` — LLM lineage registry

Follow the existing pattern from `schema.ts`: `sqliteTable()`, `integer('id').primaryKey({ autoIncrement: true })`, `text('created_at').notNull().default(sql\`(datetime('now'))\`)`.

**Indexes (required per spec):** Add these using the Drizzle index pattern (third arg to `sqliteTable`):
- `generation_traces`: unique index on `traceId`, index on `requestId`, `createdAt`, `trainingEligibility`
- `trace_retrievals`: index on `traceId` (many rows per trace — essential for joins)
- `generation_feedback`: index on `traceId`
- `artifact_governance_events`: composite index on `scope` + `policyVersion`

**Columns to not miss:** `inputJson` (full BrainRequestV1 payload as JSON — fundamental to replayability), `generationParams` (Ollama generation params — null in Stage 0, placeholder for when executor exposes them), `modelDigest` (Ollama model hash — null in Stage 0, requires `/api/show` call to populate later).

- [ ] **Step 2: Re-export from main schema**

Add to the bottom of `src/lib/server/db/schema.ts`:

```typescript
// Training readiness tables (SP7)
export {
  generationTraces,
  traceRetrievals,
  generationFeedback,
  artifactGovernanceEvents,
  trainingExamples,
  datasetExports,
  evaluationRuns,
  evaluationScores,
  llmModelVariants,
} from '../training/schema.js';
```

- [ ] **Step 3: Add manual bootstrap to db/index.ts**

**Important:** This project uses a dual migration strategy — Drizzle migrations from `drizzle/` folder AND manual `CREATE TABLE IF NOT EXISTS` blocks in `db/index.ts`. The Drizzle migration folder may not auto-generate for new tables added to the schema file. Add `CREATE TABLE IF NOT EXISTS` blocks for all 9 training tables to `db/index.ts`, following the existing pattern (e.g., `emergence_artifacts`, `natal_profiles`).

Also generate a Drizzle migration: `cd beau-terminal && npx drizzle-kit generate`. If generation fails or produces conflicts, the manual `CREATE TABLE IF NOT EXISTS` blocks ensure the tables exist regardless.

- [ ] **Step 4: Verify tables exist at runtime**

Run: `cd beau-terminal && npm run dev`

Expected: Server starts, 9 new tables created. Check with `sqlite3 data/beau.db ".tables"`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/training/schema.ts src/lib/server/db/schema.ts
git commit -m "feat(training): add 9 training-readiness tables to schema"
```

---

## Task 2: Training Types

**Files:**
- Create: `beau-terminal/src/lib/server/training/types.ts`

Shared interfaces for the training subsystem.

- [ ] **Step 1: Create types file**

Define these interfaces:

- `PromptProvenance` — templateHash, promptPolicyVersion, retrievalPolicyVersion, assemblerVersion, promptProfile, promptHash
- `RetrievalProvenance` — fragmentId, collection, sourceType, sourceEntityId, rank, baseScore, finalScore, selected, tokenCount, excerptHash
- `PrepareResult` — prompt (string), provenance (PromptProvenance), retrievals (RetrievalProvenance[])
- `TracePayload` — full payload for outbox enqueue (all fields from generation_traces + retrievals array)
- Type aliases: `ConsentScope`, `PrivacyClass`, `TrainingEligibility`

Import `TierId`, `PromptProfile` from `../brain/types.js`.

- [ ] **Step 2: Commit**

```bash
git add src/lib/server/training/types.ts
git commit -m "feat(training): add shared training types and interfaces"
```

---

## Task 3: Training Eligibility Classifier

**Files:**
- Create: `beau-terminal/src/lib/server/training/eligibility.ts`
- Create: `beau-terminal/src/lib/server/training/eligibility.test.ts`

Pure function — no DB, no side effects. Easy to TDD.

- [ ] **Step 1: Write failing tests**

Test all classification rules from the spec:
- `manual.prompt` → `consentScope: 'user_content'`, `privacyClass: 'trusted'`, `trainingEligibility: 'trainable_after_redaction'`
- `thought.generate` without private fragments → `'beau_output'`, `'public'`, `'eval_only'`
- `thought.generate` with `beau_private` fragment → `'mixed'`, `'private'`, `'never'`
- Edge cases: empty collections, multiple collections, only identity collection

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/training/eligibility.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: Implement the classifier**

`classifyEligibility(input: { requestKind: string, retrievedCollections: string[] })` returns `{ consentScope, privacyClass, trainingEligibility, trainingEligibilityReason }`.

Classification algorithm (from spec):
1. Consent scope: manual.prompt → user_content; thought.generate with beau_private → mixed; else → beau_output
2. Privacy class: private fragments or mixed → private; user_content → trusted; else → public
3. Eligibility: private → never; user_content → trainable_after_redaction; beau_output → eval_only
4. Reason: human-readable chain

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/training/eligibility.test.ts`

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/training/eligibility.ts src/lib/server/training/eligibility.test.ts
git commit -m "feat(training): add training eligibility classifier with tests"
```

---

## Task 4: Retrieval Provenance

**Files:**
- Modify: `beau-terminal/src/lib/server/memory/retriever.ts`
- Modify: `beau-terminal/src/lib/server/memory/types.ts`
- Create: `beau-terminal/src/lib/server/memory/retriever-provenance.test.ts`

**Must come before Task 5 (Prompt Provenance)** — the retriever is the data producer, and `preparePrompt` is the consumer that passes retrieval provenance through.

The retriever already returns `MemoryFragment[]` with `id`, `source`, `collection`, `entityId`, `rawDistance`, `finalScore`, `tokenCount`. Extend `RetrieveResult` to include a structured `provenance` array.

- [ ] **Step 1: Write failing tests**

Test that `RetrieveResult` includes a `provenance` array with per-fragment metadata (including unselected fragments marked as `selected: false`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/memory/retriever-provenance.test.ts`

- [ ] **Step 3: Add `provenance` field to `RetrieveResult` in memory/types.ts**

Import `RetrievalProvenance` from `../training/types.js` and extend `RetrieveResult`:

```typescript
export interface RetrieveResult {
  fragments: MemoryFragment[];
  usedTokens: number;
  provenance: RetrievalProvenance[];
}
```

- [ ] **Step 4: Populate provenance in retriever.ts**

After reranking and before `trimToBudget`, build the full provenance array from all candidate fragments. After trim, mark `selected: true/false`. Compute `excerptHash` using SHA-256 of fragment text.

**Prerequisite check:** Verify that `entityId` is always set in ChromaDB metadata by the indexer. If not, add a fallback to the ChromaDB document ID.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/memory/retriever-provenance.test.ts`

- [ ] **Step 6: Run full memory test suite**

Run: `cd beau-terminal && npx vitest run src/lib/server/memory/`

Expected: All existing memory tests pass

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/memory/retriever.ts src/lib/server/memory/types.ts src/lib/server/memory/retriever-provenance.test.ts
git commit -m "feat(training): add retrieval provenance to RetrieveResult"
```

---

## Task 5: Prompt Provenance

**Files:**
- Modify: `beau-terminal/src/lib/server/brain/prepare.ts`
- Modify: `beau-terminal/src/lib/server/brain/executor.ts`
- Modify: `beau-terminal/src/lib/server/brain/index.ts`
- Create: `beau-terminal/src/lib/server/brain/prepare-provenance.test.ts`

Modify `preparePrompt` to return a `PrepareResult` (prompt string + provenance metadata) instead of just a string. **Depends on Task 4** — retrieval provenance must be available from the retriever.

**This task also updates all callers** (executor.ts and index.ts) so the codebase compiles and tests pass at the end of the task.

- [ ] **Step 1: Write failing tests for prompt provenance**

Test that `preparePrompt` returns an object with `prompt` (string), `provenance` (PromptProvenance), and `retrievals` (RetrievalProvenance[]) fields. Mock the file read and memory retrieval.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/brain/prepare-provenance.test.ts`

- [ ] **Step 3: Add ASSEMBLER_VERSION constant and computeHash utility to prepare.ts**

```typescript
import { createHash } from 'node:crypto';

export const ASSEMBLER_VERSION = '1.0.0';

function computeHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
```

- [ ] **Step 4: Modify preparePrompt return type**

Change the return type from `Promise<string>` to `Promise<PrepareResult>`. Internally:
- Compute template hash when loading the system prompt file
- Compute prompt hash after final assembly
- Collect retrieval provenance from the retriever's `RetrieveResult.provenance` (added in Task 4)
- Return `{ prompt, provenance, retrievals }`

- [ ] **Step 5: Update all callers to handle PrepareResult**

**In `executor.ts`:** The `preparePrompt` callback parameter (used for fallback re-preparation) must change from `() => Promise<string>` to `() => Promise<PrepareResult>`. The executor destructures `{ prompt }` from the result and passes only the prompt string to `executeOnTier`. The full `PrepareResult` must also be exposed so the caller can capture it for tracing.

**In `index.ts`:** The `reprepare` callback passed to `executeWithFallback` now returns `PrepareResult`. After prepare, destructure `{ prompt, provenance, retrievals }`. Pass `prompt` to executor, keep `provenance` + `retrievals` for trace capture in Task 8.

**Key insight:** Each fallback/escalation attempt may call `reprepare`, producing a **different** `PrepareResult`. The per-attempt provenance must be captured for each attempt's trace, not just the primary.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/brain/prepare-provenance.test.ts`

- [ ] **Step 7: Run full brain test suite to verify no regressions**

Run: `cd beau-terminal && npx vitest run src/lib/server/brain/`

Expected: All existing brain tests pass (will need updates to account for new return type)

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/brain/prepare.ts src/lib/server/brain/executor.ts src/lib/server/brain/index.ts src/lib/server/brain/prepare-provenance.test.ts
git commit -m "feat(training): add prompt provenance to preparePrompt, update all callers"
```

---

## Task 6: Trace Outbox

**Files:**
- Create: `beau-terminal/src/lib/server/training/trace-outbox.ts`
- Create: `beau-terminal/src/lib/server/training/trace-outbox.test.ts`

In-memory append-only queue with a background flush writer. Inference enqueues payloads; a setInterval flushes to SQLite. Fail-open: if flush fails, entries are kept for next attempt.

- [ ] **Step 1: Write failing tests**

Test these behaviors:
- `enqueue` adds payload to queue, increments `pending` count
- `flush` writes all pending to DB and clears queue
- `flush` is fail-open — keeps entries on DB error, does not throw
- `flush` writes `trace_retrievals` rows for each retrieval in payload
- `start` begins interval, `stop` clears it and does a final flush

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/training/trace-outbox.test.ts`

- [ ] **Step 3: Implement TraceOutbox class**

- Constructor takes `{ flushIntervalMs, db }` config
- `enqueue(payload: TracePayload)` pushes to in-memory array
- `flush()` iterates queue, inserts each trace + its retrievals into SQLite, removes successful entries. Wraps each insert in try/catch (fail-open per entry).
- `start()` sets up setInterval calling flush
- `stop()` clears interval and does a final flush
- Properties: `pending` (number), `running` (boolean)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/training/trace-outbox.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/training/trace-outbox.ts src/lib/server/training/trace-outbox.test.ts
git commit -m "feat(training): add async trace outbox with fail-open flush"
```

---

## Task 7: Trace Capture — Assemble Payload from Dispatch Data

**Files:**
- Create: `beau-terminal/src/lib/server/training/trace-capture.ts`
- Create: `beau-terminal/src/lib/server/training/trace-capture.test.ts`

Pure function that assembles a `TracePayload` from dispatch data (request, plan, response, prepare result, state snapshot).

- [ ] **Step 1: Write failing tests**

Test `assembleTracePayload`:
- Maps brain types fields to TracePayload correctly
- Calls `classifyEligibility` with correct inputs
- Handles null/missing optional fields
- Generates unique traceId (nanoid)
- Extracts modelFamily from model string

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/training/trace-capture.test.ts`

- [ ] **Step 3: Implement assembleTracePayload**

Takes a `TraceContext` object with: request (BrainRequestV1), plan (RoutePlan), prepareResult (PrepareResult), responseText, responseStatus, model, latencyMs, attemptNumber, parentTraceId, fallbackFrom, qualityEscalatedFrom, contextState, personalitySnapshotId.

Returns a `TracePayload` by:
1. Generating `traceId` via `nanoid(16)`
2. Extracting `modelFamily` from `plan.tierConfig.model.split(':')[0]`
3. Calling `classifyEligibility({ requestKind, retrievedCollections })` from the prepare result's retrievals
4. Mapping all fields to the flat TracePayload structure

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/training/trace-capture.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/training/trace-capture.ts src/lib/server/training/trace-capture.test.ts
git commit -m "feat(training): add trace payload assembler with eligibility classification"
```

---

## Task 8: Wire Trace Capture into Brain Dispatcher

**Files:**
- Modify: `beau-terminal/src/lib/server/brain/index.ts`
- Modify: `beau-terminal/src/lib/server/brain/executor.ts`
- Create: `beau-terminal/src/lib/server/training/index.ts`
- Create: `beau-terminal/src/lib/server/training/dispatch-tracing.test.ts`

Connect the dispatcher to the trace outbox.

- [ ] **Step 1: Write failing tests for dispatch tracing**

Test that `dispatch()` enqueues trace payloads to the outbox:
- Primary attempt produces one trace payload
- Fallback attempt produces two trace payloads (one for failed attempt, one for fallback)
- Quality escalation produces two payloads, with parent-child `parentTraceId` linkage and `responseStatus: "quality_rejected"` on the original
- Each attempt's trace has its own `PrepareResult` (fallback re-preparation produces different provenance)
- Traces are enqueued (array push), not written to DB synchronously

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/training/dispatch-tracing.test.ts`

- [ ] **Step 3: Create training singleton accessor**

`src/lib/server/training/index.ts`:
- `initTraining(db)` — creates TraceOutbox with 2s flush interval and starts it
- `getTraceOutbox()` — returns the singleton outbox (or null if not initialized)

- [ ] **Step 4: Modify executor to expose per-attempt data via callback**

Add `onAttempt?: (attemptData: AttemptData) => void` callback parameter to `executeWithFallback`. Define `AttemptData` interface:

```typescript
interface AttemptData {
  prepareResult: PrepareResult;  // prompt provenance for THIS specific attempt
  responseText: string | null;
  responseStatus: string;
  model: string;
  latencyMs: number;
  tier: TierId;
  attemptNumber: number;
  fallbackFrom: TierId | null;
  qualityEscalatedFrom: TierId | null;
}
```

Called after each tier attempt (primary, fallback, escalation). **Key:** each fallback re-preparation calls the `reprepare` callback which returns a **new** `PrepareResult` — the `onAttempt` callback must receive the `PrepareResult` for *that specific attempt*, not the primary one.

On quality escalation: mark the original attempt as `responseStatus: "quality_rejected"` before calling `onAttempt` for it.

- [ ] **Step 5: Modify dispatch() in index.ts to enqueue traces**

In the `dispatch()` function, provide an `onAttempt` callback that:
1. Calls `assembleTracePayload(ctx)` with the attempt data + request + plan + context state
2. Calls `getTraceOutbox()?.enqueue(payload)`

The callback closure captures `request`, `plan`, and `contextState` from the dispatch scope. Each call gets a fresh `prepareResult` from the attempt data.

**Never synchronous DB insert** — just an in-memory array push.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/training/dispatch-tracing.test.ts`

- [ ] **Step 7: Run full brain test suite**

Run: `cd beau-terminal && npx vitest run src/lib/server/brain/`

Expected: All existing tests pass. Trace enqueue happens in the background.

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/brain/index.ts src/lib/server/brain/executor.ts src/lib/server/training/index.ts src/lib/server/training/dispatch-tracing.test.ts
git commit -m "feat(training): wire async trace capture into brain dispatcher"
```

---

## Task 9: Model Lineage Registry

**Files:**
- Create: `beau-terminal/src/lib/server/training/model-registry.ts`
- Create: `beau-terminal/src/lib/server/training/model-registry.test.ts`
- Modify: `beau-terminal/src/lib/server/db/seed.ts`

CRUD for `llm_model_variants`, mirroring the `voice.ts` pattern.

- [ ] **Step 1: Write failing tests**

Test `getActiveModelForTier('t2')`, `getAllModelVariants()`, `getModelVariantById(id)`. Use the project's test DB pattern.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/training/model-registry.test.ts`

- [ ] **Step 3: Implement model registry**

Three query functions using Drizzle:
- `getActiveModelForTier(tier)` — select where tier matches and status is 'active'
- `getAllModelVariants()` — select all
- `getModelVariantById(id)` — select by id

- [ ] **Step 4: Add seed data for 4 initial model variants**

In `seed.ts`, add a `seedLlmVariants()` function with the 4 current tier models:
- Qwen 2.5 1.5B (T1), Gemma 3 4B (T2), Llama 3.1 8B (T3), Qwen 3 30B (T4)
- All with `trainingMethod: 'base'`, `status: 'active'`, `runtime: 'ollama'`
- Use additive pattern: check existence by baseModel + tier before inserting

Call `seedLlmVariants()` from the main `seed()` function.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/training/model-registry.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/training/model-registry.ts src/lib/server/training/model-registry.test.ts src/lib/server/db/seed.ts
git commit -m "feat(training): add LLM model lineage registry with seed data"
```

---

## Task 10: Implicit Feedback Wiring

**Files:**
- Create: `beau-terminal/src/lib/server/training/feedback.ts`
- Create: `beau-terminal/src/lib/server/training/feedback.test.ts`
- Modify: `beau-terminal/src/lib/server/thoughts/queue.ts`

Insert `generation_feedback` rows when thoughts are surfaced, decayed, or dismissed.

- [ ] **Step 1: Write failing tests**

Test that `recordFeedback` inserts a row with correct `outcomeType`, `reviewer`, and `traceId`. Test that it's fail-open (doesn't throw on DB error).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/training/feedback.test.ts`

- [ ] **Step 3: Implement feedback insertion**

`recordFeedback(input: { traceId, reviewer, outcomeType, finalText?, notes? })` — inserts into `generationFeedback` table keyed by `traceId` (not requestId — one requestId can produce multiple traces from fallback/escalation). Wrapped in try/catch (fail-open, best-effort).

- [ ] **Step 4: Wire into thought queue lifecycle using traceId linkage**

**Linkage model:** The bridge already uses `brainRequest.requestId` as the thought queue ID (`thought.id`), so `thought.id === requestId`. But feedback should link to `traceId` (not `requestId`) because one requestId can produce multiple trace rows (fallback/escalation). The feedback is about the *final* surfaced/decayed result, which corresponds to the last successful trace for that requestId.

**Implementation:** After brain dispatch completes in `bridge.ts`, the outbox has enqueued trace(s) for this requestId. Store the final attempt's `traceId` on the thought (add a `traceId: string | null` field to `PendingThought`, populated after dispatch returns). Then feedback uses this traceId.

In `queue.ts`:
- `surface()` → call `recordFeedback({ traceId: thought.traceId, reviewer: 'system', outcomeType: 'surfaced' })`
- `runDecay()` when status → 'decayed' → call `recordFeedback({ traceId: thought.traceId, reviewer: 'system', outcomeType: 'decayed' })`
- When thought dropped (null result) → call `recordFeedback({ traceId: thought.traceId, reviewer: 'system', outcomeType: 'dropped' })`

**Note:** `'dropped'` is not in the spec's outcomeType list — add it to distinguish "model returned null/SILENCE" (dropped) from "user closed the toast" (dismissed).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/training/feedback.test.ts`

- [ ] **Step 6: Run full thought test suite to verify no regressions**

Run: `cd beau-terminal && npx vitest run src/lib/server/thoughts/`

Expected: All existing tests pass

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/training/feedback.ts src/lib/server/training/feedback.test.ts src/lib/server/thoughts/queue.ts
git commit -m "feat(training): add implicit feedback wiring for thought lifecycle"
```

---

## Task 11: Startup Integration

**Files:**
- Modify: `beau-terminal/src/hooks.server.ts`

Wire trace outbox initialization into the startup sequence.

- [ ] **Step 1: Add training init to hooks.server.ts**

After `connectMQTT()` and brain init, add:

```typescript
import { initTraining } from '$lib/server/training/index.js';

// In the startup block, after connectMQTT():
initTraining(db);
```

The trace outbox starts its flush interval. Model variants are seeded by the existing `seed()` call (which now includes the LLM variants from Task 9).

- [ ] **Step 2: Verify startup works**

Run: `cd beau-terminal && npm run dev`

Expected: Server starts cleanly, no errors. Check with:
```bash
sqlite3 data/beau.db "SELECT displayName, tier, status FROM llm_model_variants;"
```
Should show 4 rows (one per tier).

- [ ] **Step 3: Commit**

```bash
git add src/hooks.server.ts
git commit -m "feat(training): wire trace outbox init into startup"
```

---

## Task 12: Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `cd beau-terminal && npx vitest run`

Expected: All tests pass (existing + new training tests)

- [ ] **Step 2: Manual smoke test with Ollama**

1. Start dev server: `cd beau-terminal && npm run dev`
2. Open prompt console at `http://localhost:4242/prompt`
3. Send a manual dispatch (type a prompt, click DISPATCH)
4. Wait 3 seconds for outbox flush
5. Check traces: `sqlite3 data/beau.db "SELECT traceId, tier, responseStatus, consentScope, trainingEligibility FROM generation_traces;"`
6. Check retrievals: `sqlite3 data/beau.db "SELECT traceId, collection, sourceType, rank, finalScore FROM trace_retrievals;"`

Expected: One trace row with `consentScope: 'user_content'`, `trainingEligibility: 'trainable_after_redaction'`. Retrieval rows if memory provider was connected.

- [ ] **Step 3: Verify thought lifecycle feedback**

1. Wait for thought system to generate a thought (or trigger manually)
2. Surface or let it decay
3. Check: `sqlite3 data/beau.db "SELECT trace_id, reviewer, outcome_type FROM generation_feedback;"`

Expected: One feedback row with `reviewer: 'system'`, `outcomeType: 'surfaced'` or `'decayed'`.

- [ ] **Step 4: Run type check**

Run: `cd beau-terminal && npx tsc --noEmit`

Expected: No type errors

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(training): core provenance layer complete — trace capture, eligibility, model registry, feedback"
```

---

## Known Gaps (Required Follow-Up Before Stage 1)

This plan delivers the **core provenance layer** — not full Stage 0 completion. These items are required by the spec and must be addressed in a follow-up plan before any fine-tuning work:

- **Baseline evaluation suite (HARD GATE)** — Required before Stage 1. Needs: hand-authored golden prompts, privacy test cases, voice fidelity rubric, and first scored run against at least one tier. Depends on accumulated trace data. **Create a separate follow-up plan for this.**
- **`generationParams` capture** — The executor currently sends hardcoded generation params to Ollama. When the executor is extended to support configurable temperature/top_p/etc., those params should be captured in traces. Until then, `generationParams` is null.
- **`modelDigest` capture** — Requires querying Ollama `/api/show` or caching digest from `/api/tags` probing. Not urgent but needed for exact weight reproducibility.
- **`'dropped'` outcome type** — Add to the spec's `generation_feedback.outcomeType` enum to distinguish "model returned SILENCE" from "user dismissed toast."

---

## Decision Gates (Stage 0 Exit Criteria)

Before any fine-tuning work (Stage 1):

- [ ] Every dispatch produces a replayable trace (async, fail-open)
- [ ] Traces have system-default training eligibility computed and stored
- [ ] Model lineage registry has entries for all 4 current tier models
- [ ] Baseline evaluation suite exists with scored results for at least one tier (hard gate — requires follow-up plan)
