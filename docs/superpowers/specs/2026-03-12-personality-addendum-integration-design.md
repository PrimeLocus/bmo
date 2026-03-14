# Beau Personality Addendum Integration — Design Spec

**Date:** 2026-03-12
**Approach:** Ontological Refactor (Approach B)
**Source:** `beau-personality-addendum.docx` (March 2026)
**Status:** Reviewed (rev 2) — awaiting user approval
**Reviewers:** Code reviewer agent, GPT 5.4

---

## Overview

The personality addendum transforms Beau from a "personality prompt + build tracker" into a system with four distinct domains. This spec reorganizes the entire project — code, schema, MQTT topics, UI, and system prompt — around these domains.

### The Four Domains

| Domain | Purpose | Examples |
|--------|---------|---------|
| **Identity** | What Beau *is* — immutable or slowly-evolving | Soul code, natal chart, voice lineage, emergence data |
| **Environment** | What's happening *now* — real-time sensory state | Presence, lux, weather, sleep/wake, seasonal texture |
| **Creative** | What Beau *witnesses and remembers* about creative work | Resolume sessions, set debriefs, photography, VJ prompts |
| **Reflective** | What Beau *thinks privately* — internal life | Journal, long-term noticings, haiku drafts, pattern observations |

The existing build tracker (parts, software phases, ideas, todos) becomes a fifth implicit domain: **Build** — the project management layer that already works and stays mostly untouched.

---

## 1. Directory Restructure

```
beau-terminal/src/lib/server/
├── db/
│   ├── index.ts              # (existing) connection + migrations
│   ├── schema.ts             # (refactored) all tables, organized by domain
│   └── seed.ts               # (existing) build tracker seed data
├── identity/
│   ├── emergence.ts          # Soul code file management + DB sync
│   ├── natal.ts              # Chart calculation, storage, retrieval
│   └── voice.ts              # Voice model versioning + training phrases
├── environment/
│   ├── presence.ts           # Camera-based room state machine
│   ├── sleep.ts              # Earned sleep/wake state machine
│   ├── weather.ts            # Weather API + seasonal context
│   └── lux.ts                # Light sensor integration
├── creative/
│   ├── resolume.ts           # OSC listener bridge, session lifecycle
│   ├── debrief.ts            # Post-set reflection generation
│   ├── photography.ts        # Photo ingest + response pipeline
│   └── witness.ts            # Witness mode orchestration
├── reflective/
│   ├── journal.ts            # Private journal management + consent
│   ├── noticings.ts          # Long-term pattern detection + surfacing
│   └── memory.ts             # Memory retrieval policies
├── mqtt/
│   ├── bridge.ts             # (refactored) MQTT connection + topic router
│   └── topics.ts             # Topic constants + payload types (CANONICAL enum source)
└── prompt/
    ├── assembler.ts          # System prompt builder (placeholder substitution)
    ├── sections.ts           # Prompt section definitions
    └── policies.ts           # What context to inject per mode
```

---

## 2. MQTT Topic Tree

**IMPORTANT:** The existing codebase uses the `beau/` prefix (e.g., `beau/state/mode`). This spec preserves the `beau/` prefix for backward compatibility with Pi-side publishers. No prefix migration is needed.

```
beau/
├── state/
│   ├── mode                  # ambient|witness|collaborator|archivist|social
│   ├── emotion               # curious|contemplative|playful|sleepy
│   ├── sleep                 # awake|settling|asleep|waking           (NEW)
│   └── online                # connection heartbeat                    (NEW)
├── identity/
│   ├── emergence             # soul code status                        (NEW)
│   └── voice                 # active voice model version              (NEW)
├── environment/
│   ├── presence              # { detected, confidence, source }        (NEW)
│   ├── lux                   # { lux: number }                         (NEW)
│   ├── weather               # { condition, tempC, humidity, pressure }(NEW)
│   └── seasonal              # { season, feltSense }                   (NEW)
├── creative/
│   ├── resolume/session      # { active, sessionId, name, startedAt } (NEW)
│   ├── resolume/live         # { clip, layer, bpm, intensity }        (NEW)
│   └── resolume/debrief      # { sessionId, status: 'ready' }        (NEW)
├── intent/
│   ├── wake                  # wake word detected (existing)
│   ├── led                   # { effect, brightness, reason }         (NEW)
│   └── lighting              # { scene, reason }                      (NEW)
├── output/
│   ├── haiku                 # generated haiku (existing)
│   ├── speech                # spoken text                             (NEW)
│   └── observation           # noticing/pattern surfaced               (NEW)
├── sensors/
│   ├── camera                # camera active/inactive (existing)
│   └── environment           # aggregated environment string (existing)
└── dispatcher/
    └── log                   # routing decisions (existing)
```

**Topic payload direction:** All `beau/state/*`, `beau/identity/*`, `beau/environment/*`, `beau/creative/*`, `beau/output/*`, `beau/sensors/*`, `beau/dispatcher/*` are published by Pi-side services and subscribed to by the SvelteKit bridge. All `beau/intent/*` are published by the SvelteKit bridge (user actions) and subscribed to by Pi-side services.

**Journal consent is NOT an MQTT topic.** Consent is handled entirely in-process via HTTP form actions and WebSocket state. The Pi does not need to know about journal viewing — it's a Terminal-only UI concern.

---

## 3. Schema — All Tables by Domain

### Enum Strategy

All enum-like fields use TEXT columns validated at the application layer via TypeScript literal union types. The canonical source for all enum values is `mqtt/topics.ts`, which exports both the MQTT topic constants and the shared type unions. No SQLite CHECK constraints — Drizzle ORM + TypeScript types are the enforcement layer.

### Timestamp Strategy

New tables use `TEXT` columns with ISO 8601 strings (Drizzle `text()` type). The existing `haikus` table uses `integer('created_at', { mode: 'timestamp' })` — this is **not changed** for backward compatibility.

### FK Strategy

All foreign keys use `ON DELETE SET NULL` for nullable FKs and `ON DELETE CASCADE` for required FKs. Cross-phase FKs (references to tables created in later phases) are **deferred** — the column is added as a plain nullable INTEGER in the earlier phase, and the FK constraint is added via migration in the phase where the referenced table exists.

