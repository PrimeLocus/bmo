# Personality Engine Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a continuous personality engine that computes a three-dimensional personality vector (wonder/reflection/mischief) from sensor state, with two-layer momentum, mode derivation, contextual interpretation, and snapshot persistence.

**Architecture:** A `PersonalityEngine` class runs a signal loop every 5 seconds inside the MQTT bridge process. It reads sensor state, applies tunable signal rules, updates fast (signal) and slow (momentum) EMA layers, blends them into an output vector, derives mode labels, generates natural-language interpretations, and persists snapshots to SQLite. The engine is designed for clean extraction to the Pi later (TODO-B).

**Tech Stack:** TypeScript, Vitest, SvelteKit server-side, Drizzle ORM + SQLite, MQTT.js, SSE

**Spec:** `docs/superpowers/specs/2026-03-23-personality-engine-design.md`

---

## File Structure

### New Files (create)

| File | Responsibility |
|------|---------------|
| `src/lib/server/personality/types.ts` | PersonalityVector, SignalRule, SensorState, EngineConfig interfaces |
| `src/lib/server/personality/signal-rules.ts` | Sensor-to-dimension rules, rule combination, signal target computation |
| `src/lib/server/personality/mode-classifier.ts` | Mode centroids, nearest-centroid classification, hysteresis |
| `src/lib/server/personality/interpreter.ts` | Contextual sentence builder (native phenomenology) |
| `src/lib/server/personality/engine.ts` | PersonalityEngine class — loop, layers, blend, lifecycle |
| `src/lib/server/personality/compaction.ts` | Tiered retention, notable detection, compaction job |
| `src/lib/server/personality/signal-rules.test.ts` | Signal rule tests |
| `src/lib/server/personality/mode-classifier.test.ts` | Mode classifier tests |
| `src/lib/server/personality/interpreter.test.ts` | Interpreter tests |
| `src/lib/server/personality/engine.test.ts` | Engine integration tests |
| `src/lib/server/personality/compaction.test.ts` | Compaction tests |

### Modified Files

| File | What Changes |
|------|-------------|
| `src/lib/server/db/schema.ts` | Add `personalitySnapshots` table |
| `src/lib/server/db/index.ts` | Add `CREATE TABLE IF NOT EXISTS` fallback + timestamp index, export raw `sqlite` |
| `src/lib/server/mqtt/topics.ts` | Add `beau/personality/*` topics, export new topic constants |
| `src/lib/server/mqtt/bridge.ts` | Import engine, instantiate, pipe sensor state, update BeauState |
| `src/lib/stores/beau.svelte.ts` | Add vector fields to BeauState type + defaults, add label maps, emit `bmo:personality` |
| `src/hooks.server.ts` | Start engine after MQTT connect, schedule compaction + backup |
| `src/lib/server/prompt/policies.ts` | Update EMOTIONAL_STATE fallback |

---

## Task 1: Types & Interfaces

