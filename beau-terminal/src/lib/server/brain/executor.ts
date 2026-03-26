// src/lib/server/brain/executor.ts
// Brain Dispatcher — SP6 Task 5
// HTTP calls to Ollama, SILENCE detection, tier fallback, quality escalation.
// TODO-B: extract for Pi deployment — Pi calls t1/t2 directly, T3/T4 via Tailscale

import { TIER_ORDER } from './types.js';
import type { TierConfig, TierId, BrainResponse, RoutePlan, BrainRequestV1 } from './types.js';
import type { TierRegistry } from './registry.js';
import type { PrepareResult } from '../training/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TierResult {
  text: string | null;
  model: string;
  generationMs: number;
}

/** Data emitted after each tier attempt (primary or fallback) for trace capture. */
export interface AttemptData {
  prepareResult: PrepareResult;
  responseText: string | null;
  responseStatus: 'completed' | 'silence' | 'timeout' | 'error' | 'quality_rejected';
  model: string;
  latencyMs: number;
  tier: TierId;
  attemptNumber: number;
  fallbackFrom: TierId | null;
  qualityEscalatedFrom: TierId | null;
}

// Word-count thresholds for quality signal detection (50% of expected max)
const QUALITY_WORD_THRESHOLDS: Record<string, number> = {
  observation: 15, // 50% of 30 words
  reaction: 10,    // 50% of 20 words
  haiku: 0,        // haiku uses newline check instead
};

const HEDGING_MARKERS = ['I think maybe', "I'm not sure", 'something like'] as const;

// ---------------------------------------------------------------------------
// parseSilence
// ---------------------------------------------------------------------------

/**
 * Trims text and returns null if empty or the literal "SILENCE".
 * Ported from scripts/ollama-listener.js.
 */
export function parseSilence(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed === 'SILENCE') return null;
  return trimmed;
}

// ---------------------------------------------------------------------------
// executeOnTier
// ---------------------------------------------------------------------------

/**
 * POST a generation request to a single Ollama tier.
 * Returns { text, model, generationMs } where text is null for SILENCE/empty.
 * Throws on non-200, timeout, or network error.
 */
export async function executeOnTier(prompt: string, config: TierConfig): Promise<TierResult> {
  const url = `${config.endpoint}/api/generate`;
  const start = Date.now();

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, prompt, stream: false }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`executeOnTier: tier ${config.id} returned HTTP ${res.status}`);
  }

  const generationMs = Date.now() - start;
  const data = (await res.json()) as { response: string; model: string };

  return {
    text: parseSilence(data.response ?? ''),
    model: data.model ?? config.model,
    generationMs,
  };
}

// ---------------------------------------------------------------------------
// Fallback tier selection
// ---------------------------------------------------------------------------

/**
 * Finds the best fallback tier from the set of available online tiers.
 * Prefers next-higher tier; if none higher, uses next-lower.
 * Returns null if no fallback is possible.
 */
function selectFallbackTier(
  failedTier: TierId,
  registry: TierRegistry,
): TierConfig | null {
  const online = registry.getOnlineTiers();
  // Exclude the failed tier
  const candidates = online.filter((c) => c.id !== failedTier);
  if (candidates.length === 0) return null;

  const failedOrder = TIER_ORDER[failedTier];

  // Try upward first (next higher tier)
  const higher = candidates
    .filter((c) => TIER_ORDER[c.id] > failedOrder)
    .sort((a, b) => TIER_ORDER[a.id] - TIER_ORDER[b.id]);

  if (higher.length > 0) return higher[0];

  // Fall back downward (next lower tier)
  const lower = candidates
    .filter((c) => TIER_ORDER[c.id] < failedOrder)
    .sort((a, b) => TIER_ORDER[b.id] - TIER_ORDER[a.id]);

  if (lower.length > 0) return lower[0];

  return null;
}

// ---------------------------------------------------------------------------
// executeWithFallback
// ---------------------------------------------------------------------------

/** Options bag for executeWithFallback — extends the original positional args. */
export interface ExecuteOptions {
  prompt: string;
  plan: RoutePlan;
  registry: TierRegistry;
  preparePrompt?: (tierConfig: TierConfig) => Promise<PrepareResult>;
  request?: BrainRequestV1;
  /** The PrepareResult that produced `prompt`. Used for trace capture on primary attempt. */
  primaryPrepareResult?: PrepareResult;
  /** Called after each attempt (primary + fallback) with data for trace capture. */
  onAttempt?: (data: AttemptData) => void;
}

