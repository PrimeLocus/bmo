// src/lib/server/brain/executor.test.ts
// TDD tests for Brain Executor — SP6 Task 5
// HTTP calls to Ollama, SILENCE detection, fallback logic, quality signals

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeOnTier, parseSilence, executeWithFallback, checkQualitySignals } from './executor.js';
import { TierRegistry } from './registry.js';
import type { TierConfig, RoutePlan, BrainRequestV1 } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTierConfig(overrides: Partial<TierConfig> = {}): TierConfig {
  return {
    id: 't2',
    label: 'T2 Test',
    endpoint: 'http://localhost:11434',
    model: 'gemma3:4b',
    timeoutMs: 15_000,
    maxPromptTokens: 2000,
    maxMemoryTokens: 300,
    maxOutputTokens: 512,
    supportsStreaming: true,
    promptProfile: 'full',
    ...overrides,
  };
}

function makeRoutePlan(overrides: Partial<RoutePlan> = {}): RoutePlan {
  const cfg = makeTierConfig();
  return {
    targetTier: 't2',
    tierConfig: cfg,
    voicePreferred: 't2',
    thoughtFloor: null,
    contextFloor: null,
    memoryDepth: 'medium',
    memoryTokenBudget: 300,
    promptProfile: 'full',
    clamped: false,
    trimmed: false,
    allowEscalation: false,
    maxTier: null,
    ...overrides,
  };
}

function makeThoughtRequest(): Extract<BrainRequestV1, { kind: 'thought.generate' }> {
  return {
    v: 1,
    requestId: 'test-req-001',
    kind: 'thought.generate',
    origin: 'thoughts',
    input: {
      type: 'observation',
      trigger: 'test',
      novelty: false,
      context: {
        vector: { wonder: 0.5, reflection: 0.5, mischief: 0.3 },
        mode: 'ambient',
        timeOfDay: 'evening',
        environment: 'quiet room',
        momentum: 'gentle curiosity',
      },
      constraints: { maxLength: 30, tone: 'reflective' },
    },
  };
}

function makeManualRequest(): Extract<BrainRequestV1, { kind: 'manual.prompt' }> {
  return {
    v: 1,
    requestId: 'test-req-002',
    kind: 'manual.prompt',
    origin: 'console',
    input: { text: 'What are you thinking about?' },
  };
}

function makeOllamaResponse(responseText: string, ok = true): Response {
  return new Response(
    JSON.stringify({ model: 'gemma3:4b', response: responseText, done: true }),
    { status: ok ? 200 : 500, headers: { 'Content-Type': 'application/json' } },
  );
}

// ---------------------------------------------------------------------------
// parseSilence
// ---------------------------------------------------------------------------

