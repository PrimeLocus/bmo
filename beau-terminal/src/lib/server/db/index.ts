import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';
import { join } from 'path';
import { mkdirSync, readFileSync } from 'fs';
import { createHash } from 'crypto';

const DB_PATH = process.env.DB_PATH || join(process.cwd(), 'data', 'beau.db');

mkdirSync(join(process.cwd(), 'data'), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

try {
  migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });
} catch (error: unknown) {
  const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
  if (cause?.code === 'SQLITE_ERROR' &&
      (cause?.message?.includes('already exists') || cause?.message?.includes('duplicate column'))) {
    console.warn('[db] Migration conflict — reconciling with existing schema');
    reconcileMigrations();
  } else {
    console.error('[db] Migration failed:', error);
    throw error;
  }
}

/** Re-apply pending migrations tolerating "already exists" / "duplicate column" errors,
 *  then record them in __drizzle_migrations so Drizzle won't retry. */
function reconcileMigrations() {
  const migrationsFolder = join(process.cwd(), 'drizzle');
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')
  );
  const rows = sqlite.prepare('SELECT hash FROM "__drizzle_migrations"').all() as { hash: string }[];
  const applied = new Set(rows.map((r) => r.hash));
  for (const entry of journal.entries) {
    const sql = readFileSync(join(migrationsFolder, `${entry.tag}.sql`), 'utf8');
    const hash = createHash('sha256').update(sql).digest('hex');
    if (applied.has(hash)) continue;
    const statements = sql.split('--> statement-breakpoint');
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed) continue;
      try {
        sqlite.prepare(trimmed).run();
      } catch (err: unknown) {
        const sqlErr = err as { code?: string; message?: string };
        if (sqlErr.code === 'SQLITE_ERROR' &&
            (sqlErr.message?.includes('already exists') || sqlErr.message?.includes('duplicate column'))) {
          continue;
        }
        throw err;
      }
    }
    sqlite.prepare(
      'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)'
    ).run(hash, entry.when);
    console.log(`[db] Reconciled migration: ${entry.tag}`);
  }
}

// Additive column migrations — safe to run repeatedly
try { sqlite.prepare("ALTER TABLE parts ADD COLUMN expected_delivery TEXT NOT NULL DEFAULT ''").run(); } catch { /* already exists */ }
try { sqlite.prepare("ALTER TABLE parts ADD COLUMN build_version TEXT NOT NULL DEFAULT 'v1'").run(); } catch { /* already exists */ }
try { sqlite.prepare("ALTER TABLE software_steps ADD COLUMN links TEXT NOT NULL DEFAULT '[]'").run(); } catch { /* already exists */ }
try { sqlite.prepare("ALTER TABLE software_steps ADD COLUMN requiredPartIds TEXT DEFAULT '[]'").run(); } catch { /* already exists */ }
try { sqlite.prepare("ALTER TABLE ideas ADD COLUMN links TEXT NOT NULL DEFAULT '[]'").run(); } catch { /* already exists */ }
try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    section TEXT NOT NULL DEFAULT '',
    done INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'medium',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`).run();
} catch { /* already exists */ }

// Phase 1 — haiku columns
try { sqlite.prepare("ALTER TABLE haikus ADD COLUMN haiku_type TEXT NOT NULL DEFAULT 'daily'").run(); } catch { /* already exists */ }
try { sqlite.prepare("ALTER TABLE haikus ADD COLUMN wake_word TEXT").run(); } catch { /* already exists */ }
try { sqlite.prepare("ALTER TABLE haikus ADD COLUMN is_immutable INTEGER NOT NULL DEFAULT 0").run(); } catch { /* already exists */ }
try { sqlite.prepare("ALTER TABLE haikus ADD COLUMN source_context TEXT").run(); } catch { /* already exists */ }

// Phase 1 — new tables
try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS emergence_artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    singleton TEXT NOT NULL DEFAULT 'instance' UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    emergence_timestamp TEXT NOT NULL,
    haiku_text TEXT NOT NULL,
    model_used TEXT,
    prompt_used TEXT,
    natal_input_json TEXT,
    file_path TEXT,
    checksum TEXT,
    boot_id TEXT
  )`).run();
} catch { /* already exists */ }

try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS natal_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    birth_timestamp TEXT NOT NULL,
    timezone TEXT NOT NULL,
    location_name TEXT NOT NULL DEFAULT 'Lafayette, LA',
    latitude REAL NOT NULL DEFAULT 30.2241,
    longitude REAL NOT NULL DEFAULT -92.0198,
    western_chart_json TEXT,
    vedic_chart_json TEXT,
    varga_chart_json TEXT,
    summary_text TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    version INTEGER NOT NULL DEFAULT 1
  )`).run();
} catch { /* already exists */ }

try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS voice_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    activated_at TEXT,
    retired_at TEXT,
    model_path TEXT,
    engine TEXT NOT NULL DEFAULT 'piper',
    training_notes TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    checksum TEXT
  )`).run();
} catch { /* already exists */ }

