import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { journalEntries } from '$lib/server/db/schema.js';
import { validateVisibility } from '$lib/server/reflective/journal.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    error(400, 'Invalid JSON');
  }

  if (typeof body !== 'object' || body === null) error(400, 'Body must be an object');

  const data = body as Record<string, unknown>;

  if (typeof data.body !== 'string' || data.body.trim().length === 0) {
    error(400, 'Missing required field: body');
  }

  const values = {
    body: data.body as string,
    title: typeof data.title === 'string' ? data.title : null,
    entryAt: typeof data.entryAt === 'string' ? data.entryAt : new Date().toISOString(),
    mood: typeof data.mood === 'string' ? data.mood : null,
    tagsJson: Array.isArray(data.tags) ? JSON.stringify(data.tags) : null,
    visibility: validateVisibility(data.visibility),
    filePath: typeof data.filePath === 'string' ? data.filePath : null,
  };

  const result = db.insert(journalEntries).values(values).returning().get();
  return json({ id: result.id }, { status: 201 });
};

export const GET: RequestHandler = async ({ url }) => {
  const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit') ?? 20)), 100);

  // Metadata only — no body text via API (privacy)
  const entries = db.select({
    id: journalEntries.id,
    entryAt: journalEntries.entryAt,
    title: journalEntries.title,
    mood: journalEntries.mood,
    visibility: journalEntries.visibility,
    createdAt: journalEntries.createdAt,
  })
    .from(journalEntries)
    .orderBy(journalEntries.entryAt)
    .limit(limit)
    .all();

  return json({ entries, count: entries.length });
};
