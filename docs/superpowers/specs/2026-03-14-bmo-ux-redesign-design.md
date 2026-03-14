# BMO Terminal UX Redesign — Design Spec

**Date:** 2026-03-14
**Status:** Draft (post-review revision 1)
**Branch:** claude/T082-plan
**Approach:** Incremental Layer Cake (4 phases, each independently shippable)

---

## Guiding Principle

**Make Beau feel alive by making the build feel coherent.**

Every feature must pass this test:
- Does it help the developer know what matters now?
- Does it help capture something quickly?
- Does it help connect one artifact to another?
- Does it help feel Beau's presence in a meaningful way?

If not, cut it or defer it.

---

## Context

Three independent audits (Claude deep codebase analysis, Gemini implementation-focused audit, GPT 5.4 senior UX synthesis) converge on:

1. The architecture is solid (consistent widget API, clean data flow, reliable persistence)
2. The experience reads as "generic dashboard framework" not "BMO companion"
3. The biggest gap is product clarity and workflow cohesion, not styling
4. Build workflow is fragmented across 4 disconnected pages with zero cross-linking
5. No first-run guidance, no daily landing surface, no visible BMO identity
6. The most powerful feature (edit mode / Ctrl+E) is almost undiscoverable

**Current build phase:** Assembly — parts arriving, building the physical robot. The terminal's daily value is tracking what's arrived, knowing what to work on next, and capturing notes/ideas during assembly.

---

## Phase 1: Foundation (Bug Fixes + Nav Restructure)

### 1.1 Bug Fixes

#### BuildStatsWidget Data Shape Mismatch

**Problem:** `loaders.ts` returns `{ parts, phases, steps }` (raw DB arrays) but `BuildStatsWidget` expects `{ partsCount, totalCost, doneSteps, totalSteps }` (pre-aggregated). Widget renders "loading build data..." indefinitely on custom pages.

**Fix:** Update the `build-stats` case in `loaders.ts` to aggregate before returning:

```typescript
case 'build-stats': {
  const parts = db.select().from(partsTable).all();
  const steps = db.select().from(softwareStepsTable).all();
  return {
    partsCount: parts.length,
    totalCost: parts.reduce((sum, p) => sum + p.price, 0),
    doneSteps: steps.filter(s => s.done).length,
    totalSteps: steps.length
  };
}
```

**Files:** `src/lib/server/widgets/loaders.ts`

#### Dispatcher-Log Dead Loader

**Problem:** Registry marks `dispatcher-log` as `dataKind: 'websocket'` but `loaders.ts` has a `dispatcher-log` case. The widget reads from `beauState.dispatcherLog`, not `data`. The loader case is dead code.

**Fix:** Remove the `dispatcher-log` case from `loaders.ts`.

**Files:** `src/lib/server/widgets/loaders.ts`

#### Last-Haiku Dead Config

**Problem:** The `last-haiku` widget has a `count` config field in the registry but the widget ignores it — always shows `beauState.lastHaiku` (single string).

**Fix:** Remove `count` from the `last-haiku` entry's `configSchema` in `registry.ts`.

**Files:** `src/lib/widgets/registry.ts`

#### NatalChartWidget Scope Clarity

**Problem:** Type definition includes `westernChartJson`, `vedicChartJson`, `vargaChartJson` but widget only renders `summary` text. Misleading but not broken.

**Fix:** Add a comment in the widget clarifying chart visualization is deferred. Remove chart JSON fields from the widget's local type (keep DB schema fields for future use).

**Files:** `src/lib/widgets/terminal/NatalChartWidget.svelte`

#### Nav Group Collapse Persistence

**Problem:** Collapse state is in-component `$state({})`, resets on every navigation.

**Fix:** Add `collapsedGroups: string[]` to the nav config schema in `navConfig.svelte.ts`. Write collapse changes through `updateNavConfig()` which triggers dual-tier persistence (localStorage + SQLite). On load, restore from persisted config.

**Default collapsed groups:** `['SYSTEM']` (least-used daily).

**Files:** `src/lib/stores/navConfig.svelte.ts`, `src/lib/components/Nav.svelte`

### 1.2 Navigation Restructure

Reorganize from current 4 groups to new 4 groups:

