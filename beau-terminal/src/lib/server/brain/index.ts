// src/lib/server/brain/index.ts
// Brain Dispatcher — SP6 Task 8
// Public API: initBrain(), getBrainRegistry(), dispatch()
// TODO-B: extract for Pi deployment — Pi initialises with its own tier set (t1/t2 only)

import { TierRegistry, DEFAULT_TIER_CONFIGS } from './registry.js';
import { routeRequest } from './router.js';
import { preparePrompt } from './prepare.js';
import { executeWithFallback, checkQualitySignals } from './executor.js';
import { logDispatch } from './log.js';
import { getMemoryProvider } from '../memory/index.js';
import type { BrainRequestV1, BrainResponse, TierId, RoutePlan, TierConfig } from './types.js';
import { TIER_ORDER } from './types.js';
import type { PrepareResult } from '../training/types.js';

// ---------------------------------------------------------------------------
// Hard cap constant
// ---------------------------------------------------------------------------

export const DISPATCH_TIMEOUT_MS = 45_000;

// ---------------------------------------------------------------------------
// Singleton registry
// ---------------------------------------------------------------------------

let _registry: TierRegistry | null = null;

/**
 * Initialise the brain dispatcher. Safe to call multiple times — idempotent.
 * Creates the TierRegistry and starts the health probe loop.
 */
export function initBrain(): void {
  if (_registry !== null) return; // already initialised

  _registry = new TierRegistry(DEFAULT_TIER_CONFIGS);
  _registry.startProbing();

  console.log('[brain] TierRegistry initialized, probing started');
}

/**
 * Returns the active TierRegistry (for external consumers such as the
 * integrations dashboard). Returns null if initBrain() has not been called.
 */
export function getBrainRegistry(): TierRegistry | null {
  return _registry;
}

// ---------------------------------------------------------------------------
// previousTier — stickiness across dispatch calls
// ---------------------------------------------------------------------------

let previousTier: TierId | undefined = undefined;

// ---------------------------------------------------------------------------
// _resetBrainForTesting — test-only reset (not exported in production paths)
// ---------------------------------------------------------------------------

/** @internal Only for use in test suites — resets singleton state between tests */
export function _resetBrainForTesting(): void {
  _registry = null;
  previousTier = undefined;
}

// ---------------------------------------------------------------------------
// Silence response factory — returned when no tiers are available or on timeout
// ---------------------------------------------------------------------------

function makeSilenceResponse(requestId: string, plan?: RoutePlan | null): BrainResponse {
  const tier: TierId = plan?.targetTier ?? 't2';
  const model = plan?.tierConfig.model ?? 'unknown';

  return {
    requestId,
    text: null,
    tier,
    model,
    generationMs: 0,
    clamped: plan?.clamped ?? false,
    trimmed: plan?.trimmed ?? false,
    fallback: false,
    qualityEscalated: false,
  };
}

// ---------------------------------------------------------------------------
// dispatch — main entry point
// ---------------------------------------------------------------------------

/**
 * Orchestrates the full brain dispatch flow:
 * route → prepare → execute → quality-escalate? → log → return
 *
 * Wrapped in a 45s hard-cap timeout. Returns a silence BrainResponse on
 * timeout rather than throwing — callers (thought system, bridge) should
 * treat silence as a valid outcome.
 *
 * @param request  The BrainRequestV1 to dispatch
 * @returns        BrainResponse (text may be null for silence/timeout)
 */
export async function dispatch(request: BrainRequestV1): Promise<BrainResponse> {
  if (_registry === null) {
    throw new Error('[brain] dispatch() called before initBrain()');
  }

  const registry = _registry;

  // Boolean guard: set to true when the hard-cap timeout fires so that late
  // side effects from the still-running _executeDispatch are suppressed.
  let timedOut = false;

  // Wrap execution in a hard-cap timeout
  const hardTimeout = new Promise<BrainResponse>((resolve) => {
    setTimeout(() => {
      timedOut = true;
      resolve(makeSilenceResponse(request.requestId));
    }, DISPATCH_TIMEOUT_MS);
  });

  const execution = _executeDispatch(request, registry, () => timedOut);

  return Promise.race([execution, hardTimeout]);
}

// ---------------------------------------------------------------------------
// _executeDispatch — inner orchestration (no timeout wrapper)
// ---------------------------------------------------------------------------

