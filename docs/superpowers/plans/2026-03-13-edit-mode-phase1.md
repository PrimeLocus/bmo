# Edit Mode Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggle-able edit mode to Beau's Terminal with drag/resize panels, per-panel font size, and layout persistence — applied to the dashboard as proof-of-concept.

**Architecture:** Panel and PanelCanvas components communicate via Svelte context + a reactive layout store. PanelCanvas provides context (pageId, canvas DOM ref, capture function). Panel reads its own position from the layout store and applies absolute positioning when in freeform mode. Edit mode state uses an object-based `$state` for cross-component reactivity. Drag/resize uses native pointer events with `setPointerCapture`.

**Tech Stack:** SvelteKit 2 / Svelte 5 (runes), Tailwind 4, better-sqlite3 + Drizzle ORM, native Pointer Events for drag/resize. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-03-13-edit-mode-phase1-design.md`

---

## Chunk 1: Foundation (stores + schema + API)

### Task 1: Edit Mode Store

**Files:**
- Create: `beau-terminal/src/lib/stores/editMode.svelte.ts`

- [ ] **Step 1: Create the editMode store using object-based $state**

The store MUST use an object wrapper — primitive `$state` exports are not reactive across module boundaries in Svelte 5. This matches the existing `beauState` pattern in `beau.svelte.ts`.

```typescript
// src/lib/stores/editMode.svelte.ts

const _state = $state({ active: false });

export const editModeState = _state;

export function toggleEditMode() {
  _state.active = !_state.active;
}

export function exitEditMode() {
  _state.active = false;
}
```

Consumers read `editModeState.active` (reactive via `$state` proxy property access).

- [ ] **Step 2: Verify no type errors**

Run: `cd beau-terminal && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 ERRORS

- [ ] **Step 3: Commit**

```bash
git add beau-terminal/src/lib/stores/editMode.svelte.ts
git commit -m "feat: add editMode store (object-based \$state)"
```

---

### Task 2: Layout Types & Store

**Files:**
- Create: `beau-terminal/src/lib/stores/layout.svelte.ts`

- [ ] **Step 1: Create the layout store with types and localStorage persistence**

```typescript
// src/lib/stores/layout.svelte.ts

export type PanelPosition = {
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize?: number;
};

export type PageLayout = {
  mode: 'grid' | 'freeform';
  panels: Record<string, PanelPosition>;
};

export const GRID_SNAP = 20;
export const MIN_W = 120;
export const MIN_H = 80;
const CANVAS_PADDING = 40;

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SNAP) * GRID_SNAP;
}

export function clampSize(w: number, h: number): { w: number; h: number } {
  return {
    w: Math.max(MIN_W, snapToGrid(w)),
    h: Math.max(MIN_H, snapToGrid(h)),
  };
}

// In-memory reactive cache of all page layouts
const _layouts = $state<Record<string, PageLayout | undefined>>({});

// Debounce timers for SQLite sync
const syncTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function lsKey(pageId: string): string {
  return `bmo-layout:${pageId}`;
}

function readLS(pageId: string): PageLayout | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(lsKey(pageId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.mode === 'grid' || parsed.mode === 'freeform') && parsed.panels) {
      return parsed as PageLayout;
    }
    return null;
  } catch {
    return null;
  }
}

function writeLS(pageId: string, layout: PageLayout) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(lsKey(pageId), JSON.stringify(layout));
}

function deleteLS(pageId: string) {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(lsKey(pageId));
}

function scheduleSQLiteSync(pageId: string, layout: PageLayout) {
  if (typeof fetch === 'undefined') return;
  clearTimeout(syncTimers[pageId]);
  syncTimers[pageId] = setTimeout(() => {
    fetch(`/api/layouts?page=${encodeURIComponent(pageId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layout),
    }).catch(() => {/* silent — SQLite is best-effort backup */});
  }, 2000);
}

/**
 * Synchronous read — returns from memory or localStorage.
 * IMPORTANT: Does NOT write to _layouts. Safe to call inside $derived.
 * Cache population happens only in loadPageLayout (called from onMount).
 */
export function getPageLayout(pageId: string): PageLayout | undefined {
  if (_layouts[pageId]) return _layouts[pageId];
  return readLS(pageId) ?? undefined;
}