try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS voice_training_phrases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voice_model_id INTEGER NOT NULL REFERENCES voice_models(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    text TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'human',
    included_in_training INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    notes TEXT
  )`).run();
} catch { /* already exists */ }

try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS dispatches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    tier TEXT,
    model TEXT,
    query_summary TEXT,
    routing_reason TEXT,
    context_mode TEXT,
    duration_ms INTEGER,
    prompt_version TEXT
  )`).run();
} catch { /* already exists */ }

// Phase 2 — environment tables
try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS environment_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    presence_state TEXT,
    occupancy_confidence REAL,
    lux REAL,
    noise_level REAL,
    sleep_state TEXT,
    weather_json TEXT,
    seasonal_summary TEXT,
    context_mode TEXT
  )`).run();
} catch { /* already exists */ }

try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS environment_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    event_type TEXT NOT NULL,
    payload_json TEXT,
    source TEXT
  )`).run();
} catch { /* already exists */ }

// Phase 2 — dispatches.environment_id column
try { sqlite.prepare("ALTER TABLE dispatches ADD COLUMN environment_id INTEGER").run(); } catch { /* already exists */ }

// Phase 2 — index on environment_snapshots.timestamp for range queries
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS idx_env_snapshots_ts ON environment_snapshots(timestamp)").run(); } catch { /* already exists */ }

// Phase 2 — index on environment_events.timestamp for timeline queries
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS idx_env_events_ts ON environment_events(timestamp)").run(); } catch { /* already exists */ }

// Phase 3 — creative tables
try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS resolume_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    session_name TEXT,
    venue TEXT,
    bpm_min REAL,
    bpm_max REAL,
    bpm_avg REAL,
    clips_used_json TEXT,
    columns_triggered_json TEXT,
    color_observations TEXT,
    osc_log_path TEXT,
    debrief_text TEXT,
    mood_tags_json TEXT,
    visual_prompt TEXT,
    beau_present INTEGER NOT NULL DEFAULT 0,
    embedding_status TEXT NOT NULL DEFAULT 'pending'
  )`).run();
} catch { /* already exists */ }

try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS resolume_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES resolume_sessions(id) ON DELETE CASCADE,
    timestamp TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'osc',
    payload_json TEXT
  )`).run();
} catch { /* already exists */ }

try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    captured_at TEXT,
    session_id INTEGER REFERENCES resolume_sessions(id) ON DELETE SET NULL,
    image_path TEXT NOT NULL,
    thumbnail_path TEXT,
    caption TEXT,
    notes TEXT,
    tags_json TEXT,
    source_type TEXT NOT NULL DEFAULT 'instant_scan',
    is_private INTEGER NOT NULL DEFAULT 0,
    embedding_status TEXT NOT NULL DEFAULT 'pending'
  )`).run();
} catch { /* already exists */ }

// Phase 3 — haikus.session_id FK
try { sqlite.prepare("ALTER TABLE haikus ADD COLUMN session_id INTEGER").run(); } catch { /* already exists */ }

// Phase 3 — indexes
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS idx_resolume_sessions_started ON resolume_sessions(started_at DESC)").run(); } catch { /* already exists */ }
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS idx_resolume_events_session ON resolume_events(session_id)").run(); } catch { /* already exists */ }
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS idx_resolume_events_ts ON resolume_events(timestamp)").run(); } catch { /* already exists */ }
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS idx_photos_session ON photos(session_id)").run(); } catch { /* already exists */ }

// Phase 4 — reflective tables
try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    entry_at TEXT NOT NULL DEFAULT (datetime('now')),
    title TEXT,
    body TEXT NOT NULL,
    mood TEXT,
    tags_json TEXT,
    visibility TEXT NOT NULL DEFAULT 'private',
    surfaced_at TEXT,
    file_path TEXT
  )`).run();
} catch { /* already exists */ }

try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS noticings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    pattern_text TEXT NOT NULL,
    basis_summary TEXT,
    observation_window TEXT,
    surfaced_at TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    category TEXT
  )`).run();
} catch { /* already exists */ }

try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS consent_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    event_type TEXT NOT NULL,
    target_id INTEGER,
    target_type TEXT,
    session_token TEXT,
    notes TEXT
  )`).run();
} catch { /* already exists */ }

