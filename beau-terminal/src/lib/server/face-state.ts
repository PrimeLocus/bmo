import type { FaceState } from './mqtt/topics.js';

// Interaction signal flags (set by MQTT handlers in bridge.ts)
export type InteractionSignals = {
  voiceListening?: boolean;
  voiceSpeaking?: boolean;
  voiceThinking?: boolean;
  securityStranger?: boolean;
};

// Minimal state shape consumed by the resolver
type FaceResolverState = {
  sleepState: string;
  mode: string;
  personalityVector: { wonder: number; reflection: number; mischief: number };
};

/**
 * Priority stack face state resolver.
 * Signals > sleep/mode > personality vector > idle fallback.
 */
export function resolveFaceState(state: FaceResolverState, signals: InteractionSignals): FaceState {
  // P1: Protective
  if (signals.securityStranger) return 'protective';
  // P2: Speaking
  if (signals.voiceSpeaking) return 'speaking';
  // P3: Listening
  if (signals.voiceListening) return 'listening';
  // P4: Sleepy
  if (state.sleepState === 'settling' || state.sleepState === 'asleep') return 'sleepy';
  // P5: Witness
  if (state.mode === 'witness') return 'witness';
  // P6: Thinking
  if (signals.voiceThinking) return 'thinking';
  // P7: Vector-driven (check in order: delighted > mischievous > unamused)
  const v = state.personalityVector;
  if (v.wonder > 0.65) return 'delighted';
  if (v.mischief > 0.55) return 'mischievous';
  if (v.wonder < 0.25 && v.reflection < 0.25 && v.mischief < 0.25) return 'unamused';
  // P8: Fallback
  return 'idle';
}

// Glow configuration per face state (bible section 50 LED mapping)
export const GLOW_CONFIG: Record<FaceState, { color: string; animation: string; duration: string }> = {
  idle:        { color: 'rgba(0, 229, 160, 0.25)',  animation: 'slowpulse',      duration: '4s' },
  listening:   { color: 'rgba(0, 180, 230, 0.35)',  animation: 'listeningpulse', duration: '1.5s' },
  thinking:    { color: 'rgba(0, 229, 160, 0.4)',   animation: 'intensepulse',   duration: '2s' },
  speaking:    { color: 'rgba(0, 229, 160, 0.35)',  animation: 'none',           duration: '0s' },
  delighted:   { color: 'rgba(100, 255, 180, 0.35)', animation: 'gentleshimmer', duration: '3s' },
  witness:     { color: 'rgba(0, 229, 160, 0.08)',  animation: 'breathe',        duration: '6s' },
  sleepy:      { color: 'rgba(0, 229, 160, 0.06)',  animation: 'none',           duration: '0s' },
  unamused:    { color: 'rgba(0, 229, 160, 0.15)',  animation: 'none',           duration: '0s' },
  mischievous: { color: 'rgba(180, 255, 100, 0.3)', animation: 'quickpulse',     duration: '2s' },
  protective:  { color: 'rgba(255, 160, 60, 0.3)',  animation: 'alertpulse',     duration: '2s' },
};

export function resolveGlow(faceState: FaceState): { color: string; animation: string; duration: string } {
  return GLOW_CONFIG[faceState];
}

// Thought overlay glow configs (additive, independent of face state)
export const THOUGHT_OVERLAY_CONFIG: Record<string, { color: string; animation: string; duration: string }> = {
  observation: { color: 'rgba(0, 229, 160, 0.15)',   animation: 'thoughtsteady',  duration: '3s' },
  reaction:    { color: 'rgba(255, 215, 0, 0.12)',    animation: 'thoughtpulse',   duration: '2.5s' },
  haiku:       { color: 'rgba(110, 198, 255, 0.15)',  animation: 'thoughtrhythm',  duration: '4s' },
};

export function resolveGlowWithOverlay(
  faceState: FaceState,
  thoughtType: string | null,
): { color: string; animation: string; duration: string; overlay?: { color: string; animation: string; duration: string } } {
  const base = GLOW_CONFIG[faceState];
  if (!thoughtType || !(thoughtType in THOUGHT_OVERLAY_CONFIG)) {
    return base;
  }
  return { ...base, overlay: THOUGHT_OVERLAY_CONFIG[thoughtType] };
}
