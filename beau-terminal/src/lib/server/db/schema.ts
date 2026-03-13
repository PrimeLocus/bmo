import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const parts = sqliteTable('parts', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  price: real('price').notNull().default(0),
  source: text('source').notNull().default(''),
  tracking: text('tracking').notNull().default(''),
  status: text('status').notNull().default('ordered'),
  eta: text('eta').notNull().default(''),
  role: text('role').notNull().default(''),
  notes: text('notes').notNull().default(''),
  expectedDelivery: text('expected_delivery').notNull().default(''),
  buildVersion: text('build_version').notNull().default('v1'),
});

export const softwarePhases = sqliteTable('software_phases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  phase: text('phase').notNull(),
  order: integer('order').notNull(),
});

export const softwareSteps = sqliteTable('software_steps', {
  id: text('id').primaryKey(),
  phaseId: integer('phase_id').notNull().references(() => softwarePhases.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  order: integer('order').notNull(),
  links: text('links').notNull().default('[]'),
});

export const ideas = sqliteTable('ideas', {
  id: text('id').primaryKey(),
  priority: text('priority').notNull().default('medium'),
  text: text('text').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  links: text('links').notNull().default('[]'),
});

export const haikus = sqliteTable('haikus', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  text: text('text').notNull(),
  trigger: text('trigger').notNull().default(''),
  mode: text('mode').notNull().default('ambient'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  // Phase 1 additions
  haikuType: text('haiku_type').notNull().default('daily'),
  wakeWord: text('wake_word'),
  isImmutable: integer('is_immutable', { mode: 'boolean' }).notNull().default(false),
  sourceContext: text('source_context'),
});

export const todos = sqliteTable('todos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  text: text('text').notNull(),
  section: text('section').notNull().default(''),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  priority: text('priority').notNull().default('medium'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const promptHistory = sqliteTable('prompt_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  content: text('content').notNull(),
  label: text('label').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ─── Identity Domain (Phase 1) ───

export const emergenceArtifacts = sqliteTable('emergence_artifacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  singleton: text('singleton').notNull().default('instance').unique(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  emergenceTimestamp: text('emergence_timestamp').notNull(),
  haikuText: text('haiku_text').notNull(),
  modelUsed: text('model_used'),
  promptUsed: text('prompt_used'),
  natalInputJson: text('natal_input_json'),
  filePath: text('file_path'),
  checksum: text('checksum'),
  bootId: text('boot_id'),
});

export const natalProfiles = sqliteTable('natal_profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  birthTimestamp: text('birth_timestamp').notNull(),
  timezone: text('timezone').notNull(),
  locationName: text('location_name').notNull().default('Lafayette, LA'),
  latitude: real('latitude').notNull().default(30.2241),
  longitude: real('longitude').notNull().default(-92.0198),
  westernChartJson: text('western_chart_json'),
  vedicChartJson: text('vedic_chart_json'),
  vargaChartJson: text('varga_chart_json'),
  summaryText: text('summary_text'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  version: integer('version').notNull().default(1),
});

export const voiceModels = sqliteTable('voice_models', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  versionName: text('version_name').notNull().unique(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  activatedAt: text('activated_at'),
  retiredAt: text('retired_at'),
  modelPath: text('model_path'),
  engine: text('engine').notNull().default('piper'),
  trainingNotes: text('training_notes'),
  status: text('status').notNull().default('draft'),
  checksum: text('checksum'),
});

export const voiceTrainingPhrases = sqliteTable('voice_training_phrases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  voiceModelId: integer('voice_model_id').notNull().references(() => voiceModels.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  text: text('text').notNull(),
  source: text('source').notNull().default('human'),
  includedInTraining: integer('included_in_training', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  notes: text('notes'),
});

// ─── Dispatch Logging (Phase 1 columns, Phase 2 adds environment_id FK) ───

export const dispatches = sqliteTable('dispatches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  tier: text('tier'),
  model: text('model'),
  querySummary: text('query_summary'),
  routingReason: text('routing_reason'),
  contextMode: text('context_mode'),
  durationMs: integer('duration_ms'),
  promptVersion: text('prompt_version'),
});