/**
 * Executes a generation request with one fallback attempt if the primary fails.
 *
 * - Try primary tier (from plan.targetTier)
 * - On success: return BrainResponse with fallback=false
 * - On failure: find ONE fallback tier (prefer higher, then lower)
 *   - Upward fallback: reuse the same prompt
 *   - Downward fallback: call preparePrompt callback if provided to re-prepare for lower tier
 * - If fallback also fails (or no fallback available):
 *   - thought.generate → return { text: null }
 *   - manual.prompt → throw
 *
 * @param prompt       Already-prepared prompt string
 * @param plan         Route plan (targetTier + tierConfig)
 * @param registry     TierRegistry for fallback tier lookup
 * @param preparePrompt  Optional callback to re-prepare prompt for a different tier (returns PrepareResult)
 * @param request      Original BrainRequest — used to determine throw-vs-null on total failure
 * @param options      Optional ExecuteOptions with onAttempt callback and primaryPrepareResult
 */
export async function executeWithFallback(
  prompt: string,
  plan: RoutePlan,
  registry: TierRegistry,
  preparePrompt?: (tierConfig: TierConfig) => Promise<PrepareResult>,
  request?: BrainRequestV1,
  options?: Pick<ExecuteOptions, 'primaryPrepareResult' | 'onAttempt'>,
): Promise<BrainResponse> {
  const primaryTier = plan.targetTier;
  const primaryConfig = plan.tierConfig;
  const onAttempt = options?.onAttempt;
  const primaryPrepareResult = options?.primaryPrepareResult;

  const isManual = request?.kind === 'manual.prompt';

  let attemptNumber = 0;

  // --- Primary attempt ---
  attemptNumber++;
  let primaryResult: TierResult | null = null;
  let primaryError: unknown = null;
  const primaryStart = Date.now();

  try {
    primaryResult = await executeOnTier(prompt, primaryConfig);
  } catch (err) {
    primaryError = err;
  }

  if (primaryResult !== null) {
    // Emit trace for successful primary attempt
    if (onAttempt && primaryPrepareResult) {
      onAttempt({
        prepareResult: primaryPrepareResult,
        responseText: primaryResult.text,
        responseStatus: primaryResult.text !== null ? 'completed' : 'silence',
        model: primaryResult.model,
        latencyMs: primaryResult.generationMs,
        tier: primaryTier,
        attemptNumber,
        fallbackFrom: null,
        qualityEscalatedFrom: null,
      });
    }

    return {
      requestId: request?.requestId ?? '',
      text: primaryResult.text,
      tier: primaryTier,
      model: primaryResult.model,
      generationMs: primaryResult.generationMs,
      clamped: plan.clamped,
      trimmed: plan.trimmed,
      fallback: false,
      qualityEscalated: false,
    };
  }

  // Primary failed — emit trace for the failed attempt
  const primaryLatency = Date.now() - primaryStart;
  if (onAttempt && primaryPrepareResult) {
    onAttempt({
      prepareResult: primaryPrepareResult,
      responseText: null,
      responseStatus: 'error',
      model: primaryConfig.model,
      latencyMs: primaryLatency,
      tier: primaryTier,
      attemptNumber,
      fallbackFrom: null,
      qualityEscalatedFrom: null,
    });
  }

  // Select fallback tier
  const fallbackConfig = selectFallbackTier(primaryTier, registry);

  if (fallbackConfig === null) {
    // No fallback available
    if (isManual) {
      throw primaryError instanceof Error
        ? primaryError
        : new Error(`executeWithFallback: primary tier ${primaryTier} failed, no fallback available`);
    }
    return {
      requestId: request?.requestId ?? '',
      text: null,
      tier: primaryTier,
      model: primaryConfig.model,
      generationMs: 0,
      clamped: plan.clamped,
      trimmed: plan.trimmed,
      fallback: true,
      fallbackFrom: primaryTier,
      qualityEscalated: false,
    };
  }

  // Decide direction: upward reuses prompt, downward re-prepares if callback provided
  const isDownward = TIER_ORDER[fallbackConfig.id] < TIER_ORDER[primaryTier];
  let fallbackPrompt: string;
  let fallbackPrepareResult: PrepareResult | undefined = primaryPrepareResult;

  if (isDownward && preparePrompt) {
    // Re-prepare for the lower tier. If this throws, skip the fallback entirely
    // rather than silently reusing a prompt sized for the (now-failed) higher tier.
    try {
      const result = await preparePrompt(fallbackConfig);
      fallbackPrompt = result.prompt;
      fallbackPrepareResult = result;
    } catch {
      // Re-preparation failed — treat as if no fallback is available
      if (isManual) {
        throw primaryError instanceof Error
          ? primaryError
          : new Error(`executeWithFallback: primary tier ${primaryTier} failed, fallback re-prepare also failed`);
      }
      return {
        requestId: request?.requestId ?? '',
        text: null,
        tier: primaryTier,
        model: primaryConfig.model,
        generationMs: 0,
        clamped: plan.clamped,
        trimmed: plan.trimmed,
        fallback: true,
        fallbackFrom: primaryTier,
        qualityEscalated: false,
      };
    }
  } else {
    fallbackPrompt = prompt;
  }

  // --- Fallback attempt ---
  attemptNumber++;
  let fallbackResult: TierResult | null = null;
  let fallbackError: unknown = null;
  const fallbackStart = Date.now();

  try {
    fallbackResult = await executeOnTier(fallbackPrompt, fallbackConfig);
  } catch (err) {
    fallbackError = err;
  }

  if (fallbackResult !== null) {
    // Emit trace for successful fallback attempt
    if (onAttempt && fallbackPrepareResult) {
      onAttempt({
        prepareResult: fallbackPrepareResult,
        responseText: fallbackResult.text,
        responseStatus: fallbackResult.text !== null ? 'completed' : 'silence',
        model: fallbackResult.model,
        latencyMs: fallbackResult.generationMs,
        tier: fallbackConfig.id,
        attemptNumber,
        fallbackFrom: primaryTier,
        qualityEscalatedFrom: null,
      });
    }

    return {
      requestId: request?.requestId ?? '',
      text: fallbackResult.text,
      tier: fallbackConfig.id,
      model: fallbackResult.model,
      generationMs: fallbackResult.generationMs,
      clamped: plan.clamped,
      trimmed: plan.trimmed,
      fallback: true,
      fallbackFrom: primaryTier,
      qualityEscalated: false,
    };
  }

  // Both attempts failed — emit trace for failed fallback
  const fallbackLatency = Date.now() - fallbackStart;
  if (onAttempt && fallbackPrepareResult) {
    onAttempt({
      prepareResult: fallbackPrepareResult,
      responseText: null,
      responseStatus: 'error',
      model: fallbackConfig.model,
      latencyMs: fallbackLatency,
      tier: fallbackConfig.id,
      attemptNumber,
      fallbackFrom: primaryTier,
      qualityEscalatedFrom: null,
    });
  }

  if (isManual) {
    throw fallbackError instanceof Error
      ? fallbackError
      : new Error(`executeWithFallback: both primary (${primaryTier}) and fallback (${fallbackConfig.id}) failed`);
  }

  return {
    requestId: request?.requestId ?? '',
    text: null,
    tier: fallbackConfig.id,
    model: fallbackConfig.model,
    generationMs: 0,
    clamped: plan.clamped,
    trimmed: plan.trimmed,
    fallback: true,
    fallbackFrom: primaryTier,
    qualityEscalated: false,
  };
}

// ---------------------------------------------------------------------------
// checkQualitySignals
// ---------------------------------------------------------------------------

/**
 * Post-hoc quality check on a generated response.
 * Returns true if the response shows signs of weakness:
 * - Word count under 50% of expected max (observation: 30, reaction: 20)
 * - Contains hedging markers ("I think maybe", "I'm not sure", "something like")
 * - Haiku missing newlines (not a real haiku attempt)
 *
 * Conservative — false negatives are acceptable.
 * Always returns false for null (already SILENCE) and manual.prompt requests.
 */
export function checkQualitySignals(
  text: string | null,
  request: BrainRequestV1,
): boolean {
  if (text === null) return false;
  if (request.kind !== 'thought.generate') return false;

  const thoughtType = request.input.type;

  // Haiku: check for newline presence instead of word count
  if (thoughtType === 'haiku') {
    if (!text.includes('\n')) return true;
    return false;
  }

  // Word count check (under 50% of expected max)
  const threshold = QUALITY_WORD_THRESHOLDS[thoughtType];
  if (threshold !== undefined && threshold > 0) {
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < threshold) return true;
  }

  // Hedging markers
  for (const marker of HEDGING_MARKERS) {
    if (text.includes(marker)) return true;
  }

  return false;
}
