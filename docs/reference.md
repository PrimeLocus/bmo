# BMO Technical Reference

Deep technical details for the BMO project. For overview and conventions, see the root [`CLAUDE.md`](../CLAUDE.md).

---

## MQTT Topic Tree

Beau's Terminal subscribes/publishes via the bridge (`src/lib/server/mqtt/bridge.ts`):

| Topic | Direction | Purpose |
|---|---|---|
| `beau/state/mode` | BMO → Terminal | Current mode (ambient/witness/collaborator/archivist/social) |
| `beau/state/emotion` | BMO → Terminal | Emotional state (curious/contemplative/playful/sleepy) |
| `beau/intent/wake` | BMO → Terminal | Last wake word detected |
| `beau/sensors/environment` | BMO → Terminal | Environment string from HA + process monitor |
| `beau/output/haiku` | BMO → Terminal | Haiku text (auto-persisted to SQLite) |
| `beau/dispatcher/log` | BMO → Terminal | Dispatcher log entries (persisted to dispatches table + in-memory) |
| `beau/sensors/camera` | BMO → Terminal | Camera status ("active" / other) |
| `beau/state/sleep` | BMO → Terminal | Sleep state (awake/settling/asleep/waking) |
| `beau/environment/presence` | BMO → Terminal | Presence detection JSON ({ detected, confidence }) |
| `beau/environment/lux` | BMO → Terminal | Lux reading JSON ({ lux: number }) |
| `beau/environment/weather` | BMO → Terminal | Weather data JSON |
| `beau/environment/seasonal` | BMO → Terminal | Seasonal context string |
| `beau/command/*` | Terminal → BMO | Commands sent via Prompt Console |

### Creative

| Topic | Direction | Purpose |
|---|---|---|
| `beau/creative/resolume/session` | BMO → Terminal | Session status (started/ended/active JSON payload) |
| `beau/creative/resolume/live` | BMO → Terminal | Real-time clip and BPM data from Resolume OSC |
| `beau/creative/resolume/debrief` | BMO → Terminal | Post-session reflection trigger (debriefAt timestamp payload) |

### Wellness

Published by the `ble-bridge/` service. Beau-terminal subscribes to all three; it never publishes to the wellness namespace.

| Topic | Direction | Purpose |
|---|---|---|
| `beau/wellness/device/status` | BLE Bridge → Terminal | Device connect/disconnect events |
| `beau/wellness/device/telemetry` | BLE Bridge → Terminal | Periodic temp, battery, heating state (every 3s active, 30s idle) |
| `beau/wellness/session` | BLE Bridge → Terminal | Explicit session start/end from the bridge (optional; terminal infers sessions from telemetry if not present) |

#### Wellness MQTT payload schemas

**`beau/wellness/device/status`**
```json
{
  "deviceId": "AA:BB:CC:DD:EE:FF",
  "deviceType": "volcano-hybrid",
  "displayName": "Volcano Hybrid",
  "event": "connected",
  "batteryPercent": 87,
  "firmwareVersion": "3.1.2"
}
```
`event` must be one of `"connected" | "disconnected" | "error"`. `batteryPercent` and `firmwareVersion` are optional.

**`beau/wellness/device/telemetry`**
```json
{
  "deviceId": "AA:BB:CC:DD:EE:FF",
  "deviceType": "volcano-hybrid",
  "displayName": "Volcano Hybrid",
  "targetTemp": 385,
  "actualTemp": 372,
  "heatingState": "active",
  "batteryPercent": 85,
  "profile": "Evening"
}
```
`heatingState` must be one of `"idle" | "heating" | "ready" | "active" | "cooling"`. All temperatures in **Fahrenheit** (bridge normalizes). `batteryPercent` and `profile` are optional.

**`beau/wellness/session`** (optional — bridge may omit this; terminal infers from telemetry)
```json
{
  "event": "start",
  "deviceId": "AA:BB:CC:DD:EE:FF",
  "deviceType": "volcano-hybrid",
  "displayName": "Volcano Hybrid",
  "targetTemp": 385
}
```
`event` must be one of `"start" | "end" | "heartbeat"`.

**BeauState** (server-side, broadcast via SSE):

