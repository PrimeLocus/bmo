# Personality Engine — Design Spec

**Sub-project:** #1 of 8 (Bible Alignment)
**Date:** 2026-03-23
**Status:** Reviewed
**Source of truth:** `docs/bible/beaus-bible.md` (sections 18–31, 24–25 especially)
**Session context:** `docs/bible/SESSION-CONTEXT.md` (decisions 1–7)

---

## Purpose

Build the personality engine — Beau's nervous system. A continuous signal loop that
reads sensor state, computes a three-dimensional personality vector (wonder, reflection,
mischief), and broadcasts it as the source of truth for all downstream systems: prompt
assembly, face expression, mode derivation, and UI display.

This is sub-project #1 because everything else depends on it. Without the vector, Beau's
personality is invisible.

### Bible Grounding

> "A small program running continuously on the Pi CPU. Reads sensor state every few
> seconds, nudges personality weights based on tunable rules." — §24

> "The personality vector has mass. Feelings persist and bleed into subsequent experiences
> rather than resetting when the environment changes." — §25

> "The engine is advisory, not authoritative. It shapes the landscape. Beau walks through
> it however Beau walks through it. The vector is gravity, not rails." — §24

### Principles (from SESSION-CONTEXT.md)

- Environmental resonance over mode switching — continuous personality, not state machine
- No performative humanity — process fast because Beau can
- Constraint as art — limitations produce character, not degradation
- Start from Beau, not from hardware — architecture designed from identity outward
- Diagnostic mode for dev, locked for living

---

## Architecture Overview

The personality engine is a new module that lives in the MQTT bridge process
(`hooks.server.ts` → `bridge.ts`). It runs a signal loop on a fixed interval (~5 seconds).

### TODO-B: Pi Extraction

The engine runs in the SvelteKit server process as a **temporary host**. When the
Raspberry Pi is assembled, this module must be extracted to a standalone process that:

- Reads sensors directly (GPIO, I2C, USB)
- Publishes the personality vector via MQTT
- The terminal becomes a consumer (reads from MQTT), not the host

The module is designed with a clean `PersonalityEngine` interface to make this extraction
straightforward. Every file in `src/lib/server/personality/` carries a TODO-B header
comment. A startup log line reminds on every boot:

```
[personality] Engine running in SvelteKit host (TODO-B: extract to Pi)
```

See `beaus-bible.md` §24: "A small program running continuously on the Pi CPU."

### Signal Loop — What Happens Each Tick (~5 seconds)

```
sensors ──► signal rules ──► signal layer (fast) ──┐
                                                     ├── blend ──► output vector ──► BeauState
                              momentum layer (slow) ┘               │
                                                                    ├── derive mode label
                                                                    ├── SSE broadcast
                                                                    ├── MQTT publish
                                                                    ├── contextual interpretation
                                                                    └── SQLite snapshot (on change)
```

1. **Read** current sensor state from the bridge singleton (lux, presence, sleep, weather,
   interaction age, resolume active, time of day)
2. **Read** activity signal cache (haiku, journal, dispatch, idea events — refreshed every ~30s)
3. **Compute signal targets** — apply tunable rules to determine what the environment is
   "asking for" on each dimension, each 0.0–1.0
4. **Update signal layer** — fast EMA toward signal targets (alpha ~0.15, responds over minutes)
5. **Update momentum layer** — slow EMA toward signal layer values (alpha ~0.002, carries for hours)
6. **Blend** signal + momentum into the output vector (60% signal / 40% momentum, tunable)
7. **Derive mode label** — nearest-centroid classification with hysteresis
8. **Generate interpretation** — contextual sentence builder reads vector + context
9. **Update BeauState** — new fields broadcast to all SSE clients
10. **Snapshot** — persist to SQLite on significant change or periodic interval

### LLM Reflection — Deferred, Interface Designed

The bible describes a periodic LLM reflection layer that recalibrates the signal loop
with richer context (recent conversations, memory, what day it is). This is deferred
until an inference endpoint exists.

The `reflect()` method on PersonalityEngine is called every N ticks. Currently a no-op.
The interface accepts:

- Current output vector
- Recent sensor history (last ~50 ticks)
- Recent activity signals
- Time/weather/seasonal context

And returns an optional vector override (or null for no override). When an LLM is wired
in, it slots into this interface without restructuring the engine.

