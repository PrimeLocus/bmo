# Face States & Expression — Design Spec

**Sub-project:** #2 of 8 (Bible Alignment)
**Depends on:** Sub-project #1 (Personality Engine) — merged
**Bible sections:** §49 (Face States & BmoFace), §50 (LED Expression System)
**Date:** 2026-03-23

---

## Summary

Rewrite `BmoFace.svelte` from a 5-expression text-character face into an animated pixel-art
SVG face with 10 canon face states, LED glow borders, animation frames, and blink transitions.
The face state is resolved server-side in the bridge from a priority stack of interaction
signals, sleep/mode state, and the personality vector. The deprecated `emotionalState` field
is replaced by `faceState` and `glowColor` on BeauState.

---

## Rendering Approach

**Hybrid SVG with pixel-forward aesthetic.** All face geometry uses SVG `<rect>` elements
to create a blocky, retro pixel-display feel. Eyes are 2×3 or 3×4 pixel blocks. Mouths are
stepped rectangles. No smooth curves — everything reads as a low-res game console display.
The SVG container provides resolution independence and CSS animation support.

Each face state is defined as a set of named frames (arrays of rect definitions). The
component cycles through frames using `setTimeout` with per-state timing. Transitions
between states use a blink animation: eyes close → swap expression → eyes reopen.

---

## Face States

10 canon face states from bible §49, each with pixel geometry, LED glow color, and
animation behavior:

### 1. Idle (default)
- **Eyes:** Simple 2×3 pixel blocks, standard position
- **Mouth:** Gentle stepped smile (5 rects ascending/descending)
- **Animation:** Blink every 3–5s — half-close (60ms) → close (120ms) → half-open (60ms) → open
- **Glow:** Cool dim teal `rgba(0, 229, 160)`, slow pulse (4s cycle)

### 2. Listening
- **Eyes:** Wider, 3×4 blocks (snap wide on trigger, settle to attentive)
- **Mouth:** Small muted dash — quiet attentiveness
- **Animation:** Eyes snap wide on wake word, settle to intermediate size over ~2s (3 frames: alert → settling → attentive)
- **Glow:** Blue-teal `rgba(0, 180, 230)`, attentive pulse (1.5s cycle)
- **Trigger:** `beau/voice/listening` MQTT topic or prompt console manual trigger

### 3. Thinking
- **Eyes:** Asymmetric — one eye normal height, other shifted up. Both drift between positions
- **Mouth:** Small off-center cluster (3 rects), shifts side to side
- **Animation:** Eyes drift left → up → right → up (~1s per position, slight random jitter)
- **Glow:** Brighter teal `rgba(0, 229, 160)`, intensity pulse (2s cycle, higher opacity)
- **Trigger:** `beau/voice/thinking` MQTT topic (LLM processing)

### 4. Speaking
- **Eyes:** Standard 2×3 blocks, engaged
- **Mouth:** 3-frame cycle: closed (flat line) → half-open (small gap with sides) → open (larger gap with dark interior)
- **Animation:** ~200ms per frame, cycles closed → half → open → half. Will sync to TTS audio amplitude in future
- **Glow:** Steady teal `rgba(0, 229, 160)`, no pulse animation
- **Trigger:** `beau/voice/speaking` MQTT topic or prompt console manual trigger

### 5. Delighted
- **Eyes:** Wide open, 3×4 blocks spanning full width. Subtle sparkle pixels nearby
- **Mouth:** Large stepped smile (wider than idle)
- **Animation:** Gentle 1–2px vertical bounce (500ms cycle). Sparkle pixels blink in/out at varying positions and opacities
- **Glow:** Warm green-white `rgba(100, 255, 180)`, gentle shimmer (3s cycle, moderate opacity)
- **Trigger:** wonder > 0.65 in personality vector

### 6. Witness
- **Eyes:** Half-lidded, narrow 2×1.5 blocks with muted lid bars above
- **Mouth:** Neutral muted line
- **Decoration:** Tiny camera icon (muted) above eyes
- **Animation:** Nearly still. Camera icon faintly pulses opacity (3s cycle). Presence, not performance
- **Glow:** Nearly invisible teal `rgba(0, 229, 160, 0.08)`, slow breathe (6s cycle)
- **Trigger:** `mode === 'witness'`

### 7. Sleepy
- **Eyes:** Horizontal lines (closed), muted opacity
- **Mouth:** Tiny muted dash
- **Decoration:** `z z z` text characters floating up-right, decreasing size and opacity
- **Animation:** z positions drift upward across frames (2s/frame). Eyes transition through droopy → closing → closed
- **Glow:** Barely there `rgba(0, 229, 160, 0.06)`, no animation
- **Trigger:** `sleepState === 'settling' || sleepState === 'asleep'`

