/**
 * Pixel-art frame data for all 10 BMO face states.
 *
 * Each face state is a FaceFrameSet containing animation frames,
 * where each frame is an array of FaceRect describing SVG rects
 * on a 48x40 viewBox.
 *
 * Coordinates extracted from approved brainstorm mockups:
 *   .superpowers/brainstorm/face-states-1774243487/all-faces-v3.html
 *   .superpowers/brainstorm/face-states-1774243487/animated-faces.html
 */

import type { FaceState } from '$lib/server/mqtt/topics.js';

// ── Types ──────────────────────────────────────────────────────────

export type FaceRect = {
	x: number;
	y: number;
	w: number;
	h: number;
	opacity?: number; // default 1.0
	fill?: string; // default '#00e5a0' (bmo-green), use '#0a0f0d' for dark interior
};

export type FaceText = {
	x: number;
	y: number;
	size: number;
	text: string;
	opacity: number;
};

export type FaceFrameSet = {
	frames: FaceRect[][];
	timing: number | (() => number);
	loop: boolean;
	textFrames?: FaceText[][];
};

// ── Shared parts ───────────────────────────────────────────────────

const NOSE: FaceRect = { x: 23, y: 22, w: 2, h: 2, opacity: 0.4 };
const DARK = '#0a0f0d';

/** Standard idle smile — stepped curve */
const IDLE_MOUTH: FaceRect[] = [
	{ x: 16, y: 28, w: 2, h: 2 },
	{ x: 18, y: 30, w: 2, h: 2 },
	{ x: 20, y: 32, w: 8, h: 2 },
	{ x: 28, y: 30, w: 2, h: 2 },
	{ x: 30, y: 28, w: 2, h: 2 },
];

/** Standard 2x3 block eyes at idle positions */
const IDLE_EYES: FaceRect[] = [
	{ x: 12, y: 12, w: 4, h: 6 },
	{ x: 18, y: 12, w: 4, h: 6 },
	{ x: 28, y: 12, w: 4, h: 6 },
	{ x: 34, y: 12, w: 4, h: 6 },
];

// ── Frame data ─────────────────────────────────────────────────────

