/**
 * Face frame data for all 10 BMO face states.
 *
 * Renders on a 48x40 SVG viewBox. Canonical BMO eyes are round dots
 * (SVG circles), mouths are smooth curves (SVG paths).
 * Reference: docs/face_ref/
 */

import type { FaceState } from '$lib/server/mqtt/topics.js';

// ── Types ──────────────────────────────────────────────────────

export type FaceRect = {
	kind: 'rect';
	x: number;
	y: number;
	w: number;
	h: number;
	fill?: string;
	opacity?: number;
	rx?: number;
};

export type FaceCircle = {
	kind: 'circle';
	cx: number;
	cy: number;
	r: number;
	fill?: string;
	opacity?: number;
};

export type FacePath = {
	kind: 'path';
	d: string;
	fill?: string; // default 'none'
	stroke?: string; // default '#00e5a0'
	strokeWidth?: number; // default 1.5
	opacity?: number;
	strokeLinecap?: 'round' | 'butt' | 'square'; // default 'round'
};

export type FaceElement = FaceRect | FaceCircle | FacePath;

export type FaceText = {
	x: number;
	y: number;
	size: number;
	text: string;
	opacity: number;
};

export type FaceFrameSet = {
	frames: FaceElement[][];
	timing: number | (() => number);
	loop: boolean;
	textFrames?: FaceText[][];
};

// ── Shared parts ───────────────────────────────────────────────

const DARK = '#0a0f0d';

/** Standard idle eyes — two round dots */
const IDLE_EYES: FaceCircle[] = [
	{ kind: 'circle', cx: 16, cy: 14, r: 2 },
	{ kind: 'circle', cx: 32, cy: 14, r: 2 },
];

/** Standard idle smile — gentle upward curve */
const IDLE_SMILE: FacePath = {
	kind: 'path',
	d: 'M 18,28 Q 24,33 30,28',
	strokeWidth: 1.5,
};

/** Flat neutral mouth */
const FLAT_MOUTH: FacePath = {
	kind: 'path',
	d: 'M 18,28 L 30,28',
	strokeWidth: 1.5,
};

/** Small neutral dash */
const SMALL_MOUTH: FacePath = {
	kind: 'path',
	d: 'M 22,29 L 26,29',
	strokeWidth: 1.2,
	opacity: 0.5,
};

/** Half-closed eye arcs (for blink mid-frames) */
const BLINK_HALF_EYES: FacePath[] = [
	{ kind: 'path', d: 'M 13,15 Q 16,17 19,15', strokeWidth: 1.5 },
	{ kind: 'path', d: 'M 29,15 Q 32,17 35,15', strokeWidth: 1.5 },
];

/** Closed eye lines (for blink) */
const BLINK_CLOSED_EYES: FacePath[] = [
	{ kind: 'path', d: 'M 13,15 L 19,15', strokeWidth: 1.5 },
	{ kind: 'path', d: 'M 29,15 L 35,15', strokeWidth: 1.5 },
];

// ── Exported blink/offline frames for BmoFace transitions ─────

/** Half-closed eyes for blink transitions */
export const BLINK_HALF: FaceElement[] = [...BLINK_HALF_EYES];

/** Closed eyes for blink transitions */
export const BLINK_CLOSED: FaceElement[] = [...BLINK_CLOSED_EYES];

/** Offline X-eyes (crossed lines) */
export const OFFLINE_EYES: FaceElement[] = [
	{ kind: 'path', d: 'M 12,11 L 20,19', strokeWidth: 2 },
	{ kind: 'path', d: 'M 20,11 L 12,19', strokeWidth: 2 },
	{ kind: 'path', d: 'M 28,11 L 36,19', strokeWidth: 2 },
	{ kind: 'path', d: 'M 36,11 L 28,19', strokeWidth: 2 },
];

// ── Frame data ─────────────────────────────────────────────────

