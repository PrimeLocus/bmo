# Pending Thoughts + Haiku Dispatch — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Beau autonomous unprompted thought generation — observations, reactions, and haiku — via a pressure-accumulation model, MQTT round-trip generation, and a priority queue with decay.

**Architecture:** Thought pressure accumulates from personality vector, novelty detection, and time. When pressure crosses a randomized threshold, a thought request is published via MQTT. A standalone Ollama listener generates text and publishes the result back. Thoughts enter a priority queue, surface through BmoFace glow overlay + SpeechBubble, and decay if unheard.

**Tech Stack:** SvelteKit 2 / Svelte 5, better-sqlite3 + Drizzle ORM, MQTT.js, Ollama HTTP API, Vitest

**Spec:** `docs/superpowers/specs/2026-03-23-pending-thoughts-haiku-dispatch-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/server/thoughts/types.ts` | TypeScript interfaces: ThoughtRequest, ThoughtResult, ThoughtType, PressureState, config constants |
| `src/lib/server/thoughts/pressure.ts` | Pressure accumulator: sources, drains, threshold, novelty detection, tick evaluation |
| `src/lib/server/thoughts/dispatcher.ts` | Type selection logic, request payload assembly, MQTT publish |
| `src/lib/server/thoughts/queue.ts` | Priority queue, decay timers, lifecycle transitions, budget tracking, DB persistence |
| `src/lib/server/thoughts/pressure.test.ts` | Pressure engine unit tests |
| `src/lib/server/thoughts/dispatcher.test.ts` | Dispatcher + type selection tests |
| `src/lib/server/thoughts/queue.test.ts` | Queue lifecycle, decay, budget tests |
| `src/lib/server/thoughts/index.ts` | Singleton accessor for thought system components (queue, pressure, dispatcher, publishSurfaced) |
| `src/lib/widgets/terminal/PendingThoughtsWidget.svelte` | Diagnostic widget — pressure, queue, surfaced/decayed history |
| `scripts/ollama-listener.js` | Standalone MQTT → Ollama → MQTT listener |
| `scripts/package.json` | Minimal deps for ollama-listener (mqtt package) |
| `scripts/ollama-listener.test.js` | Listener prompt construction + SILENCE detection tests |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/server/db/schema.ts` | Add `pendingThoughts` table definition |
| `src/lib/server/mqtt/topics.ts` | Add `thoughts` topic group + add result topic to `SUBSCRIBE_TOPICS` |
| `src/lib/server/mqtt/bridge.ts` | Import thought system, instantiate, wire to personality engine tick, subscribe to results, extend BeauState |
| `src/lib/server/face-state.ts` | Add `resolveGlowWithOverlay()` function, export thought overlay configs |
| `src/lib/stores/beau.svelte.ts` | Add thought fields to defaultState |
| `src/lib/widgets/registry.ts` | Register PendingThoughtsWidget (#48) |
| `src/lib/server/widgets/loaders.ts` | Add `pending-thoughts` case |
| `src/lib/components/BmoFace.svelte` | Add glow overlay CSS + click handler for thought surfacing |
| `src/lib/components/StatusBar.svelte` | Support `duration` field in `bmo:react` event detail |
| `src/hooks.server.ts` | Initialize thought system on startup |

---

## Task 1: Types + Constants

**Files:**
- Create: `src/lib/server/thoughts/types.ts`

- [ ] **Step 1: Create the types file with all interfaces and constants**

```typescript
// src/lib/server/thoughts/types.ts

/**
 * TODO-B: EXTRACTION TARGET — Pi Thought Service
 * This module defines the thought system types and tuning constants.
 * When the Pi is assembled, extract alongside personality engine.
 * See: docs/bible/beaus-bible.md §44, §54
 */

export const THOUGHT_TYPES = ['observation', 'reaction', 'haiku'] as const;
export type ThoughtType = (typeof THOUGHT_TYPES)[number];

export const THOUGHT_STATUSES = [
  'requested', 'generating', 'pending', 'ready',
  'surfaced', 'decayed', 'dropped',
] as const;
export type ThoughtStatus = (typeof THOUGHT_STATUSES)[number];

export interface ThoughtRequest {
  id: string;
  type: ThoughtType;
  trigger: string;
  context: {
    vector: { wonder: number; reflection: number; mischief: number };
    mode: string;
    timeOfDay: string;
    environment: string;
    recentActivity: string;
    momentum: string;
  };
  constraints: {
    maxLength: number;
    tone: string;
  };
  requestedAt: string;
  novelty: boolean;
}

export interface ThoughtResult {
  id: string;
  text: string | null;
  generatedAt: string;
  model: string;
  generationMs: number;
}

export interface PressureState {
  value: number;
  lastSurfacedAt: number | null;
  cooldownUntil: number | null;
  baselines: Record<string, number>;
  baselineInitialized: Record<string, boolean>;
}

export interface DailyBudgetStatus {
  surfacedToday: number;
  haikuToday: number;
  atHaikuCap: boolean;
  atTotalCap: boolean;
}

// ── Tuning constants (all exported, all overridable) ──

