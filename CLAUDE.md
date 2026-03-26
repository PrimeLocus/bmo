# BMO

Physical BMO robot build — Raspberry Pi 5 + Hailo NPU + custom AI personality (Beau).

## Project Overview

- **Personality**: Beau — wonder-first, reflection underneath, mischief at edges. Full spec in `docs/bible/bmo-personality-bible.docx`.
- **Wake words**: "Hey BMO" (public/performative) vs "Hey Beau" (private/warmer) — different system prompt tone injection per wake word.
- **Voice**: Korean-Cajun blend, custom Piper TTS trained via TextyMcSpeechy on Legion RTX 4090.
- **Brain routing**: 4-tier dispatcher (T1 Hailo reflex → T2 Pi poetry → T3 Jetson working-mind → T4 Legion/Mac philosopher). Personality-driven voice casting. See `docs/reference.md` for full routing details.
- **RAG**: ChromaDB + nomic-embed-text from journals, VJ logs, project docs.
- **Integrations**: Home Assistant, Resolume VJ witness mode, Tailscale, MQTT (Mosquitto on Proxmox), BLE wellness devices (Volcano Hybrid, Puffco Peak Pro).

## Architecture Decisions (resolved)

- **Command center**: Beau's Terminal — SvelteKit app in `beau-terminal/`.
- **MQTT broker**: Mosquitto on Proxmox.
- **Persistence**: SQLite via Drizzle ORM (`beau-terminal/data/beau.db`, WAL mode).
- **Deployment**: Self-hosted on Proxmox (Docker). adapter-node builds to `beau-terminal/build/`.
- **BMO CLI**: Root-level workspace bootstrapper (`bmo init`) — scaffolds workspace directories, config, and prompt template.

## Repo Structure