### 8. Unamused
- **Eyes:** Half-closed — flat top bar + lower block (like `-_-`)
- **Mouth:** Flat horizontal line
- **Animation:** Static — transition-in only via blink swap
- **Glow:** Dim static teal `rgba(0, 229, 160, 0.15)`, no animation
- **Trigger:** All vector dimensions < 0.25

### 9. Mischievous
- **Eyes:** Asymmetric — left squinted (knowing), right wider (engaged)
- **Brow:** Right eyebrow dramatically raised (3-step staircase upward), left brow neutral/muted
- **Mouth:** Asymmetric smirk curling up on right side
- **Animation:** Brow raises higher then settles (~600ms jittered). Smirk twitches up/down
- **Glow:** Warm yellow-green `rgba(180, 255, 100)`, quick pulse (2s cycle)
- **Trigger:** mischief > 0.55 in personality vector

### 10. Protective
- **Eyes:** Wider than normal, slightly narrowed — alert, not angry
- **Brow:** Slight inward angle — determined, not furious
- **Mouth:** Firm set line, muted corner pixels suggesting downward set
- **Animation:** Static — transition-in only via blink swap
- **Glow:** Amber `rgba(255, 160, 60)`, alert pulse (2s cycle)
- **Trigger:** `beau/security/stranger` MQTT topic or manual trigger

---

## Face State Priority Stack

The bridge resolves `faceState` using a priority stack. Highest-priority active trigger wins:

| Priority | Face State | Source |
|----------|------------|--------|
| 1 | Protective | `beau/security/stranger` MQTT |
| 2 | Speaking | `beau/voice/speaking` MQTT |
| 3 | Listening | `beau/voice/listening` MQTT |
| 4 | Sleepy | `sleepState === 'settling' \|\| 'asleep'` |
| 5 | Witness | `mode === 'witness'` |
| 6 | Thinking | `beau/voice/thinking` MQTT |
| 7a | Delighted | `personalityVector.wonder > 0.65` |
| 7b | Mischievous | `personalityVector.mischief > 0.55` |
| 7c | Unamused | all vector dimensions < 0.25 |
| 8 | Idle | fallback |

When multiple priority-7 conditions are true simultaneously, check in order: Delighted →
Mischievous → Unamused. First match wins.

---

## Transition Behavior

When `faceState` changes, the component performs a **blink transition**:

1. Eyes animate to half-closed (60ms)
2. Eyes animate to fully closed (60ms)
3. Swap internal expression data to new face state (instant, invisible behind closed eyes)
4. Eyes animate to half-open in new expression (60ms)
5. Eyes animate to fully open in new expression (60ms)

Total transition: ~240ms. This hides any visual jank from swapping SVG rects and gives BMO
a natural, organic feel — the mood shifts behind a blink.

If the target state is Sleepy, skip steps 4–5 (eyes stay closed, transition is ~120ms).
If transitioning FROM Sleepy, skip steps 1–2 and start at step 4 (eyes open into new
expression, transition is ~120ms).

---

## Data Flow

```
MQTT signals + personality vector + sleep/mode state
        ↓
  bridge.ts (server-side)
  — resolveFaceState(): priority stack → faceState string
  — resolveGlowColor(): faceState → { color, animation } object
  — adds faceState + glowColor to BeauState
        ↓
  SSE broadcast to all clients
        ↓
  beauState $state store (client-side)
        ↓
  BmoFace.svelte
  — reads beauState.faceState + beauState.glowColor
  — selects frame set from FACE_FRAMES map
  — applies glow as box-shadow + CSS animation on wrapper
  — manages blink transitions via $effect watching faceState
```

### BeauState Additions

```typescript
// FaceState union type (defined in topics.ts, matching existing pattern)
export const FACE_STATES = ['idle', 'listening', 'thinking', 'speaking', 'delighted',
  'witness', 'sleepy', 'unamused', 'mischievous', 'protective'] as const;
export type FaceState = (typeof FACE_STATES)[number];

// New fields on BeauState
faceState: FaceState;      // resolved face state from priority stack
glow: {                    // LED glow config (single object, always set together)
  color: string;           // CSS rgba string for box-shadow
  animation: string;       // CSS animation name or 'none'
  duration: string;        // CSS duration: '4s' | '2s' | etc.
};
```

Default values for `beau.svelte.ts`:
```typescript
faceState: 'idle',
glow: { color: 'rgba(0, 229, 160, 0.25)', animation: 'slowpulse', duration: '4s' },
```