```typescript
{
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
  // Phase 3 — Creative
  resolumeActive: boolean;
  currentSessionId: number | null;
  currentClip: string | null;
  currentBpm: number | null;
  // Phase 5 — Wellness
  wellnessSessionActive: boolean;       // true while a session is in progress
  wellnessDeviceType: string | null;    // 'volcano-hybrid' | 'puffco-peak-pro' | etc.
  wellnessDeviceName: string | null;    // human-readable display name
  wellnessTargetTemp: number | null;    // target temp in °F
  wellnessActualTemp: number | null;    // current actual temp in °F
  wellnessHeatingState: string | null;  // idle | heating | ready | active | cooling
  wellnessSessionId: number | null;     // FK into wellness_sessions table
  wellnessBattery: number | null;       // battery % (null for devices without battery)
  wellnessProfile: string | null;       // named heat profile, if any
}
```

---

## Database Schema

20 tables in `beau-terminal/data/beau.db` (defined in `src/lib/server/db/schema.ts`):

27 tables in `beau-terminal/data/beau.db` (defined in `src/lib/server/db/schema.ts`):

| Table | Purpose | Key Columns |
|---|---|---|
| **parts** | Hardware components | id, name, category, price, source, tracking, status, eta, role, notes, expectedDelivery, buildVersion |
| **softwarePhases** | Build phases | id (auto), phase, order |
| **softwareSteps** | Checklist items within phases | id (text), phaseId (FK), text, done, order, links (JSON) |
| **ideas** | Ideas board items | id (text), priority, text, done, links (JSON) |
| **haikus** | Haiku archive | id (auto), text, trigger, mode, createdAt, haikuType, wakeWord, isImmutable, sourceContext, sessionId (FK→resolume_sessions, nullable) |
| **todos** | Task list | id (auto), text, section, done, priority, sortOrder, createdAt |
| **promptHistory** | MQTT commands sent via Prompt Console | id (auto), content, label, createdAt |
| **emergenceArtifacts** | Beau's emergence moment (singleton) | id, singleton (unique), emergenceTimestamp, haikuText, modelUsed, checksum, bootId |
| **natalProfiles** | Birth chart data | id, birthTimestamp, timezone, locationName, lat/lon, westernChartJson, summaryText, isActive, version |
| **voiceModels** | Voice model versions | id, versionName (unique), engine, modelPath, trainingNotes, status, activatedAt, retiredAt |
| **voiceTrainingPhrases** | Training phrases per voice model | id, voiceModelId (FK), text, source, includedInTraining, sortOrder |
| **dispatches** | Brain routing dispatch log | id, tier, model, querySummary, routingReason, contextMode, durationMs, environmentId |
| **environmentSnapshots** | Environment state snapshots (60s min interval) | id, timestamp, presenceState, lux, sleepState, weatherJson, seasonalSummary, contextMode |
| **environmentEvents** | Environment state change events | id, timestamp, eventType, payloadJson, source |
| **resolume_sessions** | Resolume VJ session records | id (auto), createdAt, startedAt, endedAt, status, sessionName, venue, bpmMin, bpmMax, bpmAvg, clipsUsedJson, columnsTriggeredJson, colorObservations, oscLogPath, debriefText, moodTagsJson, visualPrompt, beauPresent, embeddingStatus |
| **resolume_events** | Per-event clip/BPM data within a session | id (auto), sessionId (FK→resolume_sessions), timestamp, sequence, eventType, source, payloadJson |
| **photos** | Photo metadata for session-linked photography | id (auto), createdAt, capturedAt, sessionId (FK→resolume_sessions, nullable), imagePath, thumbnailPath, caption, notes, tagsJson, sourceType, isPrivate, embeddingStatus |
| **journal_entries** | Beau's journal entries (private by default) | id (auto), createdAt, entryAt, title, body, mood, tagsJson, visibility, surfacedAt, filePath |
| **noticings** | Pattern observations with lifecycle | id (auto), createdAt, patternText, basisSummary, observationWindow, surfacedAt, status, category |
| **consent_events** | Audit trail for journal/noticing access | id (auto), timestamp, eventType, targetId, targetType, sessionToken, notes |

| **wellness_sessions** | Cannabis device session records | id (auto), createdAt, startedAt, endedAt, status, deviceId, deviceType, displayName, targetTemp, peakTemp, avgTemp, profile, durationSeconds, batteryStart, batteryEnd, contextMode |
| **wellness_events** | Per-telemetry-frame data within a wellness session | id (auto), sessionId (FK→wellness_sessions), timestamp, sequence, eventType, payloadJson |

Note: `haikus.session_id` is a nullable FK to `resolume_sessions.id` — haikus generated during a VJ session are automatically linked.

Seed data: 18 parts, 10 phases, 52 steps, 11 ideas + 116 link mappings. Startup seed is additive: it inserts missing rows and syncs canonical reference text/status without overwriting more-advanced local states such as installed parts.

---

## Brain Routing

