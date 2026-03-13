# Edit Mode — Phase 1: Panel System + Layout Engine

**Date:** 2026-03-13
**Scope:** Dashboard-only panel system with drag/resize, edit mode toggle, freeform layout engine, localStorage + SQLite persistence.
**Phases overview:** This is Phase 1 of 3. Phase 2 adds sidebar CRUD + SQLite sync + all-page modularization. Phase 3 adds custom pages + widget extraction.

---

## 1. Edit Mode Toggle

### State
- New store: `src/lib/stores/editMode.svelte.ts`
- Exports: `editMode` (`$state<boolean>`, default `false`), `toggleEditMode()`, `exitEditMode()`

### Activation
- **StatusBar button:** Green-outlined `EDIT` button in StatusBar. When active, becomes solid green with `EDIT MODE` label.
- **Keyboard shortcut:** `Ctrl+E` toggles edit mode. Listener in `+layout.svelte`. Must include an input-focus guard: skip toggle when `e.target` is an `HTMLInputElement`, `HTMLTextAreaElement`, or `HTMLSelectElement` (prevents hijacking `Ctrl+E` in text fields).
- **ESC key:** Exits edit mode when active. Same input-focus guard applies.

### Visual Changes When Active
- `<EditBar>` component appears below StatusBar: `"drag to move · edges to resize · −/+ panel text · ESC to exit"`
- All `<Panel>` components switch to edit chrome (dashed borders, drag labels, resize handles).
- When inactive: zero visual difference from current UI.

---

## 2. Panel Component

### File
`src/lib/components/Panel.svelte`

### Props
| Prop | Type | Description |
|------|------|-------------|
| `id` | `string` | Unique panel identifier (e.g. `"dashboard:mode"`) |
| `defaultPosition` | `{ x: number, y: number, w: number, h: number }` | Default grid-unit position (fallback when no saved layout) |
| `children` | `Snippet` | Panel content |

### Normal Mode (edit off)
- Renders as a plain `<div>` with existing card styling: `border: 1px solid var(--bmo-border); background: var(--bmo-surface)`.
- If per-panel `fontSize` is saved, applies it as `style="font-size: {fontSize}px"` on the container.
- Zero visual overhead compared to current pages.

### Edit Mode (edit on)
- Border changes to: `border: 2px dashed var(--bmo-green)`
- **Top bar (32px height, full width):** drag handle area.
  - Left: `DRAG` label (green background, dark text, 8px font, uppercase tracking).
  - Right: `−` and `+` buttons (labeled `FONT`) for per-panel font size adjustment (range: 10–40px, stored per panel ID). Deliberately distinct from the global `A⁻`/`A⁺` controls in the Nav sidebar to avoid confusion — these only affect the individual panel.
- **Bottom-right corner:** 12×12px green square resize handle. Cursor: `nwse-resize`.
- Subtle glow: `box-shadow: 0 0 12px rgba(0, 229, 160, 0.15)`.

### Per-Panel Font Size
- Stored alongside layout position in the layout data: `{ x, y, w, h, fontSize? }`.
- `−` decrements by 1px (min 10), `+` increments by 1px (max 40).
- If not set, inherits global font size from `html`.
- Applied as inline `font-size` on the panel's content container.

---

## 3. PanelCanvas Component

### File
`src/lib/components/PanelCanvas.svelte`

### Props
| Prop | Type | Description |
|------|------|-------------|
| `pageId` | `string` | Page path used as layout key (e.g. `"/"`) |
| `children` | `Snippet` | Panel components |

### Layout Modes

**Grid mode (default, no saved layout):**
- Uses CSS Grid to flow panels in their default order.
- Grid definition comes from the page's default layout (e.g. dashboard uses `grid-template-columns: 1fr 1fr` with various `grid-column: span 2` entries).
- Looks identical to the current page layout.

**Freeform mode (user has customized):**
- Container: `position: relative` with explicitly computed height.
- Height formula: `max(panel.y + panel.h for all panels) + 40px` bottom padding. Recalculated after every drag/resize end and on initial render.
- Each panel: `position: absolute; left: {x}px; top: {y}px; width: {w}px; height: {h}px`.
- Positions read from layout store on mount.