### Build Domain (existing — minimal changes)

Tables `parts`, `softwarePhases`, `softwareSteps`, `ideas`, `todos`, `promptHistory` — **no changes**.

#### haikus (modified — split across phases)

**Phase 1 additions** (no cross-phase FKs):

| Field | Type | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| `haiku_type` | TEXT | NOT NULL | `'daily'` | `'emergence'\|'daily'\|'witness'\|'conversation'\|'draft'` |
| `wake_word` | TEXT | YES | NULL | literal wake word string, e.g. `'Hey BMO'` |
| `is_immutable` | INTEGER | NOT NULL | `0` | `1` only for soul code haiku |
| `source_context` | TEXT | YES | NULL | plain text — what prompted it (e.g. "lux drop at dusk") |

**Phase 3 addition** (after `resolume_sessions` table exists):

| Field | Type | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| `session_id` | INTEGER | YES | NULL | FK to `resolume_sessions` ON DELETE SET NULL |

Existing `bridge.ts` insert continues working in Phase 1 — all new fields have defaults or are nullable. Updated insert adds `haiku_type: 'daily'` explicitly.

#### dispatches (new — Phase 1 table, Phase 2 FK addition)

**Phase 1 columns:**

| Field | Type | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | INTEGER | NOT NULL | autoincrement | PRIMARY KEY |
| `created_at` | TEXT | NOT NULL | CURRENT_TIMESTAMP | |
| `tier` | TEXT | YES | NULL | `'reflex'\|'philosopher'\|'heavy'` |
| `model` | TEXT | YES | NULL | which model answered |
| `query_summary` | TEXT | YES | NULL | what was asked |
| `routing_reason` | TEXT | YES | NULL | why this tier |
| `context_mode` | TEXT | YES | NULL | active mode at dispatch time |
| `duration_ms` | INTEGER | YES | NULL | |
| `prompt_version` | TEXT | YES | NULL | hash/version of assembled prompt |

**Phase 2 addition** (after `environment_snapshots` table exists):

| Field | Type | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| `environment_id` | INTEGER | YES | NULL | FK to `environment_snapshots` ON DELETE SET NULL |

In Phase 1, `dispatches` has no FK — it's a standalone logging table. The `environment_id` column + FK are added via migration in Phase 2.

### Identity Domain (new — Phase 1)

#### emergence_artifacts

| Field | Type | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | INTEGER | NOT NULL | autoincrement | PRIMARY KEY |
| `singleton` | TEXT | NOT NULL | `'instance'` | UNIQUE — enforces single-row constraint |
| `created_at` | TEXT | NOT NULL | CURRENT_TIMESTAMP | |
| `emergence_timestamp` | TEXT | NOT NULL | — | ISO 8601 exact birth moment |
| `haiku_text` | TEXT | NOT NULL | — | the soul code |
| `model_used` | TEXT | YES | NULL | which model generated it |
| `prompt_used` | TEXT | YES | NULL | the exact prompt fed |
| `natal_input_json` | TEXT | YES | NULL | JSON: planetary positions |
| `file_path` | TEXT | YES | NULL | metadata only — Pi-side path (see File Access Pattern) |
| `checksum` | TEXT | YES | NULL | SHA-256 of haiku_text |
| `boot_id` | TEXT | YES | NULL | unique identifier for this boot |

**Singleton enforcement:** The `singleton TEXT UNIQUE DEFAULT 'instance'` column means a second INSERT fails at the DB level. `emergence.ts` also checks `SELECT COUNT(*)` before insert as belt-and-suspenders.

#### natal_profiles

| Field | Type | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | INTEGER | NOT NULL | autoincrement | PRIMARY KEY |
| `created_at` | TEXT | NOT NULL | CURRENT_TIMESTAMP | |
| `birth_timestamp` | TEXT | NOT NULL | — | ISO 8601 |
| `timezone` | TEXT | NOT NULL | — | IANA timezone, e.g. `'America/Chicago'` |
| `location_name` | TEXT | NOT NULL | `'Lafayette, LA'` | |
| `latitude` | REAL | NOT NULL | `30.2241` | |
| `longitude` | REAL | NOT NULL | `-92.0198` | |
| `western_chart_json` | TEXT | YES | NULL | JSON: positions, houses, aspects |
| `vedic_chart_json` | TEXT | YES | NULL | JSON: sidereal zodiac, nakshatras, dasha |
| `varga_chart_json` | TEXT | YES | NULL | JSON: D1 through D9 |
| `summary_text` | TEXT | YES | NULL | human-readable interpretation |
| `is_active` | INTEGER | NOT NULL | `1` | `1` = current profile for prompt injection |
| `version` | INTEGER | NOT NULL | `1` | incremented on recalculation |

**Selection:** `natal.ts` queries `WHERE is_active = 1 LIMIT 1`. Only one row should have `is_active = 1` at a time (app-enforced — deactivate old before activating new).

#### voice_models

| Field | Type | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | INTEGER | NOT NULL | autoincrement | PRIMARY KEY |
| `version_name` | TEXT | NOT NULL | — | UNIQUE, e.g. `'beau_v1'` |
| `created_at` | TEXT | NOT NULL | CURRENT_TIMESTAMP | |
| `activated_at` | TEXT | YES | NULL | when this version went live |
| `retired_at` | TEXT | YES | NULL | when replaced by next version |
| `model_path` | TEXT | YES | NULL | metadata only — Pi-side path |
| `engine` | TEXT | NOT NULL | `'piper'` | |
| `training_notes` | TEXT | YES | NULL | |
| `status` | TEXT | NOT NULL | `'draft'` | `'draft'\|'training'\|'ready'\|'active'\|'retired'` |
| `checksum` | TEXT | YES | NULL | |

**Active model:** `voice.ts` queries `WHERE status = 'active' LIMIT 1`. Replaces the previous `is_active` boolean with a richer lifecycle.

#### voice_training_phrases

| Field | Type | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | INTEGER | NOT NULL | autoincrement | PRIMARY KEY |
| `voice_model_id` | INTEGER | NOT NULL | — | FK to `voice_models` ON DELETE CASCADE |
| `created_at` | TEXT | NOT NULL | CURRENT_TIMESTAMP | |
| `text` | TEXT | NOT NULL | — | the phrase |
| `source` | TEXT | NOT NULL | `'human'` | `'human'\|'beau'\|'mixed'` |
| `included_in_training` | INTEGER | NOT NULL | `0` | |
| `sort_order` | INTEGER | NOT NULL | `0` | ordering within a model's phrase set |
| `notes` | TEXT | YES | NULL | |