The HAT's 1.5B models are weak at reasoning (confirmed). Routing is intentional:

| Tier | Model | Hardware | Use Case |
|---|---|---|---|
| **Reflex** | Qwen2.5 1.5B | Hailo NPU (8GB HAT RAM) | Wake word, object detection, fast banter, short factual. Zero Pi CPU usage. |
| **Philosopher** | Gemma 3 4B | Pi CPU via Ollama (16GB RAM) | Philosophical, creative, poetic. Full system prompt + RAG. Runs alongside HA, display, orchestration. |
| **Heavy** | Qwen3-30B | ThinkStation via Tailscale | Extended reasoning, large context. Full prompt + extended memory. Auto-fallback when offline. |

Both HAT and Pi CPU stacks coexist and run simultaneously on the same Pi 5 board.

---

## System Prompt Template

Canonical system prompt for the philosopher brain lives in `bmo-system-prompt.md`. Uses `{{PLACEHOLDER}}` syntax for runtime injection:

| Placeholder | Source |
|---|---|
| `{{WAKE_WORD}}` | Detected wake word ("Hey BMO" or "Hey Beau") |
| `{{MODE}}` | Current context mode from MQTT |
| `{{ENVIRONMENT}}` | Home Assistant + process monitor state |
| `{{TIME_OF_DAY}}` | System clock |
| `{{RAG_FRAGMENTS}}` | ChromaDB query results (3–5 chunks) |
| `{{EMOTIONAL_STATE}}` | Probabilistic state model output |
| `{{SLEEP_STATE}}` | BMO sleep state manager |
| `{{PRESENCE_STATE}}` | Home Assistant presence sensor |
| `{{SEASONAL_CONTEXT}}` | System clock + location |
| `{{SOUL_CODE_HAIKU}}` | DB — emergence_artifacts table |
| `{{VOICE_MODEL_VERSION}}` | DB — voice_models table |
| `{{WEATHER_SUMMARY}}` | Home Assistant weather integration |
| `{{LUX_CONTEXT}}` | Home Assistant lux sensor |
| `{{NATAL_SUMMARY}}` | DB — natal_profiles table |

---

## Prompt Assembler

The prompt assembler (`src/lib/server/prompt/assembler.ts`) reads `bmo-system-prompt.md` and processes it at runtime:

1. **Parses sections** — `<!-- SECTION: NAME -->` markers split the prompt into 15 named sections
2. **Applies injection policy** — each section has a per-mode injection level (full/omit) defined in `policies.ts`
3. **Substitutes placeholders** — `{{PLACEHOLDER}}` tokens replaced with runtime values or fallbacks from `policies.ts`
4. **Reflex tier variant** — `buildReflexPrompt()` produces a stripped version (CORE_IDENTITY paragraph 1 + VOICE_RULES + CONTEXT + current MODE_PROTOCOL line)

Section definitions: `src/lib/server/prompt/sections.ts` (15 sections)
Injection policies: `src/lib/server/prompt/policies.ts` (15 × 5 mode matrix)

---

## Creative Domain Modules

Server-side modules under `src/lib/server/creative/` that implement Phase 3 VJ witness and photography features:

| Module | Purpose |
|---|---|
| `resolume.ts` | Session lifecycle management — detects Resolume start/stop via OSC, opens/closes `resolume_sessions` records, aggregates clip/BPM stats |
| `witness.ts` | Witness mode controller — puts Beau into quiet observation, triggers single-sentence whispers and haiku generation linked to the active session |
| `debrief.ts` | Post-session reflection scheduler — waits for the configured cool-down period after session end, then triggers a philosopher-tier debrief prompt and persists the result |
| `photography.ts` | Photo validation and naming — validates file type and dimensions, generates slug-based filenames, inserts metadata into `photos` table, optionally requests a vision-model caption |

---

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

---

## Wellness Domain

Ambient awareness of cannabis device sessions. Beau-terminal is a **passive consumer** — it reads MQTT data published by the `ble-bridge/` service and records session history. It never controls devices.

### Supported Devices

| Device | BLE Protocol | Notes |
|---|---|---|
| Volcano Hybrid (Storz & Bickel) | Documented GATT UUIDs | Best-supported; existing HA integration. GATT UUIDs in `ble-bridge/src/devices/volcano-hybrid.ts` |
| Puffco Peak Pro | Reverse-engineered (PuffcoPC / Fr0st3h writeup) | Auth handshake required for firmware X+. See `ble-bridge/src/devices/puffco-peak-pro.ts` |
| Dr Dabber Switch 2 | No public protocol | Schema supports it; adapter TBD when protocol is reverse-engineered |
| Puffco Pivot | No Bluetooth | Excluded permanently — device has no wireless connectivity |

