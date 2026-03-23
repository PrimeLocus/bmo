# Face States & Expression Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite BmoFace from a 5-expression text-character face into an animated 10-state pixel-art SVG face with LED glow borders, driven by a server-side priority stack resolver.

**Architecture:** Face state resolved server-side in bridge.ts via priority stack (interaction signals > sleep/mode > personality vector > idle fallback). Broadcast as `faceState` + `glow` on BeauState via SSE. BmoFace.svelte renders pixel-art SVG frames reactively using Svelte 5 `$state` + `{#each}`. Blink transitions between states.

**Tech Stack:** SvelteKit 2 / Svelte 5 (runes), TypeScript, MQTT.js, SSE

**Spec:** `docs/superpowers/specs/2026-03-23-face-states-expression-design.md`

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `src/lib/server/face-state.ts` | `resolveFaceState()` priority stack, `GLOW_CONFIG`, `resolveGlow()` |
| `src/lib/face/frames.ts` | `FACE_FRAMES` rect data for all 10 states, `FaceFrameSet` types |
| `src/lib/server/face-state.test.ts` | Unit tests for `resolveFaceState()` and `resolveGlow()` |
| `src/lib/face/frames.test.ts` | Unit tests for frame data integrity |

### Modified files
| File | Changes |
|------|---------|
| `src/lib/server/mqtt/topics.ts` | Add `FACE_STATES` const + `FaceState` type, voice/security MQTT topics, update `SUBSCRIBE_TOPICS` |
| `src/lib/server/mqtt/bridge.ts` | Add `faceState` + `glow` to `BeauState`, interaction signal booleans, wire `resolveFaceState()` into vector change + MQTT handlers |
| `src/lib/stores/beau.svelte.ts` | Add `faceState`, `glow` defaults, `FACE_STATE_LABELS` map |
| `src/lib/components/BmoFace.svelte` | Complete rewrite — pixel-art SVG, animation loops, blink transitions, glow border |
| `src/lib/components/StatusBar.svelte` | Switch `emotionalState` → `faceState` |
| `src/routes/+page.svelte` | Switch `emotionalState` → `faceState` |
| `src/lib/server/sitrep.ts` | Switch `emotionalState` → `faceState` |
| `src/lib/widgets/terminal/BeauVitalsWidget.svelte` | Switch `EMOTION_LABELS` → `FACE_STATE_LABELS` |
| `src/lib/widgets/terminal/EmotionWidget.svelte` | Switch `EMOTION_LABELS` → `FACE_STATE_LABELS` |

All paths below are relative to `beau-terminal/`.

---

## Task 1: MQTT Topics & FaceState Type

**Files:**
- Modify: `src/lib/server/mqtt/topics.ts`

- [ ] **Step 1: Add FaceState type and interaction signal topics**

Add to end of type unions section (after line 102):

```typescript
export const FACE_STATES = [
  'idle', 'listening', 'thinking', 'speaking', 'delighted',
  'witness', 'sleepy', 'unamused', 'mischievous', 'protective',
] as const;
export type FaceState = (typeof FACE_STATES)[number];
```

Add new topic namespaces inside the `TOPICS` object (after the `personality` block, before `} as const`):

```typescript
  voice: {
    listening: 'beau/voice/listening',
    speaking: 'beau/voice/speaking',
    thinking: 'beau/voice/thinking',
  },
  security: {
    stranger: 'beau/security/stranger',
  },
```

Add new topics to `SUBSCRIBE_TOPICS` array (after the wellness block):

```typescript
  // Face state — interaction signals
  TOPICS.voice.listening,
  TOPICS.voice.speaking,
  TOPICS.voice.thinking,
  TOPICS.security.stranger,
```

- [ ] **Step 2: Verify no type errors**

Run: `cd beau-terminal && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors (existing ones are fine)

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/mqtt/topics.ts
git commit -m "feat(face): add FaceState type and interaction signal MQTT topics"
```

---

## Task 2: Face State Resolver (Server-Side)

**Files:**
- Create: `src/lib/server/face-state.ts`
- Create: `src/lib/server/face-state.test.ts`

- [ ] **Step 1: Write failing tests for resolveFaceState()**

Create `src/lib/server/face-state.test.ts`:

