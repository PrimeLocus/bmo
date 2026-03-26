// src/lib/server/training/trace-capture.ts
// Training Readiness — SP7 Task 7: Assemble a TracePayload from dispatch data.
// Pure function — no I/O, no DB imports. Safe to import in tests without mocking.

import { nanoid } from 'nanoid';
import { classifyEligibility } from './eligibility.js';
import type { TracePayload, PrepareResult } from './types.js';
import type { BrainRequestV1, RoutePlan, TierId } from '../brain/types.js';

export interface TraceContext {
  request: BrainRequestV1;
  plan: RoutePlan;
  prepareResult: PrepareResult;
  responseText: string | null;
  responseStatus: string;
  /** The actual model string used for inference (may differ from plan on fallback). */
  model: string;
  latencyMs: number;
  attemptNumber: number;
  parentTraceId: string | null;
  fallbackFrom: TierId | null;
  qualityEscalatedFrom: TierId | null;
  contextState: Record<string, unknown>;
  personalitySnapshotId: number | null;
}

/**
 * Assembles a complete TracePayload from dispatch data.
 * Calls classifyEligibility to determine consent / privacy / training class.
 * modelFamily is derived from the actual model string used (e.g. "gemma3:4b" → "gemma3").
 */
export function assembleTracePayload(ctx: TraceContext): TracePayload {
  const collections = ctx.prepareResult.retrievals.map((r) => r.collection);
  const eligibility = classifyEligibility({
    requestKind: ctx.request.kind,
    retrievedCollections: collections,
  });

  // Extract family from the colon-delimited model tag (e.g. "gemma3:4b" → "gemma3")
  const modelFamily = ctx.model.split(':')[0] ?? 'unknown';

  // contextMode is only meaningful for thought.generate requests
  const contextMode =
    ctx.request.kind === 'thought.generate'
      ? (ctx.request.input.context?.mode ?? null)
      : null;

  return {
    traceId: nanoid(16),
    requestId: ctx.request.requestId,
    parentTraceId: ctx.parentTraceId,
    attemptNumber: ctx.attemptNumber,
    requestKind: ctx.request.kind,
    origin: ctx.request.origin,
    tier: ctx.plan.targetTier,
    modelFamily,
    modelName: ctx.model,
    modelDigest: null,
    generationParams: null,
    provider: 'ollama',
    runtime: null,
    promptProvenance: ctx.prepareResult.provenance,
    inputJson: JSON.stringify(ctx.request.input),
    promptText: ctx.prepareResult.prompt,
    responseText: ctx.responseText,
    responseStatus: ctx.responseStatus,
    tokenCountIn: null,
    tokenCountOut: null,
    latencyMs: ctx.latencyMs,
    fallbackFrom: ctx.fallbackFrom,
    qualityEscalatedFrom: ctx.qualityEscalatedFrom,
    personalitySnapshotId: ctx.personalitySnapshotId,
    contextMode,
    contextStateJson: ctx.contextState,
    retrievals: ctx.prepareResult.retrievals,
    ...eligibility,
  };
}