```
bmo/
├── CLAUDE.md
├── package.json              # Workspace root — `bmo` CLI + dev shortcut
├── bin/bmo.js                # CLI entrypoint
├── src/                      # CLI source
│   ├── cli.js                # Command router
│   └── commands/init.js      # `bmo init` — workspace scaffolding
├── test/
│   └── init.test.js          # CLI tests
├── docs/
│   ├── reference.md          # Deep technical reference (MQTT, schema, brain routing)
│   └── bible/                # Beau's Bible — identity, philosophy, canon (see bible/INDEX.md)
│       ├── INDEX.md           # Reading guide + document map
│       ├── bmo-personality-bible.docx  # Core personality spec
│       ├── beau-personality-addendum.docx  # Expanded personality notes
│       ├── beau-full-handoff.docx  # Full project handoff
│       ├── bmo-system-prompt.md    # Canonical system prompt ({{PLACEHOLDER}} syntax)
│       ├── bmo-canon-reference.md  # Adventure Time BMO lore → build mapping
│       ├── beau-philosophy.md      # Ethics, autonomy, emergence framework
│       ├── art-of-ooo-internals.png  # Art book internal design reference
│       └── BMO-Wiki/               # Fandom wiki full page save
│
└── beau-terminal/            # Beau's Terminal — the command center
    ├── package.json
    ├── svelte.config.js      # adapter-node → build/
    ├── vite.config.ts        # Port 4242, Tailwind vite plugin
    ├── drizzle.config.ts     # SQLite, schema path, DB_PATH env override
    ├── data/beau.db          # SQLite database (WAL mode, auto-seeds)
    ├── drizzle/              # Migration files
    ├── static/               # Static assets (robots.txt, favicon)
    ├── src/
    │   ├── app.css           # Design tokens (CSS custom properties)
    │   ├── app.html          # Shell — loads settings from localStorage
    │   ├── hooks.server.ts   # Startup: DB seed + MQTT connect + WebSocket upgrade
    │   ├── lib/
    │   │   ├── components/
    │   │   │   ├── BmoFace.svelte      # Pixel-art SVG face — 10 states, glow borders, blink transitions, driven by beauState.faceState
    │   │   │   ├── CommandPalette.svelte # Ctrl+K command palette — search pages, actions, widgets
    │   │   │   ├── EditBar.svelte      # Edit mode toolbar (Ctrl+E) — font, panel controls
    │   │   │   ├── LinkEditor.svelte   # Inline link editor for entity_links relationships
    │   │   │   ├── Nav.svelte          # Data-driven sidebar nav (TODAY/WORKSHOP/BEAU/SYSTEM groups, CRUD in edit mode)
    │   │   │   ├── Panel.svelte        # Grid panel — drag/resize handles, edit mode controls
    │   │   │   ├── PanelCanvas.svelte  # 12-column CSS grid container, layout persistence
    │   │   │   ├── SitrepModal.svelte  # Sitrep export modal — preview, copy, download markdown
    │   │   │   ├── SpeechBubble.svelte # Speech bubble overlay for BmoFace dialog
    │   │   │   └── StatusBar.svelte    # Top bar — online/offline, mode, faceState, sitrep button, last haiku, bmo:react reactions, thought toast notifications
    │   │   ├── face/
    │   │   │   └── frames.ts           # Pixel-art rect data for all 10 face states (FaceRect arrays, timing, animation config)
    │   │   ├── personality/
    │   │   │   └── rule-meta.ts        # Client-safe signal rule name→delta map (21 rules, no server deps)
    │   │   ├── stores/
    │   │   │   ├── beau.svelte.ts      # WebSocket client → live BeauState ($state)
    │   │   │   ├── editMode.svelte.ts  # Edit mode toggle (Ctrl+E) — global $state
    │   │   │   ├── gridEngine.ts       # Grid collision/compaction engine (push/compact)
    │   │   │   ├── layout.svelte.ts    # Per-page panel layouts — dual persist (localStorage + SQLite)
    │   │   │   ├── navConfig.svelte.ts # Nav items/groups — dual persist, CRUD ops
    │   │   │   └── settings.svelte.ts  # Display settings ($state + localStorage)
    │   │   ├── widgets/
    │   │   │   ├── registry.ts           # Widget registry — 48 widgets, metadata, data kinds
    │   │   │   ├── templates.ts          # Page template definitions — pre-built widget layouts
    │   │   │   ├── WidgetRenderer.svelte # Dynamic widget loader (renders by widgetId)
    │   │   │   ├── WidgetDrawer.svelte   # Side drawer — browse/add widgets in edit mode (shows descriptions)
    │   │   │   ├── WidgetConfigModal.svelte # Per-widget config editor
    │   │   │   ├── terminal/             # 36 terminal widgets (data-bound to Beau systems)
    │   │   │   │   │                     # New: BmoFaceWidget, WorkshopProgressWidget,
    │   │   │   │   │                     #      BlockedWaitingWidget, RecentActivityWidget,
    │   │   │   │   │                     #      BeauVitalsWidget, NextStepsWidget
    │   │   │   │   │                     # Wellness: WellnessSessionWidget, WellnessLogWidget
    │   │   │   │   │                     # Personality: InnerWeatherWidget, VectorGaugeWidget,
    │   │   │   │   │                     #      SignalSourcesWidget, PersonalityTimelineWidget
    │   │   │   │   │                     # Thoughts: PendingThoughtsWidget
    │   │   │   └── content/              # 11 content widgets (clock, markdown, image, etc.)
    │   │   │       │                     # New: QuickCaptureWidget, IntegrationsStatusWidget
    │   │   └── server/
    │   │       ├── sitrep.ts       # Sitrep markdown assembler — queries all tables, snapshots state
    │   │       ├── db/
    │   │       │   ├── activity.ts   # Activity log queries — recent events, entity activity feed
    │   │       │   ├── index.ts      # better-sqlite3 + Drizzle + auto-migrations
    │   │       │   ├── schema.ts     # 40 tables — source of truth for DB schema (re-exports training/)
    │   │       │   └── seed.ts       # 21 parts, 18 phases, 98 steps, 11 ideas, 4 LLM variants
    │   │       ├── mqtt/
    │   │       │   ├── bridge.ts     # MQTT → BeauState → SSE broadcast + thought system orchestration
    │   │       │   └── topics.ts     # MQTT topic constants + type unions (modes, devices, heating states)
    │   │       ├── memory/
    │   │       │   ├── types.ts       # Interfaces, SourceType, CollectionName, constants
    │   │       │   ├── provider.ts    # MemoryProvider — ChromaDB + Ollama pipeline
    │   │       │   ├── retriever.ts   # ChromaDB queries, reranking, fail-open
    │   │       │   ├── indexer.ts     # embedding_queue management, atomic claim, CAS
    │   │       │   ├── chunker.ts     # Bible/document chunking, SHA-256 hashing
    │   │       │   └── index.ts       # Singleton accessor
    │   │       ├── brain/
    │   │       │   ├── types.ts       # BrainRequestV1, BrainResponse, TierConfig, RoutePlan
    │   │       │   ├── registry.ts    # TierRegistry — 4-tier config + Ollama health probing
    │   │       │   ├── router.ts      # Voice caster + context scaler + tier precedence
    │   │       │   ├── prepare.ts     # Request-to-prompt: memory retrieval + prompt assembly → returns PrepareResult (prompt + provenance + retrievals)
    │   │       │   ├── executor.ts    # HTTP calls to Ollama, fallback, quality escalation, onAttempt callback for trace capture
    │   │       │   ├── log.ts         # Dispatch logging to dispatches table
    │   │       │   └── index.ts       # Public dispatch() API + singleton + async trace capture wiring
    │   │       ├── thoughts/
    │   │       │   ├── types.ts       # ThoughtRequest, ThoughtResult, tuning constants
    │   │       │   ├── pressure.ts    # Pressure accumulation engine + novelty detection
    │   │       │   ├── dispatcher.ts  # Type selection + buildBrainRequest (routes through brain/)
    │   │       │   ├── queue.ts       # Priority queue, decay, lifecycle, budget tracking
    │   │       │   └── index.ts       # Singleton accessor for API routes
    │   │       ├── training/
    │   │       │   ├── schema.ts      # 9 training-readiness tables (generation_traces, trace_retrievals, etc.)
    │   │       │   ├── types.ts       # TracePayload, PrepareResult, PromptProvenance, RetrievalProvenance
    │   │       │   ├── eligibility.ts # Training eligibility classifier (consentScope, privacyClass)
    │   │       │   ├── trace-outbox.ts # Async in-memory queue + background SQLite flush (fail-open)
    │   │       │   ├── trace-capture.ts # assembleTracePayload() — pure function, dispatch data → TracePayload
    │   │       │   ├── model-registry.ts # LLM model lineage CRUD (mirrors voice.ts)
    │   │       │   ├── feedback.ts    # recordFeedback() — implicit lifecycle signals to generation_feedback
    │   │       │   └── index.ts       # Singleton: initTraining(), getTraceOutbox(), writeTrace (transactional)
    │   │       ├── identity/
    │   │       │   ├── emergence.ts   # Soul code query + empty state
    │   │       │   ├── natal.ts       # Active natal profile query
    │   │       │   └── voice.ts       # Voice model queries
    │   │       ├── environment/
    │   │       │   ├── presence.ts     # Camera-based room state machine
    │   │       │   ├── sleep.ts        # Earned sleep state machine
    │   │       │   ├── weather.ts      # Weather API + seasonal context
    │   │       │   └── lux.ts          # Light sensor integration
    │   │       ├── creative/
    │   │       │   ├── resolume.ts     # Session lifecycle + OSC bridge
    │   │       │   ├── witness.ts      # Witness mode controller
    │   │       │   ├── debrief.ts      # Post-session reflection scheduler
    │   │       │   └── photography.ts  # Photo validation + naming
    │   │       ├── wellness/
    │   │       │   └── sessions.ts     # WellnessDeviceCoordinator + WellnessSessionManager + parsers
    │   │       ├── reflective/
    │   │       │   ├── journal.ts      # Journal entry management + consent
    │   │       │   ├── noticings.ts    # Noticing lifecycle + anti-creep guardrails
    │   │       │   └── memory.ts       # Retrieval policy engine
    │   │       └── prompt/
    │   │           ├── sections.ts    # Section name definitions
    │   │           ├── policies.ts    # Mode injection matrix + fallbacks
    │   │           └── assembler.ts   # Section parser, placeholder substitution
    │   └── routes/
    │       ├── +layout.svelte        # Shell: Nav + StatusBar + slot
    │       ├── +page.svelte          # Dashboard — live state, build stats
    │       ├── identity/             # Identity — emergence, natal, voice lineage
    │       ├── presence/             # Presence — room state, sleep, environment sensors
    │       ├── parts/                # Parts Tracker — sortable table, inline edit, + ADD PART form
    │       ├── software/             # Software Build — phased checklist, progress bars, HW WAIT gating
    │       ├── ideas/                # Ideas Board — 3-column kanban
    │       ├── todo/                 # Todo — sectioned task list
    │       ├── memory/               # Memory — dispatcher log + haiku archive
    │       ├── prompt/               # Prompt Console — MQTT publisher + history
    │       ├── haikus/               # Haiku Archive — filterable grid
    │       ├── settings/             # Display Settings — font, contrast, weight
    │       ├── sessions/             # Resolume session log + debrief viewer
    │       ├── photography/          # Photo gallery + session photo browser
    │       ├── photos/               # Catch-all — serves photo files from disk
    │       ├── journal/              # Journal — private entries with consent gate
    │       ├── [slug]/               # Custom pages — user-built dashboards at root-level URLs
    │       ├── integrations/         # Integrations status dashboard
    │       ├── api/
    │       │   ├── capture/          # POST quick capture — saves to captures table
    │       │   ├── entity-links/     # CRUD for entity_links cross-entity relationships
    │       │   ├── journal/entries/  # POST new entry, GET metadata list
    │       │   ├── layouts/          # GET/PUT per-page panel grid layouts
    │       │   ├── custom-pages/     # CRUD for custom page definitions
    │       │   ├── search/           # GET global search — pages, widgets, entities
    │       │   ├── sitrep/           # GET sitrep — full markdown situation report export
    │       │   ├── workshop-stats/   # GET workshop progress aggregates
    │       │   ├── widgets/[widgetId]/data/  # GET widget data (for custom page rendering)
    │       │   └── thoughts/surface/ # POST surface a pending thought
    │       └── api/
    │           ├── ...
    │           └── sse/              # SSE endpoint for real-time BeauState streaming
    └── build/                        # Production output (adapter-node)
├── scripts/
│   ├── ollama-listener.js    # Standalone MQTT → Ollama → MQTT thought generation
│   └── package.json          # Minimal deps (mqtt only)
```

