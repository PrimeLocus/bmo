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
