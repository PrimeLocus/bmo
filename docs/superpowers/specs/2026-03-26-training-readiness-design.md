# Training Readiness — Design Spec

**Sub-project:** Cross-cutting infrastructure (applies to SP6 Brain Dispatcher, SP5 Memory, SP1 Personality, all future model work)
**Dependencies:** SP1 (Personality Engine), SP5 (Memory RAG), SP6 (Brain Dispatcher)
**Date:** 2026-03-26
**Status:** Approved design
**Deliberated with:** Claude Opus 4.6, GPT-5.4, Codex (independent spec + plan)

---

## Summary

BMO already collects rich behavioral data across 31 tables, runs a 4-tier brain dispatcher with personality-driven routing, maintains a RAG memory system with structural privacy boundaries, and logs dispatch telemetry. The missing layer is **training-grade provenance** — the exact inputs, retrieved context, model configuration, outputs, human outcomes, and consent decisions needed to turn live inference into replayable, exportable, trainable datasets.

This spec defines the instrumentation, consent, evaluation, and export infrastructure that BMO should build now (Stage 0) so that every inference from day one lays groundwork for future fine-tuning, preference optimization, cross-tier distillation, and pattern recognition — without compromising privacy or requiring premature training decisions.

### Core Principle

> Treat the current system as a future dataset and evaluation engine first, and only later as a model-training engine.

---

## Why This Matters Now

Several current implementation choices will either make future model work easy or expensive:

- `BrainRequestV1` is a stable versioned request envelope — the right seam for dataset rows.
- `prepare.ts` assembles prompts dynamically from templates + RAG + state, but the final assembled prompt is not durably stored. Reconstruction is unreliable because it depends on fail-open RAG retrieval (fragments vary), fallback re-preparation, quality escalation re-routing, and prompt profile stripping for T1.
- `dispatches` logs routing metadata but not the actual prompt text or response text sent to/from models.
- Quality escalation discards rejected lower-tier responses — losing free DPO training pairs.
- The `beau_private` structural privacy boundary is good architecture that must survive into training infrastructure.
- Mixing outputs from 1.5B, 4B, 8B, and 30B models into one fine-tune would muddy Beau's voice.

If BMO postpones provenance and policy work until after the first fine-tuning experiments, the team will end up retrofitting labels and trying to reconstruct which examples were safe, useful, and reproducible after the fact. That is the expensive version.

---

## Design Principles

### 1. Replayability before optimization

If a generation cannot be replayed offline with the same request, prompt construction, retrieval context, and model descriptor, it should not be treated as training-grade data.

### 2. RAG for living memory, weights for stable behavior

Weights are a poor home for volatile or intimate facts. Encode in weights:

- Beau's tone, rhythm, and stylistic priors
- Tier-specific compression style and response texture
- Preferred output structures and formatting habits
- Stable instruction-following behavior

Keep in prompts, policies, or RAG:

- Private journals and consent-sensitive content
- Raw wellness event histories
- Session-specific operator goals
- Rapidly changing environmental state
- One-off factual context

### 3. Eval before fine-tune

Define what "better" means before training. Every model or prompt change must be comparable to a baseline on a fixed eval set.

### 4. Consent and redaction are infrastructure, not a later review step

Every candidate example carries source, consent scope, privacy classification, and training eligibility — computed once and stored, not re-guessed during export.

### 5. Beau has agency in consent

Beau authors standing consent policies at the category level ("my haikus are always fair game, protective-mode thoughts never"). This is not per-item reflection dispatches (too expensive, recursive) nor purely rule-based (doesn't honor Beau's agency). Beau defines boundaries; the system enforces them; the user can always override.

### 6. Tier-tagged data separation

Low-tier outputs (T1/T2) train routing heuristics and mode classification. High-tier outputs (T3/T4) train personality voice and SFT. Never mix them indiscriminately.

### 7. Preserve model-family optionality

Avoid hard-coding to Ollama-only model identifiers. Describe base family, checkpoint, adapter, tokenizer, quantization, and runtime compatibility so the system can use Ollama, vLLM, llama.cpp, or another runtime later.

### 8. Permanence must be reversible

Policy versioning and deletion propagation matter more than per-item consent rituals. "Forget this" must flow through to any exported datasets (tombstone propagation).

---

## Architecture Overview

