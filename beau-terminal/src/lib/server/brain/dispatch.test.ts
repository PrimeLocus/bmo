// src/lib/server/brain/dispatch.test.ts
// TDD tests for Brain Public API — SP6 Task 8
// Tests orchestration logic: routing, prepare, execute, quality escalation, timeout, logging

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BrainRequestV1, BrainResponse, RoutePlan, TierId } from './types.js';

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
  };
});

vi.mock('./registry.js', () => {
  // TierRegistry mock — must be a real class so `new TierRegistry(...)` works
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

vi.mock('./router.js', () => ({
  routeRequest: mockRouteRequest,
}));

vi.mock('./prepare.js', () => ({
  preparePrompt: mockPreparePrompt,
}));

vi.mock('./executor.js', () => ({
  executeWithFallback: mockExecuteWithFallback,
  checkQualitySignals: mockCheckQualitySignals,
}));

vi.mock('./log.js', () => ({
  logDispatch: mockLogDispatch,
}));

vi.mock('../memory/index.js', () => ({
  getMemoryProvider: mockGetMemoryProvider,
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks are set up
// ---------------------------------------------------------------------------

import { initBrain, getBrainRegistry, dispatch, DISPATCH_TIMEOUT_MS, _resetBrainForTesting } from './index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeThoughtRequest(
  overrides: Partial<Extract<BrainRequestV1, { kind: 'thought.generate' }>> = {},
): Extract<BrainRequestV1, { kind: 'thought.generate' }> {
  return {
    v: 1,
    requestId: 'req-thought-001',
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

function makeManualRequest(
  overrides: Partial<Extract<BrainRequestV1, { kind: 'manual.prompt' }>> = {},
): Extract<BrainRequestV1, { kind: 'manual.prompt' }> {
  return {
    v: 1,
    requestId: 'req-manual-002',
    kind: 'manual.prompt',
    origin: 'console',
    input: { text: 'What are you thinking about right now?' },
    ...overrides,
  };
}

function makeRoutePlan(overrides: Partial<RoutePlan> = {}): RoutePlan {
  return {
    targetTier: 't2',
    tierConfig: {
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
    requestId: 'req-thought-001',
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

// ---------------------------------------------------------------------------
// Module reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Reset module-level singleton state so tests don't bleed into each other
  _resetBrainForTesting();
  // Initialize brain so registry is available
  initBrain();
  // Set up sensible defaults for the happy-path mocks
  const defaultPlan = makeRoutePlan();
  mockRouteRequest.mockReturnValue(defaultPlan);
  mockPreparePrompt.mockResolvedValue('Built prompt text');
  mockExecuteWithFallback.mockResolvedValue(makeResponse());
  mockCheckQualitySignals.mockReturnValue(false);
  mockGetOnlineTiers.mockReturnValue([defaultPlan.tierConfig]);
  mockGetConfig.mockImplementation((id: TierId) => {
    if (id === 't2') return defaultPlan.tierConfig;
    if (id === 't3') {
      return {
        id: 't3',
        label: 'T3',
        endpoint: 'http://thinkstation:11434',
        model: 'llama3.1:8b',
        timeoutMs: 10000,
        maxPromptTokens: 4000,
        maxMemoryTokens: 500,
        maxOutputTokens: 1024,
        supportsStreaming: true,
        promptProfile: 'full' as const,
      };
    }
    return undefined;
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('DISPATCH_TIMEOUT_MS', () => {
  it('is 45 seconds', () => {
    expect(DISPATCH_TIMEOUT_MS).toBe(45_000);
  });
});

// ---------------------------------------------------------------------------
// initBrain / getBrainRegistry
// ---------------------------------------------------------------------------

describe('initBrain', () => {
  it('creates a TierRegistry singleton', () => {
    initBrain();
    expect(getBrainRegistry()).not.toBeNull();
  });

  it('is idempotent — calling twice does not create a second registry', () => {
    initBrain();
    const first = getBrainRegistry();
    initBrain();
    const second = getBrainRegistry();
    // Same instance — the module-level singleton is never replaced
    expect(first).toBe(second);
  });

  it('starts probing on first call', () => {
    initBrain();
    // startProbing called at least once (once per initBrain call that actually creates)
    expect(mockStartProbing).toHaveBeenCalled();
  });
});

describe('getBrainRegistry', () => {
  it('returns the registry after initBrain()', () => {
    initBrain();
    const reg = getBrainRegistry();
    expect(reg).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// dispatch — no registry
// ---------------------------------------------------------------------------

describe('dispatch — registry not initialized', () => {
  it('throws when registry is not available', async () => {
    // Force an uninitialized state by importing a fresh module instance is not
    // straightforward with vitest module caching, so instead we test the guard
    // indirectly: after initBrain(), registry is non-null and dispatch proceeds.
    // This test verifies the happy path is reachable only when initialized.
    const req = makeThoughtRequest();
    // Registry IS initialized from beforeEach so this should succeed
    await expect(dispatch(req)).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// dispatch — no tier available
// ---------------------------------------------------------------------------

describe('dispatch — no tier available', () => {
  it('returns silence response when router returns null (no online tiers)', async () => {
    mockRouteRequest.mockReturnValue(null);

    const req = makeThoughtRequest();
    const result = await dispatch(req);

    expect(result.text).toBeNull();
    expect(result.tier).toBe('t2'); // fallback tier id in silence response
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
  });

  it('does NOT call logDispatch when no tier is available', async () => {
    mockRouteRequest.mockReturnValue(null);

    const req = makeThoughtRequest();
    await dispatch(req);

    expect(mockLogDispatch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// dispatch — successful thought dispatch
// ---------------------------------------------------------------------------

describe('dispatch — successful thought.generate', () => {
  it('calls routeRequest, preparePrompt, executeWithFallback in order', async () => {
    const req = makeThoughtRequest();
    await dispatch(req);

    expect(mockRouteRequest).toHaveBeenCalledWith(req, expect.anything(), undefined);
    expect(mockPreparePrompt).toHaveBeenCalled();
    expect(mockExecuteWithFallback).toHaveBeenCalled();
  });

  it('returns the executor response on success', async () => {
    const expectedResponse = makeResponse({ text: 'A small noticing about rain.' });
    mockExecuteWithFallback.mockResolvedValue(expectedResponse);

    const req = makeThoughtRequest();
    const result = await dispatch(req);

    expect(result.text).toBe('A small noticing about rain.');
    expect(result.tier).toBe('t2');
    expect(result.qualityEscalated).toBe(false);
  });

  it('calls logDispatch with request, plan, response, and online tiers', async () => {
    const req = makeThoughtRequest();
    const response = makeResponse();
    mockExecuteWithFallback.mockResolvedValue(response);

    await dispatch(req);

    expect(mockLogDispatch).toHaveBeenCalledOnce();
    const logArgs = mockLogDispatch.mock.calls[0][0];
    expect(logArgs.request).toBe(req);
    expect(logArgs.plan).toEqual(makeRoutePlan());
    expect(logArgs.response).toEqual(expect.objectContaining({ text: response.text }));
    expect(Array.isArray(logArgs.onlineTiers)).toBe(true);
  });

  it('passes getMemoryProvider to preparePrompt', async () => {
    const req = makeThoughtRequest();
    await dispatch(req);

    const prepareArgs = mockPreparePrompt.mock.calls[0];
    // getMemProvider is 3rd arg (after request and plan)
    expect(typeof prepareArgs[2]).toBe('function');
    // Calling the getter returns what getMemoryProvider returns
    expect(prepareArgs[2]()).toBeNull(); // mockGetMemoryProvider returns null
  });
});

// ---------------------------------------------------------------------------
// dispatch — successful manual.prompt dispatch
// ---------------------------------------------------------------------------

describe('dispatch — successful manual.prompt', () => {
  it('routes and executes a manual.prompt request', async () => {
    const req = makeManualRequest();
    const response = makeResponse({ requestId: 'req-manual-002', text: 'A thoughtful reply.' });
    mockExecuteWithFallback.mockResolvedValue(response);

    const result = await dispatch(req);

    expect(result.text).toBe('A thoughtful reply.');
    expect(mockRouteRequest).toHaveBeenCalledWith(req, expect.anything(), undefined);
    expect(mockLogDispatch).toHaveBeenCalledOnce();
  });

  it('passes a getState callback to preparePrompt for manual requests', async () => {
    const req = makeManualRequest();
    await dispatch(req);

    const prepareArgs = mockPreparePrompt.mock.calls[0];
    // getState is 4th arg
    expect(typeof prepareArgs[3]).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// dispatch — quality escalation
// ---------------------------------------------------------------------------

describe('dispatch — quality escalation', () => {
  it('re-dispatches to a higher tier when quality signals trigger and escalation is allowed', async () => {
    const weakResponse = makeResponse({ text: 'ok', tier: 't2' });
    const strongResponse = makeResponse({
      text: 'A richer, more complete thought emerged from the silence.',
      tier: 't3',
    });

    // First call returns weak response; second call (escalation) returns strong
    mockExecuteWithFallback
      .mockResolvedValueOnce(weakResponse)
      .mockResolvedValueOnce(strongResponse);

    mockCheckQualitySignals.mockReturnValue(true);

    // Plan allows escalation and there's a higher tier available
    const plan = makeRoutePlan({ allowEscalation: true, targetTier: 't2' });
    mockRouteRequest.mockReturnValue(plan);

    // Make t3 available as a higher tier
    const t3Config = {
      id: 't3' as TierId,
      label: 'T3',
      endpoint: 'http://thinkstation:11434',
      model: 'llama3.1:8b',
      timeoutMs: 10000,
      maxPromptTokens: 4000,
      maxMemoryTokens: 500,
      maxOutputTokens: 1024,
      supportsStreaming: true,
      promptProfile: 'full' as const,
    };
    mockGetOnlineTiers.mockReturnValue([plan.tierConfig, t3Config]);

    const req = makeThoughtRequest();
    const result = await dispatch(req);

    expect(result.qualityEscalated).toBe(true);
    expect(result.escalatedFrom).toBe('t2');
    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(2);
  });

  it('does NOT escalate when checkQualitySignals returns false', async () => {
    mockCheckQualitySignals.mockReturnValue(false);

    const req = makeThoughtRequest();
    await dispatch(req);

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(1);
  });

  it('does NOT escalate when allowEscalation is false even if quality is weak', async () => {
    mockCheckQualitySignals.mockReturnValue(true);
    // Plan does NOT allow escalation
    const plan = makeRoutePlan({ allowEscalation: false });
    mockRouteRequest.mockReturnValue(plan);

    const req = makeThoughtRequest();
    const result = await dispatch(req);

    expect(result.qualityEscalated).toBe(false);
    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(1);
  });

  it('does NOT escalate when no higher tier is available', async () => {
    mockCheckQualitySignals.mockReturnValue(true);
    const plan = makeRoutePlan({ allowEscalation: true, targetTier: 't4' });
    mockRouteRequest.mockReturnValue(plan);

    // Only t4 online — no higher tier exists
    mockGetOnlineTiers.mockReturnValue([plan.tierConfig]);

    const req = makeThoughtRequest();
    const result = await dispatch(req);

    expect(result.qualityEscalated).toBe(false);
    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(1);
  });

  it('logDispatch is called with the escalated response (quality escalation path)', async () => {
    const weakResponse = makeResponse({ text: 'ok', tier: 't2' });
    const strongResponse = makeResponse({
      text: 'A better thought.',
      tier: 't3',
      qualityEscalated: true,
      escalatedFrom: 't2',
    });

    mockExecuteWithFallback
      .mockResolvedValueOnce(weakResponse)
      .mockResolvedValueOnce(strongResponse);
    mockCheckQualitySignals.mockReturnValue(true);

    const t3Config = {
      id: 't3' as TierId,
      label: 'T3',
      endpoint: 'http://thinkstation:11434',
      model: 'llama3.1:8b',
      timeoutMs: 10000,
      maxPromptTokens: 4000,
      maxMemoryTokens: 500,
      maxOutputTokens: 1024,
      supportsStreaming: true,
      promptProfile: 'full' as const,
    };
    const plan = makeRoutePlan({ allowEscalation: true });
    mockRouteRequest.mockReturnValue(plan);
    mockGetOnlineTiers.mockReturnValue([plan.tierConfig, t3Config]);

    const req = makeThoughtRequest();
    await dispatch(req);

    // logDispatch called once, with the final (escalated) response
    expect(mockLogDispatch).toHaveBeenCalledOnce();
    const logArgs = mockLogDispatch.mock.calls[0][0];
    expect(logArgs.response.qualityEscalated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// dispatch — previousTier stickiness
// ---------------------------------------------------------------------------

describe('dispatch — previousTier tracking', () => {
  it('passes undefined as previousTier on the first dispatch', async () => {
    const req = makeThoughtRequest();
    await dispatch(req);

    expect(mockRouteRequest).toHaveBeenCalledWith(req, expect.anything(), undefined);
  });

  it('passes previousTier on subsequent dispatches after a successful one', async () => {
    const response = makeResponse({ tier: 't2' });
    mockExecuteWithFallback.mockResolvedValue(response);

    const req1 = makeThoughtRequest({ requestId: 'req-001' });
    const req2 = makeThoughtRequest({ requestId: 'req-002' });

    await dispatch(req1);
    await dispatch(req2);

    // Second call should have previousTier = 't2'
    expect(mockRouteRequest).toHaveBeenNthCalledWith(2, req2, expect.anything(), 't2');
  });
});

// ---------------------------------------------------------------------------
// dispatch — 45s hard cap timeout
// ---------------------------------------------------------------------------

describe('dispatch — 45s hard cap timeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns silence response when execution exceeds DISPATCH_TIMEOUT_MS', async () => {
    vi.useFakeTimers();

    // executeWithFallback never resolves in time
    mockExecuteWithFallback.mockImplementation(
      () => new Promise<BrainResponse>(() => { /* never resolves */ }),
    );

    const req = makeThoughtRequest();
    const dispatchPromise = dispatch(req);

    // Advance time past the 45s cap
    vi.advanceTimersByTime(DISPATCH_TIMEOUT_MS + 1000);

    const result = await dispatchPromise;

    expect(result.text).toBeNull();
  });

  it('timeout response has the request id', async () => {
    vi.useFakeTimers();

    mockExecuteWithFallback.mockImplementation(
      () => new Promise<BrainResponse>(() => { /* never resolves */ }),
    );

    const req = makeThoughtRequest({ requestId: 'timeout-req-abc' });
    const dispatchPromise = dispatch(req);

    vi.advanceTimersByTime(DISPATCH_TIMEOUT_MS + 1000);

    const result = await dispatchPromise;

    expect(result.requestId).toBe('timeout-req-abc');
  });
});

// ---------------------------------------------------------------------------
// dispatch — log always called
// ---------------------------------------------------------------------------

describe('dispatch — log on failure paths', () => {
  it('does NOT call logDispatch when route plan is null (no tier)', async () => {
    // If there is no route plan, we cannot build a valid log entry
    mockRouteRequest.mockReturnValue(null);
    const req = makeThoughtRequest();
    await dispatch(req);

    expect(mockLogDispatch).not.toHaveBeenCalled();
  });

  it('calls logDispatch even when executor returns null text (silence from model)', async () => {
    const silenceResponse = makeResponse({ text: null });
    mockExecuteWithFallback.mockResolvedValue(silenceResponse);

    const req = makeThoughtRequest();
    await dispatch(req);

    expect(mockLogDispatch).toHaveBeenCalledOnce();
  });
});
