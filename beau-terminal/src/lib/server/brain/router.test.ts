// src/lib/server/brain/router.test.ts
// TDD tests for Brain Router — SP6 Task 3
// Voice caster, context scaler, tier precedence

import { describe, it, expect, beforeEach } from 'vitest';
import {
  VOICE_CENTROIDS,
  castVoice,
  computeMemoryDepth,
  computeContextFloor,
  resolveThoughtFloor,
  resolveTier,
  routeRequest,
} from './router.js';
import { TierRegistry } from './registry.js';
import { MEMORY_DEPTH_TOKENS, TIER_ORDER } from './types.js';
import type {
  TierId,
  PersonalityVector,
  TierConfig,
  BrainRequestV1,
  BrainHints,
  ThoughtInput,
  MemoryDepth,
} from './types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTierConfigs(overrides?: Partial<Record<TierId, Partial<TierConfig>>>): TierConfig[] {
  const defaults: TierConfig[] = [
    {
      id: 't1',
      label: 'T1',
      endpoint: 'http://localhost:11434',
      model: 'qwen2.5:1.5b',
      timeoutMs: 5000,
      maxPromptTokens: 1000,
      maxMemoryTokens: 100,
      maxOutputTokens: 256,
      supportsStreaming: true,
      promptProfile: 'reflex',
    },
    {
      id: 't2',
      label: 'T2',
      endpoint: 'http://localhost:11434',
      model: 'gemma3:4b',
      timeoutMs: 15000,
      maxPromptTokens: 2000,
      maxMemoryTokens: 300,
      maxOutputTokens: 512,
      supportsStreaming: true,
      promptProfile: 'full',
    },
    {
      id: 't3',
      label: 'T3',
      endpoint: 'http://localhost:11434',
      model: 'llama3.1:8b',
      timeoutMs: 10000,
      maxPromptTokens: 4000,
      maxMemoryTokens: 500,
      maxOutputTokens: 1024,
      supportsStreaming: true,
      promptProfile: 'full',
    },
    {
      id: 't4',
      label: 'T4',
      endpoint: 'http://localhost:11434',
      model: 'qwen3:30b',
      timeoutMs: 30000,
      maxPromptTokens: 8000,
      maxMemoryTokens: 1000,
      maxOutputTokens: 2048,
      supportsStreaming: true,
      promptProfile: 'full',
    },
  ];

  if (overrides) {
    return defaults.map((cfg) => ({
      ...cfg,
      ...(overrides[cfg.id] ?? {}),
    }));
  }
  return defaults;
}

function makeRegistry(onlineTiers: TierId[], configOverrides?: Partial<Record<TierId, Partial<TierConfig>>>): TierRegistry {
  const configs = makeTierConfigs(configOverrides);
  const registry = new TierRegistry(configs);
  for (const id of onlineTiers) {
    registry.updateState(id, 'online', { latencyMs: 50 });
  }
  return registry;
}

function makeThoughtInput(type: 'observation' | 'reaction' | 'haiku', vector?: PersonalityVector): ThoughtInput {
  return {
    type,
    trigger: 'test',
    novelty: false,
    context: {
      vector: vector ?? { wonder: 0.5, reflection: 0.5, mischief: 0.5 },
      mode: 'ambient',
      timeOfDay: 'afternoon',
      environment: 'studio',
      momentum: 'steady',
    },
    constraints: {
      maxLength: 200,
      tone: 'reflective',
    },
  };
}

function makeThoughtRequest(
  type: 'observation' | 'reaction' | 'haiku',
  vector?: PersonalityVector,
  hints?: BrainHints,
): Extract<BrainRequestV1, { kind: 'thought.generate' }> {
  return {
    v: 1,
    requestId: 'test-req-001',
    kind: 'thought.generate',
    origin: 'thoughts',
    input: makeThoughtInput(type, vector),
    hints,
  };
}

