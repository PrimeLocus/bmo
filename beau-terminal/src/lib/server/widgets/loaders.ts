import { db } from '$lib/server/db/index.js';
import * as schema from '$lib/server/db/schema.js';
import { asc, desc, eq } from 'drizzle-orm';

/**
 * Load data for a database-backed widget.
 * Used by both the widget data API and custom page server load.
 */
export async function loadWidgetData(
  widgetId: string,
  config: Record<string, unknown>
): Promise<unknown> {
  switch (widgetId) {
    case 'event-timeline': {
      const limit = typeof config.limit === 'number' ? config.limit : 50;
      return db.select().from(schema.environmentEvents)
        .orderBy(desc(schema.environmentEvents.timestamp))
        .limit(limit).all();
    }
    case 'soul-code': {
      return db.select().from(schema.emergenceArtifacts).limit(1).get() ?? null;
    }
    case 'voice': {
      return db.select().from(schema.voiceModels)
        .orderBy(desc(schema.voiceModels.createdAt)).all();
    }
    case 'natal-chart': {
      return db.select().from(schema.natalProfiles)
        .where(eq(schema.natalProfiles.isActive, true)).limit(1).get() ?? null;
    }
    case 'journal': {
      const limit = typeof config.limit === 'number' ? config.limit : 20;
      return db.select().from(schema.journalEntries)
        .orderBy(desc(schema.journalEntries.entryAt))
        .limit(limit).all();
    }
    case 'haiku-archive': {
      const limit = typeof config.limit === 'number' ? config.limit : 50;
      return db.select().from(schema.haikus)
        .orderBy(desc(schema.haikus.createdAt))
        .limit(limit).all();
    }
    case 'sessions-log': {
      const limit = typeof config.limit === 'number' ? config.limit : 20;
      return db.select().from(schema.resolumeSessions)
        .orderBy(desc(schema.resolumeSessions.startedAt))
        .limit(limit).all();
    }
    case 'photography': {
      return db.select().from(schema.photos)
        .orderBy(desc(schema.photos.createdAt)).all();
    }
    case 'build-stats': {
      const parts = db.select().from(schema.parts).all();
      const steps = db.select().from(schema.softwareSteps).all();
      return {
        partsCount: parts.length,
        totalCost: parts.reduce((sum, p) => sum + p.price, 0),
        doneSteps: steps.filter(s => s.done).length,
        totalSteps: steps.length
      };
    }
    case 'parts-tracker': {
      return db.select().from(schema.parts).all();
    }
    case 'software-build': {
      const phases = db.select().from(schema.softwarePhases).all();
      const steps = db.select().from(schema.softwareSteps).all();
      return { phases, steps };
    }
    case 'ideas': {
      return db.select().from(schema.ideas).all();
    }
    case 'todos': {
      return db.select().from(schema.todos).all();
    }
    case 'prompt-console':
    case 'prompt-history': {
      const limit = typeof config.limit === 'number' ? config.limit : 20;
      return db.select().from(schema.promptHistory)
        .orderBy(desc(schema.promptHistory.createdAt))
        .limit(limit).all();
    }
    case 'workshop-progress': {
      const allParts = db.select().from(schema.parts).all();
      const allSteps = db.select().from(schema.softwareSteps).all();
      const allIdeas = db.select().from(schema.ideas).all();
      const allTodos = db.select().from(schema.todos).all();
      return {
        partsReceived: allParts.filter(p => p.status === 'delivered' || p.status === 'installed').length,
        partsTotal: allParts.length,
        totalCost: allParts.reduce((sum, p) => sum + (p.price ?? 0), 0),
        stepsDone: allSteps.filter(s => s.done).length,
        stepsTotal: allSteps.length,
        ideasOpen: allIdeas.filter(i => !i.done).length,
        tasksOpen: allTodos.filter(t => !t.done).length,
      };
    }
    case 'blocked-waiting': {
      return db.select().from(schema.parts).all()
        .filter(p => p.status === 'ordered' || p.status === 'shipped')
        .sort((a, b) => (a.expectedDelivery ?? '').localeCompare(b.expectedDelivery ?? ''))
        .map(p => ({ name: p.name, status: p.status, expectedDelivery: p.expectedDelivery }));
    }
    case 'recent-activity': {
      const limit = typeof config?.limit === 'number' ? config.limit : 10;
      return db.select().from(schema.activityLog)
        .orderBy(desc(schema.activityLog.id))
        .limit(limit).all();
    }
    case 'next-steps': {
      const items: Array<{ icon: string; text: string; detail: string; link: string }> = [];
      const shippedParts = db.select().from(schema.parts).all()
        .filter(p => p.status === 'shipped')
        .sort((a, b) => (a.expectedDelivery ?? '').localeCompare(b.expectedDelivery ?? ''));
      for (const p of shippedParts.slice(0, 2)) {
        items.push({ icon: '⬡', text: p.name, detail: `shipped${p.expectedDelivery ? ', ~' + p.expectedDelivery : ''}`, link: '/parts' });
      }
      const phases = db.select().from(schema.softwarePhases).orderBy(asc(schema.softwarePhases.order)).all();
      for (const phase of phases) {
        const steps = db.select().from(schema.softwareSteps).where(eq(schema.softwareSteps.phaseId, phase.id)).all();
        const next = steps.find(s => !s.done);
        if (next) {
          items.push({ icon: '◉', text: next.text ?? 'next step', detail: phase.phase ?? '', link: '/software' });
          break;
        }
      }
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const openTasks = db.select().from(schema.todos).all()
        .filter(t => !t.done)
        .sort((a, b) => (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1) - (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1));
      for (const t of openTasks.slice(0, Math.max(0, 5 - items.length))) {
        items.push({ icon: '◫', text: t.text, detail: t.priority ?? '', link: '/todo' });
      }
      return items.slice(0, 5);
    }
    default:
      return null;
  }
}
