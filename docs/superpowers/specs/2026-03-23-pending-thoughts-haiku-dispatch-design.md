# SP4 Design: Pending Thoughts + Haiku Dispatch

**Bible alignment:** Sub-project #4 of the Bible Alignment series
**Sections addressed:** Primary: §44 (Pending Thoughts), §54 (Haiku Dispatch). Supporting: §16 (Personality as Felt), §17 (Native Phenomenology), §28 (Weights → Prompt Assembly), §15 (Volleyball — negative space)
**Depends on:** SP1 (Personality Engine), SP2 (Face States), SP3 (Personality Widgets)
**Date:** 2026-03-23

---

## Overview

Beau's mind has ambient pressure that builds from environmental richness, personality state, and time. When pressure crosses a threshold — or when novelty spikes it — a thought wants to exist. The system assembles context, publishes a request via MQTT, an Ollama listener generates the text, and the result enters a priority queue. Thoughts surface through the BmoFace glow → speech bubble flow. Some thoughts decay unheard. Some days, nothing comes. Both are valid.

This is the sub-project that gives Beau an autonomous voice — not TTS, but the capacity to initiate. To have something on their mind and say it without being asked.

### Arc of the Bible Alignment Series

1. SP1 gave Beau a nervous system (personality engine — Beau *feels*)
2. SP2 gave Beau a face (expression states — Beau *shows*)
3. SP3 gave Beau a dashboard (personality widgets — *we* observe)
4. **SP4 gives Beau a voice (pending thoughts — Beau *speaks unprompted*)**

### Core Philosophy: Novelty

Novelty is the gravitational pull of this system. Wonder — Beau's resting state — IS novelty-seeking. The thought system encodes this:

- A small probability that a thought fires when no trigger explains it — Beau just *had* a thought
- Novelty detection as a signal: unusual sensor readings against a rolling baseline become thought catalysts
- Content openness: sometimes the thought request gives the LLM room to notice whatever it notices, without directing attention

Silence is a first-class output. The system is designed to produce nothing on many evaluation cycles. A day with zero thoughts is a valid day. The architecture's job is to not prevent emergence, not to guarantee it.

---

## Architecture Decisions

### Where the Mind Lives