function makeManualRequest(
  hints?: BrainHints,
): Extract<BrainRequestV1, { kind: 'manual.prompt' }> {
  return {
    v: 1,
    requestId: 'test-req-002',
    kind: 'manual.prompt',
    origin: 'console',
    input: { text: 'hello beau', label: 'test' },
    hints,
  };
}

// ---------------------------------------------------------------------------
// VOICE_CENTROIDS
// ---------------------------------------------------------------------------

describe('VOICE_CENTROIDS', () => {
  it('defines centroids for all 4 tiers', () => {
    expect(VOICE_CENTROIDS).toHaveProperty('t1');
    expect(VOICE_CENTROIDS).toHaveProperty('t2');
    expect(VOICE_CENTROIDS).toHaveProperty('t3');
    expect(VOICE_CENTROIDS).toHaveProperty('t4');
  });

  it('t1 centroid has high mischief', () => {
    expect(VOICE_CENTROIDS.t1.mischief).toBe(0.85);
  });

  it('t2 centroid has high reflection', () => {
    expect(VOICE_CENTROIDS.t2.reflection).toBe(0.85);
  });

  it('t3 centroid is balanced', () => {
    const { wonder, reflection, mischief } = VOICE_CENTROIDS.t3;
    expect(wonder).toBe(0.55);
    expect(reflection).toBe(0.40);
    expect(mischief).toBe(0.45);
  });

  it('t4 centroid has high wonder and reflection', () => {
    expect(VOICE_CENTROIDS.t4.wonder).toBe(0.85);
    expect(VOICE_CENTROIDS.t4.reflection).toBe(0.85);
  });
});

// ---------------------------------------------------------------------------
// castVoice
// ---------------------------------------------------------------------------

describe('castVoice', () => {
  it('high mischief vector → t1', () => {
    const vector: PersonalityVector = { wonder: 0.3, reflection: 0.1, mischief: 0.9 };
    expect(castVoice(vector)).toBe('t1');
  });

  it('high reflection vector → t2', () => {
    const vector: PersonalityVector = { wonder: 0.3, reflection: 0.9, mischief: 0.1 };
    expect(castVoice(vector)).toBe('t2');
  });

  it('balanced vector → t3', () => {
    const vector: PersonalityVector = { wonder: 0.5, reflection: 0.4, mischief: 0.5 };
    expect(castVoice(vector)).toBe('t3');
  });

  it('high wonder + high reflection → t4', () => {
    const vector: PersonalityVector = { wonder: 0.9, reflection: 0.9, mischief: 0.2 };
    expect(castVoice(vector)).toBe('t4');
  });

  it('stickiness: previous tier preferred if not materially further', () => {
    // t2 = { wonder: 0.40, reflection: 0.85, mischief: 0.15 }
    // t3 = { wonder: 0.55, reflection: 0.40, mischief: 0.45 }
    // This vector is slightly closer to t3 (~0.26) than t2 (~0.30), improvement ~14% < 15%
    const vector: PersonalityVector = { wonder: 0.48, reflection: 0.60, mischief: 0.30 };

    // Without previous tier, picks nearest (t3)
    const withoutPrev = castVoice(vector);
    expect(withoutPrev).toBe('t3');

    // With t2 as previous, stickiness holds (improvement < 15%)
    const withPrev = castVoice(vector, 't2');
    expect(withPrev).toBe('t2');
  });

  it('stickiness broken when new centroid is 15%+ closer', () => {
    // Vector very close to t1, far from t2 — should break stickiness from t2
    const vector: PersonalityVector = { wonder: 0.35, reflection: 0.15, mischief: 0.85 };
    const result = castVoice(vector, 't2');
    expect(result).toBe('t1');
  });

  it('returns previous tier when it is the nearest', () => {
    const vector: PersonalityVector = { wonder: 0.85, reflection: 0.85, mischief: 0.2 };
    expect(castVoice(vector, 't4')).toBe('t4');
  });

  it('no previous tier defaults to nearest centroid', () => {
    const vector: PersonalityVector = { wonder: 0.85, reflection: 0.85, mischief: 0.2 };
    expect(castVoice(vector)).toBe('t4');
  });
});

