import { db } from '$lib/server/db/index.js';
import { parts, softwareSteps } from '$lib/server/db/schema.js';
import { count, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
  const partsCount = db.select({ n: count() }).from(parts).get()?.n ?? 0;
  const totalSteps = db.select({ n: count() }).from(softwareSteps).get()?.n ?? 0;
  const doneSteps = db.select({ n: count() }).from(softwareSteps).where(eq(softwareSteps.done, true)).get()?.n ?? 0;
  const totalCost = db.select().from(parts).all().reduce((sum, p) => sum + p.price, 0);
  return { partsCount, totalSteps, doneSteps, totalCost };
};
