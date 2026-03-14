import { db } from '$lib/server/db/index.js';
import * as schema from '$lib/server/db/schema.js';
import { desc, eq, asc } from 'drizzle-orm';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
  // ── Workshop progress ──
  const allParts = db.select().from(schema.parts).all();
  const allSteps = db.select().from(schema.softwareSteps).all();
  const allIdeas = db.select().from(schema.ideas).all();
  const allTodos = db.select().from(schema.todos).all();

  const workshopProgress = {
    partsReceived: allParts.filter(p => p.status === 'delivered' || p.status === 'installed').length,
    partsTotal: allParts.length,
    totalCost: allParts.reduce((sum, p) => sum + (p.price ?? 0), 0),
    stepsDone: allSteps.filter(s => s.done).length,
    stepsTotal: allSteps.length,
    ideasOpen: allIdeas.filter(i => !i.done).length,
    tasksOpen: allTodos.filter(t => !t.done).length,
  };

  // ── Blocked / waiting parts ──
  const blockedParts = allParts
    .filter(p => p.status === 'ordered' || p.status === 'shipped')
    .sort((a, b) => (a.expectedDelivery ?? '').localeCompare(b.expectedDelivery ?? ''))
    .map(p => ({ name: p.name, status: p.status, expectedDelivery: p.expectedDelivery }));

  // ── Recent activity ──
  const recentActivity = db.select().from(schema.activityLog)
    .orderBy(desc(schema.activityLog.id)).limit(10).all();

  // ── Next steps ──
  const nextSteps = buildNextSteps(allParts, allTodos);

  return { workshopProgress, blockedParts, recentActivity, nextSteps };
};

type Part = { name: string; status: string; expectedDelivery: string; price: number };
type Todo = { text: string; done: boolean; priority: string };

function buildNextSteps(allParts: Part[], allTodos: Todo[]) {
  const items: { icon: string; text: string; detail: string; link: string }[] = [];

  // Shipped parts arriving soon
  const shipped = allParts
    .filter(p => p.status === 'shipped')
    .sort((a, b) => (a.expectedDelivery ?? '').localeCompare(b.expectedDelivery ?? ''));
  for (const p of shipped.slice(0, 2)) {
    items.push({ icon: '⬡', text: p.name, detail: 'shipped', link: '/parts' });
  }

  // Next incomplete software step
  const phases = db.select().from(schema.softwarePhases).orderBy(asc(schema.softwarePhases.order)).all();
  for (const phase of phases) {
    const steps = db.select().from(schema.softwareSteps)
      .where(eq(schema.softwareSteps.phaseId, phase.id)).all();
    const next = steps.find(s => !s.done);
    if (next) {
      items.push({ icon: '◉', text: next.text ?? 'next step', detail: phase.phase ?? '', link: '/software' });
      break;
    }
  }

  // Open tasks by priority
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const open = allTodos
    .filter(t => !t.done)
    .sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));
  for (const t of open.slice(0, Math.max(0, 5 - items.length))) {
    items.push({ icon: '◫', text: t.text, detail: t.priority ?? '', link: '/todo' });
  }

  return items.slice(0, 5);
}