/** Async read — tries memory, localStorage, then SQLite fallback. */
export async function loadPageLayout(pageId: string): Promise<PageLayout | undefined> {
  const sync = getPageLayout(pageId);
  if (sync) return sync;
  // SQLite fallback
  if (typeof fetch === 'undefined') return undefined;
  try {
    const res = await fetch(`/api/layouts?page=${encodeURIComponent(pageId)}`);
    if (!res.ok) return undefined;
    const data = await res.json() as PageLayout;
    _layouts[pageId] = data;
    writeLS(pageId, data);
    return data;
  } catch {
    return undefined;
  }
}

export function savePageLayout(pageId: string, layout: PageLayout) {
  _layouts[pageId] = { ...layout, panels: { ...layout.panels } };
  writeLS(pageId, layout);
  scheduleSQLiteSync(pageId, layout);
}

export function resetPageLayout(pageId: string) {
  _layouts[pageId] = undefined;
  deleteLS(pageId);
  clearTimeout(syncTimers[pageId]);
  if (typeof fetch !== 'undefined') {
    fetch(`/api/layouts?page=${encodeURIComponent(pageId)}`, { method: 'DELETE' })
      .catch(() => {});
  }
}

export function updatePanelPosition(
  pageId: string,
  panelId: string,
  pos: Partial<PanelPosition>
) {
  const layout = _layouts[pageId];
  if (!layout) return;
  const updated: PageLayout = {
    ...layout,
    panels: {
      ...layout.panels,
      [panelId]: { ...layout.panels[panelId], ...pos },
    },
  };
  savePageLayout(pageId, updated);
}

export function computeCanvasHeight(layout: PageLayout): number {
  let maxBottom = 0;
  for (const p of Object.values(layout.panels)) {
    maxBottom = Math.max(maxBottom, p.y + p.h);
  }
  return maxBottom + CANVAS_PADDING;
}

/**
 * Capture current DOM positions of all panels inside a canvas element.
 * Uses getBoundingClientRect() offset by the canvas position + scroll,
 * since the canvas is inside a scrollable <main> container.
 */
export function capturePositions(
  canvasEl: HTMLElement,
  existingLayout?: PageLayout
): PageLayout {
  const canvasRect = canvasEl.getBoundingClientRect();
  const panels: Record<string, PanelPosition> = {};
  const panelEls = canvasEl.querySelectorAll<HTMLElement>('[data-panel-id]');
  for (const el of panelEls) {
    const id = el.dataset.panelId!;
    const rect = el.getBoundingClientRect();
    const x = snapToGrid(rect.left - canvasRect.left);
    const y = snapToGrid(rect.top - canvasRect.top + canvasEl.scrollTop);
    const { w, h } = clampSize(rect.width, rect.height);
    const existingFontSize = existingLayout?.panels[id]?.fontSize;
    panels[id] = { x, y, w, h, ...(existingFontSize ? { fontSize: existingFontSize } : {}) };
  }
  return { mode: 'freeform', panels };
}
```

- [ ] **Step 2: Verify no type errors**

Run: `cd beau-terminal && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 ERRORS

- [ ] **Step 3: Commit**

```bash
git add beau-terminal/src/lib/stores/layout.svelte.ts
git commit -m "feat: add layout store with localStorage + SQLite sync"
```

---

### Task 3: Layouts Table in Schema + Migration

**Files:**
- Modify: `beau-terminal/src/lib/server/db/schema.ts` (append after line 250)
- Modify: `beau-terminal/src/lib/server/db/index.ts` (append before end)

- [ ] **Step 1: Add layouts table to Drizzle schema**

Add at the end of `beau-terminal/src/lib/server/db/schema.ts`:

```typescript
// ─── Layout Persistence (Edit Mode) ───

export const layouts = sqliteTable('layouts', {
  id:        text('id').primaryKey(),
  data:      text('data').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
```

- [ ] **Step 2: Add CREATE TABLE IF NOT EXISTS to db/index.ts**

Add at the end of `beau-terminal/src/lib/server/db/index.ts`:

```typescript
// Edit Mode — layouts table
try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS layouts (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
} catch { /* already exists */ }
```

