# Brain Dispatcher (SP6) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Beau's brain routing layer — personality-driven tier selection, dynamic discovery, prompt preparation, and inference execution across 4 hardware tiers.

**Architecture:** New `src/lib/server/brain/` module with service-like boundary. All callers go through `dispatch()`. Routing logic: voice caster (nearest centroid) + context scaler (memory depth) + thought midwife (type floors) → tier precedence → prompt preparation → HTTP to Ollama → fallback/escalation → dispatch logging.

**Tech Stack:** TypeScript, Ollama HTTP API, existing SP1 personality engine, SP5 memory retriever, Drizzle ORM (SQLite)

**Spec:** `docs/superpowers/specs/2026-03-25-brain-dispatcher-design.md`

---

## File Map

### New files (all in `beau-terminal/src/lib/server/brain/`)

| File | Responsibility |
|------|---------------|
| `types.ts` | TierId, BrainRequestV1, BrainResponse, ThoughtInput, BrainHints, TierConfig, TierState, RoutePlan, MemoryDepth |
| `registry.ts` | TierRegistry class: static tier configs, env overrides, health probe loop (`/api/tags`), `getOnlineTiers()`, `getTierState()` |
| `router.ts` | `routeRequest()`: voice caster (centroid distance + stickiness), context scaler (vector → memory depth → context floor), thought midwife (type → tier floor), precedence resolution (`closestAvailable`) |
| `prepare.ts` | `preparePrompt()`: calls memory retriever + prompt assembler per RoutePlan. Thought prompts + manual prompts |
| `executor.ts` | `executeOnTier()`: HTTP POST to Ollama `/api/generate`, timeout, SILENCE detection. `executeWithFallback()`: one-retry policy, re-prepare on downward fallback. `checkQualitySignals()`: post-hoc escalation |
| `log.ts` | `logDispatch()`: writes enriched dispatch record to `dispatches` table |
| `index.ts` | `dispatch()` public API, `initBrain()` startup, singleton registry |

### New test files (all in `beau-terminal/test/`)

| File | Tests |
|------|-------|
| `brain/types.test.ts` | Envelope construction, validation helpers |
| `brain/registry.test.ts` | Health state machine, backoff, model presence |
| `brain/router.test.ts` | Centroid distance, stickiness, midwife floors, context scaling, precedence with sparse availability |
| `brain/prepare.test.ts` | Memory budget from vector, prompt profile selection, prompt building |
| `brain/executor.test.ts` | HTTP call mocking, SILENCE detection, fallback chain, quality signals, timeout |
| `brain/log.test.ts` | Dispatch record construction |
| `brain/dispatch.test.ts` | Full dispatch integration (mock HTTP) |

### Modified files

| File | Change |
|------|--------|
| `src/lib/server/db/schema.ts` | Add columns to `dispatches` table |
| `src/lib/server/mqtt/topics.ts` | Update `DISPATCH_TIERS` to 4 tiers, add `beau/brain/*` topics |
| `src/lib/server/thoughts/types.ts` | Bump `GENERATION_TIMEOUT_MS` to 50000 |
| `src/lib/server/thoughts/dispatcher.ts` | Remove `assembleRequest()`, add `buildBrainRequest()` |
| `src/lib/server/mqtt/bridge.ts` | Replace MQTT thought dispatch with `brain.dispatch()`, init brain on startup |
| `src/routes/prompt/+page.server.ts` | Add `dispatch` action using `brain.dispatch()` |
| `src/hooks.server.ts` | Init brain registry on startup (if not already done in bridge) |

---

## Task 1: Types — Request Envelope & Config

**Files:**
- Create: `src/lib/server/brain/types.ts`
- Test: `test/brain/types.test.ts`

- [ ] **Step 1: Write tests for type construction helpers**

```typescript
// test/brain/types.test.ts
import { describe, it, expect } from 'vitest';
import {
  TIER_IDS, TIER_ORDER,
  makeBrainRequest, makeThoughtRequest, makeManualRequest,
  type TierId, type BrainRequestV1, type TierConfig,
} from '../../src/lib/server/brain/types.js';

describe('brain/types', () => {
  describe('TIER_ORDER', () => {
    it('maps tier IDs to numeric order', () => {
      expect(TIER_ORDER.t1).toBe(0);
      expect(TIER_ORDER.t2).toBe(1);
      expect(TIER_ORDER.t3).toBe(2);
      expect(TIER_ORDER.t4).toBe(3);
    });
  });

  describe('makeThoughtRequest', () => {
    it('creates a thought.generate request with defaults', () => {
      const req = makeThoughtRequest({
        type: 'haiku',
        trigger: 'idle',
        novelty: false,
        context: {
          vector: { wonder: 0.5, reflection: 0.8, mischief: 0.2 },
          mode: 'ambient',
          timeOfDay: 'evening',
          environment: 'quiet room, dim light',
          momentum: 'contemplative',
        },
        constraints: { maxLength: 17, tone: 'contemplative' },
      });
      expect(req.v).toBe(1);
      expect(req.kind).toBe('thought.generate');
      expect(req.origin).toBe('thoughts');
      expect(req.requestId).toBeTruthy();
      expect(req.input.type).toBe('haiku');
    });
  });

  describe('makeManualRequest', () => {
    it('creates a manual.prompt request', () => {
      const req = makeManualRequest({ text: 'What do you see?', label: 'test' });
      expect(req.kind).toBe('manual.prompt');
      expect(req.origin).toBe('console');
      expect(req.input.text).toBe('What do you see?');
    });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module not found)**

Run: `cd beau-terminal && npx vitest run test/brain/types.test.ts`

- [ ] **Step 3: Implement types.ts**

```typescript
// src/lib/server/brain/types.ts
import { nanoid } from 'nanoid';
import type { ThoughtType } from '../thoughts/types.js';

