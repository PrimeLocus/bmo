// src/lib/server/brain/router.ts
// Brain Dispatcher — SP6 Task 3
// Voice caster, context scaler, tier precedence — the core routing algorithm.
// TODO-B: extract for Pi deployment (Pi runs t1/t2 locally, queries registry for t3/t4)

import {
  TIER_ORDER,
  TIER_IDS,
  MEMORY_DEPTH_TOKENS,
} from './types.js';
import type {
  TierId,
  PersonalityVector,
  MemoryDepth,
  TierConfig,
  RoutePlan,
  BrainRequestV1,
  BrainHints,
} from './types.js';
import type { ThoughtType } from '../thoughts/types.js';
import { TierRegistry } from './registry.js';

// ---------------------------------------------------------------------------
// Voice centroids — personality texture → preferred tier
// ---------------------------------------------------------------------------

export const VOICE_CENTROIDS: Record<TierId, PersonalityVector> = {
  t1: { wonder: 0.35, reflection: 0.15, mischief: 0.85 },
  t2: { wonder: 0.40, reflection: 0.85, mischief: 0.15 },
  t3: { wonder: 0.55, reflection: 0.40, mischief: 0.45 },
  t4: { wonder: 0.85, reflection: 0.85, mischief: 0.20 },
};

const STICKINESS_THRESHOLD = 0.15;

// ---------------------------------------------------------------------------
// Euclidean distance
// ---------------------------------------------------------------------------

function distance(a: PersonalityVector, b: PersonalityVector): number {
  return Math.sqrt(
    (a.wonder - b.wonder) ** 2 +
    (a.reflection - b.reflection) ** 2 +
    (a.mischief - b.mischief) ** 2,
  );
}

// ---------------------------------------------------------------------------
// castVoice — personality vector → preferred tier via centroid proximity
// ---------------------------------------------------------------------------

export function castVoice(vector: PersonalityVector, previousTier?: TierId): TierId {
  // Find nearest centroid
  let nearest: TierId = 't1';
  let nearestDist = Infinity;

  for (const id of TIER_IDS) {
    const d = distance(vector, VOICE_CENTROIDS[id]);
    if (d < nearestDist) {
      nearest = id;
      nearestDist = d;
    }
  }

  // If no previous tier, return nearest
  if (!previousTier) return nearest;

  // If previous tier IS the nearest, return it
  if (previousTier === nearest) return nearest;

  // Stickiness: prefer previous tier unless new centroid is 15%+ closer
  const prevDist = distance(vector, VOICE_CENTROIDS[previousTier]);
  const improvement = (prevDist - nearestDist) / prevDist;

  if (improvement >= STICKINESS_THRESHOLD) {
    return nearest;
  }

  return previousTier;
}

// ---------------------------------------------------------------------------
// computeMemoryDepth — personality → memory budget
// ---------------------------------------------------------------------------

export function computeMemoryDepth(vector: PersonalityVector): MemoryDepth {
  const highReflection = vector.reflection > 0.6;
  const highWonder = vector.wonder > 0.6;
  const highMischief = vector.mischief > 0.6;

  // Multiple above 0.6: highest budget wins (deep > medium > light)
  if (highReflection) return 'deep';
  if (highWonder) return 'medium';
  if (highMischief) return 'light';

  // Balanced (no dim >0.6) → medium
  return 'medium';
}

// ---------------------------------------------------------------------------
// computeContextFloor — memory depth → minimum tier that fits the budget
// ---------------------------------------------------------------------------

export function computeContextFloor(
  memoryDepth: MemoryDepth,
  tierConfigs: TierConfig[],
): TierId | null {
  const neededTokens = MEMORY_DEPTH_TOKENS[memoryDepth];

  // Sort by tier order (ascending) to find the minimum tier that fits
  const sorted = [...tierConfigs].sort((a, b) => TIER_ORDER[a.id] - TIER_ORDER[b.id]);

  for (const cfg of sorted) {
    if (cfg.maxMemoryTokens >= neededTokens) {
      return cfg.id;
    }
  }

  // No tier can fit the budget
  return null;
}

// ---------------------------------------------------------------------------
// resolveThoughtFloor — thought type → minimum tier
// ---------------------------------------------------------------------------