### Session Lifecycle (server-side)

Implemented in `src/lib/server/wellness/sessions.ts`.

```
idle ──► heating ──► active ──► cooling ──► idle
                      │                      ▲
                      └──────────────────────┘
                         (device back to active)
```

**`WellnessSessionManager`** — one instance per connected device, keyed by `deviceId`:
- Transitions on `heatingState` changes from incoming telemetry
- Silence-based end detection: 3-minute timeout while in `cooling` state
- Early end: if `actualTemp` drops below 100°F during cooling, session ends immediately without waiting for the timeout
- Callbacks: `onSessionStart(info)` and `onSessionEnd(stats)` fire when transitions occur
- `cleanup()` ends any active session and clears timers (called on device disconnect or server shutdown)

**`WellnessDeviceCoordinator`** — top-level orchestrator, instantiated once in `bridge.ts`:
- Maintains `Map<deviceId, WellnessSessionManager>`
- Creates a new manager on first telemetry from an unknown device
- Calls `manager.onDisconnect()` and removes from map on device disconnect events
- Handles explicit `beau/wellness/session` start/end events as authoritative overrides (bridge may publish these directly instead of letting the terminal infer)

### Bridge Wiring (`bridge.ts`)

The wellness coordinator is wired in `connectMQTT()` alongside the Resolume session manager:

```typescript
// Instantiated once
const wellnessCoordinator = new WellnessDeviceCoordinator({
  onSessionStart: (info) => {
    // 1. Update BeauState with device/temp/heating fields
    // 2. INSERT into wellness_sessions → captures wellnessDbSessionId
    // 3. logActivity('wellness_session', ...)
    // 4. broadcast()
  },
  onSessionEnd: (stats) => {
    // 1. SELECT startedAt from DB, compute durationSeconds
    // 2. UPDATE wellness_sessions with endedAt, status, peakTemp, avgTemp, durationSeconds, batteryEnd
    // 3. logActivity('wellness_session', ...)
    // 4. Clear all wellness BeauState fields back to null/false
    // 5. broadcast()
  },
});
```

Three MQTT switch cases handle incoming messages:

| Topic | Handler behavior |
|---|---|
| `beau/wellness/device/status` | Calls `coordinator.onDeviceStatus()` → creates/removes managers; logs to `environmentEvents` |
| `beau/wellness/device/telemetry` | Calls `coordinator.onTelemetry()` (may trigger session start/end callbacks); updates live temp/state fields in BeauState; inserts a `wellness_events` row if session active |
| `beau/wellness/session` | Calls `coordinator.onSessionEvent()` for explicit start/end overrides from the bridge |

### Parsers

Three defensive parse functions in `sessions.ts`:

```typescript
parseDeviceStatus(msg: string): DeviceStatusEvent | null
parseDeviceTelemetry(msg: string): TelemetryEvent | null
parseSessionEvent(msg: string): SessionEvent | null
```

All follow the same pattern: `JSON.parse` in a try/catch, validate required fields and allowed enum values, return `null` on any failure. The bridge ignores `null` returns silently.

### Database Persistence

Two tables — `wellness_sessions` (one row per session) and `wellness_events` (one row per telemetry frame while a session is active, indexed on `session_id`).

**`wellness_sessions` columns:**

| Column | Type | Notes |
|---|---|---|
| `device_id` | TEXT | BLE MAC address or device serial |
| `device_type` | TEXT | `volcano-hybrid` / `puffco-peak-pro` / etc. |
| `display_name` | TEXT | Human-readable name from the bridge config |
| `target_temp` | REAL | °F. Null if device doesn't report target |
| `peak_temp` | REAL | Highest `actualTemp` seen during session |
| `avg_temp` | REAL | Mean `actualTemp` over all telemetry frames |
| `profile` | TEXT | Named heat profile (Volcano presets, Puffco profiles) |
| `duration_seconds` | INTEGER | Computed on session end: `endedAt - startedAt` |
| `battery_start` | INTEGER | Battery % at session open |
| `battery_end` | INTEGER | Battery % at session close |
| `context_mode` | TEXT | Beau's mode at the time the session started |

### UI Widgets

| Widget ID | Type | Data Kind | Description |
|---|---|---|---|
| `wellness-session` | Terminal | `websocket` | Live session dashboard — device name, target/actual temp with color gradient, heating state badge, duration counter, battery, profile. Shows "no active session" when idle. |
| `wellness-log` | Terminal | `database` | Session history table — date, device, target temp, peak temp, duration, battery delta. Configurable row limit (default 20). |

