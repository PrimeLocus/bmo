// src/lib/server/personality/engine.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PersonalityEngine } from './engine.js';
import { RESTING_BASELINE } from './signal-rules.js';
import type { SensorState, ActivitySignals, EngineConfig } from './types.js';

const NO_ACTIVITY: ActivitySignals = {
	haikuRecent: false, journalRecent: false, dispatchRecent: false,
	ideaRecent: false, noticingRecent: false, debriefRecent: false,
};

const TEST_CONFIG: EngineConfig = {
	tickInterval: 100, // fast for tests
	signalAlphas: { wonder: 0.15, reflection: 0.08, mischief: 0.25 },
	momentumAlpha: 0.002,
	blendRatio: 0.6,
	restingBaseline: { ...RESTING_BASELINE },
	snapshotDeltaThreshold: 0.05,
	snapshotIntervalTicks: 60,
	activityCacheInterval: 30000,
	diagnosticMode: true,
};

function makeSensor(overrides: Partial<SensorState> = {}): SensorState {
	return {
		lux: 100, presenceState: 'occupied', sleepState: 'awake',
		interactionAge: 120, weather: 'clear', seasonalContext: null,
		timeOfDay: new Date('2026-03-22T14:00:00'), resolumeActive: false,
		...overrides,
	};
}

describe('PersonalityEngine', () => {
	let engine: PersonalityEngine;

	beforeEach(() => {
		engine = new PersonalityEngine(TEST_CONFIG);
	});

	afterEach(() => {
		engine.stop();
	});

	it('initializes to resting baseline', () => {
		const v = engine.getVector();
		expect(v.wonder).toBeCloseTo(RESTING_BASELINE.wonder, 2);
		expect(v.reflection).toBeCloseTo(RESTING_BASELINE.reflection, 2);
		expect(v.mischief).toBeCloseTo(RESTING_BASELINE.mischief, 2);
	});

	it('starts in ambient mode', () => {
		expect(engine.getDerivedMode()).toBe('ambient');
	});

	it('moves toward signal targets on tick', () => {
		// Late night should boost reflection
		engine.tick(
			makeSensor({ timeOfDay: new Date('2026-03-22T03:00:00') }),
			NO_ACTIVITY,
		);
		const v = engine.getVector();
		expect(v.reflection).toBeGreaterThan(RESTING_BASELINE.reflection);
	});

	it('signal layer moves faster than momentum', () => {
		const sensor = makeSensor({ timeOfDay: new Date('2026-03-22T03:00:00') });
		engine.tick(sensor, NO_ACTIVITY);
		const signal = engine.getSignalLayer();
		const momentum = engine.getMomentumLayer();
		// Signal should have moved more from baseline
		expect(signal.reflection - RESTING_BASELINE.reflection)
			.toBeGreaterThan(momentum.reflection - RESTING_BASELINE.reflection);
	});

	it('produces a non-empty interpretation', () => {
		engine.tick(makeSensor(), NO_ACTIVITY);
		expect(engine.getInterpretation().length).toBeGreaterThan(0);
	});

	it('notifies on vector change', () => {
		const changes: number[] = [];
		engine.onVectorChange((v) => changes.push(v.wonder));
		engine.tick(
			makeSensor({ timeOfDay: new Date('2026-03-22T03:00:00') }),
			NO_ACTIVITY,
		);
		expect(changes.length).toBe(1);
	});

	it('forceMode overrides derived mode', () => {
		engine.forceMode('witness', 'test');
		expect(engine.getDerivedMode()).toBe('witness');
	});

	it('reflect() returns null (no-op)', async () => {
		const result = await engine.reflect();
		expect(result).toBeNull();
	});

	it('momentum carries after environment changes', () => {
		// Build up reflection over several ticks
		const quietNight = makeSensor({ timeOfDay: new Date('2026-03-22T03:00:00') });
		for (let i = 0; i < 20; i++) {
			engine.tick(quietNight, NO_ACTIVITY);
		}
		const reflectionBefore = engine.getMomentumLayer().reflection;

		// Suddenly switch to active daytime
		engine.tick(
			makeSensor({ interactionAge: 10, timeOfDay: new Date('2026-03-22T14:00:00') }),
			NO_ACTIVITY,
		);
		const reflectionAfter = engine.getMomentumLayer().reflection;

		// Momentum should barely change in one tick
		expect(Math.abs(reflectionAfter - reflectionBefore)).toBeLessThan(0.01);
	});

	it('collects snapshot data', () => {
		engine.tick(
			makeSensor({ timeOfDay: new Date('2026-03-22T03:00:00') }),
			NO_ACTIVITY,
		);
		const snapshot = engine.getLastSnapshot();
		expect(snapshot).not.toBeNull();
		expect(snapshot!.wonder).toBeDefined();
		expect(snapshot!.derivedMode).toBeDefined();
		expect(snapshot!.sources).toBeDefined();
	});

	it('restores momentum from a previous snapshot', () => {
		const momentum = { wonder: 0.7, reflection: 0.8, mischief: 0.2 };
		engine.restoreMomentum(momentum);
		const m = engine.getMomentumLayer();
		expect(m.wonder).toBeCloseTo(0.7, 2);
		expect(m.reflection).toBeCloseTo(0.8, 2);
	});
});