**Files:**
- Create: `src/lib/server/personality/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/lib/server/personality/types.ts

/**
 * TODO-B: EXTRACTION TARGET — Pi Personality Service
 * This module runs in the SvelteKit server process as a temporary host.
 * When the Pi is assembled, extract to a standalone process that:
 * - Reads sensors directly (GPIO, I2C, USB)
 * - Publishes personality vector via MQTT
 * - The terminal becomes a consumer, not the host
 * See: docs/bible/beaus-bible.md §24
 */

/** Three-dimensional personality state, each 0.0–1.0 */
export type PersonalityVector = {
	wonder: number;
	reflection: number;
	mischief: number;
};

/** Current sensor readings consumed by the signal loop */
export type SensorState = {
	lux: number | null;
	presenceState: 'occupied' | 'empty' | 'uncertain';
	sleepState: 'awake' | 'settling' | 'asleep' | 'waking';
	interactionAge: number; // seconds since last wake word / dispatch
	weather: string | null; // e.g. "rain", "clear", "overcast"
	seasonalContext: string | null; // e.g. "crawfish season"
	timeOfDay: Date;
	resolumeActive: boolean;
};

/** Binary activity flags, refreshed every ~30 seconds */
export type ActivitySignals = {
	haikuRecent: boolean; // haiku written in last 30 min
	journalRecent: boolean; // journal entry in last 30 min
	dispatchRecent: boolean; // dispatch completed in last 30 min
	ideaRecent: boolean; // idea captured in last 30 min
	noticingRecent: boolean; // noticing surfaced in last 30 min
	debriefRecent: boolean; // resolume debrief in last 30 min
};

/** A single signal rule: sensor condition → dimension nudges */
export type SignalRule = {
	name: string;
	condition: (sensor: SensorState, activity: ActivitySignals) => boolean;
	wonder: number; // additive nudge, can be negative
	reflection: number;
	mischief: number;
};

/** Engine tuning constants */
export type EngineConfig = {
	tickInterval: number; // ms, default 5000
	signalAlphas: PersonalityVector; // per-dimension signal layer alpha
	momentumAlpha: number; // uniform momentum layer alpha
	blendRatio: number; // 0–1, signal weight (1 - this = momentum weight)
	restingBaseline: PersonalityVector; // starting/resting state
	snapshotDeltaThreshold: number; // min change to trigger delta snapshot
	snapshotIntervalTicks: number; // ticks between interval snapshots
	activityCacheInterval: number; // ms, default 30000
	diagnosticMode: boolean; // show raw layers in BeauState
};

/** Snapshot trigger/reason */
export type SnapshotReason = 'delta' | 'interval' | 'manual';

/** CustomEvent payload for bmo:personality */
export type PersonalityChangeDetail = {
	vector: PersonalityVector;
	mode: string;
	previousMode: string | null;
	interpretation: string;
};

/** Engine public interface (Pi extraction boundary) */
export interface IPersonalityEngine {
	start(): void;
	stop(): void;
	getVector(): PersonalityVector;
	getSignalLayer(): PersonalityVector;
	getMomentumLayer(): PersonalityVector;
	getInterpretation(): string;
	getDerivedMode(): string;
	forceMode(mode: string, reason: string): void;
	onVectorChange(callback: (vector: PersonalityVector) => void): void;
	reflect(): Promise<PersonalityVector | null>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd beau-terminal && npx svelte-check --threshold error`
Expected: No new errors introduced

- [ ] **Step 3: Commit**

```bash
git add beau-terminal/src/lib/server/personality/types.ts
git commit -m "feat(personality): add types and interfaces"
```

---

## Task 2: Schema — personality_snapshots Table

**Files:**
- Modify: `src/lib/server/db/schema.ts`

- [ ] **Step 1: Add the personality_snapshots table to schema.ts**

After the last table definition (around line 350), add:

```typescript
// ── Personality Engine ──────────────────────────────────
export const personalitySnapshots = sqliteTable('personality_snapshots', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	timestamp: text('timestamp').notNull().default(sql`(datetime('now'))`),
	wonder: real('wonder').notNull(),
	reflection: real('reflection').notNull(),
	mischief: real('mischief').notNull(),
	signalWonder: real('signal_wonder').notNull(),
	signalReflection: real('signal_reflection').notNull(),
	signalMischief: real('signal_mischief').notNull(),
	momentumWonder: real('momentum_wonder').notNull(),
	momentumReflection: real('momentum_reflection').notNull(),
	momentumMischief: real('momentum_mischief').notNull(),
	derivedMode: text('derived_mode').notNull(),
	interpretation: text('interpretation'),
	sources: text('sources').notNull().default('[]'),
	snapshotReason: text('snapshot_reason').notNull().default('interval'),
	isNotable: integer('is_notable').notNull().default(0),
});
```

Note: Import `real` from drizzle-orm/sqlite-core if not already imported.

- [ ] **Step 2: Verify Drizzle import includes `real`**

Check the import line at top of schema.ts. If `real` is not imported, add it:

```typescript
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
```

- [ ] **Step 3: Add CREATE TABLE fallback + index in db/index.ts**

In `src/lib/server/db/index.ts`, after the existing `CREATE TABLE IF NOT EXISTS` blocks, add:

```sql
CREATE TABLE IF NOT EXISTS personality_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  wonder REAL NOT NULL,
  reflection REAL NOT NULL,
  mischief REAL NOT NULL,
  signal_wonder REAL NOT NULL,
  signal_reflection REAL NOT NULL,
  signal_mischief REAL NOT NULL,
  momentum_wonder REAL NOT NULL,
  momentum_reflection REAL NOT NULL,
  momentum_mischief REAL NOT NULL,
  derived_mode TEXT NOT NULL,
  interpretation TEXT,
  sources TEXT NOT NULL DEFAULT '[]',
  snapshot_reason TEXT NOT NULL DEFAULT 'interval',
  is_notable INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_personality_snapshots_ts ON personality_snapshots(timestamp);
```