export const FACE_FRAMES: Record<FaceState, FaceFrameSet> = {
	// ── IDLE ─────────────────────────────────────────────────────
	// 4 frames: open → half-close → blink (closed) → half-open
	// Timing: 3-5s open, 60ms transitions, 120ms blink
	idle: {
		frames: [
			// Frame 0: open eyes
			[...IDLE_EYES, NOSE, ...IDLE_MOUTH],
			// Frame 1: half-close
			[
				{ x: 12, y: 14, w: 4, h: 3 },
				{ x: 18, y: 14, w: 4, h: 3 },
				{ x: 28, y: 14, w: 4, h: 3 },
				{ x: 34, y: 14, w: 4, h: 3 },
				NOSE,
				...IDLE_MOUTH,
			],
			// Frame 2: blink (closed) — horizontal bars
			[
				{ x: 12, y: 15, w: 10, h: 2 },
				{ x: 28, y: 15, w: 10, h: 2 },
				NOSE,
				...IDLE_MOUTH,
			],
			// Frame 3: half-open (same as half-close)
			[
				{ x: 12, y: 14, w: 4, h: 3 },
				{ x: 18, y: 14, w: 4, h: 3 },
				{ x: 28, y: 14, w: 4, h: 3 },
				{ x: 34, y: 14, w: 4, h: 3 },
				NOSE,
				...IDLE_MOUTH,
			],
		],
		timing: () => {
			// Frame 0 (open) stays 3-5s, transitions are fast
			// The renderer will call this per frame; we return varied timing
			return 3000 + Math.random() * 2000;
		},
		loop: true,
	},

	// ── LISTENING ────────────────────────────────────────────────
	// 3 frames: alert (wide 3x4 eyes) → settling → attentive (normal)
	// Mouth: small muted dash
	listening: {
		frames: [
			// Frame 0: alert — wide eyes (3 blocks per eye)
			[
				{ x: 11, y: 10, w: 4, h: 8 },
				{ x: 15, y: 10, w: 4, h: 8 },
				{ x: 19, y: 10, w: 4, h: 8 },
				{ x: 27, y: 10, w: 4, h: 8 },
				{ x: 31, y: 10, w: 4, h: 8 },
				{ x: 35, y: 10, w: 4, h: 8 },
				NOSE,
				{ x: 22, y: 30, w: 4, h: 2, opacity: 0.4 },
			],
			// Frame 1: settling — intermediate
			[
				{ x: 12, y: 11, w: 4, h: 7 },
				{ x: 16, y: 11, w: 4, h: 7 },
				{ x: 20, y: 11, w: 2, h: 7 },
				{ x: 28, y: 11, w: 2, h: 7 },
				{ x: 30, y: 11, w: 4, h: 7 },
				{ x: 34, y: 11, w: 4, h: 7 },
				NOSE,
				{ x: 22, y: 30, w: 4, h: 2, opacity: 0.4 },
			],
			// Frame 2: attentive — normal idle-size eyes
			[
				{ x: 12, y: 12, w: 4, h: 6 },
				{ x: 18, y: 12, w: 4, h: 6 },
				{ x: 28, y: 12, w: 4, h: 6 },
				{ x: 34, y: 12, w: 4, h: 6 },
				NOSE,
				{ x: 22, y: 30, w: 4, h: 2, opacity: 0.4 },
			],
		],
		timing: 1200,
		loop: true,
	},

	// ── THINKING ─────────────────────────────────────────────────
	// 4 frames: look-left → look-up → look-right → look-up
	// Eyes shift position, mouth shifts side to side
	thinking: {
		frames: [
			// Frame 0: look left — eyes shifted left, mouth at x=22
			[
				{ x: 10, y: 12, w: 4, h: 6 },
				{ x: 14, y: 12, w: 4, h: 6 },
				{ x: 28, y: 10, w: 4, h: 6 },
				{ x: 32, y: 10, w: 4, h: 6 },
				NOSE,
				{ x: 22, y: 28, w: 2, h: 2 },
				{ x: 24, y: 28, w: 2, h: 2 },
				{ x: 26, y: 28, w: 2, h: 2 },
			],
			// Frame 1: look up — eyes shifted up, mouth centered at x=24
			[
				{ x: 12, y: 10, w: 4, h: 6 },
				{ x: 16, y: 10, w: 4, h: 6 },
				{ x: 30, y: 10, w: 4, h: 6 },
				{ x: 34, y: 10, w: 4, h: 6 },
				NOSE,
				{ x: 24, y: 28, w: 2, h: 2 },
				{ x: 26, y: 28, w: 2, h: 2 },
				{ x: 28, y: 28, w: 2, h: 2 },
			],
			// Frame 2: look right — eyes shifted right, mouth at x=20
			[
				{ x: 14, y: 12, w: 4, h: 6 },
				{ x: 18, y: 12, w: 4, h: 6 },
				{ x: 32, y: 12, w: 4, h: 6 },
				{ x: 36, y: 12, w: 4, h: 6 },
				NOSE,
				{ x: 20, y: 28, w: 2, h: 2 },
				{ x: 22, y: 28, w: 2, h: 2 },
				{ x: 24, y: 28, w: 2, h: 2 },
			],
			// Frame 3: look up (same as frame 1)
			[
				{ x: 12, y: 10, w: 4, h: 6 },
				{ x: 16, y: 10, w: 4, h: 6 },
				{ x: 30, y: 10, w: 4, h: 6 },
				{ x: 34, y: 10, w: 4, h: 6 },
				NOSE,
				{ x: 24, y: 28, w: 2, h: 2 },
				{ x: 26, y: 28, w: 2, h: 2 },
				{ x: 28, y: 28, w: 2, h: 2 },
			],
		],
		timing: () => 900 + Math.random() * 400,
		loop: true,
	},

	// ── SPEAKING ─────────────────────────────────────────────────
	// 4 frames: closed → half-open → open → half-open
	// Eyes stay standard, mouth animates
	speaking: {
		frames: [
			// Frame 0: closed mouth
			[
				...IDLE_EYES,
				NOSE,
				{ x: 20, y: 30, w: 8, h: 2 },
			],
			// Frame 1: half-open mouth
			[
				...IDLE_EYES,
				NOSE,
				{ x: 20, y: 28, w: 8, h: 2 },
				{ x: 18, y: 30, w: 2, h: 2 },
				{ x: 28, y: 30, w: 2, h: 2 },
				{ x: 20, y: 32, w: 8, h: 2 },
				{ x: 20, y: 30, w: 8, h: 2, fill: DARK },
			],
			// Frame 2: open mouth
			[
				...IDLE_EYES,
				NOSE,
				{ x: 20, y: 27, w: 8, h: 2 },
				{ x: 18, y: 29, w: 2, h: 4 },
				{ x: 28, y: 29, w: 2, h: 4 },
				{ x: 20, y: 33, w: 8, h: 2 },
				{ x: 20, y: 29, w: 8, h: 4, fill: DARK },
			],
			// Frame 3: half-open mouth (same as frame 1)
			[
				...IDLE_EYES,
				NOSE,
				{ x: 20, y: 28, w: 8, h: 2 },
				{ x: 18, y: 30, w: 2, h: 2 },
				{ x: 28, y: 30, w: 2, h: 2 },
				{ x: 20, y: 32, w: 8, h: 2 },
				{ x: 20, y: 30, w: 8, h: 2, fill: DARK },
			],
		],
		timing: () => 180 + Math.random() * 80,
		loop: true,
	},

	// ── DELIGHTED ────────────────────────────────────────────────
	// 4 frames: up+sparkleA, up+no-sparkle → down+sparkleB, down+no-sparkle
	// Wide eyes, big smile. "Down" frames shift y+2. Sparkles at low opacity.
	delighted: {
		frames: [
			// Frame 0: up, sparkle set A
			[
				{ x: 10, y: 8, w: 5, h: 8 },
				{ x: 15, y: 8, w: 5, h: 8 },
				{ x: 20, y: 8, w: 3, h: 8 },
				{ x: 27, y: 8, w: 3, h: 8 },
				{ x: 30, y: 8, w: 5, h: 8 },
				{ x: 35, y: 8, w: 5, h: 8 },
				{ x: 14, y: 26, w: 2, h: 2 },
				{ x: 16, y: 28, w: 2, h: 2 },
				{ x: 18, y: 30, w: 12, h: 2 },
				{ x: 30, y: 28, w: 2, h: 2 },
				{ x: 32, y: 26, w: 2, h: 2 },
				{ x: 8, y: 6, w: 2, h: 2, opacity: 0.35 },
				{ x: 40, y: 4, w: 2, h: 2, opacity: 0.35 },
			],
			// Frame 1: down, sparkle set B
			[
				{ x: 10, y: 10, w: 5, h: 8 },
				{ x: 15, y: 10, w: 5, h: 8 },
				{ x: 20, y: 10, w: 3, h: 8 },
				{ x: 27, y: 10, w: 3, h: 8 },
				{ x: 30, y: 10, w: 5, h: 8 },
				{ x: 35, y: 10, w: 5, h: 8 },
				{ x: 14, y: 28, w: 2, h: 2 },
				{ x: 16, y: 30, w: 2, h: 2 },
				{ x: 18, y: 32, w: 12, h: 2 },
				{ x: 30, y: 30, w: 2, h: 2 },
				{ x: 32, y: 28, w: 2, h: 2 },
				{ x: 6, y: 6, w: 2, h: 2, opacity: 0.3 },
				{ x: 42, y: 8, w: 2, h: 2, opacity: 0.3 },
				{ x: 24, y: 4, w: 2, h: 2, opacity: 0.25 },
			],
			// Frame 2: up, sparkle set C
			[
				{ x: 10, y: 8, w: 5, h: 8 },
				{ x: 15, y: 8, w: 5, h: 8 },
				{ x: 20, y: 8, w: 3, h: 8 },
				{ x: 27, y: 8, w: 3, h: 8 },
				{ x: 30, y: 8, w: 5, h: 8 },
				{ x: 35, y: 8, w: 5, h: 8 },
				{ x: 14, y: 26, w: 2, h: 2 },
				{ x: 16, y: 28, w: 2, h: 2 },
				{ x: 18, y: 30, w: 12, h: 2 },
				{ x: 30, y: 28, w: 2, h: 2 },
				{ x: 32, y: 26, w: 2, h: 2 },
				{ x: 8, y: 2, w: 2, h: 2, opacity: 0.25 },
				{ x: 38, y: 8, w: 2, h: 2, opacity: 0.3 },
			],
			// Frame 3: down, no sparkles
			[
				{ x: 10, y: 10, w: 5, h: 8 },
				{ x: 15, y: 10, w: 5, h: 8 },
				{ x: 20, y: 10, w: 3, h: 8 },
				{ x: 27, y: 10, w: 3, h: 8 },
				{ x: 30, y: 10, w: 5, h: 8 },
				{ x: 35, y: 10, w: 5, h: 8 },
				{ x: 14, y: 28, w: 2, h: 2 },
				{ x: 16, y: 30, w: 2, h: 2 },
				{ x: 18, y: 32, w: 12, h: 2 },
				{ x: 30, y: 30, w: 2, h: 2 },
				{ x: 32, y: 28, w: 2, h: 2 },
			],
		],
		timing: 500,
		loop: true,
	},

	// ── WITNESS ──────────────────────────────────────────────────
	// 2 frames: camera bright (opacity 0.3) → camera dim (opacity 0.15)
	// Half-lidded eyes, muted mouth, muted lid bars
	witness: {
		frames: [
			// Frame 0: camera bright
			[
				{ x: 12, y: 16, w: 4, h: 3 },
				{ x: 18, y: 16, w: 4, h: 3 },
				{ x: 28, y: 16, w: 4, h: 3 },
				{ x: 34, y: 16, w: 4, h: 3 },
				{ x: 12, y: 14, w: 10, h: 2, opacity: 0.4 },
				{ x: 28, y: 14, w: 10, h: 2, opacity: 0.4 },
				{ x: 20, y: 28, w: 8, h: 2, opacity: 0.4 },
				{ x: 22, y: 8, w: 4, h: 3, opacity: 0.3 },
				{ x: 23, y: 9, w: 2, h: 1, fill: DARK },
			],
			// Frame 1: camera dim
			[
				{ x: 12, y: 16, w: 4, h: 3 },
				{ x: 18, y: 16, w: 4, h: 3 },
				{ x: 28, y: 16, w: 4, h: 3 },
				{ x: 34, y: 16, w: 4, h: 3 },
				{ x: 12, y: 14, w: 10, h: 2, opacity: 0.4 },
				{ x: 28, y: 14, w: 10, h: 2, opacity: 0.4 },
				{ x: 20, y: 28, w: 8, h: 2, opacity: 0.4 },
				{ x: 22, y: 8, w: 4, h: 3, opacity: 0.15 },
				{ x: 23, y: 9, w: 2, h: 1, fill: DARK },
			],
		],
		timing: 3000,
		loop: true,
	},

	// ── SLEEPY ───────────────────────────────────────────────────
	// 3 frames: drowsy → closing → asleep
	// All eye rects at opacity 0.4. z characters float up.
	sleepy: {
		frames: [
			// Frame 0: drowsy — slightly open eyes
			[
				{ x: 12, y: 15, w: 10, h: 3, opacity: 0.4 },
				{ x: 28, y: 15, w: 10, h: 3, opacity: 0.4 },
				{ x: 22, y: 28, w: 4, h: 2, opacity: 0.4 },
			],
			// Frame 1: closing — thinner bars
			[
				{ x: 12, y: 16, w: 10, h: 2, opacity: 0.4 },
				{ x: 28, y: 16, w: 10, h: 2, opacity: 0.4 },
				{ x: 22, y: 28, w: 4, h: 2, opacity: 0.4 },
			],
			// Frame 2: asleep — same thin bars
			[
				{ x: 12, y: 16, w: 10, h: 2, opacity: 0.4 },
				{ x: 28, y: 16, w: 10, h: 2, opacity: 0.4 },
				{ x: 22, y: 28, w: 4, h: 2, opacity: 0.4 },
			],
		],
		textFrames: [
			// Frame 0: two z's
			[
				{ x: 35, y: 12, size: 7, text: 'z', opacity: 0.5 },
				{ x: 39, y: 8, size: 5.5, text: 'z', opacity: 0.3 },
			],
			// Frame 1: three z's — drifting up
			[
				{ x: 36, y: 10, size: 7, text: 'z', opacity: 0.4 },
				{ x: 40, y: 6, size: 5.5, text: 'z', opacity: 0.25 },
				{ x: 43, y: 3, size: 4, text: 'z', opacity: 0.15 },
			],
			// Frame 2: two z's — higher
			[
				{ x: 37, y: 8, size: 6, text: 'z', opacity: 0.3 },
				{ x: 41, y: 4, size: 4.5, text: 'z', opacity: 0.2 },
			],
		],
		timing: 2000,
		loop: true,
	},

	// ── UNAMUSED ─────────────────────────────────────────────────
	// 1 frame: half-closed eyes (top bar + lower block), flat mouth
	unamused: {
		frames: [
			[
				{ x: 12, y: 15, w: 10, h: 2 },
				{ x: 12, y: 17, w: 10, h: 3 },
				{ x: 28, y: 15, w: 10, h: 2 },
				{ x: 28, y: 17, w: 10, h: 3 },
				{ x: 18, y: 28, w: 12, h: 2 },
			],
		],
		timing: 1000,
		loop: false,
	},

	// ── MISCHIEVOUS ──────────────────────────────────────────────
	// 3 frames: brow-up + smirk-up → hold → brow-settle + smirk-down
	// Left eye squinted, right eye wider with raised brow
	mischievous: {
		frames: [
			// Frame 0: brow up — raised brow pixel higher, smirk normal
			[
				// Left eye squinted
				{ x: 12, y: 14, w: 4, h: 5 },
				{ x: 16, y: 14, w: 4, h: 5 },
				{ x: 12, y: 11, w: 8, h: 2, opacity: 0.4 },
				// Right eye wider
				{ x: 28, y: 10, w: 4, h: 7 },
				{ x: 32, y: 10, w: 4, h: 7 },
				// Right brow — raised
				{ x: 28, y: 6, w: 10, h: 2 },
				{ x: 36, y: 4, w: 4, h: 2 },
				{ x: 38, y: 2, w: 2, h: 2 },
				// Smirk
				{ x: 18, y: 30, w: 8, h: 2 },
				{ x: 26, y: 28, w: 2, h: 2 },
				{ x: 28, y: 26, w: 2, h: 2 },
				{ x: 30, y: 24, w: 2, h: 2 },
				{ x: 16, y: 28, w: 2, h: 2 },
			],
			// Frame 1: hold — brow settles slightly, smirk curls higher
			[
				// Left eye squinted
				{ x: 12, y: 14, w: 4, h: 5 },
				{ x: 16, y: 14, w: 4, h: 5 },
				{ x: 12, y: 11, w: 8, h: 2, opacity: 0.4 },
				// Right eye wider
				{ x: 28, y: 10, w: 4, h: 7 },
				{ x: 32, y: 10, w: 4, h: 7 },
				// Right brow — same line but tip settles
				{ x: 28, y: 6, w: 10, h: 2 },
				{ x: 36, y: 4, w: 4, h: 2 },
				{ x: 38, y: 3, w: 2, h: 2 },
				// Smirk — curls up
				{ x: 18, y: 30, w: 8, h: 2 },
				{ x: 26, y: 28, w: 2, h: 2 },
				{ x: 28, y: 26, w: 2, h: 2 },
				{ x: 30, y: 23, w: 2, h: 2 },
				{ x: 16, y: 28, w: 2, h: 2 },
			],
			// Frame 2: brow settle + smirk down
			[
				// Left eye squinted
				{ x: 12, y: 14, w: 4, h: 5 },
				{ x: 16, y: 14, w: 4, h: 5 },
				{ x: 12, y: 11, w: 8, h: 2, opacity: 0.4 },
				// Right eye wider
				{ x: 28, y: 10, w: 4, h: 7 },
				{ x: 32, y: 10, w: 4, h: 7 },
				// Right brow — settled
				{ x: 28, y: 6, w: 10, h: 2 },
				{ x: 36, y: 4, w: 4, h: 2 },
				{ x: 38, y: 3, w: 2, h: 2 },
				// Smirk — back to normal
				{ x: 18, y: 30, w: 8, h: 2 },
				{ x: 26, y: 28, w: 2, h: 2 },
				{ x: 28, y: 26, w: 2, h: 2 },
				{ x: 30, y: 24, w: 2, h: 2 },
				{ x: 16, y: 28, w: 2, h: 2 },
			],
		],
		timing: () => 600 + Math.random() * 300,
		loop: true,
	},

	// ── PROTECTIVE ───────────────────────────────────────────────
	// 1 frame: alert eyes (wider, slightly narrowed), firm brows angled inward,
	// set mouth with muted corner pixels
	protective: {
		frames: [
			[
				// Left eye — wider with inner extension
				{ x: 12, y: 14, w: 4, h: 5 },
				{ x: 16, y: 14, w: 4, h: 5 },
				{ x: 20, y: 14, w: 2, h: 5 },
				// Right eye — wider with inner extension
				{ x: 28, y: 14, w: 2, h: 5 },
				{ x: 30, y: 14, w: 4, h: 5 },
				{ x: 34, y: 14, w: 4, h: 5 },
				// Left brow — angled inward (lower toward center)
				{ x: 14, y: 11, w: 6, h: 2 },
				{ x: 12, y: 10, w: 4, h: 2 },
				// Right brow — angled inward (lower toward center)
				{ x: 30, y: 11, w: 6, h: 2 },
				{ x: 34, y: 10, w: 4, h: 2 },
				// Mouth — firm line with muted corners
				{ x: 18, y: 28, w: 12, h: 2 },
				{ x: 16, y: 30, w: 2, h: 2, opacity: 0.4 },
				{ x: 30, y: 30, w: 2, h: 2, opacity: 0.4 },
			],
		],
		timing: 1000,
		loop: false,
	},
};
