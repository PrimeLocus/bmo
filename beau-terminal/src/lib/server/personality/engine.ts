// src/lib/server/personality/engine.ts

/**
 * TODO-B: EXTRACTION TARGET — Pi Personality Service
 * This module runs in the SvelteKit server process as a temporary host.
 * When the Pi is assembled, extract to a standalone process that publishes
 * the personality vector via MQTT. The terminal becomes a consumer.
 * See: docs/bible/beaus-bible.md §24
 */

import type {
	PersonalityVector,
	SensorState,
	ActivitySignals,
	EngineConfig,
	SnapshotReason,
} from './types.js';
import { computeSignalTargets } from './signal-rules.js';
import { ModeClassifier } from './mode-classifier.js';
import { interpretVector } from './interpreter.js';

export const DEFAULT_CONFIG: EngineConfig = {
	tickInterval: 5000,
	signalAlphas: { wonder: 0.15, reflection: 0.08, mischief: 0.25 },
	momentumAlpha: 0.002,
	blendRatio: 0.6,
	restingBaseline: { wonder: 0.5, reflection: 0.3, mischief: 0.3 },
	snapshotDeltaThreshold: 0.05,
	snapshotIntervalTicks: 60,
	activityCacheInterval: 30000,
	diagnosticMode: true,
};

export type EngineSnapshot = {
	wonder: number;
	reflection: number;
	mischief: number;
	signalWonder: number;
	signalReflection: number;
	signalMischief: number;
	momentumWonder: number;
	momentumReflection: number;
	momentumMischief: number;
	derivedMode: string;
	interpretation: string;
	sources: string[];
	snapshotReason: SnapshotReason;
};

function cloneVec(v: PersonalityVector): PersonalityVector {
	return { wonder: v.wonder, reflection: v.reflection, mischief: v.mischief };
}

function maxDelta(a: PersonalityVector, b: PersonalityVector): number {
	return Math.max(
		Math.abs(a.wonder - b.wonder),
		Math.abs(a.reflection - b.reflection),
		Math.abs(a.mischief - b.mischief),
	);
}

export class PersonalityEngine {
	private config: EngineConfig;
	private signal: PersonalityVector;
	private momentum: PersonalityVector;
	private output: PersonalityVector;
	private classifier: ModeClassifier;
	private interpretation = '';
	private listeners: Array<(v: PersonalityVector) => void> = [];
	private lastSnapshot: EngineSnapshot | null = null;
	private lastSnapshotOutput: PersonalityVector;
	private tickCount = 0;
	private intervalId: ReturnType<typeof setInterval> | null = null;

	constructor(config: Partial<EngineConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		const baseline = cloneVec(this.config.restingBaseline);
		this.signal = cloneVec(baseline);
		this.momentum = cloneVec(baseline);
		this.output = cloneVec(baseline);
		this.lastSnapshotOutput = cloneVec(baseline);
		this.classifier = new ModeClassifier();
	}

	// ── Core tick ────────────────────────────────────────────────────────────

	tick(sensor: SensorState, activity: ActivitySignals): void {
		const targets = computeSignalTargets(sensor, activity);
		const cfg = this.config;
		const alphas = cfg.signalAlphas;

		// (a) EMA: signal layer toward targets
		this.signal.wonder     = (1 - alphas.wonder)     * this.signal.wonder     + alphas.wonder     * targets.wonder;
		this.signal.reflection = (1 - alphas.reflection) * this.signal.reflection + alphas.reflection * targets.reflection;
		this.signal.mischief   = (1 - alphas.mischief)   * this.signal.mischief   + alphas.mischief   * targets.mischief;

		// (b) EMA: momentum layer toward signal
		const ma = cfg.momentumAlpha;
		this.momentum.wonder     = (1 - ma) * this.momentum.wonder     + ma * this.signal.wonder;
		this.momentum.reflection = (1 - ma) * this.momentum.reflection + ma * this.signal.reflection;
		this.momentum.mischief   = (1 - ma) * this.momentum.mischief   + ma * this.signal.mischief;

		// (c) Blend output
		const br = cfg.blendRatio;
		this.output.wonder     = br * this.signal.wonder     + (1 - br) * this.momentum.wonder;
		this.output.reflection = br * this.signal.reflection + (1 - br) * this.momentum.reflection;
		this.output.mischief   = br * this.signal.mischief   + (1 - br) * this.momentum.mischief;

		// (d) Mode classification
		this.classifier.update(this.output);

		// (e) Interpretation
		this.interpretation = interpretVector(
			this.output,
			this.classifier.currentMode,
			sensor,
			targets.sources,
		);

		// (f) Notify listeners
		const snap = cloneVec(this.output);
		for (const cb of this.listeners) cb(snap);

		// (g) Snapshot tracking
		this.tickCount++;
		const delta = maxDelta(this.output, this.lastSnapshotOutput);
		const isFirstTick = this.tickCount === 1;
		const isInterval = this.tickCount % cfg.snapshotIntervalTicks === 0;
		const isDelta = delta >= cfg.snapshotDeltaThreshold;

		if (isFirstTick || isDelta || isInterval) {
			this.lastSnapshot = {
				wonder:             this.output.wonder,
				reflection:         this.output.reflection,
				mischief:           this.output.mischief,
				signalWonder:       this.signal.wonder,
				signalReflection:   this.signal.reflection,
				signalMischief:     this.signal.mischief,
				momentumWonder:     this.momentum.wonder,
				momentumReflection: this.momentum.reflection,
				momentumMischief:   this.momentum.mischief,
				derivedMode:        this.classifier.currentMode,
				interpretation:     this.interpretation,
				sources:            targets.sources,
				snapshotReason:     isDelta ? 'delta' : isFirstTick ? 'interval' : 'interval',
			};
			this.lastSnapshotOutput = cloneVec(this.output);
		}
	}

	// ── Interval loop ────────────────────────────────────────────────────────

	start(
		getSensor: () => SensorState,
		getActivity: () => ActivitySignals,
	): void {
		if (this.intervalId) return;
		this.intervalId = setInterval(() => {
			this.tick(getSensor(), getActivity());
		}, this.config.tickInterval);
	}

	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	// ── Public getters ───────────────────────────────────────────────────────

	getVector(): PersonalityVector     { return cloneVec(this.output); }
	getSignalLayer(): PersonalityVector { return cloneVec(this.signal); }
	getMomentumLayer(): PersonalityVector { return cloneVec(this.momentum); }
	getInterpretation(): string         { return this.interpretation; }
	getDerivedMode(): string            { return this.classifier.currentMode; }

	onVectorChange(callback: (vector: PersonalityVector) => void): void {
		this.listeners.push(callback);
	}

	getLastSnapshot(): EngineSnapshot | null {
		const s = this.lastSnapshot;
		this.lastSnapshot = null; // consume — bridge reads once then clears
		return s;
	}

	// ── Lifecycle helpers ────────────────────────────────────────────────────

	restoreMomentum(vector: PersonalityVector): void {
		this.momentum = cloneVec(vector);
	}

	forceMode(mode: string, reason: string): void {
		console.warn(`[PersonalityEngine] forceMode(${mode}) — reason: ${reason}`);
		this.classifier.previousMode = this.classifier.currentMode;
		this.classifier.currentMode = mode;
	}

	async reflect(): Promise<null> {
		// TODO-B: LLM reflection will replace this — see §17 of beaus-bible.md
		return null;
	}
}