## Tech Stack (beau-terminal)

- **Framework**: SvelteKit 2.50+ / Svelte 5 (runes: `$state`, `$derived`, `$props`, `$effect`)
- **Styling**: Tailwind CSS 4 via `@tailwindcss/vite` + CSS custom properties
- **Database**: better-sqlite3 + Drizzle ORM (WAL mode, auto-migration on startup)
- **Real-time**: MQTT.js → server-side BeauState → SSE (`/api/sse`) → `$state` on client
- **Build**: Vite 7, adapter-node, port 4242

## Design System

Dark terminal aesthetic. Monospace Courier New on near-black.

```
--bmo-green:   #00e5a0    (primary accent)
--bmo-bg:      #0a0f0d    (background)
--bmo-surface: #0c1710    (cards, nav, surfaces)
--bmo-border:  #1a3a2a    (borders, dividers)
--bmo-text:    #c8ffd4    (primary text)
--bmo-muted:   #3a6a4a    (secondary text, labels)
```

High contrast mode: `html[data-contrast="high"]`. User-adjustable: font size (14–32px), font weight (400/600), line height (1.5/1.7/1.9).

The `BmoFace` component renders an animated pixel-art SVG face in the Nav sidebar (mini) and as a standalone widget (standard). 10 canon face states (idle, listening, thinking, speaking, delighted, witness, sleepy, unamused, mischievous, protective) driven by `beauState.faceState`. LED glow borders mirror bible §50 color mapping. Face state resolved server-side in `face-state.ts` via priority stack (interaction signals > sleep/mode > personality vector > idle). Blink transitions between states. Thought overlay glow (independent of face state) indicates pending thoughts; click-to-surface dispatches `bmo:thought-surface` event.

