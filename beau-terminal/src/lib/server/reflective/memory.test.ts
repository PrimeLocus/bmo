import { describe, it, expect } from 'vitest';
import { getRetrievalPolicy, MEMORY_SOURCES } from './memory.js';

describe('MEMORY_SOURCES', () => {
  it('lists all available memory sources', () => {
    expect(MEMORY_SOURCES).toContain('journal');
    expect(MEMORY_SOURCES).toContain('haikus');
    expect(MEMORY_SOURCES).toContain('dispatches');
    expect(MEMORY_SOURCES).toContain('environment');
    expect(MEMORY_SOURCES).toContain('sessions');
    expect(MEMORY_SOURCES).toContain('noticings');
  });
});

describe('getRetrievalPolicy', () => {
  it('ambient mode includes broad shallow sources', () => {
    const policy = getRetrievalPolicy('ambient', {});
    expect(policy.sources).toContain('haikus');
    expect(policy.sources).toContain('environment');
    expect(policy.maxDepth).toBe('shallow');
  });

  it('witness mode includes sessions and environment', () => {
    const policy = getRetrievalPolicy('witness', {});
    expect(policy.sources).toContain('sessions');
    expect(policy.sources).toContain('environment');
  });

  it('collaborator mode includes dispatches and journal', () => {
    const policy = getRetrievalPolicy('collaborator', {});
    expect(policy.sources).toContain('dispatches');
    expect(policy.sources).toContain('journal');
    expect(policy.maxDepth).toBe('deep');
  });

  it('archivist mode includes all sources at deep depth', () => {
    const policy = getRetrievalPolicy('archivist', {});
    expect(policy.sources.length).toBe(MEMORY_SOURCES.length);
    expect(policy.maxDepth).toBe('deep');
  });

  it('never includes journal in social mode', () => {
    const policy = getRetrievalPolicy('social', {});
    expect(policy.sources).not.toContain('journal');
  });

  it('returns shallow depth for unknown modes', () => {
    const policy = getRetrievalPolicy('unknown-mode', {});
    expect(policy.maxDepth).toBe('shallow');
  });

  it('accepts optional context overrides', () => {
    const policy = getRetrievalPolicy('ambient', { maxResults: 10 });
    expect(policy.maxResults).toBe(10);
  });

  it('has default maxResults', () => {
    const policy = getRetrievalPolicy('ambient', {});
    expect(policy.maxResults).toBeGreaterThan(0);
  });
});