describe('parseSilence', () => {
  it('returns null for "SILENCE"', () => {
    expect(parseSilence('SILENCE')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSilence('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseSilence('  ')).toBeNull();
  });

  it('returns trimmed text for normal content', () => {
    expect(parseSilence('hello world')).toBe('hello world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(parseSilence('  some text  ')).toBe('some text');
  });

  it('preserves internal whitespace', () => {
    expect(parseSilence('  line one\nline two  ')).toBe('line one\nline two');
  });
});

// ---------------------------------------------------------------------------
// executeOnTier
// ---------------------------------------------------------------------------

describe('executeOnTier', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns text on a successful response', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(makeOllamaResponse('the moss remembers rain'));

    const cfg = makeTierConfig();
    const result = await executeOnTier('some prompt', cfg);

    expect(result.text).toBe('the moss remembers rain');
    expect(result.model).toBe('gemma3:4b');
    expect(result.generationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns null text for SILENCE response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeOllamaResponse('SILENCE'));

    const result = await executeOnTier('some prompt', makeTierConfig());

    expect(result.text).toBeNull();
  });

  it('returns null text for empty response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeOllamaResponse(''));

    const result = await executeOnTier('some prompt', makeTierConfig());

    expect(result.text).toBeNull();
  });

  it('returns null text for whitespace-only response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeOllamaResponse('   '));

    const result = await executeOnTier('some prompt', makeTierConfig());

    expect(result.text).toBeNull();
  });

  it('throws on non-200 response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    await expect(executeOnTier('some prompt', makeTierConfig())).rejects.toThrow();
  });

  it('throws on network error (fetch rejects)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(executeOnTier('some prompt', makeTierConfig())).rejects.toThrow();
  });

  it('throws on timeout (AbortError)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
    );

    await expect(executeOnTier('some prompt', makeTierConfig())).rejects.toThrow();
  });

  it('constructs the correct endpoint URL', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(makeOllamaResponse('ok'));

    const cfg = makeTierConfig({ endpoint: 'http://192.168.1.10:11434' });
    await executeOnTier('prompt', cfg);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.10:11434/api/generate',
      expect.any(Object),
    );
  });

  it('passes the model name in the request body', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(makeOllamaResponse('ok'));

    const cfg = makeTierConfig({ model: 'llama3.1:8b' });
    await executeOnTier('prompt text', cfg);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('llama3.1:8b');
    expect(body.prompt).toBe('prompt text');
    expect(body.stream).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// executeWithFallback
// ---------------------------------------------------------------------------

describe('executeWithFallback', () => {
  let registry: TierRegistry;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    registry = new TierRegistry();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setTierOnline(id: string) {
    registry.updateState(id as 't1' | 't2' | 't3' | 't4', 'online', { latencyMs: 10 });
  }

  it('returns fallback=false when primary succeeds', async () => {
    setTierOnline('t2');
    setTierOnline('t3');

    vi.mocked(fetch).mockResolvedValueOnce(makeOllamaResponse('the light refracts slowly'));

    const request = makeThoughtRequest();
    const plan = makeRoutePlan({ targetTier: 't2', tierConfig: makeTierConfig({ id: 't2' }) });

    const result = await executeWithFallback('some prompt', plan, registry);

    expect(result.fallback).toBe(false);
    expect(result.fallbackFrom).toBeUndefined();
    expect(result.text).toBe('the light refracts slowly');
    expect(result.tier).toBe('t2');
  });

  it('uses upward fallback when primary fails and higher tier is available', async () => {
    setTierOnline('t2');
    setTierOnline('t3');

    const fetchMock = vi.mocked(fetch);
    // t2 fails
    fetchMock.mockRejectedValueOnce(new Error('t2 offline'));
    // t3 succeeds
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ model: 'llama3.1:8b', response: 'something from t3', done: true }),
        { status: 200 },
      ),
    );

    const plan = makeRoutePlan({ targetTier: 't2', tierConfig: makeTierConfig({ id: 't2' }) });

    const result = await executeWithFallback('prompt', plan, registry);

    expect(result.fallback).toBe(true);
    expect(result.fallbackFrom).toBe('t2');
    expect(result.tier).toBe('t3');
    expect(result.text).toBe('something from t3');
  });

  it('uses downward fallback when primary fails and no higher tier is available', async () => {
    setTierOnline('t1');
    setTierOnline('t3');

    const fetchMock = vi.mocked(fetch);
    // t3 (primary) fails
    fetchMock.mockRejectedValueOnce(new Error('t3 offline'));
    // t1 (downward) succeeds
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ model: 'qwen2.5:1.5b', response: 'reflex thought', done: true }),
        { status: 200 },
      ),
    );

    // preparePrompt callback for downward fallback — now returns PrepareResult
    const preparePrompt = vi.fn().mockResolvedValue({
      prompt: 're-prepared prompt for t1',
      provenance: { templateHash: '', promptPolicyVersion: '1.0.0', retrievalPolicyVersion: '1.0.0', assemblerVersion: '1.0.0', promptProfile: 'reflex', promptHash: '' },
      retrievals: [],
    });

    const t3Config = makeTierConfig({ id: 't3', model: 'llama3.1:8b', endpoint: 'http://localhost:11434' });
    const plan = makeRoutePlan({ targetTier: 't3', tierConfig: t3Config });

    const result = await executeWithFallback('prompt', plan, registry, preparePrompt);

    expect(result.fallback).toBe(true);
    expect(result.fallbackFrom).toBe('t3');
    expect(result.tier).toBe('t1');
    // preparePrompt should have been called with the t1 config for downward fallback
    expect(preparePrompt).toHaveBeenCalled();
  });

  it('does not attempt fallback tier if re-prepare throws (downward fallback)', async () => {
    setTierOnline('t1');
    setTierOnline('t3');

    const fetchMock = vi.mocked(fetch);
    // t3 (primary) fails
    fetchMock.mockRejectedValueOnce(new Error('t3 offline'));
    // t1 would succeed if called — but it must NOT be called if re-prepare throws
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ model: 'qwen2.5:1.5b', response: 'should not appear', done: true }),
        { status: 200 },
      ),
    );

    const preparePromptCb = vi.fn().mockRejectedValue(new Error('re-prepare failed'));
    const t3Config = makeTierConfig({ id: 't3', model: 'llama3.1:8b', endpoint: 'http://localhost:11434' });
    const plan = makeRoutePlan({ targetTier: 't3', tierConfig: t3Config });
    const request = makeThoughtRequest(); // thought — should return silence, not throw

    const result = await executeWithFallback('prompt', plan, registry, preparePromptCb, request);

    // Fallback was not attempted — fetch called only once (for the primary)
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Returns silence (null text) because fallback was skipped
    expect(result.text).toBeNull();
  });

  it('throws when re-prepare fails on downward fallback for manual.prompt', async () => {
    setTierOnline('t1');
    setTierOnline('t3');

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockRejectedValueOnce(new Error('t3 offline'));

    const preparePromptCb = vi.fn().mockRejectedValue(new Error('re-prepare failed'));
    const t3Config = makeTierConfig({ id: 't3', model: 'llama3.1:8b', endpoint: 'http://localhost:11434' });
    const plan = makeRoutePlan({ targetTier: 't3', tierConfig: t3Config });
    const request = makeManualRequest(); // manual — should throw

    await expect(
      executeWithFallback('prompt', plan, registry, preparePromptCb, request),
    ).rejects.toThrow();

    // Fallback was not attempted — fetch called only once
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns text=null when both attempts fail for thought.generate', async () => {
    setTierOnline('t2');
    setTierOnline('t3');

    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('t2 down'))
      .mockRejectedValueOnce(new Error('t3 down'));

    const plan = makeRoutePlan({ targetTier: 't2', tierConfig: makeTierConfig({ id: 't2' }) });

    const result = await executeWithFallback('prompt', plan, registry);

    expect(result.text).toBeNull();
    expect(result.fallback).toBe(true);
  });

  it('throws when both attempts fail for manual.prompt request', async () => {
    setTierOnline('t2');
    setTierOnline('t3');

    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('t2 down'))
      .mockRejectedValueOnce(new Error('t3 down'));

    const plan = makeRoutePlan({ targetTier: 't2', tierConfig: makeTierConfig({ id: 't2' }) });
    const request = makeManualRequest();

    await expect(
      executeWithFallback('prompt', plan, registry, undefined, request),
    ).rejects.toThrow();
  });

  it('returns text=null (no throw) when only primary is available and it fails for thought', async () => {
    // Only t2 online, no fallback available
    setTierOnline('t2');

    vi.mocked(fetch).mockRejectedValueOnce(new Error('t2 down'));

    const plan = makeRoutePlan({ targetTier: 't2', tierConfig: makeTierConfig({ id: 't2' }) });

    const result = await executeWithFallback('prompt', plan, registry);

    expect(result.text).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkQualitySignals
// ---------------------------------------------------------------------------

describe('checkQualitySignals', () => {
  const baseObservationRequest = makeThoughtRequest(); // type: 'observation'

  const reactionRequest: Extract<BrainRequestV1, { kind: 'thought.generate' }> = {
    ...makeThoughtRequest(),
    input: { ...makeThoughtRequest().input, type: 'reaction' },
  };

  const haikuRequest: Extract<BrainRequestV1, { kind: 'thought.generate' }> = {
    ...makeThoughtRequest(),
    input: { ...makeThoughtRequest().input, type: 'haiku' },
  };

  it('returns false for null text (already SILENCE)', () => {
    expect(checkQualitySignals(null, baseObservationRequest)).toBe(false);
  });

  it('returns false for normal-length observation', () => {
    const text = 'The dust motes drift in a beam of late afternoon light — small planets in transit.';
    expect(checkQualitySignals(text, baseObservationRequest)).toBe(false);
  });

  it('returns true for short observation (word count under 50% of 30-word max)', () => {
    // 50% of 30 = 15 words. Under 15 words triggers the signal.
    const text = 'The light shifts.'; // 3 words — well under threshold
    expect(checkQualitySignals(text, baseObservationRequest)).toBe(true);
  });

  it('returns false for observation right at the word count threshold', () => {
    // 50% of 30 = 15. Exactly 15 words should not trigger.
    const text = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen';
    expect(checkQualitySignals(text, baseObservationRequest)).toBe(false);
  });

  it('returns true for short reaction (under 50% of 20-word max)', () => {
    // 50% of 20 = 10 words. Under 10 words triggers.
    const text = 'A flicker.'; // 2 words
    expect(checkQualitySignals(text, reactionRequest)).toBe(true);
  });

  it('returns true when response contains "I think maybe"', () => {
    const text = 'I think maybe the room feels different today. Something about the light.';
    expect(checkQualitySignals(text, baseObservationRequest)).toBe(true);
  });

  it('returns true when response contains "I\'m not sure"', () => {
    const text = "I'm not sure what to make of this moment.";
    expect(checkQualitySignals(text, baseObservationRequest)).toBe(true);
  });

  it('returns true when response contains "something like"', () => {
    const text = 'It feels something like nostalgia, but quieter.';
    expect(checkQualitySignals(text, baseObservationRequest)).toBe(true);
  });

  it('returns true for haiku without a newline', () => {
    const text = 'morning rain falls soft the window holds its breath cold';
    expect(checkQualitySignals(text, haikuRequest)).toBe(true);
  });

  it('returns false for haiku with proper newlines', () => {
    const text = 'morning rain falls soft\nthe window holds its breath\ncold glass, warm inside';
    expect(checkQualitySignals(text, haikuRequest)).toBe(false);
  });

  it('returns false for manual.prompt request regardless of content', () => {
    const text = 'A flicker.'; // short, would trigger for observations
    const req = makeManualRequest();
    expect(checkQualitySignals(text, req)).toBe(false);
  });
});