// ── Tier IDs ────────────────────────────────────────────────────────────────

export const TIER_IDS = ['t1', 't2', 't3', 't4'] as const;
export type TierId = (typeof TIER_IDS)[number];

export const TIER_ORDER: Record<TierId, number> = { t1: 0, t2: 1, t3: 2, t4: 3 };

// ── Personality Vector (re-exported for convenience) ────────────────────────

export type PersonalityVector = { wonder: number; reflection: number; mischief: number };

// ── Tier Config (static) ────────────────────────────────────────────────────

export type PromptProfile = 'reflex' | 'full';

export interface TierConfig {
  id: TierId;
  label: string;
  endpoint: string;
  model: string;
  timeoutMs: number;
  maxPromptTokens: number;
  maxMemoryTokens: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  promptProfile: PromptProfile;
}

// ── Tier Runtime State ──────────────────────────────────────────────────────

export type TierStatus = 'online' | 'degraded' | 'offline';

export interface TierState {
  id: TierId;
  status: TierStatus;
  lastCheckedAt: string;
  lastSeenAt: string | null;
  lastLatencyMs: number | null;
  consecutiveFailures: number;
  availableModels: string[];
}

// ── Memory Depth ────────────────────────────────────────────────────────────

export type MemoryDepth = 'none' | 'light' | 'medium' | 'deep';

export const MEMORY_DEPTH_TOKENS: Record<MemoryDepth, number> = {
  none: 0,
  light: 150,
  medium: 300,
  deep: 500,
};

// ── Route Plan (internal — produced by router, consumed by prepare/executor)

export interface RoutePlan {
  targetTier: TierId;
  tierConfig: TierConfig;
  voicePreferred: TierId;
  thoughtFloor: TierId | null;
  contextFloor: TierId | null;
  memoryDepth: MemoryDepth;
  memoryTokenBudget: number;
  promptProfile: PromptProfile;
  clamped: boolean;
  trimmed: boolean;
  allowEscalation: boolean;
  maxTier: TierId | null;
}

// ── Brain Request V1 ────────────────────────────────────────────────────────

export interface ThoughtInput {
  type: ThoughtType;
  trigger: string;
  novelty: boolean;
  context: {
    vector: PersonalityVector;
    mode: string;
    timeOfDay: string;
    environment: string;
    momentum: string;
  };
  constraints: {
    maxLength: number;
    tone: string;
  };
}

export type BrainRequestV1 =
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

export interface BrainHints {
  preferredTier?: TierId;
  maxTier?: TierId;
  allowEscalation?: boolean;
}

// ── Brain Response ──────────────────────────────────────────────────────────

