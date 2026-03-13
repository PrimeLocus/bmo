# Phase 2: Environment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Beau awareness of the room and the world — presence, sleep state, light, weather.

**Architecture:** Four environment modules (`presence.ts`, `sleep.ts`, `lux.ts`, `weather.ts`) that process MQTT sensor data into semantic state. Each module owns its state machine and writes to the `environment_snapshots` table. The bridge subscribes to new `beau/environment/*` and `beau/state/sleep` topics. A new `/presence` route displays the room state dashboard.

**Tech Stack:** SvelteKit 2.50+ / Svelte 5 runes, Drizzle ORM + better-sqlite3, MQTT.js, Vitest, OpenWeatherMap API (optional).

---

## Chunk 1: Infrastructure + State Machines (Tasks 1–6)

### Task 1: Restructure topics.ts — Nested Format + Phase 2 Topics + Type Unions

**Files:**
- Modify: `beau-terminal/src/lib/server/mqtt/topics.ts`
- Create: `beau-terminal/src/lib/server/mqtt/topics.test.ts`

This task also addresses the Phase 1 code review note about migrating from flat enum to nested structure.

- [ ] **Step 1: Write the test file**

Create `beau-terminal/src/lib/server/mqtt/topics.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { TOPICS, SUBSCRIBE_TOPICS, MODES, SLEEP_STATES, PRESENCE_STATES } from './topics.js';
import type { Mode, SleepState, PresenceState, HaikuType, DispatchTier } from './topics.js';

describe('TOPICS', () => {
  it('all topics have beau/ prefix', () => {
    const allValues: string[] = [];
    function collect(obj: Record<string, unknown>) {
      for (const val of Object.values(obj)) {
        if (typeof val === 'string') allValues.push(val);
        else if (typeof val === 'object' && val !== null) collect(val as Record<string, unknown>);
      }
    }
    collect(TOPICS as unknown as Record<string, unknown>);
    for (const topic of allValues) {
      expect(topic).toMatch(/^beau\//);
    }
  });

  it('SUBSCRIBE_TOPICS is a non-empty string array', () => {
    expect(SUBSCRIBE_TOPICS.length).toBeGreaterThan(0);
    for (const t of SUBSCRIBE_TOPICS) {
      expect(typeof t).toBe('string');
    }
  });

  it('SUBSCRIBE_TOPICS includes Phase 1 and Phase 2 topics', () => {
    expect(SUBSCRIBE_TOPICS).toContain(TOPICS.state.mode);
    expect(SUBSCRIBE_TOPICS).toContain(TOPICS.environment.presence);
    expect(SUBSCRIBE_TOPICS).toContain(TOPICS.state.sleep);
  });
});

describe('type unions', () => {
  it('MODES contains all 5 modes', () => {
    expect(MODES).toEqual(['ambient', 'witness', 'collaborator', 'archivist', 'social']);
  });

  it('SLEEP_STATES contains 4 states', () => {
    expect(SLEEP_STATES).toEqual(['awake', 'settling', 'asleep', 'waking']);
  });

  it('PRESENCE_STATES contains 3 states', () => {
    expect(PRESENCE_STATES).toEqual(['occupied', 'empty', 'uncertain']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/mqtt/topics.test.ts`
Expected: FAIL — nested structure doesn't exist yet

- [ ] **Step 3: Rewrite topics.ts with nested structure + type unions**

Replace `beau-terminal/src/lib/server/mqtt/topics.ts` entirely:

```typescript
// MQTT topic constants — canonical source for all topic strings and type unions

export const TOPICS = {
  state: {
    mode: 'beau/state/mode',
    emotion: 'beau/state/emotion',
    sleep: 'beau/state/sleep',
    online: 'beau/state/online',
  },
  intent: {
    wake: 'beau/intent/wake',
  },
  sensors: {
    environment: 'beau/sensors/environment',
    camera: 'beau/sensors/camera',
  },
  environment: {
    presence: 'beau/environment/presence',
    lux: 'beau/environment/lux',
    weather: 'beau/environment/weather',
    seasonal: 'beau/environment/seasonal',
  },
  output: {
    haiku: 'beau/output/haiku',
  },
  dispatcher: {
    log: 'beau/dispatcher/log',
  },
  command: {
    prompt: 'beau/command/prompt',
  },
} as const;

// Topics the terminal subscribes to (inbound from BMO)
export const SUBSCRIBE_TOPICS: string[] = [
  // Phase 1
  TOPICS.state.mode,
  TOPICS.state.emotion,
  TOPICS.intent.wake,
  TOPICS.sensors.environment,
  TOPICS.output.haiku,
  TOPICS.dispatcher.log,
  TOPICS.sensors.camera,
  // Phase 2
  TOPICS.state.sleep,
  TOPICS.environment.presence,
  TOPICS.environment.lux,
  TOPICS.environment.weather,
  TOPICS.environment.seasonal,
];

// ─── Type unions ───

export const MODES = ['ambient', 'witness', 'collaborator', 'archivist', 'social'] as const;
export type Mode = (typeof MODES)[number];

export const SLEEP_STATES = ['awake', 'settling', 'asleep', 'waking'] as const;
export type SleepState = (typeof SLEEP_STATES)[number];

export const PRESENCE_STATES = ['occupied', 'empty', 'uncertain'] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

export const HAIKU_TYPES = ['daily', 'emergence', 'reflective', 'seasonal', 'prompted'] as const;
export type HaikuType = (typeof HAIKU_TYPES)[number];

export const DISPATCH_TIERS = ['reflex', 'philosopher', 'heavy'] as const;
export type DispatchTier = (typeof DISPATCH_TIERS)[number];
```