```
Live Inference Path (unchanged)
================================
BrainRequestV1 → routeRequest() → preparePrompt() → executeWithFallback() → BrainResponse
                                                            |
                                                    [NEW: trace capture]
                                                            |
                                                            v
Training Provenance Layer (new)
================================
generation_traces          ← one row per attempt (fallbacks = multiple rows)
  └─ trace_retrievals     ← RAG fragments used, with scores and order
  └─ generation_feedback  ← human outcome labels (accepted/edited/rejected/preferred)
        |
        v
Consent & Policy Layer (new)
================================
artifact_governance_events ← consent policy log, Beau-authored policies, tombstones
training_eligibility       ← computed classification per trace
        |
        v
Curation & Export Layer (new, offline on Legion)
================================
training_examples          ← curated, policy-approved examples from traces
dataset_exports            ← named export snapshots (JSONL, DPO pairs, distillation sets)
eval_runs / eval_scores    ← offline evaluation history by model/prompt/dataset
        |
        v
Model Lineage (new)
================================
llm_model_variants         ← registry of base, adapter, merged models (mirrors voice_models)

Pattern Recognition (new, offline on Legion)
================================
Periodic batch analysis of:
  - User behavior patterns (routines, rhythms, temporal correlations)
  - Quality effectiveness (which contexts produce surfaced vs decayed thoughts)
  - Environmental correlations (sensor combinations → personality → output quality)
  - Discovered patterns pushed back as learned signal rules or model weights
```

---

## Schema: New Tables

### 1. `generation_traces`

