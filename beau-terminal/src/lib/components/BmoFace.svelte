<script lang="ts">
  import { beauState } from '$lib/stores/beau.svelte.js';
  import { FACE_FRAMES } from '$lib/face/frames.js';
  import type { FaceRect, FaceText } from '$lib/face/frames.js';

  let { size = 'standard' }: { size?: 'mini' | 'standard' } = $props();

  // ── State ──────────────────────────────────────────────────────
  let currentRects = $state<FaceRect[]>([]);
  let currentTexts = $state<FaceText[]>([]);
  let frameIndex = $state(0);
  let transitioning = $state(false);
  let prevFaceState = $state(beauState.faceState);

  // ── Offline X-eyes ─────────────────────────────────────────────
  const OFFLINE_RECTS: FaceRect[] = [
    // Left eye X
    { x: 12, y: 12, w: 3, h: 3 }, { x: 19, y: 15, w: 3, h: 3 },
    { x: 15, y: 12, w: 3, h: 3 }, { x: 12, y: 15, w: 3, h: 3 },
    // Right eye X
    { x: 28, y: 12, w: 3, h: 3 }, { x: 35, y: 15, w: 3, h: 3 },
    { x: 31, y: 12, w: 3, h: 3 }, { x: 28, y: 15, w: 3, h: 3 },
  ];

  // ── Blink transition rects ────────────────────────────────────
  const BLINK_CLOSED: FaceRect[] = [
    { x: 12, y: 15, w: 10, h: 2 },
    { x: 28, y: 15, w: 10, h: 2 },
  ];
  const BLINK_HALF: FaceRect[] = [
    { x: 12, y: 14, w: 4, h: 3 },
    { x: 18, y: 14, w: 4, h: 3 },
    { x: 28, y: 14, w: 4, h: 3 },
    { x: 34, y: 14, w: 4, h: 3 },
  ];

  // ── Derived values ─────────────────────────────────────────────
  let px = $derived(size === 'mini' ? 24 : 120);
  let py = $derived(size === 'mini' ? 20 : 100);
  let bgColor = $derived(
    !beauState.online ? 'rgba(100, 110, 114, 0.06)' : 'rgba(0, 229, 160, 0.06)'
  );
  let glowColor = $derived(
    !beauState.online ? 'rgba(100, 110, 114, 0.15)' : beauState.glow.color
  );
  let glowAnim = $derived(
    !beauState.online ? 'none' : beauState.glow.animation
  );
  let glowDur = $derived(
    !beauState.online ? '0s' : beauState.glow.duration
  );

  // ── Helper: get timing from frame set ─────────────────────────
  function getTiming(timing: number | (() => number)): number {
    return typeof timing === 'function' ? timing() : timing;
  }

  // ── Helper: get first frame for a face state ──────────────────
  function getFirstFrame(faceState: string): { rects: FaceRect[]; texts: FaceText[] } {
    const frameSet = FACE_FRAMES[faceState as keyof typeof FACE_FRAMES];
    if (!frameSet) return { rects: [], texts: [] };
    return {
      rects: frameSet.frames[0] ?? [],
      texts: frameSet.textFrames?.[0] ?? [],
    };
  }

  // ── Animation loop effect (standard size only) ────────────────
  $effect(() => {
    // Don't run animation for mini size, offline, or during transitions
    if (size === 'mini' || !beauState.online || transitioning) return;

    const faceState = beauState.faceState;
    const frameSet = FACE_FRAMES[faceState as keyof typeof FACE_FRAMES];
    if (!frameSet) return;

    let idx = 0;
    let timer: ReturnType<typeof setTimeout>;

    function tick() {
      currentRects = frameSet.frames[idx] ?? [];
      currentTexts = frameSet.textFrames?.[idx] ?? [];
      frameIndex = idx;

      // Advance to next frame, or loop back / stop
      const nextIdx = idx + 1;
      if (nextIdx < frameSet.frames.length) {
        idx = nextIdx;
      } else if (frameSet.loop) {
        idx = 0;
      } else {
        // Non-looping: stay on last frame
        return;
      }

      timer = setTimeout(tick, getTiming(frameSet.timing));
    }

    tick();

    return () => {
      clearTimeout(timer);
    };
  });

  // ── Mini/offline static frame effect ──────────────────────────
  $effect(() => {
    if (!beauState.online) {
      currentRects = OFFLINE_RECTS;
      currentTexts = [];
      return;
    }

    if (size === 'mini') {
      const { rects, texts } = getFirstFrame(beauState.faceState);
      currentRects = rects;
      currentTexts = texts;
    }
  });

  // ── Blink transition effect ───────────────────────────────────
  $effect(() => {
    const newFaceState = beauState.faceState;

    // Only trigger when faceState actually changes, and only for standard size
    if (newFaceState === prevFaceState || size === 'mini') return;

    const fromSleepy = prevFaceState === 'sleepy';
    const toSleepy = newFaceState === 'sleepy';

    transitioning = true;

    // Get the mouth/nose from the first frame of the new state to pair with blink rects
    const newFrameSet = FACE_FRAMES[newFaceState as keyof typeof FACE_FRAMES];
    const newFirstFrame = newFrameSet?.frames[0] ?? [];

    // Extract non-eye elements from new frame (approx: y > 20 or opacity < 1)
    // For blink frames, we just show the blink eye rects alone for simplicity
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (fromSleepy) {
      // FROM sleepy: skip close steps, go straight to half-open in new expression
      currentRects = BLINK_HALF;
      currentTexts = [];
      timers.push(setTimeout(() => {
        // Open eyes in new expression
        if (toSleepy) {
          // sleepy to sleepy shouldn't happen, but handle gracefully
          const { rects, texts } = getFirstFrame(newFaceState);
          currentRects = rects;
          currentTexts = texts;
        } else {
          const { rects, texts } = getFirstFrame(newFaceState);
          currentRects = rects;
          currentTexts = texts;
        }
        transitioning = false;
        prevFaceState = newFaceState;
      }, 60));
    } else if (toSleepy) {
      // TO sleepy: close eyes, then stay closed (skip open steps)
      currentRects = BLINK_HALF;
      currentTexts = [];
      timers.push(setTimeout(() => {
        // Close eyes
        currentRects = BLINK_CLOSED;
        currentTexts = [];
        timers.push(setTimeout(() => {
          // Swap to sleepy first frame (already has closed eyes)
          const { rects, texts } = getFirstFrame(newFaceState);
          currentRects = rects;
          currentTexts = texts;
          transitioning = false;
          prevFaceState = newFaceState;
        }, 60));
      }, 60));
    } else {
      // Normal blink transition: half-close -> close -> swap -> half-open -> open
      currentRects = BLINK_HALF;
      currentTexts = [];
      timers.push(setTimeout(() => {
        // Close eyes
        currentRects = BLINK_CLOSED;
        currentTexts = [];
        timers.push(setTimeout(() => {
          // Swap to new state — show half-open with new expression context
          currentRects = BLINK_HALF;
          currentTexts = [];
          timers.push(setTimeout(() => {
            // Open eyes — show first frame of new expression
            const { rects, texts } = getFirstFrame(newFaceState);
            currentRects = rects;
            currentTexts = texts;
            timers.push(setTimeout(() => {
              transitioning = false;
              prevFaceState = newFaceState;
            }, 60));
          }, 60));
        }, 60));
      }, 60));
    }

    return () => {
      timers.forEach(clearTimeout);
    };
  });
