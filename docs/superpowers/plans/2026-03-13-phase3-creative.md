# Phase 3: Creative Domain — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Creative domain — Resolume session tracking, witness mode, post-set debriefs, and photography — giving Beau awareness of VJ performances and visual art.

**Architecture:** Three new DB tables (`resolume_sessions`, `resolume_events`, `photos`) + `haikus.session_id` FK. Four server modules under `creative/`. Three new MQTT topics under `beau/creative/resolume/*`. Two new UI routes (`/sessions`, `/photography`). Bridge extended with session lifecycle tracking.

**Tech Stack:** SvelteKit 2.50+, Svelte 5 runes, Drizzle ORM + better-sqlite3, MQTT.js, Vitest, Tailwind CSS 4

---

## Context for Implementers

**Existing patterns to follow:**
- `src/lib/server/environment/` modules (Phase 2) — same pattern: pure logic + state machines, tested in isolation, wired into bridge.ts
- `src/lib/server/db/index.ts` — additive migrations via `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN` wrapped in try/catch
- `src/lib/server/db/schema.ts` — Drizzle table definitions organized by domain comment headers
- `src/lib/server/mqtt/topics.ts` — nested TOPICS object, SUBSCRIBE_TOPICS array, type union exports
- `src/lib/server/mqtt/bridge.ts` — BeauState type, DEFAULT_STATE, switch cases per topic, broadcast()
- `src/lib/stores/beau.svelte.ts` — mirrors BeauState defaults, label maps
- `src/routes/` — +page.server.ts for data loading, +page.svelte for display, form actions for mutations
- Design system: dark terminal aesthetic, CSS custom properties (`--bmo-green`, `--bmo-bg`, etc.), tracking-widest uppercase labels

**MQTT topic convention:** `beau/creative/resolume/session`, `beau/creative/resolume/live`, `beau/creative/resolume/debrief` — published by Pi-side, subscribed by bridge.

**Key constraint:** bridge.ts is already 286 lines. Phase 3 adds 3 more topic handlers + session lifecycle. Keep handler logic minimal in bridge.ts — delegate to creative/ modules.

---

## Chunk 1: Data Layer (Tasks 1–4)

### Task 1: Add Creative MQTT Topics

**Files:**
- Modify: `beau-terminal/src/lib/server/mqtt/topics.ts`
- Modify: `beau-terminal/src/lib/server/mqtt/topics.test.ts`

- [ ] **Step 1: Write failing tests for new topics**

Add to `topics.test.ts`:

```typescript
it('SUBSCRIBE_TOPICS includes Phase 3 creative topics', () => {
  expect(SUBSCRIBE_TOPICS).toContain(TOPICS.creative.resolume.session);
  expect(SUBSCRIBE_TOPICS).toContain(TOPICS.creative.resolume.live);
  expect(SUBSCRIBE_TOPICS).toContain(TOPICS.creative.resolume.debrief);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd beau-terminal && npx vitest run src/lib/server/mqtt/topics.test.ts`
Expected: FAIL — `TOPICS.creative` does not exist

- [ ] **Step 3: Add creative group to TOPICS and SUBSCRIBE_TOPICS**

In `topics.ts`, add to TOPICS object (after `command` group):

```typescript
creative: {
  resolume: {
    session: 'beau/creative/resolume/session',
    live: 'beau/creative/resolume/live',
    debrief: 'beau/creative/resolume/debrief',
  },
},
```

Add to SUBSCRIBE_TOPICS array (after Phase 2 entries, with `// Phase 3` comment):

```typescript
// Phase 3
TOPICS.creative.resolume.session,
TOPICS.creative.resolume.live,
TOPICS.creative.resolume.debrief,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/mqtt/topics.test.ts`
Expected: PASS — all tests including new Phase 3 topic assertions

- [ ] **Step 5: Commit**

```bash
git add beau-terminal/src/lib/server/mqtt/topics.ts beau-terminal/src/lib/server/mqtt/topics.test.ts
git commit -m "feat: add Phase 3 creative MQTT topics to topics.ts"
```

---

### Task 2: Add Creative Domain Tables to Schema

**Files:**
- Modify: `beau-terminal/src/lib/server/db/schema.ts`
- Modify: `beau-terminal/src/lib/server/db/index.ts`

- [ ] **Step 1: Add resolume_sessions table to schema.ts**

Add after `// ─── Environment Domain (Phase 2) ───` section:

```typescript
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
```

- [ ] **Step 2: Add resolume_events table**

```typescript
export const resolumeEvents = sqliteTable('resolume_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id').notNull().references(() => resolumeSessions.id, { onDelete: 'cascade' }),
  timestamp: text('timestamp').notNull(),
  sequence: integer('sequence').notNull(),
  eventType: text('event_type').notNull(),
  source: text('source').notNull().default('osc'),
  payloadJson: text('payload_json'),
});
```

- [ ] **Step 3: Add photos table**

```typescript
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
```

- [ ] **Step 4: Add migrations to index.ts**

Add after Phase 2 migrations block:

```typescript
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
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS idx_resolume_events_session ON resolume_events(session_id)").run(); } catch { /* already exists */ }
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS idx_resolume_events_ts ON resolume_events(timestamp)").run(); } catch { /* already exists */ }
try { sqlite.prepare("CREATE INDEX IF NOT EXISTS idx_photos_session ON photos(session_id)").run(); } catch { /* already exists */ }
```

- [ ] **Step 5: Add session_id to haikus Drizzle schema**

In `schema.ts`, add to the `haikus` table definition after `sourceContext`:

```typescript
sessionId: integer('session_id'),
```

- [ ] **Step 6: Verify build**

Run: `cd beau-terminal && npx vitest run`
Expected: All 58+ tests pass (no test changes needed — just schema + migration additions)

- [ ] **Step 7: Commit**

```bash
git add beau-terminal/src/lib/server/db/schema.ts beau-terminal/src/lib/server/db/index.ts
git commit -m "feat: add Phase 3 creative tables — resolume_sessions, resolume_events, photos"
```

---

### Task 3: Build Resolume Session Manager

**Files:**
- Create: `beau-terminal/src/lib/server/creative/resolume.ts`
- Create: `beau-terminal/src/lib/server/creative/resolume.test.ts`

**Context:** This module manages Resolume session lifecycle. A session starts when the first OSC message arrives after a quiet period. It ends when 10+ minutes pass with no OSC activity. The Pi-side Python script publishes OSC data to MQTT; this module subscribes (via bridge.ts) and persists.

- [ ] **Step 1: Write failing tests**