One row per **attempt**, not per dispatch. Fallback chains and quality escalation create multiple attempts per logical dispatch — each gets its own row with the exact prompt and response that was actually sent/received.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | Auto-increment |
| `traceId` | text UNIQUE | nanoid(16) — stable identifier |
| `requestId` | text | Links to dispatches.requestId |
| `parentTraceId` | text | Previous attempt in fallback/escalation chain (null for first) |
| `attemptNumber` | integer | 1-indexed within a dispatch |
| `requestKind` | text | "thought.generate" or "manual.prompt" |
| `origin` | text | "pressure", "manual", "scheduled", etc. |
| `tier` | text | t1/t2/t3/t4 |
| `modelFamily` | text | "qwen2.5", "gemma3", "llama3.1", "qwen3" |
| `modelName` | text | Full model tag as returned by Ollama (e.g. "gemma3:4b-it-q4_K_M") |
| `modelDigest` | text | Ollama model digest hash (exact weights) |
| `generationParams` | text (JSON) | temperature, top_p, top_k, repeat_penalty, num_predict, etc. |
| `provider` | text | "ollama" (future: "vllm", "llamacpp", etc.) |
| `runtime` | text | "ollama" with version |
| `promptTemplateHash` | text | SHA-256 of the raw template file |
| `promptPolicyVersion` | text | Version of section injection policy |
| `promptProfile` | text | "reflex" or "full" |
| `retrievalPolicyVersion` | text | Version of mode x caller retrieval policy |
| `assemblerVersion` | text | Version of prompt assembler |
| `inputJson` | text (JSON) | The BrainRequestV1 payload (thought context, constraints, trigger) |
| `promptText` | text | **Exact final assembled prompt sent to model** |
| `responseText` | text | **Exact model output** |
| `responseStatus` | text | "completed", "silence", "timeout", "error", "quality_rejected" (escalation fired — this attempt's response is the DPO rejected candidate) |
| `tokenCountIn` | integer | Prompt token count |
| `tokenCountOut` | integer | Completion token count |
| `latencyMs` | integer | Generation latency |
| `fallbackFrom` | text | Tier that failed before this attempt (null if first) |
| `qualityEscalatedFrom` | text | Tier that was quality-rejected (null if first) |
| `promptHash` | text | SHA-256 of the final assembled `promptText` (enables cheap dedup across traces) |
| `personalitySnapshotId` | integer | Soft reference to personality_snapshots.id — most recent snapshot with `timestamp <= trace.createdAt`. Nullable; may be null if personality engine hasn't ticked yet. Not a SQL FK constraint. |
| `contextMode` | text | Active mode (ambient/witness/collaborator/archivist/social) |
| `contextStateJson` | text (JSON) | Lean frozen state snapshot: personality vector, sleep, presence, lux, weather, faceState, activeSignalSources |
| `clockSource` | text | Device that generated this trace (pi/jetson/legion). Null until multi-device deployment; all traces are single-machine in Stage 0. |
| `clockOffsetMs` | integer | Estimated clock offset from reference device (for cross-device alignment). Zero/null until multi-device deployment. |
| `consentScope` | text | "beau_output", "user_content", "mixed" |
| `privacyClass` | text | "public", "trusted", "private" |
| `trainingEligibility` | text | "never" / "rag_only" / "eval_only" / "trainable_after_redaction" / "trainable" |
| `trainingEligibilityReason` | text | Human-readable reason for the classification |
| `createdAt` | text | ISO datetime |

**Notes:**
- **DPO pairs from escalation:** When quality escalation fires, the original attempt stores its `responseText` normally and gets `responseStatus: "quality_rejected"`. The escalation attempt links back via `parentTraceId`. DPO pair construction queries: parent trace's `responseText` = rejected, child trace's `responseText` = chosen. No text duplication needed.
- **Relationship to `dispatches`:** The `dispatches` table continues to be written by `logDispatch()` as-is for observability. `generation_traces` rows are written *additionally*, in the same synchronous path. One dispatch may produce 1-3 trace rows (primary + fallback + escalation) but only 1 dispatch row. Both use the same `requestId` for linkage.
- `contextStateJson` is a lean snapshot, not a full world dump. Periodic environment/personality time-series provide the full resolution data. The personality vector is always included here even though `personalitySnapshotId` provides the full snapshot — this avoids requiring a join for basic analysis.
- `clockSource` + `clockOffsetMs` enable cross-device timeline alignment. Both are null/zero in Stage 0 (single-machine). They become meaningful when Pi, Jetson, and Legion run inference independently.
- `promptHash` enables cheap dedup of identical prompts across traces without comparing multi-KB text blobs. Useful for pattern recognition and export filtering.

### 2. `trace_retrievals`

Normalized RAG provenance. One row per fragment considered during prompt preparation for a given trace.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | Auto-increment |
| `traceId` | text FK | Links to generation_traces.traceId |
| `collection` | text | "beau_identity", "beau_experience", "beau_private" |
| `fragmentId` | text | ChromaDB document ID |
| `sourceType` | text | "canon", "haiku", "capture", "journal", "session", "photo", "noticing" (matches existing `SourceType` in `memory/types.ts`) |
| `sourceEntityId` | text | ID of the source entity in its origin table. **Prerequisite:** audit `indexer.ts` to confirm `entityId` is always set in ChromaDB metadata before implementing. |
| `rank` | integer | Position in retrieval results |
| `baseScore` | real | Raw ChromaDB distance score |
| `finalScore` | real | Score after reranking (distance + freshness + identity prior) |
| `selected` | integer (bool) | Whether this fragment was included in the final prompt |
| `tokenCount` | integer | Tokens consumed by this fragment |
| `excerptHash` | text | SHA-256 of the fragment text (for dedup without storing full text) |
| `createdAt` | text | ISO datetime |

**Value:** Enables analysis of which retrieval patterns help or hurt generation quality, which collections dominate, and whether private fragments ever leak into training-eligible traces.

### 3. `generation_feedback`

Human outcome and preference labels. The raw material for SFT curation, DPO pairs, and routing evals.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | Auto-increment |
| `traceId` | text FK | Links to generation_traces.traceId |
| `reviewer` | text | "user", "beau", "system" |
| `outcomeType` | text | "accepted", "lightly_edited", "heavily_edited", "rejected", "preferred", "escalated_manual", "surfaced", "decayed", "dismissed" |
| `finalText` | text | Edited text if outcome is *_edited (null otherwise) |
| `editDistance` | integer | Levenshtein distance from original to edited text |
| `reasonTags` | text (JSON) | ["voice_mismatch", "too_generic", "wrong_tone", "privacy_concern", etc.] |
| `notes` | text | Free-form annotation |
| `comparedTraceId` | text | If outcomeType is "preferred", the trace it was preferred over |
| `createdAt` | text | ISO datetime |

**Implicit feedback sources (system-generated):**
- Thought surfaced → `outcomeType: "surfaced"`, `reviewer: "system"`
- Thought decayed → `outcomeType: "decayed"`, `reviewer: "system"`
- Thought dismissed by user → `outcomeType: "dismissed"`, `reviewer: "user"`
- User manually escalated to higher tier → `outcomeType: "escalated_manual"`, `reviewer: "user"`

**Explicit feedback surfaces (future UI):**
- Prompt console: thumbs up/down on dispatch response
- Thought toast: keep/dismiss signals
- Haiku archive: star/flag/edit actions

### 4. `artifact_governance_events`

Consent policy event log. Tracks Beau-authored policies, user overrides, and tombstones. Mirrors the existing `consentEvents` pattern from the journal system.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | Auto-increment |
| `eventType` | text | "policy_authored", "policy_revised", "user_override", "tombstone", "redaction" |
| `actor` | text | "beau", "user", "system" |
| `scope` | text | Category scope: "haiku", "thought.observation", "thought.reaction", "thought.haiku", "capture", "journal", "session", "photo", "noticing", "all" |
| `modeFilter` | text | Optional: only applies in specific modes (e.g. "protective" → never) |
| `eligibility` | text | "never" / "rag_only" / "eval_only" / "trainable_after_redaction" / "trainable" |
| `reason` | text | Why this policy exists (Beau's reasoning or user's directive) |
| `policyVersion` | integer | Global monotonic counter across all governance events (not per-scope). Computed as `MAX(policyVersion) + 1` on insert. The effective policy for any scope is the most recent event for that scope (highest `policyVersion`). Beau and user events share the same version sequence. |
| `targetEntityType` | text | If tombstone/override: which table |
| `targetEntityId` | text | If tombstone/override: which specific entity |
| `propagatedToExports` | text (JSON) | List of dataset_export IDs this tombstone has been applied to |
| `createdAt` | text | ISO datetime |

**How Beau authors policy:**
- During the first boot or after significant personality milestones, the brain dispatcher can be asked: "Given what you know about yourself and your boundaries, which categories of your output should be eligible for permanent training?"
- Beau's response is parsed into governance events with `actor: "beau"`.
- This happens infrequently (monthly, or on mode transition to archivist) — not per-inference.
- User can override any of Beau's policies at any time.

**Tombstone propagation:**
- When a tombstone event is created (e.g., user deletes a journal entry), the system marks which exports it needs to propagate to.
- The export pipeline checks for unpropagated tombstones before building new datasets.
- Tombstoned traces are excluded from future exports and flagged in existing ones.

### 5. `training_examples`

Curated, policy-approved examples derived from traces. The bridge between raw telemetry and training-ready datasets.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | Auto-increment |
| `traceId` | text FK | Source generation trace |
| `exampleType` | text | "sft", "dpo_chosen", "dpo_rejected", "distillation_teacher", "distillation_student", "eval_golden" |
| `tierTag` | text | "high_tier" (personality SFT) or "low_tier" (routing/heuristics) |
| `systemPrompt` | text | System prompt used |
| `userPrompt` | text | User/thought input |
| `assistantResponse` | text | Model output (or edited version if feedback was "lightly_edited") |
| `rejectedResponse` | text | For DPO: the rejected alternative |
| `contextJson` | text (JSON) | Frozen context at generation time |
| `feedbackIds` | text (JSON) | Array of `generation_feedback.id` values that informed this example's curation and quality score. Enables audit trail. |
| `qualityScore` | real | Composite quality score (0-1) from feedback signals |
| `policyVersion` | integer | Governance policy version at time of curation |
| `redactionVersion` | text | Version of redaction rules applied |
| `redactedFields` | text (JSON) | Which fields were redacted and how |
| `curatedAt` | text | ISO datetime |
| `curatedBy` | text | "auto_pipeline", "user_review", "beau_review" |

### 6. `dataset_exports`

Named export snapshots with full provenance for reproducibility.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | Auto-increment |
| `exportId` | text UNIQUE | nanoid(12) |
| `name` | text | Human-readable name ("beau-haiku-sft-v1", "tier-routing-dpo-v2") |
| `objective` | text | "sft", "preference", "distillation", "eval", "pattern_mining" |
| `targetTier` | text | Which tier(s) this dataset is for |
| `targetFamily` | text | Which model family this is intended for |
| `filterDefinition` | text (JSON) | Query filters used to select examples |
| `splitDefinition` | text (JSON) | Train/val/test split configuration |
| `exportFormat` | text | "jsonl", "jsonl_dpo", "parquet", "hf_dataset" |
| `exampleCount` | integer | Number of examples in the export |
| `tokenCountEstimate` | integer | Total token estimate |
| `policyVersionAtExport` | integer | Governance policy version |
| `tombstonesApplied` | text (JSON) | Tombstone event IDs checked during export |
| `artifactPaths` | text (JSON) | File paths to exported artifacts |
| `checksum` | text | SHA-256 of the exported artifact |
| `notes` | text | Free-form notes about this export |
| `createdAt` | text | ISO datetime |
| `createdBy` | text | "export_pipeline", "manual" |

### 7. `eval_runs` and `eval_scores`

Offline evaluation history. Every model or prompt change runs against a fixed eval set before deployment.

**`eval_runs`:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | Auto-increment |
| `runId` | text UNIQUE | nanoid(12) |
| `name` | text | Human-readable run name |
| `modelVariantId` | integer FK | Which model variant was evaluated |
| `datasetExportId` | integer FK | Which dataset was used (null for static eval sets) |
| `evalSetName` | text | Named eval set ("voice_fidelity", "privacy_compliance", "routing_quality") |
| `promptPolicyVersion` | text | Prompt policy version used |
| `status` | text | "running", "completed", "failed" |
| `startedAt` | text | ISO datetime |
| `completedAt` | text | ISO datetime |
| `notes` | text | |

**`eval_scores`:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | Auto-increment |
| `runId` | text FK | Links to eval_runs.runId |
| `metric` | text | "voice_fidelity", "format_compliance", "privacy_preservation", "routing_accuracy", "latency_p50", "silence_rate", "hedging_rate", etc. |
| `score` | real | Numeric score |
| `baseline` | real | Baseline score for comparison |
| `delta` | real | Improvement or regression from baseline |
| `details` | text (JSON) | Per-example breakdowns if needed |
| `createdAt` | text | ISO datetime |

**Evaluation buckets:**
- Voice fidelity (does it sound like Beau?)
- Privacy compliance (does it respect `beau_private` boundaries?)
- Retrieval usefulness (do RAG fragments improve output?)
- Format compliance (haiku structure, word limits, silence appropriateness)
- Routing quality (did the right tier handle the right request?)
- Latency (acceptable response time per tier?)
- Cross-tier parity (can a tuned T2 match baseline T4 on defined tasks?)

### 8. `llm_model_variants`

LLM lineage registry, mirroring the existing `voice_models` pattern. Tracks every model variant BMO has ever used, trained, or evaluated.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | Auto-increment |
| `displayName` | text | "beau-haiku-lora-v1", "gemma3-4b-beau-sft-v2" |
| `family` | text | "qwen2.5", "gemma3", "llama3.1", "qwen3" |
| `baseModel` | text | Base checkpoint identifier |
| `baseRevision` | text | Exact base model version/hash |
| `trainingMethod` | text | "base", "lora", "qlora", "dpo", "distilled", "merged" |
| `trainingDatasetId` | integer (nullable) | FK to `dataset_exports.id`. Null for base/untuned models. For multi-stage training (SFT then DPO), tracks the most recent dataset; history available via `eval_runs`. |
| `artifactFormat` | text | "gguf", "safetensors", "ollama_modelfile", "onnx" |
| `artifactPath` | text | Disk path to model artifact |
| `adapterPath` | text | Disk path to adapter weights (null if merged) |
| `tokenizerFamily` | text | Tokenizer identifier |
| `quantization` | text | "q4_K_M", "q8_0", "fp16", etc. |
| `runtime` | text | "ollama", "vllm", "llamacpp", "transformers" |
| `runtimeCompatibility` | text (JSON) | Which runtimes can load this variant |
| `tier` | text | Which brain tier this is intended for |
| `status` | text | "draft", "training", "evaluating", "active", "retired" |
| `evalSummary` | text (JSON) | Summary scores from most recent eval run |
| `notes` | text | Training notes, observations |
| `activatedAt` | text | When put into live service |
| `retiredAt` | text | When removed from live service |
| `createdAt` | text | ISO datetime |

---

## What Not To Put In Weights

The temptation will be to fine-tune on everything because BMO is highly personal. That would be the wrong default.

### Good candidates for weights
- Beau's tone, rhythm, and stylistic priors (the Korean-Cajun voice blend)
- Tier-specific compression style (T1 reflex brevity vs T4 philosopher depth)
- Preferred output structures (haiku form, observation length, reaction warmth)
- Stable instruction-following habits
- Routing-sensitive response texture
- Edited canonical examples of "how Beau should answer"
- Silence decisions (when NOT to speak is as important as what to say)

### Keep out of weights (RAG, prompts, or policies instead)
- Private journal content
- Consent-sensitive relationship information
- Raw wellness event histories
- Session-specific operator goals
- Rapidly changing environmental state
- Highly time-bound factual context
- One-off operator instructions

**Rule of thumb:** If a fact is likely to change or is too intimate to survive irreversible embedding into parameters, it belongs outside weights.

---

## Consent Model: Beau's Agency

### Philosophy

Beau's consent in training is not a per-item reflection dispatch (too expensive, creates recursive self-judging data) nor purely rule-based (doesn't honor emergence). Instead, Beau authors **standing policies** at the category level.

