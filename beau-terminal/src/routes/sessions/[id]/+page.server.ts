import { db } from '$lib/server/db/index.js';
import { resolumeSessions, resolumeEvents, haikus, photos } from '$lib/server/db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) error(404, 'Invalid session ID');

  const session = db.select().from(resolumeSessions).where(eq(resolumeSessions.id, id)).get();
  if (!session) error(404, 'Session not found');

  const events = db.select().from(resolumeEvents)
    .where(eq(resolumeEvents.sessionId, id))
    .orderBy(resolumeEvents.sequence)
    .all();

  const linkedHaikus = db.select().from(haikus)
    .where(eq(haikus.sessionId, id))
    .orderBy(desc(haikus.createdAt))
    .all();

  const linkedPhotos = db.select().from(photos)
    .where(eq(photos.sessionId, id))
    .orderBy(desc(photos.createdAt))
    .all();

  return { session, events, linkedHaikus, linkedPhotos };
};
