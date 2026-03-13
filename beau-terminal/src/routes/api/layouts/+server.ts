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