export function resolveThoughtFloor(thoughtType: ThoughtType | null): TierId | null {
  if (thoughtType === null) return null;

  switch (thoughtType) {
    case 'observation':
      return 't1';
    case 'reaction':
    case 'haiku':
      return 't2';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// resolveTier — full precedence formula
// ---------------------------------------------------------------------------

interface ResolveTierInput {
  voicePreferred: TierId;
  thoughtFloor: TierId | null;
  contextFloor: TierId | null;
  onlineTiers: TierId[];
  hints: BrainHints;
}

interface ResolveTierResult {
  targetTier: TierId | null;
  clamped: boolean;
  trimmed: boolean;
}

function tierMax(a: TierId | null, b: TierId | null): TierId | null {
  if (a === null) return b;
  if (b === null) return a;
  return TIER_ORDER[a] >= TIER_ORDER[b] ? a : b;
}

export function resolveTier(input: ResolveTierInput): ResolveTierResult {
  const { voicePreferred, thoughtFloor, contextFloor, onlineTiers, hints } = input;

  // No tiers available at all
  if (onlineTiers.length === 0) {
    return { targetTier: null, clamped: false, trimmed: false };
  }

  // Sort online tiers by order
  const sortedOnline = [...onlineTiers].sort((a, b) => TIER_ORDER[a] - TIER_ORDER[b]);
  const highestAvailable = sortedOnline[sortedOnline.length - 1];

  // Compute floor = max(thoughtFloor, contextFloor)
  const floor = tierMax(thoughtFloor, contextFloor);

  // Compute ceiling = highestAvailable, capped by hints.maxTier
  let ceiling = highestAvailable;
  if (hints.maxTier && TIER_ORDER[hints.maxTier] < TIER_ORDER[ceiling]) {
    ceiling = hints.maxTier;
  }

  // Determine the ideal tier
  const preferred = hints.preferredTier ?? voicePreferred;

  // Clamp preferred between floor and ceiling
  let ideal = preferred;

  // Floor takes precedence: if floor > ceiling, floor wins
  if (floor !== null && TIER_ORDER[ideal] < TIER_ORDER[floor]) {
    ideal = floor;
  }
  if (TIER_ORDER[ideal] > TIER_ORDER[ceiling]) {
    // Only clamp down to ceiling if floor doesn't override
    if (floor === null || TIER_ORDER[floor] <= TIER_ORDER[ceiling]) {
      ideal = ceiling;
    }
    // If floor > ceiling, floor already won above
  }

  const clamped = ideal !== preferred;

  // Find closest available tier at or above floor
  let target: TierId | null = null;
  let trimmed = false;

  // First: try to find ideal tier if it's online
  if (sortedOnline.includes(ideal)) {
    target = ideal;
  } else {
    // Find closest online tier >= ideal (prefer the nearest one upward)
    let bestAbove: TierId | null = null;
    for (const t of sortedOnline) {
      if (TIER_ORDER[t] >= TIER_ORDER[ideal]) {
        // Also respect ceiling unless floor > ceiling
        if (
          floor === null ||
          TIER_ORDER[floor] <= TIER_ORDER[ceiling] ||
          TIER_ORDER[t] >= TIER_ORDER[floor]
        ) {
          bestAbove = t;
          break;
        }
      }
    }

    if (bestAbove !== null) {
      target = bestAbove;
    } else {
      // No tier at or above ideal — find nearest online tier at or above floor
      if (floor !== null) {
        for (const t of sortedOnline) {
          if (TIER_ORDER[t] >= TIER_ORDER[floor]) {
            target = t;
            break;
          }
        }
      }

      // Still nothing — fall to highest available, mark trimmed
      if (target === null) {
        target = highestAvailable;
        trimmed = true;
      }
    }
  }

  // If we moved from the original preferred, it's clamped
  const finalClamped = clamped || target !== preferred;

  return {
    targetTier: target,
    clamped: finalClamped,
    trimmed,
  };
}

// ---------------------------------------------------------------------------
// routeRequest — top-level orchestrator
// ---------------------------------------------------------------------------

function extractVector(request: BrainRequestV1): PersonalityVector {
  if (request.kind === 'thought.generate') {
    return request.input.context.vector;
  }
  // manual.prompt — use a default balanced vector
  return { wonder: 0.5, reflection: 0.5, mischief: 0.5 };
}

function extractThoughtType(request: BrainRequestV1): ThoughtType | null {
  if (request.kind === 'thought.generate') {
    return request.input.type;
  }
  return null;
}

export function routeRequest(
  request: BrainRequestV1,
  registry: TierRegistry,
  previousTier?: TierId,
): RoutePlan | null {
  const vector = extractVector(request);
  const hints = request.hints ?? {};

  // 1. Voice caster — personality texture → preferred tier
  const voicePreferred = castVoice(vector, previousTier);

  // 2. Memory depth — personality → memory budget
  const memoryDepth = computeMemoryDepth(vector);
  const memoryTokenBudget = MEMORY_DEPTH_TOKENS[memoryDepth];

  // 3. Thought floor — thought type → minimum tier
  const thoughtType = extractThoughtType(request);
  const thoughtFloor = resolveThoughtFloor(thoughtType);

  // 4. Context floor — memory depth → minimum tier with enough memory tokens
  const onlineConfigs = registry.getOnlineTiers();
  // Use ALL tier configs (not just online) to determine the context floor,
  // since the floor is about capability not availability
  const allConfigs: TierConfig[] = [];
  for (const id of TIER_IDS) {
    const cfg = registry.getConfig(id);
    if (cfg) allConfigs.push(cfg);
  }
  const contextFloor = computeContextFloor(memoryDepth, allConfigs);

  // 5. Resolve tier — full precedence formula
  const onlineTierIds = onlineConfigs.map((c) => c.id);
  const resolved = resolveTier({
    voicePreferred,
    thoughtFloor,
    contextFloor,
    onlineTiers: onlineTierIds,
    hints,
  });

  if (resolved.targetTier === null) {
    return null;
  }

  const tierConfig = registry.getConfig(resolved.targetTier);
  if (!tierConfig) {
    return null;
  }

  // Fix 1: when trimmed (fell below floor to highest available tier), cap the
  // memory budget to what the actual tier can hold — otherwise prepare.ts
  // retrieves more memory fragments than the tier's context window fits.
  const effectiveMemoryTokenBudget = resolved.trimmed
    ? Math.min(memoryTokenBudget, tierConfig.maxMemoryTokens)
    : memoryTokenBudget;

  return {
    targetTier: resolved.targetTier,
    tierConfig,
    voicePreferred,
    thoughtFloor,
    contextFloor,
    memoryDepth,
    memoryTokenBudget: effectiveMemoryTokenBudget,
    promptProfile: tierConfig.promptProfile,
    clamped: resolved.clamped,
    trimmed: resolved.trimmed,
    allowEscalation: hints.allowEscalation ?? true,
    maxTier: hints.maxTier ?? null,
  };
}
