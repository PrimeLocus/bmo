// src/lib/server/training/types.ts
// Training Readiness — SP7 shared type definitions.

import type { TierId, PromptProfile } from '../brain/types.js';

/** Provenance metadata from prompt assembly */
export interface PromptProvenance {
  templateHash: string;
  promptPolicyVersion: string;
  retrievalPolicyVersion: string;
  assemblerVersion: string;
  promptProfile: PromptProfile;
  promptHash: string;
}

/** Per-fragment retrieval metadata for trace storage */
export interface RetrievalProvenance {
  fragmentId: string;
  collection: string;
  sourceType: string;
  sourceEntityId: string;
  rank: number;
  baseScore: number;
  finalScore: number;
  selected: boolean;
  tokenCount: number;
  excerptHash: string;
}

/** Result from preparePrompt that includes provenance */
export interface PrepareResult {
  prompt: string;
  provenance: PromptProvenance;
  retrievals: RetrievalProvenance[];
}

/** Payload enqueued to the trace outbox */
export interface TracePayload {
  traceId: string;
  requestId: string;
  parentTraceId: string | null;
  attemptNumber: number;
  requestKind: string;
  origin: string;
  tier: TierId;
  modelFamily: string;
  modelName: string;
  modelDigest: string | null;
  generationParams: Record<string, unknown> | null;
  provider: string;
  runtime: string | null;
  promptProvenance: PromptProvenance;
  inputJson: string;
  promptText: string;
  responseText: string | null;
  responseStatus: string;
  tokenCountIn: number | null;
  tokenCountOut: number | null;
  latencyMs: number;
  fallbackFrom: TierId | null;
  qualityEscalatedFrom: TierId | null;
  personalitySnapshotId: number | null;
  contextMode: string | null;
  contextStateJson: Record<string, unknown>;
  retrievals: RetrievalProvenance[];
  consentScope: ConsentScope;
  privacyClass: PrivacyClass;
  trainingEligibility: TrainingEligibility;
  trainingEligibilityReason: string;
}

export type ConsentScope = 'beau_output' | 'user_content' | 'mixed';
export type PrivacyClass = 'public' | 'trusted' | 'private';
export type TrainingEligibility =
  | 'never'
  | 'rag_only'
  | 'eval_only'
  | 'trainable_after_redaction'
  | 'trainable';
