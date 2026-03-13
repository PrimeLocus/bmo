<!-- src/lib/components/Panel.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { getContext, onMount } from 'svelte';
  import { editModeState } from '$lib/stores/editMode.svelte.js';
  import {
    getPageLayout,
    updatePanelPosition,
    isPanelHidden,
    type GridPosition,
    GRID_COLS,
    MIN_COL_SPAN,
    MIN_ROW_SPAN,
  } from '$lib/stores/layout.svelte.js';

  type Props = {
    id: string;
    defaultPosition: GridPosition;
    label?: string;
    children: Snippet;
  };

  const { id, defaultPosition, label, children }: Props = $props();

  const ctx = getContext<{
    pageId: string;
    canvasEl: HTMLDivElement | undefined;
    columns: number;
    rowHeight: number;
    draggingId: string | null;
    registerDefault: (id: string, pos: GridPosition) => void;
    registerPanel: (id: string, label: string) => void;
    onDragStart: (id: string, e: PointerEvent) => void;
    onResizeCommit: (id: string, proposed: GridPosition) => void;
    onResizePreview: (id: string, partial: Partial<GridPosition>) => void;
  }>('panel-canvas');

  // Register default + panel metadata on mount
  onMount(() => {
    ctx.registerDefault(id, defaultPosition);
    ctx.registerPanel(id, label ?? id);
  });

  const hidden = $derived(isPanelHidden(ctx.pageId, id));

  const editing = $derived(editModeState.active);
  const layout = $derived(getPageLayout(ctx.pageId));
  const position = $derived(layout?.panels[id] ?? defaultPosition);
  const fontSize = $derived(position.fontSize);
  const isDragging = $derived(ctx.draggingId === id);

  // ── Per-panel font size ──
  function adjustFontSize(delta: number) {
    const current = fontSize ?? 20;
    const next = Math.min(40, Math.max(10, current + delta));
    updatePanelPosition(ctx.pageId, id, { fontSize: next });
  }

  // ── Drag — delegate to PanelCanvas ──
  function handleDragStart(e: PointerEvent) {
    if (!editing) return;
    e.preventDefault();
    ctx.onDragStart(id, e);
  }

  // ── Resize — local to Panel ──
  let resizing = $state(false);
  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeOrigColSpan = 0;
  let resizeOrigRowSpan = 0;

  function handleResizeStart(e: PointerEvent) {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    resizing = true;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    resizeOrigColSpan = position.colSpan;
    resizeOrigRowSpan = position.rowSpan;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleResizeMove(e: PointerEvent) {
    if (!resizing || !ctx.canvasEl) return;
    const rect = ctx.canvasEl.getBoundingClientRect();
    const gap = 8;
    const cellWidth = (rect.width - gap * (ctx.columns - 1)) / ctx.columns;
    const dx = e.clientX - resizeStartX;
    const dy = e.clientY - resizeStartY;
    const deltaCol = Math.round(dx / (cellWidth + gap));
    const deltaRow = Math.round(dy / (ctx.rowHeight + gap));
    const newColSpan = Math.max(MIN_COL_SPAN, Math.min(GRID_COLS - position.col, resizeOrigColSpan + deltaCol));
    const newRowSpan = Math.max(MIN_ROW_SPAN, resizeOrigRowSpan + deltaRow);
    ctx.onResizePreview(id, { colSpan: newColSpan, rowSpan: newRowSpan });
  }

  function handleResizeEnd(e: PointerEvent) {
    if (!resizing) return;
    resizing = false;
    // Commit the current preview position through the grid engine
    ctx.onResizeCommit(id, position);
  }
</script>

{#if !hidden}
<div
  data-panel-id={id}
  class="panel-wrapper"
  style="
    grid-column: {position.col + 1} / span {position.colSpan};
    grid-row: {position.row + 1} / span {position.rowSpan};
    border: {editing ? '2px dashed var(--bmo-green)' : '1px solid var(--bmo-border)'};
    background: var(--bmo-surface);
    {editing ? 'box-shadow: 0 0 12px rgba(0, 229, 160, 0.15);' : ''}
    {fontSize ? `font-size: ${fontSize}px;` : ''}
    {isDragging ? 'opacity: 0.4; z-index: 10;' : ''}
    {!isDragging && !resizing ? 'transition: grid-column 0.2s, grid-row 0.2s, opacity 0.15s;' : ''}
    {resizing ? 'z-index: 50; opacity: 0.9;' : ''}
  "
>
  {#if editing}
    <!-- Drag handle bar -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flex items-center justify-between px-2 shrink-0 select-none"
      style="height: 32px; cursor: grab; background: rgba(0, 229, 160, 0.05); border-bottom: 1px solid var(--bmo-border)"
      onpointerdown={handleDragStart}
    >
      <div class="flex items-center gap-2">
        <span style="background: var(--bmo-green); color: var(--bmo-bg); font-size: 8px; padding: 1px 6px; letter-spacing: 1px; text-transform: uppercase">DRAG</span>
      </div>
      <div class="flex items-center gap-1">
        <span class="text-xs" style="color: var(--bmo-muted); font-size: 9px; letter-spacing: 1px">FONT</span>
        <button
          onclick={() => adjustFontSize(-1)}
          class="px-1.5 py-0.5 text-xs transition-opacity hover:opacity-80"
          style="color: var(--bmo-muted); background: transparent; border: 1px solid var(--bmo-border); cursor: pointer; font-size: 10px"
        >−</button>
        <button
          onclick={() => adjustFontSize(1)}
          class="px-1.5 py-0.5 text-xs transition-opacity hover:opacity-80"
          style="color: var(--bmo-green); background: transparent; border: 1px solid var(--bmo-border); cursor: pointer; font-size: 10px"
        >+</button>
      </div>
    </div>
  {/if}

  <!-- Panel content -->
  <div class="p-3 overflow-auto" style="min-height: 0">
    {@render children()}
  </div>

  {#if editing}
    <!-- Resize handle -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      style="position: absolute; bottom: 0; right: 0; width: 12px; height: 12px; background: var(--bmo-green); cursor: nwse-resize; z-index: 10"
      onpointerdown={handleResizeStart}
      onpointermove={handleResizeMove}
      onpointerup={handleResizeEnd}
      onpointercancel={handleResizeEnd}
    ></div>
  {/if}
</div>
{/if}

<style>
  .panel-wrapper {
    position: relative;
    overflow: visible;
    display: flex;
    flex-direction: column;
  }
</style>
