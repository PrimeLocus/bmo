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

**BeauState** (server-side, broadcast via WebSocket):

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
}
```

---

## Database Schema

17 tables in `beau-terminal/data/beau.db` (defined in `src/lib/server/db/schema.ts`):

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

Note: `haikus.session_id` is a nullable FK to `resolume_sessions.id` — haikus generated during a VJ session are automatically linked.

Seed data: 16 parts, 10 phases, 44 steps, 11 ideas + 116 link mappings. Idempotent — skips if parts table already has data.

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

## BMO CLI

Root-level workspace bootstrapper (`bin/bmo.js` → `src/cli.js`).

**`bmo init [target]`** — scaffolds:
- `data/memory/`, `data/logs/`, `runtime/state/`, `prompts/`
- `bmo.config.json`, `prompts/system.md` (from `bmo-system-prompt.md` template)
- Supports `--force`, `--dry-run` flags
- Tests in `test/init.test.js`
