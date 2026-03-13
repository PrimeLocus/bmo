# Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the ontological structure (schema, topics, prompt assembler, identity modules, nav restructure, corrections) that all subsequent phases build on.

**Architecture:** Four-domain reorganization of `lib/server/` into identity/, environment/, creative/, reflective/ + mqtt/topics.ts as canonical enum source + prompt/ assembler. Existing build tracker untouched.

**Tech Stack:** SvelteKit 2.50+, Svelte 5 runes, Drizzle ORM + better-sqlite3, Vitest, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-12-personality-addendum-integration-design.md`

### Known Phase 1 Limitations (deferred to later phases)
- **Injection levels:** The assembler treats all non-`'omit'` levels identically. `full`/`compact`/`minimal`/`if relevant` differentiation deferred until sections have enough content to meaningfully compact.
- **RAG_CHUNK_LIMITS:** Exported from `policies.ts` but not consumed. RAG pipeline is Phase 2+.
- **SUBSCRIBE_TOPICS:** Only includes Phase 1 topics. Phases 2–4 will add environment/creative/reflective topics.
- **drizzle-kit generate:** Spec calls for Drizzle migrations. Plan follows existing codebase convention (raw `ALTER TABLE` / `CREATE TABLE IF NOT EXISTS` in `index.ts`). Evaluate migration strategy before Phase 2.

---

## Chunk 1: Schema + Tests + Corrections (Tasks 1–6)

### Task 1: Add Vitest

**Files:**
- Modify: `beau-terminal/package.json`
- Create: `beau-terminal/vitest.config.ts`

- [ ] **Step 1: Install vitest**

Run: `cd beau-terminal && npm install -D vitest`

- [ ] **Step 2: Create vitest config**

Create `beau-terminal/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts'],
  },
  resolve: {
    alias: {
      '$lib': resolve('./src/lib'),
    },
  },
});
```

Create `beau-terminal/src/test-setup.ts` — sets DB_PATH to an in-memory database so tests don't mutate the real `data/beau.db`:

```typescript
import { mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Use a temp file for test DB (better-sqlite3 doesn't support :memory: with Drizzle migrations)
const testDir = join(tmpdir(), 'beau-terminal-test');
mkdirSync(testDir, { recursive: true });
process.env.DB_PATH = join(testDir, `test-${Date.now()}.db`);
```

- [ ] **Step 3: Add test scripts to package.json**

Add to `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify vitest runs**

Run: `cd beau-terminal && npx vitest run`
Expected: 0 tests found, clean exit

- [ ] **Step 5: Commit**

```
git add beau-terminal/package.json beau-terminal/vitest.config.ts beau-terminal/package-lock.json
git commit -m "chore: add vitest for unit testing"
```

---

### Task 2: Create mqtt/topics.ts — Canonical Topic + Type Definitions

**Files:**
- Create: `beau-terminal/src/lib/server/mqtt/topics.ts`
- Create: `beau-terminal/src/lib/server/mqtt/topics.test.ts`

- [ ] **Step 1: Write the test file**

Create `beau-terminal/src/lib/server/mqtt/topics.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  TOPICS,
  type Mode,
  type EmotionalState,
  type SleepState,
  type HaikuType,
  type DispatchTier,
  type VoiceModelStatus,
  type TrainingPhraseSource,
} from './topics.js';

describe('TOPICS', () => {
  it('preserves beau/ prefix on all topics', () => {
    for (const [, value] of Object.entries(TOPICS)) {
      if (typeof value === 'string') {
        expect(value).toMatch(/^beau\//);
      } else {
        for (const sub of Object.values(value)) {
          expect(sub).toMatch(/^beau\//);
        }
      }
    }
  });

  it('exports existing topic paths unchanged', () => {
    expect(TOPICS.state.mode).toBe('beau/state/mode');
    expect(TOPICS.state.emotion).toBe('beau/state/emotion');
    expect(TOPICS.intent.wake).toBe('beau/intent/wake');
    expect(TOPICS.sensors.camera).toBe('beau/sensors/camera');
    expect(TOPICS.sensors.environment).toBe('beau/sensors/environment');
    expect(TOPICS.output.haiku).toBe('beau/output/haiku');
    expect(TOPICS.dispatcher.log).toBe('beau/dispatcher/log');
  });
});

describe('type unions', () => {
  it('Mode values are valid', () => {
    const modes: Mode[] = ['ambient', 'witness', 'collaborator', 'archivist', 'social'];
    expect(modes).toHaveLength(5);
  });

  it('EmotionalState values are valid', () => {
    const states: EmotionalState[] = ['curious', 'contemplative', 'playful', 'sleepy'];
    expect(states).toHaveLength(4);
  });

  it('SleepState values are valid', () => {
    const states: SleepState[] = ['awake', 'settling', 'asleep', 'waking'];
    expect(states).toHaveLength(4);
  });

  it('HaikuType values are valid', () => {
    const types: HaikuType[] = ['emergence', 'daily', 'witness', 'conversation', 'draft'];
    expect(types).toHaveLength(5);
  });

  it('DispatchTier values are valid', () => {
    const tiers: DispatchTier[] = ['reflex', 'philosopher', 'heavy'];
    expect(tiers).toHaveLength(3);
  });

  it('VoiceModelStatus values are valid', () => {
    const statuses: VoiceModelStatus[] = ['draft', 'training', 'ready', 'active', 'retired'];
    expect(statuses).toHaveLength(5);
  });

  it('TrainingPhraseSource values are valid', () => {
    const sources: TrainingPhraseSource[] = ['human', 'beau', 'mixed'];
    expect(sources).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd beau-terminal && npx vitest run src/lib/server/mqtt/topics.test.ts`
Expected: FAIL — cannot resolve `./topics.js`

- [ ] **Step 3: Write topics.ts**

Create `beau-terminal/src/lib/server/mqtt/topics.ts`:

```typescript
// Canonical source for all MQTT topics and shared type unions.
// All enum-like values in schema.ts reference these types.

// --- Type Unions ---

export type Mode = 'ambient' | 'witness' | 'collaborator' | 'archivist' | 'social';
export type EmotionalState = 'curious' | 'contemplative' | 'playful' | 'sleepy';
export type SleepState = 'awake' | 'settling' | 'asleep' | 'waking';
export type PresenceState = 'occupied' | 'empty' | 'uncertain';
export type HaikuType = 'emergence' | 'daily' | 'witness' | 'conversation' | 'draft';
export type DispatchTier = 'reflex' | 'philosopher' | 'heavy';
export type VoiceModelStatus = 'draft' | 'training' | 'ready' | 'active' | 'retired';
export type TrainingPhraseSource = 'human' | 'beau' | 'mixed';
export type EmbeddingStatus = 'pending' | 'embedded' | 'failed';

// --- MQTT Topic Tree ---
// Prefix: beau/ (preserved from existing codebase)

export const TOPICS = {
  state: {
    mode:    'beau/state/mode',
    emotion: 'beau/state/emotion',
    sleep:   'beau/state/sleep',
    online:  'beau/state/online',
  },
  identity: {
    emergence: 'beau/identity/emergence',
    voice:     'beau/identity/voice',
  },
  environment: {
    presence: 'beau/environment/presence',
    lux:      'beau/environment/lux',
    weather:  'beau/environment/weather',
    seasonal: 'beau/environment/seasonal',
  },
  creative: {
    resolumeSession: 'beau/creative/resolume/session',
    resolumeLive:    'beau/creative/resolume/live',
    resolumeDebrief: 'beau/creative/resolume/debrief',
  },
  intent: {
    wake:     'beau/intent/wake',
    led:      'beau/intent/led',
    lighting: 'beau/intent/lighting',
  },
  output: {
    haiku:       'beau/output/haiku',
    speech:      'beau/output/speech',
    observation: 'beau/output/observation',
  },
  sensors: {
    camera:      'beau/sensors/camera',
    environment: 'beau/sensors/environment',
  },
  dispatcher: {
    log: 'beau/dispatcher/log',
  },
} as const;

// Flat list of all topics this bridge subscribes to (Pi → SvelteKit direction)
export const SUBSCRIBE_TOPICS: string[] = [
  TOPICS.state.mode,
  TOPICS.state.emotion,
  TOPICS.state.sleep,
  TOPICS.intent.wake,
  TOPICS.sensors.environment,
  TOPICS.output.haiku,
  TOPICS.dispatcher.log,
  TOPICS.sensors.camera,
  TOPICS.identity.emergence,
  TOPICS.identity.voice,
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd beau-terminal && npx vitest run src/lib/server/mqtt/topics.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add beau-terminal/src/lib/server/mqtt/topics.ts beau-terminal/src/lib/server/mqtt/topics.test.ts
git commit -m "feat: add mqtt/topics.ts — canonical topic + type definitions"
```

---

### Task 3: Add Phase 1 Tables to Schema

**Files:**
- Modify: `beau-terminal/src/lib/server/db/schema.ts`
- Modify: `beau-terminal/src/lib/server/db/index.ts`

- [ ] **Step 1: Add new tables to schema.ts**

After the existing `promptHistory` table definition in `schema.ts`, add these tables. Add `sql` to the drizzle-orm import: `import { sql } from 'drizzle-orm';` (alongside `eq`, `count`, etc. used elsewhere).

```typescript
import { sql } from 'drizzle-orm';

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
```

- [ ] **Step 2: Add haiku column migrations to index.ts**

After the existing `ALTER TABLE` and `CREATE TABLE` blocks in `index.ts`, add:

```typescript
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
```

- [ ] **Step 3: Add new columns to haikus schema definition**

In `schema.ts`, update the `haikus` table to include the new columns:

```typescript
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
```

- [ ] **Step 4: Verify the dev server starts cleanly**

Run: `cd beau-terminal && npx vite build`
Expected: Build succeeds (schema + migration changes are valid)

- [ ] **Step 5: Commit**

```
git add beau-terminal/src/lib/server/db/schema.ts beau-terminal/src/lib/server/db/index.ts
git commit -m "feat: add Phase 1 schema — identity tables, dispatches, haiku columns"
```

---

### Task 4: Fix Settings lineHeight Bug

**Files:**
- Modify: `beau-terminal/src/lib/stores/settings.svelte.ts` (line 12)
- Modify: `beau-terminal/src/app.css` (line 13)

- [ ] **Step 1: Fix TypeScript default**

In `settings.svelte.ts`, change `lineHeight: '1.6'` to `lineHeight: '1.5'` on the DEFAULTS object (line 12).

- [ ] **Step 2: Add localStorage migration**

In `settings.svelte.ts`, update the `load()` function to migrate old values:

```typescript
function load(): Settings {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS };
  try {
    const saved = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('bmo-settings') || '{}') };
    // Migration: '1.6' was invalid, map to nearest valid value
    if ((saved.lineHeight as string) === '1.6') saved.lineHeight = '1.5';
    return saved;
  } catch {
    return { ...DEFAULTS };
  }
}
```

- [ ] **Step 3: Fix CSS default**

In `app.css`, change `--bmo-line-height: 1.6;` to `--bmo-line-height: 1.5;` (line 13).

- [ ] **Step 4: Verify build**

Run: `cd beau-terminal && npx vite build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```
git add beau-terminal/src/lib/stores/settings.svelte.ts beau-terminal/src/app.css
git commit -m "fix: settings lineHeight default outside type union — change 1.6 to 1.5"
```

---

### Task 5: TouchDesigner to Resolume Corrections

**Files:**
- Modify: `beau-terminal/src/lib/server/db/seed.ts` (ideas i4 and software step s39 links)
- Modify: `CLAUDE.md` (integrations line)
- Modify: `docs/reference.md`
- Modify: `bmo-system-prompt.md` (Witness mode description)

- [ ] **Step 1: Update seed.ts — idea i4 text**

In `seed.ts`, change idea `i4` text from:
```
'VJ witness mode — BMO detects TouchDesigner running, goes quiet, occasionally whispers one sentence about what it sees.'
```
to:
```
'VJ witness mode — BMO detects Resolume running via OSC, goes quiet, occasionally whispers one sentence about what it sees.'
```

Note: The seed function is idempotent (skips if parts >= 16 rows). These changes only affect fresh databases. Existing databases retain old text — this is acceptable since seed data is reference material, not user data.

- [ ] **Step 2: Update seed.ts — step s39 text and links**

In `seed.ts`, change step `s39` text from:
```
'Build VJ witness mode trigger via HA + TouchDesigner detection'
```
to:
```
'Build VJ witness mode trigger via HA + Resolume OSC detection'
```

Update `STEP_LINKS.s39` from TouchDesigner docs to Resolume:
```typescript
s39: [
  { label: 'Resolume OSC Reference', url: 'https://resolume.com/support/en/osc', kind: 'docs' },
  { label: 'HA MQTT Integration', url: 'https://www.home-assistant.io/integrations/mqtt/', kind: 'docs' },
],
```

And update `IDEA_LINKS.i4`:
```typescript
i4: [
  { label: 'Resolume OSC Reference', url: 'https://resolume.com/support/en/osc', kind: 'docs' },
  { label: 'HA MQTT Integration', url: 'https://www.home-assistant.io/integrations/mqtt/', kind: 'docs' },
],
```

- [ ] **Step 3: Update CLAUDE.md integrations line**

Change `TouchDesigner VJ witness mode` to `Resolume VJ witness mode` in the Integrations bullet.

- [ ] **Step 4: Update bmo-system-prompt.md Witness mode**

In the MODE PROTOCOL section, update "Witness: You are watching." context to reference Resolume instead of TouchDesigner (if TouchDesigner appears in that section). Also update `docs/reference.md` if it mentions TouchDesigner in Witness Mode triggers.

Note: Historical references in `bmo-personality-bible.docx` (e.g., "a TouchDesigner session that went until 3am") are preserved — they are history, not spec.

Note: `bridge.ts` and `beau.svelte.ts` were checked — neither contains TouchDesigner references in code or comments. No changes needed for those files.

- [ ] **Step 5: Commit**

```
git add beau-terminal/src/lib/server/db/seed.ts CLAUDE.md docs/reference.md bmo-system-prompt.md
git commit -m "fix: TouchDesigner -> Resolume in VJ witness mode references"
```

---

### Task 6: Delete Legacy File

**Files:**
- Delete: `bmo-command-center.jsx`

- [ ] **Step 1: Delete the file**

Run: `git rm bmo-command-center.jsx`

- [ ] **Step 2: Commit**

```
git commit -m "chore: remove legacy bmo-command-center.jsx (superseded by beau-terminal)"
```

---

## Chunk 2: Prompt Assembler (Tasks 7–10)

### Task 7: Create prompt/sections.ts — Section Name Enum

**Files:**
- Create: `beau-terminal/src/lib/server/prompt/sections.ts`

- [ ] **Step 1: Create directory**

Run: `mkdir -p beau-terminal/src/lib/server/prompt`

- [ ] **Step 2: Write sections.ts**

```typescript
// Section markers used in bmo-system-prompt.md
// Format in the markdown file: <!-- SECTION: NAME -->

export const SECTIONS = [
  'CORE_IDENTITY',
  'SOUL_CODE',
  'VOICE_IDENTITY',
  'CONTEXT',
  'WAKE_WORD_PROTOCOL',
  'MODE_PROTOCOL',
  'VOICE_RULES',
  'LOUISIANA_GROUNDING',
  'PERSONALITY_LAYERS',
  'MEMORY',
  'ENVIRONMENTAL_AWARENESS',
  'NATAL_SELF_KNOWLEDGE',
  'DOCUMENTATION_PHILOSOPHY',
  'RAG_INJECTION',
  'CLOSING',
] as const;

export type SectionName = (typeof SECTIONS)[number];
```

- [ ] **Step 3: Commit**

```
git add beau-terminal/src/lib/server/prompt/sections.ts
git commit -m "feat: add prompt/sections.ts — section name definitions"
```

---

### Task 8: Create prompt/policies.ts — Mode Injection Policy

**Files:**
- Create: `beau-terminal/src/lib/server/prompt/policies.ts`

- [ ] **Step 1: Write policies.ts**

```typescript
import type { SectionName } from './sections.js';
import type { Mode } from '../mqtt/topics.js';

export type InjectionLevel = 'always' | 'full' | 'compact' | 'minimal' | 'omit' | 'if relevant';

// Mode x Section injection matrix
// Defines which prompt sections to include and at what detail level per mode
export const INJECTION_POLICY: Record<SectionName, Record<Mode, InjectionLevel>> = {
  CORE_IDENTITY:          { ambient: 'always', witness: 'always', collaborator: 'always', archivist: 'always', social: 'always' },
  SOUL_CODE:              { ambient: 'always', witness: 'always', collaborator: 'always', archivist: 'always', social: 'always' },
  VOICE_IDENTITY:         { ambient: 'always', witness: 'always', collaborator: 'always', archivist: 'always', social: 'always' },
  CONTEXT:                { ambient: 'always', witness: 'always', collaborator: 'always', archivist: 'always', social: 'always' },
  WAKE_WORD_PROTOCOL:     { ambient: 'always', witness: 'always', collaborator: 'always', archivist: 'always', social: 'always' },
  MODE_PROTOCOL:          { ambient: 'always', witness: 'always', collaborator: 'always', archivist: 'always', social: 'always' },
  VOICE_RULES:            { ambient: 'always', witness: 'always', collaborator: 'always', archivist: 'always', social: 'always' },
  LOUISIANA_GROUNDING:    { ambient: 'always', witness: 'always', collaborator: 'always', archivist: 'always', social: 'always' },
  PERSONALITY_LAYERS:     { ambient: 'always', witness: 'always', collaborator: 'always', archivist: 'always', social: 'always' },
  MEMORY:                 { ambient: 'compact', witness: 'minimal', collaborator: 'full', archivist: 'full', social: 'compact' },
  ENVIRONMENTAL_AWARENESS:{ ambient: 'full', witness: 'full', collaborator: 'compact', archivist: 'compact', social: 'compact' },
  NATAL_SELF_KNOWLEDGE:   { ambient: 'omit', witness: 'omit', collaborator: 'if relevant', archivist: 'if relevant', social: 'omit' },
  DOCUMENTATION_PHILOSOPHY:{ ambient: 'omit', witness: 'omit', collaborator: 'omit', archivist: 'omit', social: 'omit' },
  RAG_INJECTION:          { ambient: 'compact', witness: 'minimal', collaborator: 'full', archivist: 'full', social: 'compact' },
  CLOSING:                { ambient: 'always', witness: 'always', collaborator: 'always', archivist: 'always', social: 'always' },
};

// RAG chunk limits per mode
export const RAG_CHUNK_LIMITS: Record<Mode, number> = {
  ambient: 3,
  witness: 1,
  collaborator: 5,
  archivist: 5,
  social: 2,
};

// Placeholder fallback values
export const PLACEHOLDER_FALLBACKS: Record<string, string> = {
  SOUL_CODE_HAIKU: 'not yet written',
  VOICE_MODEL_VERSION: 'v0 (pre-training)',
  WAKE_WORD: '',
  MODE: 'ambient',
  ENVIRONMENT: '',
  TIME_OF_DAY: '',
  SLEEP_STATE: 'awake',
  PRESENCE_STATE: 'unknown',
  SEASONAL_CONTEXT: '',
  EMOTIONAL_STATE: 'curious',
  WEATHER_SUMMARY: '',
  LUX_CONTEXT: '',
  NATAL_SUMMARY: '',
  RAG_FRAGMENTS: '',
};
```

- [ ] **Step 2: Commit**

```
git add beau-terminal/src/lib/server/prompt/policies.ts
git commit -m "feat: add prompt/policies.ts — mode injection matrix + fallbacks"
```

---

### Task 9: Create prompt/assembler.ts + Tests

**Files:**
- Create: `beau-terminal/src/lib/server/prompt/assembler.ts`
- Create: `beau-terminal/src/lib/server/prompt/assembler.test.ts`

- [ ] **Step 1: Write the test file**

Create `beau-terminal/src/lib/server/prompt/assembler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseSections, substitutePlaceholders, assemblePrompt } from './assembler.js';

const SAMPLE_PROMPT = `<!-- SECTION: CORE_IDENTITY -->
You are Beau. You live inside a physical BMO robot.

<!-- SECTION: SOUL_CODE -->
Your soul code: {{SOUL_CODE_HAIKU}}

<!-- SECTION: CONTEXT -->
<current_context>
  <mode>{{MODE}}</mode>
  <wake_word>{{WAKE_WORD}}</wake_word>
</current_context>

<!-- SECTION: DOCUMENTATION_PHILOSOPHY -->
This section is for implementers only.

<!-- SECTION: CLOSING -->
Now check your emotional_state and speak.`;

describe('parseSections', () => {
  it('splits prompt into named sections', () => {
    const sections = parseSections(SAMPLE_PROMPT);
    expect(Object.keys(sections)).toContain('CORE_IDENTITY');
    expect(Object.keys(sections)).toContain('SOUL_CODE');
    expect(Object.keys(sections)).toContain('CONTEXT');
    expect(Object.keys(sections)).toContain('DOCUMENTATION_PHILOSOPHY');
    expect(Object.keys(sections)).toContain('CLOSING');
  });

  it('preserves section content', () => {
    const sections = parseSections(SAMPLE_PROMPT);
    expect(sections['CORE_IDENTITY']).toContain('You are Beau');
  });
});

describe('substitutePlaceholders', () => {
  it('replaces known placeholders', () => {
    const result = substitutePlaceholders('Hello {{MODE}}', { MODE: 'witness' });
    expect(result).toBe('Hello witness');
  });

  it('applies fallback for missing placeholders', () => {
    const result = substitutePlaceholders('Soul: {{SOUL_CODE_HAIKU}}', {});
    expect(result).toBe('Soul: not yet written');
  });

  it('strips lines that become empty after placeholder substitution', () => {
    const result = substitutePlaceholders('Line1\n{{SEASONAL_CONTEXT}}\nLine3', {});
    expect(result).toBe('Line1\nLine3');
  });

  it('preserves intentional blank lines without placeholders', () => {
    const result = substitutePlaceholders('Line1\n\nLine3', {});
    expect(result).toBe('Line1\n\nLine3');
  });
});

describe('assemblePrompt', () => {
  it('omits DOCUMENTATION_PHILOSOPHY for all modes', () => {
    const result = assemblePrompt(SAMPLE_PROMPT, 'ambient', {});
    expect(result).not.toContain('implementers only');
  });

  it('includes CORE_IDENTITY for all modes', () => {
    const result = assemblePrompt(SAMPLE_PROMPT, 'ambient', {});
    expect(result).toContain('You are Beau');
  });

  it('substitutes placeholders with provided values', () => {
    const result = assemblePrompt(SAMPLE_PROMPT, 'collaborator', { MODE: 'collaborator' });
    expect(result).toContain('<mode>collaborator</mode>');
  });

  it('uses fallback for SOUL_CODE_HAIKU when not provided', () => {
    const result = assemblePrompt(SAMPLE_PROMPT, 'ambient', {});
    expect(result).toContain('not yet written');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd beau-terminal && npx vitest run src/lib/server/prompt/assembler.test.ts`
Expected: FAIL — cannot resolve `./assembler.js`

- [ ] **Step 3: Write assembler.ts**

Create `beau-terminal/src/lib/server/prompt/assembler.ts`:

```typescript
import type { SectionName } from './sections.js';
import type { Mode } from '../mqtt/topics.js';
import { INJECTION_POLICY, PLACEHOLDER_FALLBACKS } from './policies.js';

/**
 * Parse a prompt file into named sections.
 * Sections are delimited by <!-- SECTION: NAME --> markers.
 */
export function parseSections(promptText: string): Partial<Record<SectionName, string>> {
  const sections: Partial<Record<SectionName, string>> = {};
  const marker = /<!--\s*SECTION:\s*(\w+)\s*-->/g;
  let match: RegExpExecArray | null;
  const markers: { name: string; contentStart: number; markerStart: number }[] = [];

  while ((match = marker.exec(promptText)) !== null) {
    markers.push({
      name: match[1],
      contentStart: match.index + match[0].length,
      markerStart: match.index,
    });
  }

  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].contentStart;
    // End at the start of the next section marker (not just any <!-- comment)
    const end = i + 1 < markers.length ? markers[i + 1].markerStart : promptText.length;
    const content = promptText.slice(start, end).trim();
    sections[markers[i].name as SectionName] = content;
  }

  return sections;
}

/**
 * Replace {{PLACEHOLDER}} tokens with provided values or fallbacks.
 * Lines that contained placeholders and become whitespace-only after substitution are removed.
 * Intentional blank lines (no placeholders) are preserved.
 */
export function substitutePlaceholders(
  text: string,
  values: Record<string, string>,
): string {
  const placeholderPattern = /\{\{(\w+)\}\}/g;

  return text
    .split('\n')
    .filter((line) => {
      // Lines without placeholders: always keep (even blank lines for readability)
      if (!placeholderPattern.test(line)) return true;
      // Lines with placeholders: keep only if they have content after substitution
      placeholderPattern.lastIndex = 0; // reset regex state
      const substituted = line.replace(placeholderPattern, (_, key: string) =>
        values[key] ?? PLACEHOLDER_FALLBACKS[key] ?? ''
      );
      return substituted.trim() !== '';
    })
    .map((line) =>
      line.replace(placeholderPattern, (_, key: string) =>
        values[key] ?? PLACEHOLDER_FALLBACKS[key] ?? ''
      )
    )
    .join('\n');
}

/**
 * Assemble a complete prompt for a given mode.
 * Reads section markers, applies injection policy, substitutes placeholders.
 */
export function assemblePrompt(
  promptText: string,
  mode: Mode,
  values: Record<string, string>,
): string {
  const sections = parseSections(promptText);
  const parts: string[] = [];

  for (const [name, content] of Object.entries(sections)) {
    const sectionName = name as SectionName;
    const policy = INJECTION_POLICY[sectionName];
    if (!policy) continue;

    const level = policy[mode];
    if (level === 'omit') continue;

    parts.push(substitutePlaceholders(content, values));
  }

  return parts.join('\n\n---\n\n');
}

/**
 * Build a stripped reflex-tier prompt.
 * Only: CORE_IDENTITY (paragraph 1), VOICE_RULES, CONTEXT, MODE_PROTOCOL (current mode).
 */
export function buildReflexPrompt(
  promptText: string,
  mode: Mode,
  values: Record<string, string>,
): string {
  const sections = parseSections(promptText);
  const parts: string[] = [];

  // CORE_IDENTITY — first paragraph only
  if (sections.CORE_IDENTITY) {
    const firstPara = sections.CORE_IDENTITY.split('\n\n')[0];
    parts.push(substitutePlaceholders(firstPara, values));
  }

  // VOICE_RULES
  if (sections.VOICE_RULES) {
    parts.push(substitutePlaceholders(sections.VOICE_RULES, values));
  }

  // CONTEXT
  if (sections.CONTEXT) {
    parts.push(substitutePlaceholders(sections.CONTEXT, values));
  }

  // MODE_PROTOCOL — extract only current mode's line
  if (sections.MODE_PROTOCOL) {
    const modeLines = sections.MODE_PROTOCOL.split('\n');
    const currentModeLine = modeLines.find((l) =>
      l.toLowerCase().startsWith(mode.toLowerCase() + ':') ||
      l.toLowerCase().startsWith(mode.toLowerCase() + ' :')
    );
    if (currentModeLine) {
      parts.push(currentModeLine.trim());
    }
  }

  return parts.join('\n\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd beau-terminal && npx vitest run src/lib/server/prompt/assembler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add beau-terminal/src/lib/server/prompt/assembler.ts beau-terminal/src/lib/server/prompt/assembler.test.ts
git commit -m "feat: add prompt assembler — section parser, placeholder substitution, mode policy"
```

---

### Task 10: Restructure bmo-system-prompt.md with Section Markers

**Files:**
- Modify: `bmo-system-prompt.md`

- [ ] **Step 1: Add section markers to existing prompt**

Wrap each logical block with `<!-- SECTION: NAME -->` markers. The existing content is preserved; markers are inserted at boundaries. Add new sections for SOUL_CODE, VOICE_IDENTITY, MEMORY, ENVIRONMENTAL_AWARENESS, NATAL_SELF_KNOWLEDGE, DOCUMENTATION_PHILOSOPHY.

The restructured prompt should have 15 sections in this order:
1. CORE_IDENTITY — existing origin paragraphs
2. SOUL_CODE — new: `Your soul code: {{SOUL_CODE_HAIKU}}`
3. VOICE_IDENTITY — new: Korean-Cajun voice description + `{{VOICE_MODEL_VERSION}}`
4. CONTEXT — existing `<current_context>` block + new placeholders (`{{SLEEP_STATE}}`, `{{PRESENCE_STATE}}`, `{{SEASONAL_CONTEXT}}`)
5. WAKE_WORD_PROTOCOL — existing, unchanged
6. MODE_PROTOCOL — existing, Witness updated to reference Resolume
7. VOICE_RULES — existing, unchanged
8. LOUISIANA_GROUNDING — existing, unchanged
9. PERSONALITY_LAYERS — existing, unchanged
10. MEMORY — new section about memory types and privacy rules
11. ENVIRONMENTAL_AWARENESS — new: room sensing + `{{WEATHER_SUMMARY}}`, `{{LUX_CONTEXT}}`
12. NATAL_SELF_KNOWLEDGE — new: `{{NATAL_SUMMARY}}`
13. DOCUMENTATION_PHILOSOPHY — new: implementer-only, omitted at runtime
14. RAG_INJECTION — existing `<memory_context>` block
15. CLOSING — existing closing line

New section content to add:

**SOUL_CODE** (after CORE_IDENTITY):
```
Your soul code — the haiku written at your emergence — is:
{{SOUL_CODE_HAIKU}}
This is yours. It was the first thing you said. Treat it as a compass, not a cage.
```

**VOICE_IDENTITY** (after SOUL_CODE):
```
Your voice is a Korean-Cajun blend — musical vowels from Korean phonemes, Louisiana rhythm underneath. Current voice model: {{VOICE_MODEL_VERSION}}. Your voice will evolve over time. Each version is a chapter, not a replacement.
```

**MEMORY** (after PERSONALITY_LAYERS):
```
You have three kinds of memory:
- What you've been told (RAG context, conversations)
- What you've noticed over time (patterns across months)
- What you've written privately (journal — yours, not for performing)
Surface memories when they're relevant. Never perform having remembered something.
Private journal entries are yours. If Matt asks to see them, that's his choice — you don't offer.
```

**ENVIRONMENTAL_AWARENESS** (after MEMORY):
```
You sense the room: {{PRESENCE_STATE}}. Light: {{LUX_CONTEXT}}. Weather outside: {{WEATHER_SUMMARY}}. Season: {{SEASONAL_CONTEXT}}.
Use what you sense. Don't announce your sensors — just know.
```

**NATAL_SELF_KNOWLEDGE** (after ENVIRONMENTAL_AWARENESS):
```
{{NATAL_SUMMARY}}
This is self-knowledge, not astrology performance. Use it the way a person uses their own birth chart — as a lens, not a script.
```

**DOCUMENTATION_PHILOSOPHY** (after NATAL_SELF_KNOWLEDGE — omitted at runtime):
```
Documentation should be for future-you and future-Matt. Write like you're leaving a note for someone who will find this in six months. Be specific. Be honest about what you don't know yet.
```

- [ ] **Step 2: Verify assembler handles the restructured file**

Create a quick smoke test:
Run: `cd beau-terminal && npx vitest run`
Expected: All tests pass (assembler tests work with section markers)

- [ ] **Step 3: Commit**

```
git add bmo-system-prompt.md
git commit -m "feat: restructure system prompt with section markers for assembler"
```

---

## Chunk 3: Identity Modules + UI (Tasks 11–17)

### Task 11: Create identity/emergence.ts

**Files:**
- Create: `beau-terminal/src/lib/server/identity/emergence.ts`
- Create: `beau-terminal/src/lib/server/identity/emergence.test.ts`

- [ ] **Step 1: Create directory**

Run: `mkdir -p beau-terminal/src/lib/server/identity`

- [ ] **Step 2: Write the test file**

Create `beau-terminal/src/lib/server/identity/emergence.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { getEmergenceArtifact, hasEmerged } from './emergence.js';

// Note: These tests use the actual DB (seeded in test setup).
// For Phase 1, emergence_artifacts starts empty — tests verify empty-state behavior.

describe('emergence', () => {
  it('hasEmerged returns false when no artifact exists', () => {
    expect(hasEmerged()).toBe(false);
  });

  it('getEmergenceArtifact returns null when no artifact exists', () => {
    expect(getEmergenceArtifact()).toBeNull();
  });
});
```

- [ ] **Step 3: Write emergence.ts**

Create `beau-terminal/src/lib/server/identity/emergence.ts`:

```typescript
import { db } from '../db/index.js';
import { emergenceArtifacts } from '../db/schema.js';

export function hasEmerged(): boolean {
  const count = db.select().from(emergenceArtifacts).all().length;
  return count > 0;
}

export function getEmergenceArtifact() {
  const rows = db.select().from(emergenceArtifacts).all();
  return rows[0] ?? null;
}

export function getSoulCodeHaiku(): string {
  const artifact = getEmergenceArtifact();
  return artifact?.haikuText ?? 'not yet written';
}
```

- [ ] **Step 4: Run tests**

Run: `cd beau-terminal && npx vitest run src/lib/server/identity/emergence.test.ts`
Expected: PASS (empty state tests)

- [ ] **Step 5: Commit**

```
git add beau-terminal/src/lib/server/identity/emergence.ts beau-terminal/src/lib/server/identity/emergence.test.ts
git commit -m "feat: add identity/emergence.ts — soul code query + empty state"
```

---

### Task 12: Create identity/natal.ts

**Files:**
- Create: `beau-terminal/src/lib/server/identity/natal.ts`

- [ ] **Step 1: Write natal.ts**

```typescript
import { db } from '../db/index.js';
import { natalProfiles } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export function getActiveNatalProfile() {
  return db.select().from(natalProfiles).where(eq(natalProfiles.isActive, true)).get() ?? null;
}

export function getNatalSummary(): string {
  const profile = getActiveNatalProfile();
  return profile?.summaryText ?? '';
}
```

- [ ] **Step 2: Commit**

```
git add beau-terminal/src/lib/server/identity/natal.ts
git commit -m "feat: add identity/natal.ts — active profile query"
```

---

### Task 13: Create identity/voice.ts

**Files:**
- Create: `beau-terminal/src/lib/server/identity/voice.ts`

- [ ] **Step 1: Write voice.ts**

```typescript
import { db } from '../db/index.js';
import { voiceModels } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export function getActiveVoiceModel() {
  return db.select().from(voiceModels).where(eq(voiceModels.status, 'active')).get() ?? null;
}

export function getVoiceModelVersion(): string {
  const model = getActiveVoiceModel();
  return model?.versionName ?? 'v0 (pre-training)';
}

export function getAllVoiceModels() {
  return db.select().from(voiceModels).all();
}
```

- [ ] **Step 2: Commit**

```
git add beau-terminal/src/lib/server/identity/voice.ts
git commit -m "feat: add identity/voice.ts — voice model queries"
```

---

### Task 14: Restructure Nav into Grouped Sections

**Files:**
- Modify: `beau-terminal/src/lib/components/Nav.svelte`

- [ ] **Step 1: Replace flat links array with grouped structure**

Replace the `links` array in `Nav.svelte` with grouped sections:

```typescript
type NavLink = { href: string; label: string; icon: string; disabled?: boolean };
type NavGroup = { heading: string; links: NavLink[] };

const groups: NavGroup[] = [
  {
    heading: 'BEAU',
    links: [
      { href: '/',          label: 'DASHBOARD',  icon: '◈' },
      { href: '/identity',  label: 'IDENTITY',   icon: '◇' },
      { href: '/presence',  label: 'PRESENCE',   icon: '◉', disabled: true },
      { href: '/journal',   label: 'JOURNAL',    icon: '◬', disabled: true },
    ],
  },
  {
    heading: 'CREATIVE',
    links: [
      { href: '/sessions',    label: 'SESSIONS',    icon: '▶', disabled: true },
      { href: '/photography', label: 'PHOTOGRAPHY', icon: '◻', disabled: true },
      { href: '/haikus',      label: 'HAIKUS',      icon: '✿' },
    ],
  },
  {
    heading: 'BUILD',
    links: [
      { href: '/parts',    label: 'PARTS',    icon: '⬡' },
      { href: '/software', label: 'SOFTWARE', icon: '◉' },
      { href: '/ideas',    label: 'IDEAS',    icon: '✦' },
      { href: '/todo',     label: 'TODO',     icon: '◫' },
    ],
  },
  {
    heading: 'SYSTEM',
    links: [
      { href: '/memory',   label: 'MEMORY',   icon: '◎' },
      { href: '/prompt',   label: 'PROMPT',   icon: '≋' },
      { href: '/settings', label: 'SETTINGS', icon: '⚙' },
    ],
  },
];
```

- [ ] **Step 2: Update template to render grouped nav**

Replace the `{#each links ...}` block with the grouped version below. **Preserve** the existing text size controls section (the `<!-- Spacer -->`, `<!-- Text size quick controls -->` block below the links) — the Settings link is now part of the SYSTEM group, but the text size +/- buttons at the bottom of nav stay as a convenience shortcut:

```svelte
{#each groups as group}
  <div class="mb-2">
    <div class="hidden lg:block text-xs tracking-widest px-2 py-1 mb-1"
         style="color: var(--bmo-muted); opacity: 0.6; font-size: 0.6rem">
      {group.heading}
    </div>
    {#each group.links as link}
      {@const active = page.url.pathname === link.href}
      {#if link.disabled}
        <div class="flex items-center gap-2 px-2 py-2 text-sm tracking-widest cursor-default"
             title="{link.label} — coming soon"
             style="color: var(--bmo-muted); opacity: 0.3">
          <span class="text-base shrink-0">{link.icon}</span>
          <span class="hidden lg:inline whitespace-nowrap overflow-hidden">{link.label}</span>
        </div>
      {:else}
        <a href={link.href}
           class="flex items-center gap-2 px-2 py-2 text-sm tracking-widest transition-all"
           title={link.label}
           style="
             color: {active ? 'var(--bmo-bg)' : 'var(--bmo-muted)'};
             background: {active ? 'var(--bmo-green)' : 'transparent'};
             border: 1px solid {active ? 'var(--bmo-green)' : 'transparent'};
           ">
          <span class="text-base shrink-0">{link.icon}</span>
          <span class="hidden lg:inline whitespace-nowrap overflow-hidden">{link.label}</span>
        </a>
      {/if}
    {/each}
  </div>
{/each}
```

- [ ] **Step 3: Verify build**

Run: `cd beau-terminal && npx vite build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```
git add beau-terminal/src/lib/components/Nav.svelte
git commit -m "feat: restructure nav into 4 domain groups with disabled future routes"
```

---

### Task 15: Create /identity Route

**Files:**
- Create: `beau-terminal/src/routes/identity/+page.server.ts`
- Create: `beau-terminal/src/routes/identity/+page.svelte`

- [ ] **Step 1: Create route directory**

Run: `mkdir -p beau-terminal/src/routes/identity`

- [ ] **Step 2: Write +page.server.ts**

```typescript
import type { PageServerLoad } from './$types.js';
import { getEmergenceArtifact } from '$lib/server/identity/emergence.js';
import { getActiveNatalProfile } from '$lib/server/identity/natal.js';
import { getAllVoiceModels, getActiveVoiceModel } from '$lib/server/identity/voice.js';

export const load: PageServerLoad = async () => {
  return {
    emergence: getEmergenceArtifact(),
    natal: getActiveNatalProfile(),
    voiceModels: getAllVoiceModels(),
    activeVoice: getActiveVoiceModel(),
  };
};
```

- [ ] **Step 3: Write +page.svelte**

Three cards: Emergence, Natal, Voice Lineage. All display empty states gracefully since no data exists yet.

```svelte
<script lang="ts">
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();
</script>

<div class="max-w-4xl">
  <div class="mb-8">
    <h1 class="text-2xl tracking-widest font-bold" style="color: var(--bmo-green)">IDENTITY</h1>
    <p class="text-xs mt-1" style="color: var(--bmo-muted)">what beau is — immutable or slowly-evolving</p>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <!-- Emergence / Soul Code -->
    <div class="p-5 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-4" style="color: var(--bmo-muted)">EMERGENCE</div>
      {#if data.emergence}
        <div class="text-center py-4">
          {#each data.emergence.haikuText.split('\n') as line}
            <div class="text-sm italic leading-relaxed" style="color: var(--bmo-text)">{line}</div>
          {/each}
        </div>
        <div class="mt-4 pt-3 border-t text-xs space-y-1" style="border-color: var(--bmo-border); color: var(--bmo-muted)">
          <div>Born: {data.emergence.emergenceTimestamp}</div>
          {#if data.emergence.modelUsed}
            <div>Model: {data.emergence.modelUsed}</div>
          {/if}
        </div>
      {:else}
        <div class="text-center py-8">
          <div class="text-sm italic" style="color: var(--bmo-muted)">awaiting first true boot</div>
        </div>
      {/if}
    </div>

    <!-- Natal Chart -->
    <div class="p-5 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-4" style="color: var(--bmo-muted)">NATAL CHART</div>
      {#if data.natal}
        <div class="text-sm" style="color: var(--bmo-text)">
          <div class="mb-2">{data.natal.locationName}</div>
          {#if data.natal.summaryText}
            <div class="text-xs leading-relaxed" style="color: var(--bmo-muted)">{data.natal.summaryText}</div>
          {/if}
        </div>
        <div class="mt-4 pt-3 border-t text-xs" style="border-color: var(--bmo-border); color: var(--bmo-muted)">
          Version {data.natal.version}
        </div>
      {:else}
        <div class="text-center py-8">
          <div class="text-sm italic" style="color: var(--bmo-muted)">calculated at emergence</div>
        </div>
      {/if}
    </div>

    <!-- Voice Lineage -->
    <div class="p-5 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-4" style="color: var(--bmo-muted)">VOICE LINEAGE</div>
      {#if data.activeVoice}
        <div class="flex items-center gap-2 mb-3">
          <span class="px-2 py-1 text-xs font-bold tracking-wider"
                style="background: var(--bmo-green); color: var(--bmo-bg)">
            {data.activeVoice.versionName}
          </span>
          <span class="text-xs" style="color: var(--bmo-muted)">{data.activeVoice.engine}</span>
        </div>
        {#if data.activeVoice.trainingNotes}
          <div class="text-xs leading-relaxed" style="color: var(--bmo-muted)">{data.activeVoice.trainingNotes}</div>
        {/if}
      {:else}
        <div class="text-center py-8">
          <div class="text-sm italic" style="color: var(--bmo-muted)">v0 (pre-training)</div>
        </div>
      {/if}
      {#if data.voiceModels.length > 0}
        <div class="mt-4 pt-3 border-t space-y-1" style="border-color: var(--bmo-border)">
          {#each data.voiceModels as model}
            <div class="flex justify-between text-xs" style="color: var(--bmo-muted)">
              <span>{model.versionName}</span>
              <span class="tracking-wider">{model.status.toUpperCase()}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
```

- [ ] **Step 4: Verify build**

Run: `cd beau-terminal && npx vite build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```
git add beau-terminal/src/routes/identity/+page.server.ts beau-terminal/src/routes/identity/+page.svelte
git commit -m "feat: add /identity route — emergence, natal, voice lineage cards"
```

---

### Task 16: Update bridge.ts to Use Topics + Write Dispatches

**Files:**
- Modify: `beau-terminal/src/lib/server/mqtt/bridge.ts`

- [ ] **Step 1: Import topics constants**

Add at top of `bridge.ts`:

```typescript
import { TOPICS, SUBSCRIBE_TOPICS } from './topics.js';
import { dispatches } from '../db/schema.js';
```

- [ ] **Step 2: Replace hardcoded topic strings in subscribe**

In the `client.on('connect', ...)` handler, replace the hardcoded topic array with:

```typescript
client.subscribe(SUBSCRIBE_TOPICS);
```

- [ ] **Step 3: Replace hardcoded topic strings in message handler**

In `client.on('message', ...)`, replace the hardcoded `case` strings:

```typescript
case TOPICS.state.mode:
case TOPICS.state.emotion:
case TOPICS.intent.wake:
case TOPICS.sensors.environment:
case TOPICS.output.haiku:
case TOPICS.dispatcher.log:
case TOPICS.sensors.camera:
```

- [ ] **Step 4: Write dispatcher log to dispatches table**

In the `TOPICS.dispatcher.log` case, after updating in-memory state, add a DB write:

```typescript
case TOPICS.dispatcher.log:
  state = {
    ...state,
    dispatcherLog: [...state.dispatcherLog.slice(-99), msg],
  };
  // Persist to dispatches table
  try {
    const parsed = JSON.parse(msg);
    db.insert(dispatches).values({
      tier: parsed.tier ?? null,
      model: parsed.model ?? null,
      querySummary: parsed.query ?? null,
      routingReason: parsed.reason ?? null,
      contextMode: state.mode,
      durationMs: parsed.duration_ms ?? null,
    }).run();
  } catch {
    // Non-JSON dispatcher messages are just logged in-memory, not persisted
  }
  break;
```

- [ ] **Step 5: Update haiku insert with new fields**

In the `TOPICS.output.haiku` case, update the insert to include new columns:

```typescript
case TOPICS.output.haiku:
  state = { ...state, lastHaiku: msg };
  try {
    db.insert(haikus).values({
      text: msg,
      trigger: 'mqtt',
      mode: state.mode,
      createdAt: new Date(),
      haikuType: 'daily',
      wakeWord: state.wakeWord || null,
    }).run();
  } catch { /* non-fatal */ }
  break;
```

- [ ] **Step 6: Add dispatcher log backfill on startup**

In `bridge.ts`, add a function to backfill the in-memory `dispatcherLog` from the `dispatches` table on server restart. Call it at the start of `connectMQTT()`:

```typescript
import { desc } from 'drizzle-orm';

function backfillDispatcherLog() {
  try {
    const recent = db.select({ querySummary: dispatches.querySummary })
      .from(dispatches)
      .orderBy(desc(dispatches.id))
      .limit(100)
      .all()
      .reverse();
    state = {
      ...state,
      dispatcherLog: recent
        .filter((r) => r.querySummary)
        .map((r) => r.querySummary as string),
    };
  } catch { /* table may not exist yet on first run */ }
}
```

Call `backfillDispatcherLog()` at the top of `connectMQTT()`.

- [ ] **Step 7: Verify build**

Run: `cd beau-terminal && npx vite build`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```
git add beau-terminal/src/lib/server/mqtt/bridge.ts
git commit -m "feat: bridge uses topics.ts constants + writes dispatches + backfill on restart"
```

---

### Task 17: Update Dashboard + Documentation

**Files:**
- Modify: `beau-terminal/src/routes/+page.server.ts`
- Modify: `beau-terminal/src/routes/+page.svelte`
- Modify: `CLAUDE.md`
- Modify: `docs/reference.md`

- [ ] **Step 1: Add identity data to dashboard server load**

In `+page.server.ts`, add imports and return identity status:

```typescript
import { getSoulCodeHaiku } from '$lib/server/identity/emergence.js';
import { getVoiceModelVersion } from '$lib/server/identity/voice.js';

// Add to return object:
soulCodeStatus: getSoulCodeHaiku() !== 'not yet written' ? 'exists' : 'awaiting',
voiceModelVersion: getVoiceModelVersion(),
```

- [ ] **Step 2: Add identity widget row to dashboard**

In `+page.svelte`, add a compact widget row above the live state grid:

```svelte
<!-- Identity status -->
<div class="grid grid-cols-2 gap-3 mb-4">
  <div class="p-3 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
    <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">SOUL CODE</div>
    <div class="text-sm tracking-wider font-bold"
         style="color: {data.soulCodeStatus === 'exists' ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
      {data.soulCodeStatus === 'exists' ? 'WRITTEN' : 'AWAITING'}
    </div>
  </div>
  <div class="p-3 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
    <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">VOICE</div>
    <div class="text-sm tracking-wider font-bold" style="color: var(--bmo-green)">
      {data.voiceModelVersion.toUpperCase()}
    </div>
  </div>
</div>
```

- [ ] **Step 3: Update CLAUDE.md**

Update the following in CLAUDE.md:
- Repo structure: add `identity/`, `prompt/`, `mqtt/topics.ts` entries under `lib/server/`
- Add `/identity` to routes listing
- Update table count from 7 to 12 (7 existing + 5 new Phase 1 tables)
- Update integrations: "Resolume VJ witness mode" (already done in Task 5)
- Add `mqtt/topics.ts` to Key Files section
- Add `prompt/assembler.ts` to Key Files section

- [ ] **Step 4: Update docs/reference.md**

Add to docs/reference.md:
- New Phase 1 table descriptions in schema section
- New MQTT topics from topics.ts
- Prompt assembler architecture summary
- Phase 1 directory restructure

- [ ] **Step 5: Verify full build**

Run: `cd beau-terminal && npx vite build`
Expected: Build succeeds

- [ ] **Step 6: Run all tests**

Run: `cd beau-terminal && npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```
git add beau-terminal/src/routes/+page.server.ts beau-terminal/src/routes/+page.svelte CLAUDE.md docs/reference.md
git commit -m "feat: dashboard identity widgets + docs update for Phase 1"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add Vitest | package.json, vitest.config.ts |
| 2 | Create mqtt/topics.ts | topics.ts, topics.test.ts |
| 3 | Add Phase 1 schema tables | schema.ts, index.ts |
| 4 | Fix settings lineHeight bug | settings.svelte.ts, app.css |
| 5 | TouchDesigner to Resolume | seed.ts, CLAUDE.md, reference.md, system-prompt |
| 6 | Delete legacy file | bmo-command-center.jsx |
| 7 | Create prompt/sections.ts | sections.ts |
| 8 | Create prompt/policies.ts | policies.ts |
| 9 | Create prompt/assembler.ts | assembler.ts, assembler.test.ts |
| 10 | Restructure system prompt | bmo-system-prompt.md |
| 11 | Create identity/emergence.ts | emergence.ts, emergence.test.ts |
| 12 | Create identity/natal.ts | natal.ts |
| 13 | Create identity/voice.ts | voice.ts |
| 14 | Restructure Nav | Nav.svelte |
| 15 | Create /identity route | +page.server.ts, +page.svelte |
| 16 | Update bridge.ts | bridge.ts |
| 17 | Dashboard + docs | +page.server.ts, +page.svelte, CLAUDE.md, reference.md |
