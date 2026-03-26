// src/lib/server/training/feedback.ts
// Training Readiness — SP7 Task 10: Implicit feedback recording for thought lifecycle events.
// Fail-open: never throws, never blocks dispatch.

import { db } from '../db/index.js';
import { generationFeedback } from './schema.js';

export interface FeedbackInput {
  traceId?: string | null;
  requestId?: string | null;
  reviewer: 'user' | 'beau' | 'system';
  outcomeType: string;
  finalText?: string | null;
  notes?: string | null;
}

/**
 * Records an outcome label for a generation — called at thought lifecycle events
 * (surfaced, decayed, dropped). Fail-open: silently ignores errors.
 */
export function recordFeedback(input: FeedbackInput): void {
  try {
    db.insert(generationFeedback).values({
      traceId: input.traceId ?? null,
      requestId: input.requestId ?? null,
      reviewer: input.reviewer,
      outcomeType: input.outcomeType,
      finalText: input.finalText ?? null,
      notes: input.notes ?? null,
    }).run();
  } catch {
    // fail-open: feedback is best-effort, never blocks the thought pipeline
  }
}
