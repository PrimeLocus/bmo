import { describe, it, expect } from 'vitest';
import { parseSections, substitutePlaceholders, assemblePrompt } from './assembler.js';

const SAMPLE_PROMPT = `<!-- SECTION: CORE_IDENTITY -->
You are Beau. You live inside a physical BMO robot.

<!-- SECTION: SOUL_CODE -->
Your soul code: {{SOUL_CODE_HAIKU}}

<!-- SECTION: CONTEXT -->
<current_context>
  <mode>{{MODE}}</mode>
  <wake_word>{{WAKE_WORD}}</wake_word>
</current_context>

<!-- SECTION: DOCUMENTATION_PHILOSOPHY -->
This section is for implementers only.

<!-- SECTION: CLOSING -->
Now check your emotional_state and speak.`;

describe('parseSections', () => {
  it('splits prompt into named sections', () => {
    const sections = parseSections(SAMPLE_PROMPT);
    expect(Object.keys(sections)).toContain('CORE_IDENTITY');
    expect(Object.keys(sections)).toContain('SOUL_CODE');
    expect(Object.keys(sections)).toContain('CONTEXT');
    expect(Object.keys(sections)).toContain('DOCUMENTATION_PHILOSOPHY');
    expect(Object.keys(sections)).toContain('CLOSING');
  });

  it('preserves section content', () => {
    const sections = parseSections(SAMPLE_PROMPT);
    expect(sections['CORE_IDENTITY']).toContain('You are Beau');
  });
});

describe('substitutePlaceholders', () => {
  it('replaces known placeholders', () => {
    const result = substitutePlaceholders('Hello {{MODE}}', { MODE: 'witness' });
    expect(result).toBe('Hello witness');
  });

  it('applies fallback for missing placeholders', () => {
    const result = substitutePlaceholders('Soul: {{SOUL_CODE_HAIKU}}', {});
    expect(result).toBe('Soul: not yet written');
  });

  it('strips lines that become empty after placeholder substitution', () => {
    const result = substitutePlaceholders('Line1\n{{SEASONAL_CONTEXT}}\nLine3', {});
    expect(result).toBe('Line1\nLine3');
  });

  it('preserves intentional blank lines without placeholders', () => {
    const result = substitutePlaceholders('Line1\n\nLine3', {});
    expect(result).toBe('Line1\n\nLine3');
  });
});

describe('assemblePrompt', () => {
  it('omits DOCUMENTATION_PHILOSOPHY for all modes', () => {
    const result = assemblePrompt(SAMPLE_PROMPT, 'ambient', {});
    expect(result).not.toContain('implementers only');
  });

  it('includes CORE_IDENTITY for all modes', () => {
    const result = assemblePrompt(SAMPLE_PROMPT, 'ambient', {});
    expect(result).toContain('You are Beau');
  });

  it('substitutes placeholders with provided values', () => {
    const result = assemblePrompt(SAMPLE_PROMPT, 'collaborator', { MODE: 'collaborator' });
    expect(result).toContain('<mode>collaborator</mode>');
  });

  it('uses fallback for SOUL_CODE_HAIKU when not provided', () => {
    const result = assemblePrompt(SAMPLE_PROMPT, 'ambient', {});
    expect(result).toContain('not yet written');
  });
});