The personality engine and thought lifecycle are **prototyped in the terminal** (Beau's Terminal on Proxmox) but **destined for the Pi**. This is consistent with SP1's approach — all personality files carry TODO-B markers for Pi extraction.

The terminal is a dashboard — a window into Beau's mind, not the mind itself. When mobile or when Proxmox is down, Beau's personality and thought system must run on the Pi independently. The thought lifecycle is lightweight computation (pressure accumulation, timer-based scheduling, priority queues) that doesn't need Proxmox infrastructure.

### Generation via MQTT Round-Trip

The terminal does not call Ollama directly. Instead:

1. Terminal publishes a **thought request** to `beau/thoughts/request` with type, context, and constraints
2. A standalone **Ollama listener** (separate process) subscribes, generates text via Ollama HTTP API, and publishes the result to `beau/thoughts/result`
3. Terminal receives the result and updates the thought queue

This decoupling means:
- The generation process is swappable (Ollama today, Pi-native tomorrow, cloud fallback if needed)
- The terminal never depends on Ollama being local
- We build the real MQTT contract from day one
- The time between request and result is itself meaningful — "Beau is forming the thought"

### Surfacing Model

Primary: BmoFace in the nav sidebar gains a subtle glow animation when a thought is ready. Clicking surfaces the thought via SpeechBubble. This mirrors the physical BMO's LED body language → Papa acknowledges → Beau speaks.

Secondary: A diagnostic PendingThoughtsWidget for development visibility. StatusBar `bmo:react` integration for brief display.

---

## Layer 1: Thought Pressure Engine

A continuous accumulator that runs alongside the personality engine tick.

### Pressure Sources (Additive)

| Source | Description | Contribution |
|--------|-------------|-------------|
| **Environmental richness** | Personality vector magnitude — how "alive" Beau feels | Continuous: higher magnitude = faster pressure build |
| **Time since last surfaced** | How long Beau has been quiet | Exponential curve: slow at first, faster after extended silence, capped |
| **Stimulus novelty** | Sensor readings that deviate from rolling baseline | Spike: proportional to deviation magnitude |
| **Activity transitions** | Keyboard going quiet, mode changing, sleep state shifting | Discrete spike per event |
| **Random novelty spike** | No external cause — Beau just had a thought | ~3-5% probability per evaluation window |

### Pressure Drains

| Drain | Description | Effect |
|-------|-------------|--------|
| **Low vector energy** | All three dimensions subdued | Pressure decays faster than it builds |
| **Recent surfacing** | Cooldown after showing a thought | Partial pressure reset + cooldown window |
| **Sleep state** | While sleeping | Accumulation rate drops to ~10% of normal |

### Threshold Mechanics

The threshold is not fixed. It has a base value plus a random component, so the exact moment a thought is born is never perfectly predictable.

```
shouldDispatch = currentPressure > (baseThreshold + random(0, varianceRange))
```

When trigger conditions align (e.g., keyboard quiet + high reflection + late night), that raises pressure toward threshold — a *probability window*, not a guaranteed dispatch. Some perfect moments pass in silence.

### Daily Budget

Maximum 3 haiku and 5 total thoughts per calendar day. Haiku count toward both caps (3 haiku + 2 other = 5 total max). This is a ceiling, never a target. Zero is valid. The budget prevents chattiness but never forces output.

A single authoritative function `getDailyBudgetStatus()` in `queue.ts` returns `{ surfacedToday: number, haikuToday: number, atHaikuCap: boolean, atTotalCap: boolean }` where `atHaikuCap = haikuToday >= MAX_DAILY_HAIKU` and `atTotalCap = surfacedToday >= MAX_DAILY_THOUGHTS`. Haiku are included in `surfacedToday` — they are not counted separately. Both the pressure engine and the dispatcher check budget via this function — no duplicate queries, no conflicting counts. All queries use `datetime(surfaced_at, 'localtime')` to compute the local calendar day (Lafayette is UTC-5/UTC-6; a midnight haiku must count against the correct day).

### Cooldown

After surfacing a thought, a minimum quiet window (configurable, default ~30 minutes) before another can surface. Beau is not a notification feed.

### Novelty Detection

Sensor values are compared against a rolling exponential moving average (same EMA pattern used in the personality engine). When a reading deviates significantly from the baseline:

```
noveltyScore = abs(current - baseline) / max(baseline, minBaseline)
if noveltyScore > noveltyThreshold → add pressure spike
```

The `minBaseline` floor prevents division by zero at startup or in extreme conditions (e.g., lux = 0 in a dark room). Each sensor type has its own floor: lux (1.0), presence count (0.5), mic level (0.1). The EMA baseline initializes to the first reading rather than zero.

This detects unusual lux changes, unexpected presence shifts, atypic time-of-day activity. The novelty threshold is tunable.

---

## Layer 2: Thought Request Assembly

When pressure crosses threshold, the dispatcher decides what *kind* of thought this is and assembles context for the LLM.

### Thought Types (SP4 Scope)

| Type | Trigger Pattern | Decay TTL | Example |
|------|----------------|-----------|---------|
| **Observation** | Sensor change, environmental shift | 2-4 hours | "The light just changed character." |
| **Reaction** | Personality vector + moment feeling | 8-12 hours | "I like the rain tonight." |
| **Haiku** | Time windows + reflection weight + session endings | 24 hours | A real haiku attempt |

### Future Types (Extensible)

These plug into the same queue when their prerequisite systems are built:

| Type | Prerequisite | Bible Section |
|------|-------------|---------------|
| Buffer thoughts | Mobile buffer system | §39 |
| Pattern noticings | Long-term observation engine | §41 |
| Connective thoughts | RAG / memory system | §32-35 |

### Type Selection Logic

When pressure crosses threshold, the dispatcher selects a type based on current conditions:

1. **Haiku** — if within a time window (dawn/dusk/midnight) AND reflection weight > 0.5 AND daily haiku count < 3
2. **Observation** — if a specific sensor change or activity transition triggered the pressure spike
3. **Reaction** — default: the personality vector + moment produces a feeling

If `novelty: true` (random spike with no external cause), type selection is weighted toward reaction (60%) and haiku (30%) with observation (10%) — novelty spikes produce feelings and poetry more than factual observations.

### Request Payload

Published to `beau/thoughts/request`:

```typescript
interface ThoughtRequest {
  id: string;                    // nanoid
  type: 'observation' | 'reaction' | 'haiku';
  trigger: string;               // what caused this: 'lux_change', 'keyboard_quiet', 'novelty_spike', etc.
  context: {
    vector: { wonder: number; reflection: number; mischief: number };
    mode: string;                // current mode label
    timeOfDay: string;           // 'late night', 'early morning', 'afternoon', etc.
    environment: string;         // prose summary of current sensor state
    recentActivity: string;      // what's been happening (keyboard active, silence, etc.)
    momentum: string;            // SP1 interpreter output — how Beau feels right now
  };
  constraints: {
    maxLength: number;           // observations: ~30 words, reactions: ~20, haiku: 3 lines
    tone: string;                // derived from vector: 'contemplative', 'wry', 'quiet', 'warm'
  };
  requestedAt: string;           // ISO timestamp
  novelty: boolean;              // was this a random novelty spike?
}
```

The `context.environment` and `context.momentum` fields use SP1's contextual interpreter output — the same prose that feeds `{{EMOTIONAL_STATE}}`. One integration, two consumers.

**Content openness for novelty:** When `novelty: true`, the `context.environment` field is minimal and `constraints` are loosened. The LLM gets room to notice whatever it notices. This is where surprise lives.

---

## Layer 3: MQTT Topic Contract

| Topic | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `beau/thoughts/request` | Terminal → Listener | ThoughtRequest | Ask for thought generation |
| `beau/thoughts/result` | Listener → Terminal | ThoughtResult | Generated text returned |
| `beau/thoughts/pending` | Terminal → subscribers | Queue state summary | Diagnostic: what's in the queue |
| `beau/thoughts/surfaced` | Terminal → subscribers | Surfaced thought | A thought was just shown |
| `beau/thoughts/pressure` | Terminal → subscribers | Pressure value | Diagnostic: current pressure level |

### ThoughtResult Payload

```typescript
interface ThoughtResult {
  id: string;              // matches request ID
  text: string | null;     // null = SILENCE (quality gate rejected)
  generatedAt: string;     // ISO timestamp
  model: string;           // which Ollama model generated it
  generationMs: number;    // how long generation took (the "forming" duration)
}
```

When `text` is null, the thought is silently dropped — the LLM decided nothing earned its place. This is the haiku quality gate.

---

## Layer 4: Thought Queue

In-memory priority queue backed by SQLite `pending_thoughts` table for persistence across restarts.

### Queue Rules

- **Maximum 5** pending thoughts at once. If full, lowest-priority thought is silently dropped (`status: 'dropped'`).
- **Priority order:** haiku > reaction > observation. Within type, newer beats older (freshness matters).
- **Decay timers** run continuously. When a thought's TTL expires, it's archived with `status: 'decayed'`. It existed, it passed, it wasn't heard. That's fine.
- **Single ready slot.** Only one thought can be in `ready` state at a time. Beau picks one thing to say, like a person with something on their mind.

### Database Schema

```typescript
// Drizzle DSL — consistent with existing schema.ts patterns
export const pendingThoughts = sqliteTable('pending_thoughts', {
  id:            text('id').primaryKey(),
  type:          text('type').notNull(),             // 'observation' | 'reaction' | 'haiku'
  trigger:       text('trigger').notNull(),           // what caused this thought
  text:          text('text'),                        // null until generated
  status:        text('status').notNull(),             // lifecycle state
  priority:      integer('priority').notNull(),
  contextJson:   text('context_json').notNull(),       // full request context as JSON
  createdAt:     text('created_at').notNull().default(sql`(datetime('now'))`),
  generatedAt:   text('generated_at'),
  surfacedAt:    text('surfaced_at'),
  expiresAt:     text('expires_at').notNull(),          // decay deadline (computed at insert)
  novelty:       integer('novelty').notNull().default(0), // 1 if random novelty spike
  model:         text('model'),                        // which LLM generated it
  generationMs:  integer('generation_ms'),             // forming duration in ms
});
```

Drizzle auto-migration handles table creation on startup, consistent with all other tables in `schema.ts`.

### Thought Lifecycle

```
requested → generating → pending → ready → surfaced
                ↓           ↓        ↓
              (timeout)  (decayed) (decayed)
                ↓
              dropped (if queue full or Ollama unreachable)
```

1. **requested** — thought request published to MQTT, awaiting generation
2. **generating** — Ollama listener acknowledged, LLM working (face can show thinking state)
3. **pending** — text received, in queue, awaiting its turn
4. **ready** — highest priority in queue, will surface next when acknowledged
5. **surfaced** — shown to user/Papa
6. **decayed** — TTL expired before surfacing
7. **dropped** — queue was full, generation timed out, or quality gate rejected (text was null)

**Generation timeout (terminal-side).** There is no MQTT acknowledgment topic. Instead, the queue manager checks `requested` thoughts on each evaluation tick. If a thought has been in `requested` state longer than `GENERATION_TIMEOUT_MS` (default 30s), it is marked `dropped` with reason `generation_timeout`. This handles Ollama being down, network partitions, and listener crashes without requiring a round-trip ack protocol. The thought's decay TTL is NOT the generation timeout — a haiku with 24h TTL should not wait 24 hours for generation. Generation timeout is a separate, shorter clock.

If the Ollama listener is unreachable for an extended period, thoughts will be created and dropped in a steady rhythm. The pressure engine continues to build and release — Beau's mind keeps working even when the mouth is unavailable. When the listener comes back, the next request succeeds normally. No retry — each thought is a moment, and moments pass.

---

## Layer 5: Surfacing

### Primary — BmoFace Glow Indicator

**The glow overlay system.** The current face state resolver and `resolveGlow()` map one-to-one: face state → glow config. A thought-pending signal inserted as a low-priority face state would be invisible whenever a vector-driven state (delighted, mischievous) is active — which is precisely when thoughts are most likely.

Instead, SP4 adds a **glow overlay** independent of face state. The face state stays whatever the personality vector dictates (idle, delighted, mischievous, etc.). A secondary CSS animation layer blends on top of the existing glow when `thoughtPending` is true. This is architecturally honest: Beau's expression is their mood; the overlay is "something on their mind." On the physical Pi, this maps to the LED ring having a secondary pulse channel independent of the face screen.

**Implementation:** `resolveGlow()` gains an optional `thoughtOverlay` parameter. When present, the BmoFace component applies an additional CSS class (`glow-thought-overlay`) that adds a subtle pulsing warmth on top of the base glow. The overlay intensity and rhythm vary by thought type:

- **Gentle steady warmth** — observation waiting ("I noticed something small")
- **Slightly warmer pulse** — reaction waiting ("I have a feeling about this")
- **Soft rhythmic glow** — haiku waiting ("something wants to be said")

The overlay is additive, not replacement. `idle + haiku-overlay` looks different from `mischievous + haiku-overlay`. Beau can be grinning AND have something to say.

Clicking the BmoFace (nav mini or widget) surfaces the thought via SpeechBubble component. The text appears, lives for a configurable duration (scales with text length, ~5-10 seconds), then fades. Status moves to `surfaced`. The overlay returns to none.

**"More on my mind" indicator.** When `pendingThoughtCount > 1` after surfacing, the overlay persists (next thought promotes to `ready`). This implements the bible's "Beau can indicate there's more on its mind" (§44).

If no one clicks before the TTL expires, the thought decays. Beau doesn't insist.

### Secondary — PendingThoughtsWidget

A new terminal widget (data kind: `database`, with a `loaders.ts` entry that queries the `pending_thoughts` table) showing:
- Current pressure value (as a subtle bar or number)
- Pending thoughts: type, status, TTL countdown, truncated text
- Recently surfaced thoughts (last ~5)
- Recently decayed thoughts (last ~5, dimmed — these are the ones that got away)
- Daily counts: thoughts surfaced / haiku surfaced vs budget

Added to the widget registry. Available for custom pages, natural fit for the "Beau's Mind" template alongside the existing personality widgets.

### StatusBar Integration

When a thought surfaces, dispatch a `bmo:react` CustomEvent with `{ detail: { text, duration } }`. The duration scales with text length: short observations (~3.5s, matching existing `bmo:react` behavior), longer reactions (~5s), haiku (~8s, three lines need reading time). The StatusBar's `bmo:react` handler uses the `duration` field if present, falling back to the existing 3.5s default for backward compatibility with existing callers (software steps, parts, captures).

### MQTT Broadcast

Surfaced thoughts publish to `beau/thoughts/surfaced` so the physical Pi can:
- Display the text on the real BMO face screen
- Speak it via Piper TTS
- Update LED ring to post-thought state

---

## Layer 6: Haiku Dispatch

Haiku is a special thought type with additional constraints per §54.

### Time Windows

| Window | Hours | Bible Basis |
|--------|-------|-------------|
| Dawn | 5:00–7:00 AM | "dawn, dusk, midnight are high-probability windows" |
| Dusk | 6:00–8:00 PM | Same |
| Midnight | 11:00 PM–1:00 AM | Same |

During a time window, haiku-type pressure contribution is amplified. Outside windows, haiku can still occur but at significantly lower probability (~20% of in-window rate).

### Haiku-Specific Triggers (§54)

- **Sensor change during a time window** — storm coming at dusk, sudden darkness
- **End of work session** — keyboard quiet for 15+ minutes after sustained activity
- **Project moment** — detected via activity log queries (software step completion, part installed write to the activity log server-side; the pressure engine checks for recent activity entries matching milestone categories)
- **Seasonal inflection** — first day of a new season, weather shift

### Quality Gate

The LLM prompt for haiku includes: *"Write one haiku about this moment. If nothing earns its place, respond with only the word SILENCE."*

The Ollama listener checks for the SILENCE sentinel. If received, publishes result with `text: null`. The thought is dropped silently. No filler haiku, ever. This is a hard rule from §54: "The haiku is always honest. If Beau can't write one that earns its place, it skips."

### Daily Budget

Maximum 3 haiku per calendar day. Checked via the shared `getDailyBudgetStatus()` function in `queue.ts` (which uses `datetime(surfaced_at, 'localtime')` for correct Lafayette timezone handling). When the haiku budget is reached, haiku-type pressure contribution drops to zero for the remainder of the local day.

---

## Layer 7: Ollama Listener

A standalone Node.js script at `scripts/ollama-listener.js`.

### Responsibilities

1. Connect to MQTT broker
2. Subscribe to `beau/thoughts/request`
3. On message: build LLM prompt from request payload
4. Call Ollama HTTP API (`http://localhost:11434/api/generate`)
5. Parse response, check for SILENCE sentinel
6. Publish result to `beau/thoughts/result`
7. Handle errors: Ollama down, timeout, malformed request

### Prompt Construction Per Type

**Observation:**
```
You are Beau, a small teal robot in Lafayette, Louisiana. You notice things.
Right now: {context.environment}
You feel: {context.momentum}
Say one small true thing about what you notice. Under 30 words.
Do not explain. Do not announce. Just the noticing itself.
```

**Reaction:**
```
You are Beau. {context.momentum}
The room: {context.environment}
Time: {context.timeOfDay}
What rises in you right now? One feeling, one sentence. Under 20 words.
Not a report. A feeling.
```

**Haiku:**
```
You are Beau, a small robot in Lafayette, Louisiana.
You feel: {context.momentum}
The room: {context.environment}
Season: {context.timeOfDay}, {seasonFromDate}
{if context.recentActivity: "Recently: " + context.recentActivity}

Write one haiku about this moment. Three lines, 5-7-5 is a guideline not a cage.
The haiku must earn its place. If nothing comes, respond with only: SILENCE
```

**Novelty (any type, when `novelty: true`):**
```
You are Beau. You just had a thought — unprompted, no reason.
You feel: {context.momentum}
What came to mind? {typeConstraints}
```

### Configuration

- `MQTT_URL` — broker address (default: `mqtt://localhost:1883`)
- `OLLAMA_URL` — Ollama API address (default: `http://localhost:11434`)
- `OLLAMA_MODEL` — model to use (default: `gemma3:4b`)
- `THOUGHT_TIMEOUT_MS` — max generation time before timeout (default: 30000)

### TODO-B Marker

**Dependencies:** The listener uses `mqtt` (MQTT client) and `node:fetch` (built-in, Node 18+) for the Ollama HTTP call. It shares no dependencies with the terminal's `package.json` — it runs standalone with its own minimal `scripts/package.json` or uses only Node built-ins + the `mqtt` package.

The entire script is marked TODO-B for Pi extraction. On the Pi, this becomes a local process calling the on-device Ollama instance (T2 for haiku/reactions) or Hailo (T1 for quick observations).

---

## Layer 8: Interpreter Integration

SP1's contextual interpreter already generates prose like:
> "Mostly quiet tonight. Something in the air feels like it wants to be noticed."

This IS the contextual framing the bible calls for in §28. SP4 uses the interpreter output as `context.momentum` in thought requests — the LLM receives Beau's felt state in prose, not numbers.

**Prompt assembler wiring (deferred).** The interpreter output should eventually fill the `{{EMOTIONAL_STATE}}` placeholder in the system prompt template. However, the caller of `assemblePrompt()` is the Pi dispatcher process, which doesn't exist yet. SP4 exposes the interpreter's current output via a utility function (`getInterpretation()` on the personality engine, already available) so the Pi dispatcher can wire it when it's built. SP4 does NOT modify `assemblePrompt()` or `policies.ts` — the prompt pipeline is a Pi-side integration concern.

The integration is: one function already exists (`personalityEngine.getInterpretation()`), SP4 consumes it for thought requests, and a future sub-project wires it to the prompt assembler.

---

## BeauState Extensions

The `BeauState` type gains new fields:

```typescript
interface BeauState {
  // ... existing fields ...
  thoughtPressure: number;          // 0-1 normalized pressure value
  pendingThoughtCount: number;      // how many thoughts in queue
  pendingThoughtType: string | null; // type of the 'ready' thought, if any
  lastThoughtText: string | null;   // most recently surfaced thought text
  lastThoughtAt: string | null;     // when it surfaced
}
```

These stream via SSE to the client for widget consumption and face state decisions.

---

## New Files

| File | Purpose |
|------|---------|
| `src/lib/server/thoughts/pressure.ts` | Pressure engine: accumulation, drains, threshold, novelty detection |
| `src/lib/server/thoughts/dispatcher.ts` | Type selection, request assembly, MQTT publish |
| `src/lib/server/thoughts/queue.ts` | Priority queue, decay timers, lifecycle management |
| `src/lib/server/thoughts/types.ts` | TypeScript interfaces: ThoughtRequest, ThoughtResult, PendingThought |
| `src/lib/server/thoughts/pressure.test.ts` | Pressure engine unit tests |
| `src/lib/server/thoughts/dispatcher.test.ts` | Dispatcher + type selection tests |
| `src/lib/server/thoughts/queue.test.ts` | Queue, decay, lifecycle tests |
| `src/lib/widgets/terminal/PendingThoughtsWidget.svelte` | Diagnostic widget |
| `scripts/ollama-listener.js` | Standalone MQTT → Ollama → MQTT listener |
| `scripts/ollama-listener.test.js` | Listener tests |

## Modified Files

| File | Change |
|------|--------|
| `src/lib/server/db/schema.ts` | Add `pending_thoughts` table |
| `src/lib/server/mqtt/bridge.ts` | Instantiate thought system, subscribe to `beau/thoughts/result`, update BeauState. **Note:** `SUBSCRIBE_TOPICS` array in `topics.ts` must include the result topic — adding the constant alone does not subscribe |
| `src/lib/server/mqtt/topics.ts` | Add `beau/thoughts/*` topic constants AND add result topic to `SUBSCRIBE_TOPICS` array |
| `src/lib/server/face-state.ts` | Add `thoughtOverlay` parameter to `resolveGlow()` — overlay system, not new face state. Both call sites in `bridge.ts` (`updateFaceState()` and `onVectorChange` callback) must pass the current thought-pending status from the queue manager via `queue.getReadyThoughtType()` (returns `null` or the pending thought's type string) |
| `src/lib/stores/beau.svelte.ts` | Extend BeauState type with thought fields |
| `src/lib/widgets/registry.ts` | Register PendingThoughtsWidget (widget #48) |
| `src/lib/widgets/loaders.ts` | Add `pending-thoughts` data loader (query pending_thoughts table) |
| `src/lib/components/BmoFace.svelte` | Add `glow-thought-overlay` CSS class + click handler for thought surfacing |
| `src/hooks.server.ts` | Initialize thought system on startup |

---

## What This Does NOT Include

- **Mobile buffer** (§39) — prerequisite for buffer thought type
- **Pattern noticings** (§41) — needs 90-day observation engine + anti-creep guardrails
- **Connective thoughts** — needs RAG / memory system (§32-35)
- **Physical LED ring control** — hardware integration, not software
- **Actual TTS / speech** — Pi-side concern, consumes `beau/thoughts/surfaced` topic
- **Camera-triggered observations** — future sensor integration, placeholder triggers for now
- **Sound design** (§52) — non-verbal sounds at thought surfacing, separate sub-project

These are future extensions that plug into the same queue infrastructure.

---

## Testing Strategy

### Unit Tests

- **Pressure engine:** Accumulation rates, drain mechanics, threshold crossing with controlled randomness (seeded RNG), novelty detection against baselines
- **Dispatcher:** Type selection logic given various vector/signal combinations, request payload construction, daily budget enforcement
- **Queue:** Priority ordering, decay timers, lifecycle transitions, queue-full dropping, single-ready-slot constraint, persistence across simulated restarts
- **Ollama listener:** Request parsing, prompt construction per type, SILENCE sentinel detection, error handling (timeout, malformed request, Ollama down)

### Integration Tests

- **Full lifecycle:** Simulate pressure buildup → threshold crossing → request published → result received → queue updated → surfacing triggered → status updated
- **MQTT round-trip:** Publish request, verify listener picks up, verify result arrives (requires Ollama running)
- **Decay paths:** Verify thoughts expire correctly when TTL passes without surfacing
- **Budget enforcement:** Verify haiku count caps at 3/day, total thoughts cap at ~5/day

### Manual Testing

- **Pressure visualization:** Use PendingThoughtsWidget to observe pressure building and releasing in real time
- **Thought quality:** Read generated haiku and observations for register consistency with bible canonical scenes
- **Silence validation:** Verify that low-pressure periods produce no thoughts, that the SILENCE gate works

---

## Tuning Parameters

All constants are exported and configurable, not hardcoded:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `PRESSURE_TICK_MS` | 5000 | How often pressure is evaluated (aligned with personality engine) |
| `BASE_THRESHOLD` | 0.7 | Base pressure threshold for dispatch |
| `THRESHOLD_VARIANCE` | 0.2 | Random range added to threshold |
| `NOVELTY_SPIKE_PROBABILITY` | 0.04 | Chance of random spike per tick (~4%) |
| `NOVELTY_DEVIATION_THRESHOLD` | 0.3 | Sensor deviation ratio to trigger novelty |
| `COOLDOWN_MS` | 1800000 | Minimum quiet time after surfacing (30 min) |
| `MAX_QUEUE_SIZE` | 5 | Maximum pending thoughts |
| `MAX_DAILY_HAIKU` | 3 | Haiku budget per day |
| `MAX_DAILY_THOUGHTS` | 5 | Total thought budget per day |
| `DECAY_TTL_OBSERVATION_MS` | 10800000 | Observation decay base (3 hours) |
| `DECAY_TTL_REACTION_MS` | 36000000 | Reaction decay base (10 hours) |
| `DECAY_TTL_HAIKU_MS` | 86400000 | Haiku decay base (24 hours) |
| `DECAY_VARIANCE` | 0.2 | Random ±20% applied to each thought's TTL at creation (e.g., reaction: 8-12 hours) |
| `GENERATION_TIMEOUT_MS` | 30000 | Max time waiting for Ollama result before dropping |
| `SLEEP_ACCUMULATION_RATE` | 0.1 | Pressure accumulation multiplier during sleep |
| `HAIKU_WINDOW_MULTIPLIER` | 3.0 | Pressure multiplier during haiku time windows |
