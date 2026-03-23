// src/lib/server/personality/interpreter.test.ts
import { describe, it, expect } from 'vitest';
import { interpretVector } from './interpreter.js';
import type { PersonalityVector, SensorState } from './types.js';

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

describe('interpretVector', () => {
	it('produces a non-empty string', () => {
		const result = interpretVector(
			{ wonder: 0.5, reflection: 0.3, mischief: 0.3 },
			'ambient',
			makeSensor(),
			[],
		);
		expect(result.length).toBeGreaterThan(0);
	});

	it('mentions reflection when reflection dominates', () => {
		const result = interpretVector(
			{ wonder: 0.2, reflection: 0.85, mischief: 0.1 },
			'archivist',
			makeSensor({ timeOfDay: new Date('2026-03-22T02:00:00') }),
			['time:late-night'],
		);
		const lower = result.toLowerCase();
		expect(
			lower.includes('reflect') ||
			lower.includes('quiet') ||
			lower.includes('still') ||
			lower.includes('deep') ||
			lower.includes('contemplat'),
		).toBe(true);
	});

	it('mentions wonder/spark when mischief dominates', () => {
		const result = interpretVector(
			{ wonder: 0.4, reflection: 0.1, mischief: 0.8 },
			'social',
			makeSensor({ presenceState: 'occupied', interactionAge: 15 }),
			['interaction:active'],
		);
		const lower = result.toLowerCase();
		expect(
			lower.includes('spark') ||
			lower.includes('mischief') ||
			lower.includes('play') ||
			lower.includes('energy') ||
			lower.includes('lively'),
		).toBe(true);
	});

	it('references weather when storm is a source', () => {
		const result = interpretVector(
			{ wonder: 0.7, reflection: 0.5, mischief: 0.1 },
			'witness',
			makeSensor({ weather: 'rain' }),
			['weather:storm'],
		);
		const lower = result.toLowerCase();
		expect(lower.includes('rain') || lower.includes('storm') || lower.includes('weather')).toBe(true);
	});

	it('does not repeat the same interpretation for different vectors', () => {
		const a = interpretVector(
			{ wonder: 0.8, reflection: 0.2, mischief: 0.3 },
			'ambient',
			makeSensor(),
			['sleep:waking'],
		);
		const b = interpretVector(
			{ wonder: 0.2, reflection: 0.8, mischief: 0.1 },
			'archivist',
			makeSensor({ timeOfDay: new Date('2026-03-22T03:00:00') }),
			['time:late-night'],
		);
		expect(a).not.toBe(b);
	});
});
