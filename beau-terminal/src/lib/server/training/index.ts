// src/lib/server/training/index.ts
// Training Readiness — SP7 Task 8: Singleton accessor for trace outbox + DB writer.
// initTraining() starts the background flush loop. getTraceOutbox() returns the
// instance for enqueue() calls (just an array push — never blocks dispatch).

import { eq } from 'drizzle-orm';
import { TraceOutbox } from './trace-outbox.js';
import type { TracePayload } from './types.js';
import { db } from '../db/index.js';
import { generationTraces, traceRetrievals } from './schema.js';

let outbox: TraceOutbox | null = null;

/**
 * Writes a single TracePayload to SQLite — called by the outbox on its flush timer.
 * Inserts one generation_traces row and N trace_retrievals rows.
 */
function writeTrace(payload: TracePayload): void {
  // Atomic transaction: trace + all retrievals committed together.
  // If any insert fails, the entire write rolls back — no orphaned traces.
  const insertAll = db.transaction(() => {
  db.insert(generationTraces).values({
    traceId: payload.traceId,
    requestId: payload.requestId,
    parentTraceId: payload.parentTraceId,
    attemptNumber: payload.attemptNumber,
    requestKind: payload.requestKind,
    origin: payload.origin,
    tier: payload.tier,
    modelFamily: payload.modelFamily,
    modelName: payload.modelName,
    modelDigest: payload.modelDigest,
    generationParams: payload.generationParams ? JSON.stringify(payload.generationParams) : null,
    provider: payload.provider,
    runtime: payload.runtime,
    promptTemplateHash: payload.promptProvenance.templateHash,
    promptPolicyVersion: payload.promptProvenance.promptPolicyVersion,
    promptProfile: payload.promptProvenance.promptProfile,
    retrievalPolicyVersion: payload.promptProvenance.retrievalPolicyVersion,
    assemblerVersion: payload.promptProvenance.assemblerVersion,
    inputJson: payload.inputJson,
    promptText: payload.promptText,
    responseText: payload.responseText,
    responseStatus: payload.responseStatus,
    tokenCountIn: payload.tokenCountIn,
    tokenCountOut: payload.tokenCountOut,
    latencyMs: payload.latencyMs,
    fallbackFrom: payload.fallbackFrom,
    qualityEscalatedFrom: payload.qualityEscalatedFrom,
    promptHash: payload.promptProvenance.promptHash,
    personalitySnapshotId: payload.personalitySnapshotId,
    contextMode: payload.contextMode,
    contextStateJson: JSON.stringify(payload.contextStateJson),
    clockSource: null,
    clockOffsetMs: null,
    consentScope: payload.consentScope,
    privacyClass: payload.privacyClass,
    trainingEligibility: payload.trainingEligibility,
    trainingEligibilityReason: payload.trainingEligibilityReason,
  }).run();

  // Insert trace_retrievals rows
  for (const ret of payload.retrievals) {
    db.insert(traceRetrievals).values({
      traceId: payload.traceId,
      collection: ret.collection,
      fragmentId: ret.fragmentId,
      sourceType: ret.sourceType,
      sourceEntityId: ret.sourceEntityId,
      rank: ret.rank,
      baseScore: ret.baseScore,
      finalScore: ret.finalScore,
      selected: ret.selected ? 1 : 0,
      tokenCount: ret.tokenCount,
      excerptHash: ret.excerptHash,
    }).run();
  }
  }); // end transaction
  insertAll();
}

/**
 * Updates the responseStatus of an already-flushed trace in the database.
 * Used as a fallback by the outbox when updateStatus is called after the 2s flush.
 */
function updateTraceStatus(traceId: string, status: string): void {
  db.update(generationTraces)
    .set({ responseStatus: status })
    .where(eq(generationTraces.traceId, traceId))
    .run();
}

/**
 * Initialise the training trace outbox. Safe to call multiple times — idempotent.
 * Starts a 2s background flush loop that drains enqueued payloads to SQLite.
 */
export function initTraining(): void {
  if (outbox) return;
  outbox = new TraceOutbox({
    flushIntervalMs: 2000,
    writer: writeTrace,
    statusUpdater: updateTraceStatus,
  });
  outbox.start();
}

/**
 * Returns the active TraceOutbox for enqueue() calls, or null if initTraining()
 * has not been called. Callers should null-guard: `getTraceOutbox()?.enqueue(p)`.
 */
export function getTraceOutbox(): TraceOutbox | null {
  return outbox;
}

/** @internal Only for use in test suites — resets singleton state between tests */
export function _resetTrainingForTesting(): void {
  if (outbox) {
    outbox.stop();
  }
  outbox = null;
}
