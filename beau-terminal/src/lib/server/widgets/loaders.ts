import { db } from '$lib/server/db/index.js';
import * as schema from '$lib/server/db/schema.js';
import { desc, eq } from 'drizzle-orm';

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
    default:
      return null;
  }
}