// Phase 4 — indexes
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS idx_journal_entries_at ON journal_entries(entry_at DESC)").run(); } catch { /* already exists */ }
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS idx_noticings_status ON noticings(status)").run(); } catch { /* already exists */ }
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS idx_consent_events_ts ON consent_events(timestamp DESC)").run(); } catch { /* already exists */ }
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS idx_consent_events_target ON consent_events(target_type, target_id)").run(); } catch { /* already exists */ }

// Edit Mode — layouts table
try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS layouts (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
} catch { /* already exists */ }

// Edit Mode Phase 3 — custom pages
try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS custom_pages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    icon TEXT DEFAULT '📄',
    group_name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
} catch { /* already exists */ }

// Phase 2 — quick capture
try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS captures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'note',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
} catch { /* already exists */ }

// Phase 2 — activity log
try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    action TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
} catch { /* already exists */ }

// Phase 3 — entity links
try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS entity_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relationship TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
} catch { /* already exists */ }

// Phase 3 — integrations
try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS integrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '⚡',
    type TEXT NOT NULL DEFAULT 'custom',
    endpoint TEXT,
    health_check TEXT DEFAULT 'none',
    status TEXT NOT NULL DEFAULT 'unknown',
    last_seen TEXT,
    notes TEXT,
    config TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
} catch { /* already exists */ }

// Phase 3 — entity_links unique index
try { sqlite.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_links_unique ON entity_links(source_type, source_id, target_type, target_id, relationship)").run(); } catch { /* already exists */ }

// Phase 5 — wellness tables
try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS wellness_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    device_id TEXT NOT NULL,
    device_type TEXT NOT NULL,
    display_name TEXT NOT NULL,
    target_temp REAL,
    peak_temp REAL,
    avg_temp REAL,
    profile TEXT,
    duration_seconds INTEGER,
    battery_start INTEGER,
    battery_end INTEGER,
    context_mode TEXT
  )`).run();
} catch { /* already exists */ }

try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS wellness_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES wellness_sessions(id) ON DELETE CASCADE,
    timestamp TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT
  )`).run();
} catch { /* already exists */ }

// Phase 5 — wellness indexes
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS idx_wellness_sessions_started ON wellness_sessions(started_at DESC)").run(); } catch { /* already exists */ }
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS idx_wellness_events_session ON wellness_events(session_id)").run(); } catch { /* already exists */ }
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS idx_wellness_events_ts ON wellness_events(timestamp)").run(); } catch { /* already exists */ }

