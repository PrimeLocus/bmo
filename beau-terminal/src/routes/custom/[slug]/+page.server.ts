import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { customPages, layouts } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params }) => {
  const page = db.select().from(customPages).where(eq(customPages.slug, params.slug)).get();
  if (!page) throw error(404, 'Page not found');

  // Load the saved layout to see which widgets need server data
  const layoutId = `custom:${params.slug}`;
  const layoutRow = db.select().from(layouts).where(eq(layouts.id, layoutId)).get();

  let widgetData: Record<string, unknown> = {};

  if (layoutRow) {
    try {
      const layoutData = JSON.parse(layoutRow.data);
      if (layoutData.panels && typeof layoutData.panels === 'object') {
        // Pre-fetch data for database-backed widgets
        const { getWidgetMeta } = await import('$lib/widgets/registry.js');
        for (const [panelId, panel] of Object.entries(layoutData.panels as Record<string, Record<string, unknown>>)) {
          const widgetId = panel.widgetId;
          if (typeof widgetId !== 'string') continue;
          const meta = getWidgetMeta(widgetId);
          if (!meta || meta.dataKind !== 'database') continue;
          // Fetch data using the same logic as the widget data API
          try {
            const { loadWidgetData } = await import('$lib/server/widgets/loaders.js');
            widgetData[panelId] = await loadWidgetData(widgetId, (panel.config ?? {}) as Record<string, unknown>);
          } catch {
            // Widget data fetch failed — widget will fetch client-side
          }
        }
      }
    } catch {
      // Layout parse failed — no widget data
    }
  }

  return {
    page,
    widgetData,
  };
};
