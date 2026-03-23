// src/lib/server/thoughts/pressure.ts

/**
 * TODO-B: EXTRACTION TARGET — Pi Thought Service
 * PressureEngine determines WHEN a thought wants to exist by accumulating
 * "thought pressure" from environmental richness, personality state, and time.
 * When pressure crosses a randomized threshold, a thought wants to be born.
 * See: docs/bible/beaus-bible.md §44, §54
 */

import {
	BASE_THRESHOLD,
	THRESHOLD_VARIANCE,
	NOVELTY_SPIKE_PROBABILITY,
	NOVELTY_DEVIATION_THRESHOLD,
	COOLDOWN_MS,
	SLEEP_ACCUMULATION_RATE,
	NOVELTY_MIN_BASELINES,
	type PressureState,
	type DailyBudgetStatus,
} from './types.js';

// ── Config ────────────────────────────────────────────────────────────────────

export interface PressureConfig {
	/** Per-tick accumulation multiplier for vector magnitude contribution */
	magnitudeRate: number;
	/** Per-tick accumulation multiplier for time-since-surfaced contribution */
	timeSilenceRate: number;
	/** Novelty spike size when random roll fires */
	noveltySpikeSize: number;
	/** Drain per tick when all vector dimensions are below lowEnergyThreshold */
	lowEnergyDrain: number;
	/** Threshold below which all dims are considered "low energy" */
	lowEnergyThreshold: number;
	/** Time (ms) at which time-silence factor caps at 1.0 */
	timeSilenceCap: number;
	/** EMA alpha for novelty baseline updates */
	baselineAlpha: number;
	/** Fraction by which pressure is reduced after dispatch */
	dispatchReduction: number;
}

const DEFAULT_CONFIG: PressureConfig = {
	magnitudeRate: 0.02,
	timeSilenceRate: 0.01,
	noveltySpikeSize: 0.15,
	lowEnergyDrain: 0.005,
	lowEnergyThreshold: 0.3,
	timeSilenceCap: 4 * 3_600_000, // 4 hours
	baselineAlpha: 0.05,
	dispatchReduction: 0.5,
};

// ── Minimal BeauState surface used by the pressure engine ────────────────────

interface PressureBeauState {
	personalityVector: { wonder: number; reflection: number; mischief: number };
	sleepState: string;
	lux?: number | null;
}

// ── PressureEngine ────────────────────────────────────────────────────────────

export class PressureEngine {
	/** @internal exposed for test access via (engine as any)._state */
	_state: PressureState;
	private _config: PressureConfig;
	private _lastTrigger: string;
	private _wasNoveltySpike: boolean;

	constructor(configOverrides: Partial<PressureConfig> = {}) {
		this._config = { ...DEFAULT_CONFIG, ...configOverrides };
		this._state = {
			value: 0,
			lastSurfacedAt: null,
			cooldownUntil: null,
			baselines: {},
			baselineInitialized: {},
		};
		this._lastTrigger = 'none';
		this._wasNoveltySpike = false;
	}

	// ── Core tick ─────────────────────────────────────────────────────────────

	/**
	 * Advance the pressure engine by one tick (~5 seconds).
	 *
	 * @param beauState  - Live BeauState (vector + sleepState)
	 * @param sleepState - Current sleep state string (redundant but explicit)
	 * @param dailyBudget - Current daily budget status (unused in tick; kept for API symmetry)
	 * @param rng        - Optional seeded RNG (defaults to Math.random)
	 */
	tick(
		beauState: PressureBeauState,
		sleepState: string,
		_dailyBudget: DailyBudgetStatus,
		rng: () => number = Math.random,
	): void {
		const now = Date.now();
		const { value, cooldownUntil, lastSurfacedAt } = this._state;
		const cfg = this._config;

		// ── 4. Skip all accumulation during cooldown ──────────────────────────
		if (cooldownUntil !== null && now < cooldownUntil) {
			this._wasNoveltySpike = false;
			return;
		}

		const v = beauState.personalityVector;
		let accumulation = 0;
		let dominantTrigger = 'none';

		// ── 1. Accumulate from vector magnitude ───────────────────────────────
		const magnitude = Math.sqrt(v.wonder ** 2 + v.reflection ** 2 + v.mischief ** 2);
		const magnitudeContrib = magnitude * cfg.magnitudeRate;
		if (magnitudeContrib > 0) {
			accumulation += magnitudeContrib;
			dominantTrigger = 'vector_magnitude';
		}

		// ── 2. Accumulate from time since last surfaced ───────────────────────
		let timeContrib = 0;
		if (lastSurfacedAt !== null) {
			const elapsed = now - lastSurfacedAt;
			const timeFactor = Math.min(1.0, elapsed / cfg.timeSilenceCap);
			timeContrib = timeFactor * cfg.timeSilenceRate;
			accumulation += timeContrib;
			// time_silence becomes dominant trigger if it contributes more than magnitude
			if (timeContrib > magnitudeContrib) {
				dominantTrigger = 'time_silence';
			}
		}

		// ── 3. Sleep drain multiplier ─────────────────────────────────────────
		if (sleepState === 'settling' || sleepState === 'asleep') {
			accumulation *= SLEEP_ACCUMULATION_RATE;
		}

		// ── 5. Low vector energy drain ────────────────────────────────────────
		const isLowEnergy =
			v.wonder < cfg.lowEnergyThreshold &&
			v.reflection < cfg.lowEnergyThreshold &&
			v.mischief < cfg.lowEnergyThreshold;

		if (isLowEnergy) {
			accumulation -= cfg.lowEnergyDrain;
		}

		// ── 6. Random novelty spike ───────────────────────────────────────────
		const spiked = rng() < NOVELTY_SPIKE_PROBABILITY;
		if (spiked) {
			accumulation += cfg.noveltySpikeSize;
			dominantTrigger = 'novelty_spike';
		}
		this._wasNoveltySpike = spiked;

		// ── 7. Clamp pressure to [0, 1] ───────────────────────────────────────
		const newValue = Math.max(0, Math.min(1, value + accumulation));
		this._state.value = newValue;

		// Update dominant trigger only if we actually moved
		if (accumulation !== 0 || spiked) {
			this._lastTrigger = dominantTrigger;
		}
	}