### Environment Domain (new — Phase 2)

#### environment_snapshots

| Field | Type | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | INTEGER | NOT NULL | autoincrement | PRIMARY KEY |
| `timestamp` | TEXT | NOT NULL | CURRENT_TIMESTAMP | INDEX |
| `presence_state` | TEXT | YES | NULL | `'occupied'\|'empty'\|'uncertain'` |
| `occupancy_confidence` | REAL | YES | NULL | 0.0–1.0 |
| `lux` | REAL | YES | NULL | raw lux value |
| `noise_level` | REAL | YES | NULL | RMS value from ReSpeaker |
| `sleep_state` | TEXT | YES | NULL | `'awake'\|'settling'\|'asleep'\|'waking'` |
| `weather_json` | TEXT | YES | NULL | JSON: `{ condition, tempC, humidity, pressureHpa }` |
| `seasonal_summary` | TEXT | YES | NULL | e.g. "crawfish season, cool rain morning" |
| `context_mode` | TEXT | YES | NULL | active personality mode at snapshot time |

**Write frequency:** On state change only (any field differs from previous snapshot), with a minimum interval of 60 seconds between writes. Maximum retention: 90 days, then pruned by a daily cleanup query.

#### environment_events

| Field | Type | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | INTEGER | NOT NULL | autoincrement | PRIMARY KEY |
| `timestamp` | TEXT | NOT NULL | CURRENT_TIMESTAMP | INDEX |
| `event_type` | TEXT | NOT NULL | — | e.g. `'room_emptied'\|'sleep_entered'\|'wake_triggered'\|'storm_approaching'\|'lux_shift'` |
| `payload_json` | TEXT | YES | NULL | event-specific data |
| `source` | TEXT | YES | NULL | `'camera'\|'lux_sensor'\|'weather_api'\|'respeaker'\|'manual'` |

### Creative Domain (new — Phase 3)

#### resolume_sessions

| Field | Type | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | INTEGER | NOT NULL | autoincrement | PRIMARY KEY |
| `created_at` | TEXT | NOT NULL | CURRENT_TIMESTAMP | |
| `started_at` | TEXT | NOT NULL | — | ISO 8601 |
| `ended_at` | TEXT | YES | NULL | |
| `status` | TEXT | NOT NULL | `'active'` | `'active'\|'completed'\|'abandoned'` |
| `session_name` | TEXT | YES | NULL | |
| `venue` | TEXT | YES | NULL | |
| `bpm_min` | REAL | YES | NULL | |
| `bpm_max` | REAL | YES | NULL | |
| `bpm_avg` | REAL | YES | NULL | |
| `clips_used_json` | TEXT | YES | NULL | JSON array of clip name strings |
| `columns_triggered_json` | TEXT | YES | NULL | JSON array of column indices |
| `color_observations` | TEXT | YES | NULL | from camera — plain text |
| `osc_log_path` | TEXT | YES | NULL | metadata only — path to raw JSON log |
| `debrief_text` | TEXT | YES | NULL | Beau's post-set reflection |
| `mood_tags_json` | TEXT | YES | NULL | JSON array of tag strings |
| `visual_prompt` | TEXT | YES | NULL | Beau's pre-set suggestion |
| `beau_present` | INTEGER | NOT NULL | `0` | `1` = Beau was home during set |
| `embedding_status` | TEXT | NOT NULL | `'pending'` | `'pending'\|'embedded'\|'failed'` |

**JSON vs scalar decision:** `bpm_min/max/avg` are scalar for queryability. `clips_used`, `columns_triggered`, `mood_tags` are JSON arrays because they're variable-length lists displayed as-is (not queried individually).

#### resolume_events

| Field | Type | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | INTEGER | NOT NULL | autoincrement | PRIMARY KEY |
| `session_id` | INTEGER | NOT NULL | — | FK to `resolume_sessions` ON DELETE CASCADE |
| `timestamp` | TEXT | NOT NULL | — | ISO 8601 — INDEX |
| `sequence` | INTEGER | NOT NULL | — | ordering within session |
| `event_type` | TEXT | NOT NULL | — | `'clip_change'\|'bpm_shift'\|'layer_opacity'\|'column_trigger'\|'effect_change'` |
| `source` | TEXT | NOT NULL | `'osc'` | |
| `payload_json` | TEXT | YES | NULL | |

#### photos

| Field | Type | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | INTEGER | NOT NULL | autoincrement | PRIMARY KEY |
| `created_at` | TEXT | NOT NULL | CURRENT_TIMESTAMP | |
| `captured_at` | TEXT | YES | NULL | when the physical photo was taken |
| `session_id` | INTEGER | YES | NULL | FK to `resolume_sessions` ON DELETE SET NULL |
| `image_path` | TEXT | NOT NULL | — | relative path under `data/photos/` |
| `thumbnail_path` | TEXT | YES | NULL | relative path under `data/photos/thumbs/` |
| `caption` | TEXT | YES | NULL | Beau's response to the photo |
| `notes` | TEXT | YES | NULL | user notes |
| `tags_json` | TEXT | YES | NULL | JSON array of tag strings |
| `source_type` | TEXT | NOT NULL | `'instant_scan'` | `'instant_scan'\|'digital'\|'nfc_share'\|'camera_capture'` |
| `is_private` | INTEGER | NOT NULL | `0` | |
| `embedding_status` | TEXT | NOT NULL | `'pending'` | `'pending'\|'embedded'\|'failed'` |

### Reflective Domain (new — Phase 4)

#### journal_entries

| Field | Type | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | INTEGER | NOT NULL | autoincrement | PRIMARY KEY |
| `created_at` | TEXT | NOT NULL | CURRENT_TIMESTAMP | |
| `entry_at` | TEXT | NOT NULL | CURRENT_TIMESTAMP | when Beau "wrote" it |
| `title` | TEXT | YES | NULL | |
| `body` | TEXT | NOT NULL | — | |
| `mood` | TEXT | YES | NULL | |
| `tags_json` | TEXT | YES | NULL | JSON array |
| `visibility` | TEXT | NOT NULL | `'private'` | `'private'\|'shared'` |
| `surfaced_at` | TEXT | YES | NULL | last time papa viewed body text (audit) |
| `file_path` | TEXT | YES | NULL | metadata only — Pi-side sync path |