export const PRESSURE_TICK_MS = 5000;
export const BASE_THRESHOLD = 0.7;
export const THRESHOLD_VARIANCE = 0.2;
export const NOVELTY_SPIKE_PROBABILITY = 0.04;
export const NOVELTY_DEVIATION_THRESHOLD = 0.3;
export const COOLDOWN_MS = 1_800_000;           // 30 minutes
export const MAX_QUEUE_SIZE = 5;
export const MAX_DAILY_HAIKU = 3;
export const MAX_DAILY_THOUGHTS = 5;
export const DECAY_TTL_OBSERVATION_MS = 10_800_000;  // 3 hours
export const DECAY_TTL_REACTION_MS = 36_000_000;     // 10 hours
export const DECAY_TTL_HAIKU_MS = 86_400_000;        // 24 hours
export const DECAY_VARIANCE = 0.2;
export const GENERATION_TIMEOUT_MS = 30_000;
export const SLEEP_ACCUMULATION_RATE = 0.1;
export const HAIKU_WINDOW_MULTIPLIER = 3.0;

// Novelty baseline floors per sensor (prevent divide-by-zero)
export const NOVELTY_MIN_BASELINES: Record<string, number> = {
  lux: 1.0,
  presenceCount: 0.5,
  micLevel: 0.1,
};

// Priority values (higher = more important)
export const PRIORITY: Record<ThoughtType, number> = {
  haiku: 30,
  reaction: 20,
  observation: 10,
};

// Haiku time windows [startHour, endHour] (24h, local time)
export const HAIKU_WINDOWS: [number, number][] = [
  [5, 7],    // dawn
  [18, 20],  // dusk
  [23, 25],  // midnight (25 = 1am next day, handled via modulo)
];

// Decay TTL per type
export const DECAY_TTL: Record<ThoughtType, number> = {
  observation: DECAY_TTL_OBSERVATION_MS,
  reaction: DECAY_TTL_REACTION_MS,
  haiku: DECAY_TTL_HAIKU_MS,
};
```

- [ ] **Step 2: Verify it compiles**

Run: `cd beau-terminal && npx tsc --noEmit src/lib/server/thoughts/types.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/thoughts/types.ts
git commit -m "feat(thoughts): types and tuning constants — SP4 task 1"
```

---

## Task 2: Database Schema

**Files:**
- Modify: `src/lib/server/db/schema.ts`

- [ ] **Step 1: Add `pendingThoughts` table to schema.ts**

Add at the end of the file (after the last table definition):

```typescript
export const pendingThoughts = sqliteTable('pending_thoughts', {
  id:            text('id').primaryKey(),
  type:          text('type').notNull(),
  trigger:       text('trigger').notNull(),
  text:          text('text'),
  status:        text('status').notNull(),
  priority:      integer('priority').notNull(),
  contextJson:   text('context_json').notNull(),
  createdAt:     text('created_at').notNull().default(sql`(datetime('now'))`),
  generatedAt:   text('generated_at'),
  surfacedAt:    text('surfaced_at'),
  expiresAt:     text('expires_at').notNull(),
  novelty:       integer('novelty').notNull().default(0),
  model:         text('model'),
  generationMs:  integer('generation_ms'),
});
```

- [ ] **Step 2: Verify the dev server starts (Drizzle auto-migrates)**

Run: `cd beau-terminal && npm run dev`
Expected: Server starts on port 4242, no migration errors in console. The `pending_thoughts` table is created automatically.

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/db/schema.ts
git commit -m "feat(thoughts): pending_thoughts table schema — SP4 task 2"
```

---

## Task 3: MQTT Topics

**Files:**
- Modify: `src/lib/server/mqtt/topics.ts`

- [ ] **Step 1: Add thoughts topic group to TOPICS object**

After the `security` group (line 59), add:

```typescript
  thoughts: {
    request: 'beau/thoughts/request',
    result: 'beau/thoughts/result',
    pending: 'beau/thoughts/pending',
    surfaced: 'beau/thoughts/surfaced',
    pressure: 'beau/thoughts/pressure',
  },
```

- [ ] **Step 2: Add result topic to SUBSCRIBE_TOPICS array**

After the `TOPICS.security.stranger` entry, add:

```typescript
  // Phase 7 — thoughts
  TOPICS.thoughts.result,
```

- [ ] **Step 3: Verify existing tests still pass**

Note: `ThoughtType` and `ThoughtStatus` are defined in `src/lib/server/thoughts/types.ts` (Task 1) — they are NOT added to `topics.ts`. The `types.ts` file is the single source of truth for thought system types. `topics.ts` only holds MQTT topic strings and subscribe arrays.

Run: `cd beau-terminal && npx vitest run`
Expected: All existing tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/mqtt/topics.ts
git commit -m "feat(thoughts): MQTT topic constants + SUBSCRIBE_TOPICS — SP4 task 3"
```

---

## Task 4: Thought Queue

**Files:**
- Create: `src/lib/server/thoughts/queue.ts`
- Test: `src/lib/server/thoughts/queue.test.ts`

- [ ] **Step 1: Write queue tests**

```typescript
// src/lib/server/thoughts/queue.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThoughtQueue } from './queue.js';

// Mock drizzle DB — we test queue logic in isolation
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  all: vi.fn().mockReturnValue([]),
  get: vi.fn().mockReturnValue(null),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  run: vi.fn(),
};