## Edit Mode & Panel System

Ctrl+E toggles edit mode globally. Ctrl+K opens the command palette (search pages, run actions, add widgets) from anywhere. In edit mode:
- **Panels** can be dragged (title bar) and resized (edge handles) on a 12-column CSS grid
- **EditBar** shows font size +/− controls, panel visibility toggles, and reset layout button
- **Nav sidebar** becomes editable — rename groups, reorder/hide/show items, add custom pages. Nav is organized into four fixed groups: TODAY, WORKSHOP, BEAU, SYSTEM
- **Widget drawer** lets users browse 48 widgets (with descriptions) and add them to custom pages
- **Page templates** — when creating a custom page, users can pick a pre-built template from `templates.ts` to seed the layout with a curated widget set

### Widget System

48 widgets in two categories:
- **Terminal widgets** (37) — data-bound to Beau systems (beauState, DB queries). Examples: SleepWidget, ModeWidget, PartsTrackerWidget, HaikuArchiveWidget, BmoFaceWidget, WorkshopProgressWidget, BlockedWaitingWidget, RecentActivityWidget, BeauVitalsWidget, NextStepsWidget, WellnessSessionWidget, WellnessLogWidget, InnerWeatherWidget, VectorGaugeWidget, SignalSourcesWidget, PersonalityTimelineWidget, PendingThoughtsWidget
- **Content widgets** (11) — standalone content blocks (Clock, Markdown, Image, Embed, LinkCard, Countdown, Divider, QuickCaptureWidget, IntegrationsStatusWidget)

