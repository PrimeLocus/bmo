// src/lib/server/brain/registry.ts
// Brain Dispatcher — SP6 Task 2
// TierRegistry: config + health probing for all 4 brain tiers.
// TODO-B: extract for Pi deployment (Pi will run t1/t2 directly, query registry for t3/t4)

import { TIER_ORDER } from './types.js';
import type { TierId, TierConfig, TierState, TierStatus, PromptProfile } from './types.js';

// ---------------------------------------------------------------------------
// Backoff schedule (consecutive failures → probe interval ms)
// ---------------------------------------------------------------------------

const BACKOFF_MS = [
  5_000,   // 1 failure
  15_000,  // 2 failures
  30_000,  // 3 failures
  60_000,  // 4+ failures (ceiling)
] as const;

const BASE_INTERVAL_MS = 15_000; // healthy probe interval

// ---------------------------------------------------------------------------
// Default tier configurations
// ---------------------------------------------------------------------------

function buildDefaultConfigs(): TierConfig[] {
  const configs: Array<{
    id: TierId;
    label: string;
    defaultEndpoint: string;
    defaultModel: string;
    timeoutMs: number;
    maxPromptTokens: number;
    maxMemoryTokens: number;
    maxOutputTokens: number;
    supportsStreaming: boolean;
    promptProfile: PromptProfile;
  }> = [
    {
      id: 't1',
      label: 'Hailo NPU (Reflex)',
      defaultEndpoint: 'http://localhost:11434',
      defaultModel: 'qwen2.5:1.5b',
      timeoutMs: 5_000,
      maxPromptTokens: 1000,
      maxMemoryTokens: 100,
      maxOutputTokens: 256,
      supportsStreaming: true,
      promptProfile: 'reflex',
    },
    {
      id: 't2',
      label: 'Pi CPU Ollama (Philosophy)',
      defaultEndpoint: 'http://localhost:11434',
      defaultModel: 'gemma3:4b',
      timeoutMs: 15_000,
      maxPromptTokens: 2000,
      maxMemoryTokens: 300,
      maxOutputTokens: 512,
      supportsStreaming: true,
      promptProfile: 'full',
    },
    {
      id: 't3',
      label: 'ThinkStation (Reasoning)',
      defaultEndpoint: 'http://localhost:11434',
      defaultModel: 'llama3.1:8b',
      timeoutMs: 10_000,
      maxPromptTokens: 4000,
      maxMemoryTokens: 500,
      maxOutputTokens: 1024,
      supportsStreaming: true,
      promptProfile: 'full',
    },
    {
      id: 't4',
      label: 'Legion / Heavy Inference',
      defaultEndpoint: 'http://localhost:11434',
      defaultModel: 'qwen3:30b',
      timeoutMs: 30_000,
      maxPromptTokens: 8000,
      maxMemoryTokens: 1000,
      maxOutputTokens: 2048,
      supportsStreaming: true,
      promptProfile: 'full',
    },
  ];

  return configs.map(({ id, label, defaultEndpoint, defaultModel, ...rest }) => {
    const n = id.slice(1).toUpperCase(); // 't1' → '1' → 'T1' as prefix
    const envNum = id.slice(1); // '1', '2', '3', '4'
    const endpoint = process.env[`BRAIN_T${envNum}_URL`] ?? defaultEndpoint;
    const model = process.env[`BRAIN_T${envNum}_MODEL`] ?? defaultModel;
    return { id, label, endpoint, model, ...rest };
  });
}

export const DEFAULT_TIER_CONFIGS: TierConfig[] = buildDefaultConfigs();

// ---------------------------------------------------------------------------
// Initial state factory
// ---------------------------------------------------------------------------

function initialState(id: TierId): TierState {
  return {
    id,
    status: 'offline',
    lastCheckedAt: new Date().toISOString(),
    lastSeenAt: null,
    lastLatencyMs: null,
    consecutiveFailures: 0,
    availableModels: [],
  };
}

// ---------------------------------------------------------------------------
// TierRegistry
// ---------------------------------------------------------------------------

