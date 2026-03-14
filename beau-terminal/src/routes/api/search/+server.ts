import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import * as schema from '$lib/server/db/schema.js';
import { like } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) return json({ results: [] });

  const pattern = `%${q}%`;
  const results: Array<{ type: string; id: string; label: string }> = [];

  // Parts (integer PK — stringify)
  try {
    const matchedParts = db
      .select()
      .from(schema.parts)
      .where(like(schema.parts.name, pattern))
      .all();
    for (const p of matchedParts) {
      results.push({ type: 'part', id: String(p.id), label: p.name });
    }
  } catch {
    // Skip on error
  }

  // Ideas (text PK)
  try {
    const matchedIdeas = db
      .select()
      .from(schema.ideas)
      .where(like(schema.ideas.text, pattern))
      .all();
    for (const i of matchedIdeas) {
      results.push({ type: 'idea', id: i.id, label: i.text.substring(0, 60) });
    }
  } catch {
    // Skip on error
  }

  // Todos (integer PK — stringify)
  try {
    const matchedTodos = db
      .select()
      .from(schema.todos)
      .where(like(schema.todos.text, pattern))
      .all();
    for (const t of matchedTodos) {
      results.push({ type: 'task', id: String(t.id), label: t.text.substring(0, 60) });
    }
  } catch {
    // Skip on error
  }

  // Software phases (integer PK — stringify)
  try {
    const matchedPhases = db
      .select()
      .from(schema.softwarePhases)
      .where(like(schema.softwarePhases.phase, pattern))
      .all();
    for (const p of matchedPhases) {
      results.push({ type: 'phase', id: String(p.id), label: p.phase });
    }
  } catch {
    // Skip on error
  }

  // Custom pages (text PK)
  try {
    const matchedPages = db
      .select()
      .from(schema.customPages)
      .where(like(schema.customPages.name, pattern))
      .all();
    for (const p of matchedPages) {
      results.push({ type: 'page', id: p.id, label: p.name });
    }
  } catch {
    // Skip on error
  }

  // Software steps (text PK)
  try {
    const matchedSteps = db
      .select()
      .from(schema.softwareSteps)
      .where(like(schema.softwareSteps.text, pattern))
      .all();
    for (const s of matchedSteps) {
      results.push({ type: 'step', id: s.id, label: s.text.substring(0, 60) });
    }
  } catch {
    // Skip on error
  }

  return json({ results: results.slice(0, 20) });
};
