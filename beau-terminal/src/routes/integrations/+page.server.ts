import { db } from '$lib/server/db/index.js';
import { integrations } from '$lib/server/db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
  return {
    integrations: db.select().from(integrations).orderBy(asc(integrations.sortOrder)).all(),
  };
};

async function runHealthCheck(type: string, healthCheck: string | null, endpoint: string | null): Promise<'online' | 'offline' | 'unknown'> {
  if (!healthCheck || healthCheck === 'none') return 'unknown';

  if (healthCheck === 'http-get' && endpoint) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timeout);
      return res.ok ? 'online' : 'offline';
    } catch {
      return 'offline';
    }
  }

  if (healthCheck === 'mqtt-ping') {
    // MQTT connectivity is reflected in bridge — treat as unknown here since
    // the client-side beauState.online covers it.
    return 'unknown';
  }

  return 'unknown';
}

export const actions: Actions = {
  add: async ({ request }) => {
    const form = await request.formData();
    const name = (form.get('name') as string)?.trim();
    if (!name) return fail(400, { error: 'name is required' });

    const icon = (form.get('icon') as string)?.trim() || '⚡';
    const type = (form.get('type') as string)?.trim() || 'custom';
    const endpoint = (form.get('endpoint') as string)?.trim() || null;
    const healthCheck = (form.get('healthCheck') as string)?.trim() || 'none';
    const notes = (form.get('notes') as string)?.trim() || null;

    // Place at end
    const all = db.select().from(integrations).all();
    const maxOrder = all.reduce((m, i) => Math.max(m, i.sortOrder), -1);

    db.insert(integrations).values({
      name,
      icon,
      type,
      endpoint,
      healthCheck,
      notes,
      sortOrder: maxOrder + 1,
    }).run();

    return { success: true };
  },

  update: async ({ request }) => {
    const form = await request.formData();
    const id = Number(form.get('id'));
    if (!id) return fail(400, { error: 'missing id' });

    const endpoint = form.get('endpoint') as string | null;
    const notes = form.get('notes') as string | null;
    const config = form.get('config') as string | null;
    const icon = form.get('icon') as string | null;
    const name = form.get('name') as string | null;
    const type = form.get('type') as string | null;
    const healthCheck = form.get('healthCheck') as string | null;

    db.update(integrations)
      .set({
        ...(name !== null ? { name: name.trim() } : {}),
        ...(icon !== null ? { icon: icon.trim() } : {}),
        ...(type !== null ? { type: type.trim() } : {}),
        ...(endpoint !== null ? { endpoint: endpoint.trim() || null } : {}),
        ...(notes !== null ? { notes: notes.trim() || null } : {}),
        ...(config !== null ? { config: config.trim() || null } : {}),
        ...(healthCheck !== null ? { healthCheck: healthCheck.trim() } : {}),
      })
      .where(eq(integrations.id, id))
      .run();

    return { success: true };
  },

  delete: async ({ request }) => {
    const form = await request.formData();
    const id = Number(form.get('id'));
    if (!id) return fail(400, { error: 'missing id' });

    db.delete(integrations).where(eq(integrations.id, id)).run();
    return { success: true };
  },

  test: async ({ request }) => {
    const form = await request.formData();
    const id = Number(form.get('id'));
    if (!id) return fail(400, { error: 'missing id' });

    const integration = db.select().from(integrations).where(eq(integrations.id, id)).get();
    if (!integration) return fail(404, { error: 'not found' });

    const status = await runHealthCheck(
      integration.type,
      integration.healthCheck,
      integration.endpoint
    );

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    db.update(integrations)
      .set({ status, lastSeen: status === 'online' ? now : integration.lastSeen })
      .where(eq(integrations.id, id))
      .run();

    return { success: true, status };
  },
};
