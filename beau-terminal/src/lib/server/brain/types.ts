// src/lib/server/brain/types.ts
// Brain Dispatcher — SP6 Task 1
// Foundational type definitions for the 4-tier brain routing system.

import { nanoid } from 'nanoid';
import type { ThoughtType } from '../thoughts/types.js';

// ---------------------------------------------------------------------------
// Tier registry
// ---------------------------------------------------------------------------

export const TIER_IDS = ['t1', 't2', 't3', 't4'] as const;
export type TierId = (typeof TIER_IDS)[number];
export const TIER_ORDER: Record<TierId, number> = { t1: 0, t2: 1, t3: 2, t4: 3 };

// ---------------------------------------------------------------------------
// Tier configuration + state
// ---------------------------------------------------------------------------

export type PersonalityVector = { wonder: number; reflection: number; mischief: number };
export type PromptProfile = 'reflex' | 'full';

export interface TierConfig {
  id: TierId;
  label: string;
  endpoint: string;
  model: string;
  timeoutMs: number;
  maxPromptTokens: number;
  maxMemoryTokens: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  promptProfile: PromptProfile;
}

export type TierStatus = 'online' | 'degraded' | 'offline';

export interface TierState {
  id: TierId;
  status: TierStatus;
  lastCheckedAt: string;
  lastSeenAt: string | null;
  lastLatencyMs: number | null;
  consecutiveFailures: number;
  availableModels: string[];
}

// ---------------------------------------------------------------------------
// Memory depth
// ---------------------------------------------------------------------------

export type MemoryDepth = 'none' | 'light' | 'medium' | 'deep';

export const MEMORY_DEPTH_TOKENS: Record<MemoryDepth, number> = {
  none: 0,
  light: 150,
  medium: 300,
  deep: 500,
};

// ---------------------------------------------------------------------------
// Route plan (output of the router, input to the dispatcher)
// ---------------------------------------------------------------------------

export interface RoutePlan {
  targetTier: TierId;
  tierConfig: TierConfig;
  voicePreferred: TierId;
  thoughtFloor: TierId | null;
  contextFloor: TierId | null;
  memoryDepth: MemoryDepth;
  memoryTokenBudget: number;
  promptProfile: PromptProfile;
  clamped: boolean;
  trimmed: boolean;
  allowEscalation: boolean;
  maxTier: TierId | null;
}

// ---------------------------------------------------------------------------
// Request kinds
// ---------------------------------------------------------------------------

export interface ThoughtInput {
  type: ThoughtType;
  trigger: string;
  novelty: boolean;
  context: {
    vector: PersonalityVector;
    mode: string;
    timeOfDay: string;
    environment: string;
    momentum: string;
  };
  constraints: {
    maxLength: number;
    tone: string;
  };
}

export interface BrainHints {
  preferredTier?: TierId;
  maxTier?: TierId;
  allowEscalation?: boolean;
}

export type BrainRequestV1 =
  | {
      v: 1;
      requestId: string;
      parentRequestId?: string;
      kind: 'thought.generate';
      origin: 'thoughts';
      input: ThoughtInput;
      hints?: BrainHints;
    }
  | {
      v: 1;
      requestId: string;
      parentRequestId?: string;
      kind: 'manual.prompt';
      origin: 'console';
      input: { text: string; label?: string };
      hints?: BrainHints;
    };

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

export interface BrainResponse {
  requestId: string;
  text: string | null;
  tier: TierId;
  model: string;
  generationMs: number;
  clamped: boolean;
  trimmed: boolean;
  fallback: boolean;
  fallbackFrom?: TierId;
  qualityEscalated: boolean;
  escalatedFrom?: TierId;
}

// ---------------------------------------------------------------------------
// Request constructors
// ---------------------------------------------------------------------------

export function makeThoughtRequest(
  input: ThoughtInput,
  hints?: BrainHints,
  parentRequestId?: string,
): Extract<BrainRequestV1, { kind: 'thought.generate' }> {
  return {
    v: 1,
    requestId: nanoid(12),
    parentRequestId,
    kind: 'thought.generate',
    origin: 'thoughts',
    input,
    hints,
  };
}

export function makeManualRequest(
  input: { text: string; label?: string },
  hints?: BrainHints,
): Extract<BrainRequestV1, { kind: 'manual.prompt' }> {
  return {
    v: 1,
    requestId: nanoid(12),
    kind: 'manual.prompt',
    origin: 'console',
    input,
    hints,
  };
}

/**
 * Generic factory — returns the correct union member based on kind.
 * Useful when the caller already has a fully-formed input and knows the kind.
 */
export function makeBrainRequest(
  kind: 'thought.generate',
  input: ThoughtInput,
  hints?: BrainHints,
  parentRequestId?: string,
): Extract<BrainRequestV1, { kind: 'thought.generate' }>;
export function makeBrainRequest(
  kind: 'manual.prompt',
  input: { text: string; label?: string },
  hints?: BrainHints,
  parentRequestId?: string,
): Extract<BrainRequestV1, { kind: 'manual.prompt' }>;
export function makeBrainRequest(
  kind: BrainRequestV1['kind'],
  input: ThoughtInput | { text: string; label?: string },
  hints?: BrainHints,
  parentRequestId?: string,
): BrainRequestV1 {
  if (kind === 'thought.generate') {
    return makeThoughtRequest(input as ThoughtInput, hints, parentRequestId);
  }
  return makeManualRequest(input as { text: string; label?: string }, hints);
}
