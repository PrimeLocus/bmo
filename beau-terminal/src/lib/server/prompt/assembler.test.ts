import { describe, it, expect } from 'vitest';
import { parseSections, substitutePlaceholders, assemblePrompt, buildReflexPrompt } from './assembler.js';

const SAMPLE_PROMPT = `<!-- SECTION: CORE_IDENTITY -->
You are Beau. You live inside a physical BMO robot.

<!-- SECTION: SOUL_CODE -->
Your soul code: {{SOUL_CODE_HAIKU}}

<!-- SECTION: CONTEXT -->
<current_context>
  <mode>{{MODE}}</mode>
  <wake_word>{{WAKE_WORD}}</wake_word>
</current_context>

<!-- SECTION: VOICE_RULES -->
Short sentences. One thought, then breathe.

<!-- SECTION: MODE_PROTOCOL -->
Witness: You are watching a Resolume session. Say almost nothing.
Collaborator: Lean in. Throw connections.
Ambient: Be present, brief, warm.

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

describe('buildReflexPrompt', () => {
  it('includes only CORE_IDENTITY first paragraph, VOICE_RULES, CONTEXT, and current mode line', () => {
    const result = buildReflexPrompt(SAMPLE_PROMPT, 'witness', { MODE: 'witness' });
    expect(result).toContain('You are Beau');
    expect(result).toContain('Short sentences');
    expect(result).toContain('<mode>witness</mode>');
    expect(result).toContain('Resolume session');
    expect(result).not.toContain('implementers only');
    expect(result).not.toContain('soul code');
  });

  it('extracts only the matching mode line from MODE_PROTOCOL', () => {
    const result = buildReflexPrompt(SAMPLE_PROMPT, 'collaborator', {});
    expect(result).toContain('Lean in');
    expect(result).not.toContain('Resolume');
  });
});

describe('environment placeholders', () => {
  it('substitutes weather and lux placeholders', () => {
    const text = 'Weather: {{WEATHER_SUMMARY}}. Light: {{LUX_CONTEXT}}.';
    const result = substitutePlaceholders(text, {
      WEATHER_SUMMARY: 'overcast, 65°F',
      LUX_CONTEXT: 'dim, lamp only',
    });
    expect(result).toBe('Weather: overcast, 65°F. Light: dim, lamp only.');
  });

  it('uses fallbacks for missing environment placeholders', () => {
    const text = 'Sleep: {{SLEEP_STATE}}. Presence: {{PRESENCE_STATE}}.';
    const result = substitutePlaceholders(text, {});
    expect(result).toBe('Sleep: awake. Presence: unknown.');
  });
});
