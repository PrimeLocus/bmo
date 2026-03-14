<script lang="ts">
  import { beauState } from '$lib/stores/beau.svelte.js';

  let { size = 'standard' }: { size?: 'mini' | 'standard' } = $props();

  const EXPRESSIONS: Record<string, { left: string; right: string }> = {
    curious:        { left: 'O', right: 'o' },
    playful:        { left: '^', right: '^' },
    contemplative:  { left: '—', right: '—' },
    sleepy:         { left: 'u', right: 'u' },
    offline:        { left: 'x', right: 'x' },
  };

  // $derived.by for multi-statement logic (NOT $derived(() => ...) which is invalid in Svelte 5)
  let expression = $derived.by(() => {
    if (!beauState.online) return EXPRESSIONS.offline;
    return EXPRESSIONS[beauState.emotionalState] ?? EXPRESSIONS.curious;
  });

  let px = $derived(size === 'mini' ? 24 : 80);
</script>

<div
  class="bmo-face"
  style="width: {px}px; height: {px}px; font-size: {px * 0.22}px;"
>
  <span class="eye left">{expression.left}</span>
  <span class="dot">.</span>
  <span class="eye right">{expression.right}</span>
</div>

<style>
  .bmo-face {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.15em;
    background: var(--bmo-green);
    color: var(--bmo-bg);
    clip-path: polygon(10% 0%, 90% 0%, 100% 10%, 100% 90%, 90% 100%, 10% 100%, 0% 90%, 0% 10%);
    font-family: 'Courier New', Courier, monospace;
    font-weight: 700;
    transition: opacity 0.3s ease;
    flex-shrink: 0;
  }
  .dot {
    opacity: 0.6;
    font-size: 0.8em;
  }
</style>
