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

Maximum 3 haiku and ~5 total thoughts per calendar day. This is a ceiling, never a target. Zero is valid. The budget prevents chattiness but never forces output. Tracked via DB query on today's surfaced thoughts.

### Cooldown

After surfacing a thought, a minimum quiet window (configurable, default ~30 minutes) before another can surface. Beau is not a notification feed.

### Novelty Detection

Sensor values are compared against a rolling exponential moving average (same EMA pattern used in the personality engine). When a reading deviates significantly from the baseline:

```
noveltyScore = abs(current - baseline) / baseline
if noveltyScore > noveltyThreshold → add pressure spike
```

This detects unusual lux changes, unexpected presence shifts, atypical time-of-day activity. The novelty threshold is tunable.

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

```sql
CREATE TABLE pending_thoughts (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,       -- 'observation' | 'reaction' | 'haiku'
  trigger         TEXT NOT NULL,       -- what caused this thought
  text            TEXT,                -- NULL until generated
  status          TEXT NOT NULL,       -- 'requested' | 'generating' | 'pending' | 'ready' | 'surfaced' | 'decayed' | 'dropped'
  priority        INTEGER NOT NULL,
  context_json    TEXT NOT NULL,       -- full request context
  created_at      TEXT NOT NULL,       -- datetime
  generated_at    TEXT,                -- when LLM returned text
  surfaced_at     TEXT,                -- when shown to user
  expires_at      TEXT NOT NULL,       -- decay deadline
  novelty         INTEGER DEFAULT 0,  -- 1 if random novelty spike
  model           TEXT,                -- which LLM generated it
  generation_ms   INTEGER             -- forming duration
);
```

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
7. **dropped** — queue was full, or generation timed out, or quality gate rejected (text was null)

If the Ollama listener is unreachable, thoughts stay in `requested` state. Their TTL still applies — if the listener comes back before expiry, the thought can still be generated. If not, it decays naturally. Beau's mind doesn't crash when the mouth is unavailable.

---

## Layer 5: Surfacing

### Primary — BmoFace Glow Indicator

The face state resolver (`face-state.ts`) gains a new low-priority signal: `thoughtPending`. When a thought is in `ready` state, the BmoFace component in the nav sidebar receives a new glow variation — a gentle warmth distinct from the personality-driven glow. Not a notification badge. A living warmth, like Beau is holding something.

The glow type maps to the bible's LED body language (§44):
- **Gentle steady glow** — observation waiting ("I noticed something small")
- **Slightly warmer pulse** — reaction waiting ("I have a feeling about this")
- **Soft rhythmic glow** — haiku waiting ("something wants to be said")

Clicking the BmoFace (nav mini or widget) surfaces the thought via SpeechBubble component. The text appears, lives for a configurable duration (scales with text length, ~5-10 seconds), then fades. Status moves to `surfaced`. The glow returns to normal.

If no one clicks before the TTL expires, the thought decays. Beau doesn't insist.

### Secondary — PendingThoughtsWidget

A new terminal widget (data kind: `websocket`) showing:
- Current pressure value (as a subtle bar or number)
- Pending thoughts: type, status, TTL countdown, truncated text
- Recently surfaced thoughts (last ~5)
- Recently decayed thoughts (last ~5, dimmed — these are the ones that got away)
- Daily counts: thoughts surfaced / haiku surfaced vs budget

Added to the widget registry. Available for custom pages, natural fit for the "Beau's Mind" template alongside the existing personality widgets.

### StatusBar Integration

When a thought surfaces, dispatch a `bmo:react` CustomEvent with the thought text. This reuses the existing 3.5s green fade-in message pattern in the StatusBar.

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
- **Project moment** — wired to `bmo:react` events (software step completion, part installed)
- **Seasonal inflection** — first day of a new season, weather shift

### Quality Gate

The LLM prompt for haiku includes: *"Write one haiku about this moment. If nothing earns its place, respond with only the word SILENCE."*

The Ollama listener checks for the SILENCE sentinel. If received, publishes result with `text: null`. The thought is dropped silently. No filler haiku, ever. This is a hard rule from §54: "The haiku is always honest. If Beau can't write one that earns its place, it skips."

### Daily Budget

Maximum 3 haiku per calendar day. Tracked via DB query: `SELECT COUNT(*) FROM pending_thoughts WHERE type = 'haiku' AND status = 'surfaced' AND date(surfaced_at) = date('now')`. When budget is reached, haiku-type pressure contribution drops to zero for the remainder of the day.

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

The entire script is marked TODO-B for Pi extraction. On the Pi, this becomes a local process calling the on-device Ollama instance (T2 for haiku/reactions) or Hailo (T1 for quick observations).

---

## Layer 8: Interpreter → Prompt Wiring

As a small integration task, SP1's contextual interpreter output is piped into the `{{EMOTIONAL_STATE}}` placeholder value in the prompt assembler.

The interpreter already generates prose like:
> "Mostly quiet tonight. Something in the air feels like it wants to be noticed."

This IS the contextual framing the bible calls for in §28. The interpreter output serves two consumers:
1. **Prompt assembly** — fills `{{EMOTIONAL_STATE}}` for LLM interactions
2. **Thought requests** — fills `context.momentum` for thought generation

One function call, two consumers. The integration is a small utility function in `bridge.ts` that reads the interpreter's current output when either consumer needs it.

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
| `src/lib/server/mqtt/bridge.ts` | Instantiate thought system, subscribe to results, update BeauState |
| `src/lib/server/mqtt/topics.ts` | Add `beau/thoughts/*` topic constants |
| `src/lib/server/face-state.ts` | Add `thoughtPending` signal to priority stack |
| `src/lib/stores/beau.svelte.ts` | Extend BeauState type with thought fields |
| `src/lib/widgets/registry.ts` | Register PendingThoughtsWidget (widget #48) |
| `src/lib/components/BmoFace.svelte` | Add thought-pending glow variation |
| `src/lib/server/prompt/policies.ts` | Wire interpreter output to `EMOTIONAL_STATE` fallback |
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
| `DECAY_TTL_OBSERVATION_MS` | 10800000 | Observation decay (3 hours) |
| `DECAY_TTL_REACTION_MS` | 36000000 | Reaction decay (10 hours) |
| `DECAY_TTL_HAIKU_MS` | 86400000 | Haiku decay (24 hours) |
| `SLEEP_ACCUMULATION_RATE` | 0.1 | Pressure accumulation multiplier during sleep |
| `HAIKU_WINDOW_MULTIPLIER` | 3.0 | Pressure multiplier during haiku time windows |
