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
  sessionId: integer('session_id'),
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
  environmentId: integer('environment_id'),
});

// ─── Environment Domain (Phase 2) ───

export const environmentSnapshots = sqliteTable('environment_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: text('timestamp').notNull().default(sql`(datetime('now'))`),
  presenceState: text('presence_state'),
  occupancyConfidence: real('occupancy_confidence'),
  lux: real('lux'),
  noiseLevel: real('noise_level'),
  sleepState: text('sleep_state'),
  weatherJson: text('weather_json'),
  seasonalSummary: text('seasonal_summary'),
  contextMode: text('context_mode'),
});

export const environmentEvents = sqliteTable('environment_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: text('timestamp').notNull().default(sql`(datetime('now'))`),
  eventType: text('event_type').notNull(),
  payloadJson: text('payload_json'),
  source: text('source'),
});

// ─── Creative Domain (Phase 3) ───

export const resolumeSessions = sqliteTable('resolume_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  status: text('status').notNull().default('active'),
  sessionName: text('session_name'),
  venue: text('venue'),
  bpmMin: real('bpm_min'),
  bpmMax: real('bpm_max'),
  bpmAvg: real('bpm_avg'),
  clipsUsedJson: text('clips_used_json'),
  columnsTriggeredJson: text('columns_triggered_json'),
  colorObservations: text('color_observations'),
  oscLogPath: text('osc_log_path'),
  debriefText: text('debrief_text'),
  moodTagsJson: text('mood_tags_json'),
  visualPrompt: text('visual_prompt'),
  beauPresent: integer('beau_present', { mode: 'boolean' }).notNull().default(false),
  embeddingStatus: text('embedding_status').notNull().default('pending'),
});

export const resolumeEvents = sqliteTable('resolume_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id').notNull().references(() => resolumeSessions.id, { onDelete: 'cascade' }),
  timestamp: text('timestamp').notNull(),
  sequence: integer('sequence').notNull(),
  eventType: text('event_type').notNull(),
  source: text('source').notNull().default('osc'),
  payloadJson: text('payload_json'),
});

export const photos = sqliteTable('photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  capturedAt: text('captured_at'),
  sessionId: integer('session_id').references(() => resolumeSessions.id, { onDelete: 'set null' }),
  imagePath: text('image_path').notNull(),
  thumbnailPath: text('thumbnail_path'),
  caption: text('caption'),
  notes: text('notes'),
  tagsJson: text('tags_json'),
  sourceType: text('source_type').notNull().default('instant_scan'),
  isPrivate: integer('is_private', { mode: 'boolean' }).notNull().default(false),
  embeddingStatus: text('embedding_status').notNull().default('pending'),
});

// ─── Reflective Domain (Phase 4) ───

export const journalEntries = sqliteTable('journal_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  entryAt: text('entry_at').notNull().default(sql`(datetime('now'))`),
  title: text('title'),
  body: text('body').notNull(),
  mood: text('mood'),
  tagsJson: text('tags_json'),
  visibility: text('visibility').notNull().default('private'),
  surfacedAt: text('surfaced_at'),
  filePath: text('file_path'),
});

export const noticings = sqliteTable('noticings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  patternText: text('pattern_text').notNull(),
  basisSummary: text('basis_summary'),
  observationWindow: text('observation_window'),
  surfacedAt: text('surfaced_at'),
  status: text('status').notNull().default('draft'),
  category: text('category'),
});

export const consentEvents = sqliteTable('consent_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: text('timestamp').notNull().default(sql`(datetime('now'))`),
  eventType: text('event_type').notNull(),
  targetId: integer('target_id'),
  targetType: text('target_type'),
  sessionToken: text('session_token'),
  notes: text('notes'),
});

// ─── Layout Persistence (Edit Mode) ───

