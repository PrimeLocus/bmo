// src/lib/server/thoughts/dispatcher.ts

/**
 * TODO-B: EXTRACTION TARGET — Pi Thought Service
 * Selects the type of thought to generate and assembles the full request payload.
 * Sits between PressureEngine (when to fire) and the MQTT publish (sending to LLM).
 * See: docs/bible/beaus-bible.md §44, §54
 */

import { nanoid } from 'nanoid';
import {
  HAIKU_WINDOWS,
  DECAY_TTL,
  DECAY_VARIANCE,
} from './types.js';
import type {
  ThoughtRequest,
  ThoughtType,
  DailyBudgetStatus,
} from './types.js';
import { getMemoryProvider } from '../memory/index.js';
import { formatFragments, RETRIEVAL_TIMEOUT_MS } from '../memory/types.js';

// ── Partial BeauState shape needed by the dispatcher ─────────────────────────

interface DispatchableState {
  personalityVector: { wonder: number; reflection: number; mischief: number };
  mode: string;
  environment: string;
}

// ── Max word/syllable lengths per type ────────────────────────────────────────

const MAX_LENGTH: Record<ThoughtType, number> = {
  observation: 30,
  reaction: 20,
  haiku: 17,
};

// ── Exported helper functions (also used in tests) ────────────────────────────

/**
 * Convert a 0–23 hour integer into a named time-of-day string.
 */
export function getTimeOfDay(hour: number): string {
  if (hour >= 0 && hour <= 4) return 'late night';
  if (hour >= 5 && hour <= 7) return 'early morning';
  if (hour >= 8 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 13) return 'midday';
  if (hour >= 14 && hour <= 16) return 'afternoon';
  if (hour >= 17 && hour <= 19) return 'evening';
  if (hour >= 20 && hour <= 22) return 'night';
  return 'late night'; // hour 23
}

/**
 * Derive a tonal label from the current personality vector.
 */
export function deriveTone(vector: { wonder: number; reflection: number; mischief: number }): string {
  const { wonder, reflection, mischief } = vector;

  // All below floor → quiet
  if (wonder < 0.3 && reflection < 0.3 && mischief < 0.3) return 'quiet';

  // Find dominant dimension
  const max = Math.max(wonder, reflection, mischief);

  if (reflection === max && reflection > 0.5) return 'contemplative';
  if (mischief === max && mischief > 0.5) return 'wry';
  if (wonder === max && wonder > 0.5) return 'warm';

  return 'present';
}

/**
 * Check whether the given hour falls inside a haiku generation window.
 * Handles the midnight-wrap window [23, 25] where 25 % 24 = 1.
 */
export function isInHaikuWindow(hour: number): boolean {
  for (const [start, end] of HAIKU_WINDOWS) {
    if (end <= 24) {
      // Normal window — no wrap
      if (hour >= start && hour < end) return true;
    } else {
      // Wrap window — e.g. [23, 25]: covers 23, 0, 1
      // end % 24 = 1, but we want to include hour 1, so use <=
      if (hour >= start || hour <= (end % 24)) return true;
    }
  }
  return false;
}

// ── ThoughtDispatcher ─────────────────────────────────────────────────────────

export class ThoughtDispatcher {
  private readonly getInterpretation: () => string;

  constructor(getInterpretation: () => string) {
    this.getInterpretation = getInterpretation;
  }

  /**
   * Select a ThoughtType based on budget, trigger, novelty, and time.
   *
   * @param state     Current BeauState (subset)
   * @param budget    Today's budget counters + cap flags
   * @param trigger   Source trigger string (e.g. 'idle', 'lux_change')
   * @param isNovelty Whether this tick was flagged as a novelty spike
   * @param rng       Optional deterministic RNG — defaults to Math.random
   * @param hour      Override current hour (for testing); defaults to new Date().getHours()
   */
  selectType(
    state: DispatchableState,
    budget: DailyBudgetStatus,
    trigger: string,
    isNovelty: boolean,
    rng: () => number = Math.random,
    hour: number = new Date().getHours(),
  ): ThoughtType | null {
    // 1. Hard cap — nothing gets through
    if (budget.atTotalCap) return null;

    // 2. Haiku window check
    const inWindow = isInHaikuWindow(hour);
    if (inWindow && state.personalityVector.reflection > 0.5 && !budget.atHaikuCap) {
      return 'haiku';
    }

    // 3. Sensor trigger → observation
    if (
      trigger.startsWith('lux_') ||
      trigger.startsWith('presence_') ||
      trigger.startsWith('activity_')
    ) {
      return 'observation';
    }

    // 4. Novelty weighted random
    if (isNovelty) {
      const roll = rng();
      if (roll < 0.6) return 'reaction';
      if (roll < 0.9) {
        // 30% haiku band — fall back to reaction if at cap
        return budget.atHaikuCap ? 'reaction' : 'haiku';
      }
      return 'observation'; // top 10%
    }

    // 5. Default
    return 'reaction';
  }

  /**
   * Assemble a full ThoughtRequest payload ready for MQTT dispatch.
   * Retrieves memory context (fail-open: proceeds without if unavailable).
   */
  async assembleRequest(
    type: ThoughtType,
    state: DispatchableState,
    trigger: string,
    isNovelty: boolean,
  ): Promise<ThoughtRequest> {
    const hour = new Date().getHours();

    // Attempt memory retrieval — fail-open with hard timeout
    let recentActivity = '';
    const mem = getMemoryProvider();
    if (mem) {
      try {
        const retrieval = mem.retrieve(
          `${state.environment} ${state.mode}`,
          { mode: state.mode, caller: 'thoughts', maxTokens: 300 },
        );
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('retrieval timeout')), RETRIEVAL_TIMEOUT_MS),
        );
        const { fragments } = await Promise.race([retrieval, timeoutPromise]);
        recentActivity = formatFragments(fragments);
      } catch {
        // fail-open: proceed without memory context
      }
    }

    return {
      id: nanoid(12),
      type,
      trigger,
      context: {
        vector: state.personalityVector,
        mode: state.mode,
        timeOfDay: getTimeOfDay(hour),
        environment: state.environment,
        recentActivity,
        momentum: this.getInterpretation(),
      },
      constraints: {
        maxLength: MAX_LENGTH[type],
        tone: deriveTone(state.personalityVector),
      },
      requestedAt: new Date().toISOString(),
      novelty: isNovelty,
    };
  }

  /**
   * Compute an ISO expiry timestamp for the given thought type.
   * Applies ±DECAY_VARIANCE jitter around the base TTL.
   */
  computeExpiresAt(type: ThoughtType): string {
    const base = DECAY_TTL[type];
    // Random value in [-DECAY_VARIANCE, +DECAY_VARIANCE]
    const jitter = (Math.random() * 2 - 1) * DECAY_VARIANCE;
    const ttlMs = base * (1 + jitter);
    return new Date(Date.now() + ttlMs).toISOString();
  }
}
