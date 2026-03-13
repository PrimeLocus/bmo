<!-- src/lib/components/PanelCanvas.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount, setContext } from 'svelte';
  import { editModeState } from '$lib/stores/editMode.svelte.js';
  import {
    getPageLayout,
    loadPageLayout,
    savePageLayout,
    resetPageLayout,
    capturePositions,
    computeCanvasHeight,
    type PageLayout,
  } from '$lib/stores/layout.svelte.js';

  type Props = {
    pageId: string;
    columns?: number;
    children: Snippet;
  };

  const { pageId, columns = 2, children }: Props = $props();

  let canvasEl: HTMLDivElement | undefined = $state();
  let loaded = $state(false);

  // Reactive derivation: read layout from the store (re-evaluates when store updates)
  const layout = $derived(getPageLayout(pageId));
  const isFreeform = $derived(layout?.mode === 'freeform');
  const canvasHeight = $derived(layout ? computeCanvasHeight(layout) : 0);

  onMount(async () => {
    // Load from SQLite fallback if localStorage was empty
    await loadPageLayout(pageId);
    loaded = true;
  });

  /**
   * Called by Panel on first drag/resize when in grid mode.
   * Captures all panel DOM positions and transitions to freeform.
   */
  function ensureFreeform(): void {
    if (isFreeform || !canvasEl) return;
    const captured = capturePositions(canvasEl, layout);
    savePageLayout(pageId, captured);
  }

  function handleReset(): void {
    resetPageLayout(pageId);
  }

  // Provide context for child Panel components
  setContext('panel-canvas', {
    get pageId() { return pageId; },
    get canvasEl() { return canvasEl; },
    ensureFreeform,
  });
</script>

<div
  bind:this={canvasEl}
  class="panel-canvas"
  style="
    {isFreeform
      ? `position: relative; min-height: ${canvasHeight}px;`
      : `display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: 12px;`}
  "
>
  {@render children()}
</div>

{#if editModeState.active}
  <div class="flex justify-center mt-4">
    <button
      onclick={handleReset}
      class="text-xs tracking-widest px-4 py-2 border transition-all hover:opacity-80"
      style="border-color: var(--bmo-border); color: var(--bmo-muted); cursor: pointer"
    >
      RESET LAYOUT
    </button>
  </div>
{/if}
