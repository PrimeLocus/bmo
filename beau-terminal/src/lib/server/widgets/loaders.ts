import { db } from '$lib/server/db/index.js';
import * as schema from '$lib/server/db/schema.js';
import { asc, desc, eq, sql } from 'drizzle-orm';

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
    case 'wellness-log': {
      const limit = typeof config.limit === 'number' ? config.limit : 20;
      return db.select().from(schema.wellnessSessions)
        .orderBy(desc(schema.wellnessSessions.startedAt))
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
    case 'integrations-status': {
      return db.select().from(schema.integrations)
        .orderBy(asc(schema.integrations.sortOrder)).all()
        .map(i => ({ name: i.name, icon: i.icon, status: i.status }));
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
    case 'pending-thoughts': {
      const pending = db.select().from(schema.pendingThoughts)
        .where(sql`status IN ('requested','generating','pending','ready')`)
        .orderBy(desc(schema.pendingThoughts.priority))
        .all();
      const recent = db.select().from(schema.pendingThoughts)
        .where(sql`status IN ('surfaced','decayed','dropped')`)
        .orderBy(desc(schema.pendingThoughts.createdAt))
        .limit(10).all();
      const todaySurfaced = db.select({ count: sql<number>`count(*)` })
        .from(schema.pendingThoughts)
        .where(sql`status = 'surfaced' AND date(datetime(surfaced_at, 'localtime')) = date('now', 'localtime')`)
        .get();
      const todayHaiku = db.select({ count: sql<number>`count(*)` })
        .from(schema.pendingThoughts)
        .where(sql`status = 'surfaced' AND type = 'haiku' AND date(datetime(surfaced_at, 'localtime')) = date('now', 'localtime')`)
        .get();
      return {
        pending,
        recent,
        surfacedToday: todaySurfaced?.count ?? 0,
        haikuToday: todayHaiku?.count ?? 0,
      };
    }
    case 'personality-timeline': {
      const range = typeof config.timeRange === 'string' ? config.timeRange : '24h';
      const rangeMs: Record<string, number> = {
        '6h': 6 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
      };
      const ms = rangeMs[range] ?? rangeMs['24h'];
      const cutoff = new Date(Date.now() - ms).toISOString().replace('T', ' ').slice(0, 19);

      const rows = db.select().from(schema.personalitySnapshots)
        .where(sql`${schema.personalitySnapshots.timestamp} >= ${cutoff}`)
        .orderBy(asc(schema.personalitySnapshots.timestamp))
        .limit(500)
        .all();

      const snapshots = rows.map(r => ({
        timestamp: r.timestamp,
        wonder: r.wonder,
        reflection: r.reflection,
        mischief: r.mischief,
        signalWonder: r.signalWonder,
        signalReflection: r.signalReflection,
        signalMischief: r.signalMischief,
        momentumWonder: r.momentumWonder,
        momentumReflection: r.momentumReflection,
        momentumMischief: r.momentumMischief,
        derivedMode: r.derivedMode,
        interpretation: r.interpretation ?? '',
        sources: (() => { try { return JSON.parse(r.sources ?? '[]'); } catch { return []; } })(),
        isNotable: r.isNotable === 1,
      }));

      // Derive mode transitions
      const modeTransitions: Array<{ timestamp: string; mode: string }> = [];
      for (let i = 0; i < snapshots.length; i++) {
        if (i === 0 || snapshots[i].derivedMode !== snapshots[i - 1].derivedMode) {
          modeTransitions.push({ timestamp: snapshots[i].timestamp, mode: snapshots[i].derivedMode });
        }
      }

      return { snapshots, modeTransitions };
    }
    default:
      return null;
  }
}