- [ ] **Step 3: Verify no type errors**

Run: `cd beau-terminal && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 ERRORS

- [ ] **Step 4: Commit**

```bash
git add beau-terminal/src/lib/server/db/schema.ts beau-terminal/src/lib/server/db/index.ts
git commit -m "feat: add layouts table for edit mode persistence"
```

---

### Task 4: Layouts API Route

**Files:**
- Create: `beau-terminal/src/routes/api/layouts/+server.ts`

- [ ] **Step 1: Create the API route**

```typescript
// src/routes/api/layouts/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { layouts } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

function getPageParam(url: URL): string {
  const page = url.searchParams.get('page');
  if (!page) throw error(400, 'Missing required "page" query parameter');
  return page;
}

function validateLayout(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (d.mode !== 'grid' && d.mode !== 'freeform') return false;
  if (!d.panels || typeof d.panels !== 'object') return false;
  for (const panel of Object.values(d.panels as Record<string, unknown>)) {
    if (!panel || typeof panel !== 'object') return false;
    const p = panel as Record<string, unknown>;
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return false;
    if (typeof p.w !== 'number' || typeof p.h !== 'number') return false;
    if (p.fontSize !== undefined && typeof p.fontSize !== 'number') return false;
  }
  return true;
}

export const GET: RequestHandler = async ({ url }) => {
  const page = getPageParam(url);
  const row = db.select().from(layouts).where(eq(layouts.id, page)).get();
  if (!row) throw error(404, 'No saved layout');
  try {
    return json(JSON.parse(row.data));
  } catch {
    throw error(500, 'Corrupt layout data');
  }
};

export const PUT: RequestHandler = async ({ url, request }) => {
  const page = getPageParam(url);
  const body = await request.json();
  if (!validateLayout(body)) throw error(400, 'Invalid layout shape');
  const dataStr = JSON.stringify(body);
  const now = Date.now();
  const existing = db.select().from(layouts).where(eq(layouts.id, page)).get();
  if (existing) {
    db.update(layouts).set({ data: dataStr, updatedAt: now }).where(eq(layouts.id, page)).run();
  } else {
    db.insert(layouts).values({ id: page, data: dataStr, updatedAt: now }).run();
  }
  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ url }) => {
  const page = getPageParam(url);
  db.delete(layouts).where(eq(layouts.id, page)).run();
  return json({ ok: true });
};
```

- [ ] **Step 2: Verify no type errors**

Run: `cd beau-terminal && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 ERRORS

- [ ] **Step 3: Smoke test the API**

Start dev server if not running: `cd beau-terminal && npm run dev &`

```bash
# PUT a test layout
curl -s -X PUT "http://localhost:4242/api/layouts?page=/test" \
  -H "Content-Type: application/json" \
  -d '{"mode":"grid","panels":{"a":{"x":0,"y":0,"w":200,"h":100}}}' | head -1

# GET it back
curl -s "http://localhost:4242/api/layouts?page=/test" | head -1

# DELETE it
curl -s -X DELETE "http://localhost:4242/api/layouts?page=/test" | head -1
```

Expected: `{"ok":true}`, then the layout JSON, then `{"ok":true}`.

- [ ] **Step 4: Commit**

```bash
git add beau-terminal/src/routes/api/layouts/+server.ts
git commit -m "feat: add /api/layouts REST endpoint for layout persistence"
```

---

## Chunk 2: UI Components (EditBar + Panel + PanelCanvas)

### Task 5: EditBar Component

**Files:**
- Create: `beau-terminal/src/lib/components/EditBar.svelte`

- [ ] **Step 1: Create EditBar**

```svelte
<!-- src/lib/components/EditBar.svelte -->
<script lang="ts">
  import { editModeState } from '$lib/stores/editMode.svelte.js';
</script>

{#if editModeState.active}
  <div class="flex items-center gap-4 px-4 py-1.5 text-xs border-b"
       style="background: var(--bmo-green); color: var(--bmo-bg); border-color: var(--bmo-green)">
    <span class="font-bold tracking-widest">EDIT MODE</span>
    <span style="opacity: 0.7">drag to move · edges to resize · −/+ panel text · ESC to exit</span>
  </div>
{/if}
```

- [ ] **Step 2: Verify no type errors**

