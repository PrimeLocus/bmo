import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { customPages } from '$lib/server/db/schema.js';
import { layouts } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params }) => {
  const row = db.select().from(customPages).where(eq(customPages.id, params.id)).get();
  if (!row) throw error(404, 'Page not found');
  return json(row);
};

export const PUT: RequestHandler = async ({ params, request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const existing = db.select().from(customPages).where(eq(customPages.id, params.id)).get();
  if (!existing) throw error(404, 'Page not found');

  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  if (typeof body.name === 'string') updates.name = body.name.trim();
  if (typeof body.icon === 'string') updates.icon = body.icon.trim();
  if (typeof body.groupName === 'string') updates.groupName = body.groupName.trim();
  if (typeof body.sortOrder === 'number') updates.sortOrder = body.sortOrder;

  db.update(customPages).set(updates).where(eq(customPages.id, params.id)).run();
  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params }) => {
  const existing = db.select().from(customPages).where(eq(customPages.id, params.id)).get();
  if (!existing) throw error(404, 'Page not found');

  // Also delete the associated layout
  const layoutId = `page:${existing.slug}`;
  db.delete(layouts).where(eq(layouts.id, layoutId)).run();
  db.delete(customPages).where(eq(customPages.id, params.id)).run();
  return json({ ok: true });
};
