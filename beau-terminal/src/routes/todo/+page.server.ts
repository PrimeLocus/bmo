import { db } from '$lib/server/db/index.js';
import { todos } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types.js';
import { logActivity } from '$lib/server/db/activity.js';

export const load: PageServerLoad = async () => {
  return { todos: db.select().from(todos).orderBy(todos.sortOrder, todos.createdAt).all() };
};

export const actions: Actions = {
  add: async ({ request }) => {
    const form = await request.formData();
    const text = (form.get('text') as string)?.trim();
    if (!text) return fail(400, { error: 'text required' });
    const section = (form.get('section') as string)?.trim() ?? '';
    const priority = (form.get('priority') as string) ?? 'medium';
    const maxOrder = db.select().from(todos).all().reduce((m, t) => Math.max(m, t.sortOrder), 0);
    const result = db.insert(todos).values({
      text,
      section,
      priority,
      done: false,
      sortOrder: maxOrder + 1,
      createdAt: new Date(),
    }).run();
    logActivity('task', Number(result.lastInsertRowid), 'created', 'New task: ' + text.substring(0, 60));
    return { success: true };
  },

  toggle: async ({ request }) => {
    const form = await request.formData();
    const id = Number(form.get('id'));
    if (!id) return fail(400, { error: 'missing id' });
    const todo = db.select().from(todos).where(eq(todos.id, id)).get();
    if (!todo) return fail(404, { error: 'not found' });
    db.update(todos).set({ done: !todo.done }).where(eq(todos.id, id)).run();
    logActivity('task', id, !todo.done ? 'completed' : 'updated', `${todo.text?.substring(0, 60) ?? 'task'} — ${!todo.done ? 'done' : 'undone'}`);
    return { success: true };
  },

  delete: async ({ request }) => {
    const form = await request.formData();
    const id = Number(form.get('id'));
    if (!id) return fail(400, { error: 'missing id' });
    const todo = db.select().from(todos).where(eq(todos.id, id)).get();
    db.delete(todos).where(eq(todos.id, id)).run();
    logActivity('task', id, 'deleted', 'Deleted task: ' + (todo?.text?.substring(0, 60) ?? 'unknown'));
    return { success: true };
  },

  clearDone: async () => {
    const { gt } = await import('drizzle-orm');
    db.delete(todos).where(eq(todos.done, true)).run();
    return { success: true };
  },

  updateSection: async ({ request }) => {
    const form = await request.formData();
    const id = Number(form.get('id'));
    const section = (form.get('section') as string)?.trim() ?? '';
    if (!id) return fail(400, { error: 'missing id' });
    db.update(todos).set({ section }).where(eq(todos.id, id)).run();
    return { success: true };
  },
};