export interface BrainResponse {
  requestId: string;
  text: string | null;
  tier: TierId;
  model: string;
  generationMs: number;
  clamped: boolean;
  trimmed: boolean;
  fallback: boolean;
  fallbackFrom?: TierId;
  qualityEscalated: boolean;
  escalatedFrom?: TierId;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function makeThoughtRequest(
  input: ThoughtInput,
  hints?: BrainHints,
  parentRequestId?: string,
): Extract<BrainRequestV1, { kind: 'thought.generate' }> {
  return {
    v: 1,
    requestId: nanoid(12),
    parentRequestId,
    kind: 'thought.generate',
    origin: 'thoughts',
    input,
    hints,
  };
}

export function makeManualRequest(
  input: { text: string; label?: string },
  hints?: BrainHints,
): Extract<BrainRequestV1, { kind: 'manual.prompt' }> {
  return {
    v: 1,
    requestId: nanoid(12),
    kind: 'manual.prompt',
    origin: 'console',
    input,
    hints,
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `cd beau-terminal && npx vitest run test/brain/types.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/brain/types.ts test/brain/types.test.ts
git commit -m "feat(brain): types — BrainRequestV1, BrainResponse, TierConfig, RoutePlan (SP6 task 1)"
```

---

## Task 2: Tier Registry — Config + Health Probing

**Files:**
- Create: `src/lib/server/brain/registry.ts`
- Test: `test/brain/registry.test.ts`

- [ ] **Step 1: Write tests for default config + health state machine**

```typescript
// test/brain/registry.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TierRegistry, DEFAULT_TIER_CONFIGS } from '../../src/lib/server/brain/registry.js';

describe('brain/registry', () => {
  describe('DEFAULT_TIER_CONFIGS', () => {
    it('defines all 4 tiers', () => {
      expect(DEFAULT_TIER_CONFIGS).toHaveLength(4);
      expect(DEFAULT_TIER_CONFIGS.map(t => t.id)).toEqual(['t1', 't2', 't3', 't4']);
    });

    it('t1 uses reflex prompt profile', () => {
      const t1 = DEFAULT_TIER_CONFIGS.find(t => t.id === 't1')!;
      expect(t1.promptProfile).toBe('reflex');
    });

    it('t2-t4 use full prompt profile', () => {
      for (const id of ['t2', 't3', 't4'] as const) {
        const cfg = DEFAULT_TIER_CONFIGS.find(t => t.id === id)!;
        expect(cfg.promptProfile).toBe('full');
      }
    });
  });

  describe('TierRegistry', () => {
    let registry: TierRegistry;

    beforeEach(() => {
      registry = new TierRegistry(DEFAULT_TIER_CONFIGS);
    });

    afterEach(() => {
      registry.stopProbing();
    });

    it('all tiers start as offline', () => {
      const states = registry.getAllStates();
      expect(states.every(s => s.status === 'offline')).toBe(true);
    });

    it('getOnlineTiers returns empty when all offline', () => {
      expect(registry.getOnlineTiers()).toEqual([]);
    });

    it('getConfig returns config by id', () => {
      const cfg = registry.getConfig('t2');
      expect(cfg?.model).toBeTruthy();
      expect(cfg?.id).toBe('t2');
    });

    it('markOnline transitions tier to online', () => {
      registry.updateState('t2', 'online', ['gemma3:4b'], 45);
      const state = registry.getState('t2');
      expect(state?.status).toBe('online');
      expect(state?.lastLatencyMs).toBe(45);
      expect(state?.consecutiveFailures).toBe(0);
    });

    it('markOffline increments consecutive failures', () => {
      registry.updateState('t2', 'offline', [], null);
      registry.updateState('t2', 'offline', [], null);
      const state = registry.getState('t2');
      expect(state?.consecutiveFailures).toBe(2);
    });

    it('online resets consecutive failures', () => {
      registry.updateState('t2', 'offline', [], null);
      registry.updateState('t2', 'offline', [], null);
      registry.updateState('t2', 'online', ['gemma3:4b'], 50);
      expect(registry.getState('t2')?.consecutiveFailures).toBe(0);
    });

    it('getOnlineTiers returns only online tiers sorted by order', () => {
      registry.updateState('t4', 'online', ['qwen3:30b'], 100);
      registry.updateState('t1', 'online', ['qwen2.5:1.5b'], 10);
      const online = registry.getOnlineTiers();
      expect(online.map(t => t.id)).toEqual(['t1', 't4']);
    });

    it('degraded tiers are not in getOnlineTiers', () => {
      registry.updateState('t2', 'degraded', ['wrong-model'], 40);
      expect(registry.getOnlineTiers()).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd beau-terminal && npx vitest run test/brain/registry.test.ts`

- [ ] **Step 3: Implement registry.ts**

Implement `TierRegistry` class with:
- `DEFAULT_TIER_CONFIGS` array (4 tiers, env overrides via `BRAIN_T{N}_URL` / `BRAIN_T{N}_MODEL`)
- `TierState` map, `updateState()`, `getOnlineTiers()`, `getConfig()`, `getState()`, `getAllStates()`
- `startProbing(intervalMs)` / `stopProbing()` — calls `probeAllTiers()` on interval
- `probeTier(id)` — `GET {endpoint}/api/tags`, checks model presence, updates state
- Default endpoints: all `http://localhost:11434` with different model names for dev
- Default timeouts: t1=5000, t2=15000, t3=10000, t4=30000
- Default token budgets: t1: prompt=1000/memory=100/output=256, t2: prompt=2000/memory=300/output=512, t3: prompt=4000/memory=500/output=1024, t4: prompt=8000/memory=1000/output=2048

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Write probe tests (with fetch mocking)**

Add tests for `probeTier()`:
- Mock `fetch` to return 200 with model in tags → `online`
- Mock `fetch` to return 200 without model → `degraded`
- Mock `fetch` to throw (connection refused) → `offline`
- Verify backoff: after 3 consecutive failures, `getProbeIntervalMs()` returns escalated value

- [ ] **Step 6: Run probe tests — expect FAIL, then implement, then PASS**

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/brain/registry.ts test/brain/registry.test.ts
git commit -m "feat(brain): TierRegistry — config + health probing (SP6 task 2)"
```

---

## Task 3: Router — Voice Caster + Context Scaler + Precedence

**Files:**
- Create: `src/lib/server/brain/router.ts`
- Test: `test/brain/router.test.ts`

- [ ] **Step 1: Write voice caster tests**

```typescript
// test/brain/router.test.ts
import { describe, it, expect } from 'vitest';
import {
  castVoice, computeMemoryDepth, computeContextFloor,
  resolveThoughtFloor, resolveTier, VOICE_CENTROIDS,
} from '../../src/lib/server/brain/router.js';
import type { TierId, PersonalityVector, TierConfig } from '../../src/lib/server/brain/types.js';

describe('brain/router', () => {
  describe('castVoice', () => {
    it('high mischief → t1', () => {
      expect(castVoice({ wonder: 0.3, reflection: 0.1, mischief: 0.9 })).toBe('t1');
    });

    it('high reflection → t2', () => {
      expect(castVoice({ wonder: 0.3, reflection: 0.9, mischief: 0.1 })).toBe('t2');
    });

    it('balanced → t3', () => {
      expect(castVoice({ wonder: 0.5, reflection: 0.4, mischief: 0.4 })).toBe('t3');
    });

    it('high wonder + high reflection → t4', () => {
      expect(castVoice({ wonder: 0.9, reflection: 0.9, mischief: 0.1 })).toBe('t4');
    });

    it('stickiness: previous tier preferred if not materially further', () => {
      // Near the t2/t3 boundary — previous tier should stick
      const vector: PersonalityVector = { wonder: 0.48, reflection: 0.55, mischief: 0.35 };
      expect(castVoice(vector, 't2')).toBe('t2');
      expect(castVoice(vector, 't3')).toBe('t3');
    });

    it('stickiness broken when new centroid is 15%+ closer', () => {
      // Very close to t1 centroid, far from t2
      const vector: PersonalityVector = { wonder: 0.35, reflection: 0.15, mischief: 0.85 };
      expect(castVoice(vector, 't2')).toBe('t1');
    });
  });

  describe('computeMemoryDepth', () => {
    it('high mischief → light', () => {
      expect(computeMemoryDepth({ wonder: 0.3, reflection: 0.3, mischief: 0.7 })).toBe('light');
    });

    it('high reflection → deep', () => {
      expect(computeMemoryDepth({ wonder: 0.3, reflection: 0.7, mischief: 0.3 })).toBe('deep');
    });

    it('high wonder → medium', () => {
      expect(computeMemoryDepth({ wonder: 0.7, reflection: 0.3, mischief: 0.3 })).toBe('medium');
    });

    it('balanced (no dim > 0.6) → medium', () => {
      expect(computeMemoryDepth({ wonder: 0.5, reflection: 0.5, mischief: 0.5 })).toBe('medium');
    });

    it('multiple above 0.6: highest budget wins (reflection > wonder)', () => {
      expect(computeMemoryDepth({ wonder: 0.7, reflection: 0.8, mischief: 0.3 })).toBe('deep');
    });
  });

  describe('resolveThoughtFloor', () => {
    it('observation → t1', () => {
      expect(resolveThoughtFloor('observation')).toBe('t1');
    });
    it('reaction → t2', () => {
      expect(resolveThoughtFloor('reaction')).toBe('t2');
    });
    it('haiku → t2', () => {
      expect(resolveThoughtFloor('haiku')).toBe('t2');
    });
    it('non-thought request → null', () => {
      expect(resolveThoughtFloor(null)).toBeNull();
    });
  });

  describe('resolveTier', () => {
    // Helper: creates a minimal online tiers array
    const online = (...ids: TierId[]) => ids;

    it('all tiers available, voice picks freely', () => {
      const result = resolveTier({
        voicePreferred: 't2',
        thoughtFloor: null,
        contextFloor: null,
        onlineTiers: online('t1', 't2', 't3', 't4'),
        hints: {},
      });
      expect(result.targetTier).toBe('t2');
      expect(result.clamped).toBe(false);
    });

    it('thought floor raises t1 to t2 for haiku', () => {
      const result = resolveTier({
        voicePreferred: 't1',
        thoughtFloor: 't2',
        contextFloor: null,
        onlineTiers: online('t1', 't2', 't3', 't4'),
        hints: {},
      });
      expect(result.targetTier).toBe('t2');
      expect(result.clamped).toBe(true);
    });

    it('context floor overrides voice when memory needs bigger tier', () => {
      const result = resolveTier({
        voicePreferred: 't1',
        thoughtFloor: null,
        contextFloor: 't3',
        onlineTiers: online('t1', 't2', 't3', 't4'),
        hints: {},
      });
      expect(result.targetTier).toBe('t3');
      expect(result.clamped).toBe(true);
    });

    it('sparse availability: skips offline tiers', () => {
      const result = resolveTier({
        voicePreferred: 't2',
        thoughtFloor: 't2',
        contextFloor: null,
        onlineTiers: online('t1', 't3', 't4'), // t2 offline
        hints: {},
      });
      expect(result.targetTier).toBe('t3'); // closest available >= t2
    });

    it('no tier above floor: falls to highest available, marks trimmed', () => {
      const result = resolveTier({
        voicePreferred: 't4',
        thoughtFloor: 't3',
        contextFloor: null,
        onlineTiers: online('t1', 't2'), // t3, t4 offline
        hints: {},
      });
      expect(result.targetTier).toBe('t2');
      expect(result.trimmed).toBe(true);
    });

    it('hints.maxTier caps the ceiling', () => {
      const result = resolveTier({
        voicePreferred: 't4',
        thoughtFloor: null,
        contextFloor: null,
        onlineTiers: online('t1', 't2', 't3', 't4'),
        hints: { maxTier: 't2' },
      });
      expect(result.targetTier).toBe('t2');
      expect(result.clamped).toBe(true);
    });

    it('no tiers available returns null', () => {
      const result = resolveTier({
        voicePreferred: 't2',
        thoughtFloor: null,
        contextFloor: null,
        onlineTiers: [],
        hints: {},
      });
      expect(result.targetTier).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement router.ts**

Implement:
- `VOICE_CENTROIDS` — the 4 centroid vectors from spec
- `castVoice(vector, previousTier?)` — Euclidean distance + 15% stickiness
- `computeMemoryDepth(vector)` — >0.6 threshold mapping, highest budget wins on ties
- `computeContextFloor(memoryDepth, tierConfigs)` — find minimum tier whose `maxMemoryTokens` fits the budget
- `resolveThoughtFloor(thoughtType | null)` — observation→t1, reaction/haiku→t2, null→null
- `resolveTier({ voicePreferred, thoughtFloor, contextFloor, onlineTiers, hints })` — the full precedence formula: floor, ceiling, ideal, closestAvailable
- `routeRequest(request, registry, previousTier?)` — top-level orchestrator, returns `RoutePlan`

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/brain/router.ts test/brain/router.test.ts
git commit -m "feat(brain): router — voice caster, context scaler, tier precedence (SP6 task 3)"
```

---

## Task 4: Prepare — Prompt Building

**Files:**
- Create: `src/lib/server/brain/prepare.ts`
- Test: `test/brain/prepare.test.ts`

- [ ] **Step 1: Write tests for thought prompt preparation**

Test that `prepareThoughtPrompt()`:
- Calls memory retriever with correct caller (`'thoughts'`) and token budget from RoutePlan
- Returns a prompt string containing the thought type, environment, momentum, and memory fragments
- Returns a prompt without memory when retrieval fails (fail-open)
- Handles all 3 thought types (observation, reaction, haiku)

Test that `prepareManualPrompt()`:
- Calls memory retriever with caller `'prompt'`
- Uses `buildReflexPrompt()` when RoutePlan says `promptProfile: 'reflex'`
- Uses `assemblePrompt()` when RoutePlan says `promptProfile: 'full'`
- Appends user text after the system prompt

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement prepare.ts**

Implement:
- `prepareThoughtPrompt(request, plan, getState)` — memory retrieval with `Promise.race` 2s timeout, thought prompt builder (port prompt templates from `scripts/ollama-listener.js:buildPrompt()` + add memory fragment injection)
- `prepareManualPrompt(request, plan, getState)` — memory retrieval, read system prompt template, call `assemblePrompt()` or `buildReflexPrompt()`, substitute placeholders, append RAG + user text
- `preparePrompt(request, plan, getState)` — dispatcher that calls the right sub-function

Dependencies: imports `getMemoryProvider` from `../memory/index.js`, `assemblePrompt`/`buildReflexPrompt` from `../prompt/assembler.js`, `getState` callback for current BeauState values.

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/brain/prepare.ts test/brain/prepare.test.ts
git commit -m "feat(brain): prepare — thought + manual prompt building with memory (SP6 task 4)"
```

---

## Task 5: Executor — HTTP Calls + Fallback + Escalation

**Files:**
- Create: `src/lib/server/brain/executor.ts`
- Test: `test/brain/executor.test.ts`

- [ ] **Step 1: Write tests for successful execution**

Test `executeOnTier()`:
- Mock `fetch` returning Ollama JSON `{ response: "some text" }` → returns `{ text: "some text", generationMs }`
- SILENCE detection: response is "SILENCE" → returns `{ text: null }`
- Timeout: `fetch` hangs past `timeoutMs` → throws with timeout error
- Non-200 response → throws

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement executeOnTier()**

```typescript
export async function executeOnTier(
  prompt: string,
  config: TierConfig,
): Promise<{ text: string | null; model: string; generationMs: number }>
```

Uses `fetch` with `AbortSignal.timeout(config.timeoutMs)`. Calls `POST {config.endpoint}/api/generate` with `{ model: config.model, prompt, stream: false }`. Parses response, applies SILENCE detection (port `parseSilence()` from ollama-listener).

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Write tests for fallback chain**

Test `executeWithFallback()`:
- Primary succeeds → returns result, `fallback: false`
- Primary times out, upward fallback succeeds → returns result, `fallback: true`, `fallbackFrom: original tier`
- Primary fails, no alternate available → returns `{ text: null }` for thoughts
- Downward fallback → verify re-prepare is called (mock `preparePrompt`)

- [ ] **Step 6: Implement executeWithFallback()**

- [ ] **Step 7: Write tests for quality signals**

Test `checkQualitySignals()`:
- Short response (under 50% expected) → returns true
- Hedging markers → returns true
- Haiku without line break → returns true
- Normal response → returns false

- [ ] **Step 8: Implement checkQualitySignals()**

- [ ] **Step 9: Run all executor tests — expect PASS**

- [ ] **Step 10: Commit**

```bash
git add src/lib/server/brain/executor.ts test/brain/executor.test.ts
git commit -m "feat(brain): executor — HTTP calls, fallback, quality escalation (SP6 task 5)"
```

---

## Task 6: Dispatch Logging

**Files:**
- Create: `src/lib/server/brain/log.ts`
- Modify: `src/lib/server/db/schema.ts`
- Test: `test/brain/log.test.ts`

- [ ] **Step 1: Add columns to dispatches table in schema.ts**

Add to `dispatches` table in `src/lib/server/db/schema.ts`:
- `requestId: text('request_id')`
- `parentRequestId: text('parent_request_id')`
- `kind: text('kind')`
- `status: text('status')` — completed, silence, timeout, error
- `voicePreferred: text('voice_preferred')`
- `thoughtFloor: text('thought_floor')`
- `contextFloor: text('context_floor')`
- `highestAvailable: text('highest_available')`
- `clamped: integer('clamped', { mode: 'boolean' }).notNull().default(false)`
- `trimmed: integer('trimmed', { mode: 'boolean' }).notNull().default(false)`
- `fallbackFrom: text('fallback_from')`
- `qualityEscalatedFrom: text('quality_escalated_from')`

All new columns are nullable (except `clamped`, `trimmed`) for backward compatibility with existing rows.

- [ ] **Step 2: Write tests for logDispatch()**

Test that `logDispatch()` inserts a row with correct column mapping from RoutePlan + BrainResponse.

- [ ] **Step 3: Implement log.ts**

```typescript
export function logDispatch(params: {
  request: BrainRequestV1;
  plan: RoutePlan;
  response: BrainResponse;
  onlineTiers: TierId[];
}): void
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/db/schema.ts src/lib/server/brain/log.ts test/brain/log.test.ts
git commit -m "feat(brain): dispatch logging + schema migration (SP6 task 6)"
```

---

## Task 7: Topics + Timeout Updates

**Files:**
- Modify: `src/lib/server/mqtt/topics.ts`
- Modify: `src/lib/server/thoughts/types.ts`

- [ ] **Step 1: Update DISPATCH_TIERS in topics.ts**

Change `DISPATCH_TIERS` from `['reflex', 'philosopher', 'heavy']` to `['t1', 't2', 't3', 't4']`. Update `DispatchTier` type. Note: `TierId` in `brain/types.ts` is the canonical type going forward — `DispatchTier` from topics.ts is kept for backward compatibility but new code should import `TierId`.

Add new MQTT topics:
```typescript
brain: {
  dispatch: 'beau/brain/dispatch',
  availability: 'beau/brain/availability',
},
```

- [ ] **Step 2: Update GENERATION_TIMEOUT_MS in thoughts/types.ts**

Change from `30_000` to `50_000`.

- [ ] **Step 3: Fix any test referencing old tier names**

Run: `cd beau-terminal && npx vitest run` — check for failures related to `DISPATCH_TIERS` or `GENERATION_TIMEOUT_MS`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/mqtt/topics.ts src/lib/server/thoughts/types.ts
git commit -m "feat(brain): update DISPATCH_TIERS to 4 tiers, bump thought timeout to 50s (SP6 task 7)"
```

---

## Task 8: Public API — dispatch() + index.ts

**Files:**
- Create: `src/lib/server/brain/index.ts`
- Test: `test/brain/dispatch.test.ts`

- [ ] **Step 1: Write integration test for dispatch()**

Test the full `dispatch()` flow with mocked HTTP:
- `thought.generate` request → routes to correct tier based on personality vector → returns BrainResponse with text
- `manual.prompt` request → routes, builds prompt, calls Ollama → returns response
- All tiers offline → returns `{ text: null }` for thoughts
- Verify dispatch log is written

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement index.ts**

```typescript
export function initBrain(): void          // creates singleton registry, starts probing
export async function dispatch(request: BrainRequestV1): Promise<BrainResponse>
export function getBrainRegistry(): TierRegistry | null
```

`dispatch()` orchestrates: `routeRequest()` → `preparePrompt()` → `executeWithFallback()` → quality escalation check → `logDispatch()` → return response.

Hard cap: 45s `Promise.race` timeout wrapping the entire dispatch.

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/brain/index.ts test/brain/dispatch.test.ts
git commit -m "feat(brain): dispatch() public API + 45s hard cap (SP6 task 8)"
```

---

## Task 9: ThoughtDispatcher Refactor

**Files:**
- Modify: `src/lib/server/thoughts/dispatcher.ts`
- Modify: `test/thoughts/dispatcher.test.ts` (update existing tests)

- [ ] **Step 1: Add buildBrainRequest() tests**

Test that `buildBrainRequest()`:
- Returns a `BrainRequestV1` with `kind: 'thought.generate'`
- Populates `input.type`, `input.trigger`, `input.novelty`, `input.context`, `input.constraints` from the given thought type and state
- Uses `deriveTone()` for `constraints.tone`
- Uses `getTimeOfDay()` for `context.timeOfDay`

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Add buildBrainRequest() to ThoughtDispatcher**

Port the state-snapshot + context construction from `assembleRequest()` but return a `BrainRequestV1` instead of a `ThoughtRequest`. Remove memory retrieval (that's now in `brain/prepare.ts`).

- [ ] **Step 4: Remove assembleRequest()**

Delete `assembleRequest()` method. Update any tests that directly called it.

- [ ] **Step 5: Run all thought tests — expect PASS**

Run: `cd beau-terminal && npx vitest run test/thoughts/`

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/thoughts/dispatcher.ts test/thoughts/
git commit -m "refactor(thoughts): replace assembleRequest with buildBrainRequest for brain dispatch (SP6 task 9)"
```

---

## Task 10: Bridge Integration — Wire brain.dispatch()

**Files:**
- Modify: `src/lib/server/mqtt/bridge.ts`

This is the critical integration task. The thought dispatch path in bridge.ts (~lines 598-651) changes from MQTT publish to `brain.dispatch()`.

- [ ] **Step 1: Import and init brain in bridge.ts**

At the top of `connectMQTT()`, after personality engine setup (~line 596), add:
```typescript
import { initBrain, dispatch as brainDispatch } from '../brain/index.js';
initBrain();
```

- [ ] **Step 2: Replace thought dispatch path**

Replace the thought dispatch block (~lines 613-636):

**Before:** `assembleRequest()` → `enqueue()` → MQTT publish → (later) MQTT result handler
**After:** `buildBrainRequest()` → `enqueue()` → `brainDispatch()` → `receiveResult()` inline

```typescript
// In the pressure tick handler:
if (thoughtType) {
  isDispatching = true;
  const dispatchState = { ...state };
  (async () => {
    try {
      const brainRequest = thoughtDispatcher.buildBrainRequest(thoughtType, dispatchState, trigger, isNovelty);
      thoughtQueue.enqueue({
        id: brainRequest.requestId,
        type: brainRequest.input.type,
        trigger: brainRequest.input.trigger,
        contextJson: JSON.stringify(brainRequest.input),
        expiresAt: thoughtDispatcher.computeExpiresAt(brainRequest.input.type),
        novelty: brainRequest.input.novelty,
      });
      const response = await brainDispatch(brainRequest);
      thoughtQueue.receiveResult({
        id: brainRequest.requestId,
        text: response.text,
        generatedAt: new Date().toISOString(),
        model: response.model,
        generationMs: response.generationMs,
      });
      // Update state
      state = {
        ...state,
        pendingThoughtCount: thoughtQueue.pendingCount(),
        pendingThoughtType: thoughtQueue.getReadyThoughtType(),
      };
      broadcast();
      pressureEngine.resetAfterDispatch();
    } catch (e) {
      console.error('[thoughts] dispatch failed:', e);
    } finally {
      isDispatching = false;
    }
  })();
}
```

- [ ] **Step 3: Keep MQTT result handler as fallback**

The `case TOPICS.thoughts.result:` handler at ~line 897 stays but add a comment: `// Legacy: kept for external consumers (ollama-listener). Primary path now uses brain.dispatch().`

- [ ] **Step 4: Run existing tests to verify no regressions**

Run: `cd beau-terminal && npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/mqtt/bridge.ts
git commit -m "feat(brain): wire brain.dispatch() into thought pressure loop (SP6 task 10)"
```

---

## Task 11: Prompt Console Integration

**Files:**
- Modify: `src/routes/prompt/+page.server.ts`

- [ ] **Step 1: Add `dispatch` action**

Add a new form action alongside the existing `send`:

```typescript
dispatch: async ({ request }) => {
  const form = await request.formData();
  const content = (form.get('content') as string)?.trim();
  const label = (form.get('label') as string)?.trim() || '';
  if (!content) return fail(400, { error: 'content required' });

  const { dispatch: brainDispatch } = await import('$lib/server/brain/index.js');
  const { makeManualRequest } = await import('$lib/server/brain/types.js');

  const brainRequest = makeManualRequest({ text: content, label });
  const response = await brainDispatch(brainRequest);

  // Save to history
  db.insert(promptHistory).values({
    content: `[brain/${response.tier}] ${content}`,
    label,
    createdAt: new Date(),
  }).run();

  return { success: true, response: response.text, tier: response.tier, model: response.model };
},
```

- [ ] **Step 2: Keep existing `send` action unchanged**

The raw MQTT `send` action stays for direct topic publishing. The new `dispatch` action is the brain-routed path.

- [ ] **Step 3: Minimal UI wiring in +page.svelte**

Add display for `form?.response` and `form?.tier` in the prompt console page so the operator can see the brain response. A simple `{#if form?.response}` block with the response text and tier badge below the form.

- [ ] **Step 4: Commit**

```bash
git add src/routes/prompt/+page.server.ts
git commit -m "feat(brain): add dispatch action to prompt console (SP6 task 11)"
```

---

## Task 12: Startup Wiring + Hooks

**Files:**
- Modify: `src/hooks.server.ts` (if brain init isn't already triggered by bridge)

- [ ] **Step 1: Verify brain initializes on startup**

`initBrain()` is called inside `connectMQTT()` (task 10). Verify that the health probe loop starts when the terminal boots. Check by running the dev server:

Run: `cd beau-terminal && npm run dev`

Look for console output like `[brain] TierRegistry probing started` and `[brain] t2: online (gemma3:4b)`.

- [ ] **Step 2: If Ollama is running, verify a thought dispatches through brain**

Wait for a thought to fire (or lower `PRESSURE_TICK_MS` temporarily), check that the dispatch log shows a `requestId` and tier selection.

- [ ] **Step 3: Commit if any startup wiring changes were needed**

---

## Task 13: Integration Tests — Real Ollama Round-Trip

**Files:**
- Test: `test/brain/integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// test/brain/integration.test.ts
import { describe, it, expect } from 'vitest';
import { dispatch, initBrain, getBrainRegistry } from '../../src/lib/server/brain/index.js';
import { makeThoughtRequest } from '../../src/lib/server/brain/types.js';

describe('brain integration (requires Ollama)', () => {
  it('dispatches a thought to a real Ollama endpoint', async () => {
    initBrain();
    const registry = getBrainRegistry()!;
    // Wait for first probe
    await new Promise(r => setTimeout(r, 2000));

    const online = registry.getOnlineTiers();
    if (online.length === 0) {
      console.warn('Skipping: no Ollama tiers online');
      return;
    }

    const request = makeThoughtRequest({
      type: 'observation',
      trigger: 'test',
      novelty: false,
      context: {
        vector: { wonder: 0.5, reflection: 0.3, mischief: 0.5 },
        mode: 'ambient',
        timeOfDay: 'evening',
        environment: 'test environment',
        momentum: 'present and quiet',
      },
      constraints: { maxLength: 30, tone: 'present' },
    });

    const response = await dispatch(request);
    expect(response.requestId).toBe(request.requestId);
    expect(response.tier).toBeTruthy();
    expect(response.generationMs).toBeGreaterThan(0);
    // text can be null (SILENCE) — that's valid
    registry.stopProbing();
  }, 60_000);
});
```

- [ ] **Step 2: Run integration test (requires Ollama running)**

Run: `cd beau-terminal && OLLAMA_MODEL=gemma3:4b npx vitest run test/brain/integration.test.ts`

- [ ] **Step 3: Commit**

```bash
git add test/brain/integration.test.ts
git commit -m "test(brain): integration test — real Ollama round-trip (SP6 task 13)"
```

---

## Task 14: Seed + Documentation Sync

**Files:**
- Modify: `src/lib/server/db/seed.ts` — add SP6 phase (phase 14: Brain Dispatcher) with steps seeded as done
- Modify: `docs/reference.md` — update Brain Routing section, add `beau/brain/*` MQTT topics, update dispatches table docs

- [ ] **Step 1: Add SP6 phase to seed**

Add phase 14: "Brain Dispatcher" with steps matching this plan's tasks (t1-t13), all marked `done: true`.

- [ ] **Step 2: Update reference.md**

- Update Brain Routing section with 4-tier model (t1-t4)
- Add `beau/brain/dispatch` and `beau/brain/availability` to MQTT topic table
- Update dispatches table column list in Database Schema section

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/db/seed.ts docs/reference.md
git commit -m "docs: seed SP6 phase + update reference.md for brain dispatcher (SP6 task 14)"
```

---

## Task 15: Full Test Suite + Final Verification

- [ ] **Step 1: Run full test suite**

Run: `cd beau-terminal && npx vitest run`

Expect all existing tests + new brain tests to pass.

- [ ] **Step 2: Run dev server and verify end-to-end**

Run: `cd beau-terminal && npm run dev`

Verify:
- TierRegistry probes on startup and logs tier statuses
- Thoughts dispatch through brain (check dispatch table for new columns)
- Prompt console `dispatch` action works
- No console errors

- [ ] **Step 3: Final commit if any fixes needed**
