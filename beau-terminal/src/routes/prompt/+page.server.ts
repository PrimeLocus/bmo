import { db } from '$lib/server/db/index.js';
import { promptHistory } from '$lib/server/db/schema.js';
import { desc } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { publishToMQTT } from '$lib/server/mqtt/bridge.js';
import type { Actions, PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
  return { history: db.select().from(promptHistory).orderBy(desc(promptHistory.createdAt)).limit(30).all() };
};

export const actions: Actions = {
  send: async ({ request }) => {
    const form = await request.formData();
    const topic = (form.get('topic') as string)?.trim();
    const content = (form.get('content') as string)?.trim();
    const label = (form.get('label') as string)?.trim() || '';

    if (!topic || !content) return fail(400, { error: 'topic and content required' });

    publishToMQTT(topic, content);

    db.insert(promptHistory).values({
      content: `[${topic}] ${content}`,
      label,
      createdAt: new Date(),
    }).run();

    return { success: true };
  },
};
