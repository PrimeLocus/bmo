// src/lib/stores/layout.svelte.ts
// Reactive layout store for the 12-column CSS grid system.

import { type GridPosition, GRID_COLS, DEFAULT_ROW_HEIGHT, MIN_COL_SPAN, MIN_ROW_SPAN } from './gridEngine.js';

export type GridLayout = {
  panels: Record<string, GridPosition>;
  hiddenPanels?: string[];  // panel IDs that should not render
};

export { type GridPosition, GRID_COLS, DEFAULT_ROW_HEIGHT, MIN_COL_SPAN, MIN_ROW_SPAN };

// In-memory reactive cache of all page layouts
const _layouts = $state<Record<string, GridLayout | undefined>>({});

// Debounce timers for SQLite sync
const syncTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function lsKey(pageId: string): string {
  return `bmo-layout:${pageId}`;
}

/** Validate that a parsed object matches the new GridPosition shape */
function isValidGridLayout(data: unknown): data is GridLayout {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  // Reject old pixel layouts that had a 'mode' field
  if ('mode' in d) return false;
  if (!d.panels || typeof d.panels !== 'object') return false;
  for (const panel of Object.values(d.panels as Record<string, unknown>)) {
    if (!panel || typeof panel !== 'object') return false;
    const p = panel as Record<string, unknown>;
    if (typeof p.col !== 'number' || typeof p.row !== 'number') return false;
    if (typeof p.colSpan !== 'number' || typeof p.rowSpan !== 'number') return false;
    if (p.fontSize !== undefined && typeof p.fontSize !== 'number') return false;
  }
  // Optional hiddenPanels must be an array of strings
  if (d.hiddenPanels !== undefined) {
    if (!Array.isArray(d.hiddenPanels)) return false;
    if (d.hiddenPanels.some((v: unknown) => typeof v !== 'string')) return false;
  }
  return true;
}

function readLS(pageId: string): GridLayout | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(lsKey(pageId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (isValidGridLayout(parsed)) return parsed;
    // Old pixel-based layout — clear it
    localStorage.removeItem(lsKey(pageId));
    return null;
  } catch {
    return null;
  }
}

function writeLS(pageId: string, layout: GridLayout) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(lsKey(pageId), JSON.stringify(layout));
}

function deleteLS(pageId: string) {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(lsKey(pageId));
}

function scheduleSQLiteSync(pageId: string, layout: GridLayout) {
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
export function getPageLayout(pageId: string): GridLayout | undefined {
  if (_layouts[pageId]) return _layouts[pageId];
  return readLS(pageId) ?? undefined;
}

/** Async read — tries memory, localStorage, then SQLite fallback. */
export async function loadPageLayout(pageId: string): Promise<GridLayout | undefined> {
  const sync = getPageLayout(pageId);
  if (sync) return sync;
  // SQLite fallback
  if (typeof fetch === 'undefined') return undefined;
  try {
    const res = await fetch(`/api/layouts?page=${encodeURIComponent(pageId)}`);
    if (!res.ok) return undefined;
    const data = await res.json();
    if (!isValidGridLayout(data)) return undefined;
    _layouts[pageId] = data;
    writeLS(pageId, data);
    return data;
  } catch {
    return undefined;
  }
}

export function savePageLayout(pageId: string, layout: GridLayout) {
  const saved: GridLayout = { panels: { ...layout.panels } };
  if (layout.hiddenPanels?.length) saved.hiddenPanels = [...layout.hiddenPanels];
  _layouts[pageId] = saved;
  writeLS(pageId, saved);
  scheduleSQLiteSync(pageId, saved);
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
  pos: Partial<GridPosition>
) {
  const layout = _layouts[pageId];
  if (!layout) return;
  const updated: GridLayout = {
    panels: {
      ...layout.panels,
      [panelId]: { ...layout.panels[panelId], ...pos },
    },
  };
  savePageLayout(pageId, updated);
}

/**
 * Memory-only update for live resize/drag preview — no localStorage/SQLite write.
 * This avoids thrashing persistence during pointer moves.
 */
export function updatePanelPreview(
  pageId: string,
  panelId: string,
  partial: Partial<GridPosition>
) {
  const layout = _layouts[pageId];
  if (!layout) return;
  _layouts[pageId] = {
    ...layout,
    panels: {
      ...layout.panels,
      [panelId]: { ...layout.panels[panelId], ...partial },
    },
  };
}

/** Toggle a panel's visibility (hidden/shown). */
export function togglePanelVisibility(pageId: string, panelId: string) {
  const layout = _layouts[pageId];
  if (!layout) return;
  const hidden = layout.hiddenPanels ?? [];
  const idx = hidden.indexOf(panelId);
  const updated: GridLayout = {
    ...layout,
    hiddenPanels: idx >= 0 ? hidden.filter(id => id !== panelId) : [...hidden, panelId],
  };
  savePageLayout(pageId, updated);
}

/** Check if a panel is hidden on a given page. */
export function isPanelHidden(pageId: string, panelId: string): boolean {
  const layout = getPageLayout(pageId);
  return layout?.hiddenPanels?.includes(panelId) ?? false;
}
