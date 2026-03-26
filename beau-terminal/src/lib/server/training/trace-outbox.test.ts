import { describe, it, expect, vi, afterEach } from 'vitest';
import { TraceOutbox } from './trace-outbox.js';

// Helper to make a minimal TracePayload for testing
function makePayload(overrides = {}): any {
  return {
    traceId: 'test-trace-1',
    requestId: 'req-1',
    parentTraceId: null,
    attemptNumber: 1,
    requestKind: 'thought.generate',
    origin: 'pressure',
    tier: 't2',
    modelFamily: 'gemma3',
    modelName: 'gemma3:4b',
    modelDigest: null,
    generationParams: null,
    provider: 'ollama',
    runtime: null,
    promptProvenance: {
      templateHash: 'abc123',
      promptPolicyVersion: '1.0.0',
      retrievalPolicyVersion: '1.0.0',
      assemblerVersion: '1.0.0',
      promptProfile: 'full',
      promptHash: 'def456',
    },
    inputJson: '{}',
    promptText: 'test prompt',
    responseText: 'test response',
    responseStatus: 'completed',
    tokenCountIn: null,
    tokenCountOut: null,
    latencyMs: 100,
    fallbackFrom: null,
    qualityEscalatedFrom: null,
    personalitySnapshotId: null,
    contextMode: 'ambient',
    contextStateJson: {},
    retrievals: [],
    consentScope: 'beau_output',
    privacyClass: 'public',
    trainingEligibility: 'eval_only',
    trainingEligibilityReason: 'default',
    ...overrides,
  };
}

describe('TraceOutbox', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('enqueue adds payload to queue', () => {
    const outbox = new TraceOutbox();
    outbox.enqueue(makePayload());
    expect(outbox.pending).toBe(1);
  });

  it('enqueue accepts multiple payloads', () => {
    const outbox = new TraceOutbox();
    outbox.enqueue(makePayload({ traceId: 'a' }));
    outbox.enqueue(makePayload({ traceId: 'b' }));
    expect(outbox.pending).toBe(2);
  });

  it('flush clears queue on success', () => {
    const mockWriter = vi.fn();
    const outbox = new TraceOutbox({ writer: mockWriter });
    outbox.enqueue(makePayload());
    outbox.flush();
    expect(outbox.pending).toBe(0);
    expect(mockWriter).toHaveBeenCalledTimes(1);
  });

  it('flush is fail-open — keeps entries on error', () => {
    const mockWriter = vi.fn().mockImplementation(() => { throw new Error('DB locked'); });
    const outbox = new TraceOutbox({ writer: mockWriter });
    outbox.enqueue(makePayload());
    outbox.flush(); // should not throw
    expect(outbox.pending).toBe(1);
  });

  it('flush does nothing when queue is empty', () => {
    const mockWriter = vi.fn();
    const outbox = new TraceOutbox({ writer: mockWriter });
    outbox.flush();
    expect(mockWriter).not.toHaveBeenCalled();
  });

  it('start begins interval, stop clears it', () => {
    const outbox = new TraceOutbox({ flushIntervalMs: 60000 });
    outbox.start();
    expect(outbox.running).toBe(true);
    outbox.stop();
    expect(outbox.running).toBe(false);
  });

  it('stop does a final flush', () => {
    const mockWriter = vi.fn();
    const outbox = new TraceOutbox({ writer: mockWriter, flushIntervalMs: 60000 });
    outbox.enqueue(makePayload());
    outbox.start();
    outbox.stop();
    expect(mockWriter).toHaveBeenCalledTimes(1);
    expect(outbox.pending).toBe(0);
  });
});
