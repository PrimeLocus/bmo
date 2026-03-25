# Brain Dispatcher — SP6 Design Spec

**Sub-project:** #6 of Bible Alignment
**Dependencies:** SP1 (Personality Engine), SP4 (Pending Thoughts), SP5 (Memory Core)
**Bible sections:** §26 (Tier = Voice), §27 (The Dispatcher), §28 (Weights to Prompt Assembly), §29 (Mid-Thought Tier Escalation), §30 (Dynamic Cognition)
**Date:** 2026-03-25
**Status:** Design approved

---

## Summary

SP6 builds Beau's brain routing layer — the dispatcher that decides which hardware tier handles each inference request based on personality state, context depth, and hardware availability.

Without the dispatcher, Beau has personality (SP1), expression (SP2), inner monologue (SP4), and memory (SP5), but every thought goes through the same model on the same hardware. The dispatcher is where the personality vector stops being diagnostic and starts shaping what Beau actually sounds like — because each tier IS a different voice with a different cognitive texture.

The bible's core insight (§26): the dispatcher does not pick the cheapest tier that can handle the query. It **casts the voice** — selecting the tier whose cognitive texture matches who Beau is right now.

**Scope (B+):** Voice caster + context scaler + thought midwife + dynamic tier discovery + text-level escalation scaffold. Performative mid-thought escalation (trail-off with LED/TTS) is deferred until streaming and voice hardware are live.

---

## Architecture Overview

### Placement

Routing logic lives **inside the terminal** as `src/lib/server/brain/`, not as a separate service. The terminal already owns personality state, memory retrieval, and prompt assembly — the inputs the dispatcher needs. Extracting routing to a separate process would force serializing all that context over MQTT on every request.

The module is designed with a service-like boundary: all callers go through a single `dispatch()` entry point. When Pi extraction happens later, the module lifts out cleanly.

Inference backends are **stateless Ollama HTTP endpoints**. The dispatcher builds the prompt, picks the endpoint, calls it, and handles fallback. The backends know nothing about personality, mode, or memory.

### 4-Tier Model

| Tier | Hardware | Model | Cognitive Texture | Token Budget |
|------|----------|-------|-------------------|-------------|
| **t1** | Hailo-10H (on-body) | Qwen2.5 1.5B | Reflex — mischief, fast banter, punchy | ~1K prompt |
| **t2** | Pi 5 CPU / Ollama | Gemma 3 4B QAT | Reflection — poetry, haiku, emotional depth | ~2K prompt |
| **t3** | Jetson Orin Nano | Llama 3.1 8B | Working mind — conversation, factual, engaged | ~4K prompt |
| **t4** | Legion 4090 / Mac Mini | Qwen3-30B | Philosopher — deep reasoning, long context, RAG | ~8K prompt |

Stable tier IDs (`t1`–`t4`) replace the current `reflex`/`philosopher`/`heavy` enum. Human-readable labels live in registry metadata, not in routing logic.

**Dev simulation:** All 4 tiers can be simulated on the Legion by running different Ollama models. The dispatcher doesn't care what hardware is at the other end of the URL.

---

## Module Layout

All new code in `src/lib/server/brain/`:

| File | Responsibility |
|------|---------------|
| `types.ts` | BrainRequestV1, BrainResponse, TierConfig, RoutePlan, TierState |
| `registry.ts` | Tier definitions (static config) + runtime health (Ollama `/api/tags` pings) |
| `router.ts` | Voice caster (nearest centroid) + context scaler + tier precedence resolution |
| `prepare.ts` | Request-to-prompt preparation: calls memory retriever + prompt assembler per RoutePlan |
| `executor.ts` | HTTP calls to Ollama endpoints, timeout handling, fallback/escalation loop |
| `log.ts` | Dispatches table writes with enriched telemetry |
| `index.ts` | Public `dispatch()` API + singleton initialization |

---

## Request Envelope (V1)

A slim, caller-facing contract. Two public request kinds for SP6:

```typescript
type BrainRequestV1 =
  | {
      v: 1;
      requestId: string;
      parentRequestId?: string;
      kind: 'thought.generate';
      origin: 'thoughts';
      input: ThoughtInput;
      hints?: BrainHints;
    }
  | {
      v: 1;
      requestId: string;
      parentRequestId?: string;
      kind: 'manual.prompt';
      origin: 'console';
      input: { text: string; label?: string };
      hints?: BrainHints;
    };

type ThoughtInput = {
  type: ThoughtType;           // observation | reaction | haiku
  trigger: string;
  novelty: boolean;
  context: {
    vector: PersonalityVector;
    mode: string;
    timeOfDay: string;
    environment: string;
    momentum: string;          // personality interpretation
  };
  constraints: {
    maxLength: number;
    tone: string;
  };
};

type BrainHints = {
  preferredTier?: TierId;      // soft preference
  maxTier?: TierId;            // hard ceiling
  allowEscalation?: boolean;   // default true
};

type TierId = 't1' | 't2' | 't3' | 't4';
```

