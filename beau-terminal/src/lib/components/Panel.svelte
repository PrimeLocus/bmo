<!-- src/lib/components/Panel.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { getContext } from 'svelte';
  import { editModeState } from '$lib/stores/editMode.svelte.js';
  import {
    getPageLayout,
    updatePanelPosition,
    snapToGrid,
    clampSize,
  } from '$lib/stores/layout.svelte.js';

  type Props = {
    id: string;
    children: Snippet;
  };

  const { id, children }: Props = $props();

  const ctx = getContext<{
    pageId: string;
    canvasEl: HTMLDivElement | undefined;
    ensureFreeform: () => void;
  }>('panel-canvas');

  // Reactive reads from stores
  const editing = $derived(editModeState.active);
  const layout = $derived(getPageLayout(ctx.pageId));
  const position = $derived(layout?.panels[id]);
  const isFreeform = $derived(layout?.mode === 'freeform');
  const fontSize = $derived(position?.fontSize);

  let panelEl: HTMLDivElement | undefined = $state();
  let dragging = $state(false);
  let resizing = $state(false);

  // ── Per-panel font size ──
  function adjustFontSize(delta: number) {
    const current = fontSize ?? 20;
    const next = Math.min(40, Math.max(10, current + delta));
    // Ensure freeform mode so positions exist
    ctx.ensureFreeform();
    updatePanelPosition(ctx.pageId, id, { fontSize: next });
  }

  // ── Drag ──
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOrigX = 0;
  let dragOrigY = 0;

  function handleDragStart(e: PointerEvent) {
    if (!editing || !panelEl) return;
    e.preventDefault();
    // Ensure freeform mode on first drag
    ctx.ensureFreeform();
    // Re-read position after possible capture
    const pos = getPageLayout(ctx.pageId)?.panels[id];
    if (!pos) return;
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOrigX = pos.x;
    dragOrigY = pos.y;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleDragMove(e: PointerEvent) {
    if (!dragging || !panelEl) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    // Live preview — direct DOM manipulation for smooth feel
    panelEl.style.left = `${dragOrigX + dx}px`;
    panelEl.style.top = `${dragOrigY + dy}px`;
  }

  function handleDragEnd(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    const newX = snapToGrid(Math.max(0, dragOrigX + dx));
    const newY = snapToGrid(Math.max(0, dragOrigY + dy));
    updatePanelPosition(ctx.pageId, id, { x: newX, y: newY });
  }

  // ── Resize ──
  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeOrigW = 0;
  let resizeOrigH = 0;

  function handleResizeStart(e: PointerEvent) {
    if (!editing || !panelEl) return;
    e.preventDefault();
    e.stopPropagation();
    ctx.ensureFreeform();
    const pos = getPageLayout(ctx.pageId)?.panels[id];
    if (!pos) return;
    resizing = true;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    resizeOrigW = pos.w;
    resizeOrigH = pos.h;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleResizeMove(e: PointerEvent) {
    if (!resizing || !panelEl) return;
    const dx = e.clientX - resizeStartX;
    const dy = e.clientY - resizeStartY;
    panelEl.style.width = `${Math.max(120, resizeOrigW + dx)}px`;
    panelEl.style.height = `${Math.max(80, resizeOrigH + dy)}px`;
  }

  function handleResizeEnd(e: PointerEvent) {
    if (!resizing) return;
    resizing = false;
    const dx = e.clientX - resizeStartX;
    const dy = e.clientY - resizeStartY;
    const { w, h } = clampSize(resizeOrigW + dx, resizeOrigH + dy);
    updatePanelPosition(ctx.pageId, id, { w, h });
  }
</script>

<div
  bind:this={panelEl}
  data-panel-id={id}
  class="panel-wrapper"
  style="
    border: {editing ? '2px dashed var(--bmo-green)' : '1px solid var(--bmo-border)'};
    background: var(--bmo-surface);
    {editing ? 'box-shadow: 0 0 12px rgba(0, 229, 160, 0.15);' : ''}
    {fontSize ? `font-size: ${fontSize}px;` : ''}
    {isFreeform && position
      ? `position: absolute; left: ${position.x}px; top: ${position.y}px; width: ${position.w}px; height: ${position.h}px;`
      : ''}
    {dragging || resizing ? 'z-index: 50; opacity: 0.9;' : ''}
  "
>
  {#if editing}
    <!-- Drag handle bar -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flex items-center justify-between px-2 shrink-0 select-none"
      style="height: 32px; cursor: grab; background: rgba(0, 229, 160, 0.05); border-bottom: 1px solid var(--bmo-border)"
      onpointerdown={handleDragStart}
      onpointermove={handleDragMove}
      onpointerup={handleDragEnd}
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
  <div class="p-3">
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
    ></div>
  {/if}
</div>

<style>
  .panel-wrapper {
    position: relative;
    overflow: visible;
  }
</style>
