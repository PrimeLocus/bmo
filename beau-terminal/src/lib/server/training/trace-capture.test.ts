// src/lib/server/training/trace-capture.test.ts
// Training Readiness — SP7 Task 7: Tests for assembleTracePayload.

import { describe, it, expect, vi } from 'vitest';
import { assembleTracePayload } from './trace-capture.js';
import type { TraceContext } from './trace-capture.js';
import type { BrainRequestV1, RoutePlan, TierConfig } from '../brain/types.js';
import type { PrepareResult } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTierConfig(overrides: Partial<TierConfig> = {}): TierConfig {
  return {
    id: 't2',
    label: 'Poetry',
    endpoint: 'http://localhost:11434',
    model: 'gemma3:4b',
    timeoutMs: 30000,
    maxPromptTokens: 1024,
    maxMemoryTokens: 300,
    maxOutputTokens: 512,
    supportsStreaming: false,
    promptProfile: 'full',
    ...overrides,
  };
}

function makePlan(overrides: Partial<RoutePlan> = {}): RoutePlan {
  return {
    targetTier: 't2',
    tierConfig: makeTierConfig(),
    voicePreferred: 't2',
    thoughtFloor: null,
    contextFloor: null,
    memoryDepth: 'medium',
    memoryTokenBudget: 300,
    promptProfile: 'full',
    clamped: false,
    trimmed: false,
    allowEscalation: false,
    maxTier: null,
    ...overrides,
  };
}

function makeThoughtRequest(): Extract<BrainRequestV1, { kind: 'thought.generate' }> {
  return {
    v: 1,
    requestId: 'req-thought-1',
    kind: 'thought.generate',
    origin: 'thoughts',
    input: {
      type: 'observation',
      trigger: 'silence',
      novelty: false,
      context: {
        vector: { wonder: 0.6, reflection: 0.4, mischief: 0.2 },
        mode: 'ambient',
        timeOfDay: 'evening',
        environment: 'quiet',
        momentum: 'drifting',
      },
      constraints: {
        maxLength: 120,
        tone: 'reflective',
      },
    },
  };
}

function makeManualRequest(): Extract<BrainRequestV1, { kind: 'manual.prompt' }> {
  return {
    v: 1,
    requestId: 'req-manual-1',
    kind: 'manual.prompt',
    origin: 'console',
    input: { text: 'hello beau', label: 'test' },
  };
}

