// src/lib/stores/gridEngine.ts
// Pure-function grid layout engine — no Svelte, no DOM.
// 12-column grid with collision detection, push-down, and upward compaction.

export type GridPosition = {
  col: number;     // 0-based column start (0–11)
  row: number;     // 0-based row start
  colSpan: number; // columns wide (1–12)
  rowSpan: number; // rows tall (1+)
  fontSize?: number;
};

export const GRID_COLS = 12;
export const DEFAULT_ROW_HEIGHT = 80;
export const MIN_COL_SPAN = 2;
export const MIN_ROW_SPAN = 1;

/** AABB overlap check in grid space */
export function overlaps(a: GridPosition, b: GridPosition): boolean {
  return (
    a.col < b.col + b.colSpan &&
    a.col + a.colSpan > b.col &&
    a.row < b.row + b.rowSpan &&
    a.row + a.rowSpan > b.row
  );
}

/** Clamp position so it stays within the 12-column boundary */
export function clampToGrid(pos: GridPosition): GridPosition {
  const colSpan = Math.max(MIN_COL_SPAN, Math.min(GRID_COLS, pos.colSpan));
  const rowSpan = Math.max(MIN_ROW_SPAN, pos.rowSpan);
  const col = Math.max(0, Math.min(GRID_COLS - colSpan, pos.col));
  const row = Math.max(0, pos.row);
  return { col, row, colSpan, rowSpan, ...(pos.fontSize !== undefined ? { fontSize: pos.fontSize } : {}) };
}

/**
 * Push colliding panels down until no overlaps remain.
 * The panel identified by `changedId` stays fixed; others move.
 */
export function pushDown(
  panels: Record<string, GridPosition>,
  changedId: string
): Record<string, GridPosition> {
  const result = { ...panels };
  const changed = result[changedId];
  if (!changed) return result;

  // Iteratively resolve collisions — max 50 passes to prevent infinite loop
  let dirty = true;
  let passes = 0;
  while (dirty && passes < 50) {
    dirty = false;
    passes++;
    for (const [id, pos] of Object.entries(result)) {
      if (id === changedId) continue;
      if (overlaps(changed, pos)) {
        // Push this panel below the changed panel
        result[id] = { ...pos, row: changed.row + changed.rowSpan };
        dirty = true;
      }
    }
    // Now check if the pushed panels collide with each other
    const ids = Object.keys(result).filter((k) => k !== changedId);
    // Sort by row so we resolve top-down
    ids.sort((a, b) => result[a].row - result[b].row);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = result[ids[i]];
        const b = result[ids[j]];
        if (overlaps(a, b)) {
          // Push the lower one further down
          result[ids[j]] = { ...b, row: a.row + a.rowSpan };
          dirty = true;
        }
      }
    }
  }
  return result;
}

/**
 * Compact all panels upward: move each panel (sorted by row) as far up as possible
 * without overlapping any panel above it.
 */
export function compact(panels: Record<string, GridPosition>): Record<string, GridPosition> {
  const result = { ...panels };
  // Sort by row, then by col for stable ordering
  const ids = Object.keys(result).sort((a, b) => {
    const rowDiff = result[a].row - result[b].row;
    return rowDiff !== 0 ? rowDiff : result[a].col - result[b].col;
  });

  for (const id of ids) {
    const pos = { ...result[id] };
    // Try to move up row by row
    while (pos.row > 0) {
      const candidate = { ...pos, row: pos.row - 1 };
      const collides = ids.some(
        (otherId) => otherId !== id && overlaps(candidate, result[otherId])
      );
      if (collides) break;
      pos.row = candidate.row;
    }
    result[id] = pos;
  }
  return result;
}

/**
 * Apply a move/resize: clamp to grid, push colliders down, then compact everything.
 */
export function applyMove(
  panels: Record<string, GridPosition>,
  id: string,
  proposed: GridPosition
): Record<string, GridPosition> {
  const clamped = clampToGrid(proposed);
  const updated = { ...panels, [id]: clamped };
  const pushed = pushDown(updated, id);
  return compact(pushed);
}
