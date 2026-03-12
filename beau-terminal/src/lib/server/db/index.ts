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