Also export the raw `sqlite` instance for the backup API:

```typescript
export { sqlite };  // needed by personality backup (.backup() is a better-sqlite3 API)
```

- [ ] **Step 4: Run dev server to verify table creation**

Run: `cd beau-terminal && npm run dev`
Expected: Server starts, table created. Verify with:
`cd beau-terminal && sqlite3 data/beau.db ".schema personality_snapshots"`

- [ ] **Step 5: Commit**

```bash
git add beau-terminal/src/lib/server/db/schema.ts beau-terminal/src/lib/server/db/index.ts
git commit -m "feat(personality): add personality_snapshots table + index"
```

---

## Task 3: MQTT Topics

**Files:**
- Modify: `src/lib/server/mqtt/topics.ts`

- [ ] **Step 1: Add personality topics to TOPICS object**

Add a `personality` section to the TOPICS object (before the closing `} as const`):

```typescript
	personality: {
		vector: 'beau/personality/vector',
		signal: 'beau/personality/signal',
		momentum: 'beau/personality/momentum',
		mode: 'beau/personality/mode',
		interpret: 'beau/personality/interpret',
	},
```

- [ ] **Step 2: Run existing topics test**

Run: `cd beau-terminal && npx vitest run src/lib/server/mqtt/topics.test.ts`
Expected: PASS (existing tests still pass)

- [ ] **Step 3: Commit**

```bash
git add beau-terminal/src/lib/server/mqtt/topics.ts
git commit -m "feat(personality): add MQTT personality topics"
```

---

## Task 4: Signal Rules

**Files:**
- Create: `src/lib/server/personality/signal-rules.ts`
- Create: `src/lib/server/personality/signal-rules.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/personality/signal-rules.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement signal-rules.ts**

```typescript
// src/lib/server/personality/signal-rules.ts

/**
 * TODO-B: EXTRACTION TARGET — Pi Personality Service
 * See: docs/bible/beaus-bible.md §24
 */

import type { PersonalityVector, SensorState, ActivitySignals, SignalRule } from './types.js';

export const RESTING_BASELINE: PersonalityVector = {
	wonder: 0.5,
	reflection: 0.3,
	mischief: 0.3,
};

function hour(date: Date): number {
	return date.getHours();
}

function isLateNight(date: Date): boolean {
	const h = hour(date);
	return h >= 1 && h < 5;
}

function isDawnDusk(date: Date): boolean {
	const h = hour(date);
	return (h >= 5 && h < 7) || (h >= 17 && h < 20);
}

function isStormWeather(weather: string | null): boolean {
	if (!weather) return false;
	const w = weather.toLowerCase();
	return w.includes('rain') || w.includes('storm') || w.includes('thunder') || w.includes('drizzle');
}

function isClearWarm(weather: string | null): boolean {
	if (!weather) return false;
	const w = weather.toLowerCase();
	return w.includes('clear') || w.includes('sunny');
}

function isAugust(date: Date): boolean {
	return date.getMonth() === 7;
}

function isLateOctober(date: Date): boolean {
	return date.getMonth() === 9 && date.getDate() >= 15;
}

