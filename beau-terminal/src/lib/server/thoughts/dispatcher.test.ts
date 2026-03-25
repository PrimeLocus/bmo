// src/lib/server/thoughts/dispatcher.test.ts

import { describe, it, expect, vi } from 'vitest';
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

// ── assembleRequest ───────────────────────────────────────────────────────────

describe('ThoughtDispatcher.assembleRequest', () => {
  it('constructs correct payload with interpreter output in momentum', async () => {
    const interpretation = 'Mostly quiet tonight';
    const d = makeDispatcher(interpretation);
    const req = await d.assembleRequest('reaction', mockState as any, 'idle', false);

    expect(req.id).toMatch(/^[a-zA-Z0-9_-]{12}$/);
    expect(req.type).toBe('reaction');
    expect(req.trigger).toBe('idle');
    expect(req.novelty).toBe(false);
    expect(req.context.vector).toEqual(mockState.personalityVector);
    expect(req.context.mode).toBe('ambient');
    expect(req.context.environment).toBe('quiet house, dim light');
    expect(req.context.momentum).toBe(interpretation);
    expect(typeof req.context.timeOfDay).toBe('string');
    expect(req.context.timeOfDay).not.toBe('');
    expect(typeof req.context.recentActivity).toBe('string');
    expect(req.constraints.maxLength).toBe(20);
    expect(req.constraints.tone).toBeDefined();
    expect(typeof req.requestedAt).toBe('string');
    expect(() => new Date(req.requestedAt)).not.toThrow();
  });

  it('sets maxLength=30 for observation type', async () => {
    const d = makeDispatcher();
    const req = await d.assembleRequest('observation', mockState as any, 'lux_change', false);
    expect(req.constraints.maxLength).toBe(30);
  });

  it('sets maxLength=17 for haiku type', async () => {
    const d = makeDispatcher();
    const req = await d.assembleRequest('haiku', mockState as any, 'idle', true);
    expect(req.constraints.maxLength).toBe(17);
  });

  it('sets novelty=true when isNovelty=true', async () => {
    const d = makeDispatcher();
    const req = await d.assembleRequest('reaction', mockState as any, 'idle', true);
    expect(req.novelty).toBe(true);
  });

  it('populates recentActivity when memory provider is registered', async () => {
    // Register a mock memory provider
    const { registerMemoryProvider, getMemoryProvider } = await import('../memory/index.js');
    const mockProvider = {
      retrieve: vi.fn().mockResolvedValue({
        fragments: [
          {
            id: 'test:1:0',
            text: 'A quiet evening observation',
            source: 'capture',
            collection: 'beau_experience',
            entityId: '1',
            tokenCount: 5,
            rawDistance: 0.3,
            finalScore: 0.7,
            createdAt: new Date().toISOString(),
          },
        ],
        usedTokens: 5,
      }),
      upsert: vi.fn(),
      remove: vi.fn(),
    };
    registerMemoryProvider(mockProvider as any);

    try {
      const d = makeDispatcher();
      const req = await d.assembleRequest('reaction', mockState as any, 'idle', false);
      expect(req.context.recentActivity).toContain('[capture] A quiet evening observation');
      expect(mockProvider.retrieve).toHaveBeenCalledOnce();
    } finally {
      // Clean up — deregister
      registerMemoryProvider(null as any);
    }
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
