<script lang="ts">
  import { beauState } from '$lib/stores/beau.svelte.js';
  import {
    FACE_FRAMES,
    BLINK_HALF,
    BLINK_CLOSED,
    OFFLINE_EYES,
  } from '$lib/face/frames.js';
  import type { FaceElement, FaceText } from '$lib/face/frames.js';

  let { size = 'standard' }: { size?: 'mini' | 'standard' } = $props();

  // ── State ──────────────────────────────────────────────────────
  let currentElements = $state<FaceElement[]>([]);
  let currentTexts = $state<FaceText[]>([]);
  let frameIndex = $state(0);
  let transitioning = $state(false);
  let prevFaceState = $state(beauState.faceState);

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
  function getFirstFrame(faceState: string): { elements: FaceElement[]; texts: FaceText[] } {
    const frameSet = FACE_FRAMES[faceState as keyof typeof FACE_FRAMES];
    if (!frameSet) return { elements: [], texts: [] };
    return {
      elements: frameSet.frames[0] ?? [],
      texts: frameSet.textFrames?.[0] ?? [],
    };
  }

  // ── Animation loop effect (standard size only) ────────────────
  $effect(() => {
    if (size === 'mini' || !beauState.online || transitioning) return;

    const faceState = beauState.faceState;
    const frameSet = FACE_FRAMES[faceState as keyof typeof FACE_FRAMES];
    if (!frameSet) return;

    let idx = 0;
    let timer: ReturnType<typeof setTimeout>;

    function tick() {
      currentElements = frameSet.frames[idx] ?? [];
      currentTexts = frameSet.textFrames?.[idx] ?? [];
      frameIndex = idx;

      const nextIdx = idx + 1;
      if (nextIdx < frameSet.frames.length) {
        idx = nextIdx;
      } else if (frameSet.loop) {
        idx = 0;
      } else {
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
      currentElements = OFFLINE_EYES;
      currentTexts = [];
      return;
    }

    if (size === 'mini') {
      const { elements, texts } = getFirstFrame(beauState.faceState);
      currentElements = elements;
      currentTexts = texts;
    }
  });

  // ── Blink transition effect ───────────────────────────────────
  $effect(() => {
    const newFaceState = beauState.faceState;

    if (newFaceState === prevFaceState || size === 'mini') return;

    const fromSleepy = prevFaceState === 'sleepy';
    const toSleepy = newFaceState === 'sleepy';

    transitioning = true;
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (fromSleepy) {
      currentElements = BLINK_HALF;
      currentTexts = [];
      timers.push(
        setTimeout(() => {
          const { elements, texts } = getFirstFrame(newFaceState);
          currentElements = elements;
          currentTexts = texts;
          transitioning = false;
          prevFaceState = newFaceState;
        }, 60)
      );
    } else if (toSleepy) {
      currentElements = BLINK_HALF;
      currentTexts = [];
      timers.push(
        setTimeout(() => {
          currentElements = BLINK_CLOSED;
          currentTexts = [];
          timers.push(
            setTimeout(() => {
              const { elements, texts } = getFirstFrame(newFaceState);
              currentElements = elements;
              currentTexts = texts;
              transitioning = false;
              prevFaceState = newFaceState;
            }, 60)
          );
        }, 60)
      );
    } else {
      currentElements = BLINK_HALF;
      currentTexts = [];
      timers.push(
        setTimeout(() => {
          currentElements = BLINK_CLOSED;
          currentTexts = [];
          timers.push(
            setTimeout(() => {
              currentElements = BLINK_HALF;
              currentTexts = [];
              timers.push(
                setTimeout(() => {
                  const { elements, texts } = getFirstFrame(newFaceState);
                  currentElements = elements;
                  currentTexts = texts;
                  timers.push(
                    setTimeout(() => {
                      transitioning = false;
                      prevFaceState = newFaceState;
                    }, 60)
                  );
                }, 60)
              );
            }, 60)
          );
        }, 60)
      );
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
  <svg viewBox="0 0 48 40" width={px} height={py}>
    {#each currentElements as el}
      {#if el.kind === 'circle'}
        <circle
          cx={el.cx}
          cy={el.cy}
          r={el.r}
          fill={el.fill ?? '#00e5a0'}
          opacity={el.opacity ?? 1}
        />
      {:else if el.kind === 'path'}
        <path
          d={el.d}
          fill={el.fill ?? 'none'}
          stroke={el.stroke ?? '#00e5a0'}
          stroke-width={el.strokeWidth ?? 1.5}
          stroke-linecap={el.strokeLinecap ?? 'round'}
          opacity={el.opacity ?? 1}
        />
      {:else}
        <rect
          x={el.x}
          y={el.y}
          width={el.w}
          height={el.h}
          fill={el.fill ?? '#00e5a0'}
          opacity={el.opacity ?? 1}
          rx={el.rx ?? 0.5}
        />
      {/if}
    {/each}
    {#each currentTexts as t}
      <text
        x={t.x}
        y={t.y}
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
    clip-path: polygon(
      10% 0%,
      90% 0%,
      100% 10%,
      100% 90%,
      90% 100%,
      10% 100%,
      0% 90%,
      0% 10%
    );
    font-family: 'Courier New', Courier, monospace;
    flex-shrink: 0;
    transition: border-left-color 0.3s ease;
  }
  .bmo-face.mini {
    border-radius: 4px;
    clip-path: none;
  }
  @keyframes slowpulse {
    0%,
    100% {
      opacity: 0.25;
    }
    50% {
      opacity: 0.5;
    }
  }
  @keyframes quickpulse {
    0%,
    100% {
      opacity: 0.3;
    }
    50% {
      opacity: 0.7;
    }
  }
  @keyframes gentleshimmer {
    0%,
    100% {
      opacity: 0.35;
    }
    50% {
      opacity: 0.6;
    }
  }
  @keyframes breathe {
    0%,
    100% {
      opacity: 0.08;
    }
    50% {
      opacity: 0.15;
    }
  }
  @keyframes intensepulse {
    0%,
    100% {
      opacity: 0.35;
    }
    50% {
      opacity: 0.65;
    }
  }
  @keyframes alertpulse {
    0%,
    100% {
      opacity: 0.25;
    }
    50% {
      opacity: 0.45;
    }
  }
  @keyframes listeningpulse {
    0%,
    100% {
      opacity: 0.3;
    }
    50% {
      opacity: 0.6;
    }
  }
  @keyframes thoughtsteady {
    0%,
    100% {
      opacity: 0.7;
    }
    50% {
      opacity: 1;
    }
  }
  @keyframes thoughtpulse {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 1;
    }
  }
  @keyframes thoughtrhythm {
    0%,
    100% {
      opacity: 0.4;
      transform: scale(1);
    }
    33% {
      opacity: 0.9;
      transform: scale(1.02);
    }
    66% {
      opacity: 0.6;
      transform: scale(0.99);
    }
  }
  .glow-thought-overlay {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    z-index: 1;
  }
</style>
