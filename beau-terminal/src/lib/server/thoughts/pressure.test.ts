// src/lib/server/thoughts/pressure.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { PressureEngine } from './pressure.js';
import {
	BASE_THRESHOLD,
	THRESHOLD_VARIANCE,
	NOVELTY_SPIKE_PROBABILITY,
	SLEEP_ACCUMULATION_RATE,
	COOLDOWN_MS,
} from './types.js';
import type { DailyBudgetStatus } from './types.js';

// ── Minimal mock BeauState (only fields pressure engine uses) ─────────────────

function makeState(overrides: Partial<{
	wonder: number;
	reflection: number;
	mischief: number;
	sleepState: string;
	lux: number | null;
}> = {}) {
	return {
		personalityVector: {
			wonder: overrides.wonder ?? 0.5,
			reflection: overrides.reflection ?? 0.3,
			mischief: overrides.mischief ?? 0.3,
		},
		sleepState: overrides.sleepState ?? 'awake',
		lux: overrides.lux ?? null,
	} as any;
}

// ── Default daily budget (not at cap) ─────────────────────────────────────────

const NOT_AT_CAP: DailyBudgetStatus = {
	surfacedToday: 0,
	haikuToday: 0,
	atHaikuCap: false,
	atTotalCap: false,
};

const AT_TOTAL_CAP: DailyBudgetStatus = {
	surfacedToday: 5,
	haikuToday: 3,
	atHaikuCap: true,
	atTotalCap: true,
};

// ── Seeded RNGs ────────────────────────────────────────────────────────────────

/** Always fires novelty spike (returns value < NOVELTY_SPIKE_PROBABILITY) */
const alwaysSpike = () => NOVELTY_SPIKE_PROBABILITY - 0.001;

/** Never fires novelty spike */
const neverSpike = () => NOVELTY_SPIKE_PROBABILITY + 0.001;

/** Always triggers dispatch (returns 0 → threshold = BASE_THRESHOLD + 0) */
const alwaysDispatch = () => 0;

/** Never triggers dispatch (returns 1 → threshold = BASE_THRESHOLD + THRESHOLD_VARIANCE, pressure always below) */
const neverDispatch = () => 1;

// ─────────────────────────────────────────────────────────────────────────────