</script>

<div
  class="bmo-face"
  class:mini={size === 'mini'}
  style="
    width: {px}px; height: {py}px;
    {size === 'mini'
      ? `border-left: 3px solid ${glowColor}`
      : `box-shadow: 0 0 18px ${glowColor}`};
    {size === 'standard' && glowAnim !== 'none'
      ? `animation: ${glowAnim} ${glowDur} ease-in-out infinite`
      : ''};
    background: {bgColor};
  "
  style:cursor={beauState.pendingThoughtType ? 'pointer' : 'default'}
  onclick={() => {
    if (beauState.pendingThoughtType) {
      window.dispatchEvent(new CustomEvent('bmo:thought-surface'));
    }
  }}
>
  {#if beauState.pendingThoughtType && beauState.glow?.overlay}
    <div
      class="glow-thought-overlay"
      style="box-shadow: 0 0 20px 6px {beauState.glow.overlay.color};
             animation: {beauState.glow.overlay.animation} {beauState.glow.overlay.duration} ease-in-out infinite;"
    ></div>
  {/if}
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

<style>
  .bmo-face {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    clip-path: polygon(10% 0%, 90% 0%, 100% 10%, 100% 90%, 90% 100%, 10% 100%, 0% 90%, 0% 10%);
    font-family: 'Courier New', Courier, monospace;
    flex-shrink: 0;
    transition: border-left-color 0.3s ease;
  }
  .bmo-face.mini {
    border-radius: 4px;
    clip-path: none;
  }
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
  @keyframes thoughtsteady {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; }
  }
  @keyframes thoughtpulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }
  @keyframes thoughtrhythm {
    0%, 100% { opacity: 0.4; transform: scale(1); }
    33% { opacity: 0.9; transform: scale(1.02); }
    66% { opacity: 0.6; transform: scale(0.99); }
  }
  .glow-thought-overlay {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    z-index: 1;
  }
</style>