### Mode Transition
- Starts in grid mode if no saved layout exists.
- The moment the user drags or resizes ANY panel, the canvas captures current computed positions of ALL panels and switches to freeform mode.
- "Reset layout" button (visible in edit mode, bottom of canvas): deletes saved layout, reverts to grid mode.

---

## 4. Layout Engine

### Store
`src/lib/stores/layout.svelte.ts`

### Data Shape
```typescript
type PanelPosition = {
  x: number;      // px, snapped to 20px grid
  y: number;      // px, snapped to 20px grid
  w: number;      // px, snapped to 20px grid
  h: number;      // px, snapped to 20px grid
  fontSize?: number; // px, per-panel override
};

type PageLayout = {
  mode: 'grid' | 'freeform';
  panels: Record<string, PanelPosition>;
};
```

### Snap-to-Grid
- Grid increment: 20px.
- All positions and sizes snap to nearest 20px on drag/resize end.
- Minimum panel size: 120px × 80px (enforced during resize).

### Drag Behavior
- Initiated by `pointerdown` on the 32px drag handle area.
- During drag: panel moves with pointer, rendered at pointer position (no snapping during move for smooth feel).
- On `pointerup`: position snaps to nearest 20px increment, layout saved.
- Other panels do not move — no collision pushing. Overlap is allowed.

### Resize Behavior
- Initiated by `pointerdown` on the bottom-right resize handle.
- During resize: live preview of new size (panel resizes with pointer).
- On `pointerup`: size snaps to nearest 20px increment (min 120×80), layout saved.

### Capture on First Edit
- When a page is in grid mode and the user performs their first drag/resize:
  1. Get a reference to the `<PanelCanvas>` container element (`canvasEl`).
  2. For each `<Panel>`, compute position relative to the canvas (not viewport): `x = panelEl.offsetLeft`, `y = panelEl.offsetTop` (these are already relative to the nearest positioned ancestor). Alternatively if `getBoundingClientRect()` is used: `x = panelRect.left - canvasRect.left`, `y = panelRect.top - canvasRect.top + canvasEl.scrollTop` (accounting for the scrollable `<main>` container).
  3. Read `width` and `height` from `getBoundingClientRect()`.
  4. Snap each position/size to 20px grid.
  5. Store all positions, set mode to `freeform`.
  6. Compute canvas height: `max(panel.y + panel.h) + 40px`.
  7. Re-render with absolute positioning.

### Exports
- `getPageLayout(pageId: string): PageLayout | null` — read from memory (loaded from localStorage on init).
- `savePageLayout(pageId: string, layout: PageLayout): void` — write to memory + localStorage + debounced SQLite sync.
- `resetPageLayout(pageId: string): void` — delete from memory + localStorage + SQLite.
- `updatePanelPosition(pageId: string, panelId: string, pos: Partial<PanelPosition>): void` — update single panel, triggers save.

---

## 5. Layout Persistence

### localStorage (primary)
- Key pattern: `bmo-layout:{pagePath}` (e.g. `bmo-layout:/`).
- Value: JSON-serialized `PageLayout`.
- Written on every drag/resize end (debounced 300ms to batch rapid adjustments).
- Read on page mount.

### SQLite (backup)
New table in `src/lib/server/db/schema.ts`:

```typescript
export const layouts = sqliteTable('layouts', {
  id:        text('id').primaryKey(),        // pagePath, e.g. "/"
  data:      text('data').notNull(),         // JSON blob (PageLayout)
  updatedAt: integer('updated_at').notNull() // unix timestamp ms
});
```

A corresponding `CREATE TABLE IF NOT EXISTS` block must also be added to `src/lib/server/db/index.ts`, following the existing belt-and-suspenders pattern used by all other tables:

