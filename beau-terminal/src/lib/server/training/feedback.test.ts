// src/lib/server/training/feedback.test.ts
// Training Readiness — SP7 Task 10: Tests for implicit feedback recording.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoist mock state ──────────────────────────────────────────────────────────

const { mockInsert, mockValues, mockRun } = vi.hoisted(() => {
  const mockRun = vi.fn();
  const mockValues = vi.fn();
  const mockInsert = vi.fn();
  mockValues.mockReturnValue({ run: mockRun });
  mockInsert.mockReturnValue({ values: mockValues });
  return { mockInsert, mockValues, mockRun };
});

vi.mock('../db/index.js', () => ({
  db: { insert: mockInsert },
}));

vi.mock('./schema.js', () => ({
  generationFeedback: {},
}));

// ── Import subject under test AFTER mocks ────────────────────────────────────

import { recordFeedback } from './feedback.js';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('recordFeedback', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('inserts a row with correct reviewer and outcomeType', () => {
    recordFeedback({ reviewer: 'system', outcomeType: 'surfaced' });

    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockValues).toHaveBeenCalledOnce();
    const row = mockValues.mock.calls[0][0];
    expect(row.reviewer).toBe('system');
    expect(row.outcomeType).toBe('surfaced');
    expect(mockRun).toHaveBeenCalledOnce();
  });

  it('inserts with requestId when provided', () => {
    recordFeedback({ requestId: 'req-abc', reviewer: 'system', outcomeType: 'decayed' });

    const row = mockValues.mock.calls[0][0];
    expect(row.requestId).toBe('req-abc');
    expect(row.outcomeType).toBe('decayed');
  });

  it('inserts with traceId when provided', () => {
    recordFeedback({ traceId: 'trace-xyz', reviewer: 'system', outcomeType: 'dropped' });

    const row = mockValues.mock.calls[0][0];
    expect(row.traceId).toBe('trace-xyz');
  });

  it('sets traceId to null when not provided', () => {
    recordFeedback({ reviewer: 'system', outcomeType: 'surfaced' });

    const row = mockValues.mock.calls[0][0];
    expect(row.traceId).toBeNull();
  });

  it('sets requestId to null when not provided', () => {
    recordFeedback({ reviewer: 'system', outcomeType: 'surfaced' });

    const row = mockValues.mock.calls[0][0];
    expect(row.requestId).toBeNull();
  });

  it('is fail-open — does not throw when db.insert throws', () => {
    mockInsert.mockImplementationOnce(() => { throw new Error('DB locked'); });

    expect(() => recordFeedback({ reviewer: 'system', outcomeType: 'surfaced' })).not.toThrow();
  });

  it('is fail-open — does not throw when values().run() throws', () => {
    mockRun.mockImplementationOnce(() => { throw new Error('constraint violation'); });

    expect(() => recordFeedback({ reviewer: 'system', outcomeType: 'surfaced' })).not.toThrow();
  });

  it('passes through optional finalText', () => {
    recordFeedback({ reviewer: 'user', outcomeType: 'approved', finalText: 'great haiku' });

    const row = mockValues.mock.calls[0][0];
    expect(row.finalText).toBe('great haiku');
  });

  it('passes through optional notes', () => {
    recordFeedback({ reviewer: 'beau', outcomeType: 'observation', notes: 'quiet evening' });

    const row = mockValues.mock.calls[0][0];
    expect(row.notes).toBe('quiet evening');
  });

  it('sets finalText and notes to null when not provided', () => {
    recordFeedback({ reviewer: 'system', outcomeType: 'dropped' });

    const row = mockValues.mock.calls[0][0];
    expect(row.finalText).toBeNull();
    expect(row.notes).toBeNull();
  });
});