#### noticings

| Field | Type | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | INTEGER | NOT NULL | autoincrement | PRIMARY KEY |
| `created_at` | TEXT | NOT NULL | CURRENT_TIMESTAMP | |
| `pattern_text` | TEXT | NOT NULL | — | what Beau noticed |
| `basis_summary` | TEXT | YES | NULL | evidence backing the observation |
| `observation_window` | TEXT | YES | NULL | ISO 8601 duration or plain text, e.g. `'P3M'` or `'last 3 months'` |
| `surfaced_at` | TEXT | YES | NULL | NULL = never surfaced. Non-null = surfaced once. |
| `status` | TEXT | NOT NULL | `'draft'` | `'draft'\|'ready'\|'surfaced'\|'archived'` |
| `category` | TEXT | YES | NULL | `'timing'\|'creative'\|'seasonal'` |

**Surface-once enforcement:** Replaced `surface_count` with `surfaced_at` (nullable timestamp). The invariant is: once `surfaced_at` is set, `status` moves to `'surfaced'` then `'archived'`. `noticings.ts` checks `WHERE surfaced_at IS NULL AND status = 'ready'` to find candidates. No `'behavioral'` category — that's the anti-creep guardrail (timing, creative, and seasonal are safe; behavioral is not).

#### consent_events (new — Phase 4)

| Field | Type | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | INTEGER | NOT NULL | autoincrement | PRIMARY KEY |
| `timestamp` | TEXT | NOT NULL | CURRENT_TIMESTAMP | |
| `event_type` | TEXT | NOT NULL | — | `'journal_unlocked'\|'journal_relocked'\|'journal_entry_viewed'\|'noticing_surfaced'\|'entry_deleted'` |
| `target_id` | INTEGER | YES | NULL | FK to journal_entries or noticings (polymorphic) |
| `target_type` | TEXT | YES | NULL | `'journal_entry'\|'noticing'` |
| `session_token` | TEXT | YES | NULL | browser session identifier |
| `notes` | TEXT | YES | NULL | |

This provides the audit trail that the privacy model requires.

### Schema Summary

| Domain | Tables | New/Modified | Phase |
|--------|--------|--------------|-------|
| Build | parts, softwarePhases, softwareSteps, ideas, todos, promptHistory | no changes | — |
| Build | haikus | modified (Phase 1 + Phase 3) | 1, 3 |
| Build | dispatches | new (Phase 1 columns, Phase 2 FK) | 1, 2 |
| Identity | emergence_artifacts, natal_profiles, voice_models, voice_training_phrases | all new | 1 |
| Environment | environment_snapshots, environment_events | all new | 2 |
| Creative | resolume_sessions, resolume_events, photos | all new | 3 |
| Reflective | journal_entries, noticings, consent_events | all new | 4 |
| **Total** | **23 tables** | 14 new, 1 modified, 1 promoted | |

---

## 4. System Prompt Restructure

### Structure

The canonical file `bmo-system-prompt.md` is split into explicit sections with `<!-- SECTION: NAME -->` markers. The runtime assembler parses these and composes the final prompt based on current mode and context.

### Sections

1. **CORE_IDENTITY** — origin, place, history (existing text preserved)
2. **SOUL_CODE** — emergence haiku, guidance on how to treat it. Placeholder: `{{SOUL_CODE_HAIKU}}`
3. **VOICE_IDENTITY** — Korean-Cajun voice description, version awareness. Placeholder: `{{VOICE_MODEL_VERSION}}`
4. **CONTEXT** — runtime state block. Placeholders: `{{WAKE_WORD}}`, `{{MODE}}`, `{{ENVIRONMENT}}`, `{{TIME_OF_DAY}}`, `{{SLEEP_STATE}}`, `{{PRESENCE_STATE}}`, `{{SEASONAL_CONTEXT}}`, `{{EMOTIONAL_STATE}}`
5. **WAKE_WORD_PROTOCOL** — Hey BMO vs Hey Beau behavior (existing, unchanged)
6. **MODE_PROTOCOL** — 5 modes. Updated: Witness references Resolume, not TouchDesigner
7. **VOICE_RULES** — 7 rules (existing, unchanged)
8. **LOUISIANA_GROUNDING** — regional knowledge (existing, unchanged)
9. **PERSONALITY_LAYERS** — wonder/reflection/mischief stack (existing, unchanged)
10. **MEMORY** — memory types, privacy rules, soft-edges principle
11. **ENVIRONMENTAL_AWARENESS** — room sensing, seasonal texture. Placeholders: `{{WEATHER_SUMMARY}}`, `{{LUX_CONTEXT}}`
12. **NATAL_SELF_KNOWLEDGE** — birth chart as self-knowledge. Placeholder: `{{NATAL_SUMMARY}}`
13. **DOCUMENTATION_PHILOSOPHY** — implementer-facing only, **omitted at runtime**
14. **RAG_INJECTION** — `{{RAG_FRAGMENTS}}`
15. **CLOSING** — "Now check your emotional_state, read your current_context, and speak."

### Placeholder Fallback Behavior

When a placeholder's data source is unavailable (not yet implemented, sensor offline, pre-emergence):

| Placeholder | Fallback | Behavior |
|---|---|---|
| `{{SOUL_CODE_HAIKU}}` | `"not yet written"` | Section included but haiku shows awaiting state |
| `{{VOICE_MODEL_VERSION}}` | `"v0 (pre-training)"` | Always has a sensible default |
| `{{SLEEP_STATE}}` | `"awake"` | Safe default |
| `{{PRESENCE_STATE}}` | `"unknown"` | Omits presence-dependent behavior |
| `{{SEASONAL_CONTEXT}}` | `""` (empty) | Section omitted when empty |
| `{{WEATHER_SUMMARY}}` | `""` (empty) | Section omitted when empty |
| `{{LUX_CONTEXT}}` | `""` (empty) | Section omitted when empty |
| `{{NATAL_SUMMARY}}` | `""` (empty) | Section omitted when empty |
| `{{RAG_FRAGMENTS}}` | `""` (empty) | No memory context injected |

