// src/lib/server/brain/prepare-provenance.test.ts
// Tests for prompt provenance metadata returned by preparePrompt — SP7 Task 5

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  preparePrompt,
} from './prepare.js';
import type { BrainRequestV1, RoutePlan, TierConfig } from './types.js';
import type { MemoryProvider } from '../memory/provider.js';
import type { RetrieveResult, MemoryFragment } from '../memory/types.js';
import type { PrepareResult, RetrievalProvenance } from '../training/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const BASE_TIER_CONFIG: TierConfig = {
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
};

const BASE_ROUTE_PLAN: RoutePlan = {
  targetTier: 't2',
  tierConfig: BASE_TIER_CONFIG,
  voicePreferred: 't2',
  thoughtFloor: 't2',
  contextFloor: 't2',
  memoryDepth: 'medium',
  memoryTokenBudget: 300,
  promptProfile: 'full',
  clamped: false,
  trimmed: false,
  allowEscalation: false,
  maxTier: null,
};

function makeThoughtRequest(
  overrides: {
    type?: 'observation' | 'reaction' | 'haiku';
    novelty?: boolean;
    environment?: string;
    momentum?: string;
    timeOfDay?: string;
    mode?: string;
  } = {},
): Extract<BrainRequestV1, { kind: 'thought.generate' }> {
  return {
    v: 1,
    requestId: 'test-prov-001',
    kind: 'thought.generate',
    origin: 'thoughts',
    input: {
      type: overrides.type ?? 'observation',
      trigger: 'idle',
      novelty: overrides.novelty ?? false,
      context: {
        vector: { wonder: 0.5, reflection: 0.5, mischief: 0.3 },
        mode: overrides.mode ?? 'ambient',
        timeOfDay: overrides.timeOfDay ?? 'evening',
        environment: overrides.environment ?? 'quiet room, dim light',
        momentum: overrides.momentum ?? 'settling and present',
      },
      constraints: { maxLength: 30, tone: 'present' },
    },
  };
}

function makeManualRequest(
  text = 'What are you thinking about?',
): Extract<BrainRequestV1, { kind: 'manual.prompt' }> {
  return {
    v: 1,
    requestId: 'test-prov-002',
    kind: 'manual.prompt',
    origin: 'console',
    input: { text },
  };
}

function makeFragment(text: string, id = 'frag-1'): MemoryFragment {
  return {
    id,
    text,
    source: 'canon',
    collection: 'beau_identity',
    entityId: 'bible-1',
    tokenCount: 20,
    rawDistance: 0.3,
    finalScore: 0.7,
    createdAt: '2026-03-24T00:00:00.000Z',
  };
}

function makeProvenance(fragmentId = 'frag-1'): RetrievalProvenance {
  return {
    fragmentId,
    collection: 'beau_identity',
    sourceType: 'canon',
    sourceEntityId: 'bible-1',
    rank: 1,
    baseScore: 0.7,
    finalScore: 0.7,
    selected: true,
    tokenCount: 20,
    excerptHash: 'abc123',
  };
}

function makeMemProvider(result: RetrieveResult): MemoryProvider {
  return {
    retrieve: vi.fn().mockResolvedValue(result),
    upsert: vi.fn(),
    remove: vi.fn(),
    health: vi.fn(),
    processBatch: vi.fn(),
    rebuildCollection: vi.fn(),
    ensureCollections: vi.fn(),
    indexBible: vi.fn(),
    reconcileAll: vi.fn(),
    recoverStuckJobs: vi.fn(),
  } as unknown as MemoryProvider;
}

const MINIMAL_PROMPT = `<!-- SECTION: CORE_IDENTITY -->
You are Beau.
<!-- SECTION: VOICE_RULES -->
Speak simply.
<!-- SECTION: CONTEXT -->
Mode: {{MODE}}
`;

const mockGetState = vi.fn().mockReturnValue({
  mode: 'ambient',
  environment: 'quiet room',
  wakeWord: 'hey bmo',
  personalityVector: { wonder: 0.5, reflection: 0.5, mischief: 0.3 },
  timeOfDay: 'evening',
  sleepState: 'awake',
  presenceState: 'present',
  weather: '',
  lux: '',
  soulCode: '',
  voiceVersion: '',
  natal: '',
});