Widget data kinds:
- `websocket` — reads from `beauState` store directly, no server data needed
- `database` — server-loaded via `loaders.ts` switch, passed as `data` prop
- `none` — config-only or static content

Each widget entry in the registry includes a `description` field displayed in the WidgetDrawer to help users understand what the widget shows before adding it.

### Custom Pages

Users can create custom dashboard pages at root-level URLs (`/mind`, `/session-lounge`, etc.) via + PAGE in edit mode. Custom page definitions stored in `custom_pages` table. Widget instances have IDs like `w:{widgetId}:{nanoid(8)}`. Layout store key format: `page:{slug}`.

### Persistence

Panel layouts and nav config use **dual-tier persistence**: localStorage (primary, instant) + SQLite via `/api/layouts` (backup, debounced 2s). Layout store key format: `bmo-layout:{pageId}` (colon separator). Nav config key: `bmo-nav-config`. Layouts API returns `null` (200) for missing layouts, not 404.

## Conventions

- **Svelte 5 runes only** — no `$:` reactive statements, no `writable()`/`readable()` stores. **GOTCHA:** `structuredClone()` cannot clone `$state` proxy objects — use `JSON.parse(JSON.stringify())` (see `deepCopy` in navConfig.svelte.ts).
- **Form actions** for mutations — SvelteKit `use:enhance`. No client-side fetch for CRUD.
- **CSS custom properties** for all colors — never hardcode hex (except status colors like `#d63031`).
- **Tracking-widest uppercase** for labels and headers — terminal aesthetic.
- **Responsive** — desktop table + mobile card views. Nav collapses to icons on narrow screens.
- **No external UI framework** — hand-built with Tailwind utilities + inline styles for CSS vars.

## Development

```bash
npm start                    # Routes to beau-terminal dev server
# — or —
cd beau-terminal && npm run dev   # http://localhost:4242
```

MQTT broker defaults to `mqtt://localhost:1883` (set `MQTT_URL` env to override). Terminal works offline — MQTT bridge reconnects silently.

Database auto-seeds on startup. Seed is additive: it inserts missing reference rows and advances canonical shipping state without downgrading more-complete local data such as installed parts.

## Key Files

When working on Beau's Terminal, read these first:

