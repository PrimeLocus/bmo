import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { customPages } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const RESERVED_SLUGS = new Set([
  'identity', 'presence', 'parts', 'software', 'ideas', 'todo',
  'memory', 'prompt', 'settings', 'haikus', 'sessions', 'photography',
  'journal', 'integrations', 'api', 'ws', 'photos', 'custom',
]);

function isValidSlug(slug: string): boolean {
  if (!slug || slug.length > 40) return false;
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && !/^[a-z0-9]$/.test(slug)) return false;
  if (RESERVED_SLUGS.has(slug)) return false;
  return true;
}

export const GET: RequestHandler = async () => {
  const pages = db.select().from(customPages).all();
  return json(pages);
};

export const POST: RequestHandler = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  const icon = typeof body.icon === 'string' ? body.icon.trim() : '📄';
  const groupName = typeof body.groupName === 'string' ? body.groupName.trim() : 'BEAU';
  const sortOrder = typeof body.sortOrder === 'number' ? body.sortOrder : 0;

  if (!name) throw error(400, 'Name is required');
  if (!isValidSlug(slug)) throw error(400, 'Invalid slug');

  // Check uniqueness
  const existing = db.select().from(customPages).where(eq(customPages.slug, slug)).get();
  if (existing) throw error(409, 'Slug already exists');

  const now = Date.now();
  const id = nanoid();
  db.insert(customPages).values({
    id,
    name,
    slug,
    icon,
    groupName,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  }).run();

  return json({ id, name, slug, icon, groupName, sortOrder }, { status: 201 });
};