### New MQTT Topics

```typescript
// Interaction signal topics (stubs — will be published by voice pipeline later)
'beau/voice/listening'    // payload: '1' or '0'
'beau/voice/speaking'     // payload: '1' or '0'
'beau/voice/thinking'     // payload: '1' or '0'
'beau/security/stranger'  // payload: '1' or '0'
```

These are consumed by the bridge to set boolean flags on internal state, which feed the
face state priority stack. They can also be triggered manually via the prompt console.

### Deprecation & Migration Checklist

`emotionalState` remains on BeauState for backward compatibility but is no longer the
primary driver of face rendering. `faceState` replaces it. The `vectorToEmotionalState()`
function in the bridge remains but is marked deprecated.

**Consumers of `emotionalState` — migration plan:**

| File | Current usage | Action in this sub-project |
|------|--------------|---------------------------|
| `BmoFace.svelte` | Drives expression lookup | **Migrate** — rewrite reads `faceState` |
| `StatusBar.svelte` (line 51) | Displays `STATE: {emotionalState}` | **Migrate** — switch to `faceState` |
| `+page.svelte` (line 121) | Home dashboard display | **Migrate** — switch to `faceState` with `FACE_STATE_LABELS` |
| `sitrep.ts` (line 106) | Writes `Emotion: {emotionalState}` | **Migrate** — switch to `faceState` |
| `BeauVitalsWidget.svelte` (line 36) | Shows `EMOTION_LABELS[emotionalState]` | **Migrate** — switch to `FACE_STATE_LABELS[faceState]` |
| `EmotionWidget.svelte` (line 10) | Shows `EMOTION_LABELS[emotionalState]` | **Migrate** — switch to `FACE_STATE_LABELS[faceState]` |

A `FACE_STATE_LABELS` map is added to `beau.svelte.ts` alongside the existing label maps:
```typescript
export const FACE_STATE_LABELS: Record<string, string> = {
  idle: 'Idle', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking',
  delighted: 'Delighted', witness: 'Witness', sleepy: 'Sleepy',
  unamused: 'Unamused', mischievous: 'Mischievous', protective: 'Protective',
};
```

---

## Component Architecture

### BmoFace.svelte

Complete rewrite. The component:

1. **Props:** `size: 'mini' | 'standard'` (mini for StatusBar, standard for widget/dashboard)
2. **Frame data:** Static `FACE_FRAMES` map keyed by face state name. Each entry contains an array of frame definitions (rect coordinate arrays). Frames are defined in a separate `face-frames.ts` module for testability.
3. **Animation loop:** `$effect` starts/stops per-state animation timer. Each state has its own tick function and timing. Timer cleanup on state change or unmount.
4. **Transition:** `$effect` watching `beauState.faceState` triggers blink transition. During transition, animation loop is paused, blink sequence runs, then new state's animation starts.
5. **Glow:** Wrapper div applies `box-shadow` from `beauState.glow.color` and CSS animation from `beauState.glow.animation` + `beauState.glow.duration`.
6. **SVG rendering:** Reactive `$state` holds the current frame's rect array. Template renders via `{#each}` blocks inside the SVG. 200ms updates are well within Svelte 5's reactive rendering budget for ~20-40 SVG rects.

### face-frames.ts

New module: `src/lib/face/frames.ts`

Exports:
- `FACE_FRAMES`: `Record<FaceState, FaceFrameSet>` — frame data for all 10 states (client-only, used by BmoFace)
- Types: `FaceFrame`, `FaceFrameSet`

### face-state.ts (server-side)

New module: `src/lib/server/face-state.ts`

Exports:
- `resolveFaceState()` — priority stack evaluation
- `GLOW_CONFIG`: `Record<FaceState, { color: string; animation: string; duration: string }>` — glow config per state
- `resolveGlow()` — looks up glow config for a face state

