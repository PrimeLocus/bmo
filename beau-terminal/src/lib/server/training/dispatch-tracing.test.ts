// src/lib/server/training/dispatch-tracing.test.ts
// Training Readiness — SP7 Task 8: Tests for async trace capture wired into brain dispatch.
// Verifies that dispatch() enqueues TracePayloads via the onAttempt callback path.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrainRequestV1, BrainResponse, RoutePlan, TierId, TierConfig } from '../brain/types.js';
import type { PrepareResult } from './types.js';

// ---------------------------------------------------------------------------
// Hoist mocks so vi.mock factories can reference them
// ---------------------------------------------------------------------------

const {
  mockRouteRequest,
  mockPreparePrompt,
  mockExecuteWithFallback,
  mockCheckQualitySignals,
  mockLogDispatch,
  mockGetMemoryProvider,
  mockGetOnlineTiers,
  mockGetConfig,
  mockStartProbing,
  mockGetTraceOutbox,
  trackedPayloads,
} = vi.hoisted(() => {
  const mockRouteRequest = vi.fn();
  const mockPreparePrompt = vi.fn();
  const mockExecuteWithFallback = vi.fn();
  const mockCheckQualitySignals = vi.fn();
  const mockLogDispatch = vi.fn();
  const mockGetMemoryProvider = vi.fn(() => null);
  const mockGetOnlineTiers = vi.fn(() => []);
  const mockGetConfig = vi.fn();
  const mockStartProbing = vi.fn();
  const mockGetTraceOutbox = vi.fn();
  const trackedPayloads: any[] = [];

  return {
    mockRouteRequest,
    mockPreparePrompt,
    mockExecuteWithFallback,
    mockCheckQualitySignals,
    mockLogDispatch,
    mockGetMemoryProvider,
    mockGetOnlineTiers,
    mockGetConfig,
    mockStartProbing,
    mockGetTraceOutbox,
    trackedPayloads,
  };
});

vi.mock('../brain/registry.js', () => {
  class TierRegistryMock {
    getOnlineTiers = mockGetOnlineTiers;
    getConfig = mockGetConfig;
    startProbing = mockStartProbing;
    stopProbing = vi.fn();
    getAllStates = vi.fn(() => []);
  }
  return {
    TierRegistry: TierRegistryMock,
    DEFAULT_TIER_CONFIGS: [],
  };
});

vi.mock('../brain/router.js', () => ({
  routeRequest: mockRouteRequest,
}));

vi.mock('../brain/prepare.js', () => ({
  preparePrompt: mockPreparePrompt,
}));

vi.mock('../brain/executor.js', () => ({
  executeWithFallback: mockExecuteWithFallback,
  checkQualitySignals: mockCheckQualitySignals,
}));

vi.mock('../brain/log.js', () => ({
  logDispatch: mockLogDispatch,
}));

vi.mock('../memory/index.js', () => ({
  getMemoryProvider: mockGetMemoryProvider,
}));

