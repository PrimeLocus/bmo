import { describe, it, expect } from 'vitest';
import {
  NOTICING_STATUSES,
  ALLOWED_CATEGORIES,
  BLOCKED_CATEGORIES,
  validateNoticingCategory,
  isValidStatusTransition,
  canSurface,
  MIN_OBSERVATION_WINDOW_DAYS,
} from './noticings.js';

describe('noticings constants', () => {
  it('defines status lifecycle', () => {
    expect(NOTICING_STATUSES).toEqual(['draft', 'ready', 'surfaced', 'archived']);
  });

  it('allows only safe categories', () => {
    expect(ALLOWED_CATEGORIES).toContain('timing');
    expect(ALLOWED_CATEGORIES).toContain('creative');
    expect(ALLOWED_CATEGORIES).toContain('seasonal');
    expect(ALLOWED_CATEGORIES).not.toContain('behavioral');
  });

  it('blocks behavioral category', () => {
    expect(BLOCKED_CATEGORIES).toContain('behavioral');
  });

  it('enforces 90-day minimum observation window', () => {
    expect(MIN_OBSERVATION_WINDOW_DAYS).toBe(90);
  });
});

describe('validateNoticingCategory', () => {
  it('accepts allowed categories', () => {
    expect(validateNoticingCategory('timing')).toBe('timing');
    expect(validateNoticingCategory('creative')).toBe('creative');
    expect(validateNoticingCategory('seasonal')).toBe('seasonal');
  });

  it('rejects behavioral category', () => {
    expect(validateNoticingCategory('behavioral')).toBeNull();
  });

  it('rejects unknown categories', () => {
    expect(validateNoticingCategory('surveillance')).toBeNull();
    expect(validateNoticingCategory('')).toBeNull();
  });
});

describe('isValidStatusTransition', () => {
  it('allows draft → ready', () => {
    expect(isValidStatusTransition('draft', 'ready')).toBe(true);
  });

  it('allows ready → surfaced', () => {
    expect(isValidStatusTransition('ready', 'surfaced')).toBe(true);
  });

  it('allows surfaced → archived', () => {
    expect(isValidStatusTransition('surfaced', 'archived')).toBe(true);
  });

  it('allows draft → archived (skip)', () => {
    expect(isValidStatusTransition('draft', 'archived')).toBe(true);
  });

  it('rejects backward transitions', () => {
    expect(isValidStatusTransition('ready', 'draft')).toBe(false);
    expect(isValidStatusTransition('surfaced', 'ready')).toBe(false);
    expect(isValidStatusTransition('archived', 'draft')).toBe(false);
  });

  it('rejects same-state transition', () => {
    expect(isValidStatusTransition('draft', 'draft')).toBe(false);
  });
});

describe('canSurface', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  it('allows surfacing when ready and never surfaced', () => {
    expect(canSurface({
      status: 'ready',
      surfacedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
    }, now)).toBe(true);
  });

  it('blocks surfacing when already surfaced', () => {
    expect(canSurface({
      status: 'ready',
      surfacedAt: '2026-05-01T00:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
    }, now)).toBe(false);
  });

  it('blocks surfacing when not in ready status', () => {
    expect(canSurface({
      status: 'draft',
      surfacedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
    }, now)).toBe(false);
  });

  it('blocks surfacing when observation window too short', () => {
    expect(canSurface({
      status: 'ready',
      surfacedAt: null,
      createdAt: '2026-05-01T00:00:00Z', // only ~45 days ago
    }, now)).toBe(false);
  });
});
