import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { entityLinks } from '$lib/server/db/schema.js';
import { eq, and } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
  const sourceType = url.searchParams.get('sourceType');
  const sourceId = url.searchParams.get('sourceId');
  if (!sourceType || !sourceId) return json({ links: [] });

  try {
    const links = db
      .select()
      .from(entityLinks)
      .where(and(eq(entityLinks.sourceType, sourceType), eq(entityLinks.sourceId, sourceId)))
      .all();

    return json({ links });
  } catch {
    return json({ links: [] });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const typed = body as Record<string, unknown>;
  const { sourceType, sourceId, targetType, targetId, relationship } = typed;

  if (
    !sourceType ||
    !sourceId ||
    !targetType ||
    !targetId ||
    !relationship ||
    typeof sourceType !== 'string' ||
    typeof targetType !== 'string' ||
    typeof relationship !== 'string'
  ) {
    return json({ error: 'all fields required: sourceType, sourceId, targetType, targetId, relationship' }, { status: 400 });
  }

  try {
    db.insert(entityLinks)
      .values({
        sourceType,
        sourceId: String(sourceId),
        targetType,
        targetId: String(targetId),
        relationship
      })
      .run();
    return json({ ok: true });
  } catch (err) {
    console.error('Error inserting entity link:', err);
    return json({ error: 'Failed to create link' }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ url }) => {
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id required' }, { status: 400 });

  try {
    const linkId = Number(id);
    if (!Number.isInteger(linkId)) {
      return json({ error: 'id must be a valid integer' }, { status: 400 });
    }
    db.delete(entityLinks).where(eq(entityLinks.id, linkId)).run();
    return json({ ok: true });
  } catch (err) {
    console.error('Error deleting entity link:', err);
    return json({ error: 'Failed to delete link' }, { status: 500 });
  }
};