This keeps the glow config server-side (where it's consumed by the bridge) and the frame
geometry client-side (where it's consumed by BmoFace). The `FaceState` type is shared via
`topics.ts`.

Each `FaceFrameSet` contains:
- `frames`: array of `FaceFrame` (each is an array of rect definitions `{ x, y, w, h, opacity? }`)
- `timing`: interval in ms between frames (or function returning jittered interval)
- `loop`: boolean (true for continuous animation like Speaking, false for one-shot like Listening)

### Bridge changes (bridge.ts)

Imports `resolveFaceState()` and `resolveGlow()` from `src/lib/server/face-state.ts`.

New internal state fields for interaction signals:
- `voiceListening: boolean`
- `voiceSpeaking: boolean`
- `voiceThinking: boolean`
- `securityStranger: boolean`

New MQTT subscriptions for the four interaction signal topics. Each sets the corresponding
boolean flag and triggers a face state re-evaluation + broadcast.

The `onVectorChange` callback now also calls `resolveFaceState()` and `resolveGlow()` to
include the resolved `faceState` and `glow` object in the broadcast state.

### StatusBar changes

Replace `emotionalState.toUpperCase()` display with `faceState.toUpperCase()`. The STATE
label now reflects the resolved face state rather than the deprecated emotional state mapping.

### MQTT topics.ts changes

Add the four new interaction signal topic constants under a new `voice` and `security`
namespace.

---

## Prompt Console Integration

The prompt console page (`/prompt`) already publishes arbitrary MQTT messages. The four new
interaction signal topics can be triggered manually:

- Publish `beau/voice/listening` with payload `1` to enter Listening state
- Publish `beau/voice/listening` with payload `0` to exit
- Same pattern for speaking, thinking, stranger

This provides testing capability before the voice pipeline exists on the Pi.

No changes needed to the prompt console — it already supports free-form topic/payload publishing.

---

## Sizes

The `size` prop controls the SVG viewBox scaling:

| Size | Use case | Dimensions | Notes |
|------|----------|-----------|-------|
| `mini` | StatusBar inline | 24×20px | Simplified — fewer rects, no animation, glow as border-left color |
| `standard` | BmoFaceWidget, dashboard | 120×100px | Full animation, full glow border |

The `mini` size renders a simplified static expression (no animation timer) to avoid
performance overhead in the StatusBar which renders on every page. It shows the face state
via a colored left-border accent matching the glow color.

### Offline Handling

When `beauState.online === false`, the component renders independently of the server-resolved
`faceState`: eyes show as `x x` (crossed out), glow is grey `rgba(100, 110, 114, 0.15)`,
no animation. This matches the current offline behavior and is handled entirely in the
component — the bridge does not resolve a face state when offline.

---

## File Changes

### New files
- `src/lib/face/frames.ts` — frame data, types (client-side)
- `src/lib/server/face-state.ts` — face state resolver, glow config (server-side)

### Modified files
- `src/lib/components/BmoFace.svelte` — complete rewrite
- `src/lib/server/mqtt/bridge.ts` — wire face state resolver, interaction signal subscriptions, new BeauState fields
- `src/lib/server/mqtt/topics.ts` — add voice/security topic constants, `FACE_STATES` + `FaceState` type
- `src/lib/stores/beau.svelte.ts` — add faceState, glow defaults, `FACE_STATE_LABELS` map
- `src/lib/components/StatusBar.svelte` — switch from emotionalState to faceState display
- `src/routes/+page.svelte` — switch emotionalState display to faceState
- `src/lib/server/sitrep.ts` — switch emotionalState to faceState in export
- `src/lib/widgets/terminal/BeauVitalsWidget.svelte` — switch to FACE_STATE_LABELS
- `src/lib/widgets/terminal/EmotionWidget.svelte` — switch to FACE_STATE_LABELS

### Unchanged
- `src/lib/widgets/registry.ts` — BmoFaceWidget already exists, no changes needed
- `src/lib/server/personality/` — no changes, engine output consumed as-is

---

## Out of Scope

- Physical Pi Pygame face renderer (separate sub-project, consumes same faceState data)
- WS2812B LED ring driver (hardware, separate sub-project)
- TTS audio waveform sync for Speaking mouth (requires voice pipeline)
- LLM-driven face state overrides (deferred to brain routing sub-project)
- Face customization / user-defined expressions
- Sound effects on state transitions (bible §52, separate sub-project)

---

## Testing Strategy

- **face-frames.ts:** Unit tests — verify all 10 states have valid frame data, correct rect counts, valid timing values
- **resolveFaceState():** Unit tests — verify priority stack ordering with combinations of signals, sleep states, modes, and vector values
- **resolveGlowColor():** Unit tests — verify each face state maps to expected color/animation/duration
- **BmoFace.svelte:** Manual visual testing via the terminal — verify all 10 expressions render correctly, transitions blink properly, glow colors match
- **Integration:** Verify MQTT interaction signals toggle face states via prompt console, verify SSE broadcasts include faceState/glowColor fields

---

*This spec is sub-project #2 of the Bible Alignment initiative. Sub-project #1
(Personality Engine) is merged. See `docs/bible/SESSION-CONTEXT.md` for the full
decomposition into 8 sub-projects.*
