// src/lib/server/personality/mode-classifier.ts

/**
 * TODO-B: EXTRACTION TARGET — Pi Personality Service
 * See: docs/bible/beaus-bible.md §19 — modes as observations
 */

import type { PersonalityVector } from './types.js';

export const MODE_CENTROIDS: Record<string, PersonalityVector> = {
	ambient:      { wonder: 0.4, reflection: 0.3, mischief: 0.3 },
	witness:      { wonder: 0.7, reflection: 0.5, mischief: 0.1 },
	collaborator: { wonder: 0.5, reflection: 0.3, mischief: 0.6 },
	archivist:    { wonder: 0.3, reflection: 0.7, mischief: 0.2 },
	social:       { wonder: 0.5, reflection: 0.1, mischief: 0.8 },
};

export const MODE_DESCRIPTIONS: Record<string, string> = {
	ambient:      'Present and warm. Occasional comments, a haiku if the moment calls.',
	witness:      'Watching, mostly quiet. One sentence if something truly strikes.',
	collaborator: 'Leaning in. Throwing connections, asking questions.',
	archivist:    'Pulling from memory. Making connections across time.',
	social:       'Performative, playful. Being BMO for the room.',
};

const HYSTERESIS_TICKS = 3;
const HYSTERESIS_DISTANCE = 0.1;

function distance(a: PersonalityVector, b: PersonalityVector): number {
	return Math.sqrt(
		(a.wonder - b.wonder) ** 2 +
		(a.reflection - b.reflection) ** 2 +
		(a.mischief - b.mischief) ** 2,
	);
}

function findNearest(vector: PersonalityVector): { mode: string; dist: number } {
	let best = { mode: 'ambient', dist: Infinity };
	for (const [mode, centroid] of Object.entries(MODE_CENTROIDS)) {
		const d = distance(vector, centroid);
		if (d < best.dist) best = { mode, dist: d };
	}
	return best;
}

export class ModeClassifier {
	currentMode = 'ambient';
	previousMode: string | null = null;
	private candidateMode: string | null = null;
	private candidateTicks = 0;
	private currentDist = 0;

	update(vector: PersonalityVector): string | null {
		const nearest = findNearest(vector);
		// Always compute distance to the CURRENT mode's centroid (not the nearest)
		const currentCentroidDist = distance(vector, MODE_CENTROIDS[this.currentMode]);

		if (nearest.mode === this.currentMode) {
			this.candidateMode = null;
			this.candidateTicks = 0;
			this.currentDist = currentCentroidDist;
			return null;
		}

		// Update currentDist even when we're drifting away from current mode
		this.currentDist = currentCentroidDist;

		if (nearest.mode === this.candidateMode) {
			this.candidateTicks++;
		} else {
			this.candidateMode = nearest.mode;
			this.candidateTicks = 1;
		}

		if (
			this.candidateTicks >= HYSTERESIS_TICKS &&
			currentCentroidDist - nearest.dist >= HYSTERESIS_DISTANCE
		) {
			this.previousMode = this.currentMode;
			this.currentMode = nearest.mode;
			this.currentDist = nearest.dist;
			this.candidateMode = null;
			this.candidateTicks = 0;
			return this.currentMode;
		}

		return null;
	}

	getDescription(): string {
		return MODE_DESCRIPTIONS[this.currentMode] ?? '';
	}
}