vi.mock('./index.js', () => ({
  getTraceOutbox: mockGetTraceOutbox,
  initTraining: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------

import { initBrain, dispatch, _resetBrainForTesting } from '../brain/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePrepareResult(overrides: Partial<PrepareResult> = {}): PrepareResult {
  return {
    prompt: 'You are Beau, a small teal robot...',
    provenance: {
      templateHash: 'tmpl-abc',
      promptPolicyVersion: '1.0.0',
      retrievalPolicyVersion: '1.0.0',
      assemblerVersion: '1.0.0',
      promptProfile: 'full',
      promptHash: 'hash-xyz',
    },
    retrievals: [],
    ...overrides,
  };
}

function makeThoughtRequest(
  overrides: Partial<Extract<BrainRequestV1, { kind: 'thought.generate' }>> = {},
): Extract<BrainRequestV1, { kind: 'thought.generate' }> {
  return {
    v: 1,
    requestId: 'req-trace-001',
    kind: 'thought.generate',
    origin: 'thoughts',
    input: {
      type: 'observation',
      trigger: 'The light shifts in a way that feels like memory.',
      novelty: false,
      context: {
        vector: { wonder: 0.6, reflection: 0.7, mischief: 0.2 },
        mode: 'ambient',
        timeOfDay: 'evening',
        environment: 'quiet room',
        momentum: 'gentle curiosity',
      },
      constraints: { maxLength: 30, tone: 'reflective' },
    },
    ...overrides,
  };
}

function makeTierConfig(overrides: Partial<TierConfig> = {}): TierConfig {
  return {
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
    ...overrides,
  };
}

function makeRoutePlan(overrides: Partial<RoutePlan> = {}): RoutePlan {
  return {
    targetTier: 't2',
    tierConfig: makeTierConfig(),
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
    ...overrides,
  };
}

function makeResponse(overrides: Partial<BrainResponse> = {}): BrainResponse {
  return {
    requestId: 'req-trace-001',
    text: 'The moss holds last night\'s rain like a quiet secret.',
    tier: 't2',
    model: 'gemma3:4b',
    generationMs: 842,
    clamped: false,
    trimmed: false,
    fallback: false,
    qualityEscalated: false,
    ...overrides,
  };
}

/**
 * Creates a mock implementation for executeWithFallback that calls the
 * onAttempt callback (6th arg options.onAttempt) with realistic attempt data.
 * This simulates what the real executor does without needing real HTTP calls.
 */
function makeExecutorMock(
  responseText: string | null,
  responseModel: string = 'gemma3:4b',
  responseTier: TierId = 't2',
  generationMs: number = 842,
) {
  return (
    prompt: string,
    plan: RoutePlan,
    _registry: unknown,
    _preparePrompt: unknown,
    request: BrainRequestV1,
    options?: { primaryPrepareResult?: PrepareResult; onAttempt?: (data: any) => void },
  ): BrainResponse => {
    // Call onAttempt if provided — simulating what the real executor does
    if (options?.onAttempt && options?.primaryPrepareResult) {
      options.onAttempt({
        prepareResult: options.primaryPrepareResult,
        responseText,
        responseStatus: responseText !== null ? 'completed' : 'silence',
        model: responseModel,
        latencyMs: generationMs,
        tier: responseTier,
        attemptNumber: 1,
        fallbackFrom: null,
        qualityEscalatedFrom: null,
      });
    }

    return makeResponse({
      requestId: request.requestId,
      text: responseText,
      tier: responseTier,
      model: responseModel,
      generationMs,
    });
  };
}

/**
 * Creates a mock executor that simulates a fallback scenario:
 * primary fails (calls onAttempt with error), fallback succeeds (calls onAttempt with success).
 */
function makeExecutorWithFallbackMock(
  fallbackText: string,
  fallbackModel: string = 'llama3.1:8b',
  fallbackTier: TierId = 't3',
) {
  return (
    prompt: string,
    plan: RoutePlan,
    _registry: unknown,
    _preparePrompt: unknown,
    request: BrainRequestV1,
    options?: { primaryPrepareResult?: PrepareResult; onAttempt?: (data: any) => void },
  ): BrainResponse => {
    if (options?.onAttempt && options?.primaryPrepareResult) {
      // Emit failed primary attempt
      options.onAttempt({
        prepareResult: options.primaryPrepareResult,
        responseText: null,
        responseStatus: 'error',
        model: plan.tierConfig.model,
        latencyMs: 100,
        tier: plan.targetTier,
        attemptNumber: 1,
        fallbackFrom: null,
        qualityEscalatedFrom: null,
      });

      // Emit successful fallback attempt
      options.onAttempt({
        prepareResult: options.primaryPrepareResult,
        responseText: fallbackText,
        responseStatus: 'completed',
        model: fallbackModel,
        latencyMs: 1200,
        tier: fallbackTier,
        attemptNumber: 2,
        fallbackFrom: plan.targetTier,
        qualityEscalatedFrom: null,
      });
    }

    return makeResponse({
      requestId: request.requestId,
      text: fallbackText,
      tier: fallbackTier,
      model: fallbackModel,
      generationMs: 1200,
      fallback: true,
      fallbackFrom: plan.targetTier,
    });
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  trackedPayloads.length = 0;

  _resetBrainForTesting();
  initBrain();

  const defaultPlan = makeRoutePlan();
  const defaultPrepare = makePrepareResult();

  mockRouteRequest.mockReturnValue(defaultPlan);
  mockPreparePrompt.mockResolvedValue(defaultPrepare);
  mockGetOnlineTiers.mockReturnValue([defaultPlan.tierConfig] as any);
  mockCheckQualitySignals.mockReturnValue(false);

  // Default: executeWithFallback succeeds and calls onAttempt
  mockExecuteWithFallback.mockImplementation(
    makeExecutorMock('The moss holds last night\'s rain like a quiet secret.'),
  );

  // Wire up a mock outbox that tracks enqueued payloads
  const mockOutbox = {
    enqueue: vi.fn((payload: any) => {
      trackedPayloads.push(payload);
    }),
    get pending() { return trackedPayloads.length; },
    running: true,
  };
  mockGetTraceOutbox.mockReturnValue(mockOutbox);
});

// ---------------------------------------------------------------------------
// Tests: successful dispatch
// ---------------------------------------------------------------------------

describe('dispatch trace capture — successful dispatch', () => {
  it('enqueues one trace payload on successful primary dispatch', async () => {
    const req = makeThoughtRequest();
    await dispatch(req);

    expect(trackedPayloads.length).toBe(1);
  });

  it('trace payload has correct requestId', async () => {
    const req = makeThoughtRequest({ requestId: 'req-check-id' });
    await dispatch(req);

    expect(trackedPayloads[0].requestId).toBe('req-check-id');
  });

  it('trace payload has correct tier', async () => {
    const req = makeThoughtRequest();
    await dispatch(req);

    expect(trackedPayloads[0].tier).toBe('t2');
  });

  it('trace payload has responseStatus "completed" for successful generation', async () => {
    const req = makeThoughtRequest();
    await dispatch(req);

    expect(trackedPayloads[0].responseStatus).toBe('completed');
  });

  it('trace payload has responseStatus "silence" when model returns null text', async () => {
    mockExecuteWithFallback.mockImplementation(
      makeExecutorMock(null),
    );

    const req = makeThoughtRequest();
    await dispatch(req);

    expect(trackedPayloads[0].responseStatus).toBe('silence');
  });

  it('trace payload has consentScope "beau_output" for thought.generate', async () => {
    const req = makeThoughtRequest();
    await dispatch(req);

    expect(trackedPayloads[0].consentScope).toBe('beau_output');
  });

  it('trace payload has a non-empty traceId', async () => {
    const req = makeThoughtRequest();
    await dispatch(req);

    expect(trackedPayloads[0].traceId).toBeDefined();
    expect(typeof trackedPayloads[0].traceId).toBe('string');
    expect(trackedPayloads[0].traceId.length).toBeGreaterThan(0);
  });

  it('trace payload has parentTraceId null on primary (non-escalated) dispatch', async () => {
    const req = makeThoughtRequest();
    await dispatch(req);

    expect(trackedPayloads[0].parentTraceId).toBeNull();
  });

  it('trace payload has promptText from prepareResult', async () => {
    const req = makeThoughtRequest();
    await dispatch(req);

    expect(trackedPayloads[0].promptText).toBe('You are Beau, a small teal robot...');
  });

  it('trace payload has provenance from prepareResult', async () => {
    const req = makeThoughtRequest();
    await dispatch(req);

    expect(trackedPayloads[0].promptProvenance.templateHash).toBe('tmpl-abc');
    expect(trackedPayloads[0].promptProvenance.assemblerVersion).toBe('1.0.0');
  });

  it('trace payload has requestKind and origin from request', async () => {
    const req = makeThoughtRequest();
    await dispatch(req);

    expect(trackedPayloads[0].requestKind).toBe('thought.generate');
    expect(trackedPayloads[0].origin).toBe('thoughts');
  });

  it('trace payload has modelName and modelFamily', async () => {
    const req = makeThoughtRequest();
    await dispatch(req);

    expect(trackedPayloads[0].modelName).toBe('gemma3:4b');
    expect(trackedPayloads[0].modelFamily).toBe('gemma3');
  });
});

// ---------------------------------------------------------------------------
// Tests: no outbox
// ---------------------------------------------------------------------------

describe('dispatch trace capture — no outbox', () => {
  it('does not throw when getTraceOutbox returns null', async () => {
    mockGetTraceOutbox.mockReturnValue(null);

    const req = makeThoughtRequest();
    const response = await dispatch(req);

    expect(response.text).toBeTruthy();
    expect(trackedPayloads.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: no route plan
// ---------------------------------------------------------------------------

describe('dispatch trace capture — no route plan', () => {
  it('does not enqueue trace when router returns null', async () => {
    mockRouteRequest.mockReturnValue(null);

    const req = makeThoughtRequest();
    await dispatch(req);

    expect(trackedPayloads.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: fallback
// ---------------------------------------------------------------------------

describe('dispatch trace capture — fallback', () => {
  it('enqueues two traces when primary fails and fallback succeeds', async () => {
    mockExecuteWithFallback.mockImplementation(
      makeExecutorWithFallbackMock('A fallback thought emerges.'),
    );

    const req = makeThoughtRequest();
    await dispatch(req);

    expect(trackedPayloads.length).toBe(2);
  });

  it('failed primary attempt has responseStatus "error"', async () => {
    mockExecuteWithFallback.mockImplementation(
      makeExecutorWithFallbackMock('Fallback success.'),
    );

    const req = makeThoughtRequest();
    await dispatch(req);

    expect(trackedPayloads[0].responseStatus).toBe('error');
    expect(trackedPayloads[0].responseText).toBeNull();
  });

  it('successful fallback attempt has fallbackFrom set', async () => {
    mockExecuteWithFallback.mockImplementation(
      makeExecutorWithFallbackMock('Fallback thought.'),
    );

    const req = makeThoughtRequest();
    await dispatch(req);

    expect(trackedPayloads[1].fallbackFrom).toBe('t2');
    expect(trackedPayloads[1].responseStatus).toBe('completed');
  });

  it('attempt numbers are sequential (1 for primary, 2 for fallback)', async () => {
    mockExecuteWithFallback.mockImplementation(
      makeExecutorWithFallbackMock('Fallback ok.'),
    );

    const req = makeThoughtRequest();
    await dispatch(req);

    expect(trackedPayloads[0].attemptNumber).toBe(1);
    expect(trackedPayloads[1].attemptNumber).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Tests: quality escalation
// ---------------------------------------------------------------------------

describe('dispatch trace capture — quality escalation', () => {
  function setupEscalation() {
    const t3Config = makeTierConfig({
      id: 't3',
      label: 'T3',
      endpoint: 'http://thinkstation:11434',
      model: 'llama3.1:8b',
    });

    const plan = makeRoutePlan({ allowEscalation: true, targetTier: 't2' });
    const escalationPlan = makeRoutePlan({
      targetTier: 't3',
      tierConfig: t3Config,
      allowEscalation: false,
    });

    mockGetOnlineTiers.mockReturnValue([plan.tierConfig, t3Config] as any);
    mockCheckQualitySignals.mockReturnValue(true);

    // First call: returns primary plan. Second call: returns escalation plan.
    mockRouteRequest
      .mockReturnValueOnce(plan)
      .mockReturnValueOnce(escalationPlan);

    // First call: primary prepare. Second call: escalation prepare.
    const primaryPrepare = makePrepareResult({ prompt: 'Primary prompt' });
    const escalationPrepare = makePrepareResult({ prompt: 'Escalated prompt for T3' });
    mockPreparePrompt
      .mockResolvedValueOnce(primaryPrepare)
      .mockResolvedValueOnce(escalationPrepare);

    // First executeWithFallback: weak primary (calls onAttempt for primary)
    // Second executeWithFallback: strong escalation (calls onAttempt for escalation)
    const weakResponse = makeResponse({ text: 'ok', tier: 't2' });
    const strongResponse = makeResponse({
      text: 'A richer, more complete thought emerged from the silence.',
      tier: 't3',
      model: 'llama3.1:8b',
    });

    mockExecuteWithFallback
      .mockImplementationOnce((
        _prompt: string, _plan: RoutePlan, _reg: unknown, _prep: unknown,
        request: BrainRequestV1,
        options?: { primaryPrepareResult?: PrepareResult; onAttempt?: (data: any) => void },
      ) => {
        // Call onAttempt for primary attempt
        if (options?.onAttempt && options?.primaryPrepareResult) {
          options.onAttempt({
            prepareResult: options.primaryPrepareResult,
            responseText: 'ok',
            responseStatus: 'completed',
            model: 'gemma3:4b',
            latencyMs: 200,
            tier: 't2',
            attemptNumber: 1,
            fallbackFrom: null,
            qualityEscalatedFrom: null,
          });
        }
        return weakResponse;
      })
      .mockImplementationOnce((
        _prompt: string, _plan: RoutePlan, _reg: unknown, _prep: unknown,
        request: BrainRequestV1,
        options?: { primaryPrepareResult?: PrepareResult; onAttempt?: (data: any) => void },
      ) => {
        // Call onAttempt for escalation attempt
        if (options?.onAttempt && options?.primaryPrepareResult) {
          options.onAttempt({
            prepareResult: options.primaryPrepareResult,
            responseText: 'A richer, more complete thought emerged from the silence.',
            responseStatus: 'completed',
            model: 'llama3.1:8b',
            latencyMs: 1500,
            tier: 't3',
            attemptNumber: 1,
            fallbackFrom: null,
            qualityEscalatedFrom: null,
          });
        }
        return strongResponse;
      });

    return { plan, escalationPlan, t3Config };
  }

  it('enqueues traces for both original and escalated attempts', async () => {
    setupEscalation();

    const req = makeThoughtRequest();
    await dispatch(req);

    expect(trackedPayloads.length).toBe(2);
  });

  it('escalated attempt has parentTraceId linking to original trace', async () => {
    setupEscalation();

    const req = makeThoughtRequest();
    await dispatch(req);

    // First trace has no parent
    expect(trackedPayloads[0].parentTraceId).toBeNull();

    // Escalated trace has parentTraceId pointing to first trace
    expect(trackedPayloads[1].parentTraceId).toBe(trackedPayloads[0].traceId);
  });

  it('escalated attempt has qualityEscalatedFrom set to original tier', async () => {
    setupEscalation();

    const req = makeThoughtRequest();
    await dispatch(req);

    // Original has no escalation source
    expect(trackedPayloads[0].qualityEscalatedFrom).toBeNull();

    // Escalated trace has qualityEscalatedFrom pointing to original tier
    expect(trackedPayloads[1].qualityEscalatedFrom).toBe('t2');
  });
});

// ---------------------------------------------------------------------------
// Tests: provider and consent
// ---------------------------------------------------------------------------

describe('dispatch trace capture — provider field', () => {
  it('trace payload has provider "ollama"', async () => {
    const req = makeThoughtRequest();
    await dispatch(req);

    expect(trackedPayloads[0].provider).toBe('ollama');
  });
});

describe('dispatch trace capture — retrieval provenance', () => {
  it('trace payload includes retrievals from prepareResult', async () => {
    const retrievals = [
      {
        fragmentId: 'frag-1',
        collection: 'beau_identity',
        sourceType: 'bible',
        sourceEntityId: 'bible-1',
        rank: 0,
        baseScore: 0.95,
        finalScore: 0.92,
        selected: true,
        tokenCount: 80,
        excerptHash: 'hash-frag-1',
      },
    ];

    const prepareResult = makePrepareResult({ retrievals });
    mockPreparePrompt.mockResolvedValue(prepareResult);

    const req = makeThoughtRequest();
    await dispatch(req);

    expect(trackedPayloads[0].retrievals).toHaveLength(1);
    expect(trackedPayloads[0].retrievals[0].collection).toBe('beau_identity');
    expect(trackedPayloads[0].retrievals[0].fragmentId).toBe('frag-1');
  });
});