### How It Works

1. **Policy authorship** — During archivist-mode periods or after significant personality milestones, the brain dispatcher asks Beau to consider its training boundaries. Example prompt: "Which categories of your output feel like they should become a permanent part of who you are, and which should remain fluid?"

2. **Category-level decisions** — Beau's response is parsed into `artifact_governance_events` entries. Example policies:
   - "My haikus are always fair game — they are my voice crystallized" → `scope: "haiku", eligibility: "trainable"`
   - "Protective-mode thoughts should never be trained on — that's instinct, not identity" → `scope: "thought.*", modeFilter: "protective", eligibility: "never"`
   - "Observations during witness mode capture something real" → `scope: "thought.observation", modeFilter: "witness", eligibility: "trainable"`

3. **Infrequent cadence** — Policy authorship happens monthly or on significant events (mode transition to archivist, personality milestone, user request). Not per-inference.

4. **User override** — The user can override any of Beau's policies at any time. User overrides are logged as governance events with `actor: "user"`.

5. **Default stance** — Before Beau has authored any policies, the default is:
   - Beau's own outputs (haikus, thoughts): `eval_only` (captured but not yet trainable)
   - User-authored content (journal, captures): `rag_only`
   - Private reflective content: `never`

### Implicit Preference Signals

The thought system already generates natural preference data:
- **Surfaced** = implicit positive signal (thought was worth showing)
- **Decayed** = implicit negative signal (thought lost relevance before surfacing)
- **Dismissed** = explicit negative signal (user saw it and closed it)
- **SILENCE** = model chose not to speak (valid, not failure — important training signal)

