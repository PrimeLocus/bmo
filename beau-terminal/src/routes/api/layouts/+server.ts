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
  // Reject old pixel layouts that had 'mode'
  if ('mode' in d) return false;
  // Allow nav config (stored under __nav__)
  if (!d.panels && Array.isArray(d.groups) && Array.isArray(d.items)) return true;
  if (!d.panels || typeof d.panels !== 'object') return false;
  for (const panel of Object.values(d.panels as Record<string, unknown>)) {
    if (!panel || typeof panel !== 'object') return false;
    const p = panel as Record<string, unknown>;
    if (typeof p.col !== 'number' || !Number.isInteger(p.col)) return false;
    if (typeof p.row !== 'number' || !Number.isInteger(p.row)) return false;
    if (typeof p.colSpan !== 'number' || !Number.isInteger(p.colSpan)) return false;
    if (typeof p.rowSpan !== 'number' || !Number.isInteger(p.rowSpan)) return false;
    if (p.fontSize !== undefined && typeof p.fontSize !== 'number') return false;
    if (p.widgetId !== undefined && typeof p.widgetId !== 'string') return false;
    if (p.instanceId !== undefined && typeof p.instanceId !== 'string') return false;
    if (p.config !== undefined && (typeof p.config !== 'object' || p.config === null)) return false;
  }
  // Optional hiddenPanels: array of strings
  if (d.hiddenPanels !== undefined) {
    if (!Array.isArray(d.hiddenPanels)) return false;
    if (d.hiddenPanels.some((v: unknown) => typeof v !== 'string')) return false;
  }
  return true;
}

export const GET: RequestHandler = async ({ url }) => {
  const page = getPageParam(url);
  const row = db.select().from(layouts).where(eq(layouts.id, page)).get();
  if (!row) throw error(404, 'No saved layout');
  try {
    const data = JSON.parse(row.data);
    // If stored data is old pixel format, treat as missing (self-heal)
    if (!validateLayout(data)) throw error(404, 'No saved layout');
    return json(data);
  } catch {
    throw error(404, 'No saved layout');
  }
};

export const PUT: RequestHandler = async ({ url, request }) => {
  const page = getPageParam(url);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON body');
  }
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