async function _executeDispatch(
  request: BrainRequestV1,
  registry: TierRegistry,
  isTimedOut: () => boolean = () => false,
): Promise<BrainResponse> {
  // 1. Route the request
  const plan = routeRequest(request, registry, previousTier);

  // 2. No tiers available — return silence immediately (no logging)
  if (plan === null) {
    return makeSilenceResponse(request.requestId);
  }

  // 3. Prepare the prompt
  // getState is lazily imported to avoid circular dependency: bridge.ts will
  // import brain/index.ts; importing bridge.ts here would create a cycle.
  // For thought.generate, personality context is already in the request so
  // getState is not strictly needed. For manual.prompt we provide a lazy
  // importer that bridge.ts can satisfy by the time dispatch() is actually
  // called at runtime.
  let getState: (() => Record<string, unknown>) | undefined;

  if (request.kind === 'manual.prompt') {
    getState = _lazyGetState;
  }

  const prepareResult: PrepareResult = await preparePrompt(
    request,
    plan,
    getMemoryProvider,
    getState,
  );

  // 4. Execute with fallback (provides re-prepare callback for downward fallback)
  const reprepare = async (tierConfig: TierConfig): Promise<PrepareResult> => {
    const fallbackPlan: RoutePlan = { ...plan, targetTier: tierConfig.id, tierConfig };
    return preparePrompt(request, fallbackPlan, getMemoryProvider, getState);
  };

  let response = await executeWithFallback(prepareResult.prompt, plan, registry, reprepare, request);

  // 5. Quality escalation — only when signals trigger, escalation is allowed,
  //    and a higher online tier exists
  const qualityTriggered = checkQualitySignals(response.text, request);

  if (qualityTriggered && plan.allowEscalation) {
    const higherTier = _findHigherTier(plan.targetTier, registry);

    if (higherTier !== null) {
      // Re-route to the higher tier explicitly
      const escalationPlan = routeRequest(
        { ...request, hints: { ...request.hints, preferredTier: higherTier.id, allowEscalation: false } },
        registry,
        previousTier,
      );

      if (escalationPlan !== null) {
        const escalationPrepareResult = await preparePrompt(
          request,
          escalationPlan,
          getMemoryProvider,
          getState,
        );

        const escalationReprepare = async (tierConfig: TierConfig): Promise<PrepareResult> => {
          const fp: RoutePlan = { ...escalationPlan, targetTier: tierConfig.id, tierConfig };
          return preparePrompt(request, fp, getMemoryProvider, getState);
        };

        const escalatedResponse = await executeWithFallback(
          escalationPrepareResult.prompt,
          escalationPlan,
          registry,
          escalationReprepare,
          request,
        );

        response = {
          ...escalatedResponse,
          qualityEscalated: true,
          escalatedFrom: plan.targetTier,
        };
      }
    }
  }

  // 6. Log the dispatch — suppressed if the hard-cap timeout already fired
  if (!isTimedOut()) {
    const onlineTiers = registry.getOnlineTiers().map((c) => c.id);
    logDispatch({ request, plan, response, onlineTiers });
  }

  // 7. Track previousTier for stickiness — suppressed if timed out
  if (!isTimedOut()) {
    previousTier = response.tier;
  }

  return response;
}

// ---------------------------------------------------------------------------
// _findHigherTier — returns the lowest online tier strictly above targetTier
// ---------------------------------------------------------------------------

function _findHigherTier(
  currentTier: TierId,
  registry: TierRegistry,
): TierConfig | null {
  const online = registry.getOnlineTiers();
  const currentOrder = TIER_ORDER[currentTier];

  const higher = online
    .filter((c) => TIER_ORDER[c.id] > currentOrder)
    .sort((a, b) => TIER_ORDER[a.id] - TIER_ORDER[b.id]);

  return higher[0] ?? null;
}

// ---------------------------------------------------------------------------
// _lazyGetState — returns a minimal state if bridge is not connected
// ---------------------------------------------------------------------------

function _lazyGetState(): Record<string, unknown> {
  try {
    // Dynamic require to avoid circular dependency at module load time.
    // bridge.ts will import brain/index.ts; if we import bridge.ts at the top
    // of this file we create a cycle. By importing lazily (only when a
    // manual.prompt is actually dispatched) Node's module cache ensures the
    // cycle resolves correctly at runtime.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bridge = require('../mqtt/bridge.js') as { getState?: () => Record<string, unknown> };
    if (typeof bridge.getState === 'function') {
      return bridge.getState();
    }
  } catch {
    // Bridge not loaded — use minimal fallback
  }

  return {
    mode: 'ambient',
    environment: '',
    wakeWord: '',
  };
}
