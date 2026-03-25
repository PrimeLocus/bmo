// src/lib/server/thoughts/dispatcher.test.ts

import { describe, it, expect } from 'vitest';
import {
  ThoughtDispatcher,
  getTimeOfDay,
  deriveTone,
  isInHaikuWindow,
} from './dispatcher.js';
import type { DailyBudgetStatus } from './types.js';
import { DECAY_TTL, DECAY_VARIANCE } from './types.js';

// ── Shared mock state ──────────────────────────────────────────────────────────

const mockState = {
  personalityVector: { wonder: 0.5, reflection: 0.6, mischief: 0.3 },
  mode: 'ambient',
  environment: 'quiet house, dim light',
};

const fullBudget: DailyBudgetStatus = {
  surfacedToday: 0,
  haikuToday: 0,
  atHaikuCap: false,
  atTotalCap: false,
};

const totalCapBudget: DailyBudgetStatus = {
  surfacedToday: 5,
  haikuToday: 3,
  atHaikuCap: true,
  atTotalCap: true,
};

const haikuCapBudget: DailyBudgetStatus = {
  surfacedToday: 2,
  haikuToday: 3,
  atHaikuCap: true,
  atTotalCap: false,
};

function makeDispatcher(interpretation = 'Mostly quiet tonight') {
  return new ThoughtDispatcher(() => interpretation);
}

// ── getTimeOfDay ──────────────────────────────────────────────────────────────

describe('getTimeOfDay', () => {
  it('returns late night for hour 2', () => {
    expect(getTimeOfDay(2)).toBe('late night');
  });

  it('returns early morning for hour 6', () => {
    expect(getTimeOfDay(6)).toBe('early morning');
  });

  it('returns morning for hour 9', () => {
    expect(getTimeOfDay(9)).toBe('morning');
  });

  it('returns midday for hour 12', () => {
    expect(getTimeOfDay(12)).toBe('midday');
  });

  it('returns afternoon for hour 14', () => {
    expect(getTimeOfDay(14)).toBe('afternoon');
  });

  it('returns evening for hour 18', () => {
    expect(getTimeOfDay(18)).toBe('evening');
  });

  it('returns night for hour 21', () => {
    expect(getTimeOfDay(21)).toBe('night');
  });

  it('returns late night for hour 23', () => {
    expect(getTimeOfDay(23)).toBe('late night');
  });

  it('returns late night for hour 0', () => {
    expect(getTimeOfDay(0)).toBe('late night');
  });
});

// ── deriveTone ────────────────────────────────────────────────────────────────

describe('deriveTone', () => {
  it('returns contemplative when reflection is dominant and > 0.5', () => {
    expect(deriveTone({ wonder: 0.3, reflection: 0.7, mischief: 0.2 })).toBe('contemplative');
  });

  it('returns wry when mischief is dominant and > 0.5', () => {
    expect(deriveTone({ wonder: 0.3, reflection: 0.4, mischief: 0.6 })).toBe('wry');
  });

  it('returns warm when wonder is dominant and > 0.5', () => {
    expect(deriveTone({ wonder: 0.8, reflection: 0.4, mischief: 0.3 })).toBe('warm');
  });

  it('returns quiet when all dimensions < 0.3', () => {
    expect(deriveTone({ wonder: 0.2, reflection: 0.1, mischief: 0.15 })).toBe('quiet');
  });

  it('returns present as default when values are mid-range', () => {
    expect(deriveTone({ wonder: 0.45, reflection: 0.4, mischief: 0.35 })).toBe('present');
  });
});

// ── isInHaikuWindow ───────────────────────────────────────────────────────────

describe('isInHaikuWindow', () => {
  it('returns true for dawn window — hour 5', () => {
    expect(isInHaikuWindow(5)).toBe(true);
  });

  it('returns true for dawn window — hour 6', () => {
    expect(isInHaikuWindow(6)).toBe(true);
  });

  it('returns true for dusk window — hour 19', () => {
    expect(isInHaikuWindow(19)).toBe(true);
  });

  it('returns true for midnight window — hour 23', () => {
    expect(isInHaikuWindow(23)).toBe(true);
  });

  it('returns true for midnight wrap — hour 0', () => {
    expect(isInHaikuWindow(0)).toBe(true);
  });

  it('returns true for midnight wrap — hour 1', () => {
    expect(isInHaikuWindow(1)).toBe(true);
  });

  it('returns false for mid-morning — hour 10', () => {
    expect(isInHaikuWindow(10)).toBe(false);
  });

  it('returns false for afternoon — hour 15', () => {
    expect(isInHaikuWindow(15)).toBe(false);
  });
});

