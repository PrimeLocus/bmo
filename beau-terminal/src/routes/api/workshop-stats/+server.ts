import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { parts, softwareSteps } from '$lib/server/db/schema.js';

export const GET: RequestHandler = async () => {
  const allParts = db.select().from(parts).all();
  const allSteps = db.select().from(softwareSteps).all();

  const received = allParts.filter(p =>
    p.status === 'delivered' || p.status === 'installed'
  ).length;

  return json({
    partsReceived: received,
    partsTotal: allParts.length,
    stepsDone: allSteps.filter(s => s.done).length,
    stepsTotal: allSteps.length
  });
};
