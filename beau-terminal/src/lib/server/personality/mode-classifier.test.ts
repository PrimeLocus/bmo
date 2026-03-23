// src/lib/server/personality/mode-classifier.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ModeClassifier } from './mode-classifier.js';

describe('ModeClassifier', () => {
	let classifier: ModeClassifier;

	beforeEach(() => {
		classifier = new ModeClassifier();
	});

	it('starts in ambient mode', () => {
		expect(classifier.currentMode).toBe('ambient');
	});

	it('classifies high wonder + low mischief as witness', () => {
		// Feed 3 ticks to overcome hysteresis
		for (let i = 0; i < 3; i++) {
			classifier.update({ wonder: 0.75, reflection: 0.5, mischief: 0.05 });
		}
		expect(classifier.currentMode).toBe('witness');
	});

	it('classifies high mischief + low reflection as social', () => {
		for (let i = 0; i < 3; i++) {
			classifier.update({ wonder: 0.5, reflection: 0.1, mischief: 0.85 });
		}
		expect(classifier.currentMode).toBe('social');
	});

	it('classifies high reflection as archivist', () => {
		for (let i = 0; i < 3; i++) {
			classifier.update({ wonder: 0.25, reflection: 0.8, mischief: 0.15 });
		}
		expect(classifier.currentMode).toBe('archivist');
	});

	it('classifies balanced wonder + mischief as collaborator', () => {
		for (let i = 0; i < 3; i++) {
			classifier.update({ wonder: 0.5, reflection: 0.25, mischief: 0.65 });
		}
		expect(classifier.currentMode).toBe('collaborator');
	});

	it('resists jitter — does not change on a single tick', () => {
		classifier.update({ wonder: 0.75, reflection: 0.5, mischief: 0.05 });
		expect(classifier.currentMode).toBe('ambient'); // still ambient after 1 tick
	});

	it('returns mode description', () => {
		expect(classifier.getDescription()).toContain('Present and warm');
	});

	it('reports previousMode on transition', () => {
		expect(classifier.previousMode).toBeNull();
		for (let i = 0; i < 3; i++) {
			classifier.update({ wonder: 0.75, reflection: 0.5, mischief: 0.05 });
		}
		expect(classifier.previousMode).toBe('ambient');
	});
});
