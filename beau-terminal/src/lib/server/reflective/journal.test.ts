import { describe, it, expect } from 'vitest';
import {
  CONSENT_EVENT_TYPES,
  CONSENT_COOKIE_NAME,
  VISIBILITY_LEVELS,
  validateVisibility,
  buildConsentEventValues,
} from './journal.js';

describe('journal constants', () => {
  it('exports valid consent event types', () => {
    expect(CONSENT_EVENT_TYPES).toContain('journal_unlocked');
    expect(CONSENT_EVENT_TYPES).toContain('journal_relocked');
    expect(CONSENT_EVENT_TYPES).toContain('journal_entry_viewed');
    expect(CONSENT_EVENT_TYPES).toContain('noticing_surfaced');
    expect(CONSENT_EVENT_TYPES).toContain('entry_deleted');
  });

  it('exports visibility levels', () => {
    expect(VISIBILITY_LEVELS).toContain('private');
    expect(VISIBILITY_LEVELS).toContain('shared');
  });
});

describe('validateVisibility', () => {
  it('accepts valid visibility levels', () => {
    expect(validateVisibility('private')).toBe('private');
    expect(validateVisibility('shared')).toBe('shared');
  });

  it('returns private for invalid input', () => {
    expect(validateVisibility('public')).toBe('private');
    expect(validateVisibility('')).toBe('private');
    expect(validateVisibility(undefined as any)).toBe('private');
  });
});

describe('buildConsentEventValues', () => {
  it('builds unlock event', () => {
    const values = buildConsentEventValues('journal_unlocked', { sessionToken: 'tok_abc' });
    expect(values.eventType).toBe('journal_unlocked');
    expect(values.sessionToken).toBe('tok_abc');
    expect(values.targetId).toBeUndefined();
  });

  it('builds entry viewed event with target', () => {
    const values = buildConsentEventValues('journal_entry_viewed', {
      targetId: 42,
      targetType: 'journal_entry',
      sessionToken: 'tok_abc',
    });
    expect(values.eventType).toBe('journal_entry_viewed');
    expect(values.targetId).toBe(42);
    expect(values.targetType).toBe('journal_entry');
  });

  it('builds delete event', () => {
    const values = buildConsentEventValues('entry_deleted', {
      targetId: 7,
      targetType: 'journal_entry',
      notes: 'user requested deletion',
    });
    expect(values.eventType).toBe('entry_deleted');
    expect(values.notes).toBe('user requested deletion');
  });

  it('rejects invalid event type', () => {
    expect(() => buildConsentEventValues('hacking' as any, {})).toThrow('Invalid consent event type');
  });
});

describe('CONSENT_COOKIE_NAME', () => {
  it('is a non-empty string', () => {
    expect(typeof CONSENT_COOKIE_NAME).toBe('string');
    expect(CONSENT_COOKIE_NAME.length).toBeGreaterThan(0);
  });
});