Run: `cd beau-terminal && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 ERRORS

- [ ] **Step 3: Commit**

```bash
git add beau-terminal/src/lib/components/EditBar.svelte
git commit -m "feat: add EditBar component for edit mode instructions"
```

---

### Task 6: PanelCanvas Component

**Files:**
- Create: `beau-terminal/src/lib/components/PanelCanvas.svelte`

Architecture: PanelCanvas reads layout from the store reactively, provides context to child Panels via `setContext`, and handles the grid-to-freeform transition. No `export function` — all coordination through context + store.

- [ ] **Step 1: Create PanelCanvas.svelte**

```svelte
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
```

- [ ] **Step 2: Verify no type errors**

Run: `cd beau-terminal && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 ERRORS

- [ ] **Step 3: Commit**

```bash
git add beau-terminal/src/lib/components/PanelCanvas.svelte
git commit -m "feat: add PanelCanvas with context-based coordination"
```

---

### Task 7: Panel Component

**Files:**
- Create: `beau-terminal/src/lib/components/Panel.svelte`

Architecture: Panel reads its own position from the layout store reactively. It reads editMode from the editModeState object. It gets `pageId`, `canvasEl`, and `ensureFreeform` from PanelCanvas's context. Drag/resize handlers mutate the layout store directly. No `bind:this` or exported functions needed.

- [ ] **Step 1: Create Panel.svelte**

```svelte
<!-- src/lib/components/Panel.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { getContext } from 'svelte';
  import { editModeState } from '$lib/stores/editMode.svelte.js';
  import {
    getPageLayout,
    updatePanelPosition,
    savePageLayout,
    snapToGrid,
    clampSize,
    capturePositions,
    type PanelPosition,
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
```

Key design decisions in this component:
- Reads `editModeState.active` reactively (object property, not primitive)
- Reads position from `getPageLayout(ctx.pageId)?.panels[id]` — reactive via `$derived`
- Applies `position: absolute` + coordinates only when `isFreeform && position` are both truthy
- Uses `overflow: visible` so the resize handle at the panel edge is not clipped
- Calls `ctx.ensureFreeform()` before any drag/resize to trigger grid-to-freeform capture
- Resize handle uses inline `position: absolute` (not Tailwind `absolute` class) for clarity

- [ ] **Step 2: Verify no type errors**

Run: `cd beau-terminal && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 ERRORS

- [ ] **Step 3: Commit**

```bash
git add beau-terminal/src/lib/components/Panel.svelte
git commit -m "feat: add Panel component with drag, resize, per-panel font size"
```

---

## Chunk 3: Integration (StatusBar + Layout + Dashboard)

### Task 8: Wire Edit Mode into StatusBar

**Files:**
- Modify: `beau-terminal/src/lib/components/StatusBar.svelte`

- [ ] **Step 1: Add edit mode toggle button to StatusBar**

In `StatusBar.svelte`, add the import at the top of the `<script>` block:

```typescript
  import { editModeState, toggleEditMode } from '$lib/stores/editMode.svelte.js';