export const layouts = sqliteTable('layouts', {
  id: text('id').primaryKey(),
  data: text('data').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// ─── Custom Pages (Edit Mode Phase 3) ───

export const customPages = sqliteTable('custom_pages', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  icon: text('icon').default('📄'),
  groupName: text('group_name').notNull(),
  sortOrder: integer('sort_order').default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// ─── Quick Capture (Phase 2) ───────────────────────────────────────────────────

export const captures = sqliteTable('captures', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  text: text('text').notNull(),
  type: text('type').notNull().default('note'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});

// ─── Activity Log (Phase 2) ───────────────────────────────────────────────────

export const activityLog = sqliteTable('activity_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),              // text to match text PKs on ideas/steps tables
  action: text('action').notNull(),
  summary: text('summary').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});

// ─── Entity Links (Phase 3) ──────────────────────────────────────────────────

export const entityLinks = sqliteTable('entity_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id').notNull(),     // text — ideas and softwareSteps use text PKs
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),     // text — same reason
  relationship: text('relationship').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});

// ─── Wellness Domain (Phase 5) ───────────────────────────────────────────────

export const wellnessSessions = sqliteTable('wellness_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  status: text('status').notNull().default('active'),
  deviceId: text('device_id').notNull(),
  deviceType: text('device_type').notNull(),
  displayName: text('display_name').notNull(),
  targetTemp: real('target_temp'),
  peakTemp: real('peak_temp'),
  avgTemp: real('avg_temp'),
  profile: text('profile'),
  durationSeconds: integer('duration_seconds'),
  batteryStart: integer('battery_start'),
  batteryEnd: integer('battery_end'),
  contextMode: text('context_mode'),
});

export const wellnessEvents = sqliteTable('wellness_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id').notNull().references(() => wellnessSessions.id, { onDelete: 'cascade' }),
  timestamp: text('timestamp').notNull(),
  sequence: integer('sequence').notNull(),
  eventType: text('event_type').notNull(),
  payloadJson: text('payload_json'),
});

// ─── Integrations (Phase 3) ──────────────────────────────────────────────────

export const integrations = sqliteTable('integrations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('⚡'),
  type: text('type').notNull().default('custom'),
  endpoint: text('endpoint'),
  healthCheck: text('health_check').default('none'),
  status: text('status').notNull().default('unknown'),
  lastSeen: text('last_seen'),
  notes: text('notes'),
  config: text('config'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});

// ── Pending Thoughts (SP4) ──────────────────────────────
export const pendingThoughts = sqliteTable('pending_thoughts', {
  id:            text('id').primaryKey(),
  type:          text('type').notNull(),
  trigger:       text('trigger').notNull(),
  text:          text('text'),
  status:        text('status').notNull(),
  priority:      integer('priority').notNull(),
  contextJson:   text('context_json').notNull(),
  createdAt:     text('created_at').notNull().default(sql`(datetime('now'))`),
  generatedAt:   text('generated_at'),
  surfacedAt:    text('surfaced_at'),
  expiresAt:     text('expires_at').notNull(),
  novelty:       integer('novelty').notNull().default(0),
  model:         text('model'),
  generationMs:  integer('generation_ms'),
});

// ── Personality Engine ──────────────────────────────────
export const personalitySnapshots = sqliteTable('personality_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: text('timestamp').notNull().default(sql`(datetime('now'))`),
  wonder: real('wonder').notNull(),
  reflection: real('reflection').notNull(),
  mischief: real('mischief').notNull(),
  signalWonder: real('signal_wonder').notNull(),
  signalReflection: real('signal_reflection').notNull(),
  signalMischief: real('signal_mischief').notNull(),
  momentumWonder: real('momentum_wonder').notNull(),
  momentumReflection: real('momentum_reflection').notNull(),
  momentumMischief: real('momentum_mischief').notNull(),
  derivedMode: text('derived_mode').notNull(),
  interpretation: text('interpretation'),
  sources: text('sources').notNull().default('[]'),
  snapshotReason: text('snapshot_reason').notNull().default('interval'),
  isNotable: integer('is_notable').notNull().default(0),
});