describe('ThoughtQueue', () => {
  let queue: ThoughtQueue;

  beforeEach(() => {
    queue = new ThoughtQueue(mockDb as any);
    vi.clearAllMocks();
  });

  it('enqueues a thought with correct priority', () => {
    const thought = queue.enqueue({
      id: 't1', type: 'haiku', trigger: 'dusk',
      contextJson: '{}', expiresAt: new Date(Date.now() + 86400000).toISOString(),
      novelty: false,
    });
    expect(thought.priority).toBe(30); // haiku priority
    expect(thought.status).toBe('requested');
  });

  it('enforces max queue size by dropping lowest priority', () => {
    // Fill queue with 5 observations
    for (let i = 0; i < 5; i++) {
      queue.enqueue({
        id: `obs${i}`, type: 'observation', trigger: 'lux',
        contextJson: '{}', expiresAt: new Date(Date.now() + 3600000).toISOString(),
        novelty: false,
      });
    }
    expect(queue.size()).toBe(5);

    // Adding a haiku should drop the oldest observation
    queue.enqueue({
      id: 'h1', type: 'haiku', trigger: 'dusk',
      contextJson: '{}', expiresAt: new Date(Date.now() + 86400000).toISOString(),
      novelty: false,
    });
    expect(queue.size()).toBe(5);
    expect(queue.has('h1')).toBe(true);
  });

  it('promotes highest priority to ready (single slot)', () => {
    queue.enqueue({
      id: 'obs1', type: 'observation', trigger: 'lux',
      contextJson: '{}', expiresAt: new Date(Date.now() + 3600000).toISOString(),
      novelty: false,
    });
    queue.receiveResult({ id: 'obs1', text: 'The light shifted.', generatedAt: new Date().toISOString(), model: 'gemma3', generationMs: 500 });

    queue.enqueue({
      id: 'h1', type: 'haiku', trigger: 'dusk',
      contextJson: '{}', expiresAt: new Date(Date.now() + 86400000).toISOString(),
      novelty: false,
    });
    queue.receiveResult({ id: 'h1', text: 'dusk falls gently here', generatedAt: new Date().toISOString(), model: 'gemma3', generationMs: 800 });

    const ready = queue.getReady();
    expect(ready?.id).toBe('h1'); // haiku has higher priority
  });

  it('decays expired thoughts', () => {
    queue.enqueue({
      id: 'old', type: 'observation', trigger: 'lux',
      contextJson: '{}', expiresAt: new Date(Date.now() - 1000).toISOString(), // already expired
      novelty: false,
    });
    queue.receiveResult({ id: 'old', text: 'gone', generatedAt: new Date().toISOString(), model: 'gemma3', generationMs: 100 });

    queue.runDecay();
    expect(queue.getByStatus('decayed')).toHaveLength(1);
  });

  it('drops thoughts stuck in requested state past generation timeout', () => {
    // Manually set createdAt to 60s ago
    const thought = queue.enqueue({
      id: 'stuck', type: 'observation', trigger: 'test',
      contextJson: '{}', expiresAt: new Date(Date.now() + 3600000).toISOString(),
      novelty: false,
    });
    // Simulate time passing by backdating
    thought.createdAt = new Date(Date.now() - 60_000).toISOString();

    queue.runDecay(); // also checks generation timeouts
    expect(queue.get('stuck')?.status).toBe('dropped');
  });

  it('handles SILENCE result (text: null) by dropping', () => {
    queue.enqueue({
      id: 'silent', type: 'haiku', trigger: 'dusk',
      contextJson: '{}', expiresAt: new Date(Date.now() + 86400000).toISOString(),
      novelty: false,
    });
    queue.receiveResult({ id: 'silent', text: null, generatedAt: new Date().toISOString(), model: 'gemma3', generationMs: 200 });
    expect(queue.get('silent')?.status).toBe('dropped');
  });

  it('surfaces a thought and returns it', () => {
    queue.enqueue({
      id: 'surf', type: 'reaction', trigger: 'feeling',
      contextJson: '{}', expiresAt: new Date(Date.now() + 36000000).toISOString(),
      novelty: false,
    });
    queue.receiveResult({ id: 'surf', text: 'I like the rain.', generatedAt: new Date().toISOString(), model: 'gemma3', generationMs: 300 });

    const surfaced = queue.surface();
    expect(surfaced?.text).toBe('I like the rain.');
    expect(surfaced?.status).toBe('surfaced');
  });

  it('pendingCount returns count of active thoughts', () => {
    expect(queue.pendingCount()).toBe(0);
    queue.enqueue({
      id: 'p1', type: 'observation', trigger: 'lux',
      contextJson: '{}', expiresAt: new Date(Date.now() + 3600000).toISOString(),
      novelty: false,
    });
    expect(queue.pendingCount()).toBe(1);
  });

  it('getReadyThoughtType returns type when ready, null when empty', () => {
    expect(queue.getReadyThoughtType()).toBeNull();

    queue.enqueue({
      id: 'r1', type: 'reaction', trigger: 'mood',
      contextJson: '{}', expiresAt: new Date(Date.now() + 36000000).toISOString(),
      novelty: false,
    });
    queue.receiveResult({ id: 'r1', text: 'warm tonight', generatedAt: new Date().toISOString(), model: 'gemma3', generationMs: 250 });

    expect(queue.getReadyThoughtType()).toBe('reaction');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/thoughts/queue.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ThoughtQueue**

Create `src/lib/server/thoughts/queue.ts` implementing:
- In-memory `Map<string, PendingThought>` backed by DB writes
- `enqueue()` — inserts with computed priority, enforces MAX_QUEUE_SIZE (drops lowest priority)
- `receiveResult()` — matches by ID, handles null text (SILENCE → dropped), transitions to pending
- `getReady()` — returns highest-priority pending thought, promotes to ready
- `surface()` — transitions ready → surfaced, sets surfacedAt
- `runDecay()` — expires thoughts past TTL, drops requested past GENERATION_TIMEOUT_MS
- `getDailyBudgetStatus()` — authoritative budget check with `datetime(surfaced_at, 'localtime')`
- `getReadyThoughtType()` — returns type of ready thought or null
- `pendingCount()` — returns count of thoughts in active states (requested/generating/pending/ready), used by bridge for BeauState
- `getByStatus()`, `get()`, `has()`, `size()` — accessors

All DB writes go through Drizzle `insert`/`update` on `pendingThoughts` table. The in-memory map is the primary data structure; DB is persistence backup loaded on construction.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/thoughts/queue.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/thoughts/queue.ts src/lib/server/thoughts/queue.test.ts
git commit -m "feat(thoughts): priority queue with decay + budget tracking — SP4 task 4"
```

---

## Task 5: Pressure Engine

**Files:**
- Create: `src/lib/server/thoughts/pressure.ts`
- Test: `src/lib/server/thoughts/pressure.test.ts`

- [ ] **Step 1: Write pressure engine tests**

Test cases:
- Pressure accumulates from vector magnitude (higher vector = faster accumulation)
- Pressure drains during sleep state (SLEEP_ACCUMULATION_RATE multiplier)
- Pressure resets partially after cooldown trigger
- Cooldown period blocks accumulation
- Novelty spike fires at configured probability (use seeded RNG)
- Novelty detection: sensor deviation above threshold triggers spike
- Novelty baseline floor prevents divide-by-zero (lux=0 scenario)
- Baseline EMA initializes from first reading, not zero
- Threshold crossing uses base + random variance
- Time-since-last-surfaced contribution follows exponential curve (capped)
- `shouldDispatch()` returns false when daily budget exhausted
- `shouldDispatch()` returns false during cooldown
- Activity transition events add discrete pressure spikes

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/thoughts/pressure.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement PressureEngine**

Create `src/lib/server/thoughts/pressure.ts`:
- `PressureEngine` class with `tick(state, sleepState, getDailyBudget)` method
- Internal `PressureState` with value, baselines, cooldown tracking
- `updateBaseline(sensor, value)` — EMA with min-baseline floors
- `computeNoveltySpike(sensor, value)` — deviation detection
- `shouldDispatch(rng?)` — threshold check with variance, budget gate, cooldown gate
- `resetAfterDispatch()` — partial pressure drain + cooldown start
- `notifySurfaced()` — full cooldown start after thought surfaces
- Accept optional seeded RNG function for deterministic testing

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/thoughts/pressure.test.ts`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/thoughts/pressure.ts src/lib/server/thoughts/pressure.test.ts
git commit -m "feat(thoughts): pressure accumulation engine with novelty detection — SP4 task 5"
```

---

## Task 6: Dispatcher

**Files:**
- Create: `src/lib/server/thoughts/dispatcher.ts`
- Test: `src/lib/server/thoughts/dispatcher.test.ts`

- [ ] **Step 1: Write dispatcher tests**

Test cases:
- Type selection: haiku when in time window + reflection > 0.5 + budget available
- Type selection: observation when specific sensor trigger present
- Type selection: reaction as default
- Novelty type weighting: 60% reaction, 30% haiku, 10% observation (use seeded RNG)
- Request payload construction: correct fields, interpreter output in momentum
- Tone derivation from vector (high reflection → 'contemplative', high mischief → 'wry', etc.)
- Time-of-day labeling ('late night', 'early morning', 'afternoon', etc.)
- Haiku window detection (5-7am, 6-8pm, 11pm-1am with midnight wrap)
- Decay TTL computation with ±20% variance
- Budget gate: returns null when atTotalCap or (haiku && atHaikuCap)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/thoughts/dispatcher.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement ThoughtDispatcher**

Create `src/lib/server/thoughts/dispatcher.ts`:
- `selectType(state, budget, trigger, isNovelty, rng?)` — type selection logic
- Constructor takes a `getInterpretation: () => string` callback (injected from bridge.ts to avoid circular dependency with personality engine)
- `assembleRequest(type, state, trigger, isNovelty)` — builds ThoughtRequest payload, calls `getInterpretation()` for the `momentum` field
- `getTimeOfDay(hour)` — returns label string
- `deriveTone(vector)` — maps dominant dimension to tone string
- `isInHaikuWindow(hour)` — checks against HAIKU_WINDOWS with midnight wrap: for `[23, 25]`, check `hour >= 23 || hour < (25 % 24)`. Hours 23, 0, and 1 should all return true. Test cases must cover `isInHaikuWindow(0)` and `isInHaikuWindow(1)` returning true.
- `computeExpiresAt(type)` — base TTL × (1 ± DECAY_VARIANCE random)
- Uses `personalityEngine.getInterpretation()` for momentum field
- Uses nanoid for request IDs

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/thoughts/dispatcher.test.ts`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/thoughts/dispatcher.ts src/lib/server/thoughts/dispatcher.test.ts
git commit -m "feat(thoughts): type selection + request assembly dispatcher — SP4 task 6"
```

---

## Task 7: Bridge Integration

**Files:**
- Modify: `src/lib/server/mqtt/bridge.ts`
- Modify: `src/lib/stores/beau.svelte.ts`

- [ ] **Step 1: Extend BeauState type in bridge.ts**

Add to the `BeauState` type definition (after the face state fields):

```typescript
  // ── Thought System ──
  thoughtPressure: number;
  pendingThoughtCount: number;
  pendingThoughtType: string | null;
  lastThoughtText: string | null;
  lastThoughtAt: string | null;
```

- [ ] **Step 2: Add default values in beau.svelte.ts**

Add to `defaultState` (after the `glow` field):

```typescript
  // ── Thought System ──
  thoughtPressure: 0,
  pendingThoughtCount: 0,
  pendingThoughtType: null,
  lastThoughtText: null,
  lastThoughtAt: null,
```

- [ ] **Step 3: Import and instantiate thought system in bridge.ts**

At the top of bridge.ts, add imports:

```typescript
import { PressureEngine } from '../thoughts/pressure.js';
import { ThoughtDispatcher } from '../thoughts/dispatcher.js';
import { ThoughtQueue } from '../thoughts/queue.js';
import { pendingThoughts } from '../db/schema.js';
import { PRESSURE_TICK_MS } from '../thoughts/types.js';
```

Inside `connectMQTT()`, after the personality engine setup:

```typescript
  // ── Thought System ──
  const thoughtQueue = new ThoughtQueue(db);
  const pressureEngine = new PressureEngine();
  const thoughtDispatcher = new ThoughtDispatcher(() => personalityEngine.getInterpretation());
```

- [ ] **Step 4: Wire thought pressure tick on its own interval**

The pressure engine must tick independently of the personality engine's `onVectorChange` callback. `onVectorChange` only fires when the personality vector changes significantly — but pressure should accumulate even during stable, quiet periods (that's when thoughts are most likely to form). Set up a separate `setInterval` inside `connectMQTT()`, after the personality engine setup:

```typescript
    // ── Thought pressure tick ──
    const budget = thoughtQueue.getDailyBudgetStatus();
    pressureEngine.tick(state, state.sleepState, budget);

    if (pressureEngine.shouldDispatch()) {
      const trigger = pressureEngine.getLastTrigger();
      const isNovelty = pressureEngine.wasNoveltySpike();
      const thoughtType = thoughtDispatcher.selectType(state, budget, trigger, isNovelty);
      if (thoughtType) {
        const request = thoughtDispatcher.assembleRequest(thoughtType, state, trigger, isNovelty);
        thoughtQueue.enqueue({
          id: request.id,
          type: request.type,
          trigger: request.trigger,
          contextJson: JSON.stringify(request),
          expiresAt: thoughtDispatcher.computeExpiresAt(request.type),
          novelty: request.novelty,
        });
        if (_publish) {
          _publish(TOPICS.thoughts.request, JSON.stringify(request));
        }
        pressureEngine.resetAfterDispatch();
      }
    }

    // Run decay + generation timeout checks
    thoughtQueue.runDecay();

    // Update state with thought system info
    state = {
      ...state,
      thoughtPressure: pressureEngine.getValue(),
      pendingThoughtCount: thoughtQueue.pendingCount(),
      pendingThoughtType: thoughtQueue.getReadyThoughtType(),
    };
```

- [ ] **Step 5: Handle incoming thought results via MQTT**

In the `client.on('message')` switch block, add a case for the result topic:

```typescript
    case TOPICS.thoughts.result: {
      try {
        const result = JSON.parse(msg) as ThoughtResult;
        thoughtQueue.receiveResult(result);
        // If there's now a ready thought, update glow
        const readyType = thoughtQueue.getReadyThoughtType();
        state = {
          ...state,
          pendingThoughtCount: thoughtQueue.pendingCount(),
          pendingThoughtType: readyType,
        };
        broadcast();
      } catch (e) {
        console.error('[thoughts] failed to parse result:', e);
      }
      break;
    }
```

- [ ] **Step 6: Update the resolveGlow calls to pass thought overlay**

In `updateFaceState()` and the `onVectorChange` callback, change `resolveGlow(faceState)` to:

```typescript
    const glow = resolveGlowWithOverlay(faceState, thoughtQueue.getReadyThoughtType());
```

Import `resolveGlowWithOverlay` from `'../face-state.js'` (created in Task 8).

- [ ] **Step 7: Verify the dev server starts**

Run: `cd beau-terminal && npm run dev`
Expected: Server starts, no errors. Thought system initializes silently.

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/mqtt/bridge.ts src/lib/stores/beau.svelte.ts
git commit -m "feat(thoughts): bridge integration — pressure tick, MQTT result handler, BeauState — SP4 task 7"
```

---

## Task 8: Face State Glow Overlay

**Files:**
- Modify: `src/lib/server/face-state.ts`

- [ ] **Step 1: Add thought overlay config and resolveGlowWithOverlay function**

After the existing `resolveGlow` function, add:

```typescript
// Thought overlay glow configs (additive, independent of face state)
export const THOUGHT_OVERLAY_CONFIG: Record<string, { color: string; animation: string; duration: string }> = {
  observation: { color: 'rgba(0, 229, 160, 0.15)',   animation: 'thoughtsteady',  duration: '3s' },
  reaction:    { color: 'rgba(255, 215, 0, 0.12)',    animation: 'thoughtpulse',   duration: '2.5s' },
  haiku:       { color: 'rgba(110, 198, 255, 0.15)',  animation: 'thoughtrhythm',  duration: '4s' },
};

export function resolveGlowWithOverlay(
  faceState: FaceState,
  thoughtType: string | null,
): { color: string; animation: string; duration: string; overlay?: { color: string; animation: string; duration: string } } {
  const base = GLOW_CONFIG[faceState];
  if (!thoughtType || !(thoughtType in THOUGHT_OVERLAY_CONFIG)) {
    return base;
  }
  return { ...base, overlay: THOUGHT_OVERLAY_CONFIG[thoughtType] };
}
```

- [ ] **Step 2: Update BeauState glow type in bridge.ts**

The `glow` field in BeauState gains an optional `overlay` property. Update the type:

```typescript
  glow: { color: string; animation: string; duration: string; overlay?: { color: string; animation: string; duration: string } };
```

And the default in `beau.svelte.ts`:

```typescript
  glow: { color: 'rgba(0, 229, 160, 0.25)', animation: 'slowpulse', duration: '4s' },
```

(No change needed to default — overlay is optional and absent by default.)

- [ ] **Step 3: Verify existing face state tests pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/face-state`
Expected: All existing tests pass

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/face-state.ts
git commit -m "feat(thoughts): glow overlay system for thought-pending indicator — SP4 task 8"
```

---

## Task 9: BmoFace Click + Overlay CSS

**Files:**
- Modify: `src/lib/components/BmoFace.svelte`

- [ ] **Step 1: Add thought overlay CSS animations**

In the `<style>` block of BmoFace.svelte, add:

```css
/* Thought overlay — additive glow layer */
@keyframes thoughtsteady {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}
@keyframes thoughtpulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
@keyframes thoughtrhythm {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  33% { opacity: 0.9; transform: scale(1.02); }
  66% { opacity: 0.6; transform: scale(0.99); }
}
.glow-thought-overlay {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: 1;
}
```

- [ ] **Step 2: Add overlay div + click handler**

In the template, add the overlay div (conditionally rendered when `beauState.pendingThoughtType` is set) and a click handler on the face container that dispatches a `bmo:thought-surface` event:

```svelte
{#if beauState.pendingThoughtType && beauState.glow?.overlay}
  <div
    class="glow-thought-overlay"
    style="box-shadow: 0 0 20px 6px {beauState.glow.overlay.color};
           animation: {beauState.glow.overlay.animation} {beauState.glow.overlay.duration} ease-in-out infinite;"
  ></div>
{/if}
```

Add a click handler to the face wrapper:

```svelte
onclick={() => {
  if (beauState.pendingThoughtType) {
    window.dispatchEvent(new CustomEvent('bmo:thought-surface'));
  }
}}
style="cursor: {beauState.pendingThoughtType ? 'pointer' : 'default'};"
```

- [ ] **Step 3: Test manually in browser**

Start dev server, observe BmoFace. With no thoughts pending, face should look normal. The overlay and click handler are inert until the thought system produces a ready thought.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/BmoFace.svelte
git commit -m "feat(thoughts): BmoFace glow overlay + click-to-surface handler — SP4 task 9"
```

---

## Task 10: StatusBar Duration Support

**Files:**
- Modify: `src/lib/components/StatusBar.svelte`

- [ ] **Step 1: Update bmo:react handler to support duration**

Find the existing `bmo:react` event listener (`handleReact`). The current handler casts `detail` as `string`. Update it to handle both forms — existing callers pass a plain string, new thought surfacing passes `{ text, duration }`:

```typescript
const handleReact = (e: Event) => {
  const detail = (e as CustomEvent).detail;
  if (!detail) return;
  // Support both string (existing callers) and object (thought system)
  const text = typeof detail === 'string' ? detail : detail.text;
  const duration = typeof detail === 'object' ? (detail.duration ?? 3500) : 3500;
  if (text) showReaction(text, duration);
};
```

Update `showReaction` to accept an optional `duration` parameter (currently uses a hardcoded 3500ms `setTimeout`). Pass it through to the timeout.

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/StatusBar.svelte
git commit -m "feat(thoughts): StatusBar bmo:react duration support — SP4 task 10"
```

---

## Task 11: Thought Surfacing Wiring

**Files:**
- Modify: `src/lib/components/BmoFace.svelte` (or the page that hosts SpeechBubble)
- Modify: `src/routes/+page.svelte` (or `+layout.svelte`)

- [ ] **Step 1: Add bmo:thought-surface event listener in +layout.svelte**

In `src/routes/+layout.svelte`, add a listener for the `bmo:thought-surface` custom event. This must be in the layout (not `+page.svelte`) because the BmoFace click can happen from any page via the nav sidebar. The SpeechBubble component must also be added to `+layout.svelte` (or a dedicated thought overlay) so it's available on all pages:

1. Listen for `bmo:thought-surface` on `window`
2. Call `POST /api/thoughts/surface` to mark the ready thought as surfaced and get its text
3. Show the text via a SpeechBubble instance in the layout (positioned near BmoFace in the nav)
4. Dispatch `bmo:react` with `{ text, duration }` for StatusBar display
5. Duration scales with text length: observations ~3.5s, reactions ~5s, haiku ~8s

- [ ] **Step 2: Create the surface API endpoint**

Create `src/routes/api/thoughts/surface/+server.ts`:

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getThoughtSystem } from '$lib/server/thoughts/index.js';

export const POST: RequestHandler = async () => {
  const system = getThoughtSystem();
  if (!system) throw error(503, 'Thought system not initialized');

  const thought = system.queue.surface();
  if (!thought) throw error(404, 'No thought ready to surface');

  // Publish surfaced event via MQTT
  system.publishSurfaced(thought);

  return json({
    id: thought.id,
    type: thought.type,
    text: thought.text,
    trigger: thought.trigger,
    novelty: !!thought.novelty,
  });
};
```

- [ ] **Step 3: Create the thoughts index module**

Create `src/lib/server/thoughts/index.ts`:

```typescript
import type { ThoughtQueue } from './queue.js';
import type { TOPICS } from '../mqtt/topics.js';

type PublishFn = (topic: string, payload: string) => void;

let _queue: ThoughtQueue | null = null;
let _publish: PublishFn | null = null;
let _topics: typeof TOPICS | null = null;

export function registerThoughtSystem(
  queue: ThoughtQueue,
  publish: PublishFn,
  topics: typeof TOPICS,
) {
  _queue = queue;
  _publish = publish;
  _topics = topics;
}

export function getThoughtSystem() {
  if (!_queue) return null;
  return {
    queue: _queue,
    publishSurfaced(thought: { id: string; type: string; text: string | null; trigger: string; novelty: number }) {
      if (_publish && _topics) {
        _publish(_topics.thoughts.surfaced, JSON.stringify(thought));
      }
    },
  };
}
```

Call `registerThoughtSystem(thoughtQueue, _publish, TOPICS)` inside `connectMQTT()` in `bridge.ts` after instantiating the thought system.

- [ ] **Step 4: Test the surfacing flow manually**

Start dev server, manually insert a test thought into the DB with `status: 'ready'` and text. Click BmoFace. Verify SpeechBubble appears and StatusBar shows the message.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/thoughts/ src/lib/server/thoughts/index.ts src/routes/+page.svelte
git commit -m "feat(thoughts): surfacing API + SpeechBubble integration — SP4 task 11"
```

---

## Task 12: Widget — PendingThoughtsWidget

**Files:**
- Create: `src/lib/widgets/terminal/PendingThoughtsWidget.svelte`
- Modify: `src/lib/widgets/registry.ts`
- Modify: `src/lib/server/widgets/loaders.ts`

- [ ] **Step 1: Add loader case**

In `loaders.ts`, add case `'pending-thoughts'`:

```typescript
    case 'pending-thoughts': {
      const pending = db.select().from(schema.pendingThoughts)
        .where(sql`status IN ('requested','generating','pending','ready')`)
        .orderBy(desc(schema.pendingThoughts.priority))
        .all();
      const recent = db.select().from(schema.pendingThoughts)
        .where(sql`status IN ('surfaced','decayed','dropped')`)
        .orderBy(desc(schema.pendingThoughts.createdAt))
        .limit(10).all();
      const todaySurfaced = db.select({ count: sql<number>`count(*)` })
        .from(schema.pendingThoughts)
        .where(sql`status = 'surfaced' AND date(datetime(surfaced_at, 'localtime')) = date('now', 'localtime')`)
        .get();
      const todayHaiku = db.select({ count: sql<number>`count(*)` })
        .from(schema.pendingThoughts)
        .where(sql`status = 'surfaced' AND type = 'haiku' AND date(datetime(surfaced_at, 'localtime')) = date('now', 'localtime')`)
        .get();
      return {
        pending,
        recent,
        surfacedToday: todaySurfaced?.count ?? 0,
        haikuToday: todayHaiku?.count ?? 0,
      };
    }
```

- [ ] **Step 2: Register the widget**

In `registry.ts`, add after the last terminal widget entry:

```typescript
  'pending-thoughts': {
    id: 'pending-thoughts',
    label: 'Pending Thoughts',
    description: 'Diagnostic view of Beau\'s thought queue — pressure, pending, surfaced, and decayed thoughts',
    icon: '💭',
    category: 'system',
    component: () => import('./terminal/PendingThoughtsWidget.svelte'),
    defaultPosition: { colSpan: 6, rowSpan: 3 },
    configSchema: [],
    dataKind: 'database',
  },
```

- [ ] **Step 3: Create the widget component**

Create `PendingThoughtsWidget.svelte`:
- Shows `beauState.thoughtPressure` as a small horizontal bar (0-1 range)
- Lists pending thoughts: type badge, status, truncated text, TTL countdown
- Shows "Recently surfaced" section (last 5, with timestamps)
- Shows "Decayed" section (last 5, dimmed, representing "the ones that got away")
- Shows daily counts: `{surfacedToday}/{MAX_DAILY_THOUGHTS}` total, `{haikuToday}/{MAX_DAILY_HAIKU}` haiku
- Uses the terminal design system (dark bg, --bmo-green accents, monospace, tracking-widest labels)

The widget reads `beauState` for live pressure/count data and `data` prop (from loaders.ts) for the queue detail view.

- [ ] **Step 4: Verify widget appears in widget drawer**

Start dev server, enter edit mode (Ctrl+E), open widget drawer. Verify "Pending Thoughts" appears under System category with description and 💭 icon.

- [ ] **Step 5: Commit**

```bash
git add src/lib/widgets/terminal/PendingThoughtsWidget.svelte src/lib/widgets/registry.ts src/lib/server/widgets/loaders.ts
git commit -m "feat(thoughts): PendingThoughtsWidget diagnostic — SP4 task 12"
```

---

## Task 13: Ollama Listener

**Files:**
- Create: `scripts/ollama-listener.js`
- Create: `scripts/package.json`
- Test: `scripts/ollama-listener.test.js`

- [ ] **Step 1: Create scripts/package.json**

```json
{
  "name": "bmo-ollama-listener",
  "private": true,
  "type": "module",
  "dependencies": {
    "mqtt": "^5.0.0"
  }
}
```

- [ ] **Step 2: Write listener tests**

Test cases (using Node test runner or vitest):
- `buildPrompt('observation', request)` produces correct prompt text
- `buildPrompt('reaction', request)` includes momentum and environment
- `buildPrompt('haiku', request)` includes SILENCE instruction
- `buildPrompt()` with `novelty: true` produces open-ended prompt
- `parseSilence('SILENCE')` returns null
- `parseSilence('SILENCE\n')` returns null (with trailing newline)
- `parseSilence('some real text')` returns the text
- `parseSilence('')` returns null (empty = nothing to say)

- [ ] **Step 3: Implement the listener**

Create `scripts/ollama-listener.js`:
- Connects to MQTT broker (`MQTT_URL` env or default)
- Subscribes to `beau/thoughts/request`
- On message: parse ThoughtRequest, `buildPrompt(type, request)`, call Ollama API
- Parse response, check for SILENCE, publish ThoughtResult to `beau/thoughts/result`
- Error handling: log and skip on Ollama timeout/error (thought will be dropped by terminal-side timeout)
- Configuration via env vars: `MQTT_URL`, `OLLAMA_URL`, `OLLAMA_MODEL`, `THOUGHT_TIMEOUT_MS`
- TODO-B marker at top of file

- [ ] **Step 4: Install deps and run tests**

Run: `cd scripts && npm install && node --test ollama-listener.test.js`
Expected: All tests pass (prompt construction and SILENCE parsing — no Ollama needed for unit tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/
git commit -m "feat(thoughts): standalone Ollama listener — MQTT round-trip generation — SP4 task 13"
```

---

## Task 14: Integration Testing

**Files:**
- Various test files

- [ ] **Step 1: Write full lifecycle integration test**

In `src/lib/server/thoughts/`, create `integration.test.ts`:

Test the full flow:
1. Create PressureEngine, ThoughtDispatcher, ThoughtQueue
2. Feed sensor state that should build pressure over multiple ticks
3. Verify pressure crosses threshold and dispatch fires
4. Verify a ThoughtRequest was assembled with correct fields
5. Simulate receiving a ThoughtResult
6. Verify thought enters queue as pending → ready
7. Verify `getReadyThoughtType()` returns the type
8. Call `surface()` and verify status transitions

- [ ] **Step 2: Write decay integration test**

Test the decay flow:
1. Enqueue a thought with a short TTL (1ms)
2. Wait briefly, call `runDecay()`
3. Verify thought status is 'decayed'

- [ ] **Step 3: Write budget enforcement test**

1. Surface 5 thoughts
2. Verify `getDailyBudgetStatus().atTotalCap === true`
3. Verify pressure engine's `shouldDispatch()` returns false

- [ ] **Step 4: Run all tests**

Run: `cd beau-terminal && npx vitest run`
Expected: ALL tests pass (existing + new)

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/thoughts/integration.test.ts
git commit -m "test(thoughts): integration tests — full lifecycle, decay, budget — SP4 task 14"
```

---

## Task 15: Startup Wiring + Final Verification

**Files:**
- Modify: `src/hooks.server.ts`

- [ ] **Step 1: Verify the thought system initializes on startup**

The thought system is instantiated in `bridge.ts` inside `connectMQTT()`. Verify that `hooks.server.ts` calls `connectMQTT()` (it already does during MQTT connect). No additional startup code should be needed — the thought system hooks into the personality engine tick automatically.

If the thought system needs a separate startup call (e.g., loading persisted queue from DB), add it after the `connectMQTT()` call.

- [ ] **Step 2: Run the full test suite**

Run: `cd beau-terminal && npx vitest run`
Expected: ALL tests pass

- [ ] **Step 3: Start the dev server and verify**

Run: `cd beau-terminal && npm run dev`
Expected:
- Server starts on 4242
- Console shows personality engine ticking (existing)
- Console shows thought pressure ticking (new — add a diagnostic log at low frequency)
- No errors

- [ ] **Step 4: Verify the MQTT round-trip (requires Ollama)**

In a separate terminal:
1. Start Ollama: `ollama serve`
2. Start the listener: `cd scripts && node ollama-listener.js`
3. Open Beau's Terminal in browser
4. Wait for pressure to build (or manually trigger via MQTT publish)
5. Verify a thought appears in the PendingThoughtsWidget
6. Click BmoFace when glow overlay appears
7. Verify SpeechBubble shows the thought text

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(thoughts): startup wiring + final integration — SP4 task 15"
```

---

## Post-Implementation

- [ ] Update `CLAUDE.md` repo structure section with new files
- [ ] Update `CLAUDE.md` widget count to 48
- [ ] Update `MEMORY.md` with SP4 completion notes
- [ ] Run `npx vitest run` one final time to verify all tests pass
- [ ] Consider merging to master or creating a PR
