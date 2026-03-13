import { describe, it, expect } from 'vitest';
import * as schema from '$lib/server/db/schema.js';

describe('Phase 4 schema tables', () => {
  it('exports journalEntries table', () => {
    expect(schema.journalEntries).toBeDefined();
  });

  it('exports noticings table', () => {
    expect(schema.noticings).toBeDefined();
  });

  it('exports consentEvents table', () => {
    expect(schema.consentEvents).toBeDefined();
  });

  it('journalEntries has required columns', () => {
    const cols = Object.keys(schema.journalEntries);
    expect(cols).toContain('id');
    expect(cols).toContain('body');
    expect(cols).toContain('visibility');
    expect(cols).toContain('surfacedAt');
  });

  it('noticings has status and category columns', () => {
    const cols = Object.keys(schema.noticings);
    expect(cols).toContain('status');
    expect(cols).toContain('category');
    expect(cols).toContain('surfacedAt');
  });

  it('consentEvents has event_type and target columns', () => {
    const cols = Object.keys(schema.consentEvents);
    expect(cols).toContain('eventType');
    expect(cols).toContain('targetId');
    expect(cols).toContain('targetType');
  });
});
