// src/lib/server/brain/registry.test.ts
// TDD tests for TierRegistry — SP6 Task 2

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TierRegistry, DEFAULT_TIER_CONFIGS } from './registry.js';
import type { TierId } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTagsResponse(models: string[]): Response {
  return new Response(
    JSON.stringify({ models: models.map((name) => ({ name, model: name })) }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

// ---------------------------------------------------------------------------
// DEFAULT_TIER_CONFIGS
// ---------------------------------------------------------------------------

describe('DEFAULT_TIER_CONFIGS', () => {
  it('defines all 4 tiers', () => {
    expect(DEFAULT_TIER_CONFIGS).toHaveLength(4);
    const ids = DEFAULT_TIER_CONFIGS.map((c) => c.id);
    expect(ids).toContain('t1');
    expect(ids).toContain('t2');
    expect(ids).toContain('t3');
    expect(ids).toContain('t4');
  });

  it('t1 uses reflex prompt profile', () => {
    const t1 = DEFAULT_TIER_CONFIGS.find((c) => c.id === 't1')!;
    expect(t1.promptProfile).toBe('reflex');
  });

  it('t2, t3, t4 use full prompt profile', () => {
    for (const id of ['t2', 't3', 't4'] as TierId[]) {
      const cfg = DEFAULT_TIER_CONFIGS.find((c) => c.id === id)!;
      expect(cfg.promptProfile).toBe('full');
    }
  });

  it('t1 uses qwen2.5:1.5b model', () => {
    const t1 = DEFAULT_TIER_CONFIGS.find((c) => c.id === 't1')!;
    expect(t1.model).toBe('qwen2.5:1.5b');
  });

  it('t2 uses gemma3:4b model', () => {
    const t2 = DEFAULT_TIER_CONFIGS.find((c) => c.id === 't2')!;
    expect(t2.model).toBe('gemma3:4b');
  });

  it('t3 uses llama3.1:8b model', () => {
    const t3 = DEFAULT_TIER_CONFIGS.find((c) => c.id === 't3')!;
    expect(t3.model).toBe('llama3.1:8b');
  });

  it('t4 uses qwen3:30b model', () => {
    const t4 = DEFAULT_TIER_CONFIGS.find((c) => c.id === 't4')!;
    expect(t4.model).toBe('qwen3:30b');
  });

  it('has correct token budgets for t1', () => {
    const t1 = DEFAULT_TIER_CONFIGS.find((c) => c.id === 't1')!;
    expect(t1.maxPromptTokens).toBe(1000);
    expect(t1.maxMemoryTokens).toBe(100);
    expect(t1.maxOutputTokens).toBe(256);
  });

  it('has correct token budgets for t2', () => {
    const t2 = DEFAULT_TIER_CONFIGS.find((c) => c.id === 't2')!;
    expect(t2.maxPromptTokens).toBe(2000);
    expect(t2.maxMemoryTokens).toBe(300);
    expect(t2.maxOutputTokens).toBe(512);
  });

  it('has correct token budgets for t3', () => {
    const t3 = DEFAULT_TIER_CONFIGS.find((c) => c.id === 't3')!;
    expect(t3.maxPromptTokens).toBe(4000);
    expect(t3.maxMemoryTokens).toBe(500);
    expect(t3.maxOutputTokens).toBe(1024);
  });

  it('has correct token budgets for t4', () => {
    const t4 = DEFAULT_TIER_CONFIGS.find((c) => c.id === 't4')!;
    expect(t4.maxPromptTokens).toBe(8000);
    expect(t4.maxMemoryTokens).toBe(1000);
    expect(t4.maxOutputTokens).toBe(2048);
  });

  it('has correct timeouts', () => {
    const timeouts: Record<TierId, number> = { t1: 5000, t2: 15000, t3: 10000, t4: 30000 };
    for (const [id, expected] of Object.entries(timeouts) as [TierId, number][]) {
      const cfg = DEFAULT_TIER_CONFIGS.find((c) => c.id === id)!;
      expect(cfg.timeoutMs).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// TierRegistry — initial state
// ---------------------------------------------------------------------------

describe('TierRegistry — initial state', () => {
  let registry: TierRegistry;

  beforeEach(() => {
    registry = new TierRegistry();
  });

  afterEach(() => {
    registry.stopProbing();
  });

  it('all tiers start as offline', () => {
    const states = registry.getAllStates();
    expect(states).toHaveLength(4);
    for (const state of states) {
      expect(state.status).toBe('offline');
    }
  });

  it('getOnlineTiers() returns empty when all offline', () => {
    expect(registry.getOnlineTiers()).toHaveLength(0);
  });

  it('getConfig() returns config by id', () => {
    const cfg = registry.getConfig('t2');
    expect(cfg).toBeDefined();
    expect(cfg!.id).toBe('t2');
    expect(cfg!.model).toBe('gemma3:4b');
  });

  it('getConfig() returns undefined for unknown id', () => {
    expect(registry.getConfig('t99' as TierId)).toBeUndefined();
  });

  it('getState() returns state by id', () => {
    const state = registry.getState('t1');
    expect(state).toBeDefined();
    expect(state!.id).toBe('t1');
    expect(state!.status).toBe('offline');
    expect(state!.consecutiveFailures).toBe(0);
    expect(state!.lastSeenAt).toBeNull();
    expect(state!.lastLatencyMs).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TierRegistry — updateState()
// ---------------------------------------------------------------------------

describe('TierRegistry — updateState()', () => {
  let registry: TierRegistry;

  beforeEach(() => {
    registry = new TierRegistry();
  });

  afterEach(() => {
    registry.stopProbing();
  });

  it('transitions to online and sets latency', () => {
    registry.updateState('t2', 'online', { latencyMs: 42, availableModels: ['gemma3:4b'] });
    const state = registry.getState('t2')!;
    expect(state.status).toBe('online');
    expect(state.lastLatencyMs).toBe(42);
    expect(state.availableModels).toContain('gemma3:4b');
  });

  it('going online resets consecutiveFailures to 0', () => {
    // Accumulate some failures first
    registry.updateState('t1', 'offline');
    registry.updateState('t1', 'offline');
    expect(registry.getState('t1')!.consecutiveFailures).toBe(2);

    // Recover
    registry.updateState('t1', 'online', { latencyMs: 10, availableModels: ['qwen2.5:1.5b'] });
    expect(registry.getState('t1')!.consecutiveFailures).toBe(0);
  });

  it('multiple offline calls increment consecutiveFailures', () => {
    registry.updateState('t3', 'offline');
    expect(registry.getState('t3')!.consecutiveFailures).toBe(1);
    registry.updateState('t3', 'offline');
    expect(registry.getState('t3')!.consecutiveFailures).toBe(2);
    registry.updateState('t3', 'offline');
    expect(registry.getState('t3')!.consecutiveFailures).toBe(3);
  });

  it('degraded also increments consecutiveFailures', () => {
    registry.updateState('t4', 'degraded', { availableModels: [] });
    expect(registry.getState('t4')!.consecutiveFailures).toBe(1);
    registry.updateState('t4', 'degraded', { availableModels: [] });
    expect(registry.getState('t4')!.consecutiveFailures).toBe(2);
  });

  it('online after offline resets consecutiveFailures', () => {
    registry.updateState('t2', 'offline');
    registry.updateState('t2', 'offline');
    registry.updateState('t2', 'online', { latencyMs: 5, availableModels: ['gemma3:4b'] });
    expect(registry.getState('t2')!.consecutiveFailures).toBe(0);
  });

  it('sets lastSeenAt when transitioning to online', () => {
    const before = new Date().toISOString();
    registry.updateState('t1', 'online', { latencyMs: 5, availableModels: ['qwen2.5:1.5b'] });
    const state = registry.getState('t1')!;
    expect(state.lastSeenAt).toBeDefined();
    expect(new Date(state.lastSeenAt!).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });

  it('sets lastCheckedAt on every update', () => {
    const before = new Date().toISOString();
    registry.updateState('t3', 'offline');
    const state = registry.getState('t3')!;
    expect(new Date(state.lastCheckedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(before).getTime(),
    );
  });
});

// ---------------------------------------------------------------------------
// TierRegistry — getOnlineTiers()
// ---------------------------------------------------------------------------

describe('TierRegistry — getOnlineTiers()', () => {
  let registry: TierRegistry;

  beforeEach(() => {
    registry = new TierRegistry();
  });

  afterEach(() => {
    registry.stopProbing();
  });

  it('returns only online tiers', () => {
    registry.updateState('t1', 'online', { latencyMs: 5, availableModels: ['qwen2.5:1.5b'] });
    registry.updateState('t2', 'offline');
    registry.updateState('t3', 'online', { latencyMs: 10, availableModels: ['llama3.1:8b'] });
    registry.updateState('t4', 'degraded', { availableModels: [] });

    const online = registry.getOnlineTiers();
    expect(online).toHaveLength(2);
    expect(online.map((c) => c.id)).toContain('t1');
    expect(online.map((c) => c.id)).toContain('t3');
  });

  it('returns tiers sorted by tier order (t1 < t2 < t3 < t4)', () => {
    registry.updateState('t4', 'online', { latencyMs: 50, availableModels: ['qwen3:30b'] });
    registry.updateState('t2', 'online', { latencyMs: 20, availableModels: ['gemma3:4b'] });
    registry.updateState('t1', 'online', { latencyMs: 5, availableModels: ['qwen2.5:1.5b'] });

    const online = registry.getOnlineTiers();
    expect(online[0].id).toBe('t1');
    expect(online[1].id).toBe('t2');
    expect(online[2].id).toBe('t4');
  });

  it('degraded tiers are NOT in getOnlineTiers()', () => {
    registry.updateState('t2', 'degraded', { availableModels: ['some-other-model'] });
    const online = registry.getOnlineTiers();
    expect(online.map((c) => c.id)).not.toContain('t2');
  });

  it('returns empty array when all tiers are offline or degraded', () => {
    registry.updateState('t1', 'offline');
    registry.updateState('t2', 'degraded', { availableModels: [] });
    expect(registry.getOnlineTiers()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TierRegistry — probe tests (fetch mocking)
// ---------------------------------------------------------------------------

describe('TierRegistry — probeTier()', () => {
  let registry: TierRegistry;

  beforeEach(() => {
    registry = new TierRegistry();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    registry.stopProbing();
    vi.unstubAllGlobals();
  });

  it('200 response with model present → online', async () => {
    const mockedFetch = vi.mocked(fetch);
    mockedFetch.mockResolvedValueOnce(makeTagsResponse(['qwen2.5:1.5b', 'other-model']));

    await registry.probeTier('t1');

    const state = registry.getState('t1')!;
    expect(state.status).toBe('online');
    expect(state.lastLatencyMs).toBeGreaterThanOrEqual(0);
    expect(state.availableModels).toContain('qwen2.5:1.5b');
    expect(state.consecutiveFailures).toBe(0);
  });

  it('200 response without configured model → degraded', async () => {
    const mockedFetch = vi.mocked(fetch);
    // t2 expects gemma3:4b but only llama3.1:8b is present
    mockedFetch.mockResolvedValueOnce(makeTagsResponse(['llama3.1:8b', 'some-other-model']));

    await registry.probeTier('t2');

    const state = registry.getState('t2')!;
    expect(state.status).toBe('degraded');
    expect(state.availableModels).toContain('llama3.1:8b');
    expect(state.consecutiveFailures).toBe(1);
  });

  it('fetch throws (connection refused) → offline', async () => {
    const mockedFetch = vi.mocked(fetch);
    mockedFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await registry.probeTier('t3');

    const state = registry.getState('t3')!;
    expect(state.status).toBe('offline');
    expect(state.consecutiveFailures).toBe(1);
  });

  it('non-200 response → offline', async () => {
    const mockedFetch = vi.mocked(fetch);
    mockedFetch.mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }));

    await registry.probeTier('t4');

    const state = registry.getState('t4')!;
    expect(state.status).toBe('offline');
    expect(state.consecutiveFailures).toBe(1);
  });

  it('calls correct endpoint for each tier', async () => {
    const mockedFetch = vi.mocked(fetch);
    mockedFetch.mockResolvedValue(makeTagsResponse(['qwen2.5:1.5b']));

    await registry.probeTier('t1');

    const callUrl = mockedFetch.mock.calls[0][0] as string;
    expect(callUrl).toContain('/api/tags');
    // Should hit the t1 endpoint
    const t1Config = registry.getConfig('t1')!;
    expect(callUrl).toContain(t1Config.endpoint);
  });

  it('consecutive failures accumulate across probes', async () => {
    const mockedFetch = vi.mocked(fetch);
    mockedFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    await registry.probeTier('t2');
    await registry.probeTier('t2');
    await registry.probeTier('t2');

    expect(registry.getState('t2')!.consecutiveFailures).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// TierRegistry — backoff behavior
// ---------------------------------------------------------------------------

describe('TierRegistry — backoff interval', () => {
  let registry: TierRegistry;

  beforeEach(() => {
    registry = new TierRegistry();
  });

  afterEach(() => {
    registry.stopProbing();
  });

  it('getProbeIntervalMs() returns base interval (15s) when no failures', () => {
    // When healthy (0 failures), should use 15s base interval
    expect(registry.getProbeIntervalMs('t1')).toBe(15_000);
  });

  it('getProbeIntervalMs() escalates with consecutive failures', () => {
    // 1 failure → 5s backoff tier
    registry.updateState('t1', 'offline');
    expect(registry.getProbeIntervalMs('t1')).toBe(5_000);

    // 2 failures → 15s backoff tier
    registry.updateState('t1', 'offline');
    expect(registry.getProbeIntervalMs('t1')).toBe(15_000);

    // 3 failures → 30s backoff tier
    registry.updateState('t1', 'offline');
    expect(registry.getProbeIntervalMs('t1')).toBe(30_000);

    // 4+ failures → 60s backoff ceiling
    registry.updateState('t1', 'offline');
    expect(registry.getProbeIntervalMs('t1')).toBe(60_000);
  });

  it('backoff resets to 15s after recovery', () => {
    registry.updateState('t2', 'offline');
    registry.updateState('t2', 'offline');
    registry.updateState('t2', 'offline');
    expect(registry.getProbeIntervalMs('t2')).toBe(30_000);

    // Recover
    registry.updateState('t2', 'online', { latencyMs: 8, availableModels: ['gemma3:4b'] });
    expect(registry.getProbeIntervalMs('t2')).toBe(15_000);
  });
});

// ---------------------------------------------------------------------------
// TierRegistry — env override
// ---------------------------------------------------------------------------

describe('TierRegistry — env overrides', () => {
  afterEach(() => {
    delete process.env.BRAIN_T1_URL;
    delete process.env.BRAIN_T1_MODEL;
    delete process.env.BRAIN_T3_URL;
  });

  it('BRAIN_T1_URL overrides t1 endpoint', () => {
    process.env.BRAIN_T1_URL = 'http://pi-local:11434';
    const registry = new TierRegistry();
    expect(registry.getConfig('t1')!.endpoint).toBe('http://pi-local:11434');
    registry.stopProbing();
  });

  it('BRAIN_T1_MODEL overrides t1 model', () => {
    process.env.BRAIN_T1_MODEL = 'custom-model:2b';
    const registry = new TierRegistry();
    expect(registry.getConfig('t1')!.model).toBe('custom-model:2b');
    registry.stopProbing();
  });

  it('BRAIN_T3_URL overrides only t3 endpoint, others stay as default', () => {
    process.env.BRAIN_T3_URL = 'http://thinkstation:11434';
    const registry = new TierRegistry();
    expect(registry.getConfig('t3')!.endpoint).toBe('http://thinkstation:11434');
    expect(registry.getConfig('t1')!.endpoint).toBe('http://localhost:11434');
    registry.stopProbing();
  });
});

// ---------------------------------------------------------------------------
// TierRegistry — getAllStates()
// ---------------------------------------------------------------------------

describe('TierRegistry — getAllStates()', () => {
  let registry: TierRegistry;

  beforeEach(() => {
    registry = new TierRegistry();
  });

  afterEach(() => {
    registry.stopProbing();
  });

  it('returns all 4 tier states', () => {
    const states = registry.getAllStates();
    expect(states).toHaveLength(4);
    const ids = states.map((s) => s.id);
    expect(ids).toContain('t1');
    expect(ids).toContain('t2');
    expect(ids).toContain('t3');
    expect(ids).toContain('t4');
  });

  it('returns snapshots, not live references', () => {
    const states1 = registry.getAllStates();
    registry.updateState('t1', 'online', { latencyMs: 5, availableModels: ['qwen2.5:1.5b'] });
    const states2 = registry.getAllStates();
    // The original snapshot should still show offline
    const t1_before = states1.find((s) => s.id === 't1')!;
    const t1_after = states2.find((s) => s.id === 't1')!;
    expect(t1_before.status).toBe('offline');
    expect(t1_after.status).toBe('online');
  });
});