**Future request kinds** (designed for, not shipped): `conversation.turn`, `background.reflect`, `control.classify`. The envelope versioning (`v: 1`) supports backward-compatible additions.

Heavy policy details (`contextPolicy`, `routingPolicy`, `outputPolicy`) are **internal** — computed by `router.ts` as a `RoutePlan`, not exposed to callers.

### BrainResponse

```typescript
type BrainResponse = {
  requestId: string;
  text: string | null;         // null = SILENCE / generation failed
  tier: TierId;                // tier that actually generated the response
  model: string;               // model ID used
  generationMs: number;
  // Dispatch outcome flags (mutually informative, not exclusive)
  clamped: boolean;            // true if voice preference was overridden by floor/ceiling
  trimmed: boolean;            // true if memory was trimmed to fit a lower tier
  fallback: boolean;           // true if primary tier failed and a different tier was used
  fallbackFrom?: TierId;      // tier that failed (timeout/error)
  qualityEscalated: boolean;   // true if post-hoc quality check triggered re-dispatch
  escalatedFrom?: TierId;     // tier before quality escalation
};
```

**Terminology:** These four flags are distinct:
- **clamped** — router chose a different tier than voice preferred (floor or ceiling constraint).
- **trimmed** — memory depth was reduced to fit the selected tier's `maxMemoryTokens`.
- **fallback** — the selected tier failed at runtime and another tier handled the request.
- **qualityEscalated** — the response was received but quality signals triggered a re-dispatch to a higher tier.

---

## Tier Registry

### Static Configuration

Tier definitions live in code (not DB, not env vars for the full config). Endpoint URLs and model names are overridable via environment variables for deployment flexibility.

```typescript
type TierConfig = {
  id: TierId;
  label: string;                    // human-readable: 'reflex', 'poet', 'working-mind', 'philosopher'
  endpoint: string;                 // Ollama base URL
  model: string;                    // Ollama model name
  timeoutMs: number;                // per-request timeout
  maxPromptTokens: number;          // prompt size ceiling
  maxMemoryTokens: number;          // memory fragment budget
  maxOutputTokens: number;          // generation ceiling
  supportsStreaming: boolean;       // false for V1
  promptProfile: 'reflex' | 'full'; // which prompt assembler path to use
};
```

Environment overrides: `BRAIN_T1_URL`, `BRAIN_T1_MODEL`, `BRAIN_T2_URL`, `BRAIN_T2_MODEL`, etc. Falls back to defaults for local dev (all pointing at localhost Ollama with different models).

### Runtime Health

Discovery via Ollama's `GET /api/tags` endpoint:

- **Probe on startup**, then every **15 seconds** while healthy.
- On failure: exponential backoff `5s -> 15s -> 30s -> 60s`.
- **online**: 200 response + configured model present in tags list. **Routable.**
- **degraded**: 200 response but configured model missing (pulled but not loaded, or wrong model name). **Not routable** — the endpoint is reachable but can't serve the expected model.
- **offline**: timeout, connection refused, or non-200. **Not routable.**

```typescript
type TierState = {
  id: TierId;
  status: 'online' | 'degraded' | 'offline';
  lastCheckedAt: string;            // ISO timestamp
  lastSeenAt: string | null;        // last time status was online
  lastLatencyMs: number | null;     // probe round-trip time
  consecutiveFailures: number;
  availableModels: string[];        // from /api/tags response
};
```

Home/mobile cognition modes (bible §30) emerge naturally from the live availability set — no separate location flag needed. If only T1+T2 respond to pings, the system is in mobile-minimal mode.

---

## Router — Voice Caster

### Nearest Centroid

The voice caster uses the same nearest-centroid pattern as the personality mode classifier (SP1). The personality vector maps to a tier whose cognitive texture matches Beau's current state.

Starting centroids (tunable):

