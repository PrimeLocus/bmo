// src/lib/server/thoughts/types.ts

/**
 * TODO-B: EXTRACTION TARGET — Pi Thought Service
 * This module defines the thought system types and tuning constants.
 * When the Pi is assembled, extract alongside personality engine.
 * See: docs/bible/beaus-bible.md §44, §54
 */

export const THOUGHT_TYPES = ['observation', 'reaction', 'haiku'] as const;
export type ThoughtType = (typeof THOUGHT_TYPES)[number];

export const THOUGHT_STATUSES = [
  'requested', 'generating', 'pending', 'ready',
  'surfaced', 'decayed', 'dropped',
] as const;
export type ThoughtStatus = (typeof THOUGHT_STATUSES)[number];

export interface ThoughtRequest {
  id: string;
  type: ThoughtType;
  trigger: string;
  context: {
    vector: { wonder: number; reflection: number; mischief: number };
    mode: string;
    timeOfDay: string;
    environment: string;
    recentActivity: string;
    momentum: string;
  };
  constraints: {
    maxLength: number;
    tone: string;
  };
  requestedAt: string;
  novelty: boolean;
}

export interface ThoughtResult {
  id: string;
  text: string | null;
  generatedAt: string;
  model: string;
  generationMs: number;
}

export interface PressureState {
  value: number;
  lastSurfacedAt: number | null;
  cooldownUntil: number | null;
  baselines: Record<string, number>;
  baselineInitialized: Record<string, boolean>;
}

export interface DailyBudgetStatus {
  surfacedToday: number;
  haikuToday: number;
  atHaikuCap: boolean;
  atTotalCap: boolean;
}

// ── Tuning constants (all exported, all overridable) ──

export const PRESSURE_TICK_MS = 5000;
export const BASE_THRESHOLD = 0.7;
export const THRESHOLD_VARIANCE = 0.2;
export const NOVELTY_SPIKE_PROBABILITY = 0.04;
export const NOVELTY_DEVIATION_THRESHOLD = 0.3;
export const COOLDOWN_MS = 1_800_000;           // 30 minutes
export const MAX_QUEUE_SIZE = 5;
export const MAX_DAILY_HAIKU = 3;
export const MAX_DAILY_THOUGHTS = 5;
export const DECAY_TTL_OBSERVATION_MS = 10_800_000;  // 3 hours
export const DECAY_TTL_REACTION_MS = 36_000_000;     // 10 hours
export const DECAY_TTL_HAIKU_MS = 86_400_000;        // 24 hours
export const DECAY_VARIANCE = 0.2;
export const GENERATION_TIMEOUT_MS = 50_000;
export const SLEEP_ACCUMULATION_RATE = 0.1;
export const HAIKU_WINDOW_MULTIPLIER = 3.0;

// Novelty baseline floors per sensor (prevent divide-by-zero)
export const NOVELTY_MIN_BASELINES: Record<string, number> = {
  lux: 1.0,
  presenceCount: 0.5,
  micLevel: 0.1,
};

// Priority values (higher = more important)
export const PRIORITY: Record<ThoughtType, number> = {
  haiku: 30,
  reaction: 20,
  observation: 10,
};

// Haiku time windows [startHour, endHour] (24h, local time)
export const HAIKU_WINDOWS: [number, number][] = [
  [5, 7],    // dawn
  [18, 20],  // dusk
  [23, 25],  // midnight (25 = 1am next day, handled via modulo)
];

// Decay TTL per type
export const DECAY_TTL: Record<ThoughtType, number> = {
  observation: DECAY_TTL_OBSERVATION_MS,
  reaction: DECAY_TTL_REACTION_MS,
  haiku: DECAY_TTL_HAIKU_MS,
};
