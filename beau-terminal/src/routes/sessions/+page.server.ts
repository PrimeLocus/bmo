import { db } from '$lib/server/db/index.js';
import { resolumeSessions } from '$lib/server/db/schema.js';
import { desc, count } from 'drizzle-orm';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ url }) => {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const perPage = 20;
  const offset = (page - 1) * perPage;

  const sessions = db.select().from(resolumeSessions)
    .orderBy(desc(resolumeSessions.startedAt))
    .limit(perPage)
    .offset(offset)
    .all();

  const total = db.select({ n: count() }).from(resolumeSessions).get()?.n ?? 0;

  return {
    sessions,
    page,
    totalPages: Math.ceil(total / perPage),
  };
};
