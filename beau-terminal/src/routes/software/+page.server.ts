import { db } from '$lib/server/db/index.js';
import { softwarePhases, softwareSteps, entityLinks } from '$lib/server/db/schema.js';
import { eq, asc, and } from 'drizzle-orm';
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
  return {
    phases: phases.map(p => ({
      ...p,
      steps: steps
        .filter(s => s.phaseId === p.id)
        .sort((a, b) => a.order - b.order)
        .map(s => ({
          ...s,
          links: JSON.parse(s.links || '[]') as Array<{ label: string; url: string; kind: string }>,
        })),
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