Create `resolume.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ResolumeSessionManager, parseResolumeSessionMessage, parseResolumeLiveMessage } from './resolume.js';

describe('ResolumeSessionManager', () => {
  let manager: ResolumeSessionManager;
  const sessionStarts: Array<{ sessionId: number }> = [];
  const sessionEnds: Array<{ sessionId: number }> = [];

  beforeEach(() => {
    sessionStarts.length = 0;
    sessionEnds.length = 0;
    manager = new ResolumeSessionManager({
      silenceThresholdMs: 100, // short for tests
      onSessionStart: (id) => sessionStarts.push({ sessionId: id }),
      onSessionEnd: (id) => sessionEnds.push({ sessionId: id }),
    });
  });

  it('starts with no active session', () => {
    expect(manager.activeSessionId).toBeNull();
    expect(manager.isActive).toBe(false);
  });

  it('creates a session on first live event', () => {
    manager.onLiveEvent({ clip: 'clip1', bpm: 120 });
    expect(manager.isActive).toBe(true);
    expect(manager.activeSessionId).toBeTypeOf('number');
    expect(sessionStarts).toHaveLength(1);
  });

  it('does not create duplicate sessions for subsequent events', () => {
    manager.onLiveEvent({ clip: 'clip1', bpm: 120 });
    manager.onLiveEvent({ clip: 'clip2', bpm: 125 });
    expect(sessionStarts).toHaveLength(1);
  });

  it('tracks BPM min/max', () => {
    manager.onLiveEvent({ clip: 'a', bpm: 110 });
    manager.onLiveEvent({ clip: 'b', bpm: 130 });
    manager.onLiveEvent({ clip: 'c', bpm: 120 });
    const stats = manager.getSessionStats();
    expect(stats?.bpmMin).toBe(110);
    expect(stats?.bpmMax).toBe(130);
  });

  it('collects unique clips', () => {
    manager.onLiveEvent({ clip: 'clip1', bpm: 120 });
    manager.onLiveEvent({ clip: 'clip2', bpm: 120 });
    manager.onLiveEvent({ clip: 'clip1', bpm: 120 });
    const stats = manager.getSessionStats();
    expect(stats?.clips).toEqual(['clip1', 'clip2']);
  });

  it('ends session after silence threshold', async () => {
    manager.onLiveEvent({ clip: 'clip1', bpm: 120 });
    await new Promise((r) => setTimeout(r, 150));
    expect(manager.isActive).toBe(false);
    expect(sessionEnds).toHaveLength(1);
  });

  it('resets silence timer on new events', async () => {
    manager.onLiveEvent({ clip: 'clip1', bpm: 120 });
    await new Promise((r) => setTimeout(r, 60));
    manager.onLiveEvent({ clip: 'clip2', bpm: 125 });
    await new Promise((r) => setTimeout(r, 60));
    // Still active because second event reset the timer
    expect(manager.isActive).toBe(true);
    expect(sessionEnds).toHaveLength(0);
  });

  it('cleanup cancels pending timers', () => {
    manager.onLiveEvent({ clip: 'clip1', bpm: 120 });
    manager.cleanup();
    expect(manager.isActive).toBe(false);
  });
});

describe('parseResolumeSessionMessage', () => {
  it('parses valid session JSON', () => {
    const result = parseResolumeSessionMessage('{"active": true, "sessionId": 1, "name": "Friday Night"}');
    expect(result).toEqual({ active: true, sessionId: 1, name: 'Friday Night' });
  });

  it('returns null for invalid JSON', () => {
    expect(parseResolumeSessionMessage('not json')).toBeNull();
  });
});

describe('parseResolumeLiveMessage', () => {
  it('parses live event JSON', () => {
    const result = parseResolumeLiveMessage('{"clip": "tunnel", "bpm": 128}');
    expect(result).toEqual({ clip: 'tunnel', bpm: 128 });
  });

  it('returns null when clip field missing', () => {
    expect(parseResolumeLiveMessage('{"bpm": 128}')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseResolumeLiveMessage('bad')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/creative/resolume.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement resolume.ts**

Create `beau-terminal/src/lib/server/creative/resolume.ts`:

```typescript
// Resolume session lifecycle manager
// Sessions start on first OSC live event after quiet. End on silence threshold.

export type LiveEvent = {
  clip: string;
  bpm: number;
  layer?: number;
  intensity?: number;
};

export type SessionStats = {
  bpmMin: number;
  bpmMax: number;
  bpmSum: number;
  eventCount: number;
  clips: string[];
};

export type ResolumeSessionConfig = {
  silenceThresholdMs?: number;
  onSessionStart?: (sessionId: number) => void;
  onSessionEnd?: (sessionId: number) => void;
};

let nextId = 1;

export class ResolumeSessionManager {
  private _activeSessionId: number | null = null;
  private _silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private _silenceThresholdMs: number;
  private _onSessionStart: (sessionId: number) => void;
  private _onSessionEnd: (sessionId: number) => void;
  private _stats: SessionStats | null = null;

  constructor(config: ResolumeSessionConfig = {}) {
    this._silenceThresholdMs = config.silenceThresholdMs ?? 10 * 60 * 1000;
    this._onSessionStart = config.onSessionStart ?? (() => {});
    this._onSessionEnd = config.onSessionEnd ?? (() => {});
  }

  get activeSessionId(): number | null {
    return this._activeSessionId;
  }

  get isActive(): boolean {
    return this._activeSessionId !== null;
  }

  onLiveEvent(event: LiveEvent): void {
    // Start new session if not active
    if (!this._activeSessionId) {
      this._activeSessionId = nextId++;
      this._stats = {
        bpmMin: event.bpm,
        bpmMax: event.bpm,
        bpmSum: event.bpm,
        eventCount: 1,
        clips: [event.clip],
      };
      this._onSessionStart(this._activeSessionId);
    } else if (this._stats) {
      // Update stats
      this._stats.bpmMin = Math.min(this._stats.bpmMin, event.bpm);
      this._stats.bpmMax = Math.max(this._stats.bpmMax, event.bpm);
      this._stats.bpmSum += event.bpm;
      this._stats.eventCount++;
      if (!this._stats.clips.includes(event.clip)) {
        this._stats.clips.push(event.clip);
      }
    }

    // Reset silence timer
    this._resetSilenceTimer();
  }

  getSessionStats(): SessionStats | null {
    return this._stats ? { ...this._stats, clips: [...this._stats.clips] } : null;
  }

  cleanup(): void {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
    if (this._activeSessionId) {
      const id = this._activeSessionId;
      this._activeSessionId = null;
      this._stats = null;
      this._onSessionEnd(id);
    }
  }

  private _resetSilenceTimer(): void {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
    }
    this._silenceTimer = setTimeout(() => {
      if (this._activeSessionId) {
        const id = this._activeSessionId;
        this._activeSessionId = null;
        this._stats = null;
        this._onSessionEnd(id);
      }
      this._silenceTimer = null;
    }, this._silenceThresholdMs);
  }
}

export function parseResolumeSessionMessage(msg: string): { active: boolean; sessionId: number; name?: string } | null {
  try {
    const data = JSON.parse(msg);
    if (typeof data.active !== 'boolean' || typeof data.sessionId !== 'number') return null;
    return { active: data.active, sessionId: data.sessionId, name: data.name ?? undefined };
  } catch {
    return null;
  }
}