- [ ] **Step 4: Update bridge.ts imports to use nested TOPICS**

In `beau-terminal/src/lib/server/mqtt/bridge.ts`, update all `TOPICS.STATE_MODE` → `TOPICS.state.mode`, etc:

```
TOPICS.STATE_MODE        → TOPICS.state.mode
TOPICS.STATE_EMOTION     → TOPICS.state.emotion
TOPICS.INTENT_WAKE       → TOPICS.intent.wake
TOPICS.SENSORS_ENVIRONMENT → TOPICS.sensors.environment
TOPICS.OUTPUT_HAIKU      → TOPICS.output.haiku
TOPICS.DISPATCHER_LOG    → TOPICS.dispatcher.log
TOPICS.SENSORS_CAMERA    → TOPICS.sensors.camera
```

- [ ] **Step 5: Run all tests**

Run: `cd beau-terminal && npx vitest run`
Expected: All tests pass (topics tests + existing assembler/emergence tests)

- [ ] **Step 6: Commit**

```
git add beau-terminal/src/lib/server/mqtt/topics.ts beau-terminal/src/lib/server/mqtt/topics.test.ts beau-terminal/src/lib/server/mqtt/bridge.ts
git commit -m "feat: restructure topics.ts — nested format, Phase 2 topics, type unions + tests"
```

---

### Task 2: Add Phase 2 Schema Tables + Dispatches FK

**Files:**
- Modify: `beau-terminal/src/lib/server/db/schema.ts`
- Modify: `beau-terminal/src/lib/server/db/index.ts`

- [ ] **Step 1: Add tables to schema.ts**

After the dispatches table, add:

```typescript
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
```

- [ ] **Step 2: Add environment_id column to dispatches in schema.ts**

Add to the dispatches table definition (after `promptVersion`):

```typescript
  environmentId: integer('environment_id'),
```

Note: No FK constraint in the schema definition — SQLite added via migration. The column is nullable INTEGER for forward compatibility.

- [ ] **Step 3: Add migrations to index.ts**

After the existing Phase 1 migrations, add:

```typescript
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
```

- [ ] **Step 4: Verify build**

Run: `cd beau-terminal && npx vite build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```
git add beau-terminal/src/lib/server/db/schema.ts beau-terminal/src/lib/server/db/index.ts
git commit -m "feat: add Phase 2 schema — environment_snapshots, environment_events, dispatches.environment_id"
```

---

### Task 3: Build environment/lux.ts + Tests

**Files:**
- Create: `beau-terminal/src/lib/server/environment/lux.ts`
- Create: `beau-terminal/src/lib/server/environment/lux.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { getLuxLabel, processLuxReading } from './lux.js';

describe('getLuxLabel', () => {
  it('returns "dark" for lux < 10', () => {
    expect(getLuxLabel(0)).toBe('dark');
    expect(getLuxLabel(5)).toBe('dark');
    expect(getLuxLabel(9.9)).toBe('dark');
  });

  it('returns "dim" for lux 10-100', () => {
    expect(getLuxLabel(10)).toBe('dim');
    expect(getLuxLabel(50)).toBe('dim');
    expect(getLuxLabel(99)).toBe('dim');
  });

  it('returns "lamp" for lux 100-300', () => {
    expect(getLuxLabel(100)).toBe('lamp');
    expect(getLuxLabel(200)).toBe('lamp');
  });

  it('returns "bright" for lux >= 300', () => {
    expect(getLuxLabel(300)).toBe('bright');
    expect(getLuxLabel(1000)).toBe('bright');
  });
});

