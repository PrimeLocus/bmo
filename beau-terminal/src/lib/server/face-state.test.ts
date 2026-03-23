import { describe, it, expect } from 'vitest';
import { resolveFaceState, resolveGlow } from '$lib/server/face-state.js';
import type { FaceState } from '$lib/server/mqtt/topics.js';

// Minimal state shape needed by the resolver
function makeState(overrides: Record<string, unknown> = {}) {
  return {
    sleepState: 'awake',
    mode: 'ambient',
    personalityVector: { wonder: 0.5, reflection: 0.3, mischief: 0.3 },
    ...overrides,
  };
}

describe('resolveFaceState', () => {
  // Priority 1: Protective
  it('returns protective when stranger signal is active', () => {
    expect(resolveFaceState(makeState(), { securityStranger: true })).toBe('protective');
  });

  // Priority 2: Speaking overrides listening
  it('returns speaking when voice speaking is active', () => {
    expect(resolveFaceState(makeState(), { voiceSpeaking: true, voiceListening: true })).toBe('speaking');
  });

  // Priority 3: Listening
  it('returns listening when voice listening is active', () => {
    expect(resolveFaceState(makeState(), { voiceListening: true })).toBe('listening');
  });

  // Priority 4: Sleepy
  it('returns sleepy when sleep state is settling', () => {
    expect(resolveFaceState(makeState({ sleepState: 'settling' }), {})).toBe('sleepy');
  });

  it('returns sleepy when sleep state is asleep', () => {
    expect(resolveFaceState(makeState({ sleepState: 'asleep' }), {})).toBe('sleepy');
  });

  // Priority 5: Witness
  it('returns witness when mode is witness', () => {
    expect(resolveFaceState(makeState({ mode: 'witness' }), {})).toBe('witness');
  });

  // Priority 6: Thinking
  it('returns thinking when voice thinking is active', () => {
    expect(resolveFaceState(makeState(), { voiceThinking: true })).toBe('thinking');
  });

  // Priority 7a: Delighted
  it('returns delighted when wonder > 0.65', () => {
    expect(resolveFaceState(makeState({ personalityVector: { wonder: 0.7, reflection: 0.3, mischief: 0.3 } }), {})).toBe('delighted');
  });

  // Priority 7b: Mischievous
  it('returns mischievous when mischief > 0.55', () => {
    expect(resolveFaceState(makeState({ personalityVector: { wonder: 0.3, reflection: 0.3, mischief: 0.6 } }), {})).toBe('mischievous');
  });

  // Priority 7c: Unamused
  it('returns unamused when all vector dimensions < 0.25', () => {
    expect(resolveFaceState(makeState({ personalityVector: { wonder: 0.2, reflection: 0.2, mischief: 0.1 } }), {})).toBe('unamused');
  });

  // Priority 8: Idle fallback
  it('returns idle as fallback', () => {
    expect(resolveFaceState(makeState(), {})).toBe('idle');
  });

  // Priority ordering: higher priorities override lower
  it('protective overrides sleepy', () => {
    expect(resolveFaceState(makeState({ sleepState: 'asleep' }), { securityStranger: true })).toBe('protective');
  });

  it('sleepy overrides vector-based delighted', () => {
    expect(resolveFaceState(makeState({ sleepState: 'settling', personalityVector: { wonder: 0.8, reflection: 0.3, mischief: 0.3 } }), {})).toBe('sleepy');
  });

  // 7a beats 7b when both qualify
  it('delighted beats mischievous when both conditions met', () => {
    expect(resolveFaceState(makeState({ personalityVector: { wonder: 0.7, reflection: 0.1, mischief: 0.6 } }), {})).toBe('delighted');
  });

  // Document that 'waking' sleep state does NOT produce sleepy face
  it('waking sleep state falls through to vector/idle, not sleepy', () => {
    expect(resolveFaceState(makeState({ sleepState: 'waking' }), {})).toBe('idle');
  });
});

describe('resolveGlow', () => {
  it('returns correct glow for idle', () => {
    const glow = resolveGlow('idle');
    expect(glow.color).toContain('0, 229, 160');
    expect(glow.animation).toBe('slowpulse');
    expect(glow.duration).toBe('4s');
  });

  it('returns correct glow for protective (amber)', () => {
    const glow = resolveGlow('protective');
    expect(glow.color).toContain('255, 160, 60');
    expect(glow.animation).toBe('alertpulse');
  });

  it('returns correct glow for listening (blue-teal)', () => {
    const glow = resolveGlow('listening');
    expect(glow.color).toContain('0, 180, 230');
  });

  it('returns correct glow for mischievous (yellow-green)', () => {
    const glow = resolveGlow('mischievous');
    expect(glow.color).toContain('180, 255, 100');
  });

  it('returns glow for every face state', () => {
    const states: FaceState[] = ['idle', 'listening', 'thinking', 'speaking', 'delighted',
      'witness', 'sleepy', 'unamused', 'mischievous', 'protective'];
    for (const s of states) {
      const glow = resolveGlow(s);
      expect(typeof glow.color).toBe('string');
      expect(typeof glow.animation).toBe('string');
      expect(typeof glow.duration).toBe('string');
    }
  });
});