export const FACE_FRAMES: Record<FaceState, FaceFrameSet> = {
	// ── IDLE ─────────────────────────────────────────────────────
	// Canonical: round dot eyes + gentle smile. Blink cycle.
	idle: {
		frames: [
			// Frame 0: eyes open
			[...IDLE_EYES, IDLE_SMILE],
			// Frame 1: half-close
			[...BLINK_HALF_EYES, IDLE_SMILE],
			// Frame 2: closed
			[...BLINK_CLOSED_EYES, IDLE_SMILE],
			// Frame 3: half-open
			[...BLINK_HALF_EYES, IDLE_SMILE],
		],
		timing: () => 3000 + Math.random() * 2000,
		loop: true,
	},

	// ── LISTENING ────────────────────────────────────────────────
	// Alert: slightly larger eyes, attentive, small neutral mouth
	listening: {
		frames: [
			// Frame 0: alert — larger eyes
			[
				{ kind: 'circle', cx: 16, cy: 13, r: 2.5 },
				{ kind: 'circle', cx: 32, cy: 13, r: 2.5 },
				SMALL_MOUTH,
			],
			// Frame 1: settling
			[
				{ kind: 'circle', cx: 16, cy: 14, r: 2.2 },
				{ kind: 'circle', cx: 32, cy: 14, r: 2.2 },
				SMALL_MOUTH,
			],
			// Frame 2: attentive — normal size
			[...IDLE_EYES, SMALL_MOUTH],
		],
		timing: 1200,
		loop: true,
	},

	// ── THINKING ─────────────────────────────────────────────────
	// Eyes shift around (looking left, up, right). Small tilted mouth.
	thinking: {
		frames: [
			// Frame 0: look left
			[
				{ kind: 'circle', cx: 14, cy: 14, r: 2 },
				{ kind: 'circle', cx: 30, cy: 13, r: 2 },
				{ kind: 'path', d: 'M 22,29 L 27,28', strokeWidth: 1.3 },
			],
			// Frame 1: look up
			[
				{ kind: 'circle', cx: 16, cy: 12, r: 2 },
				{ kind: 'circle', cx: 32, cy: 12, r: 2 },
				{ kind: 'path', d: 'M 23,29 L 28,29', strokeWidth: 1.3 },
			],
			// Frame 2: look right
			[
				{ kind: 'circle', cx: 18, cy: 14, r: 2 },
				{ kind: 'circle', cx: 34, cy: 13, r: 2 },
				{ kind: 'path', d: 'M 21,28 L 26,29', strokeWidth: 1.3 },
			],
			// Frame 3: look up (repeat)
			[
				{ kind: 'circle', cx: 16, cy: 12, r: 2 },
				{ kind: 'circle', cx: 32, cy: 12, r: 2 },
				{ kind: 'path', d: 'M 23,29 L 28,29', strokeWidth: 1.3 },
			],
		],
		timing: () => 900 + Math.random() * 400,
		loop: true,
	},

	// ── SPEAKING ─────────────────────────────────────────────────
	// Eyes stay normal. Mouth animates open/closed.
	speaking: {
		frames: [
			// Frame 0: mouth closed
			[
				...IDLE_EYES,
				{ kind: 'path', d: 'M 20,29 L 28,29', strokeWidth: 1.5 },
			],
			// Frame 1: mouth half-open (small dome)
			[
				...IDLE_EYES,
				{
					kind: 'path',
					d: 'M 20,28 C 20,32 28,32 28,28 Z',
					fill: DARK,
					strokeWidth: 1.2,
				},
			],
			// Frame 2: mouth wide open (bigger dome)
			[
				...IDLE_EYES,
				{
					kind: 'path',
					d: 'M 19,27 C 19,34 29,34 29,27 Z',
					fill: DARK,
					strokeWidth: 1.2,
				},
			],
			// Frame 3: mouth half-open (same as frame 1)
			[
				...IDLE_EYES,
				{
					kind: 'path',
					d: 'M 20,28 C 20,32 28,32 28,28 Z',
					fill: DARK,
					strokeWidth: 1.2,
				},
			],
		],
		timing: () => 180 + Math.random() * 80,
		loop: true,
	},

	// ── DELIGHTED ────────────────────────────────────────────────
	// Very happy: happy-arc eyes (^_^), big open smile, bounce + sparkles
	delighted: {
		frames: [
			// Frame 0: up — happy arc eyes, big smile
			[
				{ kind: 'path', d: 'M 12,16 Q 16,11 20,16', strokeWidth: 1.8 },
				{ kind: 'path', d: 'M 28,16 Q 32,11 36,16', strokeWidth: 1.8 },
				{
					kind: 'path',
					d: 'M 16,27 C 16,34 32,34 32,27 Z',
					fill: DARK,
					strokeWidth: 1.2,
				},
				{ kind: 'circle', cx: 8, cy: 8, r: 1, opacity: 0.35 },
				{ kind: 'circle', cx: 40, cy: 6, r: 1, opacity: 0.35 },
			],
			// Frame 1: down (bounce) + different sparkles
			[
				{ kind: 'path', d: 'M 12,17 Q 16,12 20,17', strokeWidth: 1.8 },
				{ kind: 'path', d: 'M 28,17 Q 32,12 36,17', strokeWidth: 1.8 },
				{
					kind: 'path',
					d: 'M 16,28 C 16,35 32,35 32,28 Z',
					fill: DARK,
					strokeWidth: 1.2,
				},
				{ kind: 'circle', cx: 6, cy: 7, r: 1, opacity: 0.3 },
				{ kind: 'circle', cx: 42, cy: 9, r: 1, opacity: 0.3 },
				{ kind: 'circle', cx: 24, cy: 5, r: 0.8, opacity: 0.25 },
			],
			// Frame 2: up — shifted sparkles
			[
				{ kind: 'path', d: 'M 12,16 Q 16,11 20,16', strokeWidth: 1.8 },
				{ kind: 'path', d: 'M 28,16 Q 32,11 36,16', strokeWidth: 1.8 },
				{
					kind: 'path',
					d: 'M 16,27 C 16,34 32,34 32,27 Z',
					fill: DARK,
					strokeWidth: 1.2,
				},
				{ kind: 'circle', cx: 8, cy: 4, r: 0.8, opacity: 0.25 },
				{ kind: 'circle', cx: 38, cy: 9, r: 1, opacity: 0.3 },
			],
			// Frame 3: down — no sparkles
			[
				{ kind: 'path', d: 'M 12,17 Q 16,12 20,17', strokeWidth: 1.8 },
				{ kind: 'path', d: 'M 28,17 Q 32,12 36,17', strokeWidth: 1.8 },
				{
					kind: 'path',
					d: 'M 16,28 C 16,35 32,35 32,28 Z',
					fill: DARK,
					strokeWidth: 1.2,
				},
			],
		],
		timing: 500,
		loop: true,
	},

	// ── WITNESS ──────────────────────────────────────────────────
	// Half-lidded observing eyes, camera indicator, muted expression
	witness: {
		frames: [
			// Frame 0: camera bright
			[
				{ kind: 'circle', cx: 16, cy: 16, r: 1.8 },
				{ kind: 'circle', cx: 32, cy: 16, r: 1.8 },
				{ kind: 'path', d: 'M 12,14 L 20,14', strokeWidth: 1.5, opacity: 0.5 },
				{ kind: 'path', d: 'M 28,14 L 36,14', strokeWidth: 1.5, opacity: 0.5 },
				{ kind: 'path', d: 'M 20,28 L 28,28', strokeWidth: 1.2, opacity: 0.4 },
				{ kind: 'circle', cx: 24, cy: 9, r: 1.5, opacity: 0.3 },
				{ kind: 'circle', cx: 24, cy: 9, r: 0.6, fill: DARK },
			],
			// Frame 1: camera dim
			[
				{ kind: 'circle', cx: 16, cy: 16, r: 1.8 },
				{ kind: 'circle', cx: 32, cy: 16, r: 1.8 },
				{ kind: 'path', d: 'M 12,14 L 20,14', strokeWidth: 1.5, opacity: 0.5 },
				{ kind: 'path', d: 'M 28,14 L 36,14', strokeWidth: 1.5, opacity: 0.5 },
				{ kind: 'path', d: 'M 20,28 L 28,28', strokeWidth: 1.2, opacity: 0.4 },
				{ kind: 'circle', cx: 24, cy: 9, r: 1.5, opacity: 0.15 },
				{ kind: 'circle', cx: 24, cy: 9, r: 0.6, fill: DARK },
			],
		],
		timing: 3000,
		loop: true,
	},

	// ── SLEEPY ───────────────────────────────────────────────────
	// Curved closed eyes (downward arcs), gentle expression, z-characters
	sleepy: {
		frames: [
			// Frame 0: drowsy — slightly open curved arcs
			[
				{
					kind: 'path',
					d: 'M 12,15 Q 16,18 20,15',
					strokeWidth: 1.5,
					opacity: 0.5,
				},
				{
					kind: 'path',
					d: 'M 28,15 Q 32,18 36,15',
					strokeWidth: 1.5,
					opacity: 0.5,
				},
				{ kind: 'path', d: 'M 22,29 L 26,29', strokeWidth: 1.2, opacity: 0.4 },
			],
			// Frame 1: closing — flatter arcs
			[
				{
					kind: 'path',
					d: 'M 12,16 Q 16,17.5 20,16',
					strokeWidth: 1.5,
					opacity: 0.4,
				},
				{
					kind: 'path',
					d: 'M 28,16 Q 32,17.5 36,16',
					strokeWidth: 1.5,
					opacity: 0.4,
				},
				{ kind: 'path', d: 'M 22,29 L 26,29', strokeWidth: 1.2, opacity: 0.4 },
			],
			// Frame 2: asleep — nearly flat
			[
				{
					kind: 'path',
					d: 'M 13,16 Q 16,17 19,16',
					strokeWidth: 1.5,
					opacity: 0.4,
				},
				{
					kind: 'path',
					d: 'M 29,16 Q 32,17 35,16',
					strokeWidth: 1.5,
					opacity: 0.4,
				},
				{ kind: 'path', d: 'M 22,29 L 26,29', strokeWidth: 1.2, opacity: 0.4 },
			],
		],
		textFrames: [
			[
				{ x: 35, y: 12, size: 7, text: 'z', opacity: 0.5 },
				{ x: 39, y: 8, size: 5.5, text: 'z', opacity: 0.3 },
			],
			[
				{ x: 36, y: 10, size: 7, text: 'z', opacity: 0.4 },
				{ x: 40, y: 6, size: 5.5, text: 'z', opacity: 0.25 },
				{ x: 43, y: 3, size: 4, text: 'z', opacity: 0.15 },
			],
			[
				{ x: 37, y: 8, size: 6, text: 'z', opacity: 0.3 },
				{ x: 41, y: 4, size: 4.5, text: 'z', opacity: 0.2 },
			],
		],
		timing: 2000,
		loop: true,
	},

	// ── UNAMUSED ─────────────────────────────────────────────────
	// Round dot eyes with heavy lids, flat mouth
	unamused: {
		frames: [
			[
				{ kind: 'circle', cx: 16, cy: 16, r: 2 },
				{ kind: 'circle', cx: 32, cy: 16, r: 2 },
				{ kind: 'path', d: 'M 11,14 L 21,14', strokeWidth: 2 },
				{ kind: 'path', d: 'M 27,14 L 37,14', strokeWidth: 2 },
				FLAT_MOUTH,
			],
		],
		timing: 1000,
		loop: false,
	},

	// ── MISCHIEVOUS ──────────────────────────────────────────────
	// Left eye squinted (arc), right eye wider (dot), raised brow, asymmetric smirk
	mischievous: {
		frames: [
			// Frame 0: brow up
			[
				{ kind: 'path', d: 'M 12,16 Q 16,13 20,16', strokeWidth: 1.8 },
				{ kind: 'circle', cx: 32, cy: 13, r: 2.5 },
				{ kind: 'path', d: 'M 28,8 L 38,6 L 40,5', strokeWidth: 1.5 },
				{
					kind: 'path',
					d: 'M 18,30 Q 24,31 28,28 Q 30,26 31,24',
					strokeWidth: 1.5,
				},
			],
			// Frame 1: hold — smirk curls higher
			[
				{ kind: 'path', d: 'M 12,16 Q 16,13 20,16', strokeWidth: 1.8 },
				{ kind: 'circle', cx: 32, cy: 13, r: 2.5 },
				{ kind: 'path', d: 'M 28,8 L 38,6 L 40,5.5', strokeWidth: 1.5 },
				{
					kind: 'path',
					d: 'M 18,30 Q 24,31 28,28 Q 30,25 31,23',
					strokeWidth: 1.5,
				},
			],
			// Frame 2: settle
			[
				{ kind: 'path', d: 'M 12,16 Q 16,13 20,16', strokeWidth: 1.8 },
				{ kind: 'circle', cx: 32, cy: 13, r: 2.5 },
				{ kind: 'path', d: 'M 28,8 L 38,6 L 40,5.5', strokeWidth: 1.5 },
				{
					kind: 'path',
					d: 'M 18,30 Q 24,31 28,28 Q 30,26 31,24',
					strokeWidth: 1.5,
				},
			],
		],
		timing: () => 600 + Math.random() * 300,
		loop: true,
	},

	// ── PROTECTIVE ───────────────────────────────────────────────
	// Round eyes with angled brows meeting inward, firm frown
	protective: {
		frames: [
			[
				{ kind: 'circle', cx: 16, cy: 16, r: 2 },
				{ kind: 'circle', cx: 32, cy: 16, r: 2 },
				{ kind: 'path', d: 'M 10,11 L 22,14', strokeWidth: 2 },
				{ kind: 'path', d: 'M 38,11 L 26,14', strokeWidth: 2 },
				{ kind: 'path', d: 'M 18,30 Q 24,26 30,30', strokeWidth: 1.5 },
			],
		],
		timing: 1000,
		loop: false,
	},
};
