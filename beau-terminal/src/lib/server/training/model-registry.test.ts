// src/lib/server/training/model-registry.test.ts
// Training Readiness — SP7 Task 9: Tests for LLM model lineage registry queries.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoist mock state ──────────────────────────────────────────────────────────

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
  };
  return { mockDb };
});

vi.mock('../db/index.js', () => ({ db: mockDb }));
vi.mock('./schema.js', () => ({
  llmModelVariants: { tier: 'tier', status: 'status', id: 'id' },
}));

// Drizzle query builder chain mock
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.get = vi.fn(() => result);
  chain.all = vi.fn(() => result);
  return chain;
}

// ── Import subject under test AFTER mocks ────────────────────────────────────

import { getActiveModelForTier, getAllModelVariants, getModelVariantById } from './model-registry.js';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getActiveModelForTier', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns the matching model when found', () => {
    const fakeModel = {
      id: 1, displayName: 'Qwen 2.5 1.5B (T1 base)', family: 'qwen2.5',
      baseModel: 'qwen2.5:1.5b', tier: 't1', status: 'active',
    };
    const chain = makeChain(fakeModel);
    mockDb.select.mockReturnValue(chain);

    const result = getActiveModelForTier('t1');
    expect(result).toEqual(fakeModel);
    expect(mockDb.select).toHaveBeenCalledOnce();
  });

  it('returns null when no active model found for tier', () => {
    const chain = makeChain(undefined);
    mockDb.select.mockReturnValue(chain);

    const result = getActiveModelForTier('t5');
    expect(result).toBeNull();
  });

  it('queries with both tier and status conditions', () => {
    const chain = makeChain(null);
    mockDb.select.mockReturnValue(chain);

    getActiveModelForTier('t2');
    // where() must be called (tier + status filter)
    expect(chain.where).toHaveBeenCalledOnce();
  });
});

describe('getAllModelVariants', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns all variants as an array', () => {
    const fakeVariants = [
      { id: 1, tier: 't1', status: 'active' },
      { id: 2, tier: 't2', status: 'active' },
      { id: 3, tier: 't3', status: 'draft' },
    ];
    const chain = makeChain(fakeVariants);
    mockDb.select.mockReturnValue(chain);

    const result = getAllModelVariants();
    expect(result).toEqual(fakeVariants);
    expect(chain.all).toHaveBeenCalledOnce();
  });

  it('returns empty array when no variants exist', () => {
    const chain = makeChain([]);
    mockDb.select.mockReturnValue(chain);

    const result = getAllModelVariants();
    expect(result).toEqual([]);
  });
});

describe('getModelVariantById', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns the variant with the matching id', () => {
    const fakeVariant = { id: 2, displayName: 'Gemma 3 4B (T2 base)', tier: 't2' };
    const chain = makeChain(fakeVariant);
    mockDb.select.mockReturnValue(chain);

    const result = getModelVariantById(2);
    expect(result).toEqual(fakeVariant);
    expect(chain.where).toHaveBeenCalledOnce();
  });

  it('returns null when no variant found for that id', () => {
    const chain = makeChain(undefined);
    mockDb.select.mockReturnValue(chain);

    const result = getModelVariantById(9999);
    expect(result).toBeNull();
  });
});