```typescript
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

  // Document that 'waking' sleep state does NOT produce sleepy face
  it('waking sleep state falls through to vector/idle, not sleepy', () => {
    expect(resolveFaceState(makeState({ sleepState: 'waking' }), {})).toBe('idle');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/face-state.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found

- [ ] **Step 3: Implement face-state.ts**

Create `src/lib/server/face-state.ts`:

```typescript
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

// Glow configuration per face state (bible §50 LED mapping)
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/face-state.test.ts 2>&1 | tail -10`
Expected: All 16 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/face-state.ts src/lib/server/face-state.test.ts
git commit -m "feat(face): face state priority stack resolver + glow config with tests"
```

---

## Task 3: Wire Face State Into Bridge & BeauState

**Files:**
- Modify: `src/lib/server/mqtt/bridge.ts`
- Modify: `src/lib/stores/beau.svelte.ts`

- [ ] **Step 1: Add faceState and glow to BeauState type and defaults**

In `bridge.ts`, add to the `BeauState` type (after the personality engine fields, before the closing `}`):

```typescript
  // ── Face State ──
  faceState: string;
  glow: { color: string; animation: string; duration: string };
```

Add to `DEFAULT_STATE` (after `signalSources: []`):

```typescript
  // ── Face State ──
  faceState: 'idle',
  glow: { color: 'rgba(0, 229, 160, 0.25)', animation: 'slowpulse', duration: '4s' },
```

- [ ] **Step 2: Add interaction signal state and MQTT handlers in bridge.ts**

Add import at top of bridge.ts:

```typescript
import { resolveFaceState, resolveGlow } from '../face-state.js';
import type { InteractionSignals } from '../face-state.js';
```

Inside the `connectMQTT` function, after the personality engine setup block (around line 370), add:

```typescript
  // ── Face State — interaction signal tracking ──
  const interactionSignals: InteractionSignals = {
    voiceListening: false,
    voiceSpeaking: false,
    voiceThinking: false,
    securityStranger: false,
  };

  function updateFaceState() {
    const faceState = resolveFaceState(state, interactionSignals);
    const glow = resolveGlow(faceState);
    state = { ...state, faceState, glow };
    // Note: do NOT call broadcast() here — the MQTT message handler's
    // existing broadcast() at the end of the switch handles it.
    // For personality engine calls, broadcast() is called after state assignment.
  }
```

In the `client.on('message')` switch statement, add cases for the four new topics (before the default/closing):

```typescript
      case TOPICS.voice.listening:
        interactionSignals.voiceListening = msg === '1';
        updateFaceState();
        break;
      case TOPICS.voice.speaking:
        interactionSignals.voiceSpeaking = msg === '1';
        updateFaceState();
        break;
      case TOPICS.voice.thinking:
        interactionSignals.voiceThinking = msg === '1';
        updateFaceState();
        break;
      case TOPICS.security.stranger:
        interactionSignals.securityStranger = msg === '1';
        updateFaceState();
        break;
```

- [ ] **Step 3: Wire face state into personality engine callback**

In the `personalityEngine.onVectorChange` callback (around line 424–438), add face state resolution to the state update. Replace the existing state assignment block with:

```typescript
    const faceState = resolveFaceState(
      { ...state, mode: derivedMode, personalityVector: vector },
      interactionSignals
    );
    const glow = resolveGlow(faceState);

    state = {
      ...state,
      personalityVector: vector,
      personalityInterpretation: personalityEngine.getInterpretation(),
      signalLayer: personalityEngine.getSignalLayer(),
      momentumLayer: personalityEngine.getMomentumLayer(),
      signalSources: snap?.sources ?? state.signalSources,
      mode: derivedMode,
      emotionalState: vectorToEmotionalState(vector),
      faceState,
      glow,
    };
    broadcast();
```

- [ ] **Step 4: Update client store defaults**

In `src/lib/stores/beau.svelte.ts`, add to `defaultState` (after `signalSources: []`):

```typescript
  // ── Face State ──
  faceState: 'idle',
  glow: { color: 'rgba(0, 229, 160, 0.25)', animation: 'slowpulse', duration: '4s' },
```

Add `FACE_STATE_LABELS` export (after the existing `EMOTION_LABELS`):