function makePrepareResult(overrides: Partial<PrepareResult> = {}): PrepareResult {
  return {
    prompt: 'You are Beau...',
    provenance: {
      templateHash: 'tmpl-abc',
      promptPolicyVersion: '1.0.0',
      retrievalPolicyVersion: '1.0.0',
      assemblerVersion: '1.0.0',
      promptProfile: 'full',
      promptHash: 'hash-xyz',
    },
    retrievals: [],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<TraceContext> = {}): TraceContext {
  return {
    request: makeThoughtRequest(),
    plan: makePlan(),
    prepareResult: makePrepareResult(),
    responseText: 'A small wonder drifts by.',
    responseStatus: 'completed',
    model: 'gemma3:4b',
    latencyMs: 850,
    attemptNumber: 1,
    parentTraceId: null,
    fallbackFrom: null,
    qualityEscalatedFrom: null,
    contextState: { sleepState: 'awake' },
    personalitySnapshotId: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('assembleTracePayload', () => {
  it('returns a TracePayload with all required fields populated', () => {
    const payload = assembleTracePayload(makeCtx());

    expect(payload.traceId).toBeDefined();
    expect(payload.requestId).toBe('req-thought-1');
    expect(payload.attemptNumber).toBe(1);
    expect(payload.requestKind).toBe('thought.generate');
    expect(payload.origin).toBe('thoughts');
    expect(payload.tier).toBe('t2');
    expect(payload.modelName).toBe('gemma3:4b');
    expect(payload.provider).toBe('ollama');
    expect(payload.promptText).toBe('You are Beau...');
    expect(payload.responseText).toBe('A small wonder drifts by.');
    expect(payload.responseStatus).toBe('completed');
    expect(payload.latencyMs).toBe(850);
    expect(payload.fallbackFrom).toBeNull();
    expect(payload.qualityEscalatedFrom).toBeNull();
    expect(payload.personalitySnapshotId).toBeNull();
    expect(payload.inputJson).toBeDefined();
    expect(payload.retrievals).toEqual([]);
    expect(payload.contextStateJson).toEqual({ sleepState: 'awake' });
    expect(payload.promptProvenance.templateHash).toBe('tmpl-abc');
  });

  it('traceId is a non-empty string (nanoid)', () => {
    const payload = assembleTracePayload(makeCtx());
    expect(typeof payload.traceId).toBe('string');
    expect(payload.traceId.length).toBeGreaterThan(0);
  });

  it('traceId is unique across calls', () => {
    const a = assembleTracePayload(makeCtx());
    const b = assembleTracePayload(makeCtx());
    expect(a.traceId).not.toBe(b.traceId);
  });

  it('modelFamily is extracted from model string (gemma3:4b → gemma3)', () => {
    const payload = assembleTracePayload(makeCtx({ model: 'gemma3:4b' }));
    expect(payload.modelFamily).toBe('gemma3');
  });

  it('modelFamily handles model strings without a colon', () => {
    const ctx = makeCtx({ model: 'llama3' });
    ctx.plan = makePlan({ tierConfig: makeTierConfig({ model: 'llama3' }) });
    const payload = assembleTracePayload(ctx);
    expect(payload.modelFamily).toBe('llama3');
  });

  it('classifies thought.generate correctly — beau_output / public / eval_only', () => {
    const payload = assembleTracePayload(makeCtx());
    expect(payload.consentScope).toBe('beau_output');
    expect(payload.privacyClass).toBe('public');
    expect(payload.trainingEligibility).toBe('eval_only');
    expect(payload.trainingEligibilityReason).toBeTruthy();
  });

  it('classifies manual.prompt correctly — user_content / trusted / trainable_after_redaction', () => {
    const payload = assembleTracePayload(makeCtx({ request: makeManualRequest() }));
    expect(payload.consentScope).toBe('user_content');
    expect(payload.privacyClass).toBe('trusted');
    expect(payload.trainingEligibility).toBe('trainable_after_redaction');
  });

  it('sets trainingEligibility to never when beau_private collection is retrieved', () => {
    const prepareResult = makePrepareResult({
      retrievals: [
        {
          fragmentId: 'frag-1',
          collection: 'beau_private',
          sourceType: 'journal',
          sourceEntityId: 'j-1',
          rank: 0,
          baseScore: 0.9,
          finalScore: 0.9,
          selected: true,
          tokenCount: 50,
          excerptHash: 'hash-1',
        },
      ],
    });
    const payload = assembleTracePayload(makeCtx({ prepareResult }));
    expect(payload.trainingEligibility).toBe('never');
    expect(payload.privacyClass).toBe('private');
  });

  it('handles null responseText', () => {
    const payload = assembleTracePayload(makeCtx({ responseText: null }));
    expect(payload.responseText).toBeNull();
  });

  it('inputJson is JSON.stringify of the full request envelope', () => {
    const ctx = makeCtx();
    const payload = assembleTracePayload(ctx);
    const parsed = JSON.parse(payload.inputJson);
    expect(parsed).toEqual(ctx.request);
  });

  it('contextMode is set from thought.generate input.context.mode', () => {
    const payload = assembleTracePayload(makeCtx());
    expect(payload.contextMode).toBe('ambient');
  });

  it('contextMode is null for manual.prompt', () => {
    const payload = assembleTracePayload(makeCtx({ request: makeManualRequest() }));
    expect(payload.contextMode).toBeNull();
  });

  it('parentTraceId is passed through', () => {
    const payload = assembleTracePayload(makeCtx({ parentTraceId: 'parent-abc' }));
    expect(payload.parentTraceId).toBe('parent-abc');
  });

  it('fallbackFrom and qualityEscalatedFrom are passed through', () => {
    const payload = assembleTracePayload(
      makeCtx({ fallbackFrom: 't3', qualityEscalatedFrom: 't1' }),
    );
    expect(payload.fallbackFrom).toBe('t3');
    expect(payload.qualityEscalatedFrom).toBe('t1');
  });

  it('personalitySnapshotId is passed through', () => {
    const payload = assembleTracePayload(makeCtx({ personalitySnapshotId: 42 }));
    expect(payload.personalitySnapshotId).toBe(42);
  });
});
