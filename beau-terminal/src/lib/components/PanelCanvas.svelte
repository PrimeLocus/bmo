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
    updatePanelPreview,
    togglePanelVisibility,
    isPanelHidden,
    type GridLayout,
    type GridPosition,
    GRID_COLS,
    DEFAULT_ROW_HEIGHT,
  } from '$lib/stores/layout.svelte.js';
  import { applyMove, compact } from '$lib/stores/gridEngine.js';

  type Props = {
    pageId: string;
    columns?: number;
    rowHeight?: number;
    children: Snippet;
  };

  const { pageId, columns = GRID_COLS, rowHeight = DEFAULT_ROW_HEIGHT, children }: Props = $props();

  let canvasEl: HTMLDivElement | undefined = $state();
  const layout = $derived(getPageLayout(pageId));

  // Drag state — managed here so pointer events stay on the canvas
  let draggingId: string | null = $state(null);
  let ghostPos: GridPosition | null = $state(null);
  let dragStartCol = 0;
  let dragStartRow = 0;
  let dragOffsetCol = 0;
  let dragOffsetRow = 0;

  // Panel defaults collected from children
  const defaults: Record<string, GridPosition> = {};

  // Panel registry — panelId → display label
  let panelRegistry = $state<Map<string, string>>(new Map());

  function registerDefault(id: string, pos: GridPosition) {
    defaults[id] = pos;
  }

  function registerPanel(id: string, label: string) {
    panelRegistry = new Map(panelRegistry).set(id, label);
  }

  /** Build a fresh layout from collected defaults, then compact */
  function buildFromDefaults(): GridLayout {
    return { panels: compact({ ...defaults }) };
  }

  onMount(async () => {
    const loaded = await loadPageLayout(pageId);
    if (!loaded) {
      // No saved layout or old pixel layout — build from defaults
      // Wait a tick for all panels to register their defaults
      requestAnimationFrame(() => {
        if (!getPageLayout(pageId)) {
          const fresh = buildFromDefaults();
          savePageLayout(pageId, fresh);
        }
      });
    }
  });

  // ── Drag coordination ──

  function cellFromPointer(e: PointerEvent): { col: number; row: number } {
    if (!canvasEl) return { col: 0, row: 0 };
    const rect = canvasEl.getBoundingClientRect();
    const gap = 8; // matches --grid-gap
    const totalWidth = rect.width;
    const cellWidth = (totalWidth - gap * (columns - 1)) / columns;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top + canvasEl.scrollTop;
    const col = Math.max(0, Math.min(columns - 1, Math.floor(x / (cellWidth + gap))));
    const row = Math.max(0, Math.floor(y / (rowHeight + gap)));
    return { col, row };
  }

  function onDragStart(panelId: string, e: PointerEvent) {
    if (!canvasEl || !layout) return;
    const pos = layout.panels[panelId];
    if (!pos) return;
    draggingId = panelId;
    const cell = cellFromPointer(e);
    dragOffsetCol = cell.col - pos.col;
    dragOffsetRow = cell.row - pos.row;
    dragStartCol = pos.col;
    dragStartRow = pos.row;
    ghostPos = { ...pos };
    canvasEl.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!draggingId || !layout) return;
    const cell = cellFromPointer(e);
    const pos = layout.panels[draggingId];
    if (!pos) return;
    const targetCol = Math.max(0, Math.min(columns - pos.colSpan, cell.col - dragOffsetCol));
    const targetRow = Math.max(0, cell.row - dragOffsetRow);
    ghostPos = { ...pos, col: targetCol, row: targetRow };
  }

  function handlePointerUp(e: PointerEvent) {
    if (!draggingId || !ghostPos || !layout) {
      draggingId = null;
      ghostPos = null;
      return;
    }
    const newPanels = applyMove(layout.panels, draggingId, ghostPos);
    savePageLayout(pageId, { ...layout, panels: newPanels });
    draggingId = null;
    ghostPos = null;
  }

  function handlePointerCancel(e: PointerEvent) {
    draggingId = null;
    ghostPos = null;
  }

  // ── Resize coordination (called from Panel) ──

  function onResizeCommit(panelId: string, proposed: GridPosition) {
    if (!layout) return;
    const newPanels = applyMove(layout.panels, panelId, proposed);
    savePageLayout(pageId, { ...layout, panels: newPanels });
  }

  function onResizePreview(panelId: string, partial: Partial<GridPosition>) {
    updatePanelPreview(pageId, panelId, partial);
  }

  function handleReset(): void {
    resetPageLayout(pageId);
    // Rebuild from defaults after reset
    requestAnimationFrame(() => {
      const fresh = buildFromDefaults();
      savePageLayout(pageId, fresh);
    });
  }

  function handleTogglePanel(panelId: string) {
    togglePanelVisibility(pageId, panelId);
  }

  // Panel visibility drawer state
  let showPanelDrawer = $state(false);

  // Derive drawer items reactively — tracks _layouts changes for hiddenPanels
  const drawerItems = $derived(
    [...panelRegistry.entries()].map(([id, label]) => ({
      id, label, hidden: isPanelHidden(pageId, id),
    }))
  );

  // Provide context for child Panel components
  setContext('panel-canvas', {
    get pageId() { return pageId; },
    get canvasEl() { return canvasEl; },
    get columns() { return columns; },
    get rowHeight() { return rowHeight; },
    get draggingId() { return draggingId; },
    registerDefault,
    registerPanel,
    onDragStart,
    onResizeCommit,
    onResizePreview,
  });

  // Compute grid-lines background for edit mode
  const gridLinesBg = $derived(
    `repeating-linear-gradient(90deg, transparent 0, transparent calc((100% - ${columns - 1} * 8px) / ${columns}), rgba(0, 229, 160, 0.08) calc((100% - ${columns - 1} * 8px) / ${columns}), rgba(0, 229, 160, 0.08) calc((100% - ${columns - 1} * 8px) / ${columns} + 8px))`
  );
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={canvasEl}
  class="panel-canvas"
  style="
    display: grid;
    grid-template-columns: repeat({columns}, 1fr);
    grid-auto-rows: {rowHeight}px;
    gap: 8px;
    position: relative;
    {editModeState.active ? `background-image: ${gridLinesBg}; min-height: 80vh; padding-bottom: 320px;` : ''}
  "
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerCancel}
>
  {@render children()}

  <!-- Ghost placeholder during drag -->
  {#if ghostPos && draggingId}
    <div
      class="pointer-events-none"
      style="
        grid-column: {ghostPos.col + 1} / span {ghostPos.colSpan};
        grid-row: {ghostPos.row + 1} / span {ghostPos.rowSpan};
        border: 2px dashed var(--ghost-border);
        background: var(--ghost-bg);
        border-radius: 2px;
        z-index: 40;
      "
    ></div>
  {/if}
</div>

{#if editModeState.active}
  <div class="flex items-center justify-center gap-3 mt-4">
    {#if panelRegistry.size > 1}
      <button
        onclick={() => showPanelDrawer = !showPanelDrawer}
        class="text-xs tracking-widest px-4 py-2 border transition-all hover:opacity-80"
        style="border-color: {showPanelDrawer ? 'var(--bmo-green)' : 'var(--bmo-border)'}; color: {showPanelDrawer ? 'var(--bmo-green)' : 'var(--bmo-muted)'}; cursor: pointer"
      >
        PANELS
      </button>
    {/if}
    <button
      onclick={handleReset}
      class="text-xs tracking-widest px-4 py-2 border transition-all hover:opacity-80"
      style="border-color: var(--bmo-border); color: var(--bmo-muted); cursor: pointer"
    >
      RESET LAYOUT
    </button>
  </div>

  {#if showPanelDrawer && panelRegistry.size > 1}
    <div class="mt-3 p-3 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-2" style="color: var(--bmo-muted)">PANEL VISIBILITY</div>
      <div class="flex flex-wrap gap-2">
        {#each drawerItems as item (item.id)}
          <button
            onclick={() => handleTogglePanel(item.id)}
            class="text-xs px-3 py-1.5 border transition-all hover:opacity-80"
            style="
              border-color: {item.hidden ? 'var(--bmo-border)' : 'var(--bmo-green)'};
              color: {item.hidden ? 'var(--bmo-muted)' : 'var(--bmo-green)'};
              opacity: {item.hidden ? '0.5' : '1'};
              text-decoration: {item.hidden ? 'line-through' : 'none'};
              cursor: pointer;
            "
          >
            {item.hidden ? '○' : '●'} {item.label}
          </button>
        {/each}
      </div>
    </div>
  {/if}
{/if}