**Before:**
```
BEAU: Dashboard, Identity, Presence, Journal
CREATIVE: Sessions, Photography, Haikus
BUILD: Parts, Software, Ideas, Todo
SYSTEM: Memory, Prompt, Settings
```

**After:**
```
TODAY: Today (/)
WORKSHOP: Parts, Software, Ideas, Tasks, Sessions, Photography, Haikus
BEAU: Identity, Journal, Memory, Presence
SYSTEM: Prompt, Settings
```

**Key changes:**
- Dashboard → Today (route stays `/`, content redesigned in Phase 2)
- Todo → Tasks (clearer label, route stays `/todo`)
- CREATIVE group dissolved — Sessions, Photography, Haikus move to WORKSHOP (they're build artifacts)
- Memory moves to BEAU (it's Beau's memory)
- TODAY group intentionally has one item — it's the front door
- SYSTEM starts collapsed by default

**Implementation:** Update `DEFAULT_NAV_CONFIG` in `navConfig.svelte.ts`.

**Nav config migration strategy:**
- Add a `version: number` field to the nav config schema (current configs implicitly version 0, new config is version 1)
- On `loadNavConfig()`, check the persisted version:
  - If `version === undefined` (old config): check if config exactly matches old `DEFAULT_NAV_CONFIG` (no customizations). If yes, replace with new defaults. If user has customized (added pages, renamed items, hidden items), preserve their items but remap groups: move items from 'CREATIVE' to 'WORKSHOP', move 'Memory' from 'SYSTEM' to 'BEAU', rename 'BUILD' to 'WORKSHOP', rename 'Dashboard' to 'Today', rename 'Todo' to 'Tasks'. Set version to 1.
  - If `version >= 1`: no migration needed
- For `collapsedGroups` field: default to `['SYSTEM']` if absent in persisted config

**Files:** `src/lib/stores/navConfig.svelte.ts`

---

## Phase 2: Today Page + BMO Face

### 2.1 BMO Face Component

**New file:** `src/lib/components/BmoFace.svelte`

Reactive SVG/CSS component. Expression priority: check `beauState.online` first as an override, then map `beauState.emotionalState`:

| Condition | Expression | Usage |
|-----------|-----------|-------|
| `!beauState.online` | `x . x` | Offline override (highest priority) |
| `emotionalState === 'curious'` | `O . o` | Default/online state |
| `emotionalState === 'playful'` | `^ . ^` | Active/engaged |
| `emotionalState === 'contemplative'` | `— . —` | Thinking/processing |
| `emotionalState === 'sleepy'` | `u . u` | Settling/asleep |
| (unknown state) | `O . o` | Fallback to curious |

**Two sizes via prop:**
- `size="mini"` (~24px) — for Nav logo
- `size="standard"` (~80px) — for Today page hero

**Design:**
- Same octagon clip-path as existing "B" logo
- Face rendered inside the octagon
- Background: `var(--bmo-green)`, face elements: `var(--bmo-bg)`
- Expression change: 0.3s opacity crossfade CSS transition
- No continuous animation. No idle movements. Quiet presence.

**Nav integration:** Replace the "B" text in `Nav.svelte` with `<BmoFace size="mini" />`. The "BEAU / TERMINAL" wordmark below remains unchanged.

**Widget registration:** Register as `bmo-face` widget in `registry.ts`:
- category: `'content'`
- dataKind: `'websocket'`
- defaultPosition: `{ colSpan: 3, rowSpan: 1 }`
- configSchema: `[]`

This lets users place the face on custom pages.

**Files:** `src/lib/components/BmoFace.svelte`, `src/lib/components/Nav.svelte`, `src/lib/widgets/registry.ts`

### 2.2 Today Page Redesign

**File:** `src/routes/+page.svelte`, `src/routes/+page.server.ts`

The `/` route transforms from a 12-panel sensor dump into a daily landing page.

#### Structure (top to bottom):

**1. Hero Strip** (not a panel — semantic page header)
- BMO face (standard, ~80px) left-aligned
- Greeting line beside it, varies by time + mode:
  - Morning (before noon): `"good morning. here's where things stand."`
  - Afternoon: `"afternoon check-in."`
  - Evening (after 6pm): `"wrapping up. here's the day."`
  - Beau asleep: `"beau is resting. the build continues."`
  - Mode-specific variants (Phase 4 enhancement)
- Current mode + emotion as muted labels beside the face
- Full width, compact height (~100px), `var(--bmo-surface)` background, bottom border

**2. Quick Capture Bar** (not a panel — persistent input)
- Single text input (full width minus type selector and button)
- Type selector: `idea` | `task` | `note` (dropdown or segmented control)
- Submit button (or Enter key)
- Routing via **`/api/capture` endpoint** (POST):
  - `idea` → inserts into ideas table (default priority: medium)
  - `task` → inserts into todos table (default section: "Inbox")
  - `note` → inserts into new `captures` table
  - Also calls `logActivity()` for each capture
- **Why an API endpoint instead of form actions:** The capture bar lives on `/` (and as a widget on custom pages), but the mutation targets are in `/ideas` and `/todo` routes. SvelteKit form actions are route-scoped. A shared `/api/capture` endpoint cleanly serves both the Today page bar and the `QuickCaptureWidget` on any custom page. This is a pragmatic exception to the "form actions for mutations" convention.
- Placeholder text: `"capture an idea, task, or note..."`
- Full width, compact height (~48px), subtle top/bottom borders

**3. Dashboard Grid** (PanelCanvas, 12-col)

Default layout:

```
Row 0-1:  WORKSHOP PROGRESS (8 cols)     BLOCKED / WAITING (4 cols)
Row 2-3:  RECENT ACTIVITY (8 cols)       BEAU VITALS (4 cols)
Row 4-5:  NEXT STEPS (6 cols)            LAST HAIKU (6 cols)
```

All panels are draggable/resizable in edit mode (existing PanelCanvas behavior).

### 2.3 New Widgets

#### WorkshopProgressWidget

**Registry:** `workshop-progress`, category `'build'`, dataKind `'database'`

**Data:** Aggregated from parts, software steps, ideas, tasks tables.

**Display:**
- 4 rows, each with label + count + mini progress bar:
  - PARTS: `12/16 received` (delivered+installed / total) — bar colored by ratio
  - SOFTWARE: `28/44 steps` — bar colored by ratio
  - IDEAS: `4 open` (not done) — no bar, just count
  - TASKS: `7 open` — no bar, just count
- Total cost line: `$XXX invested`
- Each row is a clickable link to its page

**Files:** `src/lib/widgets/terminal/WorkshopProgressWidget.svelte`, `src/lib/server/widgets/loaders.ts`, `src/lib/widgets/registry.ts`

#### BlockedWaitingWidget

**Registry:** `blocked-waiting`, category `'build'`, dataKind `'database'`

**Data:** Parts with status `ordered` or `shipped`, sorted by expectedDelivery.

**Display:**
- Compact list, each row: part name + status badge + expected delivery date
- If no items: `"all clear. nothing waiting on anything."`
- Max 8 items, scrollable if more

**Files:** `src/lib/widgets/terminal/BlockedWaitingWidget.svelte`, `src/lib/server/widgets/loaders.ts`, `src/lib/widgets/registry.ts`

#### RecentActivityWidget

**Registry:** `recent-activity`, category `'system'`, dataKind `'database'`

**Data:** Last N entries from `activity_log` table. Config: `limit` (default 10).

**Display:**
- Scrollable list, newest first
- Each row: relative timestamp + entity type icon + one-line summary
- Entity type icons: `⬡` part, `◉` step, `✦` idea, `◫` task, `✿` haiku, `◬` journal
- If no entries: `"nothing yet. the build starts with the first step."`

**Files:** `src/lib/widgets/terminal/RecentActivityWidget.svelte`, `src/lib/server/widgets/loaders.ts`, `src/lib/widgets/registry.ts`

#### BeauVitalsWidget

**Registry:** `beau-vitals`, category `'environment'`, dataKind `'websocket'`

**Display:** Compact vertical stack replacing 8 separate sensor panels:
- `● AWAKE` / `● SLEEPING` (online/sleep combined)
- `MODE: ambient`
- `FEELING: curious`
- `ROOM: occupied` / `ROOM: empty`
- `WEATHER: partly cloudy, 72°F`
- No individual panels for camera, light, season, environment — those stay on `/presence`

**Files:** `src/lib/widgets/terminal/BeauVitalsWidget.svelte`, `src/lib/widgets/registry.ts`

#### NextStepsWidget

**Registry:** `next-steps`, category `'build'`, dataKind `'database'`

**Data:** Curated "do this next" list from multiple sources.

**Display:**
- Oldest shipped parts (arriving soon) — `⬡ Pi Camera — shipped, arrives ~Mar 18`
- Next unchecked software step in the active phase — `◉ Install Hailo driver`
- Highest-priority open tasks — `◫ Wire speaker to GPIO`
- Max 5 items total, prioritized by actionability:
  1. Parts sorted by `expectedDelivery` ascending (soonest arrival first)
  2. Next unchecked step = first `done === false` step in the first phase that has unchecked steps (phases ordered by `phaseOrder`)
  3. Tasks sorted by priority (`high` > `medium` > `low`) then `createdAt` ascending
  4. Interleave: up to 2 parts, 1 software step, 2 tasks (fill remaining slots from any category)
- If nothing: `"clear board. nice work."`

**Files:** `src/lib/widgets/terminal/NextStepsWidget.svelte`, `src/lib/server/widgets/loaders.ts`, `src/lib/widgets/registry.ts`

#### QuickCaptureWidget

**Registry:** `quick-capture`, category `'content'`, dataKind `'none'`

For use on custom pages (the Today page capture bar is a built-in page element, not a widget). Same UX as the Today capture bar but in panel form. Uses the same `/api/capture` endpoint.

**Files:** `src/lib/widgets/content/QuickCaptureWidget.svelte`, `src/lib/widgets/registry.ts`

### 2.4 Workshop Nav Group Stats

Below the "WORKSHOP" group label in `Nav.svelte`, show a muted stat line:

`6/16 parts · 12/44 steps`

- Loaded from **`/api/workshop-stats`** endpoint (GET, returns `{ partsReceived, partsTotal, stepsDone, stepsTotal }`)
- Nav component fetches on mount and on `afterNavigate` (SvelteKit lifecycle)
- Only visible on lg+ (hidden in icon-only mode)
- Cached in a `$state` variable in Nav — no global store needed

**Files:** `src/lib/components/Nav.svelte`, `src/routes/api/workshop-stats/+server.ts`

### 2.5 New Database Tables

#### `captures` table

```typescript
// In schema.ts (Drizzle syntax — consistent with existing 21 tables)
export const captures = sqliteTable('captures', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  text: text('text').notNull(),
  type: text('type').notNull().default('note'),   // 'idea' | 'task' | 'note'
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});
```

For quick capture "note" type only. Ideas and tasks route to their existing tables via `/api/capture`.

#### `activity_log` table

```typescript
export const activityLog = sqliteTable('activity_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  entityType: text('entity_type').notNull(),   // 'part' | 'step' | 'idea' | 'task' | 'haiku' | 'journal' | 'capture'
  entityId: text('entity_id'),              // text — ideas and softwareSteps use text PKs
  action: text('action').notNull(),            // 'created' | 'updated' | 'completed' | 'deleted'
  summary: text('summary').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});
```

**Files:** `src/lib/server/db/schema.ts`, new migration file in `drizzle/`

### 2.6 Activity Logging (ships with Phase 2)

The `activity_log` table must be populated for the `RecentActivityWidget` to be useful. Add `logActivity()` calls in existing form actions **in this phase**, not deferred to Phase 3.

**Helper function** (in `src/lib/server/db/index.ts` or a new `src/lib/server/db/activity.ts`):

```typescript
export function logActivity(
  entityType: string,
  entityId: string | number | null,
  action: string,
  summary: string
) {
  const id = entityId != null ? String(entityId) : null;
  db.insert(activityLog).values({ entityType, entityId: id, action, summary }).run();
}
```

**Insert calls in existing form actions:**

| Form Action | Trigger | Summary |
|------------|---------|---------|
| `/parts?/update` | Status change | `"Pi Camera → delivered"` |
| `/software?/toggle` | Step toggled | `"Install Hailo driver — done"` |
| `/ideas?/add` | New idea | `"New idea: wake word routing"` |
| `/ideas?/toggle` | Idea completed | `"Idea done: wake word routing"` |
| `/todo?/add` | New task | `"New task: wire speaker"` |
| `/todo?/toggle` | Task completed | `"Task done: wire speaker"` |
| MQTT haiku handler | New haiku | `"New haiku written"` |
| `/api/capture` | Quick capture | `"Captured idea: ..."` / `"Captured task: ..."` / `"Captured note: ..."` |
| `/journal?/unlock` | Journal accessed | (no log — privacy) |

**Files:** `src/lib/server/db/activity.ts` (new), all form action files in routes

### 2.7 Server Data Loading

Update `src/routes/+page.server.ts` to load:
- Workshop progress aggregates (parts counts, software step counts, ideas/tasks counts, total cost)
- Blocked/waiting parts (ordered/shipped, sorted by expectedDelivery)
- Recent activity (last 10 from activity_log)
- Next steps (curated from multiple tables)
- Existing beauState data continues via WebSocket

---

## Phase 3: Connective Tissue

### 3.1 Cross-Entity Linking

#### `entity_links` table

```typescript
// In schema.ts (Drizzle syntax)
export const entityLinks = sqliteTable('entity_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceType: text('source_type').notNull(),   // 'part' | 'step' | 'idea' | 'task' | 'session'
  sourceId: text('source_id').notNull(),     // text — ideas and softwareSteps use text PKs
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),     // text — same reason
  relationship: text('relationship').notNull(), // 'blocks' | 'relates-to' | 'inspired-by' | 'used-in'
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});
```

**Uniqueness constraint:** Add a unique index on `(sourceType, sourceId, targetType, targetId, relationship)` to prevent duplicate links.

**Files:** `src/lib/server/db/schema.ts`, new migration

#### LinkEditor Component

**New file:** `src/lib/components/LinkEditor.svelte`

Shared component used on Parts, Ideas, Tasks, and Software pages in edit/expand mode.

**UX:**
- Shows existing links as compact pills: `⬡ Pi Camera (shipped)` or `✦ wake word routing`
- "+ LINK" button opens a type-ahead search
- Search queries a new `/api/search` endpoint (simple LIKE across entity name/text fields)
- Select entity → choose relationship type → save
- Delete link via `✕` on the pill

**Page integration:**
- **Parts (inline edit):** "BLOCKS" field — select software steps this part blocks. When part is ordered/shipped, blocked steps show indicator.
- **Ideas (edit mode):** "RELATES TO" — connect to task, part, or step. Shown as pills below idea text.
- **Tasks (on hover/expand):** "LINKED" — same pill display.
- **Software steps:** `⬡` icon next to steps with a blocking part. Hover shows part name + status.

**Files:** `src/lib/components/LinkEditor.svelte`, `/api/search/+server.ts`, `/api/entity-links/+server.ts`, modifications to Parts/Ideas/Tasks/Software page components

> **Note:** Activity logging (`logActivity()` helper + form action integration) was moved to Phase 2, Section 2.6, so the `RecentActivityWidget` has data from day one.

### 3.2 Edit Mode Discoverability

#### First-Run Hint

On first visit (no `bmo-onboarded` key in localStorage), show a dismissable banner on the Today page:

```
tip: press Ctrl+E to customize panels, add widgets, and build custom pages.  [got it]
```

Clicking "got it" sets `localStorage.setItem('bmo-onboarded', 'true')` and hides the banner.

**Files:** `src/routes/+page.svelte`

#### Empty-State CTA

On custom pages with no widgets, change empty state to include a clickable button:

```
EMPTY PAGE
[+ CUSTOMIZE]
```

Button calls `editModeState.active = true` directly.

**Files:** `src/routes/custom/[slug]/+page.svelte`

#### StatusBar Tooltip

Add `title="Toggle edit mode (Ctrl+E) — drag panels, resize, add widgets"` to the EDIT button.

**Files:** `src/lib/components/StatusBar.svelte`

### 3.4 Mobile-Scoped Experience

On viewports <1024px, the Today page uses a dedicated mobile layout instead of PanelCanvas:

**Mobile stack (top to bottom):**
1. Quick Capture bar (same as desktop)
2. Beau Vitals (compact card)
3. Recent Activity (scrollable list, last 5)
4. Waiting On (shipped/ordered parts only)

No PanelCanvas, no drag/resize, no edit mode on mobile. Small note in mobile settings: `"panel editing available on desktop"`.

**Implementation:** Use a `$state` variable tracking `window.matchMedia('(min-width: 1024px)')` via `$effect` (reactive media query). Conditionally render PanelCanvas (desktop) vs flex stack (mobile) based on this boolean. This is more appropriate than CSS classes alone since the two layouts use fundamentally different component structures (PanelCanvas with panels vs plain flex divs).

**Files:** `src/routes/+page.svelte`

### 3.5 Integrations Hub

A flexible page for wiring up external services, APIs, and sibling projects. This is the "plumbing" surface — where you manage connections between Beau and the outside world.

**New route:** `/integrations`

**Nav placement:** Add to SYSTEM group (below Prompt, above Settings). Icon: `⚡`. Label: `INTEGRATIONS`.

#### Page Structure

**Header:** `"INTEGRATIONS — wiring beau to the world"`

**Integration cards** — each integration is a card showing:
- Name + icon (e.g., `🏠 Home Assistant`, `🎛 Resolume`, `🌐 Tailscale`)
- Status: `● CONNECTED` / `● DISCONNECTED` / `◌ NOT CONFIGURED`
- Endpoint/URL (editable)
- Last seen / last heartbeat timestamp
- Notes field (free text — what this integration does, auth details, quirks)
- `TEST` button — pings the endpoint and reports success/failure

**Pre-seeded integrations** (from CLAUDE.md/reference.md):
| Integration | Type | Default Endpoint |
|------------|------|-----------------|
| MQTT (Mosquitto) | Broker | `mqtt://localhost:1883` |
| Home Assistant | API | `http://homeassistant.local:8123` |
| Resolume Arena | OSC | `osc://localhost:7000` |
| Tailscale | Network | (auto-detected) |
| Ollama (Pi) | LLM API | `http://localhost:11434` |
| Ollama (ThinkStation) | LLM API | `http://thinkstation:11434` |
| ChromaDB | Vector DB | `http://localhost:8000` |
| Piper TTS | Voice | `pipe:///usr/bin/piper` |
| Hailo NPU | Hardware | `/dev/hailo0` |

**"+ INTEGRATION" button** — add a custom integration with:
- Name (text)
- Type: `api` | `mqtt` | `osc` | `websocket` | `hardware` | `pipe` | `custom`
- Endpoint (text)
- Notes (textarea)
- Health check method: `http-get` | `tcp-connect` | `mqtt-ping` | `none`

#### Data Model

**`integrations` table:**

```typescript
export const integrations = sqliteTable('integrations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('⚡'),
  type: text('type').notNull().default('custom'),      // 'api' | 'mqtt' | 'osc' | 'websocket' | 'hardware' | 'pipe' | 'custom'
  endpoint: text('endpoint'),
  healthCheck: text('health_check').default('none'),    // 'http-get' | 'tcp-connect' | 'mqtt-ping' | 'none'
  status: text('status').notNull().default('unknown'),  // 'connected' | 'disconnected' | 'unknown'
  lastSeen: text('last_seen'),
  notes: text('notes'),
  config: text('config'),                               // JSON blob for integration-specific settings
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});
```

The `config` column is a JSON text blob — intentionally schemaless so each integration can store whatever it needs (API keys, auth tokens, custom headers, OSC port mappings, etc.) without requiring schema migrations for every new integration type.

#### Health Checks

Health check runs are **manual only** (via TEST button) — no background polling. Results update `status` and `lastSeen`. This keeps the system simple and avoids noisy network requests.

For MQTT specifically, the existing bridge connection status (`beauState.online`) serves as a live health indicator — shown on the MQTT card without needing a separate check.

#### Integration Widget

Register as `integrations-status` widget in `registry.ts`:
- category: `'system'`
- dataKind: `'database'`
- Compact summary: list of integrations with status dots
- Useful on the Today page or custom dashboards for at-a-glance connectivity

#### Why This Matters

The BMO build involves 9+ external systems that all need to talk to each other. Right now, connection details live in env vars, code comments, and the developer's memory. This page makes the integration map visible, testable, and annotatable — especially valuable when debugging "why isn't X working" or onboarding future-self after a break.

**Files:**
- `src/routes/integrations/+page.svelte` (new)
- `src/routes/integrations/+page.server.ts` (new)
- `src/lib/widgets/terminal/IntegrationsStatusWidget.svelte` (new)
- `src/lib/server/db/schema.ts` (new table)
- `src/lib/widgets/registry.ts` (new widget)
- `src/lib/stores/navConfig.svelte.ts` (add to SYSTEM group)
- New migration for `integrations` table
- `src/lib/server/db/seed.ts` (pre-seed the 9 known integrations)

---

## Phase 4: Delight & Polish

### 4.1 Playful Microcopy

**StatusBar changes:**
- Online: `● ONLINE` → `● AWAKE`
- Offline: `● OFFLINE` → `● SLEEPING`
- MODE and STATE labels unchanged (technical meaning in MQTT)

**New/enhanced empty states:**
- Parts, nothing in transit: `"nothing in transit. the workshop is quiet."`
- Todo, all done: `"clear board. nice work."`
- Recent activity, empty: `"nothing yet. the build starts with the first step."`
- Blocked/waiting, clear: `"all clear. nothing waiting on anything."`

**Today greetings — mode variants (supplement time-based):**
- Witness mode: `"watching closely."`
- Collaborator mode: `"let's build something."`
- Archivist mode: `"recording."`

No renaming of Soul Code, Voice, Identity, or other established terms.

**Files:** `src/lib/components/StatusBar.svelte`, various widget files

### 4.2 Page Templates

Pre-built custom page layouts, accessible from WidgetDrawer.

**New file:** `src/lib/widgets/templates.ts`

```typescript
export const PAGE_TEMPLATES = {
  'vj-session': {
    label: 'VJ Session',
    icon: '▶',
    description: 'Resolume + haiku + prompt console for live sessions',
    layout: [ /* panel definitions */ ]
  },
  'build-focus': {
    label: 'Build Focus',
    icon: '⬡',
    description: 'Parts + software + stats for assembly days',
    layout: [ /* panel definitions */ ]
  },
  'daily-review': {
    label: 'Daily Review',
    icon: '◈',
    description: 'Activity + vitals + haiku + journal for reflection',
    layout: [ /* panel definitions */ ]
  }
};
```

**WidgetDrawer modification:** Add a "TEMPLATES" section at the top of the drawer, above widget categories. Each template shows label + description. Clicking replaces the current page layout after a `confirm()` dialog: `"Replace current layout with {template.label} template? Existing widgets will be removed. This cannot be undone."`

**Files:** `src/lib/widgets/templates.ts`, `src/lib/widgets/WidgetDrawer.svelte`

### 4.3 Command Palette

**New file:** `src/lib/components/CommandPalette.svelte`

`Ctrl+K` opens a modal overlay with a search input.

**Search targets:**
- All nav pages (fuzzy match on label)
- All parts by name
- All ideas by text (first 50 chars)
- All software phases by name
- All custom pages by name

**Built-in commands:**
- `edit mode` → toggles edit mode
- `new page` → opens custom page creation flow
- `capture` → navigates to Today, focuses capture input
- `settings` → navigates to /settings

**Implementation:**
- Mounted in `+layout.svelte`, listens for `Ctrl+K`
- Calls `e.preventDefault()` to suppress browser address bar focus (same guard pattern as existing `Ctrl+E` handler — skip if focus is in a form field)
- Fetches searchable items from `/api/search` endpoint (same one used by LinkEditor)
- Client-side fuzzy matching (simple `includes()` or lightweight fuzzy lib)
- Arrow keys navigate, Enter selects, Escape closes
- Results grouped by type: PAGES, PARTS, IDEAS, PHASES, COMMANDS

**Files:** `src/lib/components/CommandPalette.svelte`, `src/routes/+layout.svelte`, `src/routes/api/search/+server.ts`

### 4.4 Widget Drawer Improvements

**Registry change:** Add `description: string` to `WidgetMeta` type.

Descriptions for all 33+ widgets (examples):
- `sleep` → `"beau's current rest state"`
- `parts-tracker` → `"sortable table with inline editing"`
- `prompt-console` → `"publish MQTT commands with presets"`
- `clock` → `"timezone-aware clock"`

**Drawer UX additions:**
- Search input at top (filters by label + description, simple `includes()`)
- "Already on page" indicator: `✓` badge on widgets already placed on current page
- Templates section at top (from 4.2)

**Files:** `src/lib/widgets/registry.ts`, `src/lib/widgets/WidgetDrawer.svelte`

### 4.5 BMO Speech Bubbles

**New file:** `src/lib/components/SpeechBubble.svelte`

Small notification that appears near the BMO face on the Today page.

**Triggers:**
- Part delivered: `"a package arrived."`
- Software step completed: `"one more step done."`
- New haiku: `"wrote something."`
- Beau wakes: `"good morning."`
- Long idle (>4h since last visit): `"welcome back."`

**Behavior:**
- Shows for 5 seconds, fades out (CSS animation)
- Max 1 in queue — newest wins
- Only on Today page
- Dismissable by click
- No sound

**Data source:** Checks `activity_log` for events since `localStorage.getItem('bmo-last-visit')` on page load. Also reacts to `beauState` changes via `$effect`.

**Last-visit timing:** `bmo-last-visit` is read on mount (before any queries), then updated via `$effect` on `document.visibilitychange` — written when the page becomes hidden (tab switch, minimize, close). This ensures the timestamp reflects when the user *left*, not when they arrived, so new events are correctly detected on return.

**Files:** `src/lib/components/SpeechBubble.svelte`, `src/routes/+page.svelte`

---

## New Files Summary

### Phase 1
- (No new files — modifications only)

### Phase 2
- `src/lib/components/BmoFace.svelte`
- `src/lib/widgets/terminal/WorkshopProgressWidget.svelte`
- `src/lib/widgets/terminal/BlockedWaitingWidget.svelte`
- `src/lib/widgets/terminal/RecentActivityWidget.svelte`
- `src/lib/widgets/terminal/BeauVitalsWidget.svelte`
- `src/lib/widgets/terminal/NextStepsWidget.svelte`
- `src/lib/widgets/content/QuickCaptureWidget.svelte`
- `src/lib/server/db/activity.ts` (logActivity helper)
- `src/routes/api/capture/+server.ts`
- `src/routes/api/workshop-stats/+server.ts`
- New migration for `captures` and `activity_log` tables

### Phase 3
- `src/lib/components/LinkEditor.svelte`
- `src/routes/api/search/+server.ts`
- `src/routes/api/entity-links/+server.ts`
- `src/routes/integrations/+page.svelte`
- `src/routes/integrations/+page.server.ts`
- `src/lib/widgets/terminal/IntegrationsStatusWidget.svelte`
- New migration for `entity_links` and `integrations` tables

### Phase 4
- `src/lib/widgets/templates.ts`
- `src/lib/components/CommandPalette.svelte`
- `src/lib/components/SpeechBubble.svelte`

## Modified Files Summary

### Phase 1
- `src/lib/server/widgets/loaders.ts` (bug fixes)
- `src/lib/widgets/registry.ts` (dead config removal)
- `src/lib/widgets/terminal/NatalChartWidget.svelte` (scope clarity)
- `src/lib/stores/navConfig.svelte.ts` (collapse persistence + nav restructure)
- `src/lib/components/Nav.svelte` (collapse persistence)

### Phase 2
- `src/routes/+page.svelte` (Today page redesign)
- `src/routes/+page.server.ts` (new data loading)
- `src/lib/components/Nav.svelte` (BMO face logo + workshop stats)
- `src/lib/server/db/schema.ts` (new tables)
- `src/lib/widgets/registry.ts` (new widget registrations)
- `src/lib/server/widgets/loaders.ts` (new widget loaders)
- Multiple route form action files (activity logging — `logActivity()` calls)

### Phase 3
- `src/routes/+page.svelte` (first-run hint, mobile layout)
- `src/routes/custom/[slug]/+page.svelte` (empty-state CTA)
- `src/lib/components/StatusBar.svelte` (tooltip)
- `src/lib/server/db/schema.ts` (entity_links + integrations tables)
- `src/lib/server/db/seed.ts` (pre-seed 9 known integrations)
- `src/lib/stores/navConfig.svelte.ts` (add Integrations to SYSTEM group)
- `src/lib/widgets/registry.ts` (integrations-status widget)

### Phase 4
- `src/lib/components/StatusBar.svelte` (microcopy)
- `src/lib/widgets/WidgetDrawer.svelte` (search, descriptions, templates)
- `src/lib/widgets/registry.ts` (descriptions field)
- `src/routes/+layout.svelte` (command palette mount)
- Various widget files (empty state copy)
- `CLAUDE.md` (update widget count from 33 to 40, add new tables to schema count)