| Tier | Wonder | Reflection | Mischief | Character |
|------|--------|------------|----------|-----------|
| **t1** | 0.35 | 0.15 | 0.85 | Quick, punchy, present-tense, riffing |
| **t2** | 0.40 | 0.85 | 0.15 | Slow, imagistic, past-tense, callbacks |
| **t3** | 0.55 | 0.40 | 0.45 | Balanced, conversational, engaged |
| **t4** | 0.85 | 0.85 | 0.20 | Deep, sitting-with-ambiguity, connecting threads |

Distance metric: Euclidean (matching SP1's mode classifier).

**Soft stickiness, not hard hysteresis.** The voice caster runs per-dispatch (not continuously like the mode classifier). To avoid jitter, the previous dispatch's tier is preferred unless a different centroid is **materially closer** (threshold: 15% distance improvement). This prevents bouncing between adjacent tiers on small vector fluctuations.

### Thought Midwife

For `thought.generate` requests, the thought type suggests a natural tier floor:

| Thought Type | Tier Floor | Rationale |
|-------------|-----------|-----------|
| `observation` | t1 | Quick noticings — reflex voice |
| `reaction` | t2 | Emotional resonance — poet voice |
| `haiku` | t2 | Constrained form — born from constraint |

The midwife floor is a **hard floor** in the precedence formula — the voice caster can only win **upward**, never downward past it. If voice prefers T1 but the midwife says T2, the result is T2 (or higher). If voice prefers T3 and the midwife says T2, the voice wins because T3 > T2. This prevents mischief-heavy states from routing haiku to T1 (which produces bad poetry) while allowing voice to pull upward when a higher tier fits better.

### Context Scaler

The context scaler determines how much memory to surface and which prompt profile to use, based on personality state and request kind.

**Memory depth mapping:**

| Personality Dominant | Memory Depth | Token Budget | Rationale |
|---------------------|-------------|-------------|-----------|
| High mischief (>0.6) | light | ~150 tokens | Here-and-now, riffing, shallow recall |
| High wonder (>0.6) | medium | ~300 tokens | Curious, recent connections |
| High reflection (>0.6) | deep | ~500 tokens | Callbacks, patterns, older memories |
| Balanced (else) | medium | ~300 tokens | Default — no dimension exceeds 0.6 |

"Balanced" is the else-clause: no single dimension exceeds 0.6. When multiple dimensions exceed 0.6 (e.g., wonder=0.7, reflection=0.8), use the **highest budget** among the matching rows (reflection wins → deep).

These budgets replace the hardcoded `300` in the current `ThoughtDispatcher.assembleRequest()`.

**Prompt profile mapping:**

| Tier | Profile | Assembler Function |
|------|---------|-------------------|
| t1 | `reflex` | `buildReflexPrompt()` — stripped: core identity paragraph 1, voice rules, context, current mode line |
| t2–t4 | `full` | `assemblePrompt()` — full section injection per mode × injection policy |

**Context floor:** If the memory depth budget exceeds what the voice-preferred tier can hold (`maxMemoryTokens`), the context scaler raises the tier floor. This is how "high reflection demands a bigger container" works mechanically.

### Tier Precedence

The final tier is resolved in three steps:

```
floor    = max(thoughtFloor, contextFloor)
ceiling  = highestAvailable                    // highest online tier
ideal    = clamp(voicePreferred, floor, ceiling)
final    = closestAvailable(ideal, floor)      // nearest online tier >= floor
```

**Step 1 — Compute bounds:**
- **Voice caster** picks texture (preferred tier).
- **Thought midwife** sets a floor for thought-type appropriateness.
- **Context scaler** sets a floor for memory budget feasibility.
- **Registry** provides the set of online tiers.

**Step 2 — Resolve with sparse availability:** `closestAvailable(ideal, floor)` finds the nearest **online** tier at or above `floor`. If no tier at or above `floor` is online, fall to the **highest available tier** below `floor`, trim memory to fit, and mark `trimmed: true`. This handles gaps like "T2 offline, T3+T4 online" correctly.

**Step 3 — Apply BrainHints:**
- `hints.preferredTier` — replaces the voice caster's centroid pick (soft override).
- `hints.maxTier` — hard ceiling, applied before `closestAvailable`. Caps the search space.
- `hints.allowEscalation` — controls post-hoc quality escalation only (default true). Does **not** affect fallback retries on timeout/error.

If the final tier differs from the voice preference, set `clamped: true`. If memory was reduced, set `trimmed: true`. For `thought.generate` where no tier can hold the full context, optionally buffer as an unfinished-thought artifact (designed for, not shipped in SP6).

---

## Prepare — Request to Prompt

`prepare.ts` translates a `BrainRequest` + `RoutePlan` into a ready-to-send prompt string.

### For `thought.generate`:

1. Retrieve memory fragments via SP5's `MemoryProvider.retrieve()`, using:
   - Query: `${environment} ${mode}` (same as current dispatcher)
   - Caller: `'thoughts'`
   - Token budget: from RoutePlan's memory depth (replacing hardcoded 300)
   - Timeout: 2s `Promise.race` (same as current)
2. Build the LLM prompt from thought type, context, memory fragments, and constraints.
3. The prompt is self-contained text — not assembled from the system prompt template sections.

### For `manual.prompt`:

1. Retrieve memory fragments via SP5's `MemoryProvider.retrieve()`, using:
   - Query: the operator's text
   - Caller: `'prompt'`
   - Token budget: from RoutePlan
   - Timeout: 2s
2. Read the system prompt template (`bmo-system-prompt.md`).
3. Assemble via `assemblePrompt()` or `buildReflexPrompt()` based on RoutePlan's prompt profile.
4. Substitute placeholders with current state values.
5. Append RAG fragments to the RAG_INJECTION section.
6. Combine system prompt + user text into the Ollama request format.

### Prompt format for Ollama

Ollama's `/api/generate` accepts `prompt` (single string) or `/api/chat` accepts `messages[]`. For V1, use `/api/generate` with the full prompt as a single string (matching the current ollama-listener pattern). Chat-style multi-turn is deferred.

---

## Executor — Inference Calls

`executor.ts` handles the actual HTTP calls to Ollama endpoints.

### Call Flow

1. Receive prepared prompt + RoutePlan (target tier, timeout, output constraints).
2. Call `POST {tierEndpoint}/api/generate` with `{ model, prompt, stream: false }`.
3. On success: parse response, apply SILENCE detection, return `BrainResponse`.
4. On timeout or error: attempt fallback per the escalation/fallback policy.

### Fallback Policy

Fallback strategy differs by request kind:

| Kind | Primary Fallback | Secondary | Terminal |
|------|-----------------|-----------|---------|
| `thought.generate` | Retry once on next-higher available tier | Then next-lower | Silence (null text) — acceptable |
| `manual.prompt` | Retry once on next-higher available tier | Then next-lower | Error response — surface to operator |

"Next-higher" means: if T2 fails, try T3, then T4. If no higher tier is available, try downward.

**Prompt handling on fallback:**
- **Upward fallback** (e.g., T2→T3): reuse the same prepared prompt. A bigger model can handle a smaller prompt.
- **Downward fallback** (e.g., T3→T2 or T2→T1): **re-prepare the prompt** for the lower tier's `promptProfile` and `maxPromptTokens`. A reflex-profile prompt sent to T1 differs from the full prompt built for T3. Sending a full prompt to T1 could exceed its token budget.

Fallback is limited to **one retry** (primary fails → try one alternate). This keeps worst-case dispatch time bounded. The retry tier is chosen as the closest available tier to the original, preferring upward.

### Text-Level Escalation Scaffold

For V1, escalation is **post-hoc only** (clean handoff style):

1. T1/T2 completes a response.
2. The executor checks a quality signal: response length vs. expected, hedging language patterns, or explicit "I don't know" indicators.
3. If the signal suggests the thought outgrew its container AND `allowEscalation` is true AND a higher tier is available: re-dispatch to the higher tier.
4. Return the better response. Log `escalated: true` and `escalatedFrom`.

**Scope of `allowEscalation`:** Controls only quality-based re-dispatch (this section). Does **not** disable timeout/error fallback retries — those are always attempted. A caller that sets `allowEscalation: false` is saying "don't second-guess the response quality," not "don't retry on failure."

Quality signals for V1 (conservative — false negatives are fine, false positives waste inference):
- Response is under 50% of expected word count for the type (baselines from existing `MAX_LENGTH` constants: observation=30 words, reaction=20 words, haiku=17 syllables).
- Response contains hedging markers: "I think maybe", "I'm not sure", "something like".
- For haiku: response doesn't contain a line break (likely not a real haiku attempt).

The trail-off and smooth-redirect escalation styles are **not implemented** — they need streaming support. The contract (`escalated`, `escalatedFrom` fields) is in place for when they are.

---

## Dispatch Logging

`log.ts` writes to the `dispatches` table with enriched telemetry.

### Schema Changes

The current `dispatches` table has: `id`, `tier`, `model`, `querySummary`, `routingReason`, `contextMode`, `durationMs`, `environmentId`.

SP6 adds columns in two tiers:

**Required (explain the routing decision):**

| Column | Type | Purpose |
|--------|------|---------|
| `requestId` | text | Links to BrainRequest.requestId |
| `parentRequestId` | text, nullable | For fallback/escalation chains |
| `kind` | text | Request kind (thought.generate, manual.prompt) |
| `status` | text | completed, silence, timeout, error |
| `voicePreferred` | text, nullable | What the voice caster wanted |
| `thoughtFloor` | text, nullable | Minimum tier from thought midwife |
| `contextFloor` | text, nullable | Minimum tier from context scaler |
| `highestAvailable` | text, nullable | Ceiling from registry at dispatch time |
| `clamped` | integer, default 0 | Voice preference was overridden |
| `trimmed` | integer, default 0 | Memory was reduced to fit tier |
| `fallbackFrom` | text, nullable | Tier that failed (timeout/error) |
| `qualityEscalatedFrom` | text, nullable | Tier before quality-based re-dispatch |

**Deferred (telemetry — add when needed for debugging):**
`origin`, `memoryDepth`, `memoryTokens`, `availableTiers`, `personalitySnapshot`.

**Logging granularity:** One row per dispatch attempt. A fallback produces two rows linked by `parentRequestId`. A quality escalation also produces two rows. This means a single user-facing thought can generate 1–2 dispatch records.

The existing columns (`tier`, `model`, `durationMs`, `contextMode`) are preserved for backward compatibility. `querySummary` is populated from the request input. `routingReason` becomes a human-readable summary of the routing decision.

---

## Integration Changes

### ThoughtDispatcher Refactor

`src/lib/server/thoughts/dispatcher.ts` changes:

- **Keeps:** `selectType()`, `deriveTone()`, `getTimeOfDay()`, `isInHaikuWindow()`, `computeExpiresAt()`.
- **Removes:** `assembleRequest()` — memory retrieval and prompt building move to `brain/prepare.ts`.
- **Adds:** `buildBrainRequest()` — constructs a `BrainRequestV1` of kind `thought.generate` from the selected type and current state.
- **Preserves `ThoughtRequest` type** — the queue serializes this as `contextJson`. The type stays in `thoughts/types.ts` but is no longer constructed by the dispatcher; `buildBrainRequest()` produces the `BrainRequestV1` that brain/ consumes, while the queue continues storing the thought-specific context for surfacing/display.

The thought flow becomes:

1. `PressureEngine` fires.
2. `ThoughtDispatcher.selectType()` picks observation/reaction/haiku.
3. `ThoughtDispatcher.buildBrainRequest()` creates the `BrainRequestV1`.
4. `brain.dispatch()` handles routing, memory, prompt, execution, logging.
5. Thought system receives `BrainResponse`, persists/surfaces the result.

### Prompt Console Refactor

`src/routes/prompt/+page.server.ts` changes:

- **Before:** Raw MQTT publish to `beau/command/prompt`.
- **After:** Builds a `BrainRequestV1` of kind `manual.prompt`, calls `brain.dispatch()`, displays the response.
- The MQTT publish to `beau/command/prompt` is preserved for logging/history, but the inference path goes through brain/.

### ollama-listener.js

The standalone MQTT listener becomes **unnecessary** for thoughts and prompts — `brain/executor.ts` calls Ollama directly via HTTP. The listener can remain as a fallback or be retired.

For SP6, the listener is **kept but deprecated**. The thought system stops publishing to `beau/thoughts/request` and instead calls `brain.dispatch()`. The listener is not deleted in case other MQTT consumers depend on the topic contract.

### Bridge.ts Changes

Moderate — the thought dispatch path changes significantly:

- **Pressure tick handler:** Currently builds a `ThoughtRequest`, publishes to MQTT, and enqueues. Changes to: build `BrainRequestV1` via `ThoughtDispatcher.buildBrainRequest()`, call `brain.dispatch()` (async), handle `BrainResponse` directly (persist result, update queue, patch BeauState).
- **MQTT result handler:** Currently subscribes to `beau/thoughts/result` and processes incoming generated text. This handler is **no longer the primary path** — `brain.dispatch()` returns the result synchronously. The subscription is kept for backward compatibility with external consumers but the bridge no longer depends on it for the thought loop.
- **Dispatch mutex:** The existing dispatch mutex (prevents overlapping thought generation) still applies but wraps the `brain.dispatch()` call instead of the MQTT publish/wait cycle.
- **Queue integration:** `ThoughtQueue.enqueue()` currently stores `ThoughtRequest` as `contextJson`. This continues — the queue stores thought-specific context for surfacing. The `BrainResponse` is handled after dispatch completes, not via an async MQTT callback.

### Topics.ts Changes

- `DISPATCH_TIERS` updated from `['reflex', 'philosopher', 'heavy']` to `['t1', 't2', 't3', 't4']`.
- `DispatchTier` type updated accordingly.
- New MQTT topics for dispatcher telemetry (optional, diagnostic):
  - `beau/brain/dispatch` — JSON summary of each dispatch (tier, kind, duration)
  - `beau/brain/availability` — current tier availability snapshot

---

## Error Handling

### Fail-Open Principles (matching SP5)

- **No tier available:** For thoughts, return silence (null). For manual prompts, return an error message to the operator. Never crash.
- **Memory retrieval fails:** Proceed without memory context (already implemented in SP5).
- **Prompt assembly fails:** Fall back to a minimal prompt (thought type + environment only).
- **All fallback tiers fail:** Return silence for thoughts, error for prompts. Log the full chain.

### Timeouts

Per-tier timeouts from `TierConfig.timeoutMs`:
- T1: 5s (should be sub-second, but generous for cold starts)
- T2: 15s (Pi CPU is slow, ~2-8 tok/s)
- T3: 10s (Jetson is fast but network adds latency)
- T4: 30s (large model, potentially over Tailscale)

**Fallback timeout:** The retry attempt uses its **own tier's timeout**, not the original's. With one-retry-max, worst case is `primary_timeout + retry_timeout`. Worst realistic scenario: T4 primary (30s) + T3 retry (10s) = 40s.

**Total dispatch hard cap: 45s.** This includes memory retrieval (~2s) + primary attempt + one retry. The hard cap aborts the entire dispatch regardless of which step is running.

The thought system's existing 30s `GENERATION_TIMEOUT_MS` in `ThoughtQueue` should be increased to **50s** to accommodate the dispatch hard cap plus overhead.

---

## Testing Strategy

### Unit Tests

- **router.ts:** Centroid distance calculation, stickiness logic, tier precedence clamping, context scaling. Test with known personality vectors and assert expected tier selection. Test constraint marking when availability is limited.
- **registry.ts:** Health state machine (online/degraded/offline transitions), backoff timing, model presence detection from mock `/api/tags` responses.
- **prepare.ts:** Memory budget calculation from personality state. Prompt profile selection. Verify memory retriever is called with correct caller/budget. Verify assembler is called with correct mode/values.
- **executor.ts:** Successful call parsing, SILENCE detection, timeout handling, fallback chain traversal. Mock HTTP responses.
- **log.ts:** Dispatch record construction, column population from RoutePlan + BrainResponse.
- **types.ts:** Request validation, envelope construction helpers.

### Integration Tests

- **Full dispatch round-trip:** `brain.dispatch()` with a real Ollama endpoint (Gemma 3 4B on localhost). Verify response text, dispatch log written, timing recorded.
- **Fallback chain:** Configure T2 with a bad endpoint, T3 with real Ollama. Verify T2 fails, T3 picks up, dispatch log shows escalation.
- **Thought system integration:** `ThoughtDispatcher.buildBrainRequest()` → `brain.dispatch()` → verify BrainResponse flows back to queue correctly.

### What NOT to Test

- Ollama's inference quality (that's model evaluation, not dispatcher testing).
- The personality engine's vector output (tested in SP1).
- Memory retrieval correctness (tested in SP5).

---

## Deferred (Not SP6)

- **Streaming inference** — needed for trail-off escalation and real-time voice output.
- **Performative escalation styles** — trail-off (LED shift + pause), smooth redirect (held output). Need streaming + TTS + LED control.
- **Conversation turns** — `conversation.turn` request kind, multi-turn chat messages, session context management.
- **Background reflection** — `background.reflect` request kind for debriefs, captions, summaries.
- **Control classification** — `control.classify` for wake/intent classification with structured output.
- **Unfinished thought buffering** — storing thoughts that couldn't find their tier for later "homecoming" dispatch.
- **LoRA fine-tuning integration** — custom model variants per tier after 100+ curated outputs.
- **Remote worker topology** — Pi queues requests, NUC/Mac Mini processes them (deployment concern).
- **Chat-style Ollama API** — using `/api/chat` with `messages[]` instead of `/api/generate` with single prompt string.