// Personality Engine — snapshots table
try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS personality_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    wonder REAL NOT NULL,
    reflection REAL NOT NULL,
    mischief REAL NOT NULL,
    signal_wonder REAL NOT NULL,
    signal_reflection REAL NOT NULL,
    signal_mischief REAL NOT NULL,
    momentum_wonder REAL NOT NULL,
    momentum_reflection REAL NOT NULL,
    momentum_mischief REAL NOT NULL,
    derived_mode TEXT NOT NULL,
    interpretation TEXT,
    sources TEXT NOT NULL DEFAULT '[]',
    snapshot_reason TEXT NOT NULL DEFAULT 'interval',
    is_notable INTEGER NOT NULL DEFAULT 0
  )`).run();
} catch { /* already exists */ }
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS idx_personality_snapshots_ts ON personality_snapshots(timestamp)").run(); } catch { /* already exists */ }

// Memory/RAG — embedding queue
try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS embedding_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    collection TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    text TEXT NOT NULL,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    metadata TEXT NOT NULL DEFAULT '{}',
    embedding_model TEXT NOT NULL DEFAULT 'nomic-embed-text',
    chunker_version TEXT NOT NULL DEFAULT 'v1',
    status TEXT NOT NULL DEFAULT 'pending',
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    locked_at TEXT,
    locked_by TEXT,
    next_attempt_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    processed_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
} catch { /* already exists */ }
try { sqlite.prepare("CREATE UNIQUE INDEX IF NOT EXISTS eq_source_entity_collection_chunk ON embedding_queue(source, entity_id, collection, chunk_index)").run(); } catch { /* already exists */ }
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS eq_status_next_attempt ON embedding_queue(status, next_attempt_at)").run(); } catch { /* already exists */ }

// SP7 — Training readiness tables
try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS generation_traces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id TEXT NOT NULL UNIQUE,
    request_id TEXT NOT NULL,
    parent_trace_id TEXT,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    request_kind TEXT NOT NULL,
    origin TEXT NOT NULL,
    tier TEXT NOT NULL,
    model_family TEXT NOT NULL,
    model_name TEXT NOT NULL,
    model_digest TEXT,
    generation_params TEXT,
    provider TEXT NOT NULL DEFAULT 'ollama',
    runtime TEXT,
    prompt_template_hash TEXT,
    prompt_policy_version TEXT,
    prompt_profile TEXT,
    retrieval_policy_version TEXT,
    assembler_version TEXT,
    input_json TEXT,
    prompt_text TEXT,
    response_text TEXT,
    response_status TEXT NOT NULL,
    token_count_in INTEGER,
    token_count_out INTEGER,
    latency_ms INTEGER,
    fallback_from TEXT,
    quality_escalated_from TEXT,
    prompt_hash TEXT,
    personality_snapshot_id INTEGER,
    context_mode TEXT,
    context_state_json TEXT,
    clock_source TEXT,
    clock_offset_ms INTEGER,
    consent_scope TEXT,
    privacy_class TEXT,
    training_eligibility TEXT,
    training_eligibility_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
} catch { /* already exists */ }
try { sqlite.prepare("CREATE UNIQUE INDEX IF NOT EXISTS gt_trace_id ON generation_traces(trace_id)").run(); } catch { /* already exists */ }
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS gt_request_id ON generation_traces(request_id)").run(); } catch { /* already exists */ }
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS gt_created_at ON generation_traces(created_at)").run(); } catch { /* already exists */ }
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS gt_training_eligibility ON generation_traces(training_eligibility)").run(); } catch { /* already exists */ }

try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS trace_retrievals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id TEXT NOT NULL,
    collection TEXT NOT NULL,
    fragment_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_entity_id TEXT,
    rank INTEGER NOT NULL,
    base_score REAL NOT NULL,
    final_score REAL NOT NULL,
    selected INTEGER NOT NULL DEFAULT 1,
    token_count INTEGER,
    excerpt_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
} catch { /* already exists */ }
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS tr_trace_id ON trace_retrievals(trace_id)").run(); } catch { /* already exists */ }

try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS generation_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id TEXT,
    request_id TEXT,
    reviewer TEXT NOT NULL,
    outcome_type TEXT NOT NULL,
    final_text TEXT,
    edit_distance INTEGER,
    reason_tags TEXT,
    notes TEXT,
    compared_trace_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
} catch { /* already exists */ }
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS gf_trace_id ON generation_feedback(trace_id)").run(); } catch { /* already exists */ }

try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS artifact_governance_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    scope TEXT NOT NULL,
    mode_filter TEXT,
    eligibility TEXT NOT NULL,
    reason TEXT,
    policy_version INTEGER NOT NULL,
    target_entity_type TEXT,
    target_entity_id TEXT,
    propagated_to_exports TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
} catch { /* already exists */ }
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS age_scope_policy ON artifact_governance_events(scope, policy_version)").run(); } catch { /* already exists */ }

try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS training_examples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id TEXT,
    example_type TEXT NOT NULL,
    tier_tag TEXT NOT NULL,
    system_prompt TEXT,
    user_prompt TEXT,
    assistant_response TEXT,
    rejected_response TEXT,
    context_json TEXT,
    feedback_ids TEXT,
    quality_score REAL,
    policy_version INTEGER,
    redaction_version TEXT,
    redacted_fields TEXT,
    curated_at TEXT NOT NULL DEFAULT (datetime('now')),
    curated_by TEXT NOT NULL
  )`).run();
} catch { /* already exists */ }

try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS dataset_exports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    export_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    objective TEXT NOT NULL,
    target_tier TEXT,
    target_family TEXT,
    filter_definition TEXT,
    split_definition TEXT,
    export_format TEXT NOT NULL,
    example_count INTEGER,
    token_count_estimate INTEGER,
    policy_version_at_export INTEGER,
    tombstones_applied TEXT,
    artifact_paths TEXT,
    checksum TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by TEXT NOT NULL
  )`).run();
} catch { /* already exists */ }

try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS evaluation_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    model_variant_id INTEGER,
    dataset_export_id INTEGER,
    eval_set_name TEXT NOT NULL,
    prompt_policy_version TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    notes TEXT
  )`).run();
} catch { /* already exists */ }

try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS evaluation_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    metric TEXT NOT NULL,
    score REAL NOT NULL,
    baseline REAL,
    delta REAL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
} catch { /* already exists */ }

try {
  sqlite.prepare(`CREATE TABLE IF NOT EXISTS llm_model_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name TEXT NOT NULL,
    family TEXT NOT NULL,
    base_model TEXT NOT NULL,
    base_revision TEXT,
    training_method TEXT NOT NULL DEFAULT 'base',
    training_dataset_id INTEGER,
    artifact_format TEXT,
    artifact_path TEXT,
    adapter_path TEXT,
    tokenizer_family TEXT,
    quantization TEXT,
    runtime TEXT NOT NULL DEFAULT 'ollama',
    runtime_compatibility TEXT,
    tier TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    eval_summary TEXT,
    notes TEXT,
    activated_at TEXT,
    retired_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
} catch { /* already exists */ }

export { sqlite };

