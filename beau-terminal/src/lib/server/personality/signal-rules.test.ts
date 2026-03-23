// src/lib/server/personality/signal-rules.test.ts
import { describe, it, expect } from 'vitest';
import { computeSignalTargets, RESTING_BASELINE } from './signal-rules.js';
import type { SensorState, ActivitySignals } from './types.js';

const NO_ACTIVITY: ActivitySignals = {
	haikuRecent: false,
	journalRecent: false,
	dispatchRecent: false,
	ideaRecent: false,
	noticingRecent: false,
	debriefRecent: false,
};

function makeSensor(overrides: Partial<SensorState> = {}): SensorState {
	return {
		lux: 100,
		presenceState: 'occupied',
		sleepState: 'awake',
		interactionAge: 120,
		weather: 'clear',
		seasonalContext: null,
		timeOfDay: new Date('2026-03-22T14:00:00'),
		resolumeActive: false,
		...overrides,
	};
}

describe('computeSignalTargets', () => {
	it('returns resting baseline with neutral inputs', () => {
		const result = computeSignalTargets(makeSensor(), NO_ACTIVITY);
		// Daytime, occupied, moderate interaction age, clear weather
		// Only minor rules should fire
		expect(result.wonder).toBeCloseTo(RESTING_BASELINE.wonder + 0.1, 1); // clear+warm
		expect(result.reflection).toBeGreaterThanOrEqual(0);
		expect(result.mischief).toBeGreaterThanOrEqual(0);
	});

	it('boosts reflection for late night', () => {
		const result = computeSignalTargets(
			makeSensor({ timeOfDay: new Date('2026-03-22T02:30:00') }),
			NO_ACTIVITY,
		);
		expect(result.reflection).toBeGreaterThan(RESTING_BASELINE.reflection + 0.3);
	});

	it('boosts mischief for recent interaction', () => {
		const result = computeSignalTargets(
			makeSensor({ interactionAge: 30 }),
			NO_ACTIVITY,
		);
		expect(result.mischief).toBeGreaterThan(RESTING_BASELINE.mischief + 0.2);
	});

	it('boosts reflection for storm weather', () => {
		const result = computeSignalTargets(
			makeSensor({ weather: 'rain' }),
			NO_ACTIVITY,
		);
		expect(result.wonder).toBeGreaterThan(RESTING_BASELINE.wonder + 0.2);
		expect(result.reflection).toBeGreaterThan(RESTING_BASELINE.reflection + 0.1);
	});

	it('suppresses mischief when resolume active', () => {
		const result = computeSignalTargets(
			makeSensor({ resolumeActive: true }),
			NO_ACTIVITY,
		);
		expect(result.mischief).toBeLessThan(RESTING_BASELINE.mischief);
		expect(result.wonder).toBeGreaterThan(RESTING_BASELINE.wonder);
	});

	it('boosts reflection for recent haiku activity', () => {
		const result = computeSignalTargets(
			makeSensor(),
			{ ...NO_ACTIVITY, haikuRecent: true },
		);
		expect(result.reflection).toBeGreaterThan(RESTING_BASELINE.reflection + 0.2);
	});

	it('clamps all values to 0.0–1.0', () => {
		// Stack every reflection-boosting condition
		const result = computeSignalTargets(
			makeSensor({
				lux: 2,
				presenceState: 'empty',
				sleepState: 'settling',
				interactionAge: 3600,
				weather: 'rain',
				timeOfDay: new Date('2026-03-22T03:00:00'),
			}),
			{ ...NO_ACTIVITY, journalRecent: true },
		);
		expect(result.reflection).toBeLessThanOrEqual(1.0);
		expect(result.reflection).toBeGreaterThanOrEqual(0.0);
		expect(result.mischief).toBeGreaterThanOrEqual(0.0);
		expect(result.wonder).toBeLessThanOrEqual(1.0);
	});
});
