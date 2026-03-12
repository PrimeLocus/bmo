import { db } from '$lib/server/db/index.js';
import { haikus } from '$lib/server/db/schema.js';
import { desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
  return { haikus: db.select().from(haikus).orderBy(desc(haikus.createdAt)).all() };
};
