import { db } from '$lib/server/db/index.js';
import { ideas } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
  return {
    ideas: db.select().from(ideas).all().map(i => ({
      ...i,
      links: JSON.parse(i.links || '[]') as Array<{ label: string; url: string; kind: string }>,
    })),
  };
};

export const actions: Actions = {
  toggle: async ({ request }) => {
    const form = await request.formData();
    const id = form.get('id') as string;
    const done = form.get('done') === 'true';
    if (!id) return fail(400, { error: 'missing id' });
    db.update(ideas).set({ done: !done }).where(eq(ideas.id, id)).run();
    return { success: true };
  },

  add: async ({ request }) => {
    const form = await request.formData();
    const text = (form.get('text') as string)?.trim();
    const priority = (form.get('priority') as string) || 'medium';
    if (!text) return fail(400, { error: 'text required' });
    const id = crypto.randomUUID();
    db.insert(ideas).values({ id, text, priority, done: false }).run();
    return { success: true };
  },

  update: async ({ request }) => {
    const form = await request.formData();
    const id = form.get('id') as string;
    const text = (form.get('text') as string)?.trim();
    const priority = (form.get('priority') as string) || 'medium';
    const links = form.get('links') as string;
    if (!id || !text) return fail(400, { error: 'missing fields' });
    db.update(ideas).set({ text, priority, links: links || '[]' }).where(eq(ideas.id, id)).run();
    return { success: true };
  },

  delete: async ({ request }) => {
    const form = await request.formData();
    const id = form.get('id') as string;
    if (!id) return fail(400, { error: 'missing id' });
    db.delete(ideas).where(eq(ideas.id, id)).run();
    return { success: true };
  },
};