describe('PressureEngine', () => {

	// ── 1. Pressure accumulates from vector magnitude ─────────────────────────

	it('accumulates faster with a higher-magnitude personality vector', () => {
		const low = new PressureEngine();
		const high = new PressureEngine();

		// Low vector: wonder=0.1, reflection=0.1, mischief=0.1
		// magnitude ≈ 0.173
		low.tick(makeState({ wonder: 0.1, reflection: 0.1, mischief: 0.1 }), 'awake', NOT_AT_CAP, neverSpike);

		// High vector: wonder=0.9, reflection=0.9, mischief=0.9
		// magnitude ≈ 1.559
		high.tick(makeState({ wonder: 0.9, reflection: 0.9, mischief: 0.9 }), 'awake', NOT_AT_CAP, neverSpike);

		expect(high.getValue()).toBeGreaterThan(low.getValue());
		expect(high.getValue()).toBeGreaterThan(0);
	});

	it('pressure increases after a single tick with non-zero vector', () => {
		const engine = new PressureEngine();
		expect(engine.getValue()).toBe(0);

		engine.tick(makeState(), 'awake', NOT_AT_CAP, neverSpike);

		expect(engine.getValue()).toBeGreaterThan(0);
	});

	// ── 2. Pressure drains during sleep state ────────────────────────────────

	it('accumulates much slower during sleep (settling)', () => {
		const awake = new PressureEngine();
		const sleeping = new PressureEngine();

		const state = makeState({ wonder: 0.8, reflection: 0.8, mischief: 0.8 });

		// Run 10 ticks each
		for (let i = 0; i < 10; i++) {
			awake.tick(state, 'awake', NOT_AT_CAP, neverSpike);
			sleeping.tick(state, 'settling', NOT_AT_CAP, neverSpike);
		}

		// Sleeping accumulates at SLEEP_ACCUMULATION_RATE (0.1) of awake rate
		expect(sleeping.getValue()).toBeLessThan(awake.getValue());
		// Should be approximately 10x less
		expect(sleeping.getValue()).toBeLessThan(awake.getValue() * 0.5);
	});

	it('accumulates much slower during sleep (asleep)', () => {
		const awake = new PressureEngine();
		const sleeping = new PressureEngine();

		const state = makeState({ wonder: 0.8, reflection: 0.8, mischief: 0.8 });

		for (let i = 0; i < 5; i++) {
			awake.tick(state, 'awake', NOT_AT_CAP, neverSpike);
			sleeping.tick(state, 'asleep', NOT_AT_CAP, neverSpike);
		}

		expect(sleeping.getValue()).toBeLessThan(awake.getValue());
	});

	// ── 3. Pressure resets partially after dispatch ───────────────────────────

	it('resetAfterDispatch reduces pressure by 50%', () => {
		const engine = new PressureEngine();

		// Run many ticks to build up pressure
		const state = makeState({ wonder: 0.9, reflection: 0.9, mischief: 0.9 });
		for (let i = 0; i < 20; i++) {
			engine.tick(state, 'awake', NOT_AT_CAP, neverSpike);
		}

		const before = engine.getValue();
		expect(before).toBeGreaterThan(0);

		engine.resetAfterDispatch();

		const after = engine.getValue();
		expect(after).toBeCloseTo(before * 0.5, 5);
	});

	// ── 4. Cooldown period blocks accumulation ────────────────────────────────

	it('cooldown blocks accumulation entirely', () => {
		const engine = new PressureEngine();

		// Trigger a surfaced event (sets cooldownUntil)
		engine.notifySurfaced();

		const valueBefore = engine.getValue();

		// Ticks during cooldown should not change pressure
		const state = makeState({ wonder: 0.9, reflection: 0.9, mischief: 0.9 });
		engine.tick(state, 'awake', NOT_AT_CAP, neverSpike);
		engine.tick(state, 'awake', NOT_AT_CAP, neverSpike);

		expect(engine.getValue()).toBe(valueBefore);
	});

	it('shouldDispatch returns false during cooldown', () => {
		const engine = new PressureEngine();

		// Build up pressure then trigger surfaced (sets cooldown)
		const state = makeState({ wonder: 0.9, reflection: 0.9, mischief: 0.9 });
		for (let i = 0; i < 50; i++) {
			engine.tick(state, 'awake', NOT_AT_CAP, neverSpike);
		}
		engine.notifySurfaced();

		// Even with alwaysDispatch rng and high pressure, cooldown blocks
		expect(engine.shouldDispatch(NOT_AT_CAP, alwaysDispatch)).toBe(false);
	});

	// ── 5. Novelty spike fires at configured probability ──────────────────────

	it('adds novelty spike when rng < NOVELTY_SPIKE_PROBABILITY', () => {
		const engine = new PressureEngine();
		const valueBefore = engine.getValue();

		// rng always returns < NOVELTY_SPIKE_PROBABILITY → spike fires
		engine.tick(makeState(), 'awake', NOT_AT_CAP, alwaysSpike);

		// Novelty spike adds 0.15
		expect(engine.getValue()).toBeGreaterThan(valueBefore + 0.1);
		expect(engine.wasNoveltySpike()).toBe(true);
	});

	it('does not add novelty spike when rng >= NOVELTY_SPIKE_PROBABILITY', () => {
		const engine = new PressureEngine();

		// Use a zero-magnitude vector so only novelty spike would change pressure
		const lowState = makeState({ wonder: 0, reflection: 0, mischief: 0 });

		engine.tick(lowState, 'awake', NOT_AT_CAP, neverSpike);

		// No spike — pressure should be minimal (only time factor, no vector magnitude)
		// Since lastSurfacedAt is null, time factor is 0
		expect(engine.getValue()).toBe(0);
		expect(engine.wasNoveltySpike()).toBe(false);
	});

	// ── 6. Novelty detection: sensor deviation triggers spike ─────────────────

	it('sensor deviation above threshold adds to pressure', () => {
		const engine = new PressureEngine();

		// Initialize baseline with value=10
		engine.updateBaseline('lux', 10);

		const before = engine.getValue();

		// Feed a value far from baseline (should trigger novelty spike from deviation)
		// deviation = |25 - 10| / max(10, 1.0) = 1.5 > 0.3 threshold
		engine.updateBaseline('lux', 25);

		expect(engine.getValue()).toBeGreaterThan(before);
	});

	it('sensor deviation below threshold does not add to pressure', () => {
		const engine = new PressureEngine();

		// Initialize baseline with value=10
		engine.updateBaseline('lux', 10);

		const before = engine.getValue();

		// Small deviation — score = |10.5 - 10| / max(10, 1.0) = 0.05 < 0.3
		engine.updateBaseline('lux', 10.5);

		expect(engine.getValue()).toBe(before);
	});

	// ── 7. Novelty baseline floor prevents divide-by-zero (lux=0 scenario) ────

	it('lux=0 baseline does not cause divide-by-zero or NaN', () => {
		const engine = new PressureEngine();

		// Initialize with 0 — min baseline for lux is 1.0 (NOVELTY_MIN_BASELINES.lux)
		engine.updateBaseline('lux', 0);
		engine.updateBaseline('lux', 0); // EMA stays near 0

		// Pressure and baseline should be finite (not NaN, not Infinity)
		expect(Number.isFinite(engine.getValue())).toBe(true);
		expect(isNaN(engine.getValue())).toBe(false);
	});

	it('unknown sensor without min baseline uses 1.0 as floor', () => {
		const engine = new PressureEngine();

		engine.updateBaseline('unknownSensor', 0);
		engine.updateBaseline('unknownSensor', 0);

		expect(Number.isFinite(engine.getValue())).toBe(true);
		expect(isNaN(engine.getValue())).toBe(false);
	});

	// ── 8. Baseline EMA initializes from first reading, not zero ─────────────

	it('baseline initializes from first value (not zero)', () => {
		const engine = new PressureEngine();

		// First call for 'lux' with value=100 — baseline should init to 100, not 0
		engine.updateBaseline('lux', 100);

		const before = engine.getValue();

		// Second call with same value → deviation=0 → no spike
		engine.updateBaseline('lux', 100);

		// If baseline initialized to 0 instead, deviation would be 100/1 = 100 (huge spike)
		// If it initialized to 100, deviation = 0 (no spike)
		expect(engine.getValue()).toBe(before);
	});

	// ── 9. Threshold crossing uses base + random variance ─────────────────────

	it('shouldDispatch requires pressure > BASE_THRESHOLD + rng * THRESHOLD_VARIANCE', () => {
		const engine = new PressureEngine();

		// Manually set pressure just above BASE_THRESHOLD
		// Use rng=0 → effective threshold = BASE_THRESHOLD + 0 * THRESHOLD_VARIANCE = BASE_THRESHOLD
		// pressure needs to be > BASE_THRESHOLD
		(engine as any)._state.value = BASE_THRESHOLD + 0.01;
		expect(engine.shouldDispatch(NOT_AT_CAP, alwaysDispatch)).toBe(true);

		// With rng=1 → effective threshold = BASE_THRESHOLD + THRESHOLD_VARIANCE = 0.9
		// pressure = BASE_THRESHOLD + 0.01 = 0.71 < 0.9 → false
		expect(engine.shouldDispatch(NOT_AT_CAP, neverDispatch)).toBe(false);
	});

	// ── 10. Time-since-last-surfaced contribution ─────────────────────────────

	it('time since last surfaced adds to pressure (larger gap = more pressure)', () => {
		const engineRecent = new PressureEngine();
		const engineOld = new PressureEngine();

		// Recent: surfaced 1 minute ago
		(engineRecent as any)._state.lastSurfacedAt = Date.now() - 60_000;

		// Old: surfaced 3 hours ago
		(engineOld as any)._state.lastSurfacedAt = Date.now() - 3 * 3_600_000;

		// Zero-magnitude vector so only time factor contributes
		const zeroState = makeState({ wonder: 0, reflection: 0, mischief: 0 });
		engineRecent.tick(zeroState, 'awake', NOT_AT_CAP, neverSpike);
		engineOld.tick(zeroState, 'awake', NOT_AT_CAP, neverSpike);

		expect(engineOld.getValue()).toBeGreaterThan(engineRecent.getValue());
	});

	it('time factor caps at 1.0 after 4 hours', () => {
		const engineFourHours = new PressureEngine();
		const engineEightHours = new PressureEngine();

		// 4 hours ago → timeFactor = 1.0 (cap)
		(engineFourHours as any)._state.lastSurfacedAt = Date.now() - 4 * 3_600_000;
		// 8 hours ago → should also be capped at 1.0
		(engineEightHours as any)._state.lastSurfacedAt = Date.now() - 8 * 3_600_000;

		const zeroState = makeState({ wonder: 0, reflection: 0, mischief: 0 });
		engineFourHours.tick(zeroState, 'awake', NOT_AT_CAP, neverSpike);
		engineEightHours.tick(zeroState, 'awake', NOT_AT_CAP, neverSpike);

		// Both should accumulate the same (capped at 1.0)
		expect(engineFourHours.getValue()).toBeCloseTo(engineEightHours.getValue(), 5);
	});

	// ── 11. shouldDispatch returns false when daily budget exhausted ──────────

	it('shouldDispatch returns false when daily budget at total cap', () => {
		const engine = new PressureEngine();

		// Force pressure above threshold
		(engine as any)._state.value = 0.99;

		expect(engine.shouldDispatch(AT_TOTAL_CAP, alwaysDispatch)).toBe(false);
	});

	// ── 12. shouldDispatch returns false during cooldown (covered in test 4) ──

	it('shouldDispatch returns true when conditions are met', () => {
		const engine = new PressureEngine();

		// Pressure just above base threshold, no cooldown, not at cap
		(engine as any)._state.value = BASE_THRESHOLD + 0.01;
		// Ensure no cooldown
		(engine as any)._state.cooldownUntil = null;

		expect(engine.shouldDispatch(NOT_AT_CAP, alwaysDispatch)).toBe(true);
	});

	// ── 13. Low vector energy causes drain ────────────────────────────────────

	it('low vector energy (all dims < 0.3) drains pressure', () => {
		const engine = new PressureEngine();

		// Pre-load some pressure
		(engine as any)._state.value = 0.5;

		// All dims at 0.1 — should cause drain of 0.005 per tick
		const lowState = makeState({ wonder: 0.1, reflection: 0.1, mischief: 0.1 });

		// Run 10 ticks — each tick adds small magnitude contribution but also drains
		// With wonder=reflection=mischief=0.1, magnitude ≈ 0.173
		// Per tick accumulation: 0.173 * 0.02 = 0.00346
		// Per tick drain: 0.005
		// Net change per tick: -0.00154 (negative → draining)
		// After 10 ticks from 0.5: should be less than 0.5
		for (let i = 0; i < 10; i++) {
			engine.tick(lowState, 'awake', NOT_AT_CAP, neverSpike);
		}

		expect(engine.getValue()).toBeLessThan(0.5);
	});

	it('low vector energy with zero dimensions drains cleanly', () => {
		const engine = new PressureEngine();
		(engine as any)._state.value = 0.3;

		const zeroState = makeState({ wonder: 0, reflection: 0, mischief: 0 });
		for (let i = 0; i < 10; i++) {
			engine.tick(zeroState, 'awake', NOT_AT_CAP, neverSpike);
		}

		// 10 ticks × 0.005 drain = 0.05 drained → should be ~0.25
		expect(engine.getValue()).toBeCloseTo(0.25, 1);
	});

	// ── Additional: getValue() and wasNoveltySpike() defaults ────────────────

	it('getValue() starts at 0', () => {
		const engine = new PressureEngine();
		expect(engine.getValue()).toBe(0);
	});

	it('wasNoveltySpike() starts false', () => {
		const engine = new PressureEngine();
		expect(engine.wasNoveltySpike()).toBe(false);
	});

	it('wasNoveltySpike() resets after non-spike tick', () => {
		const engine = new PressureEngine();

		// First tick: spike
		engine.tick(makeState(), 'awake', NOT_AT_CAP, alwaysSpike);
		expect(engine.wasNoveltySpike()).toBe(true);

		// Second tick: no spike
		engine.tick(makeState(), 'awake', NOT_AT_CAP, neverSpike);
		expect(engine.wasNoveltySpike()).toBe(false);
	});

	// ── Additional: getLastTrigger() ─────────────────────────────────────────

	it('getLastTrigger() returns a non-empty string after a tick with spike', () => {
		const engine = new PressureEngine();
		engine.tick(makeState(), 'awake', NOT_AT_CAP, alwaysSpike);
		const trigger = engine.getLastTrigger();
		expect(typeof trigger).toBe('string');
		expect(trigger.length).toBeGreaterThan(0);
		expect(trigger).toBe('novelty_spike');
	});

	it('getLastTrigger() returns vector_magnitude for normal accumulation', () => {
		const engine = new PressureEngine();
		engine.tick(makeState({ wonder: 0.8, reflection: 0.8, mischief: 0.8 }), 'awake', NOT_AT_CAP, neverSpike);
		expect(engine.getLastTrigger()).toBe('vector_magnitude');
	});

	it('getLastTrigger() returns time_silence when lastSurfacedAt is set and low vector', () => {
		const engine = new PressureEngine();
		// Set lastSurfacedAt to 3 hours ago
		(engine as any)._state.lastSurfacedAt = Date.now() - 3 * 3_600_000;

		// Use zero vector so only time factor contributes
		const zeroState = makeState({ wonder: 0, reflection: 0, mischief: 0 });
		engine.tick(zeroState, 'awake', NOT_AT_CAP, neverSpike);
		expect(engine.getLastTrigger()).toBe('time_silence');
	});

	// ── Additional: notifySurfaced sets lastSurfacedAt ───────────────────────

	it('notifySurfaced sets lastSurfacedAt and cooldownUntil', () => {
		const engine = new PressureEngine();
		const before = Date.now();

		engine.notifySurfaced();

		const state = (engine as any)._state;
		expect(state.lastSurfacedAt).toBeGreaterThanOrEqual(before);
		expect(state.cooldownUntil).toBeGreaterThanOrEqual(before + COOLDOWN_MS - 10);
	});

	// ── Additional: pressure clamped to [0, 1] ────────────────────────────────

	it('pressure is clamped to [0, 1] and cannot exceed 1', () => {
		const engine = new PressureEngine();

		// Pre-load near max
		(engine as any)._state.value = 0.99;

		// Run many ticks with max vector and always-spike rng
		const maxState = makeState({ wonder: 1, reflection: 1, mischief: 1 });
		for (let i = 0; i < 20; i++) {
			engine.tick(maxState, 'awake', NOT_AT_CAP, alwaysSpike);
		}

		expect(engine.getValue()).toBeLessThanOrEqual(1.0);
	});

	it('pressure cannot go below 0 when draining from 0', () => {
		const engine = new PressureEngine();
		expect(engine.getValue()).toBe(0);

		// Run 10 drain ticks from zero
		const zeroState = makeState({ wonder: 0, reflection: 0, mischief: 0 });
		for (let i = 0; i < 10; i++) {
			engine.tick(zeroState, 'awake', NOT_AT_CAP, neverSpike);
		}

		expect(engine.getValue()).toBeGreaterThanOrEqual(0);
	});
});