/** All signal rules — the "parenting" config */
export const SIGNAL_RULES: SignalRule[] = [
	// ── Environmental rules ──
	{
		name: 'lux:low',
		condition: (s) => s.lux !== null && s.lux < 20 && s.lux >= 5,
		wonder: 0, reflection: 0.3, mischief: 0,
	},
	{
		name: 'lux:very-low+late',
		condition: (s) => s.lux !== null && s.lux < 5 && isLateNight(s.timeOfDay),
		wonder: 0, reflection: 0.5, mischief: -0.1,
	},
	{
		name: 'time:late-night',
		condition: (s) => isLateNight(s.timeOfDay),
		wonder: 0, reflection: 0.4, mischief: -0.2,
	},
	{
		name: 'time:dawn-dusk',
		condition: (s) => isDawnDusk(s.timeOfDay),
		wonder: 0.2, reflection: 0.2, mischief: 0,
	},
	{
		name: 'presence:empty+extended',
		condition: (s) => s.presenceState === 'empty' && s.interactionAge > 300,
		wonder: 0, reflection: 0.3, mischief: -0.3,
	},
	{
		name: 'presence:occupied+recent',
		condition: (s) => s.presenceState === 'occupied' && s.interactionAge < 120,
		wonder: 0, reflection: -0.1, mischief: 0.2,
	},
	{
		name: 'interaction:active',
		condition: (s) => s.interactionAge < 60,
		wonder: 0.1, reflection: -0.1, mischief: 0.3,
	},
	{
		name: 'interaction:stale',
		condition: (s) => s.interactionAge > 1800,
		wonder: 0, reflection: 0.2, mischief: -0.1,
	},
	{
		name: 'weather:storm',
		condition: (s) => isStormWeather(s.weather),
		wonder: 0.3, reflection: 0.2, mischief: 0,
	},
	{
		name: 'weather:clear-warm',
		condition: (s) => isClearWarm(s.weather),
		wonder: 0.1, reflection: 0, mischief: 0.1,
	},
	{
		name: 'season:august',
		condition: (s) => isAugust(s.timeOfDay),
		wonder: -0.1, reflection: 0.1, mischief: -0.1,
	},
	{
		name: 'season:late-october',
		condition: (s) => isLateOctober(s.timeOfDay),
		wonder: 0.3, reflection: 0.1, mischief: 0.1,
	},
	{
		name: 'resolume:active',
		condition: (s) => s.resolumeActive,
		wonder: 0.2, reflection: 0.1, mischief: -0.3,
	},
	{
		name: 'sleep:settling',
		condition: (s) => s.sleepState === 'settling',
		wonder: -0.2, reflection: 0.3, mischief: -0.3,
	},
	{
		name: 'sleep:waking',
		condition: (s) => s.sleepState === 'waking',
		wonder: 0.3, reflection: 0, mischief: 0,
	},

	// ── Activity signal rules ──
	{
		name: 'activity:haiku',
		condition: (_s, a) => a.haikuRecent,
		wonder: 0.1, reflection: 0.3, mischief: 0,
	},
	{
		name: 'activity:journal',
		condition: (_s, a) => a.journalRecent,
		wonder: 0, reflection: 0.4, mischief: 0,
	},
	{
		name: 'activity:dispatch',
		condition: (_s, a) => a.dispatchRecent,
		wonder: 0.1, reflection: 0, mischief: 0.2,
	},
	{
		name: 'activity:idea',
		condition: (_s, a) => a.ideaRecent,
		wonder: 0.3, reflection: 0, mischief: 0.1,
	},
	{
		name: 'activity:noticing',
		condition: (_s, a) => a.noticingRecent,
		wonder: 0.2, reflection: 0.2, mischief: 0,
	},
	{
		name: 'activity:debrief',
		condition: (_s, a) => a.debriefRecent,
		wonder: 0.2, reflection: 0.3, mischief: 0,
	},
];