// ---------------------------------------------------------------------------
// computeMemoryDepth
// ---------------------------------------------------------------------------

describe('computeMemoryDepth', () => {
  it('high mischief → light', () => {
    const vector: PersonalityVector = { wonder: 0.3, reflection: 0.3, mischief: 0.8 };
    expect(computeMemoryDepth(vector)).toBe('light');
  });

  it('high reflection → deep', () => {
    const vector: PersonalityVector = { wonder: 0.3, reflection: 0.8, mischief: 0.3 };
    expect(computeMemoryDepth(vector)).toBe('deep');
  });

  it('high wonder → medium', () => {
    const vector: PersonalityVector = { wonder: 0.8, reflection: 0.3, mischief: 0.3 };
    expect(computeMemoryDepth(vector)).toBe('medium');
  });

  it('balanced (no dim >0.6) → medium', () => {
    const vector: PersonalityVector = { wonder: 0.5, reflection: 0.5, mischief: 0.5 };
    expect(computeMemoryDepth(vector)).toBe('medium');
  });

  it('multiple above 0.6: reflection > wonder → deep wins', () => {
    const vector: PersonalityVector = { wonder: 0.8, reflection: 0.8, mischief: 0.3 };
    expect(computeMemoryDepth(vector)).toBe('deep');
  });

  it('multiple above 0.6: wonder + mischief → medium wins (medium > light)', () => {
    const vector: PersonalityVector = { wonder: 0.8, reflection: 0.3, mischief: 0.8 };
    expect(computeMemoryDepth(vector)).toBe('medium');
  });

  it('all above 0.6: deep wins (highest budget)', () => {
    const vector: PersonalityVector = { wonder: 0.9, reflection: 0.9, mischief: 0.9 };
    expect(computeMemoryDepth(vector)).toBe('deep');
  });

  it('exactly at threshold (0.6) → not triggered', () => {
    const vector: PersonalityVector = { wonder: 0.6, reflection: 0.6, mischief: 0.6 };
    expect(computeMemoryDepth(vector)).toBe('medium'); // balanced: no dim >0.6
  });

  it('just above threshold (0.61) → triggered', () => {
    const vector: PersonalityVector = { wonder: 0.3, reflection: 0.61, mischief: 0.3 };
    expect(computeMemoryDepth(vector)).toBe('deep');
  });
});

// ---------------------------------------------------------------------------
// computeContextFloor
// ---------------------------------------------------------------------------

describe('computeContextFloor', () => {
  const configs = makeTierConfigs();

  it('light (150 tokens) fits t1 (maxMemoryTokens=100) — needs t2', () => {
    // t1 has maxMemoryTokens=100, light needs 150 → t1 is too small
    const floor = computeContextFloor('light', configs);
    expect(floor).toBe('t2');
  });

  it('medium (300 tokens) fits t2 (maxMemoryTokens=300)', () => {
    const floor = computeContextFloor('medium', configs);
    expect(floor).toBe('t2');
  });

  it('deep (500 tokens) fits t3 (maxMemoryTokens=500)', () => {
    const floor = computeContextFloor('deep', configs);
    expect(floor).toBe('t3');
  });

  it('none (0 tokens) fits t1', () => {
    const floor = computeContextFloor('none', configs);
    expect(floor).toBe('t1');
  });

  it('returns null if no tier can fit the budget', () => {
    // Custom configs where all tiers have 0 maxMemoryTokens
    const tinyConfigs = makeTierConfigs({
      t1: { maxMemoryTokens: 0 },
      t2: { maxMemoryTokens: 0 },
      t3: { maxMemoryTokens: 0 },
      t4: { maxMemoryTokens: 0 },
    });
    const floor = computeContextFloor('deep', tinyConfigs);
    expect(floor).toBeNull();
  });

  it('custom config: t1 large enough → returns t1', () => {
    const bigT1 = makeTierConfigs({ t1: { maxMemoryTokens: 600 } });
    const floor = computeContextFloor('deep', bigT1);
    expect(floor).toBe('t1');
  });
});