```

Then insert the edit mode button BEFORE the `{#if beauState.lastHaiku}` block (around line 40):

```svelte
  <!-- Edit mode toggle -->
  <button
    onclick={toggleEditMode}
    class="ml-auto text-xs tracking-widest px-3 py-1 border transition-all hover:opacity-80"
    style="
      border-color: {editModeState.active ? 'var(--bmo-green)' : 'var(--bmo-border)'};
      background: {editModeState.active ? 'var(--bmo-green)' : 'transparent'};
      color: {editModeState.active ? 'var(--bmo-bg)' : 'var(--bmo-muted)'};
      cursor: pointer;
    "
  >
    {editModeState.active ? 'EDIT MODE' : 'EDIT'}
  </button>
```

Also change the haiku div's `class="ml-auto` to `class="` (remove `ml-auto`) since the edit button now pushes the haiku to the right.

- [ ] **Step 2: Verify no type errors**

Run: `cd beau-terminal && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 ERRORS

- [ ] **Step 3: Commit**

```bash
git add beau-terminal/src/lib/components/StatusBar.svelte
git commit -m "feat: add edit mode toggle button to StatusBar"
```

---

### Task 9: Wire Ctrl+E and EditBar into Layout

**Files:**
- Modify: `beau-terminal/src/routes/+layout.svelte`

- [ ] **Step 1: Update the layout**

Replace the full content of `beau-terminal/src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { connectBeauWS, disconnectBeauWS } from '$lib/stores/beau.svelte.js';
  import { applyCurrentSettings } from '$lib/stores/settings.svelte.js';
  import { editModeState, toggleEditMode, exitEditMode } from '$lib/stores/editMode.svelte.js';
  import Nav from '$lib/components/Nav.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import EditBar from '$lib/components/EditBar.svelte';
  import '../app.css';

  const { children } = $props();

  function handleKeydown(e: KeyboardEvent) {
    // Guard: don't intercept when typing in form fields
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) return;

    if (e.key === 'Escape' && editModeState.active) {
      exitEditMode();
      return;
    }
    if (e.ctrlKey && e.key === 'e') {
      e.preventDefault();
      toggleEditMode();
    }
  }

  onMount(() => {
    applyCurrentSettings();
    connectBeauWS();
    return () => disconnectBeauWS();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-screen overflow-hidden">
  <Nav />
  <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
    <StatusBar />
    <EditBar />
    <main class="flex-1 p-6 overflow-y-auto">
      {@render children()}
    </main>
  </div>
</div>
```

- [ ] **Step 2: Verify no type errors**

Run: `cd beau-terminal && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 ERRORS

- [ ] **Step 3: Manual test**

Open the app in a browser. Press `Ctrl+E` — should see the green EDIT MODE bar. Click the EDIT button in StatusBar — should toggle. Press `ESC` — should exit. Type in an input field and press `Ctrl+E` — should NOT toggle (input guard).

- [ ] **Step 4: Commit**

```bash
git add beau-terminal/src/routes/+layout.svelte
git commit -m "feat: wire Ctrl+E shortcut, ESC exit, and EditBar into layout"
```

---

### Task 10: Convert Dashboard to Panel System

**Files:**
- Modify: `beau-terminal/src/routes/+page.svelte`

- [ ] **Step 1: Rewrite dashboard to use Panel + PanelCanvas**

Replace the full content of `beau-terminal/src/routes/+page.svelte`:

```svelte
<script lang="ts">
  import { beauState, MODE_LABELS, EMOTION_LABELS } from '$lib/stores/beau.svelte.js';
  import PanelCanvas from '$lib/components/PanelCanvas.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();

  const pct = $derived(
    data.totalSteps > 0 ? Math.round((data.doneSteps / data.totalSteps) * 100) : 0
  );
</script>

<div class="max-w-4xl">
  <!-- Header (outside panel system — not draggable) -->
  <div class="mb-8 flex items-end justify-between">
    <div>
      <h1 class="text-2xl tracking-widest font-bold" style="color: var(--bmo-green)">BEAU'S TERMINAL</h1>
      <p class="text-xs mt-1" style="color: var(--bmo-muted)">physical BMO build — lafayette, la</p>
    </div>
    <div class="flex items-center gap-2 text-xs" style="color: var(--bmo-muted)">
      <div class="w-2 h-2 rounded-full transition-colors"
           style="background: {beauState.online ? 'var(--bmo-green)' : '#636e72'}"></div>
      <span>{beauState.online ? 'BEAU ONLINE' : 'BEAU OFFLINE'}</span>
    </div>
  </div>

  <PanelCanvas pageId="/" columns={2}>
    <!-- Identity: Soul Code -->
    <Panel id="dashboard:soul-code">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">SOUL CODE</div>
      <div class="text-sm tracking-wider font-bold"
           style="color: {data.soulCodeStatus === 'exists' ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
        {data.soulCodeStatus === 'exists' ? 'WRITTEN' : 'AWAITING'}
      </div>
    </Panel>

    <!-- Identity: Voice -->
    <Panel id="dashboard:voice">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">VOICE</div>
      <div class="text-sm tracking-wider font-bold" style="color: var(--bmo-green)">
        {data.voiceModelVersion.toUpperCase()}
      </div>
    </Panel>

    <!-- Environment: Sleep -->
    <Panel id="dashboard:sleep">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">SLEEP</div>
      <div class="text-sm tracking-wider font-bold"
           style="color: {beauState.sleepState === 'asleep' ? '#636e72' : 'var(--bmo-green)'}">
        {beauState.sleepState.toUpperCase()}
      </div>
    </Panel>

    <!-- Environment: Room -->
    <Panel id="dashboard:room">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">ROOM</div>
      <div class="text-sm tracking-wider font-bold"
           style="color: {beauState.presenceState === 'occupied' ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
        {beauState.presenceState.toUpperCase()}
      </div>
    </Panel>

    <!-- Environment: Weather -->
    <Panel id="dashboard:weather">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">WEATHER</div>
      <div class="text-sm tracking-wider font-bold" style="color: var(--bmo-text)">
        {beauState.weatherSummary || '—'}
      </div>
    </Panel>

    <!-- Environment: Resolume -->
    <Panel id="dashboard:resolume">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">RESOLUME</div>
      <div class="text-sm tracking-wider font-bold"
           style="color: {beauState.resolumeActive ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
        {beauState.resolumeActive ? 'LIVE' : 'INACTIVE'}
      </div>
      {#if beauState.resolumeActive && beauState.currentClip}
        <div class="text-xs mt-1 truncate" style="color: var(--bmo-text)">
          {beauState.currentClip} · {beauState.currentBpm ?? '—'} BPM
        </div>
      {/if}
    </Panel>

    <!-- Live State: Mode -->
    <Panel id="dashboard:mode">
      <div class="text-xs mb-2 tracking-widest" style="color: var(--bmo-muted)">MODE</div>
      <div class="text-sm tracking-wider font-bold" style="color: var(--bmo-green)">
        {(MODE_LABELS[beauState.mode] ?? beauState.mode).toUpperCase()}
      </div>
    </Panel>

    <!-- Live State: Emotion -->
    <Panel id="dashboard:emotion">
      <div class="text-xs mb-2 tracking-widest" style="color: var(--bmo-muted)">STATE</div>
      <div class="text-sm tracking-wider font-bold" style="color: var(--bmo-green)">
        {(EMOTION_LABELS[beauState.emotionalState] ?? beauState.emotionalState).toUpperCase()}
      </div>
    </Panel>

    <!-- Live State: Environment -->
    <Panel id="dashboard:env">
      <div class="text-xs mb-2 tracking-widest" style="color: var(--bmo-muted)">ENVIRONMENT</div>
      <div class="text-sm tracking-wider font-bold" style="color: var(--bmo-green)">
        {(beauState.environment || '—').toUpperCase()}
      </div>
    </Panel>

    <!-- Live State: Camera -->
    <Panel id="dashboard:camera">
      <div class="text-xs mb-2 tracking-widest" style="color: var(--bmo-muted)">CAMERA</div>
      <div class="text-sm tracking-wider font-bold" style="color: var(--bmo-green)">
        {beauState.cameraActive ? 'ACTIVE' : 'OFF'}
      </div>
    </Panel>

    <!-- Last Haiku (spans 2 columns in grid mode) -->
    {#if beauState.lastHaiku}
      <div style="grid-column: span 2">
        <Panel id="dashboard:haiku">
          <div class="text-xs tracking-widest mb-3" style="color: var(--bmo-muted)">LAST HAIKU</div>
          <div class="text-sm leading-relaxed italic" style="color: var(--bmo-text)">
            {#each beauState.lastHaiku.split('\n') as line}
              <div>{line}</div>
            {/each}
          </div>
        </Panel>
      </div>
    {/if}

    <!-- Build Stats -->
    <Panel id="dashboard:build-stats">
      <div class="text-xs tracking-widest mb-4" style="color: var(--bmo-muted)">BUILD STATS</div>
      <div class="space-y-3">
        <div class="flex justify-between text-xs">
          <span style="color: var(--bmo-muted)">PARTS TRACKED</span>
          <span style="color: var(--bmo-text)">{data.partsCount}</span>
        </div>
        <div class="flex justify-between text-xs">
          <span style="color: var(--bmo-muted)">TOTAL COST</span>
          <span style="color: var(--bmo-text)">${data.totalCost.toFixed(2)}</span>
        </div>
        <div class="flex justify-between text-xs">
          <span style="color: var(--bmo-muted)">SOFTWARE STEPS</span>
          <span style="color: var(--bmo-text)">{data.doneSteps} / {data.totalSteps}</span>
        </div>
        <div>
          <div class="h-1 mt-1" style="background: var(--bmo-border); border-radius: 1px">
            <div class="h-1 transition-all" style="width: {pct}%; background: var(--bmo-green); border-radius: 1px"></div>
          </div>
          <div class="text-xs mt-1" style="color: var(--bmo-muted)">{pct}% complete</div>
        </div>
      </div>
    </Panel>

    <!-- Dispatcher Log -->
    <Panel id="dashboard:dispatcher">
      <div class="text-xs tracking-widest mb-4" style="color: var(--bmo-muted)">DISPATCHER LOG</div>
      {#if beauState.dispatcherLog.length === 0}
        <div class="text-xs" style="color: var(--bmo-muted)">no events yet</div>
      {:else}
        <div class="space-y-1">
          {#each beauState.dispatcherLog.slice(-8).reverse() as entry}
            <div class="text-xs py-1 border-b" style="color: var(--bmo-text); border-color: var(--bmo-border)">
              &gt; {entry}
            </div>
          {/each}
        </div>
      {/if}
    </Panel>
  </PanelCanvas>

  <!-- Wake word (outside panel system) -->
  {#if beauState.wakeWord}
    <div class="mt-4 p-3 border text-xs" style="border-color: var(--bmo-border); color: var(--bmo-muted)">
      LAST WAKE: <span style="color: var(--bmo-green)">{beauState.wakeWord}</span>
    </div>
  {/if}
</div>
```

Key design decisions in this conversion:
- Panel components are clean: just `<Panel id="...">content</Panel>` — no position props needed (Panel reads from store via context)
- Haiku panel uses a wrapper `<div style="grid-column: span 2">` for grid mode spanning
- Header and wake word are outside PanelCanvas — not draggable
- No `bind:this` on PanelCanvas — all coordination via context + store

- [ ] **Step 2: Verify no type errors**

Run: `cd beau-terminal && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 ERRORS

- [ ] **Step 3: Commit**

```bash
git add beau-terminal/src/routes/+page.svelte
git commit -m "feat: convert dashboard to Panel system with drag/resize/edit mode"
```

---

## Chunk 4: Verification

### Task 11: Full Type Check + Build Verification

- [ ] **Step 1: Run full type check**

Run: `cd beau-terminal && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -10`
Expected: 0 ERRORS (existing photography warnings are acceptable)

- [ ] **Step 2: Run production build**

Run: `cd beau-terminal && npm run build 2>&1 | tail -10`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Fix and commit any issues**

If errors surfaced, fix them and commit:

```bash
git add -A
git commit -m "fix: address type/build errors from edit mode integration"
```

---

### Task 12: End-to-End Manual Walkthrough

- [ ] **Step 1:** Open dashboard — verify it looks identical to pre-edit-mode (grid layout, same cards, same colors)
- [ ] **Step 2:** Press `Ctrl+E` — verify green EDIT MODE bar appears, all panels show dashed borders + DRAG labels + resize handles
- [ ] **Step 3:** Click the EDIT button in StatusBar — verify it toggles edit mode on/off
- [ ] **Step 4:** Drag a panel by its DRAG handle — verify smooth move, snaps to 20px grid on release
- [ ] **Step 5:** Resize a panel via bottom-right green handle — verify smooth resize, snaps on release, min 120×80px
- [ ] **Step 6:** Click FONT `+` on a panel header — verify text inside that panel grows. Click `−` — verify it shrinks.
- [ ] **Step 7:** Press `ESC` — verify edit mode exits, all edit chrome disappears
- [ ] **Step 8:** Refresh page — verify layout and per-panel font sizes persist
- [ ] **Step 9:** Click RESET LAYOUT — verify return to default grid layout
- [ ] **Step 10:** Check API: `curl -s "http://localhost:4242/api/layouts?page=/"` — verify JSON layout or 404 after reset
- [ ] **Step 11:** Navigate to Prompt page, click into message textarea, press `Ctrl+E` — should NOT toggle edit mode (input guard)
