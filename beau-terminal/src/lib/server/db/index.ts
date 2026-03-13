import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';
import { join } from 'path';
import { mkdirSync } from 'fs';

const DB_PATH = process.env.DB_PATH || join(process.cwd(), 'data', 'beau.db');

mkdirSync(join(process.cwd(), 'data'), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

try {
  migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });
} catch (error) {
  console.error('[db] Migration failed:', error);
  throw error;
}

// Additive column migrations — safe to run repeatedly
try { sqlite.prepare("ALTER TABLE parts ADD COLUMN expected_delivery TEXT NOT NULL DEFAULT ''").run(); } catch { /* already exists */ }
try { sqlite.prepare("ALTER TABLE parts ADD COLUMN build_version TEXT NOT NULL DEFAULT 'v1'").run(); } catch { /* already exists */ }
try { sqlite.prepare("ALTER TABLE software_steps ADD COLUMN links TEXT NOT NULL DEFAULT '[]'").run(); } catch { /* already exists */ }
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
