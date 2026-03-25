import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { captures, ideas, todos } from '$lib/server/db/schema.js';
import { logActivity } from '$lib/server/db/activity.js';
import { enqueueMemory } from '$lib/server/memory/index.js';
import { nanoid } from 'nanoid';

export const POST: RequestHandler = async ({ request }) => {
  let body: { text?: unknown; type?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, { status: 400 });
  }

  const { text, type } = body;

  if (typeof text !== 'string' || typeof type !== 'string') {
    return json({ error: 'text and type required' }, { status: 400 });
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return json({ error: 'text cannot be empty' }, { status: 400 });
  }

  if (trimmed.length > 2000) {
    return json({ error: 'text too long (max 2000 chars)' }, { status: 400 });
  }

  switch (type) {
    case 'idea': {
      const id = nanoid(8);
      db.insert(ideas).values({
        id,
        text: trimmed,
        priority: 'medium',
        done: false,
        links: '[]'
      }).run();
      logActivity('idea', id, 'created', `Captured idea: ${trimmed.substring(0, 60)}`);
      return json({ ok: true, type: 'idea', id });
    }
    case 'task': {
      // todos table uses integer auto-increment PK — do NOT pass id
      // todos.createdAt is integer('created_at', { mode: 'timestamp' }).notNull()
      const result = db.insert(todos).values({
        text: trimmed,
        section: 'Inbox',
        priority: 'medium',
        done: false,
        sortOrder: 0,
        createdAt: new Date()
      }).run();
      const taskId = Number(result.lastInsertRowid);
      logActivity('task', taskId, 'created', `Captured task: ${trimmed.substring(0, 60)}`);
      return json({ ok: true, type: 'task', id: taskId });
    }
    case 'note': {
      const noteResult = db.insert(captures).values({ text: trimmed, type: 'note' }).run();
      const noteId = Number(noteResult.lastInsertRowid);
      logActivity('capture', null, 'created', `Captured note: ${trimmed.substring(0, 60)}`);
      enqueueMemory('capture', noteId, trimmed);
      return json({ ok: true, type: 'note', id: noteId });
    }
    default:
      return json({ error: 'type must be idea, task, or note' }, { status: 400 });
  }
};