export class TierRegistry {
  private configs: Map<TierId, TierConfig>;
  private states: Map<TierId, TierState>;
  private probeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(configs: TierConfig[] = buildDefaultConfigs()) {
    this.configs = new Map(configs.map((c) => [c.id, c]));
    this.states = new Map(configs.map((c) => [c.id, initialState(c.id)]));
  }

  // ---------------------------------------------------------------------------
  // Config + state accessors
  // ---------------------------------------------------------------------------

  getConfig(id: TierId): TierConfig | undefined {
    return this.configs.get(id);
  }

  getState(id: TierId): TierState | undefined {
    const s = this.states.get(id);
    if (!s) return undefined;
    return { ...s };
  }

  getAllStates(): TierState[] {
    return Array.from(this.states.values()).map((s) => ({ ...s }));
  }

  getOnlineTiers(): TierConfig[] {
    const result: TierConfig[] = [];
    for (const [id, state] of this.states) {
      if (state.status === 'online') {
        const cfg = this.configs.get(id);
        if (cfg) result.push(cfg);
      }
    }
    return result.sort((a, b) => TIER_ORDER[a.id] - TIER_ORDER[b.id]);
  }

  // ---------------------------------------------------------------------------
  // State mutation
  // ---------------------------------------------------------------------------

  updateState(
    id: TierId,
    status: TierStatus,
    opts?: { latencyMs?: number; availableModels?: string[] },
  ): void {
    const existing = this.states.get(id);
    if (!existing) return;

    const now = new Date().toISOString();

    if (status === 'online') {
      this.states.set(id, {
        ...existing,
        status: 'online',
        lastCheckedAt: now,
        lastSeenAt: now,
        lastLatencyMs: opts?.latencyMs ?? null,
        availableModels: opts?.availableModels ?? existing.availableModels,
        consecutiveFailures: 0,
      });
    } else {
      // offline or degraded — increment failures
      this.states.set(id, {
        ...existing,
        status,
        lastCheckedAt: now,
        lastLatencyMs: opts?.latencyMs ?? existing.lastLatencyMs,
        availableModels: opts?.availableModels ?? existing.availableModels,
        consecutiveFailures: existing.consecutiveFailures + 1,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Backoff
  // ---------------------------------------------------------------------------

  getProbeIntervalMs(id: TierId): number {
    const state = this.states.get(id);
    if (!state || state.consecutiveFailures === 0) return BASE_INTERVAL_MS;
    const idx = Math.min(state.consecutiveFailures - 1, BACKOFF_MS.length - 1);
    return BACKOFF_MS[idx];
  }

  // ---------------------------------------------------------------------------
  // Health probing
  // ---------------------------------------------------------------------------

  async probeTier(id: TierId): Promise<void> {
    const cfg = this.configs.get(id);
    if (!cfg) return;

    const url = `${cfg.endpoint}/api/tags`;
    const start = Date.now();

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        this.updateState(id, 'offline');
        return;
      }

      const body = (await res.json()) as { models?: Array<{ name: string; model: string }> };
      const availableModels = (body.models ?? []).map((m) => m.name ?? m.model);
      const modelPresent = availableModels.some(
        (name) => name === cfg.model || name.startsWith(cfg.model),
      );

      if (modelPresent) {
        this.updateState(id, 'online', { latencyMs, availableModels });
      } else {
        this.updateState(id, 'degraded', { availableModels });
      }
    } catch {
      this.updateState(id, 'offline');
    }
  }

  async probeAllTiers(): Promise<void> {
    await Promise.allSettled(Array.from(this.configs.keys()).map((id) => this.probeTier(id)));
  }

  // ---------------------------------------------------------------------------
  // Interval probing lifecycle
  // ---------------------------------------------------------------------------

  startProbing(intervalMs = BASE_INTERVAL_MS): void {
    if (this.probeTimer) return; // already running

    // Probe immediately on startup
    void this.probeAllTiers();

    this.probeTimer = setInterval(() => {
      void this.probeAllTiers();
    }, intervalMs);
  }

  stopProbing(): void {
    if (this.probeTimer) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
  }
}