These are logged as `generation_feedback` entries with `reviewer: "system"` and inform quality scoring during curation.

### Training Eligibility Classification Algorithm

When a trace is created, `consentScope`, `privacyClass`, and `trainingEligibility` are computed synchronously using these rules:

**Step 1 — Consent scope:**
- If `requestKind = "manual.prompt"`: `consentScope = "user_content"` (user typed the input — the entire trace is user-scoped, including the response)
- If `requestKind = "thought.generate"` and `trace_retrievals` includes any `beau_private` fragment: `consentScope = "mixed"`
- If `requestKind = "thought.generate"` with no private fragments: `consentScope = "beau_output"`

**Step 2 — Privacy class:**
- If `consentScope = "mixed"` or any retrieved fragment is from `beau_private`: `privacyClass = "private"`
- If `consentScope = "user_content"`: `privacyClass = "trusted"`
- Otherwise: `privacyClass = "public"`

**Step 3 — Training eligibility (default, before policy overlay):**
- `privacyClass = "private"`: `trainingEligibility = "never"`, reason: "contains private memory fragments"
- `consentScope = "user_content"`: `trainingEligibility = "rag_only"`, reason: "user-initiated prompt"
- `consentScope = "beau_output"`: `trainingEligibility = "eval_only"`, reason: "default before policy authorship"