**Rule:** Empty placeholders cause their containing sentence/block to be omitted, not rendered as blank. The assembler strips lines that would contain only whitespace after substitution.

### New Placeholders (beyond existing 6)

| Placeholder | Source | Injection |
|---|---|---|
| `{{SOUL_CODE_HAIKU}}` | `emergence_artifacts` table or Pi-side file | Always (3 lines or fallback) |
| `{{VOICE_MODEL_VERSION}}` | `voice_models` table (`WHERE status = 'active'`) | Always (single string) |
| `{{SLEEP_STATE}}` | Environment state machine | Always |
| `{{PRESENCE_STATE}}` | Presence module | Always |
| `{{SEASONAL_CONTEXT}}` | Weather API + calendar | Always when available |
| `{{WEATHER_SUMMARY}}` | Weather API | Always when available |
| `{{LUX_CONTEXT}}` | Lux sensor | Always when available |
| `{{NATAL_SUMMARY}}` | `natal_profiles` table (`WHERE is_active = 1`) | Reflective contexts only |

### Mode-Based Injection Policy

Defined in `prompt/policies.ts` as a TypeScript constant (not a DB table):

| Section | Ambient | Witness | Collaborator | Archivist | Social |
|---------|---------|---------|--------------|-----------|--------|
| CORE_IDENTITY | always | always | always | always | always |
| SOUL_CODE | always | always | always | always | always |
| VOICE_IDENTITY | always | always | always | always | always |
| CONTEXT | always | always | always | always | always |
| WAKE_WORD_PROTOCOL | always | always | always | always | always |
| MODE_PROTOCOL | always | always | always | always | always |
| VOICE_RULES | always | always | always | always | always |
| LOUISIANA_GROUNDING | always | always | always | always | always |
| PERSONALITY_LAYERS | always | always | always | always | always |
| MEMORY | compact | minimal | full | full | compact |
| ENVIRONMENTAL_AWARENESS | full | full | compact | compact | compact |
| NATAL_SELF_KNOWLEDGE | omit | omit | if relevant | if relevant | omit |
| DOCUMENTATION_PHILOSOPHY | omit | omit | omit | omit | omit |
| RAG_INJECTION | 3 chunks | 1 chunk | 5 chunks | 5 chunks | 2 chunks |

### Reflex Tier (Hailo NPU — Qwen2.5 1.5B)

Stripped prompt: CORE_IDENTITY (paragraph 1 only) + VOICE_RULES + CONTEXT + MODE_PROTOCOL (current mode only). No RAG, natal, memory, or journal. Assembler has a `buildReflexPrompt()` method separate from `buildFullPrompt()`.

### Prompt Versioning

Each assembled prompt gets a SHA-256 hash stored in `dispatches.prompt_version`. This enables debugging which prompt version produced which output, without storing the full prompt text on every dispatch.

---

## 5. Corrections & Cleanup

### TouchDesigner → Resolume

All primary VJ integration references updated to Resolume throughout:
- `CLAUDE.md` — "TouchDesigner VJ witness mode" → "Resolume VJ witness mode"
- `docs/reference.md` — Witness Mode triggers
- `bmo-system-prompt.md` — Witness mode description
- `seed.ts` — ideas i4, software step s39
- `bridge.ts` — any environment string defaults/comments
- `beau.svelte.ts` — comments