// ── selectType ────────────────────────────────────────────────────────────────

describe('ThoughtDispatcher.selectType', () => {
  it('returns null when atTotalCap', () => {
    const d = makeDispatcher();
    expect(d.selectType(mockState as any, totalCapBudget, 'idle', false)).toBeNull();
  });

  it('returns haiku when in time window, reflection > 0.5, budget available', () => {
    const d = makeDispatcher();
    // Hour 6 is in dawn window; reflection=0.6 > 0.5; budget not at haiku cap
    const result = d.selectType(mockState as any, fullBudget, 'idle', false, () => 0.5, 6);
    expect(result).toBe('haiku');
  });

  it('returns observation when trigger starts with sensor prefix lux_', () => {
    const d = makeDispatcher();
    const result = d.selectType(mockState as any, fullBudget, 'lux_change', false);
    expect(result).toBe('observation');
  });

  it('returns observation when trigger starts with presence_ prefix', () => {
    const d = makeDispatcher();
    const result = d.selectType(mockState as any, fullBudget, 'presence_enter', false);
    expect(result).toBe('observation');
  });

  it('returns observation when trigger starts with activity_ prefix', () => {
    const d = makeDispatcher();
    const result = d.selectType(mockState as any, fullBudget, 'activity_resolume', false);
    expect(result).toBe('observation');
  });

  it('returns reaction as default', () => {
    const d = makeDispatcher();
    // Not in haiku window (hour 12), not sensor trigger, not novelty
    const result = d.selectType(mockState as any, fullBudget, 'idle', false, undefined, 12);
    expect(result).toBe('reaction');
  });

  it('novelty: rng 0.5 (< 0.6) → reaction', () => {
    const d = makeDispatcher();
    const result = d.selectType(mockState as any, fullBudget, 'idle', true, () => 0.5, 12);
    expect(result).toBe('reaction');
  });

  it('novelty: rng 0.65 (in 0.6–0.9 band) → haiku when not at haiku cap', () => {
    const d = makeDispatcher();
    const result = d.selectType(mockState as any, fullBudget, 'idle', true, () => 0.65, 12);
    expect(result).toBe('haiku');
  });

  it('novelty: rng 0.95 (> 0.9) → observation', () => {
    const d = makeDispatcher();
    const result = d.selectType(mockState as any, fullBudget, 'idle', true, () => 0.95, 12);
    expect(result).toBe('observation');
  });

  it('novelty: haiku band falls back to reaction when at haiku cap', () => {
    const d = makeDispatcher();
    // rng=0.65 would pick haiku but haiku cap is hit — should fall back
    const result = d.selectType(mockState as any, haikuCapBudget, 'idle', true, () => 0.65, 12);
    expect(result).toBe('reaction');
  });

  it('blocks haiku when atHaikuCap even in time window', () => {
    const d = makeDispatcher();
    const result = d.selectType(mockState as any, haikuCapBudget, 'idle', false, () => 0.5, 6);
    // haiku window + reflection > 0.5 but cap hit → falls through to default reaction
    expect(result).toBe('reaction');
  });
});

// ── buildBrainRequest ────────────────────────────────────────────────────────