	// ── Novelty detection ─────────────────────────────────────────────────────

	/**
	 * Update the EMA baseline for a sensor and add novelty pressure if the
	 * current reading deviates significantly from the baseline.
	 *
	 * On first call for a sensor, baseline is initialized to the reading value
	 * (not zero) to avoid spurious spikes on startup.
	 */
	updateBaseline(sensor: string, value: number): void {
		const { baselines, baselineInitialized } = this._state;
		const cfg = this._config;

		if (!baselineInitialized[sensor]) {
			// Initialize baseline from first reading (not zero)
			baselines[sensor] = value;
			baselineInitialized[sensor] = true;
			return;
		}

		// EMA update
		const prev = baselines[sensor];
		const updated = (1 - cfg.baselineAlpha) * prev + cfg.baselineAlpha * value;
		baselines[sensor] = updated;

		// Novelty score — use floor from NOVELTY_MIN_BASELINES or 1.0
		const floor = NOVELTY_MIN_BASELINES[sensor] ?? 1.0;
		const divisor = Math.max(prev, floor);
		const score = Math.abs(value - prev) / divisor;

		if (score > NOVELTY_DEVIATION_THRESHOLD) {
			// Add spike proportional to deviation, capped at 0.2
			const spike = Math.min(0.2, score * 0.1);
			this._state.value = Math.min(1, this._state.value + spike);
		}
	}

	// ── Dispatch gate ─────────────────────────────────────────────────────────

	/**
	 * Returns true if the current pressure warrants dispatching a thought.
	 * Checks: pressure > threshold, not in cooldown, not at daily cap.
	 *
	 * @param dailyBudget - Current daily budget status
	 * @param rng         - Optional seeded RNG for threshold variance (defaults to Math.random)
	 */
	shouldDispatch(
		dailyBudget: DailyBudgetStatus,
		rng: () => number = Math.random,
	): boolean {
		const now = Date.now();
		const { value, cooldownUntil } = this._state;

		// Block if in cooldown
		if (cooldownUntil !== null && now < cooldownUntil) {
			return false;
		}

		// Block if daily budget exhausted
		if (dailyBudget.atTotalCap) {
			return false;
		}

		// Compare against randomized threshold
		const threshold = BASE_THRESHOLD + rng() * THRESHOLD_VARIANCE;
		return value > threshold;
	}

	// ── Post-dispatch lifecycle ───────────────────────────────────────────────

	/**
	 * Called after a thought is dispatched (sent to LLM for generation).
	 * Reduces pressure by 50% and sets the cooldown window.
	 */
	resetAfterDispatch(): void {
		this._state.value = this._state.value * (1 - this._config.dispatchReduction);
		// Note: cooldown is set by notifySurfaced() when the thought is actually shown to the user.
		// resetAfterDispatch is called at dispatch time (request sent), not surface time.
	}

	/**
	 * Called when a thought is surfaced (shown to the user).
	 * Updates lastSurfacedAt and begins the cooldown period.
	 */
	notifySurfaced(): void {
		const now = Date.now();
		this._state.lastSurfacedAt = now;
		this._state.cooldownUntil = now + COOLDOWN_MS;
	}

	// ── Accessors ─────────────────────────────────────────────────────────────

	/** Current pressure value, normalized [0, 1]. */
	getValue(): number {
		return this._state.value;
	}

	/**
	 * Returns a string describing the primary cause of the last pressure
	 * change. One of: 'novelty_spike', 'vector_magnitude', 'time_silence', 'none'.
	 */
	getLastTrigger(): string {
		return this._lastTrigger;
	}

	/** Returns true if the last tick included a random novelty spike. */
	wasNoveltySpike(): boolean {
		return this._wasNoveltySpike;
	}
}