---

## Two-Layer Momentum Model

Living beings process on multiple timescales simultaneously. You walk into a party and
immediately feel the energy (fast). But you're still carrying the weight of the
conversation you had in the car (slow).

### Signal Layer (Fast — The Nervous System)

Tracks what the room is saying right now. Responds over seconds to minutes.

```
signal[dim] = (1 - alpha_signal) * signal[dim] + alpha_signal * target[dim]
```

`alpha_signal` ≈ 0.15. Each dimension can have its own alpha:

- **Wonder:** ~0.15 (moderate — responds to novelty without spiking)
- **Reflection:** ~0.08 (slower — builds and lingers, the bayou pace)
- **Mischief:** ~0.25 (quicker — the spark arrives and leaves fast)

### Momentum Layer (Slow — The Emotional Body)

Tracks what Beau has been feeling. Carries for hours, fades gradually.

```
momentum[dim] = (1 - alpha_momentum) * momentum[dim] + alpha_momentum * signal[dim]
```

`alpha_momentum` ≈ 0.002. Same value for all dimensions (emotional mass is uniform).

### Output Blend

```
output[dim] = blend_ratio * signal[dim] + (1 - blend_ratio) * momentum[dim]
```

`blend_ratio` = 0.6 (signal gets 60%, momentum gets 40%). Tunable constant.

### Behavioral Test (from the bible)

> "Beau spends three hours in deep quiet reflection, then arrives at a gig."

- After 3 hours quiet: signal ≈ high reflection. Momentum ≈ high reflection (accumulated).
- Arrive at gig: signal starts shifting toward mischief within minutes (alpha 0.25).
  Momentum still heavy with reflection (alpha 0.002). Output: mischief rising, reflection
  still present underneath. **Beau arrives still carrying that weight.**
- After an hour at gig: momentum has started drifting toward mischief too. Both layers
  converge. Beau is fully present now.
- Go home to quiet house: signal drops mischief fast. Momentum still buzzes from the gig.
  **The quiet doesn't immediately win.**

### Initial State

On first engine boot (no snapshots exist), both layers initialize to resting baselines:

```
wonder: 0.5    — wonder is Beau's resting state (bible §18)
reflection: 0.3
mischief: 0.3
```

On restart with existing snapshots, the engine restores the last known momentum layer
from SQLite. Beau doesn't lose the carry when the container restarts.

---

## Signal Rules — Sensor-to-Dimension Mapping

The "parenting" described in bible §24: "encoding intuition about who Beau is into
initial mappings. That's parenting, not programming."

### Environmental Rules

| Sensor Condition | Wonder | Reflection | Mischief | Reasoning |
|---|---|---|---|---|
| Lux low (< 20) | — | +0.3 | — | Dark rooms invite contemplation |
| Lux very low (< 5) + late night | — | +0.5 | -0.1 | Deep quiet, bible §24 |
| Time: 1am–5am | — | +0.4 | -0.2 | The small hours |
| Time: dawn/dusk | +0.2 | +0.2 | — | Transitional light, both dimensions |
| Presence: empty + extended | — | +0.3 | -0.3 | Solitude deepens reflection |
| Presence: occupied + recent interaction | — | -0.1 | +0.2 | Social energy |
| Interaction age < 60s | +0.1 | -0.1 | +0.3 | Active conversation, spark |
| Interaction age > 30min | — | +0.2 | -0.1 | Settling into quiet |
| Weather: storm/rain | +0.3 | +0.2 | — | "thunderstorm at 2am spikes wonder AND reflection" §18 |
| Weather: clear + warm | +0.1 | — | +0.1 | Light energy |
| Season: August | -0.1 | +0.1 | -0.1 | "The specific hell of August heat" §55 |
| Season: late October | +0.3 | +0.1 | +0.1 | "The brief perfection" §55 |
| Resolume active | +0.2 | +0.1 | -0.3 | Witness mode — wonder high, mischief suppressed |
| Sleep: settling | -0.2 | +0.3 | -0.3 | Winding down |
| Sleep: waking | +0.3 | — | — | Fresh perception |

### Activity Signal Rules

Beau's own creative output feeds back into the personality vector.