describe('ThoughtDispatcher.buildBrainRequest', () => {
  it('returns a BrainRequestV1 with kind=thought.generate and origin=thoughts', () => {
    const d = makeDispatcher();
    const req = d.buildBrainRequest('reaction', mockState as any, 'idle', false);

    expect(req.v).toBe(1);
    expect(req.kind).toBe('thought.generate');
    expect(req.origin).toBe('thoughts');
    expect(req.requestId).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it('populates input.type, input.trigger, input.novelty from arguments', () => {
    const d = makeDispatcher();
    const req = d.buildBrainRequest('observation', mockState as any, 'lux_change', true);

    expect(req.input.type).toBe('observation');
    expect(req.input.trigger).toBe('lux_change');
    expect(req.input.novelty).toBe(true);
  });

  it('uses getTimeOfDay() for context.timeOfDay', () => {
    const d = makeDispatcher();
    const req = d.buildBrainRequest('reaction', mockState as any, 'idle', false);

    // getTimeOfDay always returns a non-empty string for any hour
    expect(typeof req.input.context.timeOfDay).toBe('string');
    expect(req.input.context.timeOfDay).not.toBe('');
  });

  it('uses deriveTone() for constraints.tone', () => {
    // mockState has reflection=0.6 as dominant > 0.5 → 'contemplative'
    const d = makeDispatcher();
    const req = d.buildBrainRequest('reaction', mockState as any, 'idle', false);

    expect(req.input.constraints.tone).toBe('contemplative');
  });

  it('uses MAX_LENGTH[type] for constraints.maxLength', () => {
    const d = makeDispatcher();

    const obs = d.buildBrainRequest('observation', mockState as any, 'idle', false);
    expect(obs.input.constraints.maxLength).toBe(30);

    const react = d.buildBrainRequest('reaction', mockState as any, 'idle', false);
    expect(react.input.constraints.maxLength).toBe(20);

    const haiku = d.buildBrainRequest('haiku', mockState as any, 'idle', false);
    expect(haiku.input.constraints.maxLength).toBe(17);
  });

  it('uses getInterpretation() for context.momentum', () => {
    const interpretation = 'Wonder rising with the dawn';
    const d = makeDispatcher(interpretation);
    const req = d.buildBrainRequest('reaction', mockState as any, 'idle', false);

    expect(req.input.context.momentum).toBe(interpretation);
  });

  it('populates context.vector from state.personalityVector', () => {
    const d = makeDispatcher();
    const req = d.buildBrainRequest('reaction', mockState as any, 'idle', false);

    expect(req.input.context.vector).toEqual(mockState.personalityVector);
  });

  it('populates context.mode and context.environment from state', () => {
    const d = makeDispatcher();
    const req = d.buildBrainRequest('reaction', mockState as any, 'idle', false);

    expect(req.input.context.mode).toBe('ambient');
    expect(req.input.context.environment).toBe('quiet house, dim light');
  });
});

// ── computeExpiresAt ──────────────────────────────────────────────────────────

describe('ThoughtDispatcher.computeExpiresAt', () => {
  it('produces expiry within ±DECAY_VARIANCE of base TTL for observation', () => {
    const d = makeDispatcher();
    const before = Date.now();
    const expiresAt = d.computeExpiresAt('observation');
    const after = Date.now();

    const expiresMs = new Date(expiresAt).getTime();
    const minExpiry = before + DECAY_TTL.observation * (1 - DECAY_VARIANCE);
    const maxExpiry = after + DECAY_TTL.observation * (1 + DECAY_VARIANCE);

    expect(expiresMs).toBeGreaterThanOrEqual(minExpiry);
    expect(expiresMs).toBeLessThanOrEqual(maxExpiry);
  });

  it('produces expiry within ±DECAY_VARIANCE of base TTL for haiku', () => {
    const d = makeDispatcher();
    const before = Date.now();
    const expiresAt = d.computeExpiresAt('haiku');
    const after = Date.now();

    const expiresMs = new Date(expiresAt).getTime();
    const minExpiry = before + DECAY_TTL.haiku * (1 - DECAY_VARIANCE);
    const maxExpiry = after + DECAY_TTL.haiku * (1 + DECAY_VARIANCE);

    expect(expiresMs).toBeGreaterThanOrEqual(minExpiry);
    expect(expiresMs).toBeLessThanOrEqual(maxExpiry);
  });

  it('returns a valid ISO string', () => {
    const d = makeDispatcher();
    const result = d.computeExpiresAt('reaction');
    expect(() => new Date(result)).not.toThrow();
    expect(new Date(result).toISOString()).toBe(result);
  });
});