```typescript
export const FACE_STATE_LABELS: Record<string, string> = {
  idle: 'Idle',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  delighted: 'Delighted',
  witness: 'Witness',
  sleepy: 'Sleepy',
  unamused: 'Unamused',
  mischievous: 'Mischievous',
  protective: 'Protective',
};
```

- [ ] **Step 5: Verify no type errors**

Run: `cd beau-terminal && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/mqtt/bridge.ts src/lib/stores/beau.svelte.ts
git commit -m "feat(face): wire face state resolver into bridge + BeauState"
```

---

## Task 4: Migrate emotionalState Consumers

**Files:**
- Modify: `src/lib/components/StatusBar.svelte`
- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/server/sitrep.ts`
- Modify: `src/lib/widgets/terminal/BeauVitalsWidget.svelte`
- Modify: `src/lib/widgets/terminal/EmotionWidget.svelte`

- [ ] **Step 1: Migrate StatusBar.svelte**

Replace line 51:
```svelte
    STATE: <span style="color: var(--bmo-text)">{beauState.emotionalState.toUpperCase()}</span>
```
with:
```svelte
    STATE: <span style="color: var(--bmo-text)">{beauState.faceState.toUpperCase()}</span>
```

- [ ] **Step 2: Migrate +page.svelte**

Replace line 121:
```svelte
      {beauState.mode ?? '—'} · {beauState.emotionalState ?? '—'}
```
with:
```svelte
      {beauState.mode ?? '—'} · {beauState.faceState ?? '—'}
```

- [ ] **Step 3: Migrate sitrep.ts**

Replace line 106:
```typescript
	lines.push(`- **Emotion:** ${state.emotionalState}`);
```
with:
```typescript
	lines.push(`- **Expression:** ${state.faceState}`);
```

- [ ] **Step 4: Migrate EmotionWidget.svelte**

Replace import on line 2:
```typescript
	import { beauState, EMOTION_LABELS } from '$lib/stores/beau.svelte.js';
```
with:
```typescript
	import { beauState, FACE_STATE_LABELS } from '$lib/stores/beau.svelte.js';
```

Replace line 10:
```svelte
		{(EMOTION_LABELS[beauState.emotionalState] ?? beauState.emotionalState).toUpperCase()}
```
with:
```svelte
		{(FACE_STATE_LABELS[beauState.faceState] ?? beauState.faceState).toUpperCase()}
```

- [ ] **Step 5: Migrate BeauVitalsWidget.svelte**

Replace import on line 2:
```typescript
	import { beauState, SLEEP_LABELS, MODE_LABELS, EMOTION_LABELS, PRESENCE_LABELS } from '$lib/stores/beau.svelte.js';
```
with:
```typescript
	import { beauState, SLEEP_LABELS, MODE_LABELS, FACE_STATE_LABELS, PRESENCE_LABELS } from '$lib/stores/beau.svelte.js';
```

Replace line 36:
```svelte
			<span class="vitals-value">{(EMOTION_LABELS[beauState.emotionalState] ?? beauState.emotionalState).toUpperCase()}</span>
```
with:
```svelte
			<span class="vitals-value">{(FACE_STATE_LABELS[beauState.faceState] ?? beauState.faceState).toUpperCase()}</span>
```

- [ ] **Step 6: Verify dev server starts cleanly**

Run: `cd beau-terminal && npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/StatusBar.svelte src/routes/+page.svelte src/lib/server/sitrep.ts src/lib/widgets/terminal/EmotionWidget.svelte src/lib/widgets/terminal/BeauVitalsWidget.svelte
git commit -m "refactor(face): migrate all emotionalState consumers to faceState"
```

---

## Task 5: Face Frame Data

**Files:**
- Create: `src/lib/face/frames.ts`
- Create: `src/lib/face/frames.test.ts`

- [ ] **Step 1: Write failing tests for frame data integrity**

Create `src/lib/face/frames.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { FACE_FRAMES } from '$lib/face/frames.js';
import { FACE_STATES } from '$lib/server/mqtt/topics.js';
import type { FaceState } from '$lib/server/mqtt/topics.js';

