// src/lib/server/thoughts/integration.test.ts

/**
 * Integration tests — verify PressureEngine, ThoughtDispatcher, and ThoughtQueue
 * work together end-to-end. No MQTT or Ollama required.
 */

import { describe, it, expect } from 'vitest';
import { PressureEngine } from './pressure.js';
import { ThoughtDispatcher } from './dispatcher.js';
import { ThoughtQueue } from './queue.js';
import type { DailyBudgetStatus } from './types.js';
import { BASE_THRESHOLD, GENERATION_TIMEOUT_MS } from './types.js';

// ── Shared helpers ─────────────────────────────────────────────────────────────

function makeState(overrides: Partial<{
  wonder: number;
  reflection: number;
  mischief: number;
  mode: string;
  environment: string;
  sleepState: string;
}> = {}) {
  return {
    personalityVector: {
      wonder: overrides.wonder ?? 0.5,
      reflection: overrides.reflection ?? 0.5,
      mischief: overrides.mischief ?? 0.5,
    },
    mode: overrides.mode ?? 'ambient',
    environment: overrides.environment ?? 'quiet house',
    sleepState: overrides.sleepState ?? 'awake',
  } as any;
}

function makeBudget(overrides: Partial<DailyBudgetStatus> = {}): DailyBudgetStatus {
  return {
    surfacedToday: overrides.surfacedToday ?? 0,
    haikuToday: overrides.haikuToday ?? 0,
    atHaikuCap: overrides.atHaikuCap ?? false,
    atTotalCap: overrides.atTotalCap ?? false,
  };
}

/** Seeded RNG that always returns 0.5 — no novelty spike, deterministic threshold */
const rngHalf = () => 0.5;

/** RNG that always returns 0 — minimum threshold (BASE_THRESHOLD) */
const rngZero = () => 0;

// ── Test 1: Full lifecycle ─────────────────────────────────────────────────────

describe('Integration: full thought lifecycle', () => {
  it('pressure accumulates, crosses threshold, request is assembled, enqueued, and surfaced', async () => {
    // 1. Create components
    const pressure = new PressureEngine();
    const dispatcher = new ThoughtDispatcher(() => 'Wonder and quiet light');
    const queue = new ThoughtQueue(null as any);

    // 2. Active personality state
    const state = makeState({
      wonder: 0.7,
      reflection: 0.6,
      mischief: 0.4,
      mode: 'ambient',
      environment: 'quiet house',
      sleepState: 'awake',
    });

    // 3. Budget with all caps false
    const budget = makeBudget();

    // 4. Feed 200 ticks — rng=0.5, so no novelty spike fires (< 0.04 threshold)
    //    and shouldDispatch threshold = BASE_THRESHOLD + 0.5 * 0.2 = 0.8
    //    Vector magnitude ≈ sqrt(0.49+0.36+0.16) ≈ 1.005
    //    Per-tick gain ≈ 1.005 * 0.02 = 0.0201 → reaches 1.0 in ~50 ticks, clamped
    for (let i = 0; i < 200; i++) {
      pressure.tick(state, 'awake', budget, rngHalf);
    }

    // 5. Pressure should have crossed the 0.8 threshold (clamped to 1.0)
    expect(pressure.getValue()).toBeGreaterThan(BASE_THRESHOLD);

    // 6. shouldDispatch returns true with rng=0 → threshold = BASE_THRESHOLD + 0 = 0.7
    expect(pressure.shouldDispatch(budget, rngZero)).toBe(true);

    // 7. Select type — use hour=12 (not a haiku window), trigger='vector_magnitude',
    //    isNovelty=false → default path → 'reaction'
    const trigger = pressure.getLastTrigger();
    const isNovelty = pressure.wasNoveltySpike();
    const type = dispatcher.selectType(state, budget, trigger, isNovelty, rngHalf, 12);
    expect(type).not.toBeNull();
    expect(['observation', 'reaction', 'haiku']).toContain(type);

    // 8. Assemble the request
    const request = await dispatcher.assembleRequest(type!, state, trigger, isNovelty);
    expect(request.id).toBeDefined();
    expect(request.type).toBe(type);

    // 9. Enqueue the request
    const expiresAt = dispatcher.computeExpiresAt(type!);
    const enqueued = queue.enqueue({
      id: request.id,
      type: request.type,
      trigger: request.trigger,
      contextJson: JSON.stringify(request.context),
      expiresAt,
      novelty: request.novelty,
    });
    expect(enqueued).not.toBeNull();

    // 10. Verify thought is in 'requested' status
    const thought = queue.get(request.id)!;
    expect(thought.status).toBe('requested');

    // 11. Simulate receiving a result
    const generatedAt = new Date().toISOString();
    queue.receiveResult({
      id: request.id,
      text: 'Test thought',
      generatedAt,
      model: 'test',
      generationMs: 100,
    });

    // 12. Verify transition: pending → ready (single thought, promoted immediately)
    const after = queue.get(request.id)!;
    expect(after.status).toBe('ready');
    expect(after.text).toBe('Test thought');

    // 13. getReadyThoughtType returns the thought's type
    expect(queue.getReadyThoughtType()).toBe(type);

    // 14. Surface the thought
    const surfaced = queue.surface();
    expect(surfaced).not.toBeNull();
    expect(surfaced!.status).toBe('surfaced');
    expect(surfaced!.surfacedAt).not.toBeNull();
  });
});