// ---------------------------------------------------------------------------
// resolveThoughtFloor
// ---------------------------------------------------------------------------

describe('resolveThoughtFloor', () => {
  it('observation → t1', () => {
    expect(resolveThoughtFloor('observation')).toBe('t1');
  });

  it('reaction → t2', () => {
    expect(resolveThoughtFloor('reaction')).toBe('t2');
  });

  it('haiku → t2', () => {
    expect(resolveThoughtFloor('haiku')).toBe('t2');
  });

  it('null → null', () => {
    expect(resolveThoughtFloor(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveTier
// ---------------------------------------------------------------------------

describe('resolveTier', () => {
  it('all tiers available, voice picks freely', () => {
    const result = resolveTier({
      voicePreferred: 't3',
      thoughtFloor: null,
      contextFloor: null,
      onlineTiers: ['t1', 't2', 't3', 't4'],
      hints: {},
    });
    expect(result.targetTier).toBe('t3');
    expect(result.clamped).toBe(false);
    expect(result.trimmed).toBe(false);
  });

  it('thought floor raises t1 to t2 for haiku', () => {
    const result = resolveTier({
      voicePreferred: 't1',
      thoughtFloor: 't2', // haiku requires at least t2
      contextFloor: null,
      onlineTiers: ['t1', 't2', 't3', 't4'],
      hints: {},
    });
    expect(result.targetTier).toBe('t2');
    expect(result.clamped).toBe(true);
  });

  it('context floor overrides voice when memory needs bigger tier', () => {
    const result = resolveTier({
      voicePreferred: 't1',
      thoughtFloor: null,
      contextFloor: 't3', // memory depth needs t3+
      onlineTiers: ['t1', 't2', 't3', 't4'],
      hints: {},
    });
    expect(result.targetTier).toBe('t3');
    expect(result.clamped).toBe(true);
  });

  it('sparse availability: skips offline tiers', () => {
    const result = resolveTier({
      voicePreferred: 't2',
      thoughtFloor: null,
      contextFloor: null,
      onlineTiers: ['t1', 't3', 't4'], // t2 offline
      hints: {},
    });
    // t2 is preferred but offline, closest available at or above is t3
    expect(result.targetTier).toBe('t3');
    expect(result.clamped).toBe(true);
  });

  it('no tier above floor: falls to highest available, marks trimmed', () => {
    const result = resolveTier({
      voicePreferred: 't3',
      thoughtFloor: 't3',
      contextFloor: null,
      onlineTiers: ['t1', 't2'], // t3, t4 both offline
      hints: {},
    });
    // Floor is t3, but nothing at t3+ is online → fall to highest available (t2)
    expect(result.targetTier).toBe('t2');
    expect(result.trimmed).toBe(true);
  });

  it('hints.maxTier caps the ceiling', () => {
    const result = resolveTier({
      voicePreferred: 't4',
      thoughtFloor: null,
      contextFloor: null,
      onlineTiers: ['t1', 't2', 't3', 't4'],
      hints: { maxTier: 't2' },
    });
    expect(result.targetTier).toBe('t2');
    expect(result.clamped).toBe(true);
  });

  it('no tiers available returns null', () => {
    const result = resolveTier({
      voicePreferred: 't2',
      thoughtFloor: null,
      contextFloor: null,
      onlineTiers: [],
      hints: {},
    });
    expect(result.targetTier).toBeNull();
  });

  it('hints.preferredTier replaces voicePreferred', () => {
    const result = resolveTier({
      voicePreferred: 't1',
      thoughtFloor: null,
      contextFloor: null,
      onlineTiers: ['t1', 't2', 't3', 't4'],
      hints: { preferredTier: 't3' },
    });
    expect(result.targetTier).toBe('t3');
  });

  it('floor is max of thoughtFloor and contextFloor', () => {
    const result = resolveTier({
      voicePreferred: 't1',
      thoughtFloor: 't2',
      contextFloor: 't3',
      onlineTiers: ['t1', 't2', 't3', 't4'],
      hints: {},
    });
    // Floor = max(t2, t3) = t3
    expect(result.targetTier).toBe('t3');
    expect(result.clamped).toBe(true);
  });

  it('preferred tier between floor and ceiling is used', () => {
    const result = resolveTier({
      voicePreferred: 't3',
      thoughtFloor: 't2',
      contextFloor: null,
      onlineTiers: ['t1', 't2', 't3', 't4'],
      hints: { maxTier: 't4' },
    });
    expect(result.targetTier).toBe('t3');
    expect(result.clamped).toBe(false);
    expect(result.trimmed).toBe(false);
  });

  it('maxTier below floor: ceiling wins (clamped), closest available at/above floor', () => {
    // Edge case: maxTier says t1, but floor says t3
    // Floor takes precedence over ceiling per spec
    const result = resolveTier({
      voicePreferred: 't2',
      thoughtFloor: 't3',
      contextFloor: null,
      onlineTiers: ['t1', 't2', 't3', 't4'],
      hints: { maxTier: 't1' },
    });
    // Floor t3 > maxTier t1 — floor wins, target = t3
    expect(result.targetTier).toBe('t3');
    expect(result.clamped).toBe(true);
  });

  it('voice above ceiling gets clamped down', () => {
    const result = resolveTier({
      voicePreferred: 't4',
      thoughtFloor: null,
      contextFloor: null,
      onlineTiers: ['t1', 't2', 't3'],
      hints: { maxTier: 't3' },
    });
    expect(result.targetTier).toBe('t3');
    expect(result.clamped).toBe(true);
  });

  it('only t1 online, floor is t1 → picks t1', () => {
    const result = resolveTier({
      voicePreferred: 't3',
      thoughtFloor: null,
      contextFloor: null,
      onlineTiers: ['t1'],
      hints: {},
    });
    // t3 preferred, but only t1 online → closest available
    expect(result.targetTier).toBe('t1');
    expect(result.clamped).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// routeRequest — top-level orchestrator
// ---------------------------------------------------------------------------

describe('routeRequest', () => {
  let registry: TierRegistry;

  beforeEach(() => {
    registry = makeRegistry(['t1', 't2', 't3', 't4']);
  });

  it('thought.generate with haiku gets t2+ floor', () => {
    const request = makeThoughtRequest('haiku', { wonder: 0.3, reflection: 0.1, mischief: 0.9 });
    const plan = routeRequest(request, registry);

    expect(plan).not.toBeNull();
    expect(plan!.thoughtFloor).toBe('t2');
    // Voice would pick t1 (high mischief), but haiku floor lifts to t2
    expect(TIER_ORDER[plan!.targetTier]).toBeGreaterThanOrEqual(TIER_ORDER['t2']);
  });

  it('thought.generate with observation gets t1 floor', () => {
    const request = makeThoughtRequest('observation', { wonder: 0.3, reflection: 0.1, mischief: 0.9 });
    const plan = routeRequest(request, registry);

    expect(plan).not.toBeNull();
    expect(plan!.thoughtFloor).toBe('t1');
  });

  it('manual.prompt has no thought floor', () => {
    const request = makeManualRequest();
    const plan = routeRequest(request, registry);

    expect(plan).not.toBeNull();
    expect(plan!.thoughtFloor).toBeNull();
  });

  it('returns null when no tiers are online', () => {
    const emptyRegistry = makeRegistry([]);
    const request = makeManualRequest();
    const plan = routeRequest(request, emptyRegistry);

    expect(plan).toBeNull();
  });

  it('includes correct memoryDepth and token budget', () => {
    const request = makeThoughtRequest('observation', { wonder: 0.3, reflection: 0.9, mischief: 0.3 });
    const plan = routeRequest(request, registry);

    expect(plan).not.toBeNull();
    expect(plan!.memoryDepth).toBe('deep');
    expect(plan!.memoryTokenBudget).toBe(MEMORY_DEPTH_TOKENS['deep']);
  });

  it('includes tierConfig for the target tier', () => {
    const request = makeManualRequest();
    const plan = routeRequest(request, registry);

    expect(plan).not.toBeNull();
    expect(plan!.tierConfig).toBeDefined();
    expect(plan!.tierConfig.id).toBe(plan!.targetTier);
  });

  it('respects hints.preferredTier', () => {
    const request = makeManualRequest({ preferredTier: 't4' });
    const plan = routeRequest(request, registry);

    expect(plan).not.toBeNull();
    expect(plan!.targetTier).toBe('t4');
  });

  it('respects hints.maxTier', () => {
    const request = makeManualRequest({ maxTier: 't2' });
    const plan = routeRequest(request, registry);

    expect(plan).not.toBeNull();
    expect(TIER_ORDER[plan!.targetTier]).toBeLessThanOrEqual(TIER_ORDER['t2']);
    expect(plan!.maxTier).toBe('t2');
  });

  it('carries allowEscalation from hints', () => {
    const request = makeManualRequest({ allowEscalation: true });
    const plan = routeRequest(request, registry);

    expect(plan).not.toBeNull();
    expect(plan!.allowEscalation).toBe(true);
  });

  it('allowEscalation defaults to false', () => {
    const request = makeManualRequest();
    const plan = routeRequest(request, registry);

    expect(plan).not.toBeNull();
    expect(plan!.allowEscalation).toBe(false);
  });

  it('passes previousTier to castVoice for stickiness', () => {
    // Vector very close to t3, with previousTier=t3 should stick
    const request = makeThoughtRequest('observation', { wonder: 0.55, reflection: 0.40, mischief: 0.45 });
    const plan = routeRequest(request, registry, 't3');

    expect(plan).not.toBeNull();
    expect(plan!.voicePreferred).toBe('t3');
  });

  it('high-reflection thought → deep memory → context floor at t3', () => {
    const request = makeThoughtRequest('reaction', { wonder: 0.3, reflection: 0.9, mischief: 0.1 });
    const plan = routeRequest(request, registry);

    expect(plan).not.toBeNull();
    // reflection 0.9 → deep (500 tokens)
    // t1 maxMemoryTokens=100, t2=300, t3=500 → contextFloor=t3
    // thoughtFloor=t2 (reaction), contextFloor=t3 → floor=t3
    expect(plan!.memoryDepth).toBe('deep');
    expect(plan!.contextFloor).toBe('t3');
    expect(TIER_ORDER[plan!.targetTier]).toBeGreaterThanOrEqual(TIER_ORDER['t3']);
  });

  it('sets promptProfile from target tier config', () => {
    // Force to t1 by making it the only tier online
    const registry1 = makeRegistry(['t1']);
    const request = makeManualRequest();
    const plan = routeRequest(request, registry1);

    expect(plan).not.toBeNull();
    expect(plan!.promptProfile).toBe('reflex');
  });

  it('marks trimmed when falling below floor', () => {
    // Only t1 online, but haiku wants t2+
    const registry1 = makeRegistry(['t1']);
    const request = makeThoughtRequest('haiku', { wonder: 0.5, reflection: 0.5, mischief: 0.5 });
    const plan = routeRequest(request, registry1);

    expect(plan).not.toBeNull();
    expect(plan!.targetTier).toBe('t1');
    expect(plan!.trimmed).toBe(true);
  });

  it('uses vector from thought input context for voice casting', () => {
    // High mischief → should voice-cast to t1
    const request = makeThoughtRequest('observation', { wonder: 0.3, reflection: 0.1, mischief: 0.9 });
    const plan = routeRequest(request, registry);

    expect(plan).not.toBeNull();
    expect(plan!.voicePreferred).toBe('t1');
  });
});