/** Compute signal targets from sensor state + activity flags */
export function computeSignalTargets(
	sensor: SensorState,
	activity: ActivitySignals,
): PersonalityVector & { sources: string[] } {
	let wonder = RESTING_BASELINE.wonder;
	let reflection = RESTING_BASELINE.reflection;
	let mischief = RESTING_BASELINE.mischief;
	const sources: string[] = [];

	for (const rule of SIGNAL_RULES) {
		if (rule.condition(sensor, activity)) {
			wonder += rule.wonder;
			reflection += rule.reflection;
			mischief += rule.mischief;
			sources.push(rule.name);
		}
	}

	return {
		wonder: Math.max(0, Math.min(1, wonder)),
		reflection: Math.max(0, Math.min(1, reflection)),
		mischief: Math.max(0, Math.min(1, mischief)),
		sources,
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/personality/signal-rules.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add beau-terminal/src/lib/server/personality/signal-rules.ts beau-terminal/src/lib/server/personality/signal-rules.test.ts
git commit -m "feat(personality): signal rules — sensor-to-dimension mapping"
```

---

## Task 5: Mode Classifier

**Files:**
- Create: `src/lib/server/personality/mode-classifier.ts`
- Create: `src/lib/server/personality/mode-classifier.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/personality/mode-classifier.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement mode-classifier.ts**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/personality/mode-classifier.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add beau-terminal/src/lib/server/personality/mode-classifier.ts beau-terminal/src/lib/server/personality/mode-classifier.test.ts
git commit -m "feat(personality): mode classifier — centroid derivation with hysteresis"
```

---

## Task 6: Contextual Interpreter

**Files:**
- Create: `src/lib/server/personality/interpreter.ts`
- Create: `src/lib/server/personality/interpreter.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/personality/interpreter.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement interpreter.ts**

Build a contextual sentence builder with phrase pools per dimension intensity tier. The implementation should:

1. Determine the dominant dimension and its intensity (quiet: 0–0.25, present: 0.25–0.5, strong: 0.5–0.75, intense: 0.75–1.0)
2. Select opening phrases from the dominant dimension's pool at the appropriate intensity
3. Add secondary dimension color if it's above "present" threshold
4. Add contextual modifiers for weather, time, recent activity (from sources array)
5. Return a 1–3 sentence interpretation

The phrase pools should contain 4–6 options per tier per dimension, selected via a simple hash of the vector values to be deterministic but varied. Do NOT use `Math.random()` — the same vector + context should produce the same interpretation.

Keep the implementation under 200 lines. The LLM reflection will replace this later with richer output.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/personality/interpreter.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add beau-terminal/src/lib/server/personality/interpreter.ts beau-terminal/src/lib/server/personality/interpreter.test.ts
git commit -m "feat(personality): contextual interpreter — native phenomenology"
```

---

## Task 7: Engine Core

**Files:**
- Create: `src/lib/server/personality/engine.ts`
- Create: `src/lib/server/personality/engine.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/personality/engine.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement engine.ts**

The engine class should:

1. Hold signal layer, momentum layer, and output vector as internal state
2. Expose `tick(sensor, activity)` for manual stepping (testing) and `start()/stop()` for the interval loop
3. On each tick: compute signal targets → EMA signal layer → EMA momentum layer → blend → classify mode → interpret → notify listeners → check snapshot threshold
4. `start()` accepts a `getSensorState()` and `getActivitySignals()` callback so it can pull current values each tick
5. `getLastSnapshot()` returns snapshot data for the persistence layer to write (the engine does NOT import the database — the bridge handles persistence)
6. `restoreMomentum(vector)` for startup restoration
7. `forceMode(mode, reason)` logs a warning and overrides the classifier
8. `reflect()` returns `Promise<null>` (no-op)

Keep the class under 200 lines. The engine is the orchestrator — it delegates to signal-rules, mode-classifier, and interpreter.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/personality/engine.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add beau-terminal/src/lib/server/personality/engine.ts beau-terminal/src/lib/server/personality/engine.test.ts
git commit -m "feat(personality): engine core — signal loop, layers, blend"
```

---

## Task 8: Compaction & Backup

**Files:**
- Create: `src/lib/server/personality/compaction.ts`
- Create: `src/lib/server/personality/compaction.test.ts`

- [ ] **Step 1: Write the failing tests**

Test `isNotable()` detection (including large-delta) and the retention tier classification.

```typescript
// src/lib/server/personality/compaction.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/personality/compaction.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement compaction.ts**

Implement:
- `isNotable(vector, previousVector, hasCreativeActivity, hadModeTransition)` — returns boolean. Checks: any dimension > 0.85 or < 0.15 (extreme), any dimension delta > 0.2 vs previousVector (large change), creative coincidence, mode transition.
- `getRetentionTier(timestamp, now)` — returns 'hot' | 'warm' | 'cool' | 'cold'
- `runCompaction(db)` — queries personality_snapshots, deletes non-notable rows outside their tier's resolution. Preserves notable rows unconditionally. Called on startup and every 24 hours.
- `exportPersonalityTimeline(db, outputPath)` — writes JSON export of snapshots following tier-based resolution.
- `scheduleBackup(sqlite, backupPath, intervalMs)` — accepts the raw `better-sqlite3` instance (exported from `db/index.ts` as `sqlite`), calls `.backup()` on the given interval. Returns cleanup function. Note: `.backup()` is a `better-sqlite3` API, not Drizzle — this is why we export the raw `sqlite` instance.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/personality/compaction.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add beau-terminal/src/lib/server/personality/compaction.ts beau-terminal/src/lib/server/personality/compaction.test.ts
git commit -m "feat(personality): compaction — tiered retention + backup"
```

---

## Task 9: BeauState Integration

**Files:**
- Modify: `src/lib/server/mqtt/bridge.ts`
- Modify: `src/lib/stores/beau.svelte.ts`

- [ ] **Step 1: Add personality fields to BeauState type in bridge.ts**

In the BeauState type definition (around line 19), add after the existing fields:

```typescript
	// ── Personality Engine ──
	personalityVector: { wonder: number; reflection: number; mischief: number };
	personalityInterpretation: string;
	signalLayer: { wonder: number; reflection: number; mischief: number };
	momentumLayer: { wonder: number; reflection: number; mischief: number };
	signalSources: string[];
```

In the DEFAULT_STATE (around line 53), add defaults:

```typescript
	personalityVector: { wonder: 0.5, reflection: 0.3, mischief: 0.3 },
	personalityInterpretation: '',
	signalLayer: { wonder: 0.5, reflection: 0.3, mischief: 0.3 },
	momentumLayer: { wonder: 0.5, reflection: 0.3, mischief: 0.3 },
	signalSources: [],
```

- [ ] **Step 2: Mirror the same fields in beau.svelte.ts**

Update the `defaultState` object in `beau.svelte.ts` to include the same new fields with the same defaults. Add to EMOTION_LABELS:

```typescript
export const EMOTION_LABELS: Record<string, string> = {
	curious: 'Curious',
	contemplative: 'Contemplative',
	playful: 'Playful',
	sleepy: 'Sleepy',
	wonder: 'Wonder',
	reflective: 'Reflective',
	mischievous: 'Mischievous',
	peaceful: 'Peaceful',
};
```

Also add `bmo:personality` CustomEvent dispatch in the SSE `onmessage` handler. After `Object.assign(beauState, data)`, detect vector changes and emit:

```typescript
// Track previous vector for delta detection
const prevVector = { ...beauState.personalityVector };
Object.assign(beauState, data);

// Emit bmo:personality on significant change
if (typeof window !== 'undefined' && data.personalityVector) {
	const v = data.personalityVector;
	const delta = Math.max(
		Math.abs(v.wonder - prevVector.wonder),
		Math.abs(v.reflection - prevVector.reflection),
		Math.abs(v.mischief - prevVector.mischief),
	);
	if (delta > 0.1 || (data.mode && data.mode !== prevMode)) {
		window.dispatchEvent(new CustomEvent('bmo:personality', {
			detail: {
				vector: v,
				mode: data.mode ?? beauState.mode,
				previousMode: prevMode !== data.mode ? prevMode : null,
				interpretation: data.personalityInterpretation ?? '',
			},
		}));
	}
	prevMode = data.mode ?? beauState.mode;
}
```

This follows the existing `bmo:react` CustomEvent pattern from StatusBar.

- [ ] **Step 3: Add engine instantiation in bridge.ts**

In bridge.ts, after the MQTT client setup and wellness coordinator:

1. Import `PersonalityEngine` and default config
2. Create the engine instance
3. In the engine's `onVectorChange` callback: update `state` with new vector fields, compute deprecated `emotionalState`, call `broadcast()`
4. Wire `start()` with callbacks that return current sensor state from `state` and activity signals from the cache

**Deprecated `emotionalState` mapping** — keeps BmoFace/StatusBar working until sub-project #2:

```typescript
function vectorToEmotionalState(v: { wonder: number; reflection: number; mischief: number }): string {
	const dominant = Math.max(v.wonder, v.reflection, v.mischief);
	if (dominant === v.reflection) return dominant > 0.6 ? 'reflective' : 'contemplative';
	if (dominant === v.mischief) return dominant > 0.6 ? 'mischievous' : 'playful';
	return dominant > 0.6 ? 'wonder' : 'curious';
}
```

**Activity signal cache** — queries the database every 30 seconds for recent creative events:

```typescript
import { haikus, journalEntries, dispatches, ideas, noticings, resolumeSessions } from '../db/schema.js';
import { gte } from 'drizzle-orm';

let activityCache: ActivitySignals = { /* all false */ };
let activityCacheTimer: ReturnType<typeof setInterval> | null = null;

function refreshActivityCache() {
	const cutoff = new Date(Date.now() - 30 * 60 * 1000)
		.toISOString().replace('T', ' ').slice(0, 19); // SQLite datetime format
	try {
		activityCache = {
			haikuRecent: !!db.select().from(haikus)
				.where(gte(haikus.createdAt, cutoff)).limit(1).get(),
			journalRecent: !!db.select().from(journalEntries)
				.where(gte(journalEntries.createdAt, cutoff)).limit(1).get(),
			dispatchRecent: !!db.select().from(dispatches)
				.where(gte(dispatches.createdAt, cutoff)).limit(1).get(),
			ideaRecent: !!db.select().from(ideas)
				.where(gte(ideas.createdAt, cutoff)).limit(1).get(),
			noticingRecent: !!db.select().from(noticings)
				.where(gte(noticings.surfacedAt, cutoff)).limit(1).get(),
			debriefRecent: !!db.select().from(resolumeSessions)
				.where(gte(resolumeSessions.endedAt, cutoff)).limit(1).get(),
		};
	} catch (e) {
		console.error('[personality] activity cache refresh failed:', e);
	}
}

// Start cache refresh interval
activityCacheTimer = setInterval(refreshActivityCache, 30_000);
refreshActivityCache(); // initial fill
```

Note: SQLite `datetime('now')` uses space-separated format (`2026-03-22 14:30:45`), not ISO `T`-separated. The cutoff conversion handles this. Verify the actual column types in schema.ts — some use `default(sql\`(datetime('now'))\`)` (text) while others may differ. Adjust `gte()` queries accordingly.

- [ ] **Step 4: Add snapshot persistence**

In the `onVectorChange` callback, when `engine.getLastSnapshot()` returns data:

```typescript
import { db } from '../db/index.js';
import { personalitySnapshots } from '../db/schema.js';

// After vector change:
const snap = engine.getLastSnapshot();
if (snap) {
	try {
		db.insert(personalitySnapshots).values({
			wonder: snap.wonder,
			reflection: snap.reflection,
			// ... all fields
		}).run();
	} catch (e) {
		console.error('[personality] snapshot write failed:', e);
	}
}
```

- [ ] **Step 5: Add momentum restoration on startup**

In the engine initialization section, before calling `engine.start()`:

```typescript
// Restore last momentum layer from DB
const lastSnapshot = db.select()
	.from(personalitySnapshots)
	.orderBy(desc(personalitySnapshots.timestamp))
	.limit(1)
	.get();
if (lastSnapshot) {
	engine.restoreMomentum({
		wonder: lastSnapshot.momentumWonder,
		reflection: lastSnapshot.momentumReflection,
		mischief: lastSnapshot.momentumMischief,
	});
	console.log('[personality] Restored momentum from last snapshot');
}
```

- [ ] **Step 6: Verify dev server starts and vector appears in SSE**

Run: `cd beau-terminal && npm run dev`
Open: `http://localhost:4242/api/sse` in browser
Expected: SSE events include `personalityVector`, `personalityInterpretation`, `signalLayer`, `momentumLayer`, `signalSources` fields. Values should shift based on time of day.

- [ ] **Step 7: Commit**

```bash
git add beau-terminal/src/lib/server/mqtt/bridge.ts beau-terminal/src/lib/stores/beau.svelte.ts
git commit -m "feat(personality): wire engine into bridge — BeauState + snapshots"
```

---

## Task 10: Startup, MQTT Publishing & Prompt Assembly

**Files:**
- Modify: `src/hooks.server.ts`
- Modify: `src/lib/server/prompt/policies.ts`
- Modify: `src/lib/server/mqtt/bridge.ts` (MQTT publish)

- [ ] **Step 1: Add MQTT publishing for personality topics**

In bridge.ts, in the `onVectorChange` callback (added in Task 9), after updating state:

```typescript
import { TOPICS } from './topics.js';

// Publish personality vector to MQTT
if (client?.connected) {
	client.publish(TOPICS.personality.vector, JSON.stringify(engine.getVector()));
	client.publish(TOPICS.personality.mode, engine.getDerivedMode());
	client.publish(TOPICS.personality.interpret, engine.getInterpretation());
	// backward compat
	client.publish(TOPICS.state.mode, engine.getDerivedMode());

	if (config.diagnosticMode) {
		client.publish(TOPICS.personality.signal, JSON.stringify(engine.getSignalLayer()));
		client.publish(TOPICS.personality.momentum, JSON.stringify(engine.getMomentumLayer()));
	}
}
```

- [ ] **Step 2: Update EMOTIONAL_STATE fallback in policies.ts**

Change the PLACEHOLDER_FALLBACKS entry:

```typescript
EMOTIONAL_STATE: 'present and quiet, settling in',
```

This replaces the single-word 'curious' with a contextual framing phrase, matching the bible's "personality as felt, not known" principle.

- [ ] **Step 2b: Wire live interpretation into prompt assembly callers**

Search the codebase for all callers of `assemblePrompt()` (likely in a route handler or dispatch endpoint). Each caller passes a `values: Record<string, string>` object. Ensure these callers now read the live interpretation from BeauState:

```typescript
// In the caller of assemblePrompt():
import { getState } from '$lib/server/mqtt/bridge.js';

const state = getState();
const values = {
	// ... existing values
	EMOTIONAL_STATE: state.personalityInterpretation || PLACEHOLDER_FALLBACKS.EMOTIONAL_STATE,
	MODE: state.mode,
};
```

If no caller of `assemblePrompt()` exists yet (because the dispatch system is not fully built), this is a known gap — the engine exposes the value, and the dispatch system will consume it when wired in sub-project #4.

- [ ] **Step 3: Wire compaction and backup in hooks.server.ts or bridge.ts**

After engine start, add:

```typescript
import { runCompaction, scheduleBackup } from '../personality/compaction.js';
import { sqlite } from '../db/index.js';  // raw better-sqlite3 instance for .backup()

// Run compaction on startup (catch up if missed)
try { runCompaction(db); } catch (e) { console.error('[personality] compaction failed:', e); }

// Schedule daily compaction
setInterval(() => {
	try { runCompaction(db); } catch (e) { console.error('[personality] compaction failed:', e); }
}, 24 * 60 * 60 * 1000);

// Schedule DB backup every 6 hours
const backupPath = process.env.DB_BACKUP_PATH || 'data/backups';
scheduleBackup(sqlite, backupPath, 6 * 60 * 60 * 1000);

console.log('[personality] Engine running in SvelteKit host (TODO-B: extract to Pi)');
```

- [ ] **Step 4: Add engine startup log**

Verify the console output shows:

```
[personality] Engine running in SvelteKit host (TODO-B: extract to Pi)
[personality] Restored momentum from last snapshot  (if snapshots exist)
```

- [ ] **Step 5: Verify full stack**

Run: `cd beau-terminal && npm run dev`

1. Open `http://localhost:4242` — dashboard should load without errors
2. Open `http://localhost:4242/api/sse` — SSE stream should include personality fields
3. Check console — engine startup messages should appear
4. Wait 30 seconds — personality vector should shift based on current conditions
5. Check `data/beau.db` — `personality_snapshots` table should have rows

- [ ] **Step 6: Run all tests**

Run: `cd beau-terminal && npx vitest run`
Expected: All tests pass (existing + new personality tests)

- [ ] **Step 7: Commit**

```bash
git add beau-terminal/src/hooks.server.ts beau-terminal/src/lib/server/mqtt/bridge.ts beau-terminal/src/lib/server/prompt/policies.ts
git commit -m "feat(personality): startup orchestration, MQTT publish, prompt integration"
```

---

## Task 11: Final Verification & Cleanup

- [ ] **Step 1: Run the full test suite**

Run: `cd beau-terminal && npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Verify personality engine behavioral test**

Start the dev server. Open the SSE stream. Observe:

1. **Daytime, clear weather:** wonder should be slightly above baseline (~0.6), reflection near baseline, mischief near baseline. Mode: ambient.
2. **Wait until late night (or mock time):** reflection should climb, mischief should drop. If strong enough, mode should shift to archivist.
3. **Interpretation text should be unique and contextual** — references time, weather, activity.

- [ ] **Step 3: Verify backward compatibility**

1. StatusBar should still display a mode label (ambient/witness/etc)
2. BmoFace should still render (emotionalState is computed, not removed)
3. Existing pages should load without errors

- [ ] **Step 4: Verify snapshots in database**

```bash
cd beau-terminal && sqlite3 data/beau.db "SELECT COUNT(*) FROM personality_snapshots"
```
Expected: Row count > 0 after running for a few minutes

- [ ] **Step 5: Commit any final adjustments (if any files changed)**

Stage only the specific files that were adjusted:

```bash
git add beau-terminal/src/lib/server/personality/ beau-terminal/src/lib/server/mqtt/ beau-terminal/src/lib/server/db/ beau-terminal/src/lib/stores/ beau-terminal/src/hooks.server.ts
git commit -m "feat(personality): final verification and cleanup"
```

---

## Summary

| Task | What It Builds | Tests |
|------|---------------|-------|
| 1 | Types & interfaces | TypeScript compilation |
| 2 | Schema — personality_snapshots table | Auto-migration verification |
| 3 | MQTT personality topics | Existing topic tests |
| 4 | Signal rules (sensor → dimension mapping) | 7 unit tests |
| 5 | Mode classifier (centroid + hysteresis) | 7 unit tests |
| 6 | Contextual interpreter (native phenomenology) | 5 unit tests |
| 7 | Engine core (loop, layers, blend) | 10 unit tests |
| 8 | Compaction & backup | 6 unit tests |
| 9 | BeauState integration + snapshots | SSE verification |
| 10 | Startup, MQTT publish, prompt assembly | Full stack verification |
| 11 | Final verification & cleanup | Full test suite |