Both are in the `environment` category in the widget drawer. A "Session Lounge" page template seeds a custom page with both widgets plus beau-vitals, last-haiku, bmo-face, and weather.

### BLE Bridge (`ble-bridge/`)

A separate Node.js process that runs on any BLE-capable machine on the same network as the MQTT broker (typically the Pi). Beau-terminal has no BLE code — it only consumes MQTT.

```
ble-bridge/
  package.json
  config.json          ← device list, MQTT URL, polling intervals
  src/
    index.ts           ← entry point, config loading, MQTT connection
    mqtt.ts            ← typed MQTT publisher wrapper
    devices/
      types.ts         ← DeviceAdapter interface all adapters implement
      volcano-hybrid.ts
      puffco-peak-pro.ts
```

**Device adapter interface:**
```typescript
interface DeviceAdapter {
  deviceType: string;
  displayName: string;
  connect(peripheral: noble.Peripheral): Promise<void>;
  disconnect(): Promise<void>;
  onTelemetry(callback: (data: TelemetryData) => void): void;
  getStatus(): { connected: boolean; batteryPercent?: number };
}
```

Each adapter normalizes device-specific BLE GATT characteristics to the shared MQTT payload format before publishing. The bridge is the only code that knows about BLE — `beau-terminal/` treats the devices as opaque MQTT sources.

**`config.json` structure:**
```json
{
  "mqtt": { "url": "mqtt://192.168.1.X:1883", "clientId": "bmo-ble-bridge" },
  "telemetryIntervalMs": 3000,
  "idleHeartbeatMs": 30000,
  "devices": [
    { "type": "volcano-hybrid", "name": "Volcano Hybrid", "bleAddress": "AA:BB:CC:DD:EE:FF", "enabled": true },
    { "type": "puffco-peak-pro", "name": "Peak Pro", "bleAddress": "11:22:33:44:55:66", "enabled": true }
  ]
}
```

### Sitrep Integration

`src/lib/server/sitrep.ts` includes wellness in two places:

1. **Current State section** — adds a line like `- **Wellness:** Volcano Hybrid at 372°F (active)` when a session is active.
2. **Wellness Sessions section** — last 5 sessions from the DB, with device, temps, duration, and timestamps.

### Testing Without a BLE Bridge

Publish test MQTT messages manually using `mosquitto_pub`:

```bash
# Device connects
mosquitto_pub -t 'beau/wellness/device/status' -m '{"deviceId":"test-01","deviceType":"volcano-hybrid","displayName":"Volcano Hybrid","event":"connected","batteryPercent":90}'

# Heating begins
mosquitto_pub -t 'beau/wellness/device/telemetry' -m '{"deviceId":"test-01","deviceType":"volcano-hybrid","displayName":"Volcano Hybrid","targetTemp":385,"actualTemp":95,"heatingState":"heating","batteryPercent":90}'

# Ready (session becomes active in DB)
mosquitto_pub -t 'beau/wellness/device/telemetry' -m '{"deviceId":"test-01","deviceType":"volcano-hybrid","displayName":"Volcano Hybrid","targetTemp":385,"actualTemp":385,"heatingState":"ready","batteryPercent":88}'

# In use
mosquitto_pub -t 'beau/wellness/device/telemetry' -m '{"deviceId":"test-01","deviceType":"volcano-hybrid","displayName":"Volcano Hybrid","targetTemp":385,"actualTemp":390,"heatingState":"active","batteryPercent":87}'

# Cooling (3-min timer starts)
mosquitto_pub -t 'beau/wellness/device/telemetry' -m '{"deviceId":"test-01","deviceType":"volcano-hybrid","displayName":"Volcano Hybrid","targetTemp":null,"actualTemp":120,"heatingState":"cooling","batteryPercent":85}'

# Or force an immediate end:
mosquitto_pub -t 'beau/wellness/session' -m '{"event":"end","deviceId":"test-01","deviceType":"volcano-hybrid","displayName":"Volcano Hybrid"}'
```

---

## BMO CLI

Root-level workspace bootstrapper (`bin/bmo.js` → `src/cli.js`).

**`bmo init [target]`** — scaffolds:
- `data/memory/`, `data/logs/`, `runtime/state/`, `prompts/`
- `bmo.config.json`, `prompts/system.md` (from `bmo-system-prompt.md` template)
- Supports `--force`, `--dry-run` flags
- Tests in `test/init.test.js`