describe('FACE_FRAMES', () => {
  it('has frames for every face state', () => {
    for (const state of FACE_STATES) {
      expect(FACE_FRAMES[state], `missing frames for ${state}`).toBeDefined();
    }
  });

  it('each state has at least one frame', () => {
    for (const state of FACE_STATES) {
      expect(FACE_FRAMES[state].frames.length, `${state} has no frames`).toBeGreaterThan(0);
    }
  });

  it('each frame has at least one rect', () => {
    for (const state of FACE_STATES) {
      for (const frame of FACE_FRAMES[state].frames) {
        expect(frame.length, `${state} has empty frame`).toBeGreaterThan(0);
      }
    }
  });

  it('each rect has valid x, y, w, h numbers', () => {
    for (const state of FACE_STATES) {
      for (const frame of FACE_FRAMES[state].frames) {
        for (const rect of frame) {
          expect(typeof rect.x).toBe('number');
          expect(typeof rect.y).toBe('number');
          expect(typeof rect.w).toBe('number');
          expect(typeof rect.h).toBe('number');
          expect(rect.w).toBeGreaterThan(0);
          expect(rect.h).toBeGreaterThan(0);
        }
      }
    }
  });

  it('each state has a positive timing value', () => {
    for (const state of FACE_STATES) {
      const t = FACE_FRAMES[state].timing;
      expect(typeof t === 'number' ? t : t(), `${state} has bad timing`).toBeGreaterThan(0);
    }
  });

  it('animated states have multiple frames', () => {
    const animated: FaceState[] = ['idle', 'listening', 'thinking', 'speaking', 'delighted', 'sleepy', 'mischievous'];
    for (const state of animated) {
      expect(FACE_FRAMES[state].frames.length, `${state} should be animated`).toBeGreaterThan(1);
    }
  });

  it('static states can have single frames', () => {
    const staticStates: FaceState[] = ['unamused', 'protective'];
    for (const state of staticStates) {
      expect(FACE_FRAMES[state].frames.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('sleepy state has textFrames for z characters', () => {
    const sleepy = FACE_FRAMES.sleepy;
    expect(sleepy.textFrames, 'sleepy must have textFrames for z z z').toBeDefined();
    expect(sleepy.textFrames!.length).toBeGreaterThan(0);
    for (const tf of sleepy.textFrames!) {
      expect(tf.length).toBeGreaterThan(0);
      for (const t of tf) {
        expect(t.text).toBe('z');
        expect(typeof t.x).toBe('number');
        expect(typeof t.y).toBe('number');
        expect(typeof t.size).toBe('number');
        expect(typeof t.opacity).toBe('number');
      }
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/face/frames.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found

- [ ] **Step 3: Implement frames.ts**

Create directory: `mkdir -p src/lib/face`

Create `src/lib/face/frames.ts`. This is the largest file — it contains all pixel-art rect coordinate data for 10 face states.

The rect type and frame set structure:

```typescript
export type FaceRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  opacity?: number;     // default 1.0
  fill?: string;        // default '#00e5a0' (bmo-green), use '#0a0f0d' for dark interior
};

export type FaceFrameSet = {
  frames: FaceRect[][];
  timing: number | (() => number);  // ms between frames, or function for jitter
  loop: boolean;
};

// Text elements for sleepy z's (rendered separately from rects)
export type FaceText = {
  x: number;
  y: number;
  size: number;
  text: string;
  opacity: number;
};

export type FaceFrameSetWithText = FaceFrameSet & {
  textFrames?: FaceText[][];
};
```

Then define `FACE_FRAMES` as a `Record<FaceState, FaceFrameSetWithText>` with all 10 states. Each state's rect coordinates come from the approved mockups in the brainstorm session. Key states:

**Idle** — 4 frames: open, half-close, blink (closed), half-open. Timing: function returning 3000–5000ms for open frame, 60ms for transitions, 120ms for closed.

**Listening** — 3 frames: alert (wide eyes), settling, attentive. Timing: 800ms, 1200ms, 2000ms. Loop true.

**Thinking** — 4 frames: look-left, look-up, look-right, look-up. Timing: function returning 900–1300ms. Loop true.

**Speaking** — 4 frames: closed mouth, half-open, open, half-open. Timing: function returning 180–260ms. Loop true.

**Delighted** — 4 frames: up position (no sparkles), up+sparklesA, down+sparklesB, down (no sparkles). Timing: 500ms. Loop true.

**Witness** — 2 frames: camera bright, camera dim. Timing: 3000ms. Loop true.

**Sleepy** — 3 frames with text: drowsy eyes + z set 1, closing eyes + z set 2, closed eyes + z set 3. Timing: 2000ms. Loop true.

**Unamused** — 1 frame: half-closed eyes, flat mouth. Timing: 1000ms. Loop false.

**Mischievous** — 3 frames: brow-up + smirk-up, hold, brow-settle + smirk-down. Timing: function returning 600–900ms. Loop true.

**Protective** — 1 frame: alert eyes, firm brows, set mouth. Timing: 1000ms. Loop false.

The actual rect coordinates should match the validated mockups. Use the viewBox `0 0 48 40` coordinate space. Each rect is `{ x, y, w, h }` with optional `opacity` and `fill`.

**IMPORTANT:** The implementor must translate the exact SVG rect coordinates from the brainstorm mockups (`E:/Dev/BMO/.superpowers/brainstorm/face-states-1774243487/all-faces-v3.html` for static, `animated-faces.html` for animated) into the FaceRect arrays. Do NOT invent new coordinates — use the mockup values.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/face/frames.test.ts 2>&1 | tail -10`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/face/frames.ts src/lib/face/frames.test.ts
git commit -m "feat(face): pixel-art frame data for all 10 face states"
```

---

## Task 6: BmoFace Component Rewrite

**Files:**
- Modify: `src/lib/components/BmoFace.svelte`

This is the largest single task. The component is a complete rewrite.

- [ ] **Step 1: Rewrite BmoFace.svelte**

Replace the entire file with a Svelte 5 component that:

1. **Props:** `size: 'mini' | 'standard'` (default `'standard'`)

2. **Imports:**
```typescript
import { beauState } from '$lib/stores/beau.svelte.js';
import { FACE_FRAMES } from '$lib/face/frames.js';
import type { FaceRect, FaceText } from '$lib/face/frames.js';
```

3. **State:**
```typescript
let currentRects = $state<FaceRect[]>([]);
let currentTexts = $state<FaceText[]>([]);
let frameIndex = $state(0);
let transitioning = $state(false);
let prevFaceState = $state(beauState.faceState);
```

4. **Animation loop** — `$effect` that starts a `setTimeout`-based loop for the current face state. Gets the frame set from `FACE_FRAMES[beauState.faceState]`, cycles through frames updating `currentRects` and `currentTexts`. Cleans up timer on state change via effect cleanup.

5. **Blink transition** — `$effect` watching `beauState.faceState`. When it changes (and `prevFaceState !== beauState.faceState`):
   - Set `transitioning = true`
   - Run blink sequence: half-close (60ms) → close (60ms) → swap frame set → half-open (60ms) → open (60ms)
   - Set `transitioning = false`, update `prevFaceState`
   - Special cases: to-sleepy skips open steps; from-sleepy skips close steps
   - Use dedicated blink frames: closed eyes = horizontal bars, half-closed = shorter blocks

6. **Mini size** — when `size === 'mini'`, render a simplified version: no animation timer, show first frame only, glow as border-left color instead of box-shadow. Reduces DOM weight for StatusBar.

7. **Offline override** — when `!beauState.online`, show crossed-out eyes (`x x` pixel pattern), grey glow `rgba(100, 110, 114, 0.15)`, no animation.

8. **Template:**
```svelte
<div
  class="bmo-face"
  class:mini={size === 'mini'}
  style="
    width: {px}px; height: {py}px;
    {size === 'mini'
      ? `border-left: 3px solid ${beauState.online ? beauState.glow.color : 'rgba(100,110,114,0.15)'}`
      : `box-shadow: 0 0 18px ${beauState.online ? beauState.glow.color : 'rgba(100,110,114,0.15)'}`};
    {size === 'standard' && beauState.glow.animation !== 'none'
      ? `animation: ${beauState.glow.animation} ${beauState.glow.duration} ease-in-out infinite`
      : ''};
    background: {bgColor};
  "
>
  <svg viewBox="0 0 48 40" width={px} height={py} style="image-rendering: pixelated;">
    {#each currentRects as rect}
      <rect
        x={rect.x} y={rect.y}
        width={rect.w} height={rect.h}
        fill={rect.fill ?? '#00e5a0'}
        opacity={rect.opacity ?? 1}
        rx="0.5"
      />
    {/each}
    {#each currentTexts as t}
      <text
        x={t.x} y={t.y}
        font-family="'Courier New', monospace"
        font-size={t.size}
        font-weight="700"
        fill="#00e5a0"
        opacity={t.opacity}
      >{t.text}</text>
    {/each}
  </svg>
</div>
```

9. **Styles** — retain the octagonal `clip-path`, add CSS `@keyframes` for all glow animations:

```css
@keyframes slowpulse {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.5; }
}
@keyframes quickpulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.7; }
}
@keyframes gentleshimmer {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.6; }
}
@keyframes breathe {
  0%, 100% { opacity: 0.08; }
  50% { opacity: 0.15; }
}
@keyframes intensepulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.65; }
}
@keyframes alertpulse {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.45; }
}
@keyframes listeningpulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
}
```

10. **Derived values:**
```typescript
let px = $derived(size === 'mini' ? 24 : 120);
let py = $derived(size === 'mini' ? 20 : 100);
let bgColor = $derived(
  !beauState.online ? 'rgba(100, 110, 114, 0.06)' : 'rgba(0, 229, 160, 0.06)'
);
```

- [ ] **Step 2: Verify dev server starts and face renders**

Run: `cd beau-terminal && npm run dev &` then open http://localhost:4242
Expected: BMO face renders in StatusBar (mini) and BmoFaceWidget (standard) with idle expression, glow border, blinking animation

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/BmoFace.svelte
git commit -m "feat(face): BmoFace rewrite — pixel-art SVG, 10 states, glow, blink transitions"
```

---

## Task 7: Integration Verification & Cleanup

- [ ] **Step 1: Run all existing tests**

Run: `cd beau-terminal && npx vitest run 2>&1 | tail -20`
Expected: All tests pass (including new face-state and face-frames tests)

- [ ] **Step 2: Verify build succeeds**

Run: `cd beau-terminal && npm run build 2>&1 | tail -5`
Expected: Build completes successfully

- [ ] **Step 3: Manual smoke test checklist**

Start dev server (`npm run dev`) and verify:

1. Dashboard (`/`) — shows faceState instead of emotionalState under the BMO face
2. StatusBar — shows `STATE: IDLE` (not old emotional states)
3. Nav sidebar — mini BmoFace has glow border-left color matching face state
4. BmoFaceWidget — standard face renders with idle blink animation + teal glow
4. Prompt console (`/prompt`) — publish `beau/voice/speaking` with payload `1`:
   - Face switches to speaking (blink transition, mouth cycling)
   - StatusBar shows `STATE: SPEAKING`
   - Publish payload `0` to return to idle
5. Publish `beau/security/stranger` with `1` — face goes protective (amber glow, alert eyes)
6. Sitrep export — shows `Expression: idle` (not old "Emotion" label)
7. BeauVitalsWidget — shows `FEELING: IDLE` via FACE_STATE_LABELS
8. EmotionWidget — shows `IDLE` via FACE_STATE_LABELS

- [ ] **Step 4: Commit any fixes from smoke test**

```bash
git add -A
git commit -m "fix(face): smoke test fixes"
```

(Skip this step if no fixes needed.)

- [ ] **Step 5: Final commit — update CLAUDE.md**

Update the BmoFace entry in CLAUDE.md's "Key Files" and component descriptions to reflect the rewrite. Update the `emotionalState` references to mention `faceState`. Add `src/lib/face/frames.ts` and `src/lib/server/face-state.ts` to the key files list.

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for face states rewrite"
```

---

## Summary

| Task | Description | Est. files | Dependencies |
|------|------------|-----------|-------------|
| 1 | MQTT topics + FaceState type | 1 modified | None |
| 2 | Face state resolver + tests | 2 created | Task 1 |
| 3 | Wire into bridge + store | 2 modified | Task 2 |
| 4 | Migrate emotionalState consumers | 5 modified | Task 3 |
| 5 | Face frame data + tests | 2 created | Task 1 |
| 6 | BmoFace component rewrite | 1 modified | Tasks 3, 5 |
| 7 | Integration verification | 1 modified | All above |

Tasks 2 and 5 are independent of each other and can run in parallel.
Tasks 4 and 5 are independent of each other and can run in parallel after Task 3.