// ---------------------------------------------------------------------------
// preparePrompt returns PrepareResult
// ---------------------------------------------------------------------------

describe('preparePrompt provenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetState.mockReturnValue({
      mode: 'ambient',
      environment: 'quiet room',
      wakeWord: 'hey bmo',
      personalityVector: { wonder: 0.5, reflection: 0.5, mischief: 0.3 },
      timeOfDay: 'evening',
      sleepState: 'awake',
      presenceState: 'present',
      weather: '',
      lux: '',
      soulCode: '',
      voiceVersion: '',
      natal: '',
    });
  });

  describe('return shape', () => {
    it('returns a PrepareResult object (not a plain string) for thought.generate', async () => {
      const request = makeThoughtRequest({ type: 'observation' });
      const result = await preparePrompt(request, BASE_ROUTE_PLAN, () => null);

      expect(result).toBeTypeOf('object');
      expect(result).toHaveProperty('prompt');
      expect(result).toHaveProperty('provenance');
      expect(result).toHaveProperty('retrievals');
    });

    it('returns a PrepareResult object for manual.prompt', async () => {
      const request = makeManualRequest('Hello Beau');
      const result = await preparePrompt(
        request, BASE_ROUTE_PLAN, () => null, mockGetState, MINIMAL_PROMPT,
      );

      expect(result).toBeTypeOf('object');
      expect(result).toHaveProperty('prompt');
      expect(result).toHaveProperty('provenance');
      expect(result).toHaveProperty('retrievals');
    });
  });

  describe('prompt field', () => {
    it('contains the assembled prompt text for thought.generate', async () => {
      const request = makeThoughtRequest({ type: 'observation' });
      const result = await preparePrompt(request, BASE_ROUTE_PLAN, () => null);

      expect(typeof result.prompt).toBe('string');
      expect(result.prompt).toContain('You notice things');
      expect(result.prompt).toContain('quiet room, dim light');
    });

    it('contains the assembled prompt text for manual.prompt', async () => {
      const request = makeManualRequest('What is wonder?');
      const result = await preparePrompt(
        request, BASE_ROUTE_PLAN, () => null, mockGetState, MINIMAL_PROMPT,
      );

      expect(typeof result.prompt).toBe('string');
      expect(result.prompt).toContain('What is wonder?');
      expect(result.prompt).toContain('You are Beau');
    });
  });

  describe('provenance field', () => {
    it('has all required PromptProvenance properties for thought.generate', async () => {
      const request = makeThoughtRequest({ type: 'observation' });
      const result = await preparePrompt(request, BASE_ROUTE_PLAN, () => null);

      const { provenance } = result;
      expect(typeof provenance.templateHash).toBe('string');
      expect(provenance.templateHash.length).toBeGreaterThan(0);
      expect(provenance.promptPolicyVersion).toBe('1.0.0');
      expect(provenance.retrievalPolicyVersion).toBe('1.0.0');
      expect(provenance.assemblerVersion).toBe('1.0.0');
      expect(provenance.promptProfile).toBe(BASE_ROUTE_PLAN.promptProfile);
      expect(typeof provenance.promptHash).toBe('string');
      expect(provenance.promptHash.length).toBeGreaterThan(0);
    });

    it('has all required PromptProvenance properties for manual.prompt', async () => {
      const request = makeManualRequest('Hello');
      const result = await preparePrompt(
        request, BASE_ROUTE_PLAN, () => null, mockGetState, MINIMAL_PROMPT,
      );

      const { provenance } = result;
      expect(typeof provenance.templateHash).toBe('string');
      expect(provenance.templateHash.length).toBeGreaterThan(0);
      expect(provenance.promptPolicyVersion).toBe('1.0.0');
      expect(provenance.retrievalPolicyVersion).toBe('1.0.0');
      expect(provenance.assemblerVersion).toBe('1.0.0');
      expect(provenance.promptProfile).toBe('full');
      expect(typeof provenance.promptHash).toBe('string');
      expect(provenance.promptHash.length).toBeGreaterThan(0);
    });

    it('promptHash differs from templateHash (template vs final prompt)', async () => {
      const request = makeManualRequest('Hello Beau');
      const result = await preparePrompt(
        request, BASE_ROUTE_PLAN, () => null, mockGetState, MINIMAL_PROMPT,
      );

      // The template is raw, prompt is assembled — they should produce different hashes
      expect(result.provenance.promptHash).not.toBe(result.provenance.templateHash);
    });

    it('same request produces the same promptHash (deterministic)', async () => {
      const request = makeThoughtRequest({ type: 'observation' });

      const result1 = await preparePrompt(request, BASE_ROUTE_PLAN, () => null);
      const result2 = await preparePrompt(request, BASE_ROUTE_PLAN, () => null);

      expect(result1.provenance.promptHash).toBe(result2.provenance.promptHash);
    });

    it('promptProfile matches the route plan profile', async () => {
      const reflexPlan = { ...BASE_ROUTE_PLAN, promptProfile: 'reflex' as const };
      const request = makeManualRequest('test');
      const result = await preparePrompt(
        request, reflexPlan, () => null, mockGetState, MINIMAL_PROMPT,
      );

      expect(result.provenance.promptProfile).toBe('reflex');
    });
  });

  describe('retrievals field', () => {
    it('returns empty retrievals when no memory provider is available', async () => {
      const request = makeThoughtRequest({ type: 'observation' });
      const result = await preparePrompt(request, BASE_ROUTE_PLAN, () => null);

      expect(result.retrievals).toEqual([]);
    });

    it('returns retrievals from the memory retriever provenance', async () => {
      const fragment = makeFragment('remembered text');
      const prov = makeProvenance('frag-1');
      const memProvider = makeMemProvider({
        fragments: [fragment],
        usedTokens: 20,
        provenance: [prov],
      });

      const request = makeThoughtRequest({ type: 'observation' });
      const result = await preparePrompt(request, BASE_ROUTE_PLAN, () => memProvider);

      expect(result.retrievals).toHaveLength(1);
      expect(result.retrievals[0].fragmentId).toBe('frag-1');
      expect(result.retrievals[0].collection).toBe('beau_identity');
    });

    it('returns empty retrievals when retrieval fails (fail-open)', async () => {
      const failingProvider = {
        retrieve: vi.fn().mockRejectedValue(new Error('ChromaDB down')),
      } as unknown as MemoryProvider;

      const request = makeThoughtRequest({ type: 'observation' });
      const result = await preparePrompt(request, BASE_ROUTE_PLAN, () => failingProvider);

      expect(result.retrievals).toEqual([]);
    });

    it('passes through multiple retrieval provenances', async () => {
      const fragments = [
        makeFragment('first', 'frag-1'),
        makeFragment('second', 'frag-2'),
      ];
      const provenances = [
        makeProvenance('frag-1'),
        { ...makeProvenance('frag-2'), rank: 2 },
      ];
      const memProvider = makeMemProvider({
        fragments,
        usedTokens: 40,
        provenance: provenances,
      });

      const request = makeThoughtRequest({ type: 'observation' });
      const result = await preparePrompt(request, BASE_ROUTE_PLAN, () => memProvider);

      expect(result.retrievals).toHaveLength(2);
    });

    it('includes retrievals for manual.prompt requests', async () => {
      const fragment = makeFragment('archived text');
      const prov = makeProvenance('frag-archive');
      const memProvider = makeMemProvider({
        fragments: [fragment],
        usedTokens: 20,
        provenance: [prov],
      });

      const request = makeManualRequest('Tell me about the archive');
      const result = await preparePrompt(
        request, BASE_ROUTE_PLAN, () => memProvider, mockGetState, MINIMAL_PROMPT,
      );

      expect(result.retrievals).toHaveLength(1);
      expect(result.retrievals[0].fragmentId).toBe('frag-archive');
    });
  });
});