export function parseResolumeLiveMessage(msg: string): LiveEvent | null {
  try {
    const data = JSON.parse(msg);
    if (typeof data.clip !== 'string') return null;
    return {
      clip: data.clip,
      bpm: typeof data.bpm === 'number' ? data.bpm : 0,
      layer: typeof data.layer === 'number' ? data.layer : undefined,
      intensity: typeof data.intensity === 'number' ? data.intensity : undefined,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/creative/resolume.test.ts`
Expected: PASS — all 12+ tests

- [ ] **Step 5: Commit**

```bash
git add beau-terminal/src/lib/server/creative/resolume.ts beau-terminal/src/lib/server/creative/resolume.test.ts
git commit -m "feat: add Resolume session manager with lifecycle + parsers"
```

---

### Task 4: Build Witness Mode Module

**Files:**
- Create: `beau-terminal/src/lib/server/creative/witness.ts`
- Create: `beau-terminal/src/lib/server/creative/witness.test.ts`

**Context:** When a Resolume session starts and Beau is present (presence = occupied), witness mode activates. It publishes `beau/state/mode` = `'witness'` via MQTT. When the session ends, it restores the previous mode. Pure logic — no DB access.

- [ ] **Step 1: Write failing tests**

Create `witness.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { WitnessController } from './witness.js';

describe('WitnessController', () => {
  let controller: WitnessController;
  const modeChanges: string[] = [];

  beforeEach(() => {
    modeChanges.length = 0;
    controller = new WitnessController({
      onModeChange: (mode) => modeChanges.push(mode),
    });
  });

  it('activates witness mode when session starts and room is occupied', () => {
    controller.onSessionStart('occupied', 'ambient');
    expect(controller.isWitnessing).toBe(true);
    expect(modeChanges).toEqual(['witness']);
  });

  it('does not activate when room is empty', () => {
    controller.onSessionStart('empty', 'ambient');
    expect(controller.isWitnessing).toBe(false);
    expect(modeChanges).toEqual([]);
  });

  it('does not activate when room is uncertain', () => {
    controller.onSessionStart('uncertain', 'ambient');
    expect(controller.isWitnessing).toBe(false);
    expect(modeChanges).toEqual([]);
  });

  it('restores previous mode on session end', () => {
    controller.onSessionStart('occupied', 'ambient');
    controller.onSessionEnd();
    expect(controller.isWitnessing).toBe(false);
    expect(modeChanges).toEqual(['witness', 'ambient']);
  });

  it('does not restore if was not witnessing', () => {
    controller.onSessionStart('empty', 'ambient');
    controller.onSessionEnd();
    expect(modeChanges).toEqual([]);
  });

  it('activates witness if presence changes to occupied during active session', () => {
    controller.onSessionStart('empty', 'collaborator');
    controller.onPresenceChange('occupied', true);
    expect(controller.isWitnessing).toBe(true);
    expect(modeChanges).toEqual(['witness']);
  });

  it('does not deactivate witness if presence goes empty during session', () => {
    controller.onSessionStart('occupied', 'ambient');
    controller.onPresenceChange('empty', true);
    // Stays in witness mode — session still active
    expect(controller.isWitnessing).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/creative/witness.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement witness.ts**

Create `beau-terminal/src/lib/server/creative/witness.ts`:

```typescript
// Witness mode controller
// Activates 'witness' mode when Resolume session is active + room is occupied.

export type WitnessConfig = {
  onModeChange: (mode: string) => void;
};

export class WitnessController {
  private _isWitnessing = false;
  private _previousMode: string | null = null;
  private _sessionActive = false;
  private _onModeChange: (mode: string) => void;

  constructor(config: WitnessConfig) {
    this._onModeChange = config.onModeChange;
  }

  get isWitnessing(): boolean {
    return this._isWitnessing;
  }

  onSessionStart(presenceState: string, currentMode: string): void {
    this._sessionActive = true;
    if (presenceState === 'occupied') {
      this._previousMode = currentMode;
      this._isWitnessing = true;
      this._onModeChange('witness');
    }
  }

  onSessionEnd(): void {
    this._sessionActive = false;
    if (this._isWitnessing && this._previousMode !== null) {
      this._isWitnessing = false;
      this._onModeChange(this._previousMode);
      this._previousMode = null;
    }
  }

  onPresenceChange(presenceState: string, sessionActive: boolean): void {
    if (!sessionActive || this._isWitnessing) return;
    if (presenceState === 'occupied') {
      this._previousMode = this._previousMode ?? 'ambient';
      this._isWitnessing = true;
      this._onModeChange('witness');
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/creative/witness.test.ts`
Expected: PASS — all 7 tests

- [ ] **Step 5: Commit**

```bash
git add beau-terminal/src/lib/server/creative/witness.ts beau-terminal/src/lib/server/creative/witness.test.ts
git commit -m "feat: add WitnessController — witness mode on Resolume + presence"
```

---

## Chunk 2: Bridge + Client Integration (Tasks 5–9)

### Task 5: Build Debrief Module

**Files:**
- Create: `beau-terminal/src/lib/server/creative/debrief.ts`
- Create: `beau-terminal/src/lib/server/creative/debrief.test.ts`

**Context:** After a Resolume session ends, the debrief module waits a configurable delay (3–5 min production, short for tests), then generates a reflection prompt and writes `debrief_text` to the session row. In this phase we build the prompt formatting and trigger logic — actual LLM call is a stub (publishes to `beau/command/prompt` topic for the philosopher tier to handle).

- [ ] **Step 1: Write failing tests**

Create `debrief.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatDebriefPrompt, DebriefScheduler } from './debrief.js';

describe('formatDebriefPrompt', () => {
  it('includes session duration and clips', () => {
    const prompt = formatDebriefPrompt({
      durationMinutes: 45,
      clips: ['tunnel', 'waves', 'glitch'],
      bpmRange: [110, 135],
      venue: 'Blue Moon Saloon',
    });
    expect(prompt).toContain('45');
    expect(prompt).toContain('tunnel');
    expect(prompt).toContain('Blue Moon Saloon');
    expect(prompt).toContain('110');
    expect(prompt).toContain('135');
  });

  it('handles missing venue gracefully', () => {
    const prompt = formatDebriefPrompt({
      durationMinutes: 30,
      clips: ['a'],
      bpmRange: [120, 120],
    });
    expect(prompt).not.toContain('undefined');
    expect(prompt).not.toContain('null');
  });
});

describe('DebriefScheduler', () => {
  it('triggers debrief callback after delay', async () => {
    const debriefs: number[] = [];
    const scheduler = new DebriefScheduler({
      delayMs: 50,
      onDebrief: (sessionId) => { debriefs.push(sessionId); },
    });
    scheduler.scheduleDebrief(42);
    expect(debriefs).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 80));
    expect(debriefs).toEqual([42]);
  });

  it('can cancel a pending debrief', async () => {
    const debriefs: number[] = [];
    const scheduler = new DebriefScheduler({
      delayMs: 50,
      onDebrief: (sessionId) => { debriefs.push(sessionId); },
    });
    scheduler.scheduleDebrief(42);
    scheduler.cancel(42);
    await new Promise((r) => setTimeout(r, 80));
    expect(debriefs).toHaveLength(0);
  });

  it('cleanup cancels all pending debriefs', async () => {
    const debriefs: number[] = [];
    const scheduler = new DebriefScheduler({
      delayMs: 50,
      onDebrief: (sessionId) => { debriefs.push(sessionId); },
    });
    scheduler.scheduleDebrief(1);
    scheduler.scheduleDebrief(2);
    scheduler.cleanup();
    await new Promise((r) => setTimeout(r, 80));
    expect(debriefs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/creative/debrief.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement debrief.ts**

Create `beau-terminal/src/lib/server/creative/debrief.ts`:

```typescript
// Post-session debrief — schedules reflection prompt after Resolume session ends

export type DebriefInput = {
  durationMinutes: number;
  clips: string[];
  bpmRange: [number, number];
  venue?: string;
};

export function formatDebriefPrompt(input: DebriefInput): string {
  const venueStr = input.venue ? ` at ${input.venue}` : '';
  const clipList = input.clips.join(', ');
  return [
    `Reflect on a ${input.durationMinutes}-minute VJ session${venueStr}.`,
    `BPM ranged from ${input.bpmRange[0]} to ${input.bpmRange[1]}.`,
    `Clips used: ${clipList}.`,
    `Write a brief, poetic debrief — what Beau noticed about the visual flow, energy shifts, and moments of emergence.`,
  ].join(' ');
}

export type DebriefSchedulerConfig = {
  delayMs?: number;
  onDebrief: (sessionId: number) => void;
};

export class DebriefScheduler {
  private _pending = new Map<number, ReturnType<typeof setTimeout>>();
  private _delayMs: number;
  private _onDebrief: (sessionId: number) => void;

  constructor(config: DebriefSchedulerConfig) {
    this._delayMs = config.delayMs ?? 3 * 60 * 1000; // 3 minutes default
    this._onDebrief = config.onDebrief;
  }

  scheduleDebrief(sessionId: number): void {
    this.cancel(sessionId);
    const timer = setTimeout(() => {
      this._pending.delete(sessionId);
      this._onDebrief(sessionId);
    }, this._delayMs);
    this._pending.set(sessionId, timer);
  }

  cancel(sessionId: number): void {
    const timer = this._pending.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this._pending.delete(sessionId);
    }
  }

  cleanup(): void {
    for (const timer of this._pending.values()) {
      clearTimeout(timer);
    }
    this._pending.clear();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/creative/debrief.test.ts`
Expected: PASS — all 5 tests

- [ ] **Step 5: Commit**

```bash
git add beau-terminal/src/lib/server/creative/debrief.ts beau-terminal/src/lib/server/creative/debrief.test.ts
git commit -m "feat: add debrief scheduler + prompt formatter for post-session reflections"
```

---

### Task 6: Build Photography Module

**Files:**
- Create: `beau-terminal/src/lib/server/creative/photography.ts`
- Create: `beau-terminal/src/lib/server/creative/photography.test.ts`

**Context:** The spec requires a `creative/photography.ts` module that owns photo ingest logic (file saving, MIME validation, path generation). The route's form action delegates to this module rather than embedding I/O directly — matching the established pattern from other creative/ modules.

- [ ] **Step 1: Write failing tests**

Create `photography.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generatePhotoFilename, validateImageMime, ALLOWED_IMAGE_TYPES, MAX_PHOTO_SIZE } from './photography.js';

describe('generatePhotoFilename', () => {
  it('generates a filename with the correct extension', () => {
    const name = generatePhotoFilename('photo.png');
    expect(name).toMatch(/^\d+-[a-z0-9]+\.png$/);
  });

  it('defaults to jpg when no extension', () => {
    const name = generatePhotoFilename('noext');
    expect(name).toMatch(/\.jpg$/);
  });

  it('generates unique filenames', () => {
    const a = generatePhotoFilename('a.jpg');
    const b = generatePhotoFilename('b.jpg');
    expect(a).not.toBe(b);
  });
});

describe('validateImageMime', () => {
  it('accepts image/jpeg', () => {
    expect(validateImageMime('image/jpeg')).toBe(true);
  });

  it('accepts image/png', () => {
    expect(validateImageMime('image/png')).toBe(true);
  });

  it('accepts image/webp', () => {
    expect(validateImageMime('image/webp')).toBe(true);
  });

  it('rejects text/plain', () => {
    expect(validateImageMime('text/plain')).toBe(false);
  });

  it('rejects application/pdf', () => {
    expect(validateImageMime('application/pdf')).toBe(false);
  });
});

describe('constants', () => {
  it('MAX_PHOTO_SIZE is 20MB', () => {
    expect(MAX_PHOTO_SIZE).toBe(20 * 1024 * 1024);
  });

  it('ALLOWED_IMAGE_TYPES has at least 4 types', () => {
    expect(ALLOWED_IMAGE_TYPES.length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/creative/photography.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement photography.ts**

Create `beau-terminal/src/lib/server/creative/photography.ts`:

```typescript
// Photo ingest — file validation, naming, and storage utilities

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export const MAX_PHOTO_SIZE = 20 * 1024 * 1024; // 20 MB

export function validateImageMime(mimeType: string): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mimeType);
}

export function generatePhotoFilename(originalName: string): string {
  const ext = originalName.includes('.') ? originalName.split('.').pop()! : 'jpg';
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd beau-terminal && npx vitest run src/lib/server/creative/photography.test.ts`
Expected: PASS — all 8 tests

- [ ] **Step 5: Commit**

```bash
git add beau-terminal/src/lib/server/creative/photography.ts beau-terminal/src/lib/server/creative/photography.test.ts
git commit -m "feat: add photography module — file validation + naming utilities"
```

---

### Task 7: Extend Bridge with Phase 3 Handlers

**Files:**
- Modify: `beau-terminal/src/lib/server/mqtt/bridge.ts`

**Context:** Add imports for creative modules, extend BeauState with Phase 3 fields, instantiate ResolumeSessionManager + WitnessController + DebriefScheduler, add 3 new switch cases. Keep handlers thin — delegate to modules. Bridge is already 286 lines; this will add ~60 lines.

- [ ] **Step 1: Add Phase 3 imports**

At top of bridge.ts, add:

```typescript
import { ResolumeSessionManager, parseResolumeLiveMessage } from '../creative/resolume.js';
import { WitnessController } from '../creative/witness.js';
import { DebriefScheduler, formatDebriefPrompt } from '../creative/debrief.js';
import { resolumeSessions, resolumeEvents } from '../db/schema.js';
import { eq } from 'drizzle-orm';
```

- [ ] **Step 2: Extend BeauState type with Phase 3 fields**

Add to BeauState type (after Phase 2 comment):

```typescript
// Phase 3
resolumeActive: boolean;
currentSessionId: number | null;
currentClip: string | null;
currentBpm: number | null;
```

Add to DEFAULT_STATE:

```typescript
// Phase 3
resolumeActive: false,
currentSessionId: null,
currentClip: null,
currentBpm: null,
```

- [ ] **Step 3: Instantiate creative modules in connectMQTT**

Inside `connectMQTT()`, after `sleepMachine.onChange(...)` block and before weather polling:

```typescript
// Phase 3 — Resolume session lifecycle
let dbSessionId: number | null = null;
let eventSequence = 0;

const debriefScheduler = new DebriefScheduler({
  onDebrief: (sessionId) => {
    // Generate debrief prompt and publish for philosopher tier
    try {
      const session = db.select().from(resolumeSessions).where(eq(resolumeSessions.id, sessionId)).get();
      if (!session || session.debriefText) return;
      const startTime = new Date(session.startedAt).getTime();
      const endTime = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
      const durationMinutes = Math.round((endTime - startTime) / 60000);
      const clips = session.clipsUsedJson ? JSON.parse(session.clipsUsedJson) : [];
      const prompt = formatDebriefPrompt({
        durationMinutes,
        clips,
        bpmRange: [session.bpmMin ?? 0, session.bpmMax ?? 0],
        venue: session.venue ?? undefined,
      });
      _publish?.(TOPICS.command.prompt, prompt);
    } catch { /* non-fatal */ }
  },
});

const resolumeManager = new ResolumeSessionManager({
  onSessionStart: (id) => {
    try {
      const result = db.insert(resolumeSessions).values({
        startedAt: new Date().toISOString(),
        beauPresent: state.presenceState === 'occupied',
      }).run();
      dbSessionId = Number(result.lastInsertRowid);
      eventSequence = 0;
      state = { ...state, resolumeActive: true, currentSessionId: dbSessionId };
      witnessController.onSessionStart(state.presenceState, state.mode);
      broadcast();
    } catch { /* non-fatal */ }
  },
  onSessionEnd: (id) => {
    if (dbSessionId) {
      const stats = resolumeManager.getSessionStats();
      try {
        db.update(resolumeSessions).set({
          endedAt: new Date().toISOString(),
          status: 'completed',
          bpmMin: stats?.bpmMin ?? null,
          bpmMax: stats?.bpmMax ?? null,
          bpmAvg: stats ? Math.round(stats.bpmSum / stats.eventCount) : null,
          clipsUsedJson: stats ? JSON.stringify(stats.clips) : null,
        }).where(eq(resolumeSessions.id, dbSessionId)).run();
      } catch { /* non-fatal */ }
      debriefScheduler.scheduleDebrief(dbSessionId);
    }
    witnessController.onSessionEnd();
    state = { ...state, resolumeActive: false, currentSessionId: null, currentClip: null, currentBpm: null };
    dbSessionId = null;
    broadcast();
  },
});

const witnessController = new WitnessController({
  onModeChange: (mode) => {
    state = { ...state, mode };
    _publish?.(TOPICS.state.mode, mode);
    broadcast();
  },
});
```

- [ ] **Step 4: Add topic switch cases**

Inside the `client.on('message', ...)` switch, add after the `case TOPICS.environment.seasonal:` block:

```typescript
// Phase 3 — creative
case TOPICS.creative.resolume.session:
  // External session status (informational — actual lifecycle driven by live events)
  break;
case TOPICS.creative.resolume.live: {
  const liveEvent = parseResolumeLiveMessage(msg);
  if (liveEvent) {
    resolumeManager.onLiveEvent(liveEvent);
    state = { ...state, currentClip: liveEvent.clip, currentBpm: liveEvent.bpm };
    // Persist event
    if (dbSessionId) {
      try {
        db.insert(resolumeEvents).values({
          sessionId: dbSessionId,
          timestamp: new Date().toISOString(),
          sequence: eventSequence++,
          eventType: 'clip_change',
          payloadJson: JSON.stringify(liveEvent),
        }).run();
      } catch { /* non-fatal */ }
    }
  }
  break;
}
case TOPICS.creative.resolume.debrief:
  // Debrief arrives 3-5 min after session ends — no active session guard
  try {
    const parsed = JSON.parse(msg);
    if (typeof parsed.sessionId === 'number' && typeof parsed.text === 'string') {
      db.update(resolumeSessions).set({
        debriefText: parsed.text,
      }).where(eq(resolumeSessions.id, parsed.sessionId)).run();
    }
  } catch { /* ignore malformed */ }
  break;
```

- [ ] **Step 5: Wire presence changes to witness controller**

In the existing `case TOPICS.environment.presence:` handler, after `maybeWriteSnapshot();`, add:

```typescript
witnessController.onPresenceChange(presenceMachine.state, resolumeManager.isActive);
```

- [ ] **Step 6: Verify all tests pass**

Run: `cd beau-terminal && npx vitest run`
Expected: All tests pass (existing + new)

- [ ] **Step 7: Commit**

```bash
git add beau-terminal/src/lib/server/mqtt/bridge.ts
git commit -m "feat: extend bridge with Phase 3 Resolume handlers + session lifecycle"
```

---

### Task 8: Extend Client Store with Phase 3 Fields

**Files:**
- Modify: `beau-terminal/src/lib/stores/beau.svelte.ts`

- [ ] **Step 1: Add Phase 3 fields to defaultState**

After the Phase 2 comment block:

```typescript
// Phase 3
resolumeActive: false,
currentSessionId: null,
currentClip: null,
currentBpm: null,
```

- [ ] **Step 2: Verify build**

Run: `cd beau-terminal && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add beau-terminal/src/lib/stores/beau.svelte.ts
git commit -m "feat: extend client BeauState with Phase 3 resolume fields"
```

---

### Task 9: Add Dashboard Session Indicator

**Files:**
- Modify: `beau-terminal/src/routes/+page.svelte`

**Context:** Add a "RESOLUME" indicator to the environment status row. Shows "LIVE" with green accent when `resolumeActive` is true, current clip and BPM. Shows "INACTIVE" with muted color otherwise.

- [ ] **Step 1: Add RESOLUME widget to environment grid**

Change `grid-cols-3` to `grid-cols-4` on the environment status grid (line ~44), and add a fourth widget after the WEATHER widget:

```svelte
<div class="p-3 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
  <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">RESOLUME</div>
  <div class="text-sm tracking-wider font-bold"
       style="color: {beauState.resolumeActive ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
    {beauState.resolumeActive ? 'LIVE' : 'INACTIVE'}
  </div>
  {#if beauState.resolumeActive && beauState.currentClip}
    <div class="text-xs mt-1 truncate" style="color: var(--bmo-text)">
      {beauState.currentClip} · {beauState.currentBpm ?? '—'} BPM
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Verify build**

Run: `cd beau-terminal && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add beau-terminal/src/routes/+page.svelte
git commit -m "feat: add Resolume session indicator to dashboard"
```

---

## Chunk 3: UI Routes (Tasks 10–15)

### Task 10: Build /sessions List Route

**Files:**
- Create: `beau-terminal/src/routes/sessions/+page.server.ts`
- Create: `beau-terminal/src/routes/sessions/+page.svelte`

**Context:** List view of Resolume sessions. Server loads from `resolume_sessions` ordered by `started_at` desc, paginated. Client shows active session indicator from BeauState, table of past sessions.

- [ ] **Step 1: Create server load function**

Create `+page.server.ts`:

```typescript
import { db } from '$lib/server/db/index.js';
import { resolumeSessions } from '$lib/server/db/schema.js';
import { desc, count } from 'drizzle-orm';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ url }) => {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const perPage = 20;
  const offset = (page - 1) * perPage;

  const sessions = db.select().from(resolumeSessions)
    .orderBy(desc(resolumeSessions.startedAt))
    .limit(perPage)
    .offset(offset)
    .all();

  const total = db.select({ n: count() }).from(resolumeSessions).get()?.n ?? 0;

  return {
    sessions,
    page,
    totalPages: Math.ceil(total / perPage),
  };
};
```

- [ ] **Step 2: Create page component**

Create `+page.svelte`:

```svelte
<script lang="ts">
  import { beauState } from '$lib/stores/beau.svelte.js';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();

  function formatDuration(startedAt: string, endedAt: string | null): string {
    const start = new Date(startedAt).getTime();
    const end = endedAt ? new Date(endedAt).getTime() : Date.now();
    const mins = Math.round((end - start) / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }
</script>

<div class="max-w-4xl">
  <div class="mb-6">
    <h1 class="text-2xl tracking-widest font-bold" style="color: var(--bmo-green)">SESSIONS</h1>
    <p class="text-xs mt-1" style="color: var(--bmo-muted)">resolume vj session archive</p>
  </div>

  <!-- Active session indicator -->
  {#if beauState.resolumeActive}
    <div class="p-4 mb-6 border" style="border-color: var(--bmo-green); background: var(--bmo-surface)">
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full animate-pulse" style="background: var(--bmo-green)"></div>
        <span class="text-xs tracking-widest font-bold" style="color: var(--bmo-green)">LIVE SESSION</span>
      </div>
      {#if beauState.currentClip}
        <div class="text-sm mt-2" style="color: var(--bmo-text)">
          {beauState.currentClip} · {beauState.currentBpm ?? '—'} BPM
        </div>
      {/if}
    </div>
  {/if}

  <!-- Sessions table -->
  {#if data.sessions.length === 0}
    <div class="p-8 text-center border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest" style="color: var(--bmo-muted)">NO SESSIONS RECORDED</div>
      <div class="text-xs mt-2" style="color: var(--bmo-muted)">
        sessions appear automatically when resolume sends OSC data
      </div>
    </div>
  {:else}
    <div class="border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <table class="w-full text-xs">
        <thead>
          <tr style="border-bottom: 1px solid var(--bmo-border)">
            <th class="text-left p-3 tracking-widest" style="color: var(--bmo-muted)">DATE</th>
            <th class="text-left p-3 tracking-widest" style="color: var(--bmo-muted)">DURATION</th>
            <th class="text-left p-3 tracking-widest hidden md:table-cell" style="color: var(--bmo-muted)">BPM</th>
            <th class="text-left p-3 tracking-widest hidden md:table-cell" style="color: var(--bmo-muted)">STATUS</th>
            <th class="text-left p-3 tracking-widest" style="color: var(--bmo-muted)">DEBRIEF</th>
          </tr>
        </thead>
        <tbody>
          {#each data.sessions as session}
            <tr style="border-bottom: 1px solid var(--bmo-border)">
              <td class="p-3">
                <a href="/sessions/{session.id}" class="hover:underline" style="color: var(--bmo-green)">
                  {new Date(session.startedAt).toLocaleDateString()}
                </a>
              </td>
              <td class="p-3" style="color: var(--bmo-text)">
                {formatDuration(session.startedAt, session.endedAt)}
              </td>
              <td class="p-3 hidden md:table-cell" style="color: var(--bmo-text)">
                {#if session.bpmMin && session.bpmMax}
                  {Math.round(session.bpmMin)}–{Math.round(session.bpmMax)}
                {:else}
                  —
                {/if}
              </td>
              <td class="p-3 hidden md:table-cell">
                <span class="tracking-widest"
                      style="color: {session.status === 'active' ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
                  {session.status.toUpperCase()}
                </span>
              </td>
              <td class="p-3" style="color: var(--bmo-muted)">
                {session.debriefText ? '✓' : '—'}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    {#if data.totalPages > 1}
      <div class="flex justify-center gap-2 mt-4">
        {#if data.page > 1}
          <a href="?page={data.page - 1}" class="text-xs px-3 py-1 border"
             style="border-color: var(--bmo-border); color: var(--bmo-green)">PREV</a>
        {/if}
        <span class="text-xs px-3 py-1" style="color: var(--bmo-muted)">
          {data.page} / {data.totalPages}
        </span>
        {#if data.page < data.totalPages}
          <a href="?page={data.page + 1}" class="text-xs px-3 py-1 border"
             style="border-color: var(--bmo-border); color: var(--bmo-green)">NEXT</a>
        {/if}
      </div>
    {/if}
  {/if}
</div>
```

- [ ] **Step 3: Verify build**

Run: `cd beau-terminal && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add beau-terminal/src/routes/sessions/
git commit -m "feat: add /sessions list route — Resolume session archive"
```

---

### Task 11: Build /sessions/[id] Detail Route

**Files:**
- Create: `beau-terminal/src/routes/sessions/[id]/+page.server.ts`
- Create: `beau-terminal/src/routes/sessions/[id]/+page.svelte`

**Context:** Detail view for a single session. Loads session + events + linked haikus + linked photos. Shows metadata, clip timeline, BPM stats, debrief text.

- [ ] **Step 1: Create server load function**

Create `+page.server.ts`:

```typescript
import { db } from '$lib/server/db/index.js';
import { resolumeSessions, resolumeEvents, haikus, photos } from '$lib/server/db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ params }) => {
  const id = Number(params.id);
  if (isNaN(id)) error(404, 'Invalid session ID');

  const session = db.select().from(resolumeSessions).where(eq(resolumeSessions.id, id)).get();
  if (!session) error(404, 'Session not found');

  const events = db.select().from(resolumeEvents)
    .where(eq(resolumeEvents.sessionId, id))
    .orderBy(resolumeEvents.sequence)
    .all();

  const linkedHaikus = db.select().from(haikus)
    .where(eq(haikus.sessionId, id))
    .orderBy(desc(haikus.createdAt))
    .all();

  const linkedPhotos = db.select().from(photos)
    .where(eq(photos.sessionId, id))
    .orderBy(desc(photos.createdAt))
    .all();

  return { session, events, linkedHaikus, linkedPhotos };
};
```

- [ ] **Step 2: Create detail page component**

Create `+page.svelte`:

```svelte
<script lang="ts">
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();
  const session = $derived(data.session);

  function formatDuration(startedAt: string, endedAt: string | null): string {
    const start = new Date(startedAt).getTime();
    const end = endedAt ? new Date(endedAt).getTime() : Date.now();
    const mins = Math.round((end - start) / 60000);
    if (mins < 60) return `${mins} minutes`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  const clips = $derived(session.clipsUsedJson ? JSON.parse(session.clipsUsedJson) as string[] : []);
  const moodTags = $derived(session.moodTagsJson ? JSON.parse(session.moodTagsJson) as string[] : []);
</script>

<div class="max-w-4xl">
  <!-- Header -->
  <div class="mb-6 flex items-start justify-between">
    <div>
      <a href="/sessions" class="text-xs tracking-widest mb-2 inline-block" style="color: var(--bmo-muted)">
        ← SESSIONS
      </a>
      <h1 class="text-2xl tracking-widest font-bold" style="color: var(--bmo-green)">
        {session.sessionName || new Date(session.startedAt).toLocaleDateString()}
      </h1>
      <p class="text-xs mt-1" style="color: var(--bmo-muted)">
        {new Date(session.startedAt).toLocaleString()} · {formatDuration(session.startedAt, session.endedAt)}
        {#if session.venue} · {session.venue}{/if}
      </p>
    </div>
    <span class="text-xs tracking-widest px-2 py-1 border"
          style="border-color: var(--bmo-border);
                 color: {session.status === 'active' ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
      {session.status.toUpperCase()}
    </span>
  </div>

  <!-- Stats grid -->
  <div class="grid grid-cols-3 gap-3 mb-6">
    <div class="p-3 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">BPM RANGE</div>
      <div class="text-sm font-bold" style="color: var(--bmo-green)">
        {#if session.bpmMin && session.bpmMax}
          {Math.round(session.bpmMin)} — {Math.round(session.bpmMax)}
        {:else}—{/if}
      </div>
    </div>
    <div class="p-3 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">CLIPS</div>
      <div class="text-sm font-bold" style="color: var(--bmo-green)">{clips.length}</div>
    </div>
    <div class="p-3 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">EVENTS</div>
      <div class="text-sm font-bold" style="color: var(--bmo-green)">{data.events.length}</div>
    </div>
  </div>

  <!-- Clips used -->
  {#if clips.length > 0}
    <div class="p-4 mb-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-3" style="color: var(--bmo-muted)">CLIPS USED</div>
      <div class="flex flex-wrap gap-2">
        {#each clips as clip}
          <span class="text-xs px-2 py-1 border" style="border-color: var(--bmo-border); color: var(--bmo-text)">
            {clip}
          </span>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Mood tags -->
  {#if moodTags.length > 0}
    <div class="p-4 mb-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-3" style="color: var(--bmo-muted)">MOOD</div>
      <div class="flex flex-wrap gap-2">
        {#each moodTags as tag}
          <span class="text-xs px-2 py-1" style="color: var(--bmo-green)">{tag}</span>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Debrief -->
  {#if session.debriefText}
    <div class="p-5 mb-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-3" style="color: var(--bmo-muted)">DEBRIEF</div>
      <div class="text-sm leading-relaxed italic" style="color: var(--bmo-text)">
        {#each session.debriefText.split('\n') as line}
          <p class="mb-2">{line}</p>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Event timeline -->
  {#if data.events.length > 0}
    <div class="p-4 mb-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-3" style="color: var(--bmo-muted)">
        EVENT TIMELINE ({data.events.length})
      </div>
      <div class="space-y-1 max-h-64 overflow-y-auto">
        {#each data.events as event}
          <div class="flex gap-3 text-xs py-1 border-b" style="border-color: var(--bmo-border)">
            <span style="color: var(--bmo-muted)" class="shrink-0">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
            <span class="tracking-widest" style="color: var(--bmo-green)">{event.eventType}</span>
            {#if event.payloadJson}
              <span class="truncate" style="color: var(--bmo-text)">
                {event.payloadJson}
              </span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Linked haikus -->
  {#if data.linkedHaikus.length > 0}
    <div class="p-4 mb-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-3" style="color: var(--bmo-muted)">HAIKUS</div>
      {#each data.linkedHaikus as haiku}
        <div class="text-sm leading-relaxed italic mb-3" style="color: var(--bmo-text)">
          {#each haiku.text.split('\n') as line}
            <div>{line}</div>
          {/each}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Linked photos -->
  {#if data.linkedPhotos.length > 0}
    <div class="p-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-3" style="color: var(--bmo-muted)">PHOTOS</div>
      <div class="grid grid-cols-3 gap-2">
        {#each data.linkedPhotos as photo}
          <div class="aspect-square border overflow-hidden" style="border-color: var(--bmo-border)">
            <img src="/photos/{photo.thumbnailPath || photo.imagePath}"
                 alt={photo.caption || 'session photo'}
                 class="w-full h-full object-cover" />
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
```

- [ ] **Step 3: Verify build**

Run: `cd beau-terminal && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add beau-terminal/src/routes/sessions/
git commit -m "feat: add /sessions/[id] detail route — session view with timeline"
```

---

### Task 12: Build /photography Route

**Files:**
- Create: `beau-terminal/src/routes/photography/+page.server.ts`
- Create: `beau-terminal/src/routes/photography/+page.svelte`

**Context:** Photo gallery with upload. Grid layout, contact-sheet aesthetic. Server loads from `photos` table with pagination. Upload via form action (multipart). In this phase, file storage goes to `data/photos/` with basic handling — no sharp/thumbnail generation yet (placeholder path).

- [ ] **Step 1: Create server load + actions**

Create `+page.server.ts`:

```typescript
import { db } from '$lib/server/db/index.js';
import { photos } from '$lib/server/db/schema.js';
import { desc, count, eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { validateImageMime, generatePhotoFilename, MAX_PHOTO_SIZE } from '$lib/server/creative/photography.js';
import type { PageServerLoad, Actions } from './$types.js';

const PHOTOS_DIR = join(process.cwd(), 'data', 'photos');

export const load: PageServerLoad = async ({ url }) => {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const perPage = 24;
  const offset = (page - 1) * perPage;

  const photoList = db.select().from(photos)
    .orderBy(desc(photos.createdAt))
    .limit(perPage)
    .offset(offset)
    .all();

  const total = db.select({ n: count() }).from(photos).get()?.n ?? 0;

  return {
    photos: photoList,
    page,
    totalPages: Math.ceil(total / perPage),
  };
};

export const actions: Actions = {
  upload: async ({ request }) => {
    const formData = await request.formData();
    const file = formData.get('photo') as File | null;
    if (!file || file.size === 0) return fail(400, { error: 'No file provided' });
    if (!validateImageMime(file.type)) return fail(400, { error: 'Invalid file type — images only' });
    if (file.size > MAX_PHOTO_SIZE) return fail(400, { error: 'File too large — 20 MB max' });

    const notes = (formData.get('notes') as string) || '';
    const sourceType = (formData.get('sourceType') as string) || 'instant_scan';

    const filename = generatePhotoFilename(file.name);

    mkdirSync(PHOTOS_DIR, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(join(PHOTOS_DIR, filename), buffer);

    db.insert(photos).values({
      imagePath: filename,
      notes,
      sourceType,
    }).run();

    return { success: true };
  },

  delete: async ({ request }) => {
    const formData = await request.formData();
    const id = Number(formData.get('id'));
    if (isNaN(id)) return fail(400, { error: 'Invalid ID' });

    db.delete(photos).where(eq(photos.id, id)).run();
    return { success: true };
  },
};
```

- [ ] **Step 2: Create page component**

Create `+page.svelte`:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();
  let showUpload = $state(false);
</script>

<div class="max-w-4xl">
  <div class="mb-6 flex items-end justify-between">
    <div>
      <h1 class="text-2xl tracking-widest font-bold" style="color: var(--bmo-green)">PHOTOGRAPHY</h1>
      <p class="text-xs mt-1" style="color: var(--bmo-muted)">instant archive</p>
    </div>
    <button onclick={() => showUpload = !showUpload}
            class="text-xs tracking-widest px-3 py-2 border transition-all"
            style="border-color: var(--bmo-border); color: var(--bmo-green); background: transparent">
      {showUpload ? 'CANCEL' : '+ UPLOAD'}
    </button>
  </div>

  <!-- Upload form -->
  {#if showUpload}
    <form method="POST" action="?/upload" enctype="multipart/form-data" use:enhance={() => {
      return async ({ update }) => {
        await update();
        showUpload = false;
      };
    }}
          class="p-4 mb-6 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="space-y-3">
        <div>
          <label class="text-xs tracking-widest block mb-1" style="color: var(--bmo-muted)">FILE</label>
          <input type="file" name="photo" accept="image/*" required
                 class="text-xs w-full" style="color: var(--bmo-text)" />
        </div>
        <div>
          <label class="text-xs tracking-widest block mb-1" style="color: var(--bmo-muted)">NOTES</label>
          <input type="text" name="notes" placeholder="optional notes"
                 class="text-xs w-full p-2 border bg-transparent"
                 style="border-color: var(--bmo-border); color: var(--bmo-text)" />
        </div>
        <div>
          <label class="text-xs tracking-widest block mb-1" style="color: var(--bmo-muted)">SOURCE</label>
          <select name="sourceType" class="text-xs p-2 border bg-transparent"
                  style="border-color: var(--bmo-border); color: var(--bmo-text); background: var(--bmo-bg)">
            <option value="instant_scan">Instant Scan</option>
            <option value="digital">Digital</option>
            <option value="nfc_share">NFC Share</option>
            <option value="camera_capture">Camera Capture</option>
          </select>
        </div>
        <button type="submit"
                class="text-xs tracking-widest px-4 py-2 font-bold border"
                style="border-color: var(--bmo-green); color: var(--bmo-bg); background: var(--bmo-green)">
          UPLOAD
        </button>
      </div>
    </form>
  {/if}

  <!-- Gallery grid -->
  {#if data.photos.length === 0}
    <div class="p-8 text-center border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest" style="color: var(--bmo-muted)">NO PHOTOS YET</div>
      <div class="text-xs mt-2" style="color: var(--bmo-muted)">
        upload photos from sessions or daily life
      </div>
    </div>
  {:else}
    <div class="grid grid-cols-3 md:grid-cols-4 gap-2">
      {#each data.photos as photo}
        <div class="group relative aspect-square border overflow-hidden"
             style="border-color: var(--bmo-border); background: var(--bmo-surface)">
          <img src="/photos/{photo.thumbnailPath || photo.imagePath}"
               alt={photo.caption || 'photo'}
               class="w-full h-full object-cover" />
          <!-- Overlay on hover -->
          <div class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2"
               style="background: linear-gradient(transparent 40%, rgba(10,15,13,0.9))">
            {#if photo.caption}
              <div class="text-xs mb-1 truncate" style="color: var(--bmo-text)">{photo.caption}</div>
            {/if}
            <div class="flex justify-between items-center">
              <span class="text-xs" style="color: var(--bmo-muted)">
                {new Date(photo.createdAt).toLocaleDateString()}
              </span>
              <span class="text-xs tracking-widest" style="color: var(--bmo-muted)">
                {photo.sourceType.toUpperCase().replace('_', ' ')}
              </span>
            </div>
          </div>
          {#if photo.isPrivate}
            <div class="absolute top-1 right-1 text-xs px-1" style="color: var(--bmo-muted)">🔒</div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Pagination -->
    {#if data.totalPages > 1}
      <div class="flex justify-center gap-2 mt-4">
        {#if data.page > 1}
          <a href="?page={data.page - 1}" class="text-xs px-3 py-1 border"
             style="border-color: var(--bmo-border); color: var(--bmo-green)">PREV</a>
        {/if}
        <span class="text-xs px-3 py-1" style="color: var(--bmo-muted)">
          {data.page} / {data.totalPages}
        </span>
        {#if data.page < data.totalPages}
          <a href="?page={data.page + 1}" class="text-xs px-3 py-1 border"
             style="border-color: var(--bmo-border); color: var(--bmo-green)">NEXT</a>
        {/if}
      </div>
    {/if}
  {/if}
</div>
```

- [ ] **Step 3: Add static file serving for photos**

The `data/photos/` directory needs to be served. Add to `vite.config.ts` server.fs.allow or handle via SvelteKit. The simplest approach for adapter-node: add a server route.

Create `beau-terminal/src/routes/photos/[...path]/+server.ts`:

```typescript
import { error } from '@sveltejs/kit';
import { readFileSync, existsSync } from 'fs';
import { join, resolve, extname } from 'path';
import type { RequestHandler } from './$types.js';

const PHOTOS_DIR = resolve(process.cwd(), 'data', 'photos');

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export const GET: RequestHandler = async ({ params }) => {
  const filePath = resolve(PHOTOS_DIR, params.path);

  // Prevent path traversal — resolved path must stay within PHOTOS_DIR
  if (!filePath.startsWith(PHOTOS_DIR + '/') && filePath !== PHOTOS_DIR) error(403, 'Forbidden');
  if (!existsSync(filePath)) error(404, 'Not found');

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const data = readFileSync(filePath);
  return new Response(data, {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' },
  });
};
```

- [ ] **Step 4: Verify build**

Run: `cd beau-terminal && npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add beau-terminal/src/routes/photography/ beau-terminal/src/routes/photos/
git commit -m "feat: add /photography route — gallery with upload + photo file serving"
```

---

### Task 13: Enable Nav Links for /sessions and /photography

**Files:**
- Modify: `beau-terminal/src/lib/components/Nav.svelte`

- [ ] **Step 1: Enable sessions and photography nav links**

In Nav.svelte, change the CREATIVE group links:
- `/sessions`: remove `disabled: true`
- `/photography`: remove `disabled: true`

Change:
```typescript
{ href: '/sessions',    label: 'SESSIONS',    icon: '▶', disabled: true },
{ href: '/photography', label: 'PHOTOGRAPHY', icon: '◻', disabled: true },
```

To:
```typescript
{ href: '/sessions',    label: 'SESSIONS',    icon: '▶' },
{ href: '/photography', label: 'PHOTOGRAPHY', icon: '◻' },
```

- [ ] **Step 2: Verify build**

Run: `cd beau-terminal && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add beau-terminal/src/lib/components/Nav.svelte
git commit -m "feat: enable /sessions and /photography nav links"
```

---

### Task 14: Update StatusBar with Resolume Indicator

**Files:**
- Modify: `beau-terminal/src/lib/components/StatusBar.svelte`

**Context:** Add a RESOLUME indicator to the status bar that shows when a VJ session is live. Similar pattern to the existing SLEEP and ROOM indicators added in Phase 2.

- [ ] **Step 1: Read current StatusBar**

Read the file to understand the current indicator pattern.

- [ ] **Step 2: Add RESOLUME indicator**

Add after the existing indicators (SLEEP, ROOM) a new RESOLUME indicator:

```svelte
<div class="flex items-center gap-1" title="Resolume">
  <span class="text-xs tracking-widest" style="color: var(--bmo-muted)">VJ</span>
  <span class="text-xs font-bold tracking-wider"
        style="color: {beauState.resolumeActive ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
    {beauState.resolumeActive ? 'LIVE' : 'OFF'}
  </span>
</div>
```

- [ ] **Step 3: Verify build**

Run: `cd beau-terminal && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add beau-terminal/src/lib/components/StatusBar.svelte
git commit -m "feat: add Resolume VJ indicator to StatusBar"
```

---

### Task 15: Update CLAUDE.md, docs/reference.md, and Seed Data for Phase 3

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/reference.md`
- Modify: `beau-terminal/src/lib/server/db/seed.ts`

**Context:** Update documentation to reflect Phase 3 additions: 3 new tables, 3 new MQTT topics, creative/ directory, new routes, extended BeauState. Also update seed data per spec (i4, s39 → Resolume references).

- [ ] **Step 1: Update CLAUDE.md**

Update table count (14 → 17 tables), add `creative/` directory to server structure, add `/sessions` and `/photography` routes, update key files list.

- [ ] **Step 2: Update docs/reference.md**

Add Phase 3 creative MQTT topics, add 3 new table schemas, update BeauState reference, add creative/ module descriptions.

- [ ] **Step 3: Update seed.ts**

Read `beau-terminal/src/lib/server/db/seed.ts` and find idea i4 and software step s39. Update any TouchDesigner references to Resolume where appropriate per the spec's instruction to update Resolume references in seed data.

- [ ] **Step 4: Verify build**

Run: `cd beau-terminal && npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/reference.md beau-terminal/src/lib/server/db/seed.ts
git commit -m "docs: update CLAUDE.md, reference.md, and seed data for Phase 3 creative domain"
```
