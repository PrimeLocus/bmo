import { nanoid } from 'nanoid';
import type { GridPosition } from '../stores/layout.svelte.js';

export type PageTemplate = {
  label: string;
  icon: string;
  description: string;
  layout: Array<{ widgetId: string; col: number; row: number; colSpan: number; rowSpan: number; config: Record<string, unknown> }>;
};

function tpl(widgetId: string, col: number, row: number, colSpan: number, rowSpan: number, config: Record<string, unknown> = {}) {
  return { widgetId, col, row, colSpan, rowSpan, config };
}

export const PAGE_TEMPLATES: Record<string, PageTemplate> = {
  'vj-session': {
    label: 'VJ Session',
    icon: '▶',
    description: 'Resolume + haiku + prompt console for live sessions',
    layout: [
      tpl('resolume-session', 0, 0, 8, 3),
      tpl('beau-vitals', 8, 0, 4, 1),
      tpl('last-haiku', 8, 1, 4, 2),
      tpl('prompt-console', 0, 3, 8, 3),
      tpl('bmo-face', 8, 3, 4, 1),
      tpl('dispatcher-log', 8, 4, 4, 2),
    ]
  },
  'build-focus': {
    label: 'Build Focus',
    icon: '⬡',
    description: 'Parts + software + stats for assembly days',
    layout: [
      tpl('parts-tracker', 0, 0, 8, 4),
      tpl('build-stats', 8, 0, 4, 2),
      tpl('blocked-waiting', 8, 2, 4, 2),
      tpl('software-build', 0, 4, 8, 3),
      tpl('next-steps', 8, 4, 4, 3),
    ]
  },
  'session-lounge': {
    label: 'Session Lounge',
    icon: '~',
    description: 'Device session monitor + vitals + haiku for ambient sessions',
    layout: [
      tpl('wellness-session', 0, 0, 6, 3),
      tpl('beau-vitals', 6, 0, 6, 2),
      tpl('last-haiku', 6, 2, 6, 2),
      tpl('bmo-face', 0, 3, 3, 1),
      tpl('weather', 3, 3, 3, 1),
      tpl('wellness-log', 0, 4, 12, 4),
    ]
  },
  'daily-review': {
    label: 'Daily Review',
    icon: '◈',
    description: 'Activity + vitals + haiku + journal for reflection',
    layout: [
      tpl('recent-activity', 0, 0, 8, 3),
      tpl('beau-vitals', 8, 0, 4, 1),
      tpl('bmo-face', 8, 1, 4, 2),
      tpl('last-haiku', 0, 3, 6, 2),
      tpl('workshop-progress', 6, 3, 6, 2),
    ]
  }
};

/** Convert a template layout into panel grid positions with unique IDs */
export function instantiateTemplate(template: PageTemplate): Record<string, GridPosition> {
  const panels: Record<string, GridPosition> = {};
  for (const item of template.layout) {
    const panelId = `w:${item.widgetId}:${nanoid(8)}`;
    panels[panelId] = {
      col: item.col,
      row: item.row,
      colSpan: item.colSpan,
      rowSpan: item.rowSpan,
      widgetId: item.widgetId,
      config: item.config,
    };
  }
  return panels;
}
