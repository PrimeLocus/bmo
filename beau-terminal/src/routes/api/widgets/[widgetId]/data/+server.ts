import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { loadWidgetData } from '$lib/server/widgets/loaders.js';

export const GET: RequestHandler = async ({ params, url }) => {
  const { widgetId } = params;
  let config: Record<string, unknown> = {};
  try {
    const raw = url.searchParams.get('config');
    if (raw) config = JSON.parse(raw);
  } catch { /* use empty config */ }

  const data = await loadWidgetData(widgetId, config);
  if (data === null && widgetId !== 'soul-code' && widgetId !== 'natal-chart') {
    throw error(404, `Unknown widget: ${widgetId}`);
  }
  return json(data);
};