describe('processLuxReading', () => {
  it('parses JSON lux message and returns numeric value + label', () => {
    const result = processLuxReading('{"lux": 45}');
    expect(result).toEqual({ lux: 45, label: 'dim' });
  });

  it('returns null for invalid JSON', () => {
    expect(processLuxReading('not json')).toBeNull();
  });

  it('returns null for missing lux field', () => {
    expect(processLuxReading('{"brightness": 100}')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/environment/lux.test.ts`

- [ ] **Step 3: Write lux.ts**

```typescript
export type LuxLabel = 'dark' | 'dim' | 'lamp' | 'bright';

const LUX_THRESHOLDS: [number, LuxLabel][] = [
  [300, 'bright'],
  [100, 'lamp'],
  [10, 'dim'],
  [0, 'dark'],
];

export function getLuxLabel(lux: number): LuxLabel {
  for (const [threshold, label] of LUX_THRESHOLDS) {
    if (lux >= threshold) return label;
  }
  return 'dark';
}

export function processLuxReading(msg: string): { lux: number; label: LuxLabel } | null {
  try {
    const parsed = JSON.parse(msg);
    if (typeof parsed.lux !== 'number') return null;
    return { lux: parsed.lux, label: getLuxLabel(parsed.lux) };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd beau-terminal && npx vitest run src/lib/server/environment/lux.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add beau-terminal/src/lib/server/environment/lux.ts beau-terminal/src/lib/server/environment/lux.test.ts
git commit -m "feat: add environment/lux.ts — light sensor labels + JSON parser"
```

---

### Task 4: Build environment/presence.ts + Tests

**Files:**
- Create: `beau-terminal/src/lib/server/environment/presence.ts`
- Create: `beau-terminal/src/lib/server/environment/presence.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { PresenceMachine } from './presence.js';
import type { PresenceState } from '../mqtt/topics.js';

describe('PresenceMachine', () => {
  let machine: PresenceMachine;

  beforeEach(() => {
    machine = new PresenceMachine();
  });

  it('starts in uncertain state', () => {
    expect(machine.state).toBe('uncertain');
    expect(machine.confidence).toBe(0);
  });

  it('transitions to occupied on camera detection', () => {
    machine.onCameraEvent({ detected: true, confidence: 0.9 });
    expect(machine.state).toBe('occupied');
    expect(machine.confidence).toBeCloseTo(0.9);
  });

  it('does not immediately transition to empty on single no-detection', () => {
    machine.onCameraEvent({ detected: true, confidence: 0.9 });
    machine.onCameraEvent({ detected: false, confidence: 0.8 });
    // Debounce: still occupied after single negative
    expect(machine.state).toBe('occupied');
  });

  it('transitions to empty after debounce threshold consecutive negatives', () => {
    machine.onCameraEvent({ detected: true, confidence: 0.9 });
    // Simulate 3 consecutive negatives (debounce threshold)
    for (let i = 0; i < 3; i++) {
      machine.onCameraEvent({ detected: false, confidence: 0.8 });
    }
    expect(machine.state).toBe('empty');
  });

  it('resets negative count on positive detection', () => {
    machine.onCameraEvent({ detected: true, confidence: 0.9 });
    machine.onCameraEvent({ detected: false, confidence: 0.8 });
    machine.onCameraEvent({ detected: true, confidence: 0.85 });
    expect(machine.state).toBe('occupied');
  });

  it('emits state changes', () => {
    const changes: PresenceState[] = [];
    machine.onChange((s) => changes.push(s));
    machine.onCameraEvent({ detected: true, confidence: 0.9 });
    expect(changes).toEqual(['occupied']);
  });

  it('getSnapshot returns current state + confidence', () => {
    machine.onCameraEvent({ detected: true, confidence: 0.85 });
    const snap = machine.getSnapshot();
    expect(snap.state).toBe('occupied');
    expect(snap.confidence).toBeCloseTo(0.85);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/environment/presence.test.ts`

- [ ] **Step 3: Write presence.ts**

```typescript
import type { PresenceState } from '../mqtt/topics.js';

export type CameraEvent = {
  detected: boolean;
  confidence: number;
};

const DEBOUNCE_THRESHOLD = 3; // consecutive negatives before transition to empty

export class PresenceMachine {
  state: PresenceState = 'uncertain';
  confidence = 0;

  private negativeCount = 0;
  private listeners = new Set<(state: PresenceState) => void>();

  onChange(fn: (state: PresenceState) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onCameraEvent(event: CameraEvent) {
    if (event.detected) {
      this.negativeCount = 0;
      this.confidence = event.confidence;
      this.transition('occupied');
    } else {
      this.negativeCount++;
      if (this.negativeCount >= DEBOUNCE_THRESHOLD) {
        this.confidence = event.confidence;
        this.transition('empty');
      }
      // Otherwise stay in current state (debounce)
    }
  }

  getSnapshot() {
    return { state: this.state, confidence: this.confidence };
  }

  private transition(next: PresenceState) {
    if (this.state === next) return;
    this.state = next;
    for (const fn of this.listeners) fn(next);
  }
}

export function parsePresenceMessage(msg: string): CameraEvent | null {
  try {
    const parsed = JSON.parse(msg);
    if (typeof parsed.detected !== 'boolean') return null;
    return {
      detected: parsed.detected,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd beau-terminal && npx vitest run src/lib/server/environment/presence.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add beau-terminal/src/lib/server/environment/presence.ts beau-terminal/src/lib/server/environment/presence.test.ts
git commit -m "feat: add environment/presence.ts — camera-based room state machine with debounce"
```

---

### Task 5: Build environment/sleep.ts + Tests

**Files:**
- Create: `beau-terminal/src/lib/server/environment/sleep.ts`
- Create: `beau-terminal/src/lib/server/environment/sleep.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SleepMachine } from './sleep.js';
import type { SleepState } from '../mqtt/topics.js';

describe('SleepMachine', () => {
  let machine: SleepMachine;

  beforeEach(() => {
    machine = new SleepMachine();
  });

  it('starts awake', () => {
    expect(machine.state).toBe('awake');
  });

  it('transitions to settling when room empties and lux is low', () => {
    machine.update({ presenceState: 'empty', lux: 5, interactionAge: 600 });
    expect(machine.state).toBe('settling');
  });

  it('stays awake if room is occupied', () => {
    machine.update({ presenceState: 'occupied', lux: 5, interactionAge: 600 });
    expect(machine.state).toBe('awake');
  });

  it('transitions settling → asleep after sustained conditions', () => {
    machine.update({ presenceState: 'empty', lux: 5, interactionAge: 600 });
    expect(machine.state).toBe('settling');
    // Second update with continued conditions
    machine.update({ presenceState: 'empty', lux: 3, interactionAge: 900 });
    expect(machine.state).toBe('asleep');
  });

  it('transitions asleep → waking on interaction', () => {
    // Get to asleep
    machine.update({ presenceState: 'empty', lux: 5, interactionAge: 600 });
    machine.update({ presenceState: 'empty', lux: 3, interactionAge: 900 });
    expect(machine.state).toBe('asleep');
    // Wake on interaction
    machine.update({ presenceState: 'occupied', lux: 50, interactionAge: 0 });
    expect(machine.state).toBe('waking');
  });

  it('transitions waking → awake on next update', () => {
    machine.update({ presenceState: 'empty', lux: 5, interactionAge: 600 });
    machine.update({ presenceState: 'empty', lux: 3, interactionAge: 900 });
    machine.update({ presenceState: 'occupied', lux: 50, interactionAge: 0 });
    expect(machine.state).toBe('waking');
    machine.update({ presenceState: 'occupied', lux: 100, interactionAge: 5 });
    expect(machine.state).toBe('awake');
  });

  it('manual override forces state', () => {
    machine.override('asleep');
    expect(machine.state).toBe('asleep');
    expect(machine.isOverridden).toBe(true);
  });

  it('clearOverride resumes normal state machine', () => {
    machine.override('asleep');
    machine.clearOverride();
    expect(machine.isOverridden).toBe(false);
  });

  it('emits state changes', () => {
    const changes: SleepState[] = [];
    machine.onChange((s) => changes.push(s));
    machine.update({ presenceState: 'empty', lux: 5, interactionAge: 600 });
    expect(changes).toEqual(['settling']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/environment/sleep.test.ts`

- [ ] **Step 3: Write sleep.ts**

```typescript
import type { SleepState, PresenceState } from '../mqtt/topics.js';

export type SleepInput = {
  presenceState: PresenceState;
  lux: number | null;
  interactionAge: number; // seconds since last interaction
  noiseLevel?: number;    // optional RMS value
};

export type SleepThresholds = {
  luxDark: number;            // lux below this = dark (default 15)
  interactionStale: number;   // seconds without interaction before settling (default 300)
  settlingDuration: number;   // how many updates in settling before asleep (default 2)
};

const DEFAULT_THRESHOLDS: SleepThresholds = {
  luxDark: 15,
  interactionStale: 300,
  settlingDuration: 2,
};

export class SleepMachine {
  state: SleepState = 'awake';
  isOverridden = false;

  private thresholds: SleepThresholds;
  private settlingCount = 0;
  private listeners = new Set<(state: SleepState) => void>();

  constructor(thresholds?: Partial<SleepThresholds>) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  onChange(fn: (state: SleepState) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  update(input: SleepInput) {
    if (this.isOverridden) return;

    const isDark = input.lux !== null && input.lux < this.thresholds.luxDark;
    const isStale = input.interactionAge > this.thresholds.interactionStale;
    const isEmpty = input.presenceState === 'empty';

    switch (this.state) {
      case 'awake':
        if (isEmpty && isDark && isStale) {
          this.settlingCount = 1;
          this.transition('settling');
        }
        break;

      case 'settling':
        if (!isEmpty || !isDark || !isStale) {
          this.settlingCount = 0;
          this.transition('awake');
        } else {
          this.settlingCount++;
          if (this.settlingCount >= this.thresholds.settlingDuration) {
            this.transition('asleep');
          }
        }
        break;

      case 'asleep':
        if (!isEmpty || input.interactionAge < 10) {
          this.transition('waking');
        }
        break;

      case 'waking':
        this.settlingCount = 0;
        this.transition('awake');
        break;
    }
  }

  override(state: SleepState) {
    this.isOverridden = true;
    this.transition(state);
  }

  clearOverride() {
    this.isOverridden = false;
  }

  getSnapshot() {
    return { state: this.state, isOverridden: this.isOverridden };
  }

  private transition(next: SleepState) {
    if (this.state === next) return;
    this.state = next;
    for (const fn of this.listeners) fn(next);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd beau-terminal && npx vitest run src/lib/server/environment/sleep.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add beau-terminal/src/lib/server/environment/sleep.ts beau-terminal/src/lib/server/environment/sleep.test.ts
git commit -m "feat: add environment/sleep.ts — earned sleep state machine with thresholds + override"
```

---

### Task 6: Build environment/weather.ts + Tests

**Files:**
- Create: `beau-terminal/src/lib/server/environment/weather.ts`
- Create: `beau-terminal/src/lib/server/environment/weather.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { parseWeatherResponse, getSeasonalContext, formatWeatherSummary } from './weather.js';

describe('parseWeatherResponse', () => {
  it('extracts condition, temp, humidity, pressure from OWM response', () => {
    const owmResponse = {
      weather: [{ main: 'Rain', description: 'light rain' }],
      main: { temp: 289.5, humidity: 82, pressure: 1013 },
    };
    const result = parseWeatherResponse(owmResponse);
    expect(result).toEqual({
      condition: 'light rain',
      tempC: expect.closeTo(16.35, 1),
      humidity: 82,
      pressureHpa: 1013,
    });
  });

  it('returns null for malformed response', () => {
    expect(parseWeatherResponse({})).toBeNull();
    expect(parseWeatherResponse({ weather: [] })).toBeNull();
  });
});

describe('getSeasonalContext', () => {
  it('returns crawfish season for February in Lafayette', () => {
    const result = getSeasonalContext(new Date('2026-02-15'));
    expect(result).toContain('crawfish season');
  });

  it('returns august heat for August', () => {
    const result = getSeasonalContext(new Date('2026-08-10'));
    expect(result).toContain('August heat');
  });

  it('returns late October for October', () => {
    const result = getSeasonalContext(new Date('2026-10-25'));
    expect(result).toContain('October');
  });
});

describe('formatWeatherSummary', () => {
  it('formats weather data into a concise string', () => {
    const result = formatWeatherSummary({
      condition: 'overcast clouds',
      tempC: 18.5,
      humidity: 75,
      pressureHpa: 1015,
    });
    expect(result).toBe('overcast clouds, 65°F');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd beau-terminal && npx vitest run src/lib/server/environment/weather.test.ts`

- [ ] **Step 3: Write weather.ts**

```typescript
export type WeatherData = {
  condition: string;
  tempC: number;
  humidity: number;
  pressureHpa: number;
};

export function parseWeatherResponse(data: Record<string, unknown>): WeatherData | null {
  try {
    const weather = data.weather as { main: string; description: string }[] | undefined;
    const main = data.main as { temp: number; humidity: number; pressure: number } | undefined;
    if (!weather?.length || !main) return null;
    return {
      condition: weather[0].description,
      tempC: main.temp - 273.15,
      humidity: main.humidity,
      pressureHpa: main.pressure,
    };
  } catch {
    return null;
  }
}

export function formatWeatherSummary(weather: WeatherData): string {
  const tempF = Math.round(weather.tempC * 9 / 5 + 32);
  return `${weather.condition}, ${tempF}°F`;
}

// Lafayette, LA seasonal context — grounded in Beau's personality bible
const SEASONAL_MAP: [number[], string][] = [
  [[1, 2, 3, 4, 5, 6], 'crawfish season'],
  [[6, 7], 'Festival International afterglow, summer settling in'],
  [[8], 'the specific hell of August heat'],
  [[9], 'September — first hints of relief'],
  [[10], 'the brief perfection of late October'],
  [[11], 'cooling down, holiday season approaching'],
  [[12], 'winter in Louisiana — mild, sometimes rainy'],
];

export function getSeasonalContext(date: Date = new Date()): string {
  const month = date.getMonth() + 1; // 1-indexed
  for (const [months, desc] of SEASONAL_MAP) {
    if (months.includes(month)) return desc;
  }
  return '';
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

export type WeatherPoller = {
  latest: WeatherData | null;
  stop: () => void;
};

/**
 * Start polling OpenWeatherMap. Returns the latest data + stop function.
 * If OPENWEATHER_API_KEY is not set, returns null (no-op).
 */
export function startWeatherPolling(
  onUpdate: (weather: WeatherData, summary: string) => void,
  intervalMs = 15 * 60 * 1000, // 15 minutes
): WeatherPoller | null {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return null;

  // Lafayette, LA coordinates
  const lat = 30.2241;
  const lon = -92.0198;
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}`;

  const poller: WeatherPoller = { latest: null, stop: () => {} };

  async function poll() {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const json = await res.json();
      const weather = parseWeatherResponse(json);
      if (weather) {
        poller.latest = weather;
        onUpdate(weather, formatWeatherSummary(weather));
      }
    } catch {
      // Network errors are non-fatal
    }
  }

  // Initial poll
  poll();
  pollTimer = setInterval(poll, intervalMs);

  poller.stop = () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  return poller;
}
```

- [ ] **Step 4: Run tests**

Run: `cd beau-terminal && npx vitest run src/lib/server/environment/weather.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add beau-terminal/src/lib/server/environment/weather.ts beau-terminal/src/lib/server/environment/weather.test.ts
git commit -m "feat: add environment/weather.ts — OWM polling, seasonal context, Lafayette grounding"
```

---

## Chunk 2: Bridge Integration + Prompt Wiring (Tasks 7–10)

### Task 7: Extend BeauState + Bridge with Phase 2 Topics

**Files:**
- Modify: `beau-terminal/src/lib/server/mqtt/bridge.ts`

- [ ] **Step 1: Import environment modules**

At top of bridge.ts, add:

```typescript
import { environmentSnapshots, environmentEvents } from '../db/schema.js';
import { PresenceMachine, parsePresenceMessage } from '../environment/presence.js';
import { SleepMachine } from '../environment/sleep.js';
import { processLuxReading, getLuxLabel } from '../environment/lux.js';
import { startWeatherPolling, getSeasonalContext, formatWeatherSummary } from '../environment/weather.js';
import type { WeatherData } from '../environment/weather.js';
```

- [ ] **Step 2: Extend BeauState type + defaults**

Update the `BeauState` type and `DEFAULT_STATE`:

```typescript
export type BeauState = {
  mode: string;
  emotionalState: string;
  wakeWord: string;
  environment: string;
  lastHaiku: string | null;
  dispatcherLog: string[];
  cameraActive: boolean;
  online: boolean;
  // Phase 2
  sleepState: string;
  presenceState: string;
  lux: number | null;
  luxLabel: string;
  weather: WeatherData | null;
  weatherSummary: string;
  seasonalContext: string;
};

const DEFAULT_STATE: BeauState = {
  mode: 'ambient',
  emotionalState: 'curious',
  wakeWord: '',
  environment: '',
  lastHaiku: null,
  dispatcherLog: [],
  cameraActive: false,
  online: false,
  // Phase 2
  sleepState: 'awake',
  presenceState: 'uncertain',
  lux: null,
  luxLabel: '',
  weather: null,
  weatherSummary: '',
  seasonalContext: getSeasonalContext(),
};
```

- [ ] **Step 3: Instantiate state machines + weather poller in connectMQTT**

At the top of `connectMQTT()`, after `backfillDispatcherLog()`:

```typescript
  const presenceMachine = new PresenceMachine();
  const sleepMachine = new SleepMachine();

  // Sync presence changes to state
  presenceMachine.onChange((ps) => {
    state = { ...state, presenceState: ps };
    logEnvironmentEvent('presence_changed', { state: ps }, 'camera');
    broadcast();
  });

  // Sync sleep changes to state
  sleepMachine.onChange((ss) => {
    state = { ...state, sleepState: ss };
    logEnvironmentEvent(ss === 'asleep' ? 'sleep_entered' : ss === 'waking' ? 'wake_triggered' : 'sleep_state_changed', { state: ss }, 'system');
    broadcast();
  });

  // Start weather polling (no-op if API key not set)
  const weatherPoller = startWeatherPolling((weather, summary) => {
    state = { ...state, weather, weatherSummary: summary };
    broadcast();
  });
```

- [ ] **Step 4: Add environment event logger + snapshot writer**

Add helper functions inside `connectMQTT()` or as module-level functions:

```typescript
let lastSnapshotTime = 0;
const SNAPSHOT_MIN_INTERVAL = 60_000; // 60 seconds

function logEnvironmentEvent(eventType: string, payload: Record<string, unknown>, source: string) {
  try {
    db.insert(environmentEvents).values({
      eventType,
      payloadJson: JSON.stringify(payload),
      source,
    }).run();
  } catch { /* non-fatal */ }
}

function maybeWriteSnapshot() {
  const now = Date.now();
  if (now - lastSnapshotTime < SNAPSHOT_MIN_INTERVAL) return;
  lastSnapshotTime = now;
  try {
    db.insert(environmentSnapshots).values({
      presenceState: state.presenceState || null,
      occupancyConfidence: null, // populated from presence machine
      lux: state.lux,
      sleepState: state.sleepState || null,
      weatherJson: state.weather ? JSON.stringify(state.weather) : null,
      seasonalSummary: state.seasonalContext || null,
      contextMode: state.mode || null,
    }).run();
  } catch { /* non-fatal */ }
}
```

- [ ] **Step 5: Add Phase 2 MQTT message handlers**

In the `switch (topic)` block, add new cases after `TOPICS.sensors.camera`:

```typescript
      case TOPICS.state.sleep:
        // Direct MQTT override of sleep state (manual control)
        if (['awake', 'settling', 'asleep', 'waking'].includes(msg)) {
          sleepMachine.override(msg as any);
          state = { ...state, sleepState: msg };
        }
        break;
      case TOPICS.environment.presence: {
        const event = parsePresenceMessage(msg);
        if (event) {
          presenceMachine.onCameraEvent(event);
          // Also update sleep machine with latest conditions
          sleepMachine.update({
            presenceState: presenceMachine.state,
            lux: state.lux,
            interactionAge: 0, // TODO: track actual interaction age
          });
          maybeWriteSnapshot();
        }
        break;
      }
      case TOPICS.environment.lux: {
        const reading = processLuxReading(msg);
        if (reading) {
          state = { ...state, lux: reading.lux, luxLabel: reading.label };
          logEnvironmentEvent('lux_shift', { lux: reading.lux, label: reading.label }, 'lux_sensor');
          maybeWriteSnapshot();
        }
        break;
      }
      case TOPICS.environment.weather:
        try {
          const weatherData = JSON.parse(msg);
          state = { ...state, weather: weatherData, weatherSummary: formatWeatherSummary(weatherData) };
          maybeWriteSnapshot();
        } catch { /* ignore malformed */ }
        break;
      case TOPICS.environment.seasonal:
        state = { ...state, seasonalContext: msg };
        break;
```

- [ ] **Step 6: Verify build**

Run: `cd beau-terminal && npx vite build`

- [ ] **Step 7: Commit**

```
git add beau-terminal/src/lib/server/mqtt/bridge.ts
git commit -m "feat: bridge subscribes to Phase 2 topics — presence, sleep, lux, weather handlers"
```

---

### Task 8: Update Client Store (beau.svelte.ts)

**Files:**
- Modify: `beau-terminal/src/lib/stores/beau.svelte.ts`

- [ ] **Step 1: Extend defaultState with Phase 2 fields**

The `BeauState` type is imported from bridge.ts, so it will automatically pick up the Phase 2 fields. Update `defaultState` to match:

```typescript
const defaultState: BeauState = {
  mode: 'ambient',
  emotionalState: 'curious',
  wakeWord: '',
  environment: '',
  lastHaiku: null,
  dispatcherLog: [],
  cameraActive: false,
  online: false,
  // Phase 2
  sleepState: 'awake',
  presenceState: 'uncertain',
  lux: null,
  luxLabel: '',
  weather: null,
  weatherSummary: '',
  seasonalContext: '',
};
```

- [ ] **Step 2: Add label maps for new states**

```typescript
export const SLEEP_LABELS: Record<string, string> = {
  awake: 'Awake',
  settling: 'Settling',
  asleep: 'Asleep',
  waking: 'Waking',
};

export const PRESENCE_LABELS: Record<string, string> = {
  occupied: 'Occupied',
  empty: 'Empty',
  uncertain: 'Uncertain',
};
```

- [ ] **Step 3: Verify build**

Run: `cd beau-terminal && npx vite build`

- [ ] **Step 4: Commit**

```
git add beau-terminal/src/lib/stores/beau.svelte.ts
git commit -m "feat: extend client store with Phase 2 environment state fields"
```

---

### Task 9: Wire Environment Placeholders into Prompt Assembler

**Files:**
- No new files — the assembler already supports all placeholders via `PLACEHOLDER_FALLBACKS` in policies.ts.

This task verifies the existing infrastructure handles Phase 2 placeholders correctly. The placeholders `{{SLEEP_STATE}}`, `{{PRESENCE_STATE}}`, `{{SEASONAL_CONTEXT}}`, `{{WEATHER_SUMMARY}}`, `{{LUX_CONTEXT}}` were already added to `PLACEHOLDER_FALLBACKS` in Phase 1. The system prompt already has `<!-- SECTION: ENVIRONMENTAL_AWARENESS -->` with these placeholders.

- [ ] **Step 1: Add assembler test for environment placeholder substitution**

Add to `beau-terminal/src/lib/server/prompt/assembler.test.ts`:

```typescript
describe('environment placeholders', () => {
  it('substitutes weather and lux placeholders', () => {
    const text = 'Weather: {{WEATHER_SUMMARY}}. Light: {{LUX_CONTEXT}}.';
    const result = substitutePlaceholders(text, {
      WEATHER_SUMMARY: 'overcast, 65°F',
      LUX_CONTEXT: 'dim, lamp only',
    });
    expect(result).toBe('Weather: overcast, 65°F. Light: dim, lamp only.');
  });

  it('uses fallbacks for missing environment placeholders', () => {
    const text = 'Sleep: {{SLEEP_STATE}}. Presence: {{PRESENCE_STATE}}.';
    const result = substitutePlaceholders(text, {});
    expect(result).toBe('Sleep: awake. Presence: unknown.');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd beau-terminal && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```
git add beau-terminal/src/lib/server/prompt/assembler.test.ts
git commit -m "test: add environment placeholder substitution tests"
```

---

### Task 10: Update StatusBar with Sleep + Presence

**Files:**
- Modify: `beau-terminal/src/lib/components/StatusBar.svelte`

- [ ] **Step 1: Add sleep and presence indicators**

Add after the STATE indicator, before the haiku:

```svelte
  <div style="color: var(--bmo-muted)">
    SLEEP: <span style="color: {beauState.sleepState === 'asleep' ? '#636e72' : 'var(--bmo-text)'}">
      {beauState.sleepState.toUpperCase()}
    </span>
  </div>

  <div style="color: var(--bmo-muted)">
    ROOM: <span style="color: {beauState.presenceState === 'occupied' ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
      {beauState.presenceState.toUpperCase()}
    </span>
  </div>
```

- [ ] **Step 2: Verify build**

Run: `cd beau-terminal && npx vite build`

- [ ] **Step 3: Commit**

```
git add beau-terminal/src/lib/components/StatusBar.svelte
git commit -m "feat: StatusBar shows sleep state + room presence"
```

---

## Chunk 3: UI Routes + Documentation (Tasks 11–14)

### Task 11: Build /presence Route

**Files:**
- Create: `beau-terminal/src/routes/presence/+page.server.ts`
- Create: `beau-terminal/src/routes/presence/+page.svelte`

- [ ] **Step 1: Create route directory**

Run: `mkdir -p beau-terminal/src/routes/presence`

- [ ] **Step 2: Write +page.server.ts**

```typescript
import type { PageServerLoad } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { environmentSnapshots, environmentEvents } from '$lib/server/db/schema.js';
import { desc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
  const latestSnapshot = db.select().from(environmentSnapshots)
    .orderBy(desc(environmentSnapshots.id))
    .limit(1)
    .get() ?? null;

  const recentEvents = db.select().from(environmentEvents)
    .orderBy(desc(environmentEvents.id))
    .limit(50)
    .all();

  return { latestSnapshot, recentEvents };
};
```

- [ ] **Step 3: Write +page.svelte**

```svelte
<script lang="ts">
  import { beauState, SLEEP_LABELS, PRESENCE_LABELS } from '$lib/stores/beau.svelte.js';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();
</script>

<div class="max-w-4xl">
  <div class="mb-8">
    <h1 class="text-2xl tracking-widest font-bold" style="color: var(--bmo-green)">PRESENCE</h1>
    <p class="text-xs mt-1" style="color: var(--bmo-muted)">what beau senses — room, light, weather</p>
  </div>

  <!-- State machine widget -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
    <!-- Sleep state -->
    <div class="p-5 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-4" style="color: var(--bmo-muted)">SLEEP STATE</div>
      <div class="text-3xl font-bold tracking-widest text-center py-4"
           style="color: {beauState.sleepState === 'asleep' ? '#636e72' : beauState.sleepState === 'waking' ? 'var(--bmo-green)' : 'var(--bmo-text)'}">
        {beauState.sleepState.toUpperCase()}
      </div>
    </div>

    <!-- Presence -->
    <div class="p-5 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-4" style="color: var(--bmo-muted)">ROOM PRESENCE</div>
      <div class="text-3xl font-bold tracking-widest text-center py-4"
           style="color: {beauState.presenceState === 'occupied' ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
        {beauState.presenceState.toUpperCase()}
      </div>
    </div>
  </div>

  <!-- Sensor readouts -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
    <div class="p-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-2" style="color: var(--bmo-muted)">LIGHT</div>
      <div class="text-sm font-bold" style="color: var(--bmo-green)">
        {beauState.luxLabel ? beauState.luxLabel.toUpperCase() : '—'}
      </div>
      {#if beauState.lux !== null}
        <div class="text-xs mt-1" style="color: var(--bmo-muted)">{beauState.lux} lux</div>
      {/if}
    </div>
    <div class="p-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-2" style="color: var(--bmo-muted)">CAMERA</div>
      <div class="text-sm font-bold" style="color: {beauState.cameraActive ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
        {beauState.cameraActive ? 'ACTIVE' : 'OFF'}
      </div>
    </div>
    <div class="p-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-2" style="color: var(--bmo-muted)">WEATHER</div>
      <div class="text-sm font-bold" style="color: var(--bmo-green)">
        {beauState.weatherSummary || '—'}
      </div>
    </div>
    <div class="p-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-2" style="color: var(--bmo-muted)">SEASON</div>
      <div class="text-sm font-bold" style="color: var(--bmo-text)">
        {beauState.seasonalContext || '—'}
      </div>
    </div>
  </div>

  <!-- Event timeline -->
  <div class="p-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
    <div class="text-xs tracking-widest mb-4" style="color: var(--bmo-muted)">EVENT TIMELINE</div>
    {#if data.recentEvents.length === 0}
      <div class="text-xs" style="color: var(--bmo-muted)">no events yet</div>
    {:else}
      <div class="space-y-1 max-h-64 overflow-y-auto">
        {#each data.recentEvents as event}
          <div class="flex justify-between text-xs py-1 border-b" style="border-color: var(--bmo-border)">
            <span style="color: var(--bmo-green)">{event.eventType.replace(/_/g, ' ')}</span>
            <span style="color: var(--bmo-muted)">{event.source ?? ''}</span>
            <span style="color: var(--bmo-muted)">{event.timestamp}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
```

- [ ] **Step 4: Verify build**

Run: `cd beau-terminal && npx vite build`

- [ ] **Step 5: Commit**

```
git add beau-terminal/src/routes/presence/+page.server.ts beau-terminal/src/routes/presence/+page.svelte
git commit -m "feat: add /presence route — room state dashboard with event timeline"
```

---

### Task 12: Add Phase 2 Dashboard Widgets

**Files:**
- Modify: `beau-terminal/src/routes/+page.svelte`

- [ ] **Step 1: Add environment widget row**

After the identity widget row (`<!-- Identity status -->`), add:

```svelte
  <!-- Environment status (Phase 2) -->
  <div class="grid grid-cols-3 gap-3 mb-4">
    <div class="p-3 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">SLEEP</div>
      <div class="text-sm tracking-wider font-bold"
           style="color: {beauState.sleepState === 'asleep' ? '#636e72' : 'var(--bmo-green)'}">
        {beauState.sleepState.toUpperCase()}
      </div>
    </div>
    <div class="p-3 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">ROOM</div>
      <div class="text-sm tracking-wider font-bold"
           style="color: {beauState.presenceState === 'occupied' ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
        {beauState.presenceState.toUpperCase()}
      </div>
    </div>
    <div class="p-3 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">WEATHER</div>
      <div class="text-sm tracking-wider font-bold" style="color: var(--bmo-text)">
        {beauState.weatherSummary || '—'}
      </div>
    </div>
  </div>
```

- [ ] **Step 2: Verify build**

Run: `cd beau-terminal && npx vite build`

- [ ] **Step 3: Commit**

```
git add beau-terminal/src/routes/+page.svelte
git commit -m "feat: dashboard environment widgets — sleep, presence, weather"
```

---

### Task 13: Enable /presence in Nav

**Files:**
- Modify: `beau-terminal/src/lib/components/Nav.svelte`

- [ ] **Step 1: Remove disabled flag from Presence link**

In the BEAU group, change:
```typescript
{ href: '/presence',  label: 'PRESENCE',   icon: '◉', disabled: true },
```
to:
```typescript
{ href: '/presence',  label: 'PRESENCE',   icon: '◉' },
```

- [ ] **Step 2: Verify build**

Run: `cd beau-terminal && npx vite build`

- [ ] **Step 3: Commit**

```
git add beau-terminal/src/lib/components/Nav.svelte
git commit -m "feat: enable /presence nav link (Phase 2 complete)"
```

---

### Task 14: Update Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/reference.md`

- [ ] **Step 1: Update CLAUDE.md**

Updates:
- Update table count from 12 to 14 (12 Phase 1 + 2 Phase 2)
- Add `environment/` directory to `lib/server/` in repo structure:
  ```
  │   │       ├── environment/
  │   │       │   ├── presence.ts     # Camera-based room state machine
  │   │       │   ├── sleep.ts        # Earned sleep state machine
  │   │       │   ├── weather.ts      # Weather API + seasonal context
  │   │       │   └── lux.ts          # Light sensor integration
  ```
- Add `/presence` route to routes listing (remove comment about Phase 2)
- Add to Key Files:
  ```
  - `src/lib/server/environment/sleep.ts` — sleep/wake state machine
  - `src/lib/server/environment/presence.ts` — room presence state machine
  ```

- [ ] **Step 2: Update docs/reference.md**

Updates:
- Update table count from 12 to 14
- Add 2 new table descriptions:
  ```
  | **environmentSnapshots** | Environment state snapshots (60s min interval) | id, timestamp, presenceState, lux, sleepState, weatherJson, seasonalSummary |
  | **environmentEvents** | Environment state change events | id, timestamp, eventType, payloadJson, source |
  ```
- Add new MQTT topics to topic tree table:
  ```
  | `beau/state/sleep` | BMO → Terminal | Sleep state (awake/settling/asleep/waking) |
  | `beau/environment/presence` | BMO → Terminal | Presence detection JSON ({ detected, confidence }) |
  | `beau/environment/lux` | BMO → Terminal | Lux reading JSON ({ lux: number }) |
  | `beau/environment/weather` | BMO → Terminal | Weather data JSON |
  | `beau/environment/seasonal` | BMO → Terminal | Seasonal context string |
  ```
- Update BeauState type in reference to include Phase 2 fields
- Add `dispatches.environment_id` column note

- [ ] **Step 3: Run all tests**

Run: `cd beau-terminal && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Verify full build**

Run: `cd beau-terminal && npx vite build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```
git add CLAUDE.md docs/reference.md
git commit -m "docs: update CLAUDE.md and reference.md for Phase 2 environment domain"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Restructure topics.ts + Phase 2 topics + types | topics.ts, topics.test.ts, bridge.ts |
| 2 | Add Phase 2 schema tables | schema.ts, index.ts |
| 3 | Build environment/lux.ts | lux.ts, lux.test.ts |
| 4 | Build environment/presence.ts | presence.ts, presence.test.ts |
| 5 | Build environment/sleep.ts | sleep.ts, sleep.test.ts |
| 6 | Build environment/weather.ts | weather.ts, weather.test.ts |
| 7 | Extend BeauState + bridge handlers | bridge.ts |
| 8 | Update client store | beau.svelte.ts |
| 9 | Wire environment prompt placeholders | assembler.test.ts |
| 10 | Update StatusBar | StatusBar.svelte |
| 11 | Build /presence route | +page.server.ts, +page.svelte |
| 12 | Dashboard environment widgets | +page.svelte |
| 13 | Enable /presence in Nav | Nav.svelte |
| 14 | Update documentation | CLAUDE.md, reference.md |