```sql
CREATE TABLE IF NOT EXISTS layouts (
  id         TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### API Routes
`src/routes/api/layouts/+server.ts` — single route using a `page` query parameter (avoids catch-all routing issues with the root `/` path):

| Method | Example | Action |
|--------|---------|--------|
| `GET` | `GET /api/layouts?page=/` | Returns saved layout for page path. 404 if none. |
| `PUT` | `PUT /api/layouts?page=/parts` | Upserts layout data (JSON body: `PageLayout`). |
| `DELETE` | `DELETE /api/layouts?page=/` | Deletes saved layout (reset to default). |

The `page` query parameter is required. Missing or empty returns 400.

### Sync Strategy
- **Save:** After writing to localStorage, fire `PUT /api/layouts?page={encodedPath}` with same data. Debounced 2 seconds.
- **Load:** Read localStorage first (instant). If empty, fetch from `GET /api/layouts?page={encodedPath}`. If SQLite has data, populate localStorage from it.
- **Reset:** Delete from both localStorage and SQLite.
- **No conflict resolution:** localStorage always wins. SQLite is a backup for browser-clear / device-switch.

### Validation
- API validates incoming `PageLayout` shape (panels must have numeric x/y/w/h, mode must be 'grid' | 'freeform').
- Invalid data returns 400.

---

## 6. Dashboard Conversion

The dashboard (`src/routes/+page.svelte`) is the only page converted in Phase 1.

### Current Dashboard Sections → Panel IDs

| Current Section | Panel ID | Default Span |
|----------------|----------|-------------|
| Identity: Soul Code | `dashboard:soul-code` | 1 col |
| Identity: Voice | `dashboard:voice` | 1 col |
| Environment: Sleep | `dashboard:sleep` | 1 col |
| Environment: Room | `dashboard:room` | 1 col |
| Environment: Weather | `dashboard:weather` | 1 col |
| Environment: Resolume | `dashboard:resolume` | 1 col |
| Live State: Mode | `dashboard:mode` | 1 col |
| Live State: Emotion | `dashboard:emotion` | 1 col |
| Live State: Environment | `dashboard:env` | 1 col |
| Live State: Camera | `dashboard:camera` | 1 col |
| Last Haiku | `dashboard:haiku` | 2 col |
| Build Stats | `dashboard:build-stats` | 1 col |
| Dispatcher Log | `dashboard:dispatcher` | 1 col |

### Default Grid Layout
- 2-column grid (matching current layout).
- Panels flow in the order listed above.
- `dashboard:haiku` spans both columns.

### Conversion Approach
- Wrap each section's content in `<Panel id="dashboard:xxx" defaultPosition={...}>`.
- Wrap the whole dashboard in `<PanelCanvas pageId="/">`.
- Move section-level styling (border, background, padding) into Panel's normal-mode rendering.
- Content inside panels remains unchanged.

---

## 7. File Structure

### New Files
```
src/lib/stores/editMode.svelte.ts
src/lib/stores/layout.svelte.ts
src/lib/components/Panel.svelte
src/lib/components/PanelCanvas.svelte
src/lib/components/EditBar.svelte
src/routes/api/layouts/+server.ts
```

### Modified Files
```
src/lib/server/db/schema.ts          — add layouts table
src/lib/server/db/index.ts           — add CREATE TABLE IF NOT EXISTS for layouts
src/lib/components/StatusBar.svelte  — add edit mode toggle button
src/routes/+layout.svelte            — Ctrl+E listener (with input-focus guard), render EditBar
src/routes/+page.svelte              — wrap dashboard in PanelCanvas + Panels
```

### No External Dependencies
All drag/resize uses native pointer events. No libraries added.

---

## 8. Constraints & Non-Goals (Phase 1)

- **Only the dashboard is converted.** Other pages untouched until Phase 2.
- **No sidebar customization.** That's Phase 2.
- **No custom pages.** That's Phase 3.
- **No undo/redo.** Reset-to-default is the escape hatch.
- **No multi-device sync.** SQLite is a backup, not real-time sync.
- **No panel minimize/maximize/close.** All panels are always visible.
- **No touch gesture support.** Pointer events work on touch but no pinch-to-resize or multi-touch.
- **Overlap is allowed.** No collision detection or auto-rearranging.
