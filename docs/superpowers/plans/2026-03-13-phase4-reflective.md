# Phase 4: Reflective — Journal + Noticings + Consent Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Beau's inner life — journal entries, pattern noticings, memory retrieval policies, and a consent-gated UI — with privacy and audit trails at every layer.

**Architecture:** Three server-side modules under `reflective/` (journal, noticings, memory) backed by three new SQLite tables. The `/journal` route uses HTTP-only session cookies for consent gating — entry bodies are only loaded when consent is active. A `/api/journal/entries` endpoint allows the Pi-side personality system to push entries via HTTP. All access is audited in `consent_events`.

**Tech Stack:** SvelteKit 2.50+ / Svelte 5 runes, Drizzle ORM + better-sqlite3, CSS custom properties, form actions with `use:enhance`

**Spec:** `docs/superpowers/specs/2026-03-12-personality-addendum-integration-design.md` — Phase 4 section

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/server/reflective/journal.ts` | Journal entry CRUD, consent validation, audit logging to `consent_events` |
| Create | `src/lib/server/reflective/journal.test.ts` | Tests for journal module |
| Create | `src/lib/server/reflective/noticings.ts` | Noticing lifecycle (draft→ready→surfaced→archived), guardrails (no behavioral), candidate querying |
| Create | `src/lib/server/reflective/noticings.test.ts` | Tests for noticings module |
| Create | `src/lib/server/reflective/memory.ts` | Retrieval policy engine — given mode + context, returns memory source configuration |
| Create | `src/lib/server/reflective/memory.test.ts` | Tests for memory module |
| Modify | `src/lib/server/db/schema.ts` | Add `journalEntries`, `noticings`, `consentEvents` tables |
| Modify | `src/lib/server/db/index.ts` | Phase 4 migration block — 3 CREATE TABLE + indexes |
| Create | `src/routes/journal/+page.server.ts` | Load (consent-gated), unlock/relock/delete actions |
| Create | `src/routes/journal/+page.svelte` | Locked/unlocked consent UI |
| Create | `src/routes/api/journal/entries/+server.ts` | POST endpoint for Pi-side journal entry push |
| Modify | `src/lib/components/Nav.svelte:15` | Remove `disabled: true` from Journal link |
| Modify | `CLAUDE.md` | Update table count to 20, add `reflective/` directory |
| Modify | `docs/reference.md` | Phase 4 tables, privacy model, reflective module descriptions |
| Modify | `src/lib/server/db/seed.ts` | Update s39 step text (or add reflective reference to ideas) |

All paths are relative to `beau-terminal/`.

---

## Chunk 1: Data Layer — Schema, Migrations, Server Modules

### Task 1: Phase 4 Schema — journal_entries, noticings, consent_events

**Files:**
- Modify: `src/lib/server/db/schema.ts:214` (append after photos table)

- [ ] **Step 1: Write the test**

Add a test to the existing topics test file pattern — verify the new tables exist in the schema export.

Create `src/lib/server/reflective/schema-check.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as schema from '$lib/server/db/schema.js';

