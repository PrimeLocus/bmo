import type { PageServerLoad } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { environmentSnapshots, environmentEvents } from '$lib/server/db/schema.js';
import { desc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
  const latestSnapshot = db.select().from(environmentSnapshots)
    .orderBy(desc(environmentSnapshots.id))
    .limit(1)
    .get() ?? null;

  const recentEvents = db.select().from(environmentEvents)
    .orderBy(desc(environmentEvents.id))
    .limit(50)
    .all();

  return { latestSnapshot, recentEvents };
};