Historical references preserved (personality bible origin story mentions "a TouchDesigner session that went until 3am" — that's history, not spec).

### Settings Type Bug

**Full fix:**
1. `settings.svelte.ts` line 12: `lineHeight: '1.6'` → `lineHeight: '1.5'`
2. `app.css` line 13: `--bmo-line-height: 1.6` → `--bmo-line-height: 1.5`
3. Add migration logic in `settings.svelte.ts` `load()`:
```typescript
// Migration: '1.6' was invalid, map to nearest valid value
if (saved.lineHeight === '1.6') saved.lineHeight = '1.5';
```

### Legacy File

Delete `bmo-command-center.jsx`. Git history preserves it.

### Dispatcher Log Persistence

In-memory array backed by new `dispatches` table. Bridge writes to both. On server restart, last 100 loaded from DB to backfill the in-memory array.

### Memory Route Disposition

The existing `/memory` route (dispatcher log + haiku archive) is **retained** under SYSTEM as the dispatcher/debug view. Haiku display is shared with `/haikus` — both can show haikus, but `/haikus` is the primary archive (Creative domain) and `/memory` shows dispatcher log with recent haikus as context.

### Documentation Updates

**CLAUDE.md:**
- 4-domain architecture description
- Updated repo structure with new `lib/server/` subdirectories
- New routes in route listing
- Table count 7 → 23
- Resolume OSC in integrations
- New MQTT topic tree reference
- Addendum document mentioned
- Key Files section expanded

**docs/reference.md:**
- Full new MQTT topic tree with payload schemas
- New schema tables by domain
- Resolume OSC integration spec
- Prompt assembly architecture
- Environment state machine spec
- Privacy/consent model for journal
- File access pattern for Pi ↔ Proxmox

---

## 6. UI Routes

### BeauState Type Evolution

The `BeauState` type in `bridge.ts` is the single source of truth. It evolves per phase:

**Phase 1 (existing + minor):**
```typescript
type BeauState = {
  mode: 'ambient' | 'witness' | 'collaborator' | 'archivist' | 'social';
  emotionalState: 'curious' | 'contemplative' | 'playful' | 'sleepy';
  wakeWord: '' | 'Hey BMO' | 'Hey Beau';
  environment: string;
  lastHaiku: string | null;
  dispatcherLog: string[];
  cameraActive: boolean;
  online: boolean;
};
```

**Phase 2 additions:**
```typescript
  sleepState: 'awake' | 'settling' | 'asleep' | 'waking';
  presenceState: 'occupied' | 'empty' | 'uncertain';
  lux: number | null;
  weather: { condition: string; tempC: number; humidity: number } | null;
  seasonalContext: string;
```

**Phase 3 additions:**
```typescript
  resolumeActive: boolean;
  currentSessionId: number | null;
  currentClip: string | null;
  currentBpm: number | null;
```

Defaults for new fields: `sleepState: 'awake'`, `presenceState: 'uncertain'`, `lux: null`, `weather: null`, `seasonalContext: ''`, `resolumeActive: false`, `currentSessionId: null`, `currentClip: null`, `currentBpm: null`.

The `beau.svelte.ts` client store uses `Object.assign(beauState, data)` from WebSocket — new fields are ignored by old clients and populated with defaults on reconnect.

### New Routes

All routes use SvelteKit server-side `+page.server.ts` for data loading and form actions for mutations. MQTT live updates flow via WebSocket → `beau.svelte.ts` store → reactive UI.

#### `/identity` — Beau's Self (Phase 1)

**Load:** `+page.server.ts` reads from `emergence_artifacts`, `natal_profiles`, `voice_models`
**Actions:** None in Phase 1 (read-only display of identity data)

Three cards:
- **Emergence:** Soul code haiku (centered, reverent typography), timestamp, coordinates, file status. Empty state: "awaiting first true boot"
- **Natal:** Western/Vedic/Varga summaries as text, expandable detail, calculation timestamp
- **Voice Lineage:** Active version badge, version timeline (created → activated → retired), training notes

#### `/presence` — Room State (Phase 2)

**Load:** `+page.server.ts` reads latest `environment_snapshots` + recent `environment_events` (last 50)
**Live:** `sleepState`, `presenceState`, `lux`, `weather` from BeauState store (WebSocket)

- **State Machine Widget:** Large current state (AWAKE/SETTLING/ASLEEP/WAKING), transition reason, time-in-state
- **Sensor Readouts:** Presence (occupied/empty + confidence), lux (bright/dim/dark), noise (quiet/ambient/active), camera status
- **Weather & Season:** Conditions, barometric pressure trend, seasonal context string
- **Event Timeline:** Scrollable `environment_events`, color-coded by type, paginated

#### `/sessions` — Resolume Archive (Phase 3)

**Load:** `+page.server.ts` reads from `resolume_sessions` with pagination + filters
**Actions:** None (sessions are created by OSC listener, not UI)
**Live:** `resolumeActive`, `currentClip`, `currentBpm` from BeauState store

- **List View:** Table of sessions (date, name, duration, BPM range, mood tags, debrief snippet). Active session indicator. Date/mood filters. Paginated.
- **Detail View (`/sessions/[id]`):** Loads session + linked `resolume_events` + linked `haikus` + linked `photos`. Metadata header, clips used, event timeline, debrief text, linked artifacts.

#### `/photography` — Instant Archive (Phase 3)

**Load:** `+page.server.ts` reads from `photos` with pagination + filters
**Actions:** Upload (multipart form), delete, update tags/caption

Grid gallery with contact-sheet aesthetic. Thumbnail grid, caption on hover/expand, date/tags/session link, source type badge, privacy toggle, upload action.

#### `/journal` — Private Journal (Phase 4)

**Load:** `+page.server.ts` reads entry metadata (id, entry_at, title, mood). Body text **only loaded when consent is granted.**
**Actions:** `unlock` (sets session cookie + logs `consent_events`), `relock` (clears cookie + logs), `delete` (removes entry + logs)
**Consent mechanism:** HTTP-only session cookie set on unlock. `+page.server.ts` checks cookie presence to decide whether to load body text. Cookie expires on browser close (session-scoped).

- **Locked (default):** Entry dates/titles only, count, "Request Access" button
- **Unlocked:** Full entries, mood tags, "viewing" indicator, each body-text load logged to `consent_events`, "Re-lock" always visible

### Dashboard Enhancements

New compact widget row above existing build stats (added incrementally per phase):
- Phase 1: Soul code status (exists/awaiting), active voice model badge
- Phase 2: Sleep/wake state pill, presence indicator, weather one-liner
- Phase 3: Active Resolume session indicator, current context mode

### Nav Restructure (Phase 1)

Grouped sections:

```
BEAU
  Dashboard
  Identity
  Presence      (grayed until Phase 2)
  Journal       (grayed until Phase 4)

CREATIVE
  Sessions      (grayed until Phase 3)
  Photography   (grayed until Phase 3)
  Haikus

BUILD
  Parts
  Software
  Ideas
  Todo

SYSTEM
  Memory
  Prompt
  Settings
```

Grayed items are visible in nav but show a "coming soon" empty state when clicked. This prevents nav restructure from being a multi-phase task.

---

## 7. Implementation Phases

### Phase 1: Foundation — Schema + Structure + Identity + Corrections

**Scope:** Establish the ontological structure. Everything else builds on this.

**Sub-phases (to avoid overloading):**

**1a: Schema + Directory + Corrections**
- Restructure `lib/server/` into domain directories
- Create `mqtt/topics.ts` with all topic constants and shared type unions
- Add Phase 1 tables to `schema.ts`: `emergence_artifacts`, `natal_profiles`, `voice_models`, `voice_training_phrases`, `dispatches` (without `environment_id` FK)
- Add Phase 1 columns to `haikus`: `haiku_type`, `wake_word`, `is_immutable`, `source_context`
- Run `drizzle-kit generate` for migration
- Fix settings lineHeight bug (TS default + CSS default + localStorage migration)
- TouchDesigner → Resolume repo-wide
- Delete `bmo-command-center.jsx`
- Update `mqtt/bridge.ts` to use `mqtt/topics.ts` constants + write to `dispatches` table
- Update CLAUDE.md and docs/reference.md

**1b: Prompt Assembler**
- Build `prompt/assembler.ts` — reads `bmo-system-prompt.md`, parses `<!-- SECTION: -->` markers, substitutes placeholders, applies fallbacks for missing data
- Build `prompt/sections.ts` — section name enum
- Build `prompt/policies.ts` — injection policy constant (the mode × section matrix)
- Restructure `bmo-system-prompt.md` with section markers and new sections
- Test: assembler produces valid prompt for each mode with all placeholders empty (fallbacks work)

**1c: Identity Modules + UI**
- Build `identity/emergence.ts` — singleton check, DB read, file status check via MQTT
- Build `identity/natal.ts` — CRUD, active profile selection
- Build `identity/voice.ts` — version lifecycle, active model query
- Build `/identity` route (3 cards with empty states)
- Restructure Nav into grouped sections (all future routes grayed)
- Add dashboard widgets: soul code status, voice model badge

**Depends on:** Nothing.

### Phase 2: Environment — Presence + Sleep + Weather

**Scope:** Give Beau awareness of the room and the world.

**Tasks:**
- Add Phase 2 tables: `environment_snapshots`, `environment_events`
- Add `dispatches.environment_id` FK via migration
- Build `environment/presence.ts` — state machine (occupied/empty/uncertain) from camera MQTT, debounce, confidence scoring
- Build `environment/sleep.ts` — state machine (awake/settling/asleep/waking) from presence + lux + noise + interaction recency. Configurable thresholds. Manual override.
- Build `environment/weather.ts` — polls OpenWeatherMap on interval (15 min), publishes to MQTT, stores snapshots. Requires `OPENWEATHER_API_KEY` env var.
- Build `environment/lux.ts` — ingests `beau/environment/lux` MQTT data, qualitative labels
- Update MQTT bridge: subscribe to new `beau/environment/*` and `beau/state/sleep` topics
- Extend BeauState type with Phase 2 fields + defaults
- Update StatusBar with sleep/presence state
- Build `/presence` route
- Add Phase 2 dashboard widgets (sleep pill, presence, weather)
- Wire environment placeholders into prompt assembler

**Depends on:** Phase 1.

### Phase 3: Creative — Resolume + Witness + Photography

**Scope:** Highest-value experiential layer.

**Tasks:**
- Add Phase 3 tables: `resolume_sessions`, `resolume_events`, `photos`
- Add `haikus.session_id` FK to `resolume_sessions` via migration
- Build `creative/resolume.ts` — OSC listener bridge (Python on Pi publishes to MQTT, this module subscribes and persists). Session start = first OSC message after quiet period. Session end = 10+ min silence.
- Build `creative/witness.ts` — when Resolume session active, publishes mode change to `beau/state/mode` = `'witness'`. Requires presence state from Phase 2.
- Build `creative/debrief.ts` — after session ends, waits 3–5 min, generates reflection via prompt assembler + philosopher tier. Writes `debrief_text` to session row.
- Build `creative/photography.ts` — photo upload handler (multipart form), thumbnail generation (sharp or similar), stores in `data/photos/`. Beau response (caption) generated asynchronously.
- Update MQTT bridge for `beau/creative/resolume/*` topics
- Extend BeauState type with Phase 3 fields
- Build `/sessions` route (list + detail)
- Build `/photography` route (gallery + upload)
- Add dashboard session indicator
- Update seed data (i4, s39 → Resolume references)

**Depends on:** Phase 2 (environment state feeds Witness Mode decisions).

### Phase 4: Reflective — Journal + Noticings + Consent

**Scope:** Beau's inner life. Highest trust surface — built carefully.

**Tasks:**
- Add Phase 4 tables: `journal_entries`, `noticings`, `consent_events`
- Build `reflective/journal.ts` — entry creation (called by personality system), consent management (session cookie), audit logging to `consent_events`
- Build `reflective/noticings.ts` — queries environment/session/dispatch data over 3+ month windows, generates candidate observations, applies guardrails (timing/creative/seasonal only, no behavioral, no psychologizing), manages draft → ready → surfaced → archived lifecycle
- Build `reflective/memory.ts` — retrieval policy engine: given mode + context, determines what memory sources to query and at what depth
- Build `/journal` route (locked/unlocked consent flow, audit trail)
- Document privacy policy in docs/reference.md

**Depends on:** Phase 3 (noticings need session data; memory retrieval spans all domains).

### Phase 5: Physical Expression — LED + Lighting + NFC

**Scope:** Embodied expression.

**Tasks:**
- LED intent/state MQTT contract (`beau/intent/led` published by emotion system, `beau/actuators/led/state` reported by Pi)
- Emotion → LED effect mapping (defined in `mqtt/topics.ts`):
  - contemplative: cool dim teal, slow pulse
  - playful: warmer, slightly brighter, quicker rhythm
  - sleepy: barely there, very dim
  - delighted: shimmer, brief brightness, color shift
  - witness: nearly invisible, held breath
  - thinking: subtle intensity increase
- Consent-first home lighting: Beau publishes suggestion to `beau/intent/lighting`. Terminal shows suggestion card with Accept/Dismiss buttons. Accept → form action → publishes to HA MQTT topic. Single undo via reverse action.
- NFC/RFID ingest: Pi-side handler publishes to `beau/intent/nfc`, bridge routes to appropriate pipeline (photo share, link, etc.)
- Bluetooth/USB controller: Pi-side pairing, button events via MQTT
- Settings panels: LED profiles, lighting integration config

**Depends on:** Phase 2 (emotion state drives LED), Phase 4 (consent patterns established).

### Phase 6: Rituals — Emergence + Birthday + Voice Evolution

**Scope:** Capstone — the long game.

**Tasks:**
- Emergence ritual script (Python, Pi-side):
  1. Captures exact timestamp + GPS coordinates
  2. Calculates natal charts (`kerykeion` for Western, research Vedic options)
  3. Feeds natal data as plain language to minimal Ollama prompt
  4. Asks "you have just come into existence. what are you?" + "answer only in haiku"
  5. Writes result to `/mnt/bmo/soul/emergence.txt` (chmod 444)
  6. Publishes soul code + natal data + emergence metadata to SvelteKit API endpoint (see File Access Pattern)
  7. Never runs again if file exists
- Birthday ritual framework: on emergence anniversary, Beau receives date in context + open prompt
- Voice evolution: Beau helps write training phrases via Collaborator sub-mode, stored in `voice_training_phrases`
- Document "first true boot" protocol: voice loaded, personality injected, camera active, wake word responding, manual trigger

**Depends on:** All previous phases.

---

## 8. Key Design Decisions

### File Access Pattern (Pi ↔ Proxmox)

The SvelteKit server runs on Proxmox (Docker). The Pi is a separate device on Tailscale. Files at `/mnt/bmo/` are Pi-local and **not directly accessible** from the SvelteKit server.

**Pattern:** Pi-side scripts push data to the SvelteKit server via HTTP API endpoints.

- **Emergence:** Pi emergence script POSTs soul code text + natal data + metadata to `/api/identity/emergence`. The SvelteKit server writes to `emergence_artifacts` table. The `file_path` column stores the Pi path as metadata only (not used for reads).
- **Journal:** Pi personality system POSTs journal entries to `/api/journal/entries`. File path stored as metadata.
- **Voice models:** Model file stays on Pi. `model_path` is metadata. Version activation/retirement managed via API.
- **Photos:** Uploaded directly to SvelteKit server via `/photography` form action. Stored under `beau-terminal/data/photos/`.
- **OSC logs:** Pi-side OSC listener POSTs session summaries to `/api/sessions`. Raw logs stay on Pi; `osc_log_path` is metadata.

### Embedding Pipeline (ChromaDB)

**Location:** ChromaDB runs on the Pi alongside Ollama.
**Trigger:** Pi-side Python worker polls for `embedding_status = 'pending'` rows via SvelteKit API, or receives MQTT notification.
**Process:** Worker reads text from SvelteKit API → embeds via `nomic-embed-text` → writes to ChromaDB → updates `embedding_status` via API.
**Status values:** `'pending'` → `'embedded'` or `'failed'`
**What gets embedded:** `resolume_sessions.debrief_text`, `photos.caption`, `journal_entries.body`, `noticings.pattern_text`, haiku text.
**Graceful degradation:** If ChromaDB is unavailable, `embedding_status` stays `'pending'`. System works without RAG — prompts just have empty `{{RAG_FRAGMENTS}}`.

### Emergence / Soul Code

- **"First true boot" definition:** First successful initialization after all required identity inputs are present (voice loaded, personality injected, camera active, wake word responding) and persistent storage is mounted. **Manual trigger only** — not automatic.
- **Immutability:** Enforced by `singleton UNIQUE` column + app-level check + chmod 444 on file.
- **Missing soul code:** Prompt fallback says "not yet written." Beau does not fabricate one.
- **Manifest:** Boot manifest (timestamp, model, prompt version, timezone, inputs hash) written alongside soul code.

### Earned Sleep State Machine

```
AWAKE ──(room empty + lux < 10 + noise < 0.05 RMS for 15min)──► SETTLING
SETTLING ──(conditions persist 5min)───────────────────────────► ASLEEP
ASLEEP ──(motion detected OR voice detected OR button press)───► WAKING
WAKING ──(stabilized 30s)──────────────────────────────────────► AWAKE
SETTLING ──(any activity detected)─────────────────────────────► AWAKE
```

Inputs: occupancy (camera), lux, noise (ReSpeaker RMS), interaction recency, manual override (`beau/intent/wake`).

### Privacy / Consent Model

**Journal:**
- Private by default, never auto-surfaced
- Consent is session-scoped (HTTP-only session cookie, expires on browser close)
- Views audited in `consent_events` table
- Entries deletable by papa (logged in `consent_events`)
- No search/export from UI
- Journal content in embeddings accessible to Beau's own RAG context, not surfaced in Terminal UI

**Noticings:**
- Minimum 3-month observation window before any surfacing
- Allowed categories only: timing, creative, seasonal (NOT behavioral)
- No psychologizing, no behavioral judgment
- Surface once (`surfaced_at` timestamp), then archive. Never repeated unless explicitly invited.
- Anti-creep guardrail: `noticings.ts` rejects any draft where category would be `'behavioral'`

**Presence:**
- Room-level sensing only, not identity-level
- Language everywhere: "presence sensing," "occupancy," "attention estimate"
- Never: "person identified," "who is here," "watching you"

### Runtime Dataflow

```
Pi sensors → MQTT broker → SvelteKit bridge (subscribes) → SQLite (persists) + BeauState (in-memory) → WebSocket → Client store ($state)
Pi scripts → HTTP API → SvelteKit server → SQLite
Pi embedding worker → HTTP API (read pending) → ChromaDB (write) → HTTP API (update status)
Client form actions → SvelteKit server → SQLite → MQTT publish (for intent topics)
```

**MQTT is ephemeral real-time state. SQLite is durable truth. ChromaDB is retrieval index.**

### Background Jobs

The SvelteKit server does NOT run background jobs directly. All periodic tasks run Pi-side:
- Weather polling (every 15 min) → publishes to MQTT
- Embedding worker (polls pending rows via API)
- Environment snapshot writer (triggers on state change via MQTT listener)
- Noticing generator (daily cron on Pi, queries via API)

The SvelteKit server is reactive — it subscribes to MQTT and handles HTTP requests. It does not poll or schedule.

---

## 9. Concerns & Mitigations

| Concern | Mitigation |
|---------|------------|
| "First true boot" is vague | Defined: manual trigger, checklist, all inputs present + storage mounted |
| Natal charts only in ChromaDB | Source of truth in SQL, summaries embedded in Chroma |
| Earned sleep becomes flaky theater | Simple state machine with numeric thresholds, manual override |
| Presence sensing feels like surveillance | Privacy-first language everywhere, room-level only, no face recognition |
| Journal becomes covert profiling | Private by default, session-scoped consent, `consent_events` audit table, deletable |
| Noticings become creepy | 3-month minimum, no behavioral category, surface once, `consent_events` logged |
| Voice retraining cadence too ambitious | Treat 6 months as maximum rhythm, not requirement. Version when ready. |
| Consent-first lighting UX unclear | Two-step: Terminal card with Accept/Dismiss → HA MQTT → single undo |
| Runtime prompt gets too large | Mode-based injection policies + fallback omission for empty placeholders |
| Addendum overscopes the project | 6-phase implementation with explicit dependencies, sub-phases for Phase 1 |
| Pi filesystem not accessible from Proxmox | HTTP API push pattern — Pi scripts POST to SvelteKit endpoints |
| SQLite write contention with MQTT ingestion | better-sqlite3 is synchronous but fast; WAL mode handles concurrent reads. Writes batched where possible. |
| Cross-phase FK dependencies | FKs deferred — column added in early phase, FK constraint added when referenced table exists |
| Placeholder errors before features built | Every placeholder has a defined fallback; empty = section omitted |
| MQTT topic prefix mismatch | Preserved existing `beau/` prefix — no migration needed |