describe('Phase 4 schema tables', () => {
  it('exports journalEntries table', () => {
    expect(schema.journalEntries).toBeDefined();
  });

  it('exports noticings table', () => {
    expect(schema.noticings).toBeDefined();
  });

  it('exports consentEvents table', () => {
    expect(schema.consentEvents).toBeDefined();
  });

  it('journalEntries has required columns', () => {
    const cols = Object.keys(schema.journalEntries);
    expect(cols).toContain('id');
    expect(cols).toContain('body');
    expect(cols).toContain('visibility');
    expect(cols).toContain('surfacedAt');
  });

  it('noticings has status and category columns', () => {
    const cols = Object.keys(schema.noticings);
    expect(cols).toContain('status');
    expect(cols).toContain('category');
    expect(cols).toContain('surfacedAt');
  });

  it('consentEvents has event_type and target columns', () => {
    const cols = Object.keys(schema.consentEvents);
    expect(cols).toContain('eventType');
    expect(cols).toContain('targetId');
    expect(cols).toContain('targetType');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd beau-terminal && npx vitest run src/lib/server/reflective/schema-check.test.ts`
Expected: FAIL — `schema.journalEntries` is undefined

- [ ] **Step 3: Add Phase 4 tables to schema.ts**

Append to `src/lib/server/db/schema.ts` after line 214 (end of `photos` table):

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd beau-terminal && npx vitest run src/lib/server/reflective/schema-check.test.ts`
Expected: PASS — all 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/db/schema.ts src/lib/server/reflective/schema-check.test.ts
git commit -m "feat: add Phase 4 reflective tables — journal_entries, noticings, consent_events"
```

---

### Task 2: Phase 4 Migrations

**Files:**
- Modify: `src/lib/server/db/index.ts:221` (append after Phase 3 indexes)

- [ ] **Step 1: Add Phase 4 migration block**

Append to `src/lib/server/db/index.ts` after line 221:

```typescript
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
```

- [ ] **Step 2: Run all tests to verify nothing breaks**

Run: `cd beau-terminal && npx vitest run`
Expected: All tests pass (94 existing + 6 new schema tests = 100)

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/db/index.ts
git commit -m "feat: add Phase 4 migrations — journal_entries, noticings, consent_events + indexes"
```

---

### Task 3: Journal Module — Entry CRUD + Consent Auditing

**Files:**
- Create: `src/lib/server/reflective/journal.ts`
- Create: `src/lib/server/reflective/journal.test.ts`

- [ ] **Step 1: Write the tests**

Create `src/lib/server/reflective/journal.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  CONSENT_EVENT_TYPES,
  CONSENT_COOKIE_NAME,
  VISIBILITY_LEVELS,
  validateVisibility,
  buildConsentEventValues,
} from './journal.js';

describe('journal constants', () => {
  it('exports valid consent event types', () => {
    expect(CONSENT_EVENT_TYPES).toContain('journal_unlocked');
    expect(CONSENT_EVENT_TYPES).toContain('journal_relocked');
    expect(CONSENT_EVENT_TYPES).toContain('journal_entry_viewed');
    expect(CONSENT_EVENT_TYPES).toContain('noticing_surfaced');
    expect(CONSENT_EVENT_TYPES).toContain('entry_deleted');
  });

  it('exports visibility levels', () => {
    expect(VISIBILITY_LEVELS).toContain('private');
    expect(VISIBILITY_LEVELS).toContain('shared');
  });
});

describe('validateVisibility', () => {
  it('accepts valid visibility levels', () => {
    expect(validateVisibility('private')).toBe('private');
    expect(validateVisibility('shared')).toBe('shared');
  });

  it('returns private for invalid input', () => {
    expect(validateVisibility('public')).toBe('private');
    expect(validateVisibility('')).toBe('private');
    expect(validateVisibility(undefined as any)).toBe('private');
  });
});

describe('buildConsentEventValues', () => {
  it('builds unlock event', () => {
    const values = buildConsentEventValues('journal_unlocked', { sessionToken: 'tok_abc' });
    expect(values.eventType).toBe('journal_unlocked');
    expect(values.sessionToken).toBe('tok_abc');
    expect(values.targetId).toBeUndefined();
  });

  it('builds entry viewed event with target', () => {
    const values = buildConsentEventValues('journal_entry_viewed', {
      targetId: 42,
      targetType: 'journal_entry',
      sessionToken: 'tok_abc',
    });
    expect(values.eventType).toBe('journal_entry_viewed');
    expect(values.targetId).toBe(42);
    expect(values.targetType).toBe('journal_entry');
  });

  it('builds delete event', () => {
    const values = buildConsentEventValues('entry_deleted', {
      targetId: 7,
      targetType: 'journal_entry',
      notes: 'user requested deletion',
    });
    expect(values.eventType).toBe('entry_deleted');
    expect(values.notes).toBe('user requested deletion');
  });

  it('rejects invalid event type', () => {
    expect(() => buildConsentEventValues('hacking' as any, {})).toThrow('Invalid consent event type');
  });
});

describe('CONSENT_COOKIE_NAME', () => {
  it('is a non-empty string', () => {
    expect(typeof CONSENT_COOKIE_NAME).toBe('string');
    expect(CONSENT_COOKIE_NAME.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd beau-terminal && npx vitest run src/lib/server/reflective/journal.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement journal module**

Create `src/lib/server/reflective/journal.ts`:

```typescript
// Journal module — entry management, consent auditing, visibility control

export const CONSENT_EVENT_TYPES = [
  'journal_unlocked',
  'journal_relocked',
  'journal_entry_viewed',
  'noticing_surfaced',
  'entry_deleted',
] as const;

export type ConsentEventType = (typeof CONSENT_EVENT_TYPES)[number];

export const VISIBILITY_LEVELS = ['private', 'shared'] as const;
export type Visibility = (typeof VISIBILITY_LEVELS)[number];

export const CONSENT_COOKIE_NAME = 'beau_journal_consent';

export function validateVisibility(value: unknown): Visibility {
  if (typeof value === 'string' && VISIBILITY_LEVELS.includes(value as Visibility)) {
    return value as Visibility;
  }
  return 'private';
}

export type ConsentEventOptions = {
  targetId?: number;
  targetType?: 'journal_entry' | 'noticing';
  sessionToken?: string;
  notes?: string;
};

export function buildConsentEventValues(
  eventType: ConsentEventType,
  options: ConsentEventOptions,
) {
  if (!CONSENT_EVENT_TYPES.includes(eventType)) {
    throw new Error(`Invalid consent event type: ${eventType}`);
  }
  return {
    eventType,
    targetId: options.targetId,
    targetType: options.targetType,
    sessionToken: options.sessionToken,
    notes: options.notes,
  };
}

/** Generate a random session token for consent cookies */
export function generateSessionToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd beau-terminal && npx vitest run src/lib/server/reflective/journal.test.ts`
Expected: PASS — all tests

- [ ] **Step 5: Run all tests**

Run: `cd beau-terminal && npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/reflective/journal.ts src/lib/server/reflective/journal.test.ts
git commit -m "feat: add journal module — consent auditing, visibility control, session tokens"
```

---

### Task 4: Noticings Module — Guardrails + Lifecycle

**Files:**
- Create: `src/lib/server/reflective/noticings.ts`
- Create: `src/lib/server/reflective/noticings.test.ts`

- [ ] **Step 1: Write the tests**

Create `src/lib/server/reflective/noticings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  NOTICING_STATUSES,
  ALLOWED_CATEGORIES,
  BLOCKED_CATEGORIES,
  validateNoticingCategory,
  isValidStatusTransition,
  canSurface,
  MIN_OBSERVATION_WINDOW_DAYS,
} from './noticings.js';

describe('noticings constants', () => {
  it('defines status lifecycle', () => {
    expect(NOTICING_STATUSES).toEqual(['draft', 'ready', 'surfaced', 'archived']);
  });

  it('allows only safe categories', () => {
    expect(ALLOWED_CATEGORIES).toContain('timing');
    expect(ALLOWED_CATEGORIES).toContain('creative');
    expect(ALLOWED_CATEGORIES).toContain('seasonal');
    expect(ALLOWED_CATEGORIES).not.toContain('behavioral');
  });

  it('blocks behavioral category', () => {
    expect(BLOCKED_CATEGORIES).toContain('behavioral');
  });

  it('enforces 90-day minimum observation window', () => {
    expect(MIN_OBSERVATION_WINDOW_DAYS).toBe(90);
  });
});

describe('validateNoticingCategory', () => {
  it('accepts allowed categories', () => {
    expect(validateNoticingCategory('timing')).toBe('timing');
    expect(validateNoticingCategory('creative')).toBe('creative');
    expect(validateNoticingCategory('seasonal')).toBe('seasonal');
  });

  it('rejects behavioral category', () => {
    expect(validateNoticingCategory('behavioral')).toBeNull();
  });

  it('rejects unknown categories', () => {
    expect(validateNoticingCategory('surveillance')).toBeNull();
    expect(validateNoticingCategory('')).toBeNull();
  });
});

describe('isValidStatusTransition', () => {
  it('allows draft → ready', () => {
    expect(isValidStatusTransition('draft', 'ready')).toBe(true);
  });

  it('allows ready → surfaced', () => {
    expect(isValidStatusTransition('ready', 'surfaced')).toBe(true);
  });

  it('allows surfaced → archived', () => {
    expect(isValidStatusTransition('surfaced', 'archived')).toBe(true);
  });

  it('allows draft → archived (skip)', () => {
    expect(isValidStatusTransition('draft', 'archived')).toBe(true);
  });

  it('rejects backward transitions', () => {
    expect(isValidStatusTransition('ready', 'draft')).toBe(false);
    expect(isValidStatusTransition('surfaced', 'ready')).toBe(false);
    expect(isValidStatusTransition('archived', 'draft')).toBe(false);
  });

  it('rejects same-state transition', () => {
    expect(isValidStatusTransition('draft', 'draft')).toBe(false);
  });
});

describe('canSurface', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  it('allows surfacing when ready and never surfaced', () => {
    expect(canSurface({
      status: 'ready',
      surfacedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
    }, now)).toBe(true);
  });

  it('blocks surfacing when already surfaced', () => {
    expect(canSurface({
      status: 'ready',
      surfacedAt: '2026-05-01T00:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
    }, now)).toBe(false);
  });

  it('blocks surfacing when not in ready status', () => {
    expect(canSurface({
      status: 'draft',
      surfacedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
    }, now)).toBe(false);
  });

  it('blocks surfacing when observation window too short', () => {
    expect(canSurface({
      status: 'ready',
      surfacedAt: null,
      createdAt: '2026-05-01T00:00:00Z', // only ~45 days ago
    }, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd beau-terminal && npx vitest run src/lib/server/reflective/noticings.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement noticings module**

Create `src/lib/server/reflective/noticings.ts`:

```typescript
// Noticings module — pattern observation lifecycle with anti-creep guardrails
// Rule: timing, creative, seasonal only. Never behavioral. Surface once, then archive.

export const NOTICING_STATUSES = ['draft', 'ready', 'surfaced', 'archived'] as const;
export type NoticingStatus = (typeof NOTICING_STATUSES)[number];

export const ALLOWED_CATEGORIES = ['timing', 'creative', 'seasonal'] as const;
export type NoticingCategory = (typeof ALLOWED_CATEGORIES)[number];

export const BLOCKED_CATEGORIES = ['behavioral'] as const;

export const MIN_OBSERVATION_WINDOW_DAYS = 90;

const STATUS_ORDER: Record<NoticingStatus, number> = {
  draft: 0,
  ready: 1,
  surfaced: 2,
  archived: 3,
};

export function validateNoticingCategory(value: string): NoticingCategory | null {
  if (BLOCKED_CATEGORIES.includes(value as any)) return null;
  if (ALLOWED_CATEGORIES.includes(value as NoticingCategory)) return value as NoticingCategory;
  return null;
}

export function isValidStatusTransition(from: NoticingStatus, to: NoticingStatus): boolean {
  if (from === to) return false;
  // Forward-only transitions, plus draft can skip to archived
  return STATUS_ORDER[to] > STATUS_ORDER[from];
}

export type SurfaceCandidate = {
  status: string;
  surfacedAt: string | null;
  createdAt: string;
};

export function canSurface(noticing: SurfaceCandidate, now: Date = new Date()): boolean {
  if (noticing.status !== 'ready') return false;
  if (noticing.surfacedAt !== null) return false;

  // Enforce minimum observation window
  const created = new Date(noticing.createdAt);
  const daysSinceCreated = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceCreated >= MIN_OBSERVATION_WINDOW_DAYS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd beau-terminal && npx vitest run src/lib/server/reflective/noticings.test.ts`
Expected: PASS — all tests

- [ ] **Step 5: Run all tests**

Run: `cd beau-terminal && npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/reflective/noticings.ts src/lib/server/reflective/noticings.test.ts
git commit -m "feat: add noticings module — lifecycle management, category guardrails, surface-once enforcement"
```

---

### Task 5: Memory Retrieval Policy Engine

**Files:**
- Create: `src/lib/server/reflective/memory.ts`
- Create: `src/lib/server/reflective/memory.test.ts`

- [ ] **Step 1: Write the tests**

Create `src/lib/server/reflective/memory.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getRetrievalPolicy, MEMORY_SOURCES } from './memory.js';

describe('MEMORY_SOURCES', () => {
  it('lists all available memory sources', () => {
    expect(MEMORY_SOURCES).toContain('journal');
    expect(MEMORY_SOURCES).toContain('haikus');
    expect(MEMORY_SOURCES).toContain('dispatches');
    expect(MEMORY_SOURCES).toContain('environment');
    expect(MEMORY_SOURCES).toContain('sessions');
    expect(MEMORY_SOURCES).toContain('noticings');
  });
});

describe('getRetrievalPolicy', () => {
  it('ambient mode includes broad shallow sources', () => {
    const policy = getRetrievalPolicy('ambient', {});
    expect(policy.sources).toContain('haikus');
    expect(policy.sources).toContain('environment');
    expect(policy.maxDepth).toBe('shallow');
  });

  it('witness mode includes sessions and environment', () => {
    const policy = getRetrievalPolicy('witness', {});
    expect(policy.sources).toContain('sessions');
    expect(policy.sources).toContain('environment');
  });

  it('collaborator mode includes dispatches and journal', () => {
    const policy = getRetrievalPolicy('collaborator', {});
    expect(policy.sources).toContain('dispatches');
    expect(policy.sources).toContain('journal');
    expect(policy.maxDepth).toBe('deep');
  });

  it('archivist mode includes all sources at deep depth', () => {
    const policy = getRetrievalPolicy('archivist', {});
    expect(policy.sources.length).toBe(MEMORY_SOURCES.length);
    expect(policy.maxDepth).toBe('deep');
  });

  it('never includes journal in social mode', () => {
    const policy = getRetrievalPolicy('social', {});
    expect(policy.sources).not.toContain('journal');
  });

  it('returns shallow depth for unknown modes', () => {
    const policy = getRetrievalPolicy('unknown-mode', {});
    expect(policy.maxDepth).toBe('shallow');
  });

  it('accepts optional context overrides', () => {
    const policy = getRetrievalPolicy('ambient', { maxResults: 10 });
    expect(policy.maxResults).toBe(10);
  });

  it('has default maxResults', () => {
    const policy = getRetrievalPolicy('ambient', {});
    expect(policy.maxResults).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd beau-terminal && npx vitest run src/lib/server/reflective/memory.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement memory module**

Create `src/lib/server/reflective/memory.ts`:

```typescript
// Memory retrieval policy engine
// Given mode + context, determines which memory sources to query and at what depth.
// Used by the Pi-side personality system to build RAG context.

export const MEMORY_SOURCES = [
  'journal',
  'haikus',
  'dispatches',
  'environment',
  'sessions',
  'noticings',
] as const;

export type MemorySource = (typeof MEMORY_SOURCES)[number];
export type RetrievalDepth = 'shallow' | 'moderate' | 'deep';

export type RetrievalPolicy = {
  sources: MemorySource[];
  maxDepth: RetrievalDepth;
  maxResults: number;
};

export type RetrievalContext = {
  maxResults?: number;
};

const MODE_POLICIES: Record<string, { sources: MemorySource[]; maxDepth: RetrievalDepth }> = {
  ambient: {
    sources: ['haikus', 'environment', 'noticings'],
    maxDepth: 'shallow',
  },
  witness: {
    sources: ['sessions', 'environment', 'haikus'],
    maxDepth: 'moderate',
  },
  collaborator: {
    sources: ['dispatches', 'journal', 'sessions', 'haikus', 'environment'],
    maxDepth: 'deep',
  },
  archivist: {
    sources: [...MEMORY_SOURCES],
    maxDepth: 'deep',
  },
  social: {
    sources: ['haikus', 'environment', 'sessions', 'noticings'],
    maxDepth: 'shallow',
  },
};

const DEFAULT_MAX_RESULTS = 5;

export function getRetrievalPolicy(mode: string, context: RetrievalContext): RetrievalPolicy {
  const modePolicy = MODE_POLICIES[mode];

  if (!modePolicy) {
    return {
      sources: ['haikus', 'environment'],
      maxDepth: 'shallow',
      maxResults: context.maxResults ?? DEFAULT_MAX_RESULTS,
    };
  }

  return {
    sources: [...modePolicy.sources],
    maxDepth: modePolicy.maxDepth,
    maxResults: context.maxResults ?? DEFAULT_MAX_RESULTS,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd beau-terminal && npx vitest run src/lib/server/reflective/memory.test.ts`
Expected: PASS — all tests

- [ ] **Step 5: Run all tests**

Run: `cd beau-terminal && npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/reflective/memory.ts src/lib/server/reflective/memory.test.ts
git commit -m "feat: add memory retrieval policy engine — mode-based source selection + depth control"
```

---

## Chunk 2: UI + API Layer — Routes, Navigation, Documentation

### Task 6: /journal Route — Server (Load + Actions + Consent Cookie)

**Files:**
- Create: `src/routes/journal/+page.server.ts`

- [ ] **Step 1: Implement journal page server**

Create `src/routes/journal/+page.server.ts`:

```typescript
import { db } from '$lib/server/db/index.js';
import { journalEntries, consentEvents } from '$lib/server/db/schema.js';
import { desc, eq, count } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import {
  CONSENT_COOKIE_NAME,
  buildConsentEventValues,
  generateSessionToken,
} from '$lib/server/reflective/journal.js';
import type { PageServerLoad, Actions } from './$types.js';

function hasConsent(cookies: import('@sveltejs/kit').Cookies): string | null {
  return cookies.get(CONSENT_COOKIE_NAME) ?? null;
}

export const load: PageServerLoad = async ({ cookies }) => {
  const sessionToken = hasConsent(cookies);
  const isUnlocked = sessionToken !== null;

  const total = db.select({ n: count() }).from(journalEntries).get()?.n ?? 0;

  if (!isUnlocked) {
    // Locked: return metadata only — no body text
    const entries = db.select({
      id: journalEntries.id,
      entryAt: journalEntries.entryAt,
      title: journalEntries.title,
      mood: journalEntries.mood,
    })
      .from(journalEntries)
      .orderBy(desc(journalEntries.entryAt))
      .limit(50)
      .all();

    return { entries, total, isUnlocked: false as const };
  }

  // Unlocked: return full entries
  const entries = db.select()
    .from(journalEntries)
    .orderBy(desc(journalEntries.entryAt))
    .limit(50)
    .all();

  // Log each entry view
  for (const entry of entries) {
    try {
      db.insert(consentEvents).values(
        buildConsentEventValues('journal_entry_viewed', {
          targetId: entry.id,
          targetType: 'journal_entry',
          sessionToken,
        })
      ).run();
      // Update surfaced_at timestamp
      if (!entry.surfacedAt) {
        db.update(journalEntries)
          .set({ surfacedAt: new Date().toISOString() })
          .where(eq(journalEntries.id, entry.id))
          .run();
      }
    } catch { /* non-fatal audit */ }
  }

  return { entries, total, isUnlocked: true as const };
};

export const actions: Actions = {
  unlock: async ({ cookies }) => {
    const token = generateSessionToken();
    cookies.set(CONSENT_COOKIE_NAME, token, {
      path: '/journal',
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // local network deployment
      // No maxAge = session-scoped (expires on browser close)
    });

    try {
      db.insert(consentEvents).values(
        buildConsentEventValues('journal_unlocked', { sessionToken: token })
      ).run();
    } catch { /* non-fatal audit */ }

    return { success: true };
  },

  relock: async ({ cookies }) => {
    const token = hasConsent(cookies);
    cookies.delete(CONSENT_COOKIE_NAME, { path: '/journal' });

    try {
      db.insert(consentEvents).values(
        buildConsentEventValues('journal_relocked', { sessionToken: token ?? undefined })
      ).run();
    } catch { /* non-fatal audit */ }

    return { success: true };
  },

  delete: async ({ request, cookies }) => {
    const sessionToken = hasConsent(cookies);
    if (!sessionToken) return fail(403, { error: 'Consent required' });

    const formData = await request.formData();
    const id = Number(formData.get('id'));
    if (!Number.isInteger(id) || id <= 0) return fail(400, { error: 'Invalid ID' });

    try {
      db.insert(consentEvents).values(
        buildConsentEventValues('entry_deleted', {
          targetId: id,
          targetType: 'journal_entry',
          sessionToken,
          notes: 'user requested deletion',
        })
      ).run();
    } catch { /* non-fatal audit */ }

    db.delete(journalEntries).where(eq(journalEntries.id, id)).run();
    return { success: true };
  },
};
```

- [ ] **Step 2: Run all tests to verify nothing breaks**

Run: `cd beau-terminal && npx vitest run`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/routes/journal/+page.server.ts
git commit -m "feat: add /journal server — consent-gated loading, unlock/relock/delete actions"
```

---

### Task 7: /journal Route — UI (Locked/Unlocked Consent Flow)

**Files:**
- Create: `src/routes/journal/+page.svelte`

- [ ] **Step 1: Implement journal page UI**

Create `src/routes/journal/+page.svelte`:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();
</script>

<div class="max-w-4xl">
  <div class="mb-6 flex items-end justify-between">
    <div>
      <h1 class="text-2xl tracking-widest font-bold" style="color: var(--bmo-green)">JOURNAL</h1>
      <p class="text-xs mt-1" style="color: var(--bmo-muted)">
        beau's inner life — {data.total} {data.total === 1 ? 'entry' : 'entries'}
      </p>
    </div>

    {#if data.isUnlocked}
      <form method="POST" action="?/relock" use:enhance>
        <button type="submit"
                class="text-xs tracking-widest px-3 py-2 border transition-all"
                style="border-color: #d63031; color: #d63031; background: transparent">
          RE-LOCK
        </button>
      </form>
    {/if}
  </div>

  {#if !data.isUnlocked}
    <!-- Locked state -->
    <div class="p-6 border mb-6" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-4" style="color: var(--bmo-muted)">ACCESS REQUIRED</div>
      <p class="text-sm mb-4 leading-relaxed" style="color: var(--bmo-text)">
        Beau's journal is private by default. Unlocking grants temporary access
        to entry content for this browser session. All views are logged.
      </p>
      <p class="text-xs mb-6" style="color: var(--bmo-muted)">
        Session-scoped — access expires when you close the browser.
      </p>
      <form method="POST" action="?/unlock" use:enhance>
        <button type="submit"
                class="text-xs tracking-widest px-4 py-2 font-bold border"
                style="border-color: var(--bmo-green); color: var(--bmo-bg); background: var(--bmo-green)">
          REQUEST ACCESS
        </button>
      </form>
    </div>

    <!-- Locked entries — metadata only -->
    {#if data.entries.length > 0}
      <div class="space-y-2">
        {#each data.entries as entry}
          <div class="p-3 border flex items-center justify-between"
               style="border-color: var(--bmo-border); background: var(--bmo-surface)">
            <div class="flex items-center gap-3">
              <span class="text-xs" style="color: var(--bmo-muted)">
                {new Date(entry.entryAt).toLocaleDateString()}
              </span>
              {#if entry.title}
                <span class="text-sm tracking-wider" style="color: var(--bmo-text)">
                  {entry.title}
                </span>
              {:else}
                <span class="text-sm italic" style="color: var(--bmo-muted)">untitled</span>
              {/if}
            </div>
            {#if entry.mood}
              <span class="text-xs tracking-widest" style="color: var(--bmo-muted)">
                {entry.mood.toUpperCase()}
              </span>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="p-8 text-center border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
        <div class="text-xs tracking-widest" style="color: var(--bmo-muted)">NO JOURNAL ENTRIES</div>
        <div class="text-xs mt-2" style="color: var(--bmo-muted)">
          entries appear when beau writes them
        </div>
      </div>
    {/if}

  {:else}
    <!-- Unlocked state -->
    <div class="p-3 mb-6 border flex items-center gap-2"
         style="border-color: var(--bmo-green); background: var(--bmo-surface)">
      <div class="w-2 h-2 rounded-full" style="background: var(--bmo-green)"></div>
      <span class="text-xs tracking-widest" style="color: var(--bmo-green)">VIEWING — ALL ACCESS LOGGED</span>
    </div>

    {#if data.entries.length === 0}
      <div class="p-8 text-center border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
        <div class="text-xs tracking-widest" style="color: var(--bmo-muted)">NO JOURNAL ENTRIES</div>
      </div>
    {:else}
      <div class="space-y-4">
        {#each data.entries as entry}
          <div class="p-5 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
            <div class="flex items-start justify-between mb-3">
              <div>
                <div class="text-xs mb-1" style="color: var(--bmo-muted)">
                  {new Date(entry.entryAt).toLocaleString()}
                  {#if entry.mood}
                    <span class="ml-2 tracking-widest">{entry.mood.toUpperCase()}</span>
                  {/if}
                </div>
                {#if entry.title}
                  <div class="text-sm tracking-wider font-bold" style="color: var(--bmo-green)">
                    {entry.title}
                  </div>
                {/if}
              </div>
              <form method="POST" action="?/delete" use:enhance>
                <input type="hidden" name="id" value={entry.id} />
                <button type="submit"
                        class="text-xs px-2 py-1 border transition-all hover:opacity-80"
                        style="border-color: var(--bmo-border); color: var(--bmo-muted); background: transparent"
                        onclick={(e) => { if (!confirm('Delete this entry? This is permanent and logged.')) e.preventDefault(); }}>
                  DELETE
                </button>
              </form>
            </div>
            <div class="text-sm leading-relaxed" style="color: var(--bmo-text)">
              {#each entry.body.split('\n') as line}
                <p class="mb-2">{line}</p>
              {/each}
            </div>
            {#if entry.tagsJson}
              {@const tags = JSON.parse(entry.tagsJson) as string[]}
              {#if tags.length > 0}
                <div class="flex flex-wrap gap-1 mt-3">
                  {#each tags as tag}
                    <span class="text-xs px-2 py-0.5 border" style="border-color: var(--bmo-border); color: var(--bmo-muted)">
                      {tag}
                    </span>
                  {/each}
                </div>
              {/if}
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
```

- [ ] **Step 2: Run all tests**

Run: `cd beau-terminal && npx vitest run`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/routes/journal/+page.svelte
git commit -m "feat: add /journal UI — locked/unlocked consent flow, entry viewer, delete"
```

---

### Task 8: /api/journal/entries — Pi-Side HTTP Push Endpoint

**Files:**
- Create: `src/routes/api/journal/entries/+server.ts`

- [ ] **Step 1: Implement API endpoint**

Create `src/routes/api/journal/entries/+server.ts`:

```typescript
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { journalEntries } from '$lib/server/db/schema.js';
import { validateVisibility } from '$lib/server/reflective/journal.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    error(400, 'Invalid JSON');
  }

  if (typeof body !== 'object' || body === null) error(400, 'Body must be an object');

  const data = body as Record<string, unknown>;

  if (typeof data.body !== 'string' || data.body.trim().length === 0) {
    error(400, 'Missing required field: body');
  }

  const values = {
    body: data.body as string,
    title: typeof data.title === 'string' ? data.title : null,
    entryAt: typeof data.entryAt === 'string' ? data.entryAt : new Date().toISOString(),
    mood: typeof data.mood === 'string' ? data.mood : null,
    tagsJson: Array.isArray(data.tags) ? JSON.stringify(data.tags) : null,
    visibility: validateVisibility(data.visibility),
    filePath: typeof data.filePath === 'string' ? data.filePath : null,
  };

  const result = db.insert(journalEntries).values(values).returning().get();
  return json({ id: result.id }, { status: 201 });
};

export const GET: RequestHandler = async ({ url }) => {
  const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit') ?? 20)), 100);

  // Metadata only — no body text via API (privacy)
  const entries = db.select({
    id: journalEntries.id,
    entryAt: journalEntries.entryAt,
    title: journalEntries.title,
    mood: journalEntries.mood,
    visibility: journalEntries.visibility,
    createdAt: journalEntries.createdAt,
  })
    .from(journalEntries)
    .orderBy(journalEntries.entryAt)
    .limit(limit)
    .all();

  return json({ entries, count: entries.length });
};
```

- [ ] **Step 2: Run all tests**

Run: `cd beau-terminal && npx vitest run`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/journal/entries/+server.ts
git commit -m "feat: add /api/journal/entries — POST for Pi-side push, GET for metadata listing"
```

---

### Task 9: Enable Journal Nav Link

**Files:**
- Modify: `src/lib/components/Nav.svelte:15`

- [ ] **Step 1: Enable the Journal link**

In `src/lib/components/Nav.svelte`, line 15, remove `disabled: true`:

Change:
```typescript
{ href: '/journal',  label: 'JOURNAL',   icon: '◬', disabled: true },
```

To:
```typescript
{ href: '/journal',  label: 'JOURNAL',   icon: '◬' },
```

- [ ] **Step 2: Run all tests**

Run: `cd beau-terminal && npx vitest run`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/Nav.svelte
git commit -m "feat: enable Journal nav link — Phase 4 route now active"
```

---

### Task 10: Documentation + Seed Updates

**Files:**
- Modify: `CLAUDE.md` (root)
- Modify: `docs/reference.md`
- Modify: `src/lib/server/db/seed.ts`

- [ ] **Step 1: Update CLAUDE.md**

In root `CLAUDE.md`, update:
- Table count from "17 tables" to "20 tables" (3 new: journal_entries, noticings, consent_events)
- Add `reflective/` to the server directory listing under `lib/server/`
- Add `/journal` and `/api/journal/entries` to the routes listing

- [ ] **Step 2: Update docs/reference.md**

Add Phase 4 section after Creative Domain Modules:

```markdown
## Reflective Domain Modules

Server-side modules under `src/lib/server/reflective/` that implement Phase 4 journal, noticings, and memory retrieval:

| Module | Purpose |
|---|---|
| `journal.ts` | Journal entry management — visibility control, consent cookie management, audit event construction |
| `noticings.ts` | Noticing lifecycle — draft/ready/surfaced/archived states, anti-creep guardrails (no behavioral category), surface-once enforcement, 90-day minimum observation window |
| `memory.ts` | Retrieval policy engine — given mode + context, returns which memory sources to query (journal, haikus, dispatches, environment, sessions, noticings) and at what depth (shallow/moderate/deep) |

### Phase 4 Privacy & Consent Model

- **Journal:** private by default, session-scoped consent (HTTP-only cookie, expires on browser close), all views audited in `consent_events`, entries deletable (logged)
- **Noticings:** 90-day minimum observation window, allowed categories only (timing/creative/seasonal — NOT behavioral), surface once then archive
- **API:** `/api/journal/entries` POST returns metadata only via GET (no body text over API)
```

Add to the Database Schema table:

```markdown
| **journal_entries** | Beau's journal entries (private by default) | id (auto), createdAt, entryAt, title, body, mood, tagsJson, visibility, surfacedAt, filePath |
| **noticings** | Pattern observations with lifecycle | id (auto), createdAt, patternText, basisSummary, observationWindow, surfacedAt, status, category |
| **consent_events** | Audit trail for journal/noticing access | id (auto), timestamp, eventType, targetId, targetType, sessionToken, notes |
```

Update table count from "17 tables" to "20 tables".

- [ ] **Step 3: Update seed.ts**

In `src/lib/server/db/seed.ts`, update idea `i7`:

Change text to:
```
'RAG from creative + reflective life — ChromaDB + nomic-embed-text indexes journals, VJ logs, noticings, project READMEs. Folder watcher auto-indexes.'
```

- [ ] **Step 4: Run all tests**

Run: `cd beau-terminal && npx vitest run`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/reference.md beau-terminal/src/lib/server/db/seed.ts
git commit -m "docs: update CLAUDE.md, reference.md, and seed data for Phase 4 reflective domain"
```

---

## Test Summary

| Task | Module | New Tests |
|------|--------|-----------|
| 1 | Schema check | 6 |
| 3 | Journal module | 8 |
| 4 | Noticings module | 16 |
| 5 | Memory module | 9 |
| **Total** | | **39 new tests** |

Expected final count: 94 (existing) + 39 (new) = **133 tests**
