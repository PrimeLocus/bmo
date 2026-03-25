// src/lib/server/brain/log.ts
// Brain Dispatcher — SP6 Task 6
// Persists a dispatch record to SQLite after every brain response.

import { db } from '../db/index.js';
import { dispatches } from '../db/schema.js';
import type { BrainRequestV1, BrainResponse, RoutePlan, TierId } from './types.js';
import { TIER_ORDER } from './types.js';

// ---------------------------------------------------------------------------
// logDispatch
// ---------------------------------------------------------------------------

export interface LogDispatchParams {
  request: BrainRequestV1;
  plan: RoutePlan;
  response: BrainResponse;
  onlineTiers: TierId[];
}

/**
 * Derives a human-readable status string from the response.
 * - 'completed'  — text was generated
 * - 'silence'    — model chose SILENCE (text is null, no error field)
 * - 'timeout'    — generation did not complete within the tier timeout
 * - 'error'      — any other failure
 *
 * BrainResponse does not carry an error field in its current shape, so we
 * cannot distinguish timeout from error here. The caller may pass a special
 * status override in future; for now we map null text → 'silence'.
 */
function deriveStatus(response: BrainResponse): string {
  if (response.text !== null) return 'completed';
  return 'silence';
}

/**
 * Derives the querySummary string — first 200 chars of the relevant input.
 * - thought.generate  → uses `input.trigger`
 * - manual.prompt     → uses `input.text`
 */
function deriveQuerySummary(request: BrainRequestV1): string {
  let raw: string;
  if (request.kind === 'thought.generate') {
    raw = request.input.trigger;
  } else {
    raw = request.input.text;
  }
  return raw.slice(0, 200);
}

/**
 * Builds a short human-readable routing reason string, e.g.:
 * "voice=t2, floor=t2, final=t2"
 */
function deriveRoutingReason(plan: RoutePlan, finalTier: TierId): string {
  const parts: string[] = [];
  parts.push(`voice=${plan.voicePreferred}`);

  const floor = plan.thoughtFloor ?? plan.contextFloor;
  if (floor !== null) {
    parts.push(`floor=${floor}`);
  }

  parts.push(`final=${finalTier}`);

  if (plan.clamped) parts.push('clamped');
  if (plan.trimmed) parts.push('trimmed');

  return parts.join(', ');
}

/**
 * Returns the highest tier id from the provided list, or null if the list
 * is empty.
 */
function highestTier(tiers: TierId[]): TierId | null {
  if (tiers.length === 0) return null;
  return tiers.reduce((best, t) => (TIER_ORDER[t] > TIER_ORDER[best] ? t : best));
}

/**
 * Extracts the mode string from the request context (thought requests only).
 */
function deriveContextMode(request: BrainRequestV1): string | null {
  if (request.kind === 'thought.generate') {
    return request.input.context.mode;
  }
  return null;
}

/**
 * Inserts a row into the dispatches table summarising a completed brain dispatch.
 */
export function logDispatch({ request, plan, response, onlineTiers }: LogDispatchParams): void {
  const status = deriveStatus(response);
  const querySummary = deriveQuerySummary(request);
  const routingReason = deriveRoutingReason(plan, response.tier);
  const contextMode = deriveContextMode(request);
  const highest = highestTier(onlineTiers);

  db.insert(dispatches).values({
    requestId: request.requestId,
    parentRequestId: request.parentRequestId ?? null,
    kind: request.kind,
    tier: response.tier,
    model: response.model,
    durationMs: response.generationMs,
    status,
    querySummary,
    routingReason,
    contextMode,
    voicePreferred: plan.voicePreferred,
    thoughtFloor: plan.thoughtFloor ?? null,
    contextFloor: plan.contextFloor ?? null,
    highestAvailable: highest,
    clamped: plan.clamped,
    trimmed: plan.trimmed,
    fallbackFrom: response.fallbackFrom ?? null,
    qualityEscalatedFrom: response.escalatedFrom ?? null,
  }).run();
}