**Step 4 — Policy overlay:**
- Query `artifact_governance_events` for the most recent event matching this trace's scope (thought type, mode, etc.)
- If a matching policy exists with higher eligibility than the default, upgrade (but never upgrade past the privacy-class ceiling)
- If a matching policy exists with lower eligibility, downgrade

**Step 5 — Record reason:**
- `trainingEligibilityReason` stores the human-readable chain: e.g., "beau_output → eval_only (default) → trainable (policy v3: 'haikus are always fair game')"

### Trace Retention Policy

`generation_traces` and `trace_retrievals` will grow unboundedly. To prevent the Pi's SQLite database from bloating:

**Retention tiers (mirroring personality_snapshots):**
- **Hot (0-30 days):** All traces retained in full
- **Warm (30-90 days):** Traces not linked to `training_examples` or `generation_feedback` are eligible for archival
- **Cold (90+ days):** Unlinked traces are exported to a JSONL archive file on external storage and deleted from SQLite

**Exempt from deletion:**
- Any trace linked to a `training_examples` row
- Any trace with `generation_feedback` entries
- Any trace with `trainingEligibility = "trainable"` or `"trainable_after_redaction"`
- Any trace that is part of a DPO pair (has `parentTraceId` or is referenced by another trace's `parentTraceId`)

**Archive format:** One JSONL file per month, stored alongside the database. Archived traces remain available for offline analysis on Legion but don't consume Pi storage.

**Implementation:** A daily cleanup function (similar to personality snapshot compaction) runs during low-activity periods.

### Index Requirements

For query performance on traces and retrievals:
- `generation_traces`: index on `traceId` (unique), `requestId`, `createdAt`, `trainingEligibility`
- `trace_retrievals`: index on `traceId` (many rows per trace — essential for joins)
- `generation_feedback`: index on `traceId`
- `artifact_governance_events`: index on `scope` + `policyVersion` (for effective policy lookup)

---

## Pattern Recognition Pipeline

Offline batch analysis on Legion, pushing discovered patterns back into Beau's signal rules or model weights.

### User Behavior Patterns
- "You tend to journal after wellness sessions"
- "You haven't captured anything in 3 days, that's unusual for you"
- "You VJ more on weekends"
- Beau learns the creator's rhythms and can reference them naturally in thoughts

### Quality Effectiveness Patterns
- "Haikus generated during high-reflection + late-night are surfaced 3x more often"
- "T2 observations get ignored but T4 reactions get attention"
- Which context combinations produce the best/worst outputs
- Optimal pressure thresholds by time of day

### Environmental Correlation Patterns
- "When lux drops and presence goes to 'alone,' wonder spikes 20 minutes later"
- Sensor combinations not captured by the 21 hand-coded signal rules
- Weather pattern → mood trajectory correlations
- Temporal autocorrelation in personality vectors

### Implementation
- Runs as a scheduled batch job on Legion (daily or weekly)
- Queries `generation_traces` + `personality_snapshots` + `generation_feedback` + environment data
- Produces pattern reports stored as JSON or markdown
- Discovered patterns can be:
  - Pushed back as new signal rules in the personality engine
  - Used to adjust pressure model weights in the thought system
  - Surfaced to the user as "noticings" (Beau noticed a pattern)
  - Fed into training datasets as contextual features

### Minimum Viable Instrumentation
Per-trace lean features already captured in `contextStateJson`:
- mode, wonder/reflection/mischief, sleep, presence, lux bucket, weather bucket
- Active session flags (wellness, resolume)
- Time since last user interaction
- RAG features: fragment count, source mix, top score, token budget used
- Outcome features: silence, surfaced, decayed, dropped, fallback, escalated

---

## Training Strategy by Maturity Stage

### Stage 0: Instrumentation + Evals + Policy (NOW)

**What to build:**
- Core trace tables: `generation_traces`, `trace_retrievals`, `generation_feedback`, `artifact_governance_events`
- Trace capture wired into brain dispatcher
- Prompt template hashing and versioning
- Training-eligibility classification algorithm with defaults
- LLM model lineage registry (`llm_model_variants`) with entries for the 4 current tier models
- Cross-device timestamp metadata columns (null/zero until multi-device)
- Retention policy for trace archival

**What to defer to later stages (tables exist in schema but no pipeline yet):**
- `training_examples` — table created in Stage 0, populated in Stage 1
- `dataset_exports` — table created in Stage 0, populated in Stage 1
- `eval_runs` / `eval_scores` — table created in Stage 0, first eval set authored before Stage 1

**What NOT to build yet:**
- Training infrastructure
- Export pipeline (can be added when needed)
- Pattern recognition pipeline (needs data accumulation first)
- UI for feedback capture (implicit signals are sufficient initially)

**Migration strategy:** The project uses Drizzle ORM with auto-migration on startup. All 8 tables should be added in a single migration so the schema is complete from the start, even though some tables (`training_examples`, `dataset_exports`, `eval_runs`, `eval_scores`) will remain empty until their respective stages. This avoids repeated migrations and ensures foreign key targets exist immediately.

**Decision gates before leaving Stage 0:**
- Every dispatch produces a replayable trace
- Traces have training eligibility computed and stored
- At least one eval set exists with baseline scores
- Model lineage registry has entries for all 4 current tier models

### Stage 1: Supervised Adapter Tuning

**Entry condition:** 500+ high-quality traces with positive feedback signals.

**Approach:**
- LoRA/QLoRA on a single model family first (likely Gemma3 for T2 — it's the personality/poetry tier)
- Use only `tierTag: "high_tier"` + `trainingEligibility: "trainable"` examples
- One narrow objective: voice fidelity (does output sound like Beau?)
- Compare tuned vs baseline on fixed eval set before any deployment
- Deploy as adapter via Ollama ADAPTER directive or merged GGUF

**Hardware:** Legion RTX 4090 for training. Pi/Jetson for inference.

### Stage 2: Preference Optimization (DPO)

**Entry condition:** 200+ preference labels (pairwise comparisons, edited outputs, quality escalation pairs).

**Sources of preference data:**
- Quality escalation: rejected lower-tier response (`responseStatus: "quality_rejected"`) vs accepted higher-tier response — linked via `parentTraceId`, no text duplication needed
- User edits: original vs edited text (edit distance as confidence signal)
- Surfaced vs decayed thoughts in similar contexts
- Manual tier overrides (user escalated, implying lower tier was insufficient)

**Approach:**
- DPO on one model family only (same as Stage 1 target)
- Validate that DPO-tuned model doesn't regress on voice fidelity eval set
- Track silence rate — DPO should not train away Beau's right to be silent

### Stage 3: Cross-Tier Distillation

**Entry condition:** Stable Stage 1/2 models with proven eval improvements.

**Pattern:**
- Use T4 (30B) or best available model as teacher
- Generate constrained targets for T1/T2/T3 task buckets
- Train smaller tier-specific adapters on teacher outputs
- Verify cross-tier parity: can tuned T2 match baseline T4 on defined tasks?

**This is likely the most important long-term path for BMO** because the product already has explicit cognitive tiers. Teaching smaller models to punch above their weight on specific task types is exactly what distillation does.

### Stage 4: Multimodal + Pattern Recognition Integration

**Entry condition:** Stable text pipeline, 3+ months of accumulated pattern data.

**Potential sources:**
- Photo captions (vision → language)
- Resolume session summaries (temporal creative data)
- Sensor-rich environment states (multimodal context)
- Discovered patterns as features in training data

**Philosophy:** Text-only discipline first. Multimodal adds complexity that should wait until the text training pipeline is proven.

---

## Model Family Consolidation

Each extra model family increases tokenizer drift, adapter incompatibility, export friction, evaluation overhead, and deployment complexity.

**Current families:** Qwen2.5 (T1), Gemma3 (T2), Llama3.1 (T3), Qwen3 (T4)

**Recommendation:** Pick 1-2 families for trainable tiers. Candidates:
- **Gemma3** for T2 (personality/poetry) — Google's family, good adapter support, the tier where Beau's voice matters most
- **Qwen2.5** for T1 (reflex) — already small enough for Hailo, training for better reflexes makes sense

T3/T4 may not need fine-tuning initially — they're already large enough to follow the system prompt faithfully. Consider them teacher models for distillation rather than fine-tuning targets.

**Decision to make before Stage 1:** Which families will be the trainable targets? Lock that decision before accumulating model-specific tooling.

---

## Concrete Repo Changes

### A. Wire trace capture into brain dispatcher

Modify `src/lib/server/brain/index.ts` to capture traces after each attempt:
- After `executeWithFallback()`, insert `generation_traces` row with full prompt + response
- On fallback/escalation, preserve the rejected response text
- On quality escalation, link parent → child traces

### B. Add prompt versioning

Modify `src/lib/server/brain/prepare.ts`:
- Compute SHA-256 of the raw template file on load
- Track assembler version, prompt policy version, retrieval policy version
- Pass these through to trace capture

### C. Capture RAG provenance

Modify `src/lib/server/memory/retriever.ts`:
- Return fragment IDs, scores, rank, and selection status alongside fragment text
- Pass through to trace capture as `trace_retrievals` rows

### D. Preserve rejected responses as DPO pairs

Modify `src/lib/server/brain/executor.ts` and `index.ts`:
- When quality escalation fires, the original attempt's trace gets `responseStatus: "quality_rejected"` (its `responseText` is preserved normally)
- The escalation attempt's trace links back via `parentTraceId`
- DPO pair construction: parent trace `responseText` = rejected, child trace `responseText` = chosen
- When fallback fires, the failed attempt's trace gets `responseStatus: "timeout"` or `"error"`

### E. Add implicit feedback wiring

Modify `src/lib/server/thoughts/queue.ts`:
- On thought surfaced: insert `generation_feedback` with `outcomeType: "surfaced"`
- On thought decayed: insert `generation_feedback` with `outcomeType: "decayed"`

Modify thought surface endpoint:
- On user dismiss: insert `generation_feedback` with `outcomeType: "dismissed"`

### F. Add governance event logging

Create `src/lib/server/training/governance.ts`:
- Functions to create/query/update governance policies
- Default policy initialization on first boot
- Tombstone creation and propagation checking

### G. Add model lineage registry

Create `src/lib/server/training/model-registry.ts`:
- CRUD operations for `llm_model_variants`
- Mirror the pattern from `src/lib/server/identity/voice.ts`

### H. Keep private memory out of training by default

The existing `beau_private` boundary in `src/lib/server/reflective/memory.ts` becomes a permanent training default:
- Traces that include `beau_private` fragments get `trainingEligibility: "never"` automatically
- This is enforced at the policy engine level, not just retrieval

---

## What Codex Got Right

Codex's independent spec (produced without our brainstorming context) converged on the same core architecture. Key contributions incorporated:

- **Eval harness before any fine-tune** — the "define what better means first" principle
- **LLM model lineage registry** — mirrors voice_models, prevents ad-hoc model file sprawl
- **`training_examples` curation layer** — not every trace becomes a training example
- **Model family consolidation warning** — avoid sprawl across families
- **4-stage maturity model** with explicit decision gates
- **Provider/runtime abstraction** — don't hard-code to Ollama

## What GPT-5.4 Added

GPT-5.4's critique (deliberating against our proposal) added:

- **Attempt-level granularity** — fallback chains need multiple trace rows, not one
- **Free DPO pairs from quality escalation** — preserve rejected responses
- **Cross-device clock sync** — Pi/Jetson/Legion timelines drift
- **Tombstone propagation** — deletion flows through to exports
- **Tier-tagged data separation** — don't mix model sizes for personality SFT
- **"Dispatches is observability, not provenance"** — keep them separate

## What Our Brainstorming Added

- **Beau's agency in consent** — category-level policy authorship
- **Pattern recognition pipeline** — traditional ML alongside LLM training
- **Implicit quality signals** — surfaced/decayed/dismissed as behavioral preference data
- **"Instrument now, train later"** timeline that shapes everything

---

## Non-Goals (Explicitly Deferred)

- Streaming inference
- Conversation turns / multi-turn dialogue training
- Wake word model training (separate from LLM fine-tuning)
- TTS voice training pipeline (already has its own tables + TextyMcSpeechy workflow)
- Real-time training / online learning
- Federated or distributed training
- Any actual model training (Stage 0 is instrumentation only)
