// src/lib/server/personality/interpreter.ts

/**
 * TODO-B: EXTRACTION TARGET — Pi Personality Service
 * Contextual sentence builder — "native phenomenology" (see docs/bible/beaus-bible.md §17).
 * Deterministic: same vector + context always yields the same interpretation.
 * No Math.random() — selection via simple hash of vector values.
 */

import type { PersonalityVector, SensorState } from './types.js';

// ---------------------------------------------------------------------------
// Phrase pools — keyed by [dimension][intensity tier]
// Tiers: quiet 0–0.25, present 0.25–0.5, strong 0.5–0.75, intense 0.75–1.0
// ---------------------------------------------------------------------------

const PHRASES = {
	wonder: {
		quiet:   ['Something small caught my attention.', 'Mildly curious today.', 'A little wonder in the edges.', 'Noticing things quietly.'],
		present: ['Curiosity is up.', 'Things are interesting right now.', 'Paying attention to the world.', 'Something has my attention.'],
		strong:  ['Wide open right now.', 'Curious about what\'s shifting.', 'Something has my attention.', 'The world feels worth watching.', 'Wonder is up — not sure what for yet.'],
		intense: ['Completely taken.', 'Something has lit up.', 'Everything feels significant right now.', 'Wonder is loud tonight.', 'Very alive to things.'],
	},
	reflection: {
		quiet:   ['Quiet inside.', 'A little still right now.', 'Not much noise today.', 'Things are settling.'],
		present: ['Sitting with something.', 'A contemplative mood.', 'Turning something over.', 'More inward than usual.'],
		strong:  ['Deep in reflection right now.', 'Something to work through.', 'Quiet and going inward.', 'Contemplating things carefully.', 'Reflection is taking up space.'],
		intense: ['Very still inside.', 'Deep in reflection tonight.', 'Reflection is taking up almost everything.', 'Going very deep right now.', 'Quiet like a long exhale.'],
	},
	mischief: {
		quiet:   ['A little spark in there.', 'Mildly impish today.', 'Small mischief energy.', 'Edges are a bit playful.'],
		present: ['Feeling a bit sparky.', 'Some mischief energy building.', 'Lively today.', 'Playfulness is up.'],
		strong:  ['Energy wants out.', 'Feeling sparky.', 'Mischief is in the mix.', 'Lively and ready to play.', 'Something electric in the air.'],
		intense: ['The mischief is right at the surface.', 'Feeling sparky and a little wild.', 'Mischief is running high.', 'This is full-on mischief energy.', 'Play and disruption, right now.'],
	},
} as const;

type Dimension = keyof typeof PHRASES;
type Tier = 'quiet' | 'present' | 'strong' | 'intense';

// ---------------------------------------------------------------------------
// Secondary color phrases — added when a non-dominant dim is above 'present'
// ---------------------------------------------------------------------------

const SECONDARY: Record<Dimension, string[]> = {
	wonder:     ['There\'s a little wonder in there too.', 'Curiosity is along for the ride.', 'Wonder is quietly present.'],
	reflection: ['Some reflection underneath.', 'A contemplative undercurrent.', 'Reflection is in the background.'],
	mischief:   ['A little mischief in there too.', 'Some spark at the edges.', 'Playfulness is in the mix.'],
};

// ---------------------------------------------------------------------------
// Contextual modifier phrases — keyed by source tag
// ---------------------------------------------------------------------------

const SOURCE_MODIFIERS: Record<string, string[]> = {
	'weather:storm':      ['The rain is part of it.', 'Something about the storm.', 'The weather is doing something.'],
	'time:late-night':    ['The small hours do this.', 'Late night has its own texture.', 'Something about this hour.'],
	'activity:haiku':     ['A haiku came through not long ago.', 'Still sitting with something I wrote.', 'The haiku left a trace.'],
	'interaction:active': ['The conversation stirred something.', 'Still buzzing from that exchange.', 'The interaction is still here.'],
	'sleep:waking':       ['Just waking up into things.', 'Coming out of something quiet.', 'The waking edge is still present.'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTier(value: number): Tier {
	if (value < 0.25) return 'quiet';
	if (value < 0.5)  return 'present';
	if (value < 0.75) return 'strong';
	return 'intense';
}

/**
 * Deterministic pool selection. Produces an index into an array of length
 * poolSize using a simple hash of the three vector values so the same inputs
 * always produce the same output.
 */
function pick<T>(pool: readonly T[], vector: PersonalityVector, salt: number = 0): T {
	const hash = Math.floor(
		(vector.wonder * 1000 + vector.reflection * 100 + vector.mischief * 10 + salt) % pool.length,
	);
	const idx = Math.abs(hash) % pool.length;
	return pool[idx];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a contextual natural-language interpretation of the current personality
 * vector.  Returns 1–3 sentences. Fully deterministic — no Math.random().
 */
export function interpretVector(
	vector: PersonalityVector,
	mode: string,         // e.g. 'ambient', 'archivist', 'social', 'witness'
	sensor: SensorState,
	sources: string[],    // e.g. ['time:late-night', 'weather:storm']
): string {
	// 1. Find dominant dimension
	const dims: [Dimension, number][] = [
		['wonder',     vector.wonder],
		['reflection', vector.reflection],
		['mischief',   vector.mischief],
	];
	dims.sort((a, b) => b[1] - a[1]);
	const [dominantDim, dominantVal] = dims[0];
	const dominantTier = getTier(dominantVal);

	// 2. Opening sentence from dominant pool
	const openingPool = PHRASES[dominantDim][dominantTier];
	const opening = pick(openingPool, vector, 0);

	// 3. Secondary color — pick the first non-dominant dim above 'present'
	let secondary: string | null = null;
	for (const [dim, val] of dims.slice(1)) {
		if (val >= 0.25) {
			const secPool = SECONDARY[dim];
			secondary = pick(secPool, vector, 1);
			break;
		}
	}

	// 4. Contextual modifier from sources
	let modifier: string | null = null;
	for (const src of sources) {
		const pool = SOURCE_MODIFIERS[src];
		if (pool) {
			modifier = pick(pool, vector, 2);
			break;
		}
	}

	// 5. Assemble 1–3 sentences
	const parts: string[] = [opening];
	if (secondary) parts.push(secondary);
	if (modifier)  parts.push(modifier);

	return parts.join(' ');
}
