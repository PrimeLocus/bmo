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
