// src/lib/server/brain/log.test.ts
// TDD tests for Brain Dispatch Logging — SP6 Task 6

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logDispatch } from './log.js';
import type { BrainRequestV1, BrainResponse, RoutePlan, TierId } from './types.js';

// ---------------------------------------------------------------------------
// Mock the DB insert chain (vi.hoisted ensures mocks are in scope when hoisted)
// ---------------------------------------------------------------------------

const { runMock, valuesMock, insertMock } = vi.hoisted(() => {
  const runMock = vi.fn();
  const valuesMock = vi.fn(() => ({ run: runMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  return { runMock, valuesMock, insertMock };
});

vi.mock('../db/index.js', () => ({
  db: { insert: insertMock },
}));

vi.mock('../db/schema.js', () => ({
  dispatches: 'dispatches_table_ref',
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeThoughtRequest(
  overrides: Partial<Extract<BrainRequestV1, { kind: 'thought.generate' }>> = {},
): Extract<BrainRequestV1, { kind: 'thought.generate' }> {
  return {
    v: 1,
    requestId: 'req-thought-001',
    parentRequestId: undefined,
    kind: 'thought.generate',
    origin: 'thoughts',
    input: {
      type: 'observation',
      trigger: 'The light shifts in a way that feels like memory.',
      novelty: false,
      context: {
        vector: { wonder: 0.6, reflection: 0.7, mischief: 0.2 },
        mode: 'ambient',
        timeOfDay: 'evening',
        environment: 'quiet room',
        momentum: 'gentle curiosity',
      },
      constraints: { maxLength: 30, tone: 'reflective' },
    },
    ...overrides,
  };
}

function makeManualRequest(
  overrides: Partial<Extract<BrainRequestV1, { kind: 'manual.prompt' }>> = {},
): Extract<BrainRequestV1, { kind: 'manual.prompt' }> {
  return {
    v: 1,
    requestId: 'req-manual-002',
    kind: 'manual.prompt',
    origin: 'console',
    input: { text: 'What are you thinking about right now?' },
    ...overrides,
  };
}

function makeRoutePlan(overrides: Partial<RoutePlan> = {}): RoutePlan {
  return {
    targetTier: 't2',
    tierConfig: {
      id: 't2',
      label: 'T2',
      endpoint: 'http://localhost:11434',
      model: 'gemma3:4b',
      timeoutMs: 15000,
      maxPromptTokens: 2000,
      maxMemoryTokens: 300,
      maxOutputTokens: 512,
      supportsStreaming: true,
      promptProfile: 'full',
    },
    voicePreferred: 't2',
    thoughtFloor: 't2',
    contextFloor: 't2',
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

function makeResponse(overrides: Partial<BrainResponse> = {}): BrainResponse {
  return {
    requestId: 'req-thought-001',
    text: 'The moss holds last night\'s rain like a quiet secret.',
    tier: 't2',
    model: 'gemma3:4b',
    generationMs: 842,
    clamped: false,
    trimmed: false,
    fallback: false,
    qualityEscalated: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('logDispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a row with correct column mapping for a thought.generate request', () => {
    const request = makeThoughtRequest();
    const plan = makeRoutePlan();
    const response = makeResponse();
    const onlineTiers: TierId[] = ['t1', 't2'];

    logDispatch({ request, plan, response, onlineTiers });

    expect(insertMock).toHaveBeenCalledWith('dispatches_table_ref');
    const row = valuesMock.mock.calls[0][0];

    expect(row.requestId).toBe('req-thought-001');
    expect(row.kind).toBe('thought.generate');
    expect(row.tier).toBe('t2');
    expect(row.model).toBe('gemma3:4b');
    expect(row.durationMs).toBe(842);
    expect(row.contextMode).toBe('ambient');
    expect(row.voicePreferred).toBe('t2');
    expect(row.thoughtFloor).toBe('t2');
    expect(row.contextFloor).toBe('t2');
    expect(row.clamped).toBe(false);
    expect(row.trimmed).toBe(false);
  });

  it('inserts a row with correct column mapping for a manual.prompt request', () => {
    const request = makeManualRequest();
    const plan = makeRoutePlan({ voicePreferred: 't3', thoughtFloor: null, contextFloor: 't2' });
    const response = makeResponse({ requestId: 'req-manual-002', tier: 't3', model: 'llama3.1:8b', generationMs: 1200 });
    const onlineTiers: TierId[] = ['t2', 't3'];

    logDispatch({ request, plan, response, onlineTiers });

    const row = valuesMock.mock.calls[0][0];

    expect(row.requestId).toBe('req-manual-002');
    expect(row.kind).toBe('manual.prompt');
    expect(row.tier).toBe('t3');
    expect(row.model).toBe('llama3.1:8b');
    expect(row.durationMs).toBe(1200);
    expect(row.contextMode).toBeNull(); // manual requests have no mode
    expect(row.thoughtFloor).toBeNull();
    expect(row.contextFloor).toBe('t2');
  });

  it('sets status to "completed" when text is present', () => {
    const request = makeThoughtRequest();
    const plan = makeRoutePlan();
    const response = makeResponse({ text: 'some generated text' });

    logDispatch({ request, plan, response, onlineTiers: ['t2'] });

    const row = valuesMock.mock.calls[0][0];
    expect(row.status).toBe('completed');
  });

  it('sets status to "silence" when text is null', () => {
    const request = makeThoughtRequest();
    const plan = makeRoutePlan();
    const response = makeResponse({ text: null });

    logDispatch({ request, plan, response, onlineTiers: ['t2'] });

    const row = valuesMock.mock.calls[0][0];
    expect(row.status).toBe('silence');
  });

  it('truncates querySummary to 200 chars for thought.generate', () => {
    const longTrigger = 'a'.repeat(300);
    const request = makeThoughtRequest({ input: { ...makeThoughtRequest().input, trigger: longTrigger } });
    const plan = makeRoutePlan();
    const response = makeResponse();

    logDispatch({ request, plan, response, onlineTiers: ['t2'] });

    const row = valuesMock.mock.calls[0][0];
    expect(row.querySummary).toHaveLength(200);
    expect(row.querySummary).toBe('a'.repeat(200));
  });

  it('truncates querySummary to 200 chars for manual.prompt', () => {
    const longText = 'b'.repeat(300);
    const request = makeManualRequest({ input: { text: longText } });
    const plan = makeRoutePlan();
    const response = makeResponse();

    logDispatch({ request, plan, response, onlineTiers: ['t2'] });

    const row = valuesMock.mock.calls[0][0];
    expect(row.querySummary).toHaveLength(200);
  });

  it('routingReason includes voice, floor, and final tier', () => {
    const request = makeThoughtRequest();
    const plan = makeRoutePlan({ voicePreferred: 't2', thoughtFloor: 't2', contextFloor: 't2' });
    const response = makeResponse({ tier: 't2' });

    logDispatch({ request, plan, response, onlineTiers: ['t2'] });

    const row = valuesMock.mock.calls[0][0];
    expect(row.routingReason).toContain('voice=t2');
    expect(row.routingReason).toContain('floor=t2');
    expect(row.routingReason).toContain('final=t2');
  });

  it('routingReason appends "clamped" when plan.clamped is true', () => {
    const request = makeThoughtRequest();
    const plan = makeRoutePlan({ clamped: true });
    const response = makeResponse();

    logDispatch({ request, plan, response, onlineTiers: ['t2'] });

    const row = valuesMock.mock.calls[0][0];
    expect(row.routingReason).toContain('clamped');
  });

  it('routingReason does not include floor when both floors are null', () => {
    const request = makeManualRequest();
    const plan = makeRoutePlan({ thoughtFloor: null, contextFloor: null });
    const response = makeResponse();

    logDispatch({ request, plan, response, onlineTiers: ['t2'] });

    const row = valuesMock.mock.calls[0][0];
    expect(row.routingReason).not.toContain('floor');
    expect(row.routingReason).toContain('voice=');
    expect(row.routingReason).toContain('final=');
  });

  it('sets highestAvailable to the highest online tier', () => {
    const request = makeThoughtRequest();
    const plan = makeRoutePlan();
    const response = makeResponse();
    const onlineTiers: TierId[] = ['t1', 't2', 't4'];

    logDispatch({ request, plan, response, onlineTiers });

    const row = valuesMock.mock.calls[0][0];
    expect(row.highestAvailable).toBe('t4');
  });

  it('sets highestAvailable to null when onlineTiers is empty', () => {
    const request = makeThoughtRequest();
    const plan = makeRoutePlan();
    const response = makeResponse();

    logDispatch({ request, plan, response, onlineTiers: [] });

    const row = valuesMock.mock.calls[0][0];
    expect(row.highestAvailable).toBeNull();
  });

  it('sets fallbackFrom from response.fallbackFrom', () => {
    const request = makeThoughtRequest();
    const plan = makeRoutePlan();
    const response = makeResponse({ fallback: true, fallbackFrom: 't2', tier: 't3' });

    logDispatch({ request, plan, response, onlineTiers: ['t2', 't3'] });

    const row = valuesMock.mock.calls[0][0];
    expect(row.fallbackFrom).toBe('t2');
  });

  it('sets qualityEscalatedFrom from response.escalatedFrom', () => {
    const request = makeThoughtRequest();
    const plan = makeRoutePlan();
    const response = makeResponse({ qualityEscalated: true, escalatedFrom: 't2', tier: 't3' });

    logDispatch({ request, plan, response, onlineTiers: ['t2', 't3'] });

    const row = valuesMock.mock.calls[0][0];
    expect(row.qualityEscalatedFrom).toBe('t2');
  });

  it('stores parentRequestId when provided', () => {
    const request = makeThoughtRequest({ parentRequestId: 'parent-req-999' });
    const plan = makeRoutePlan();
    const response = makeResponse();

    logDispatch({ request, plan, response, onlineTiers: ['t2'] });

    const row = valuesMock.mock.calls[0][0];
    expect(row.parentRequestId).toBe('parent-req-999');
  });

  it('sets parentRequestId to null when not provided', () => {
    const request = makeThoughtRequest({ parentRequestId: undefined });
    const plan = makeRoutePlan();
    const response = makeResponse();

    logDispatch({ request, plan, response, onlineTiers: ['t2'] });

    const row = valuesMock.mock.calls[0][0];
    expect(row.parentRequestId).toBeNull();
  });

  it('calls run() on the insert chain', () => {
    const request = makeThoughtRequest();
    const plan = makeRoutePlan();
    const response = makeResponse();

    logDispatch({ request, plan, response, onlineTiers: ['t2'] });

    expect(runMock).toHaveBeenCalledOnce();
  });
});