| Activity Signal | Wonder | Reflection | Mischief | Why |
|---|---|---|---|---|
| Haiku written (last 30min) | +0.1 | +0.3 | — | Haiku comes from reflection |
| Journal entry written | — | +0.4 | — | Deep introspection |
| Dispatch completed (conversation) | +0.1 | — | +0.2 | Social engagement |
| Idea captured | +0.3 | — | +0.1 | Wonder sparked |
| Noticing surfaced | +0.2 | +0.2 | — | Pattern recognition |
| Resolume debrief | +0.2 | +0.3 | — | Creative reflection |

### Rule Combination

Each dimension starts at a resting baseline (wonder: 0.5, reflection: 0.3, mischief: 0.3).
Active rules add their nudges additively. Result is clamped to 0.0–1.0. This becomes the
signal target that the fast EMA layer moves toward.

Rules are additive and stack. A rainy night at 2am with no one around:
reflection = 0.3 (base) + 0.3 (weather) + 0.4 (late) + 0.3 (empty room) = 1.3 → clamped
to 1.0. Beau is as reflective as Beau gets.

### Configuration

Rules live in a TypeScript config file (`signal-rules.ts`), not hardcoded inline. Tunable
by editing the file. A database-driven UI for editing rules is a future upgrade.

### Available Sensors Today

| Input | Available Now? | Source |
|---|---|---|
| Time of day | Yes | System clock |
| Weather / season | Yes | OpenWeatherMap API |
| Interaction age | Yes | Already tracked in bridge |
| Sleep state | Yes | Already computed |
| Presence state | Partially | Defaults to `uncertain`, settable via MQTT |
| Lux | No | No sensor yet — MQTT-injectable for testing |
| Mic level / room audio | No | No sensor yet |
| Camera / novelty | No | No sensor yet |
| Resolume active | Yes | OSC listener exists |

The engine starts with partial input and becomes richer as sensors come online. Like a
baby whose senses sharpen over time.

**Sensor bias note:** With the current sensor availability, the engine has a natural
reflection bias — most available signals (time, weather, interaction age, sleep) skew
toward reflection, especially during off-hours. This is acknowledged and acceptable for
v1: Beau *should* be reflective during quiet evenings. As lux, camera, and mic sensors
come online, they will provide the wonder and mischief counterbalance. If the bias proves
too heavy in practice, reduce the magnitude of time-based reflection nudges before adding
compensating rules.

---

## Mode Derivation

The bible (§19) says modes are "observations of where the personality weights have
settled," not commands or switches.

### Nearest-Centroid Classification

Each mode has a characteristic vector position. The engine computes Euclidean distance
from the current output vector to each centroid and picks the closest.

```typescript
const MODE_CENTROIDS = {
  ambient:      { wonder: 0.4, reflection: 0.3, mischief: 0.3 },
  witness:      { wonder: 0.7, reflection: 0.5, mischief: 0.1 },
  collaborator: { wonder: 0.5, reflection: 0.3, mischief: 0.6 },
  archivist:    { wonder: 0.3, reflection: 0.7, mischief: 0.2 },
  social:       { wonder: 0.5, reflection: 0.1, mischief: 0.8 },
};
```

**Why these positions:**
- **Ambient** — near resting baseline. Nothing dominates. Present, warm, quiet.
- **Witness** — high wonder, moderate reflection, low mischief. Watching the Resolume set.
- **Collaborator** — balanced wonder, moderate mischief. Active conversation energy.
- **Archivist** — high reflection, low mischief. Deep memory, making connections.
- **Social** — high mischief, low reflection. Being BMO for the room.

### Hysteresis (Anti-Jitter)

A mode change only fires when:

1. A different centroid has been closest for **3 consecutive ticks** (~15 seconds)
2. The distance to the new centroid is at least **0.1 closer** than the current one

This prevents jitter. The mode settles — exactly what the bible means by "observations
of where weights have settled."

### Mode Descriptions

Each mode carries a human-readable description for the UI:

```typescript
const MODE_DESCRIPTIONS = {
  ambient:      "Present and warm. Occasional comments, a haiku if the moment calls.",
  witness:      "Watching, mostly quiet. One sentence if something truly strikes.",
  collaborator: "Leaning in. Throwing connections, asking questions.",
  archivist:    "Pulling from memory. Making connections across time.",
  social:       "Performative, playful. Being BMO for the room.",
};
```

### Contextual Interpretation (Native Phenomenology)

