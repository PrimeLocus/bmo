// src/lib/server/personality/compaction.test.ts

/**
 * TODO-B: EXTRACTION TARGET — Pi Personality Service
 * These tests cover compaction utilities that will move with the module.
 * See: docs/bible/beaus-bible.md §24
 */

import { describe, it, expect } from 'vitest';
import { isNotable, getRetentionTier } from './compaction.js';

describe('isNotable', () => {
	const neutral = { wonder: 0.5, reflection: 0.3, mischief: 0.3 };

	it('flags extreme high values', () => {
		expect(isNotable({ wonder: 0.9, reflection: 0.3, mischief: 0.3 }, neutral, false, false)).toBe(true);
	});

	it('flags extreme low values', () => {
		expect(isNotable({ wonder: 0.1, reflection: 0.3, mischief: 0.3 }, neutral, false, false)).toBe(true);
	});

	it('flags large delta (> 0.2 change)', () => {
		const prev = { wonder: 0.5, reflection: 0.3, mischief: 0.3 };
		const curr = { wonder: 0.5, reflection: 0.6, mischief: 0.3 };
		expect(isNotable(curr, prev, false, false)).toBe(true);
	});

	it('flags creative coincidence', () => {
		expect(isNotable(neutral, neutral, true, false)).toBe(true);
	});

	it('flags mode transition', () => {
		expect(isNotable(neutral, neutral, false, true)).toBe(true);
	});

	it('does not flag neutral state with no change', () => {
		expect(isNotable(neutral, neutral, false, false)).toBe(false);
	});
});

describe('getRetentionTier', () => {
	const now = new Date('2026-03-22T12:00:00Z');

	it('classifies recent as hot', () => {
		const ts = new Date('2026-03-22T06:00:00Z'); // 6 hours ago
		expect(getRetentionTier(ts, now)).toBe('hot');
	});

	it('classifies 3 days ago as warm', () => {
		const ts = new Date('2026-03-19T12:00:00Z');
		expect(getRetentionTier(ts, now)).toBe('warm');
	});

	it('classifies 15 days ago as cool', () => {
		const ts = new Date('2026-03-07T12:00:00Z');
		expect(getRetentionTier(ts, now)).toBe('cool');
	});

	it('classifies 60 days ago as cold', () => {
		const ts = new Date('2026-01-22T12:00:00Z');
		expect(getRetentionTier(ts, now)).toBe('cold');
	});
});
