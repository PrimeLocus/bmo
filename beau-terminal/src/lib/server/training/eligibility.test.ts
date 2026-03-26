import { describe, it, expect } from 'vitest';
import { classifyEligibility } from './eligibility.js';

describe('classifyEligibility', () => {
  // Consent scope
  it('classifies manual.prompt as user_content', () => {
    const result = classifyEligibility({ requestKind: 'manual.prompt', retrievedCollections: [] });
    expect(result.consentScope).toBe('user_content');
  });

  it('classifies thought.generate without private fragments as beau_output', () => {
    const result = classifyEligibility({ requestKind: 'thought.generate', retrievedCollections: ['beau_identity', 'beau_experience'] });
    expect(result.consentScope).toBe('beau_output');
  });

  it('classifies thought.generate with beau_private as mixed', () => {
    const result = classifyEligibility({ requestKind: 'thought.generate', retrievedCollections: ['beau_experience', 'beau_private'] });
    expect(result.consentScope).toBe('mixed');
  });

  // Privacy class
  it('private when beau_private fragment present', () => {
    const result = classifyEligibility({ requestKind: 'thought.generate', retrievedCollections: ['beau_private'] });
    expect(result.privacyClass).toBe('private');
  });

  it('trusted for user_content scope', () => {
    const result = classifyEligibility({ requestKind: 'manual.prompt', retrievedCollections: [] });
    expect(result.privacyClass).toBe('trusted');
  });

  it('public for beau_output without private', () => {
    const result = classifyEligibility({ requestKind: 'thought.generate', retrievedCollections: ['beau_identity'] });
    expect(result.privacyClass).toBe('public');
  });

  // Training eligibility
  it('never for private traces', () => {
    const result = classifyEligibility({ requestKind: 'thought.generate', retrievedCollections: ['beau_private'] });
    expect(result.trainingEligibility).toBe('never');
    expect(result.trainingEligibilityReason).toContain('private');
  });

  it('trainable_after_redaction for user_content', () => {
    const result = classifyEligibility({ requestKind: 'manual.prompt', retrievedCollections: [] });
    expect(result.trainingEligibility).toBe('trainable_after_redaction');
  });

  it('eval_only for beau_output by default', () => {
    const result = classifyEligibility({ requestKind: 'thought.generate', retrievedCollections: [] });
    expect(result.trainingEligibility).toBe('eval_only');
  });

  // Edge cases
  it('empty collections → beau_output / public / eval_only', () => {
    const result = classifyEligibility({ requestKind: 'thought.generate', retrievedCollections: [] });
    expect(result.consentScope).toBe('beau_output');
    expect(result.privacyClass).toBe('public');
    expect(result.trainingEligibility).toBe('eval_only');
  });

  it('mixed with private always → never', () => {
    const result = classifyEligibility({ requestKind: 'thought.generate', retrievedCollections: ['beau_experience', 'beau_private'] });
    expect(result.trainingEligibility).toBe('never');
  });
});