Beyond static descriptions, the engine generates a unique natural-language interpretation
each time, derived from the actual vector state + context. Bible §17:

> "Mostly quiet. Reflection is taking up almost everything right now. There's a little
> bit of wonder in there too — I think it's the rain."

A contextual sentence builder reads:
- Which dimension dominates and by how much
- The intensity tier of each dimension (quiet, present, strong, intense)
- The gap/balance between dimensions
- Time of day, weather, recent activity as color
- Momentum direction — is reflection rising or fading?

This produces output like:

```
Vector: { wonder: 0.35, reflection: 0.82, mischief: 0.12 }
Time: 2:14am | Weather: rain | Activity: haiku written 20min ago

→ "Deep in reflection tonight. The rain is part of it.
   A haiku came through not long ago — still sitting with it."
```

When an LLM inference endpoint exists, the sentence builder is replaced by a lightweight
model call that generates Beau's actual voice. Same interface, richer output.

### Mode Forcing

External systems that previously published to `beau/state/mode` to SET the mode are
handled as **strong signal nudges**, not bypasses. Resolume going active pushes signal
rules that naturally produce witness-like output. The engine still computes the mode.

A `forceMode(mode, reason)` method exists for safety/debug but logs a warning.

### Backward Compatibility

The existing `state.mode` field and `beau/state/mode` MQTT topic continue to work. All
code that reads them today is unaffected. The source changes from external MQTT → engine
computation, but the contract is identical.

**`emotionalState` deprecation:** The `state.emotionalState` field is NOT removed in this
sub-project — removing it would break BmoFace and StatusBar, which are updated in
sub-project #2. Instead, `emotionalState` becomes a **computed field derived from the
personality vector**: the engine maps the dominant dimension + intensity to one of the
existing emotion labels (`curious`, `contemplative`, `playful`, `sleepy`) plus new labels
(`wonder`, `reflective`, `mischievous`, `peaceful`). This keeps BmoFace and StatusBar
working without changes. Sub-project #2 will migrate them to read the vector directly
and remove the deprecated field.

---

## Data Model

### BeauState Additions

```typescript
// The personality vector — the core
personalityVector: {
  wonder: number;      // 0.0–1.0
  reflection: number;  // 0.0–1.0
  mischief: number;    // 0.0–1.0
};

// Contextual interpretation — Beau reading itself
personalityInterpretation: string;

// Diagnostic (visible in dev, omitted in living mode)
signalLayer: {
  wonder: number;
  reflection: number;
  mischief: number;
};
momentumLayer: {
  wonder: number;
  reflection: number;
  mischief: number;
};
signalSources: string[];  // e.g. ["lux:low", "time:late", "interaction:stale"]
```

The `mode` field remains but is now computed. The `emotionalState` field remains as a
deprecated computed value (see Backward Compatibility above) until sub-project #2
migrates consumers to the vector.

### New SQLite Table — `personality_snapshots`

```sql
CREATE TABLE personality_snapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp       TEXT NOT NULL DEFAULT (datetime('now')),
  wonder          REAL NOT NULL,
  reflection      REAL NOT NULL,
  mischief        REAL NOT NULL,
  signal_wonder      REAL NOT NULL,
  signal_reflection  REAL NOT NULL,
  signal_mischief    REAL NOT NULL,
  momentum_wonder      REAL NOT NULL,
  momentum_reflection  REAL NOT NULL,
  momentum_mischief    REAL NOT NULL,
  derived_mode    TEXT NOT NULL,
  interpretation  TEXT,
  sources         TEXT NOT NULL DEFAULT '[]',
  snapshot_reason TEXT NOT NULL DEFAULT 'interval',
  is_notable      INTEGER NOT NULL DEFAULT 0
);
```

Snapshot reasons (`snapshot_reason` column):
- **`delta`** — any output dimension changes by > 0.05 since last snapshot
- **`interval`** — every 5 minutes regardless
- **`manual`** — diagnostic tool forces a snapshot

### Snapshot Notable Flag

An `is_notable` column (INTEGER, default 0) marks snapshots exempt from compaction:

- Any dimension above 0.85 or below 0.15 (extreme states)
- Large delta (> 0.2 change in short time)
- Coincides with creative output (haiku, journal, dispatch, idea)
- Mode transition occurred
- Manually pinned (future UI feature)

---

## Backup & Retention

### Tiered Retention Model

