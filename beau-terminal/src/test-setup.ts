import { mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Use a temp file for test DB (better-sqlite3 doesn't support :memory: with Drizzle migrations)
const testDir = join(tmpdir(), 'beau-terminal-test');
mkdirSync(testDir, { recursive: true });
process.env.DB_PATH = join(testDir, `test-${Date.now()}.db`);
