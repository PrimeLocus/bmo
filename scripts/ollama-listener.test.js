import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildPrompt, parseSilence } from './ollama-listener.js';

const makeRequest = (overrides = {}) => ({
  id: 'test-id-1',
  type: 'observation',
  novelty: false,
  context: {
    environment: 'quiet room, late evening',
    momentum: 'curiosity: 0.7, wonder: 0.8',
    timeOfDay: 'late-night',
  },
  ...overrides,
});

describe('buildPrompt', () => {
  it('observation prompt includes environment and momentum', () => {
    const req = makeRequest({ type: 'observation' });
    const prompt = buildPrompt('observation', req);
    assert.ok(prompt.includes(req.context.environment), 'should include environment');
    assert.ok(prompt.includes(req.context.momentum), 'should include momentum');
  });

  it('reaction prompt includes momentum, environment, and timeOfDay', () => {
    const req = makeRequest({ type: 'reaction' });
    const prompt = buildPrompt('reaction', req);
    assert.ok(prompt.includes(req.context.momentum), 'should include momentum');
    assert.ok(prompt.includes(req.context.environment), 'should include environment');
    assert.ok(prompt.includes(req.context.timeOfDay), 'should include timeOfDay');
  });

  it('haiku prompt includes SILENCE instruction', () => {
    const req = makeRequest({ type: 'haiku' });
    const prompt = buildPrompt('haiku', req);
    assert.ok(prompt.includes('SILENCE'), 'should include SILENCE fallback instruction');
  });

  it('novelty=true returns the novelty prompt regardless of type', () => {
    const req = makeRequest({ type: 'observation', novelty: true });
    const prompt = buildPrompt('observation', req);
    assert.ok(prompt.includes('unprompted'), 'novelty prompt should mention unprompted thought');
    assert.ok(prompt.includes(req.context.momentum), 'novelty prompt should include momentum');
  });
});

describe('parseSilence', () => {
  it('returns null for exact SILENCE string', () => {
    assert.strictEqual(parseSilence('SILENCE'), null);
  });

  it('returns null for SILENCE with trailing newline', () => {
    assert.strictEqual(parseSilence('SILENCE\n'), null);
  });

  it('returns text for a real response', () => {
    assert.strictEqual(parseSilence('some real text'), 'some real text');
  });

  it('returns null for empty string', () => {
    assert.strictEqual(parseSilence(''), null);
  });

  it('returns null for whitespace-only string', () => {
    assert.strictEqual(parseSilence('  '), null);
  });
});