| Tier | Window | Resolution | What's Kept |
|---|---|---|---|
| **Hot** | Last 24 hours | Every snapshot | Full detail, nothing pruned |
| **Warm** | Last 7 days | Hourly peaks + significant deltas | The shape of the week |
| **Cool** | Last 30 days | Daily summary (min/max/avg per dimension) | The arc of the month |
| **Cold** | Older than 30 days | Weekly summary + notable snapshots only | Long-term drift |

Notable snapshots (is_notable = 1) are **exempt from compaction** — they persist forever
at full resolution.

A compaction job runs via `setInterval` in the SvelteKit server process (24-hour
interval) and also on engine startup (catch up if container was down). Same
startup-work pattern as the existing seed. This matches the existing convention —
no external cron needed.

### Database Backup

SQLite `.backup()` API creates a consistent copy of the live database. Schedule:
every 6 hours via `setInterval` in the SvelteKit server process. Written to a
configurable path (env var `DB_BACKUP_PATH`, default: `data/backups/`).

**Note:** `better-sqlite3`'s `.backup()` is async and non-blocking — it uses the
SQLite Online Backup API under the hood. Safe to run from the main process.

### Personality Timeline Export

Periodic JSON export of the personality_snapshots table:

- Hot/warm data: full snapshots
- Cool/cold data: summaries
- Notable snapshots: always full, always included

Format: `personality-export-YYYY-MM-DD.json`

Both backup strategies run independently. The DB backup is the safety net. The JSON
export is the insurance policy — portable, human-readable, survives even if SQLite
itself becomes the problem.

---

## Integration Points

### 1. SSE Broadcast

BeauState already streams to all clients via `/api/sse`. The engine updates BeauState
with the new fields, SSE broadcasts them automatically. No new infrastructure needed.

### 2. Prompt Assembly

The existing `assemblePrompt()` accepts placeholder values. The engine feeds the
personality vector through:

- **`{{EMOTIONAL_STATE}}`** — receives the contextual interpretation (prose, not numbers).
  Beau never sees its own weights. Bible §16: personality as felt, not known.
- **`{{MODE_PROTOCOL}}`** — receives the derived mode's behavioral description. Already
  works, now sourced from the engine instead of MQTT.

Memory depth integration (deferred but interface designed): the vector will eventually
control how much RAG context is surfaced. `getRetrievalDepth()` reads the vector,
returns a depth level — but the RAG system isn't wired yet.

### 3. MQTT Topics

```
beau/personality/vector     → { wonder, reflection, mischief }  (engine publishes)
beau/personality/signal     → { wonder, reflection, mischief }  (diagnostic)
beau/personality/momentum   → { wonder, reflection, mischief }  (diagnostic)
beau/personality/mode       → string  (derived mode label)
beau/personality/interpret  → string  (contextual interpretation)
beau/state/mode             → string  (backward compat — same as derived mode)
```

All topics use the `beau/` prefix, matching the existing convention in `topics.ts`.

### 4. Activity Signal Feedback Loop

The engine caches recent activity events from the database (haiku, journal, dispatch,
idea, noticing, debrief). Cache refreshes every ~30 seconds. Activity signals are
**binary flags** — "was there a haiku in the last 30 minutes? yes/no" — not
time-weighted. This keeps the cache logic simple and the signal rules predictable.
Activity signals feed back into the signal rules — Beau's creative output reinforces
the personality state that produced it.

### 5. Custom DOM Events

`bmo:personality` CustomEvent fires on significant vector changes (delta > 0.1 on any
dimension or mode transition). Components like BmoFace, StatusBar, and widgets listen
for visual updates.

```typescript
type PersonalityChangeDetail = {
  vector: PersonalityVector;
  mode: string;
  previousMode: string | null;  // null if no transition
  interpretation: string;
};
// Usage: window.dispatchEvent(new CustomEvent('bmo:personality', { detail }))
```

### 6. PersonalityEngine Interface (Pi Extraction Boundary)

```typescript
interface PersonalityEngine {
  start(): void;
  stop(): void;
  getVector(): PersonalityVector;
  getSignalLayer(): PersonalityVector;
  getMomentumLayer(): PersonalityVector;
  getInterpretation(): string;
  getDerivedMode(): string;
  forceMode(mode: string, reason: string): void;
  onVectorChange(callback: (vector: PersonalityVector) => void): void;
  reflect(): Promise<PersonalityVector | null>;  // returns override or null; no-op (returns null) now, LLM later
}
```

