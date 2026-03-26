// src/lib/server/brain/prepare.test.ts
// TDD tests for Brain Prepare — SP6 Task 4
// Thought + manual prompt building with memory context
// Updated for SP7 Task 5: preparePrompt returns PrepareResult

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  prepareThoughtPrompt,
  prepareManualPrompt,
  preparePrompt,
} from './prepare.js';
import type { BrainRequestV1, RoutePlan, TierConfig } from './types.js';
import type { MemoryProvider } from '../memory/provider.js';
import type { RetrieveResult, MemoryFragment } from '../memory/types.js';

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
    requestId: 'test-id-123',
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
    requestId: 'test-id-456',
    kind: 'manual.prompt',
    origin: 'console',
    input: { text },
  };
}

function makeFragment(text: string): MemoryFragment {
  return {
    id: 'frag-1',
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

function makeFailingMemProvider(error: Error): MemoryProvider {
  return {
    retrieve: vi.fn().mockRejectedValue(error),
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

// ---------------------------------------------------------------------------
// prepareThoughtPrompt
// ---------------------------------------------------------------------------

describe('prepareThoughtPrompt', () => {
  describe('observation prompt', () => {
    it('returns a prompt containing environment and momentum', async () => {
      const request = makeThoughtRequest({
        type: 'observation',
        environment: 'rainy afternoon, fan humming',
        momentum: 'quiet and watchful',
      });
      const { prompt } = await prepareThoughtPrompt(request, BASE_ROUTE_PLAN, () => null);

      expect(prompt).toContain('rainy afternoon, fan humming');
      expect(prompt).toContain('quiet and watchful');
    });

    it('includes the observation instruction phrase', async () => {
      const request = makeThoughtRequest({ type: 'observation' });
      const { prompt } = await prepareThoughtPrompt(request, BASE_ROUTE_PLAN, () => null);

      expect(prompt).toContain('You notice things');
      expect(prompt).toContain('Under 30 words');
    });

    it('names Beau and Lafayette, Louisiana', async () => {
      const request = makeThoughtRequest({ type: 'observation' });
      const { prompt } = await prepareThoughtPrompt(request, BASE_ROUTE_PLAN, () => null);

      expect(prompt).toContain('Beau');
      expect(prompt).toContain('Lafayette, Louisiana');
    });
  });

  describe('reaction prompt', () => {
    it('includes time-of-day and environment', async () => {
      const request = makeThoughtRequest({
        type: 'reaction',
        timeOfDay: 'late night',
        environment: 'empty studio',
      });
      const { prompt } = await prepareThoughtPrompt(request, BASE_ROUTE_PLAN, () => null);

      expect(prompt).toContain('late night');
      expect(prompt).toContain('empty studio');
    });

    it('includes the reaction instruction phrase', async () => {
      const request = makeThoughtRequest({ type: 'reaction' });
      const { prompt } = await prepareThoughtPrompt(request, BASE_ROUTE_PLAN, () => null);

      expect(prompt).toContain('Under 20 words');
      expect(prompt).toContain('Not a report. A feeling.');
    });
  });

  describe('haiku prompt', () => {
    it('includes "Write one haiku" instruction', async () => {
      const request = makeThoughtRequest({ type: 'haiku' });
      const { prompt } = await prepareThoughtPrompt(request, BASE_ROUTE_PLAN, () => null);

      expect(prompt).toContain('Write one haiku');
    });

    it('includes the SILENCE instruction', async () => {
      const request = makeThoughtRequest({ type: 'haiku' });
      const { prompt } = await prepareThoughtPrompt(request, BASE_ROUTE_PLAN, () => null);

      expect(prompt).toContain('SILENCE');
    });

    it('includes time-of-day and environment', async () => {
      const request = makeThoughtRequest({
        type: 'haiku',
        timeOfDay: 'dawn',
        environment: 'birds outside, dew on the window',
      });
      const { prompt } = await prepareThoughtPrompt(request, BASE_ROUTE_PLAN, () => null);

      expect(prompt).toContain('dawn');
      expect(prompt).toContain('birds outside, dew on the window');
    });
  });

  describe('novelty override', () => {
    it('uses novelty prompt regardless of type=observation when novelty=true', async () => {
      const request = makeThoughtRequest({ type: 'observation', novelty: true });
      const { prompt } = await prepareThoughtPrompt(request, BASE_ROUTE_PLAN, () => null);

      expect(prompt).toContain('unprompted, no reason');
      // Observation-specific text should NOT appear
      expect(prompt).not.toContain('You notice things');
    });

    it('uses novelty prompt for haiku type when novelty=true', async () => {
      const request = makeThoughtRequest({ type: 'haiku', novelty: true });
      const { prompt } = await prepareThoughtPrompt(request, BASE_ROUTE_PLAN, () => null);

      expect(prompt).toContain('unprompted, no reason');
      expect(prompt).not.toContain('Write one haiku');
    });

    it('uses novelty prompt for reaction type when novelty=true', async () => {
      const request = makeThoughtRequest({ type: 'reaction', novelty: true });
      const { prompt } = await prepareThoughtPrompt(request, BASE_ROUTE_PLAN, () => null);

      expect(prompt).toContain('unprompted, no reason');
      expect(prompt).not.toContain('Not a report. A feeling.');
    });

    it('novelty prompt includes momentum', async () => {
      const request = makeThoughtRequest({ novelty: true, momentum: 'electric and curious' });
      const { prompt } = await prepareThoughtPrompt(request, BASE_ROUTE_PLAN, () => null);

      expect(prompt).toContain('electric and curious');
    });
  });

  describe('memory integration', () => {
    it('includes memory fragments when retrieval succeeds', async () => {
      const fragment = makeFragment('Beau once said: wonder is the first light');
      const memProvider = makeMemProvider({ fragments: [fragment], usedTokens: 20, provenance: [] });

      const request = makeThoughtRequest({ type: 'observation' });
      const { prompt } = await prepareThoughtPrompt(request, BASE_ROUTE_PLAN, () => memProvider);

      expect(prompt).toContain('Beau once said: wonder is the first light');
      expect(prompt).toContain('Some things you remember');
    });

    it('formats multiple fragments as "[source] text" lines', async () => {
      const fragments: MemoryFragment[] = [
        { ...makeFragment('first fragment'), source: 'canon' },
        { ...makeFragment('second fragment'), source: 'haiku', id: 'frag-2', entityId: 'haiku-1' },
      ];
      const memProvider = makeMemProvider({ fragments, usedTokens: 40, provenance: [] });

      const request = makeThoughtRequest({ type: 'reaction' });
      const { prompt } = await prepareThoughtPrompt(request, BASE_ROUTE_PLAN, () => memProvider);

      expect(prompt).toContain('[canon] first fragment');
      expect(prompt).toContain('[haiku] second fragment');
    });

    it('proceeds without memory when retrieval throws (fail-open)', async () => {
      const memProvider = makeFailingMemProvider(new Error('ChromaDB unavailable'));

      const request = makeThoughtRequest({ type: 'observation' });
      const { prompt } = await prepareThoughtPrompt(request, BASE_ROUTE_PLAN, () => memProvider);

      // Prompt should still be valid — just no memory section
      expect(prompt).toContain('You notice things');
      expect(prompt).not.toContain('Some things you remember');
    });

    it('proceeds without memory when retrieval times out (>2s)', async () => {
      const slowProvider = {
        retrieve: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve({ fragments: [], usedTokens: 0, provenance: [] }), 3000))
        ),
      } as unknown as MemoryProvider;

      const request = makeThoughtRequest({ type: 'observation' });
      const { prompt } = await prepareThoughtPrompt(request, BASE_ROUTE_PLAN, () => slowProvider);

      expect(prompt).toContain('You notice things');
      expect(prompt).not.toContain('Some things you remember');
    }, 5000);

    it('proceeds without memory when provider is null', async () => {
      const request = makeThoughtRequest({ type: 'haiku' });
      const { prompt } = await prepareThoughtPrompt(request, BASE_ROUTE_PLAN, () => null);

      expect(prompt).toContain('Write one haiku');
      expect(prompt).not.toContain('Some things you remember');
    });

    it('passes the correct caller "thoughts" to memory retriever', async () => {
      const fragment = makeFragment('test fragment');
      const memProvider = makeMemProvider({ fragments: [fragment], usedTokens: 20, provenance: [] });

      const request = makeThoughtRequest({ type: 'observation' });
      await prepareThoughtPrompt(request, BASE_ROUTE_PLAN, () => memProvider);

      expect(memProvider.retrieve).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ caller: 'thoughts' }),
      );
    });

    it('passes the token budget from plan to the retriever', async () => {
      const memProvider = makeMemProvider({ fragments: [], usedTokens: 0, provenance: [] });

      const planWith500 = { ...BASE_ROUTE_PLAN, memoryTokenBudget: 500 };
      const request = makeThoughtRequest({ type: 'observation' });
      await prepareThoughtPrompt(request, planWith500, () => memProvider);

      expect(memProvider.retrieve).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ maxTokens: 500 }),
      );
    });

    it('uses environment + mode as the retrieval query', async () => {
      const memProvider = makeMemProvider({ fragments: [], usedTokens: 0, provenance: [] });

      const request = makeThoughtRequest({
        type: 'observation',
        environment: 'studio with VJ visuals',
        mode: 'witness',
      });
      await prepareThoughtPrompt(request, BASE_ROUTE_PLAN, () => memProvider);

      expect(memProvider.retrieve).toHaveBeenCalledWith(
        'studio with VJ visuals witness',
        expect.any(Object),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// prepareManualPrompt
// ---------------------------------------------------------------------------

describe('prepareManualPrompt', () => {
  const PROMPT_TEXT = `<!-- SECTION: CORE_IDENTITY -->
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

  it('includes user text at the end of the assembled prompt', async () => {
    const request = makeManualRequest('What is the color of longing?');
    const plan = { ...BASE_ROUTE_PLAN, promptProfile: 'full' as const };

    const { prompt } = await prepareManualPrompt(
      request, plan,
      () => null,
      mockGetState,
      PROMPT_TEXT,
    );

    expect(prompt).toContain('What is the color of longing?');
    // User text should appear after the system prompt
    const systemEnd = prompt.indexOf('You are Beau');
    const userStart = prompt.lastIndexOf('What is the color of longing?');
    expect(userStart).toBeGreaterThan(systemEnd);
  });

  it('includes memory fragments when retrieval succeeds', async () => {
    const fragment = makeFragment('from the archives: the room had yellow walls');
    const memProvider = makeMemProvider({ fragments: [fragment], usedTokens: 15, provenance: [] });

    const request = makeManualRequest('Tell me about the yellow room');
    const plan = { ...BASE_ROUTE_PLAN, promptProfile: 'full' as const };

    const { prompt } = await prepareManualPrompt(
      request, plan,
      () => memProvider,
      mockGetState,
      PROMPT_TEXT,
    );

    expect(prompt).toContain('from the archives: the room had yellow walls');
  });

  it('proceeds without memory when retrieval fails (fail-open)', async () => {
    const memProvider = makeFailingMemProvider(new Error('Chroma offline'));

    const request = makeManualRequest('Hello Beau');
    const plan = { ...BASE_ROUTE_PLAN, promptProfile: 'full' as const };

    // Should not throw
    const { prompt } = await prepareManualPrompt(
      request, plan,
      () => memProvider,
      mockGetState,
      PROMPT_TEXT,
    );

    expect(prompt).toContain('Hello Beau');
    expect(prompt).not.toContain('Some things you remember');
  });

  it('passes caller "prompt" to the memory retriever', async () => {
    const memProvider = makeMemProvider({ fragments: [], usedTokens: 0, provenance: [] });

    const request = makeManualRequest('test query');
    const plan = { ...BASE_ROUTE_PLAN, promptProfile: 'full' as const };

    await prepareManualPrompt(
      request, plan,
      () => memProvider,
      mockGetState,
      PROMPT_TEXT,
    );

    expect(memProvider.retrieve).toHaveBeenCalledWith(
      'test query',
      expect.objectContaining({ caller: 'prompt' }),
    );
  });

  it('uses the user text as the retrieval query', async () => {
    const memProvider = makeMemProvider({ fragments: [], usedTokens: 0, provenance: [] });

    const request = makeManualRequest('What is wonder?');
    const plan = { ...BASE_ROUTE_PLAN, promptProfile: 'full' as const };

    await prepareManualPrompt(
      request, plan,
      () => memProvider,
      mockGetState,
      PROMPT_TEXT,
    );

    expect(memProvider.retrieve).toHaveBeenCalledWith(
      'What is wonder?',
      expect.objectContaining({ caller: 'prompt' }),
    );
  });

  it('passes token budget from plan to retriever', async () => {
    const memProvider = makeMemProvider({ fragments: [], usedTokens: 0, provenance: [] });

    const request = makeManualRequest('hello');
    const plan = { ...BASE_ROUTE_PLAN, memoryTokenBudget: 450, promptProfile: 'full' as const };

    await prepareManualPrompt(
      request, plan,
      () => memProvider,
      mockGetState,
      PROMPT_TEXT,
    );

    expect(memProvider.retrieve).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ maxTokens: 450 }),
    );
  });

  it('substitutes {{MODE}} placeholder from getState', async () => {
    mockGetState.mockReturnValue({
      mode: 'witness',
      environment: 'studio',
      wakeWord: '',
      personalityVector: { wonder: 0.5, reflection: 0.5, mischief: 0.3 },
    });

    const request = makeManualRequest('hello');
    const plan = { ...BASE_ROUTE_PLAN, promptProfile: 'full' as const };

    const { prompt } = await prepareManualPrompt(
      request, plan,
      () => null,
      mockGetState,
      PROMPT_TEXT,
    );

    expect(prompt).toContain('witness');
  });
});

// ---------------------------------------------------------------------------
// preparePrompt dispatcher
// ---------------------------------------------------------------------------

describe('preparePrompt', () => {
  it('routes thought.generate to prepareThoughtPrompt', async () => {
    const request = makeThoughtRequest({ type: 'observation' });
    const result = await preparePrompt(request, BASE_ROUTE_PLAN, () => null);

    expect(result.prompt).toContain('You notice things');
  });

  it('routes manual.prompt to prepareManualPrompt (returns a PrepareResult with prompt)', async () => {
    const request = makeManualRequest('Hey Beau');
    const mockState = vi.fn().mockReturnValue({ mode: 'ambient', environment: '', wakeWord: '' });

    const MINIMAL_PROMPT = `<!-- SECTION: CORE_IDENTITY -->
You are Beau.
`;

    const result = await preparePrompt(request, BASE_ROUTE_PLAN, () => null, mockState, MINIMAL_PROMPT);

    expect(typeof result.prompt).toBe('string');
    expect(result.prompt.length).toBeGreaterThan(0);
    expect(result.prompt).toContain('Hey Beau');
  });

  it('throws for unknown request kinds', async () => {
    const badRequest = { kind: 'unknown.kind', v: 1, requestId: 'x', origin: 'console', input: {} } as unknown as BrainRequestV1;

    await expect(
      preparePrompt(badRequest, BASE_ROUTE_PLAN, () => null)
    ).rejects.toThrow();
  });
});