// ── Test 2: Decay path ─────────────────────────────────────────────────────────

describe('Integration: decay path', () => {
  it('thought with past expiresAt is decayed by runDecay()', () => {
    const queue = new ThoughtQueue(null as any);

    // Enqueue with expiresAt already 1ms in the past
    const alreadyExpired = new Date(Date.now() - 1).toISOString();
    queue.enqueue({
      id: 'decay-test',
      type: 'observation',
      trigger: 'test',
      contextJson: '{}',
      expiresAt: alreadyExpired,
      novelty: false,
    });

    // Receive a real result (thought transitions to pending → ready)
    queue.receiveResult({
      id: 'decay-test',
      text: 'Some observation',
      generatedAt: new Date().toISOString(),
      model: 'test',
      generationMs: 50,
    });

    // Verify it's ready before decay
    const beforeDecay = queue.get('decay-test')!;
    expect(beforeDecay.status).toBe('ready');

    // Run decay — expiresAt is in the past, should decay
    queue.runDecay();

    expect(queue.get('decay-test')!.status).toBe('decayed');
  });
});

// ── Test 3: Budget enforcement ─────────────────────────────────────────────────

describe('Integration: budget enforcement', () => {
  it('selectType returns null when atTotalCap is true', () => {
    const dispatcher = new ThoughtDispatcher(() => 'quiet');
    const state = makeState();

    const cappedBudget = makeBudget({
      surfacedToday: 5,
      haikuToday: 3,
      atHaikuCap: true,
      atTotalCap: true,
    });

    const type = dispatcher.selectType(state, cappedBudget, 'idle', false);
    expect(type).toBeNull();
  });

  it('shouldDispatch returns false when budget atTotalCap is true', () => {
    const pressure = new PressureEngine();
    const state = makeState({ wonder: 0.9, reflection: 0.9, mischief: 0.9 });

    // Build up pressure well above threshold
    const openBudget = makeBudget();
    for (let i = 0; i < 100; i++) {
      pressure.tick(state, 'awake', openBudget, rngHalf);
    }
    // Confirm pressure would normally dispatch
    expect(pressure.shouldDispatch(openBudget, rngZero)).toBe(true);

    // Now check with capped budget
    const cappedBudget = makeBudget({
      surfacedToday: 5,
      haikuToday: 3,
      atHaikuCap: true,
      atTotalCap: true,
    });
    expect(pressure.shouldDispatch(cappedBudget, rngZero)).toBe(false);
  });
});

// ── Test 4: SILENCE quality gate ──────────────────────────────────────────────

describe('Integration: SILENCE quality gate', () => {
  it('receiveResult with text=null drops the thought and getReadyThoughtType returns null', () => {
    const queue = new ThoughtQueue(null as any);

    // Enqueue a haiku thought
    queue.enqueue({
      id: 'haiku-silence',
      type: 'haiku',
      trigger: 'idle',
      contextJson: '{}',
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      novelty: false,
    });

    // Verify it's in requested state
    expect(queue.get('haiku-silence')!.status).toBe('requested');

    // Simulate SILENCE sentinel (text: null)
    queue.receiveResult({
      id: 'haiku-silence',
      text: null,
      generatedAt: new Date().toISOString(),
      model: 'test',
      generationMs: 20,
    });

    // Should be dropped
    expect(queue.get('haiku-silence')!.status).toBe('dropped');

    // Nothing should be ready
    expect(queue.getReadyThoughtType()).toBeNull();
  });
});

// ── Test 5: Generation timeout ─────────────────────────────────────────────────

describe('Integration: generation timeout', () => {
  it('thought stuck in requested state past GENERATION_TIMEOUT_MS is dropped by runDecay()', () => {
    const queue = new ThoughtQueue(null as any);

    // Enqueue with a far-future expiry (not TTL-expired)
    queue.enqueue({
      id: 'timeout-test',
      type: 'reaction',
      trigger: 'idle',
      contextJson: '{}',
      expiresAt: new Date(Date.now() + 36_000_000).toISOString(),
      novelty: false,
    });

    // Backdate createdAt by 60 seconds (well past the 30s GENERATION_TIMEOUT_MS)
    const thought = queue.get('timeout-test')!;
    (thought as any).createdAt = new Date(Date.now() - 60_000).toISOString();

    // Status is still 'requested' (no result received)
    expect(thought.status).toBe('requested');

    // runDecay should detect the generation timeout and drop it
    queue.runDecay();

    expect(queue.get('timeout-test')!.status).toBe('dropped');
  });
});