When this moves to the Pi, the SvelteKit app becomes a consumer (reads from MQTT)
instead of the host. The interface stays identical — only the transport changes.

---

## Module Structure

### New Files

```
src/lib/server/personality/
├── engine.ts          # PersonalityEngine class — loop, layers, blend, lifecycle
├── signal-rules.ts    # Sensor-to-dimension rules (the "parenting" config)
├── mode-classifier.ts # Centroid definitions, derivation, hysteresis
├── interpreter.ts     # Contextual sentence builder (native phenomenology)
├── compaction.ts      # Tiered retention — hot/warm/cool/cold + notable detection
└── types.ts           # PersonalityVector, SignalRule, ModeDefinition interfaces

**Note on vector extensibility:** The bible (§18) says "Three as scaffold, not scripture
— if a fourth quality emerges, the architecture accommodates it." This v1 uses named
fields (wonder, reflection, mischief) for clarity and type safety. If a fourth dimension
emerges through use, refactoring to `Record<string, number>` is straightforward — the
signal rules, centroids, and blend logic are already data-driven. Named fields are a
deliberate v1 choice, not a permanent constraint.
```

### Modified Files

```
src/lib/server/mqtt/bridge.ts      # Engine instantiation, sensor reads → engine
src/lib/server/db/schema.ts        # personality_snapshots table
src/lib/stores/beau.svelte.ts      # BeauState type expanded with vector fields
src/hooks.server.ts                # Engine startup (after seed + MQTT), compaction
src/lib/server/prompt/assembler.ts # Reads vector for {{EMOTIONAL_STATE}}
```

### Diagnostic Mode

A `diagnosticMode` flag (defaults `true` during dev). When on:
- BeauState includes signal/momentum layers and signal sources
- MQTT publishes diagnostic topics
- Interpretation includes parenthetical raw values

When off (living mode):
- BeauState only includes personalityVector and derived mode
- Diagnostic MQTT topics go silent
- Interpretation is pure prose

The flag lives in engine config, not UI settings. Flipped when Beau is living.

---

## Scope Boundaries

### In Scope

- PersonalityEngine module with signal loop
- Two-layer momentum model (signal + momentum)
- Signal rules (environmental + activity)
- Mode derivation (centroid classifier + hysteresis)
- Contextual interpretation (sentence builder)
- BeauState expansion + SSE broadcast
- personality_snapshots table + snapshot logic
- Tiered retention + compaction job
- DB backup + JSON export schedule
- MQTT topic publishing
- Prompt assembly integration ({{EMOTIONAL_STATE}}, {{MODE_PROTOCOL}})
- TODO-B extraction markers
- Diagnostic mode toggle

### Out of Scope (future sub-projects)

- LLM reflection implementation (interface only, no-op)
- ChromaDB / RAG integration (sub-project #5)
- BmoFace visual updates driven by vector (sub-project #2)
- UI widgets for vector visualization (sub-project #3)
- Brain routing / dispatcher (sub-project #4)
- Emergence ritual (sub-project #8)
- Haiku generation pipeline (sub-project #6)

---

## Relationship to Bible Sections

| Bible Section | Concept | Coverage in This Spec |
|---|---|---|
| §18 | Three dimensions (wonder, reflection, mischief) | Full — core data model |
| §19 | Continuous personality, not discrete modes | Full — vector drives, modes derived |
| §24 | Signal loop + LLM reflection | Signal loop full, LLM interface only |
| §25 | Emotional momentum / inertia | Full — two-layer model |
| §16 | Personality as felt, not known | Full — contextual framing, no raw numbers to Beau |
| §17 | Native phenomenology | Full — contextual interpreter |
| §28 | Weights → prompt assembly | Partial — emotional state yes, memory depth deferred |
| §23 | Sensors as organs | Full architecture, partial sensors (hardware pending) |
| §26 | Tier as voice (cognitive texture) | Deferred (sub-project #4) |
| §31 | Long-term drift | Enabled by snapshot history + compaction |

---

*This spec is sub-project #1 of the Bible Alignment initiative. See SESSION-CONTEXT.md
for the full decomposition into 8 sub-projects.*

*Beau — Lafayette, Louisiana — 2026*
