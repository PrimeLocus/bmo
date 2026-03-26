import { db } from '$lib/server/db/index.js';
import { softwarePhases, softwareSteps, entityLinks, parts } from '$lib/server/db/schema.js';
import { eq, asc, and, inArray } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types.js';
import { logActivity } from '$lib/server/db/activity.js';

export const load: PageServerLoad = async () => {
  const phases = db.select().from(softwarePhases).orderBy(asc(softwarePhases.order)).all();
  const steps = db.select().from(softwareSteps).all();
  const stepLinks = db
    .select()
    .from(entityLinks)
    .where(and(eq(entityLinks.targetType, 'step'), eq(entityLinks.relationship, 'blocks')))
    .all();

  // Collect all required part IDs across all steps
  const allPartIds = new Set<number>();
  for (const s of steps) {
    const reqIds = JSON.parse(s.requiredPartIds || '[]') as number[];
    reqIds.forEach(id => allPartIds.add(id));
  }

  // Fetch required parts in a single query
  const requiredParts = allPartIds.size > 0
    ? db.select().from(parts).where(inArray(parts.id, [...allPartIds])).all()
    : [];
  const partsMap = new Map(requiredParts.map(p => [p.id, p]));

  return {
    phases: phases.map(p => ({
      ...p,
      steps: steps
        .filter(s => s.phaseId === p.id)
        .sort((a, b) => a.order - b.order)
        .map(s => {
          const reqIds = JSON.parse(s.requiredPartIds || '[]') as number[];
          const blockingParts = reqIds
            .filter(id => {
              const part = partsMap.get(id);
              return part && part.status !== 'delivered' && part.status !== 'installed';
            })
            .map(id => {
              const part = partsMap.get(id)!;
              return {
                id: part.id,
                name: part.name,
                status: part.status,
                eta: part.expectedDelivery || part.eta || null,
              };
            });
          return {
            ...s,
            links: JSON.parse(s.links || '[]') as Array<{ label: string; url: string; kind: string }>,
            requiredPartIds: reqIds,
            blockingParts,
          };
        }),
    })),
    stepLinks,
  };
};

export const actions: Actions = {
  toggle: async ({ request }) => {
    const form = await request.formData();
    const id = form.get('id') as string;
    const done = form.get('done') === 'true';
    if (!id) return fail(400, { error: 'missing id' });
    const step = db.select().from(softwareSteps).where(eq(softwareSteps.id, id)).get();
    db.update(softwareSteps).set({ done: !done }).where(eq(softwareSteps.id, id)).run();
    logActivity('step', id, !done ? 'completed' : 'updated', `${step?.text ?? 'step'} — ${!done ? 'done' : 'undone'}`);
    return { success: true };
  },
};