- `src/lib/server/db/schema.ts` — all 40 table definitions (31 original + 9 training-readiness)
- `src/lib/server/mqtt/bridge.ts` — MQTT state + subscriber broadcast (consumed by SSE); per-device wellness session Maps; interactionAge tracking; startup orphan recovery; `patchState()` for external state updates
- `src/lib/stores/beau.svelte.ts` — client-side live state (BeauState via SSE EventSource)
- `src/lib/stores/layout.svelte.ts` — per-page panel grid layouts + dual persistence
- `src/lib/stores/editMode.svelte.ts` — edit mode global state (Ctrl+E toggle)
- `src/lib/stores/navConfig.svelte.ts` — nav items/groups config + CRUD
- `src/lib/stores/gridEngine.ts` — grid collision detection + push/compact algorithm
- `src/lib/widgets/registry.ts` — widget registry (48 widgets, metadata, categories)
- `src/lib/widgets/templates.ts` — page template definitions for custom page creation
- `src/lib/server/db/activity.ts` — activity log queries (recent events, entity activity feed)
- `src/lib/components/Panel.svelte` — panel component (drag, resize, edit controls)
- `src/lib/components/PanelCanvas.svelte` — 12-column grid container + layout engine
- `src/app.css` — design tokens
- `src/hooks.server.ts` — startup orchestration
- `src/lib/server/mqtt/topics.ts` — MQTT topic constants and type unions (modes, device types, heating states, face states)
- `src/lib/server/face-state.ts` — face state priority stack resolver + glow config (bible §49/§50) + thought overlay glow
- `src/lib/server/thoughts/pressure.ts` — thought pressure accumulation + novelty detection
- `src/lib/server/thoughts/dispatcher.ts` — thought type selection + buildBrainRequest (routes through brain/)
- `src/lib/server/brain/index.ts` — Brain dispatcher public API: dispatch(), initBrain(), 45s hard cap
- `src/lib/server/brain/router.ts` — Voice caster (nearest centroid) + context scaler + tier precedence
- `src/lib/server/brain/registry.ts` — TierRegistry: 4-tier config, Ollama /api/tags health probing
- `src/lib/server/brain/executor.ts` — HTTP calls to Ollama, fallback chain, quality escalation
- `src/lib/server/brain/prepare.ts` — Request-to-prompt preparation with memory retrieval
- `src/lib/server/brain/types.ts` — BrainRequestV1 envelope, BrainResponse, TierConfig, RoutePlan
- `src/lib/server/thoughts/queue.ts` — priority queue, decay, lifecycle, budget tracking
- `src/lib/face/frames.ts` — pixel-art frame data for all 10 face states
- `src/lib/server/prompt/assembler.ts` — prompt section parser + mode injection
- `src/lib/server/sitrep.ts` — sitrep markdown assembler (queries all tables + live state)
- `src/lib/server/wellness/sessions.ts` — wellness session lifecycle (coordinator, manager, parsers)
- `src/lib/personality/rule-meta.ts` — client-safe signal rule name→delta map (21 rules)
- `src/lib/widgets/terminal/personality-chart.ts` — SVG scale/path utilities for personality timeline
- `src/lib/server/memory/provider.ts` — MemoryProvider: ChromaDB + Ollama embedding pipeline, retrieval, health checks
- `src/lib/server/memory/retriever.ts` — ChromaDB queries, reranking, fail-open retrieval
- `src/lib/server/memory/indexer.ts` — embedding_queue management (upsert, claim, CAS, reconciliation)
- `src/lib/server/training/index.ts` — Training provenance singleton: initTraining(), getTraceOutbox(), transactional writeTrace
- `src/lib/server/training/schema.ts` — 9 training tables (generation_traces, trace_retrievals, generation_feedback, llm_model_variants, etc.)
- `src/lib/server/training/trace-outbox.ts` — Async in-memory outbox: enqueue (array push) + background 2s flush to SQLite
- `src/lib/server/training/trace-capture.ts` — assembleTracePayload() pure function
- `src/lib/server/training/eligibility.ts` — Training eligibility classifier (consentScope × privacyClass → eligibility)
- `src/lib/server/memory/chunker.ts` — Bible/document chunking, SHA-256 content hashing
- `src/lib/server/memory/types.ts` — Memory interfaces, SourceType, CollectionName, constants
- `src/lib/server/reflective/memory.ts` — retrieval policy engine + getCollectionPolicy (mode × caller → collections)

## Deep Reference

For MQTT topics, database schema details, brain routing architecture, and system prompt template variables, see [`docs/reference.md`](docs/reference.md).
