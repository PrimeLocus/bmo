# BMO Terminal UX Redesign — Implementation Plan

> **STATUS: COMPLETE** — All 4 phases shipped as of 2026-03-18. Council audit fixes and Beau reactions also landed. Checkboxes reflect pre-implementation state; see git log for actual delivery history.

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Beau's Terminal from a generic dashboard into a coherent BMO companion with a daily landing page, unified build workflow, visible BMO identity, and flexible integrations hub.

**Architecture:** 4-phase incremental delivery. Each phase ships independently. Phase 1 fixes bugs and restructures nav. Phase 2 builds the Today page with 6 new widgets, BMO face, and activity logging. Phase 3 adds cross-entity linking, integrations hub, edit mode discoverability, and mobile layout. Phase 4 adds delight: command palette, templates, speech bubbles, and widget drawer improvements.

**Tech Stack:** SvelteKit 2.50+ / Svelte 5 runes, Tailwind CSS 4, better-sqlite3 + Drizzle ORM, MQTT.js

**Spec:** `docs/superpowers/specs/2026-03-14-bmo-ux-redesign-design.md`

**Key conventions:**
- Svelte 5 runes only (`$state`, `$derived`, `$props`, `$effect`) — no `$:` or `writable()`
- CSS custom properties for all colors (`var(--bmo-*)`) — never hardcode hex
- Form actions for mutations via `use:enhance` (exception: `/api/capture` endpoint)
- ALL CAPS + `letter-spacing: 2px` for labels and headers
- `font-family: 'Courier New', Courier, monospace` everywhere

**Testing approach:** No test suite exists for beau-terminal. Each task includes manual verification: run dev server (`cd beau-terminal && npm run dev`), check behavior at `http://localhost:4242`. DB auto-migrates on startup.

---

## Chunk 1: Phase 1 — Foundation

### Task 1: Fix BuildStatsWidget loader

**Files:**
- Modify: `beau-terminal/src/lib/server/widgets/loaders.ts:53-58`

- [ ] **Step 1: Read the current `build-stats` case**

Open `beau-terminal/src/lib/server/widgets/loaders.ts`. Lines 53–58 return raw arrays:
```typescript
case 'build-stats': {
  const parts = db.select().from(schema.parts).all();
  const phases = db.select().from(schema.softwarePhases).all();
  const steps = db.select().from(schema.softwareSteps).all();
  return { parts, phases, steps };
}
```

- [ ] **Step 2: Replace with aggregated return shape**

Change lines 53–58 to:
```typescript
case 'build-stats': {
  const parts = db.select().from(schema.parts).all();
  const steps = db.select().from(schema.softwareSteps).all();
  return {
    partsCount: parts.length,
    totalCost: parts.reduce((sum, p) => sum + p.price, 0),
    doneSteps: steps.filter(s => s.done).length,
    totalSteps: steps.length
  };
}
```

Note: `price` column is `notNull()` with `default(0)` in schema — no fallback needed.

- [ ] **Step 3: Verify — run dev server, add BuildStatsWidget to a custom page**

```bash
cd beau-terminal && npm run dev
```
Navigate to a custom page, enter edit mode (Ctrl+E), add "Build Stats" widget. Confirm it renders parts count, cost, and step progress instead of showing "loading build data..." forever.

- [ ] **Step 4: Commit**

```bash
git add beau-terminal/src/lib/server/widgets/loaders.ts
git commit -m "fix: aggregate build-stats loader to match widget expected shape"
```

---

### Task 2: Remove dead code (dispatcher-log loader + last-haiku config)

**Files:**
- Modify: `beau-terminal/src/lib/server/widgets/loaders.ts:80-85`
- Modify: `beau-terminal/src/lib/widgets/registry.ts:199-215`

- [ ] **Step 1: Remove dispatcher-log case from loaders.ts**

Delete lines 80–85 (the `case 'dispatcher-log':` block). The widget is `dataKind: 'websocket'` in the registry and reads from `beauState.dispatcherLog` — this loader case is never reached.

- [ ] **Step 2: Remove `count` from last-haiku configSchema in registry.ts**

Find the `'last-haiku'` entry (around line 199). Change `configSchema` from:
```typescript
configSchema: [
  { key: 'count', label: 'Count', type: 'number', default: 1 }
],
```
to:
```typescript
configSchema: [],
```

- [ ] **Step 3: Verify — dev server still starts, no regressions**

```bash
cd beau-terminal && npm run dev
```
Check dashboard loads. Check haiku widget on any page still renders. Check dispatcher log on `/memory` page still works.

- [ ] **Step 4: Commit**

```bash
git add beau-terminal/src/lib/server/widgets/loaders.ts beau-terminal/src/lib/widgets/registry.ts
git commit -m "fix: remove dead dispatcher-log loader case and last-haiku count config"
```

---

### Task 3: Clarify NatalChartWidget scope

**Files:**
- Modify: `beau-terminal/src/lib/widgets/terminal/NatalChartWidget.svelte:2-21`

- [ ] **Step 1: Simplify the inline NatalProfile type**

In the script block (lines 2–21), the inline `NatalProfile` type includes `westernChartJson`, `vedicChartJson`, `vargaChartJson`. Narrow the type to what the widget actually uses:

```typescript
type NatalProfile = {
  locationName: string | null;
  birthTimestamp: string | null;
  timezone: string | null;
  summaryText: string | null;
  latitude: number | null;
  longitude: number | null;
  version: number | null;
  // Chart visualization fields (westernChartJson, vedicChartJson, vargaChartJson)
  // exist in DB schema but are not rendered by this widget — deferred to future phase
};
```

- [ ] **Step 2: Verify — dev server still starts, natal chart widget renders**

```bash
cd beau-terminal && npm run dev
```
Navigate to `/identity` or add the NatalChart widget to a custom page. Confirm it still renders the summary text.

- [ ] **Step 3: Commit**

```bash
git add beau-terminal/src/lib/widgets/terminal/NatalChartWidget.svelte
git commit -m "docs: clarify NatalChartWidget type — chart visualization deferred"
```

---

### Task 4: Add nav collapse persistence

**Files:**
- Modify: `beau-terminal/src/lib/stores/navConfig.svelte.ts:4-16,18-40`
- Modify: `beau-terminal/src/lib/components/Nav.svelte:22-25`

- [ ] **Step 1: Add `collapsedGroups` to NavConfig type**

In `navConfig.svelte.ts`, add to the `NavConfig` type (around line 4-16):
```typescript
export type NavConfig = {
  version?: number;
  groups: string[];
  items: NavItem[];
  collapsedGroups?: string[];
};
```

- [ ] **Step 2: Add `collapsedGroups` default to DEFAULT_NAV_CONFIG**

In the `DEFAULT_NAV_CONFIG` object (around line 18-40), add:
```typescript
collapsedGroups: ['SYSTEM'],
```

- [ ] **Step 3: Add collapse persistence helpers**

Add two new exported functions after the existing helpers:
```typescript
export function toggleGroupCollapse(group: string) {
  const config = getNavConfig();
  const collapsed = config.collapsedGroups ?? [];
  const updated = collapsed.includes(group)
    ? collapsed.filter(g => g !== group)
    : [...collapsed, group];
  saveNavConfig({ ...config, collapsedGroups: updated });
}

export function isGroupCollapsed(group: string): boolean {
  const config = getNavConfig();
  return (config.collapsedGroups ?? []).includes(group);
}
```

- [ ] **Step 4: Update Nav.svelte to use persisted collapse state**

In `Nav.svelte`, replace the in-component collapse state (line 22-25):
```typescript
// BEFORE:
let collapsed: Record<string, boolean> = $state({});
function toggle(heading: string) {
  collapsed[heading] = !collapsed[heading];
}
```

With:
```typescript
import { toggleGroupCollapse, isGroupCollapsed } from '$lib/stores/navConfig.svelte.js';

function toggle(heading: string) {
  toggleGroupCollapse(heading);
}
```

Then in the template, replace references to `collapsed[group]` with `isGroupCollapsed(group)`.

- [ ] **Step 5: Verify — collapse a group, navigate to another page, confirm it stays collapsed**

```bash
cd beau-terminal && npm run dev
```
Click SYSTEM group heading to collapse it. Navigate to `/parts`. Confirm SYSTEM is still collapsed. Refresh the page — confirm still collapsed (persisted in localStorage).

- [ ] **Step 6: Commit**

```bash
git add beau-terminal/src/lib/stores/navConfig.svelte.ts beau-terminal/src/lib/components/Nav.svelte
git commit -m "feat: persist nav group collapse state via dual-tier storage"
```

---

### Task 5: Restructure navigation to TODAY/WORKSHOP/BEAU/SYSTEM

**Files:**
- Modify: `beau-terminal/src/lib/stores/navConfig.svelte.ts:18-40,117-139`

- [ ] **Step 1: Define the new DEFAULT_NAV_CONFIG**

Replace the existing `DEFAULT_NAV_CONFIG` (lines 18-40) with:
```typescript
const DEFAULT_NAV_CONFIG: NavConfig = {
  version: 1,
  groups: ['TODAY', 'WORKSHOP', 'BEAU', 'SYSTEM'],
  collapsedGroups: ['SYSTEM'],
  items: [
    { id: '/',              label: 'TODAY',        icon: '◈', group: 'TODAY',    sortOrder: 0, hidden: false },
    { id: '/parts',         label: 'PARTS',        icon: '⬡', group: 'WORKSHOP', sortOrder: 0, hidden: false },
    { id: '/software',      label: 'SOFTWARE',     icon: '◉', group: 'WORKSHOP', sortOrder: 1, hidden: false },
    { id: '/ideas',         label: 'IDEAS',        icon: '✦', group: 'WORKSHOP', sortOrder: 2, hidden: false },
    { id: '/todo',          label: 'TASKS',        icon: '◫', group: 'WORKSHOP', sortOrder: 3, hidden: false },
    { id: '/sessions',      label: 'SESSIONS',     icon: '▶', group: 'WORKSHOP', sortOrder: 4, hidden: false },
    { id: '/photography',   label: 'PHOTOGRAPHY',  icon: '◻', group: 'WORKSHOP', sortOrder: 5, hidden: false },
    { id: '/haikus',        label: 'HAIKUS',       icon: '✿', group: 'WORKSHOP', sortOrder: 6, hidden: false },
    { id: '/identity',      label: 'IDENTITY',     icon: '◇', group: 'BEAU',     sortOrder: 0, hidden: false },
    { id: '/journal',       label: 'JOURNAL',      icon: '◬', group: 'BEAU',     sortOrder: 1, hidden: false },
    { id: '/memory',        label: 'MEMORY',       icon: '◎', group: 'BEAU',     sortOrder: 2, hidden: false },
    { id: '/presence',      label: 'PRESENCE',     icon: '◉', group: 'BEAU',     sortOrder: 3, hidden: false },
    { id: '/prompt',        label: 'PROMPT',       icon: '≋', group: 'SYSTEM',   sortOrder: 0, hidden: false },
    { id: '/settings',      label: 'SETTINGS',     icon: '⚙', group: 'SYSTEM',   sortOrder: 1, hidden: false },
  ]
};
```

- [ ] **Step 2: Add nav config migration logic**

In `loadNavConfig()` (around lines 117-139), after loading persisted config, add migration:

```typescript
function migrateNavConfig(config: NavConfig): NavConfig {
  if (config.version && config.version >= 1) return config;

  // Check if user customized (added/removed/renamed items beyond defaults)
  const oldDefaultIds = ['/', '/identity', '/presence', '/journal', '/sessions',
    '/photography', '/haikus', '/parts', '/software', '/ideas', '/todo',
    '/memory', '/prompt', '/settings'];
  const hasCustomItems = config.items.some(item => !oldDefaultIds.includes(item.id));

  if (!hasCustomItems) {
    // No customizations — replace entirely
    return { ...DEFAULT_NAV_CONFIG };
  }

  // Preserve customizations but remap groups
  const groupMap: Record<string, string> = {
    'CREATIVE': 'WORKSHOP',
    'BUILD': 'WORKSHOP',
  };
  const itemGroupMap: Record<string, string> = {
    '/': 'TODAY',
    '/memory': 'BEAU',
  };
  const labelMap: Record<string, string> = {
    'DASHBOARD': 'TODAY',
    'TODO': 'TASKS',
  };

  const migratedItems = config.items.map(item => ({
    ...item,
    group: itemGroupMap[item.id] ?? groupMap[item.group] ?? item.group,
    label: labelMap[item.label] ?? item.label,
  }));

  return {
    version: 1,
    groups: ['TODAY', 'WORKSHOP', 'BEAU', 'SYSTEM'],
    collapsedGroups: config.collapsedGroups ?? ['SYSTEM'],
    items: migratedItems,
  };
}
```

Call this in `loadNavConfig()` after loading but before returning:
```typescript
const loaded = /* existing parse logic */;
const migrated = migrateNavConfig(loaded);
if (migrated !== loaded) {
  saveNavConfig(migrated); // Persist the migration
}
return migrated;
```

- [ ] **Step 3: Verify — clear localStorage, reload, confirm new nav groups**

```bash
cd beau-terminal && npm run dev
```
Open DevTools → Application → localStorage. Delete `bmo-nav-config`. Reload. Confirm nav shows: TODAY (1 item), WORKSHOP (7 items), BEAU (4 items), SYSTEM (2 items, collapsed).

- [ ] **Step 4: Verify — set old config in localStorage, reload, confirm migration**

In DevTools console, paste the old config shape (with CREATIVE/BUILD groups) into localStorage under `bmo-nav-config`. Reload. Confirm items are remapped to new groups.

- [ ] **Step 5: Commit**

```bash
git add beau-terminal/src/lib/stores/navConfig.svelte.ts
git commit -m "feat: restructure nav to TODAY/WORKSHOP/BEAU/SYSTEM with migration"
```

---

## Chunk 2: Phase 2a — Database, Activity Logging, API Endpoints

### Task 6: Add `captures` and `activity_log` tables to schema

**Files:**
- Modify: `beau-terminal/src/lib/server/db/schema.ts` (append after line 271)

- [ ] **Step 1: Add the two new table definitions**

Append at the end of `schema.ts`:

```typescript
// ─── Quick Capture (Phase 2) ───────────────────────────────────────────────────

export const captures = sqliteTable('captures', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  text: text('text').notNull(),
  type: text('type').notNull().default('note'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});

// ─── Activity Log (Phase 2) ───────────────────────────────────────────────────

export const activityLog = sqliteTable('activity_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),              // text to match text PKs on ideas/steps tables
  action: text('action').notNull(),
  summary: text('summary').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});
```

- [ ] **Step 2: Generate migration**

Drizzle requires migration files to apply schema changes. Generate them:
```bash
cd beau-terminal && npx drizzle-kit generate
```
This creates a SQL migration file in `drizzle/`. Review the generated SQL to confirm it creates both tables.

- [ ] **Step 3: Verify — dev server starts, tables auto-migrate**

```bash
cd beau-terminal && npm run dev
```
Check server logs for successful migration. Optionally verify with: `sqlite3 data/beau.db ".tables"` — should show `captures` and `activity_log`.

- [ ] **Step 4: Commit**

```bash
git add beau-terminal/src/lib/server/db/schema.ts beau-terminal/drizzle/
git commit -m "feat: add captures and activity_log tables for Phase 2"
```

---

### Task 7: Create `logActivity` helper

**Files:**
- Create: `beau-terminal/src/lib/server/db/activity.ts`

- [ ] **Step 1: Create the activity logging helper**

```typescript
import { db } from './index.js';
import { activityLog } from './schema.js';

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

Note: `entityId` is `text` in the schema to accommodate both `integer` PKs (parts, todos) and `text` PKs (ideas, softwareSteps). The helper stringifies all IDs.

- [ ] **Step 2: Verify — import and call from a test script or check types compile**

```bash
cd beau-terminal && npm run dev
```
Confirm dev server starts without type errors.

- [ ] **Step 3: Commit**

```bash
git add beau-terminal/src/lib/server/db/activity.ts
git commit -m "feat: add logActivity helper for activity_log table"
```

---

### Task 8: Wire `logActivity` into existing form actions and MQTT handler

**Files:**
- Modify: `beau-terminal/src/routes/parts/+page.server.ts`
- Modify: `beau-terminal/src/routes/software/+page.server.ts`
- Modify: `beau-terminal/src/routes/ideas/+page.server.ts`
- Modify: `beau-terminal/src/routes/todo/+page.server.ts`
- Modify: `beau-terminal/src/lib/server/mqtt/bridge.ts`

- [ ] **Step 1: Read each form action file to find the exact action handlers**

Read each file to identify where `update`, `toggle`, `add`, `delete` actions are defined.

- [ ] **Step 2: Add logActivity call in parts update action**

In `/parts/+page.server.ts`, find the `update` action. The action has `id` from form data. After the `db.update` call, query the part to get its name for the summary:
```typescript
import { logActivity } from '$lib/server/db/activity.js';
import { eq } from 'drizzle-orm';
// ... inside the update action, after the db.update call:
const part = db.select().from(parts).where(eq(parts.id, id)).get();
logActivity('part', id, 'updated', `${part?.name ?? 'unknown'} → ${status}`);
```

Note: The parts table uses `integer('id')` auto-increment PK, so `id` is a number. Check form data parsing — it may be `Number(form.get('id'))`.

- [ ] **Step 3: Add logActivity call in software toggle action**

In `/software/+page.server.ts`, find the `toggle` action. The action has `id` (string, text PK) and `done` (current state from form). After the `db.update`:
```typescript
import { logActivity } from '$lib/server/db/activity.js';
import { eq } from 'drizzle-orm';
// ... after the db.update:
const step = db.select().from(softwareSteps).where(eq(softwareSteps.id, id)).get();
logActivity('step', id, !done ? 'completed' : 'updated', `${step?.text ?? 'step'} — ${!done ? 'done' : 'undone'}`);
```

Note: `done` from form data is the *previous* state. The DB update sets `!done`. So `!done` is the new state.

- [ ] **Step 4: Add logActivity calls in ideas actions**

In `/ideas/+page.server.ts`. The `id` is `form.get('id') as string` (text PK). For toggle/delete, query the idea first to get text:
```typescript
import { logActivity } from '$lib/server/db/activity.js';
import { eq } from 'drizzle-orm';
```
- `add` action: after insert, `logActivity('idea', id, 'created', 'New idea: ' + text.substring(0, 60))`
  (where `text` is the form data text field and `id` is the generated ID)
- `toggle` action: before update, fetch text:
  ```typescript
  const idea = db.select().from(ideas).where(eq(ideas.id, id)).get();
  // after db.update:
  logActivity('idea', id, !done ? 'completed' : 'updated',
    (!done ? 'Idea done: ' : 'Idea reopened: ') + (idea?.text ?? '').substring(0, 60));
  ```
- `delete` action: before delete, fetch text:
  ```typescript
  const idea = db.select().from(ideas).where(eq(ideas.id, id)).get();
  // after db.delete:
  logActivity('idea', id, 'deleted', 'Deleted idea: ' + (idea?.text ?? '').substring(0, 60));
  ```

- [ ] **Step 5: Add logActivity calls in todo actions**

In `/todo/+page.server.ts`. The `id` is `Number(form.get('id'))` (integer PK). Same pattern — query for text:
```typescript
import { logActivity } from '$lib/server/db/activity.js';
import { eq } from 'drizzle-orm';
```
- `add` action: after insert, `logActivity('task', null, 'created', 'New task: ' + text.substring(0, 60))`
  (use `result.lastInsertRowid` for the entity ID if available)
- `toggle` action:
  ```typescript
  const todo = db.select().from(todos).where(eq(todos.id, id)).get();
  // after db.update:
  logActivity('task', id, !done ? 'completed' : 'updated',
    (!done ? 'Task done: ' : 'Task reopened: ') + (todo?.text ?? '').substring(0, 60));
  ```
- `delete` action:
  ```typescript
  const todo = db.select().from(todos).where(eq(todos.id, id)).get();
  // after db.delete:
  logActivity('task', id, 'deleted', 'Deleted task: ' + (todo?.text ?? '').substring(0, 60));
  ```

- [ ] **Step 6: Add logActivity call in MQTT haiku handler**

In `beau-terminal/src/lib/server/mqtt/bridge.ts`, find where new haikus are received (the haiku topic handler). After updating `beauState.lastHaiku`, add:
```typescript
import { logActivity } from '$lib/server/db/activity.js';
// ... in the haiku message handler:
logActivity('haiku', null, 'created', 'New haiku written');
```

- [ ] **Step 6: Verify — add/toggle items on each page, check activity_log**

```bash
cd beau-terminal && npm run dev
```
Toggle a software step. Add an idea. Complete a task. Then check:
```bash
sqlite3 data/beau.db "SELECT * FROM activity_log ORDER BY id DESC LIMIT 5;"
```

- [ ] **Step 7: Commit**

```bash
git add beau-terminal/src/routes/parts/+page.server.ts beau-terminal/src/routes/software/+page.server.ts beau-terminal/src/routes/ideas/+page.server.ts beau-terminal/src/routes/todo/+page.server.ts beau-terminal/src/lib/server/mqtt/bridge.ts
git commit -m "feat: wire logActivity into form actions and MQTT haiku handler"
```

---

### Task 9: Create `/api/capture` endpoint

**Files:**
- Create: `beau-terminal/src/routes/api/capture/+server.ts`

- [ ] **Step 1: Create the capture endpoint**

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { captures, ideas, todos } from '$lib/server/db/schema.js';
import { logActivity } from '$lib/server/db/activity.js';
import { nanoid } from 'nanoid';

export const POST: RequestHandler = async ({ request }) => {
  const { text, type } = await request.json();

  if (!text || !type) {
    return json({ error: 'text and type required' }, { status: 400 });
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return json({ error: 'text cannot be empty' }, { status: 400 });
  }

  switch (type) {
    case 'idea': {
      const id = nanoid(8);
      db.insert(ideas).values({
        id,
        text: trimmed,
        priority: 'medium',
        done: false,
        links: '[]'
      }).run();
      logActivity('idea', null, 'created', `Captured idea: ${trimmed.substring(0, 60)}`);
      return json({ ok: true, type: 'idea', id });
    }
    case 'task': {
      // todos table uses integer auto-increment PK — do NOT pass id
      // todos.createdAt is integer('created_at', { mode: 'timestamp' }).notNull() with no default
      const result = db.insert(todos).values({
        text: trimmed,
        section: 'Inbox',
        priority: 'medium',
        done: false,
        sortOrder: 0,
        createdAt: new Date()
      }).run();
      const taskId = Number(result.lastInsertRowid);
      logActivity('task', taskId, 'created', `Captured task: ${trimmed.substring(0, 60)}`);
      return json({ ok: true, type: 'task', id: taskId });
    }
    case 'note': {
      db.insert(captures).values({ text: trimmed, type: 'note' }).run();
      logActivity('capture', null, 'created', `Captured note: ${trimmed.substring(0, 60)}`);
      return json({ ok: true, type: 'note' });
    }
    default:
      return json({ error: 'type must be idea, task, or note' }, { status: 400 });
  }
};
```

Note: `ideas` uses `text('id').primaryKey()` with nanoid. `todos` uses `integer('id').primaryKey({ autoIncrement: true })` — never pass an `id` for todos. The `todos.createdAt` column is `notNull()` with no default, so it must be provided explicitly. Check the actual `ideas` schema for other required fields and adjust if needed (e.g., if `ideas` has additional `notNull()` columns without defaults).

- [ ] **Step 2: Verify with curl**

```bash
curl -X POST http://localhost:4242/api/capture \
  -H 'Content-Type: application/json' \
  -d '{"text": "test capture idea", "type": "idea"}'
```

Check response is `{ "ok": true, "type": "idea", "id": "..." }`. Verify idea appears on `/ideas` page.

- [ ] **Step 3: Commit**

```bash
git add beau-terminal/src/routes/api/capture/+server.ts
git commit -m "feat: add /api/capture endpoint for quick capture (idea/task/note)"
```

---

### Task 10: Create `/api/workshop-stats` endpoint

**Files:**
- Create: `beau-terminal/src/routes/api/workshop-stats/+server.ts`

- [ ] **Step 1: Create the endpoint**

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { parts, softwareSteps } from '$lib/server/db/schema.js';

export const GET: RequestHandler = async () => {
  const allParts = db.select().from(parts).all();
  const allSteps = db.select().from(softwareSteps).all();

  const received = allParts.filter(p =>
    p.status === 'delivered' || p.status === 'installed'
  ).length;

  return json({
    partsReceived: received,
    partsTotal: allParts.length,
    stepsDone: allSteps.filter(s => s.done).length,
    stepsTotal: allSteps.length
  });
};
```

- [ ] **Step 2: Verify**

```bash
curl http://localhost:4242/api/workshop-stats
```

Expected: `{"partsReceived":N,"partsTotal":16,"stepsDone":N,"stepsTotal":44}`

- [ ] **Step 3: Commit**

```bash
git add beau-terminal/src/routes/api/workshop-stats/+server.ts
git commit -m "feat: add /api/workshop-stats endpoint for nav sidebar stats"
```

---

## Chunk 3: Phase 2b — BMO Face, New Widgets, Today Page

### Task 11: Create BmoFace component

**Files:**
- Create: `beau-terminal/src/lib/components/BmoFace.svelte`

- [ ] **Step 1: Create the component**

```svelte
<script lang="ts">
  import { beauState } from '$lib/stores/beau.svelte.js';

  let { size = 'standard' }: { size?: 'mini' | 'standard' } = $props();

  const EXPRESSIONS: Record<string, { left: string; right: string }> = {
    curious:        { left: 'O', right: 'o' },
    playful:        { left: '^', right: '^' },
    contemplative:  { left: '—', right: '—' },
    sleepy:         { left: 'u', right: 'u' },
    offline:        { left: 'x', right: 'x' },
  };

  // $derived.by for multi-statement logic (NOT $derived(() => ...) which is invalid)
  let expression = $derived.by(() => {
    if (!beauState.online) return EXPRESSIONS.offline;
    return EXPRESSIONS[beauState.emotionalState] ?? EXPRESSIONS.curious;
  });

  let px = $derived(size === 'mini' ? 24 : 80);
</script>

<div
  class="bmo-face"
  style="width: {px}px; height: {px}px; font-size: {px * 0.22}px;"
>
  <span class="eye left">{expression.left}</span>
  <span class="dot">.</span>
  <span class="eye right">{expression.right}</span>
</div>

<style>
  .bmo-face {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.15em;
    background: var(--bmo-green);
    color: var(--bmo-bg);
    clip-path: polygon(10% 0%, 90% 0%, 100% 10%, 100% 90%, 90% 100%, 10% 100%, 0% 90%, 0% 10%);
    font-family: 'Courier New', Courier, monospace;
    font-weight: 700;
    transition: opacity 0.3s ease;
    flex-shrink: 0;
  }
  .dot {
    opacity: 0.6;
    font-size: 0.8em;
  }
</style>
```

- [ ] **Step 2: Replace "B" logo in Nav.svelte**

In `Nav.svelte` (lines 172-183), replace the octagon "B" block with:
```svelte
<BmoFace size="mini" />
```

Add the import at the top of the script:
```typescript
import BmoFace from '$lib/components/BmoFace.svelte';
```

- [ ] **Step 3: Register as widget in registry.ts**

Add to the REGISTRY object:
```typescript
'bmo-face': {
  id: 'bmo-face',
  label: 'BMO Face',
  icon: '🤖',
  category: 'content',
  component: () => import('./content/BmoFaceWidget.svelte'),
  defaultPosition: { colSpan: 3, rowSpan: 1 },
  configSchema: [],
  dataKind: 'websocket',
},
```

Create a thin wrapper widget: `beau-terminal/src/lib/widgets/content/BmoFaceWidget.svelte`:
```svelte
<script lang="ts">
  import BmoFace from '$lib/components/BmoFace.svelte';
  let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();
</script>

<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
  <BmoFace size="standard" />
</div>
```

- [ ] **Step 4: Verify — check nav logo shows face, add widget to custom page**

```bash
cd beau-terminal && npm run dev
```
Confirm nav shows BMO face instead of "B". Create/open a custom page, add "BMO Face" widget.

- [ ] **Step 5: Commit**

```bash
git add beau-terminal/src/lib/components/BmoFace.svelte beau-terminal/src/lib/widgets/content/BmoFaceWidget.svelte beau-terminal/src/lib/components/Nav.svelte beau-terminal/src/lib/widgets/registry.ts
git commit -m "feat: add reactive BmoFace component with nav integration and widget"
```

---

### Task 12: Create new Phase 2 widgets (5 terminal + 1 content)

**Files:**
- Create: `beau-terminal/src/lib/widgets/terminal/WorkshopProgressWidget.svelte`
- Create: `beau-terminal/src/lib/widgets/terminal/BlockedWaitingWidget.svelte`
- Create: `beau-terminal/src/lib/widgets/terminal/RecentActivityWidget.svelte`
- Create: `beau-terminal/src/lib/widgets/terminal/BeauVitalsWidget.svelte`
- Create: `beau-terminal/src/lib/widgets/terminal/NextStepsWidget.svelte`
- Create: `beau-terminal/src/lib/widgets/content/QuickCaptureWidget.svelte`
- Modify: `beau-terminal/src/lib/widgets/registry.ts`
- Modify: `beau-terminal/src/lib/server/widgets/loaders.ts`

Each widget follows the same pattern: `{config, data}` props contract, Courier New font, `var(--bmo-*)` colors, ALL CAPS labels. This task is split into sub-steps per widget. Each widget is independently verifiable.

**Shared widget boilerplate:**
```svelte
<script lang="ts">
  let { config, data }: { config: Record<string, unknown>; data?: Record<string, unknown> } = $props();
</script>
<!-- Widget markup here -->
<style>
  /* Every widget repeats: */
  :global(.widget-root) { font-family: 'Courier New', Courier, monospace; }
</style>
```

- [ ] **Step 1: Create WorkshopProgressWidget**

Data shape from loader: `{ partsReceived: number, partsTotal: number, totalCost: number, stepsDone: number, stepsTotal: number, ideasOpen: number, tasksOpen: number }`.

Display 4 stat rows, each with: ALL CAPS label, count text, and a mini progress bar (for parts and software). Total cost line at bottom. Each row is an `<a>` link to its page.

```svelte
<script lang="ts">
  let { config, data }: { config: Record<string, unknown>; data?: Record<string, unknown> } = $props();

  let stats = $derived(data as {
    partsReceived: number; partsTotal: number; totalCost: number;
    stepsDone: number; stepsTotal: number; ideasOpen: number; tasksOpen: number;
  } | undefined);
</script>

{#if stats}
  <div style="display: flex; flex-direction: column; gap: 0.75rem; font-family: 'Courier New', monospace;">
    <a href="/parts" style="text-decoration: none; color: var(--bmo-text);">
      <div style="display: flex; justify-content: space-between; letter-spacing: 2px; font-size: 0.75rem;">
        <span style="color: var(--bmo-muted);">PARTS</span>
        <span>{stats.partsReceived}/{stats.partsTotal} received</span>
      </div>
      <div style="height: 4px; background: var(--bmo-border); margin-top: 4px;">
        <div style="height: 100%; background: var(--bmo-green); width: {(stats.partsReceived / Math.max(stats.partsTotal, 1)) * 100}%;"></div>
      </div>
    </a>
    <!-- Repeat pattern for SOFTWARE (stepsDone/stepsTotal), IDEAS (ideasOpen + " open"), TASKS (tasksOpen + " open") -->
    <!-- IDEAS and TASKS show count only, no progress bar -->
    <div style="color: var(--bmo-muted); font-size: 0.7rem; letter-spacing: 2px; text-align: right;">
      ${stats.totalCost.toFixed(2)} INVESTED
    </div>
  </div>
{:else}
  <div style="color: var(--bmo-muted); font-style: italic;">loading workshop data...</div>
{/if}
```

- [ ] **Step 2: Create BlockedWaitingWidget**

Data shape from loader: `Array<{ name: string, status: string, expectedDelivery: string | null }>` (parts with status `ordered` or `shipped`, sorted by expectedDelivery ascending).

```svelte
<script lang="ts">
  let { config, data }: { config: Record<string, unknown>; data?: Array<{ name: string; status: string; expectedDelivery: string | null }> } = $props();
  let items = $derived(data ?? []);
</script>

{#if items.length === 0}
  <div style="color: var(--bmo-muted); font-style: italic; font-family: 'Courier New', monospace;">
    all clear. nothing waiting on anything.
  </div>
{:else}
  <div style="display: flex; flex-direction: column; gap: 0.5rem; font-family: 'Courier New', monospace; max-height: 300px; overflow-y: auto;">
    {#each items.slice(0, 8) as item}
      <div style="display: flex; justify-content: space-between; font-size: 0.8rem;">
        <span style="color: var(--bmo-text);">{item.name}</span>
        <span style="color: {item.status === 'shipped' ? 'var(--bmo-green)' : 'var(--bmo-muted)'}; letter-spacing: 2px; font-size: 0.7rem;">
          {item.status.toUpperCase()}{item.expectedDelivery ? ` · ~${item.expectedDelivery}` : ''}
        </span>
      </div>
    {/each}
  </div>
{/if}
```

- [ ] **Step 3: Create RecentActivityWidget**

Data shape from loader: `Array<{ entityType: string, action: string, summary: string, createdAt: string }>`. Config: `limit` (default 10).

Entity type icons: `⬡` part, `◉` step, `✦` idea, `◫` task, `✿` haiku, `◬` journal, `▪` capture.

```svelte
<script lang="ts">
  let { config, data }: { config: Record<string, unknown>; data?: Array<{ entityType: string; summary: string; createdAt: string }> } = $props();

  const ICONS: Record<string, string> = {
    part: '⬡', step: '◉', idea: '✦', task: '◫', haiku: '✿', journal: '◬', capture: '▪'
  };

  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  let items = $derived(data ?? []);
</script>

{#if items.length === 0}
  <div style="color: var(--bmo-muted); font-style: italic; font-family: 'Courier New', monospace;">
    nothing yet. the build starts with the first step.
  </div>
{:else}
  <div style="display: flex; flex-direction: column; gap: 0.4rem; font-family: 'Courier New', monospace; max-height: 300px; overflow-y: auto;">
    {#each items as entry}
      <div style="display: flex; gap: 0.5rem; font-size: 0.8rem;">
        <span style="color: var(--bmo-muted); min-width: 50px; font-size: 0.7rem;">{relativeTime(entry.createdAt)}</span>
        <span>{ICONS[entry.entityType] ?? '▪'}</span>
        <span style="color: var(--bmo-text);">{entry.summary}</span>
      </div>
    {/each}
  </div>
{/if}
```

- [ ] **Step 4: Create BeauVitalsWidget**

Reads from `beauState` (websocket, no `data` prop). Import and read the store directly:

```svelte
<script lang="ts">
  import { beauState } from '$lib/stores/beau.svelte.js';
  let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();
</script>

<div style="display: flex; flex-direction: column; gap: 0.5rem; font-family: 'Courier New', monospace; font-size: 0.8rem;">
  <div>
    <span style="color: {beauState.online ? 'var(--bmo-green)' : 'var(--bmo-muted)'};">●</span>
    <span style="letter-spacing: 2px; color: var(--bmo-text);">
      {beauState.online ? (beauState.sleepState === 'asleep' ? 'SLEEPING' : 'AWAKE') : 'OFFLINE'}
    </span>
  </div>
  <div><span style="color: var(--bmo-muted); letter-spacing: 2px;">MODE:</span> {beauState.mode ?? '—'}</div>
  <div><span style="color: var(--bmo-muted); letter-spacing: 2px;">FEELING:</span> {beauState.emotionalState ?? '—'}</div>
  <div><span style="color: var(--bmo-muted); letter-spacing: 2px;">ROOM:</span> {beauState.roomState ?? '—'}</div>
  <div><span style="color: var(--bmo-muted); letter-spacing: 2px;">WEATHER:</span> {beauState.weather ?? '—'}</div>
</div>
```

- [ ] **Step 5: Create NextStepsWidget**

Data shape from loader: `Array<{ icon: string, text: string, detail: string, link: string }>` (pre-sorted, max 5).

```svelte
<script lang="ts">
  let { config, data }: { config: Record<string, unknown>; data?: Array<{ icon: string; text: string; detail: string; link: string }> } = $props();
  let items = $derived(data ?? []);
</script>

{#if items.length === 0}
  <div style="color: var(--bmo-muted); font-style: italic; font-family: 'Courier New', monospace;">
    clear board. nice work.
  </div>
{:else}
  <div style="display: flex; flex-direction: column; gap: 0.5rem; font-family: 'Courier New', monospace;">
    {#each items as item}
      <a href={item.link} style="text-decoration: none; color: var(--bmo-text); font-size: 0.8rem; display: flex; gap: 0.5rem;">
        <span>{item.icon}</span>
        <span>{item.text}</span>
        <span style="color: var(--bmo-muted); font-size: 0.7rem; margin-left: auto;">{item.detail}</span>
      </a>
    {/each}
  </div>
{/if}
```

- [ ] **Step 6: Create QuickCaptureWidget**

Panel-form version of the capture bar. POSTs to `/api/capture` via `fetch`:

```svelte
<script lang="ts">
  let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();
  let text = $state('');
  let type = $state<'idea' | 'task' | 'note'>('idea');
  let submitting = $state(false);

  async function submit() {
    if (!text.trim() || submitting) return;
    submitting = true;
    try {
      const res = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), type })
      });
      if (res.ok) { text = ''; }
    } finally { submitting = false; }
  }
</script>

<div style="display: flex; gap: 0.5rem; font-family: 'Courier New', monospace;">
  <select bind:value={type} style="background: var(--bmo-bg); color: var(--bmo-text); border: 1px solid var(--bmo-border); padding: 0.25rem; font-family: inherit;">
    <option value="idea">IDEA</option>
    <option value="task">TASK</option>
    <option value="note">NOTE</option>
  </select>
  <input bind:value={text} placeholder="capture an idea, task, or note..."
    onkeydown={(e) => { if (e.key === 'Enter') submit(); }}
    style="flex: 1; background: var(--bmo-bg); color: var(--bmo-text); border: 1px solid var(--bmo-border); padding: 0.25rem 0.5rem; font-family: inherit;" />
  <button onclick={submit} disabled={submitting}
    style="background: var(--bmo-green); color: var(--bmo-bg); border: none; padding: 0.25rem 0.75rem; cursor: pointer; font-family: inherit; letter-spacing: 2px;">
    +
  </button>
</div>
```

- [ ] **Step 7: Add all 6 widgets to registry.ts**

Add entries for: `workshop-progress` (build, database), `blocked-waiting` (build, database), `recent-activity` (system, database), `beau-vitals` (environment, websocket), `next-steps` (build, database), `quick-capture` (content, none). Follow existing pattern — each entry has `id`, `label`, `icon`, `category`, `component` (lazy import), `defaultPosition`, `configSchema`, `dataKind`.

- [ ] **Step 8: Add loader cases for database widgets**

In `loaders.ts`, add 4 new cases:

```typescript
case 'workshop-progress': {
  const allParts = db.select().from(schema.parts).all();
  const allSteps = db.select().from(schema.softwareSteps).all();
  const allIdeas = db.select().from(schema.ideas).all();
  const allTodos = db.select().from(schema.todos).all();
  return {
    partsReceived: allParts.filter(p => p.status === 'delivered' || p.status === 'installed').length,
    partsTotal: allParts.length,
    totalCost: allParts.reduce((sum, p) => sum + (p.price ?? 0), 0),
    stepsDone: allSteps.filter(s => s.done).length,
    stepsTotal: allSteps.length,
    ideasOpen: allIdeas.filter(i => !i.done).length,
    tasksOpen: allTodos.filter(t => !t.done).length,
  };
}
case 'blocked-waiting': {
  return db.select().from(schema.parts).all()
    .filter(p => p.status === 'ordered' || p.status === 'shipped')
    .sort((a, b) => (a.expectedDelivery ?? '').localeCompare(b.expectedDelivery ?? ''))
    .map(p => ({ name: p.name, status: p.status, expectedDelivery: p.expectedDelivery }));
}
case 'recent-activity': {
  const limit = typeof config?.limit === 'number' ? config.limit : 10;
  return db.select().from(schema.activityLog).orderBy(desc(schema.activityLog.id)).limit(limit).all();
}
case 'next-steps': {
  // Interleave: up to 2 parts (by delivery date), 1 software step (next unchecked), 2 tasks (by priority)
  const items: Array<{ icon: string; text: string; detail: string; link: string }> = [];

  // Parts — shipped, sorted by expectedDelivery ascending
  const shippedParts = db.select().from(schema.parts).all()
    .filter(p => p.status === 'shipped')
    .sort((a, b) => (a.expectedDelivery ?? '').localeCompare(b.expectedDelivery ?? ''));
  for (const p of shippedParts.slice(0, 2)) {
    items.push({ icon: '⬡', text: p.name, detail: `shipped${p.expectedDelivery ? ', ~' + p.expectedDelivery : ''}`, link: '/parts' });
  }

  // Next unchecked software step — first undone step in first phase with undone steps
  const phases = db.select().from(schema.softwarePhases).orderBy(schema.softwarePhases.phaseOrder).all();
  for (const phase of phases) {
    const steps = db.select().from(schema.softwareSteps).where(eq(schema.softwareSteps.phaseId, phase.id)).all();
    const next = steps.find(s => !s.done);
    if (next) {
      items.push({ icon: '◉', text: next.text ?? 'next step', detail: phase.phase ?? '', link: '/software' });
      break;
    }
  }

  // Tasks — by priority (high > medium > low) then createdAt ascending
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const openTasks = db.select().from(schema.todos).all()
    .filter(t => !t.done)
    .sort((a, b) => (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1) - (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1));
  for (const t of openTasks.slice(0, Math.max(0, 5 - items.length))) {
    items.push({ icon: '◫', text: t.text, detail: t.priority ?? '', link: '/todo' });
  }

  return items.slice(0, 5);
}
```

Note: Import `desc` and `eq` from `drizzle-orm` at the top of `loaders.ts` if not already imported.

- [ ] **Step 9: Verify — add each widget to a custom page**

```bash
cd beau-terminal && npm run dev
```
Open a custom page, enter edit mode, add each of the 6 new widgets. Confirm they render correctly.

- [ ] **Step 10: Commit**

```bash
git add beau-terminal/src/lib/widgets/terminal/WorkshopProgressWidget.svelte beau-terminal/src/lib/widgets/terminal/BlockedWaitingWidget.svelte beau-terminal/src/lib/widgets/terminal/RecentActivityWidget.svelte beau-terminal/src/lib/widgets/terminal/BeauVitalsWidget.svelte beau-terminal/src/lib/widgets/terminal/NextStepsWidget.svelte beau-terminal/src/lib/widgets/content/QuickCaptureWidget.svelte beau-terminal/src/lib/widgets/registry.ts beau-terminal/src/lib/server/widgets/loaders.ts
git commit -m "feat: add 6 new widgets for Today page (workshop, blocked, activity, vitals, next, capture)"
```

---

### Task 13: Redesign Today page (dashboard → Today)

**Files:**
- Rewrite: `beau-terminal/src/routes/+page.svelte`
- Rewrite: `beau-terminal/src/routes/+page.server.ts`

- [ ] **Step 1: Update +page.server.ts with new data loading**

Replace the current 21-line load function with one that returns:
- Workshop progress aggregates
- Blocked/waiting parts
- Recent activity (last 10)
- Next steps (curated list)
- Existing soul code and voice data (for later phases)

Query all needed tables: `parts`, `softwarePhases`, `softwareSteps`, `ideas`, `todos`, `activityLog`, `captures`.

- [ ] **Step 2: Rewrite +page.svelte with 3-section structure**

Replace the current 179-line dashboard with:

**Section 1: Hero Strip** — BmoFace (standard) + greeting + mode/emotion labels. Not a panel.

Greeting derivation:
```typescript
import { beauState } from '$lib/stores/beau.svelte.js';
import BmoFace from '$lib/components/BmoFace.svelte';

let greeting = $derived.by(() => {
  if (beauState.sleepState === 'asleep') return 'beau is resting. the build continues.';
  const hour = new Date().getHours();
  if (hour < 12) return "good morning. here's where things stand.";
  if (hour < 18) return 'afternoon check-in.';
  return "wrapping up. here's the day.";
});
```

Hero strip markup (not a panel — semantic page header):
```svelte
<div style="display: flex; align-items: center; gap: 1.5rem; padding: 1rem 1.5rem; background: var(--bmo-surface); border-bottom: 1px solid var(--bmo-border);">
  <BmoFace size="standard" />
  <div>
    <div style="color: var(--bmo-text); font-family: 'Courier New', monospace; font-size: 1rem;">{greeting}</div>
    <div style="color: var(--bmo-muted); font-family: 'Courier New', monospace; font-size: 0.75rem; letter-spacing: 2px; margin-top: 0.25rem;">
      {beauState.mode ?? '—'} · {beauState.emotionalState ?? '—'}
    </div>
  </div>
</div>
```

**Section 2: Quick Capture Bar** — Same pattern as QuickCaptureWidget but inline:
```svelte
<div style="display: flex; gap: 0.5rem; padding: 0.75rem 1.5rem; border-bottom: 1px solid var(--bmo-border); font-family: 'Courier New', monospace;">
  <select bind:value={captureType} style="background: var(--bmo-bg); color: var(--bmo-text); border: 1px solid var(--bmo-border); padding: 0.25rem; font-family: inherit;">
    <option value="idea">IDEA</option>
    <option value="task">TASK</option>
    <option value="note">NOTE</option>
  </select>
  <input bind:value={captureText} placeholder="capture an idea, task, or note..."
    onkeydown={(e) => { if (e.key === 'Enter') submitCapture(); }}
    style="flex: 1; background: var(--bmo-bg); color: var(--bmo-text); border: 1px solid var(--bmo-border); padding: 0.25rem 0.5rem; font-family: inherit;" />
  <button onclick={submitCapture}
    style="background: var(--bmo-green); color: var(--bmo-bg); border: none; padding: 0.25rem 0.75rem; cursor: pointer; font-family: inherit; letter-spacing: 2px;">+</button>
</div>
```

With state and handler:
```typescript
let captureText = $state('');
let captureType = $state<'idea' | 'task' | 'note'>('idea');
async function submitCapture() {
  if (!captureText.trim()) return;
  const res = await fetch('/api/capture', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: captureText.trim(), type: captureType })
  });
  if (res.ok) { captureText = ''; }
}
```

**Section 3: PanelCanvas** — 6 panels in default layout:
```
Row 0-1:  WORKSHOP PROGRESS (8)     BLOCKED / WAITING (4)
Row 2-3:  RECENT ACTIVITY (8)       BEAU VITALS (4)
Row 4-5:  NEXT STEPS (6)            LAST HAIKU (6)
```

Use `<Panel>` with `<WidgetRenderer>` for each widget (not inline markup like the old dashboard). This makes the panels customizable in edit mode.

- [ ] **Step 3: Add workshop stats fetch to Nav.svelte**

In the `<script>` block of `Nav.svelte`, after `onMount`:
```typescript
import { afterNavigate } from '$app/navigation';

let workshopStats = $state<{ partsReceived: number; partsTotal: number; stepsDone: number; stepsTotal: number } | null>(null);

async function fetchWorkshopStats() {
  try {
    const res = await fetch('/api/workshop-stats');
    if (res.ok) workshopStats = await res.json();
  } catch {}
}

onMount(fetchWorkshopStats);
afterNavigate(fetchWorkshopStats);
```

In the template, below the "WORKSHOP" group heading (visible only on lg+):
```svelte
{#if workshopStats}
  <span class="hidden lg:block text-xs" style="color: var(--bmo-muted); letter-spacing: 1px;">
    {workshopStats.partsReceived}/{workshopStats.partsTotal} parts · {workshopStats.stepsDone}/{workshopStats.stepsTotal} steps
  </span>
{/if}
```

- [ ] **Step 4: Verify — full Today page experience**

```bash
cd beau-terminal && npm run dev
```
Navigate to `/`. Confirm:
- BMO face renders in hero with greeting
- Quick capture bar works (type something, submit, check it appears on /ideas or /todo)
- Workshop Progress shows correct counts
- Blocked/Waiting shows shipped/ordered parts
- Recent Activity shows logged events
- Beau Vitals shows live state (or defaults if MQTT offline)
- Next Steps shows actionable items
- Last Haiku renders if beauState.lastHaiku exists
- Nav sidebar shows workshop stats below WORKSHOP heading

- [ ] **Step 5: Commit**

```bash
git add beau-terminal/src/routes/+page.svelte beau-terminal/src/routes/+page.server.ts beau-terminal/src/lib/components/Nav.svelte
git commit -m "feat: redesign dashboard as Today page with hero, capture bar, and widget grid"
```

---

## Chunk 4: Phase 3 — Connective Tissue, Integrations, Discoverability

### Task 14: Add `entity_links` and `integrations` tables

**Files:**
- Modify: `beau-terminal/src/lib/server/db/schema.ts`

- [ ] **Step 1: Add both table definitions**

Append to schema.ts:

```typescript
// ─── Entity Links (Phase 3) ──────────────────────────────────────────────────

export const entityLinks = sqliteTable('entity_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id').notNull(),     // text — ideas and softwareSteps use text PKs
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),     // text — same reason
  relationship: text('relationship').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});

// ─── Integrations (Phase 3) ──────────────────────────────────────────────────

export const integrations = sqliteTable('integrations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('⚡'),
  type: text('type').notNull().default('custom'),
  endpoint: text('endpoint'),
  healthCheck: text('health_check').default('none'),
  status: text('status').notNull().default('unknown'),
  lastSeen: text('last_seen'),
  notes: text('notes'),
  config: text('config'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});
```

- [ ] **Step 2: Add unique index for entity_links**

After running `npx drizzle-kit generate` (which creates the migration SQL), manually add the unique index to the generated migration file:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_links_unique
  ON entity_links(source_type, source_id, target_type, target_id, relationship);
```

Alternatively, if the project uses `db.run()` for post-migration setup, add this in `hooks.server.ts` after the auto-migrate call:
```typescript
db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_links_unique
  ON entity_links(source_type, source_id, target_type, target_id, relationship)`);
```

The index prevents duplicate links between the same source and target with the same relationship type.

- [ ] **Step 3: Verify — restart dev server, check tables exist**

- [ ] **Step 4: Commit**

```bash
git add beau-terminal/src/lib/server/db/schema.ts beau-terminal/drizzle/
git commit -m "feat: add entity_links and integrations tables for Phase 3"
```

---

### Task 15: Create `/api/search` and `/api/entity-links` endpoints

**Files:**
- Create: `beau-terminal/src/routes/api/search/+server.ts`
- Create: `beau-terminal/src/routes/api/entity-links/+server.ts`

- [ ] **Step 1: Create search endpoint**

Query param: `?q=searchterm`. Returns `{ results: Array<{ type: string, id: string, label: string }> }`.

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import * as schema from '$lib/server/db/schema.js';
import { like } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) return json({ results: [] });

  const pattern = `%${q}%`;
  const results: Array<{ type: string; id: string; label: string }> = [];

  // Parts (integer PK — stringify)
  const matchedParts = db.select().from(schema.parts).where(like(schema.parts.name, pattern)).all();
  for (const p of matchedParts) results.push({ type: 'part', id: String(p.id), label: p.name });

  // Ideas (text PK)
  const matchedIdeas = db.select().from(schema.ideas).where(like(schema.ideas.text, pattern)).all();
  for (const i of matchedIdeas) results.push({ type: 'idea', id: i.id, label: i.text.substring(0, 60) });

  // Todos (integer PK — stringify)
  const matchedTodos = db.select().from(schema.todos).where(like(schema.todos.text, pattern)).all();
  for (const t of matchedTodos) results.push({ type: 'task', id: String(t.id), label: t.text.substring(0, 60) });

  // Software phases
  const matchedPhases = db.select().from(schema.softwarePhases).where(like(schema.softwarePhases.phase, pattern)).all();
  for (const p of matchedPhases) results.push({ type: 'phase', id: String(p.id), label: p.phase });

  // Custom pages (text PK)
  const matchedPages = db.select().from(schema.customPages).where(like(schema.customPages.name, pattern)).all();
  for (const p of matchedPages) results.push({ type: 'page', id: p.id, label: p.name });

  return json({ results: results.slice(0, 20) });
};
```

Note: This endpoint is also used by the Command Palette (Task 22). The palette adds client-side nav page search and built-in commands on top of these DB results.

- [ ] **Step 2: Create entity-links CRUD endpoint**

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { entityLinks } from '$lib/server/db/schema.js';
import { eq, and } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
  const sourceType = url.searchParams.get('sourceType');
  const sourceId = url.searchParams.get('sourceId');
  if (!sourceType || !sourceId) return json({ links: [] });

  const links = db.select().from(entityLinks)
    .where(and(eq(entityLinks.sourceType, sourceType), eq(entityLinks.sourceId, sourceId)))
    .all();

  // TODO: join with target entity tables to resolve names (lookup by targetType + targetId)
  return json({ links });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { sourceType, sourceId, targetType, targetId, relationship } = body;
  if (!sourceType || !sourceId || !targetType || !targetId || !relationship) {
    return json({ error: 'all fields required' }, { status: 400 });
  }
  db.insert(entityLinks).values({
    sourceType, sourceId: String(sourceId),
    targetType, targetId: String(targetId),
    relationship
  }).run();
  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ url }) => {
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id required' }, { status: 400 });
  db.delete(entityLinks).where(eq(entityLinks.id, Number(id))).run();
  return json({ ok: true });
};
```

- [ ] **Step 3: Verify with curl**

- [ ] **Step 4: Commit**

```bash
git add beau-terminal/src/routes/api/search/+server.ts beau-terminal/src/routes/api/entity-links/+server.ts
git commit -m "feat: add /api/search and /api/entity-links endpoints for cross-entity linking"
```

---

### Task 16: Create LinkEditor component and integrate into pages

**Files:**
- Create: `beau-terminal/src/lib/components/LinkEditor.svelte`
- Modify: `beau-terminal/src/routes/parts/+page.svelte`
- Modify: `beau-terminal/src/routes/ideas/+page.svelte`
- Modify: `beau-terminal/src/routes/todo/+page.svelte`
- Modify: `beau-terminal/src/routes/software/+page.svelte`
- Modify: `beau-terminal/src/routes/software/+page.server.ts` (preload entity links for steps)

- [ ] **Step 1: Create LinkEditor component**

A reusable component that:
- Shows existing links as colored pills with entity type icon + name + status
- Has a "+ LINK" button that opens a type-ahead search (fetches `/api/search?q=...`)
- Relationship selector dropdown after entity is chosen
- Save creates link via `POST /api/entity-links`
- Delete via `✕` on pill calls `DELETE /api/entity-links?id=...`

Props: `sourceType: string`, `sourceId: string` (all IDs are stringified — parts use `String(part.id)`, ideas/steps already have string IDs).

The component fetches links on mount via `$effect`:
```typescript
let links = $state<Array<{ id: number; targetType: string; targetId: string; relationship: string }>>([]);
$effect(() => {
  fetch(`/api/entity-links?sourceType=${sourceType}&sourceId=${sourceId}`)
    .then(r => r.json()).then(d => { links = d.links; });
});
```

- [ ] **Step 2: Add LinkEditor to parts inline edit**

In the expanded row of PartsTrackerWidget / parts page, add `<LinkEditor sourceType="part" sourceId={part.id} />` with label "BLOCKS".

- [ ] **Step 3: Add LinkEditor to ideas**

Below each idea's text, show `<LinkEditor sourceType="idea" sourceId={idea.id} />` with label "RELATES TO".

- [ ] **Step 4: Add LinkEditor to tasks**

In the expanded/hover state of each task, add `<LinkEditor sourceType="task" sourceId={task.id} />` with label "LINKED".

- [ ] **Step 5: Add blocking indicator to software steps**

In `software/+page.server.ts`, preload all entity links where `targetType='step'` in a single query (avoid N+1):
```typescript
const stepLinks = db.select().from(entityLinks)
  .where(and(eq(entityLinks.targetType, 'step'), eq(entityLinks.relationship, 'blocks')))
  .all();
```
Pass as `data.stepLinks` to the page. In the template, for each step, check if a blocking part exists and its status isn't 'delivered' or 'installed' — show a `⬡` icon with the part name + status on hover.

- [ ] **Step 6: Verify — create links between entities, confirm they display**

- [ ] **Step 7: Commit**

```bash
git add beau-terminal/src/lib/components/LinkEditor.svelte beau-terminal/src/routes/parts/+page.svelte beau-terminal/src/routes/ideas/+page.svelte beau-terminal/src/routes/todo/+page.svelte beau-terminal/src/routes/software/+page.svelte beau-terminal/src/routes/software/+page.server.ts
git commit -m "feat: add cross-entity linking with LinkEditor component on all build pages"
```

---

### Task 17: Edit mode discoverability

**Files:**
- Modify: `beau-terminal/src/routes/+page.svelte`
- Modify: `beau-terminal/src/routes/custom/[slug]/+page.svelte:115-119`
- Modify: `beau-terminal/src/lib/components/StatusBar.svelte:43-54`

- [ ] **Step 1: Add first-run hint to Today page**

At the top of the PanelCanvas section, add:
```svelte
{#if !onboarded}
  <div class="..." style="color: var(--bmo-muted); ...">
    tip: press Ctrl+E to customize panels, add widgets, and build custom pages.
    <button onclick={() => { localStorage.setItem('bmo-onboarded', 'true'); onboarded = true; }}>
      got it
    </button>
  </div>
{/if}
```

With SSR-safe initialization — `$state` initializers run during SSR where `localStorage` is unavailable:
```typescript
import { onMount } from 'svelte';
let onboarded = $state(true);  // default true to avoid flash during SSR
onMount(() => {
  onboarded = localStorage.getItem('bmo-onboarded') === 'true';
});
```

- [ ] **Step 2: Add clickable CTA to custom page empty state**

In `custom/[slug]/+page.svelte` (lines 115-119), change:
```
Press Ctrl+E to enter edit mode and add widgets
```
to include a button:
```svelte
<button onclick={() => editModeState.active = true}
  style="color: var(--bmo-green); border: 1px solid var(--bmo-green); padding: 0.5rem 1rem; cursor: pointer; background: transparent; font-family: inherit; letter-spacing: 2px;">
  + CUSTOMIZE
</button>
```

- [ ] **Step 3: Add tooltip to StatusBar EDIT button**

In `StatusBar.svelte` (around line 43-54), add to the EDIT button element:
```
title="Toggle edit mode (Ctrl+E) — drag panels, resize, add widgets"
```

- [ ] **Step 4: Verify all three discoverability improvements**

- [ ] **Step 5: Commit**

```bash
git add beau-terminal/src/routes/+page.svelte beau-terminal/src/routes/custom/[slug]/+page.svelte beau-terminal/src/lib/components/StatusBar.svelte
git commit -m "feat: improve edit mode discoverability — first-run hint, CTA, tooltip"
```

---

### Task 18: Mobile-scoped Today page

**Files:**
- Modify: `beau-terminal/src/routes/+page.svelte`

- [ ] **Step 1: Add reactive media query**

In the script block:
```typescript
let isDesktop = $state(true);
$effect(() => {
  const mq = window.matchMedia('(min-width: 1024px)');
  isDesktop = mq.matches;
  const handler = (e: MediaQueryListEvent) => { isDesktop = e.matches; };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
});
```

- [ ] **Step 2: Conditional rendering — desktop PanelCanvas vs mobile stack**

Wrap the PanelCanvas section in `{#if isDesktop}`. Add an `{:else}` block with:
```svelte
<div class="flex flex-col gap-4 p-4">
  <!-- Quick Capture bar is already above the conditional block, shared by both layouts -->
  <BeauVitalsWidget config={{}} />
  <RecentActivityWidget config={{ limit: 5 }} data={data.recentActivity?.slice(0, 5)} />
  <BlockedWaitingWidget config={{}} data={data.blockedParts} />
  <div style="color: var(--bmo-muted); font-family: 'Courier New', monospace; font-size: 0.7rem; text-align: center; letter-spacing: 2px; padding-top: 1rem;">
    panel editing available on desktop
  </div>
</div>
```

Note: `data.recentActivity` and `data.blockedParts` must match the property names returned from `+page.server.ts` (Task 13, Step 1). The server load function should return these as named properties. Import the widget components directly for the mobile layout (they render outside PanelCanvas):
```typescript
import BeauVitalsWidget from '$lib/widgets/terminal/BeauVitalsWidget.svelte';
import RecentActivityWidget from '$lib/widgets/terminal/RecentActivityWidget.svelte';
import BlockedWaitingWidget from '$lib/widgets/terminal/BlockedWaitingWidget.svelte';
```

The initial SSR renders the desktop layout (`isDesktop` defaults to `true`). On hydration, `$effect` runs and may switch to mobile — there will be a brief flash on narrow viewports. This is acceptable since PanelCanvas gracefully handles narrow widths already.

- [ ] **Step 3: Verify — resize browser below 1024px, confirm mobile stack renders**

- [ ] **Step 4: Commit**

```bash
git add beau-terminal/src/routes/+page.svelte
git commit -m "feat: add mobile-scoped Today page layout (<1024px)"
```

---

### Task 19: Create Integrations Hub

**Files:**
- Create: `beau-terminal/src/routes/integrations/+page.svelte`
- Create: `beau-terminal/src/routes/integrations/+page.server.ts`
- Create: `beau-terminal/src/lib/widgets/terminal/IntegrationsStatusWidget.svelte`
- Modify: `beau-terminal/src/lib/server/db/seed.ts`
- Modify: `beau-terminal/src/lib/stores/navConfig.svelte.ts`
- Modify: `beau-terminal/src/lib/widgets/registry.ts`
- Modify: `beau-terminal/src/lib/server/widgets/loaders.ts`

- [ ] **Step 1: Add seed function for integrations**

In `seed.ts`, add a `seedIntegrations()` function. Pattern: check if table is empty, then bulk insert. Call it from the main seed flow (after `seedParts()` etc).

```typescript
function seedIntegrations() {
  const existing = db.select().from(integrations).all();
  if (existing.length > 0) return;

  const seeds = [
    { name: 'MQTT (Mosquitto)', icon: '📡', type: 'mqtt', endpoint: 'mqtt://localhost:1883', healthCheck: 'mqtt-ping', sortOrder: 0 },
    { name: 'Home Assistant', icon: '🏠', type: 'api', endpoint: 'http://homeassistant.local:8123', healthCheck: 'http-get', sortOrder: 1 },
    { name: 'Resolume Arena', icon: '🎛', type: 'osc', endpoint: 'osc://localhost:7000', healthCheck: 'none', sortOrder: 2 },
    { name: 'Tailscale', icon: '🌐', type: 'custom', endpoint: null, healthCheck: 'none', notes: 'Auto-detected via tailscale status', sortOrder: 3 },
    { name: 'Ollama (Pi)', icon: '🧠', type: 'api', endpoint: 'http://localhost:11434', healthCheck: 'http-get', sortOrder: 4 },
    { name: 'Ollama (ThinkStation)', icon: '🧠', type: 'api', endpoint: 'http://thinkstation:11434', healthCheck: 'http-get', sortOrder: 5 },
    { name: 'ChromaDB', icon: '🔍', type: 'api', endpoint: 'http://localhost:8000', healthCheck: 'http-get', sortOrder: 6 },
    { name: 'Piper TTS', icon: '🗣', type: 'pipe', endpoint: 'pipe:///usr/bin/piper', healthCheck: 'none', sortOrder: 7 },
    { name: 'Hailo NPU', icon: '⚡', type: 'hardware', endpoint: '/dev/hailo0', healthCheck: 'none', sortOrder: 8 },
  ];

  for (const seed of seeds) {
    db.insert(integrations).values(seed).run();
  }
}
```

- [ ] **Step 2: Add Integrations to nav DEFAULT_NAV_CONFIG**

In `navConfig.svelte.ts`, add to SYSTEM group items in `DEFAULT_NAV_CONFIG`:
```typescript
{ id: '/integrations', label: 'INTEGRATIONS', icon: '⚡', group: 'SYSTEM', sortOrder: 1, hidden: false },
```
Bump Settings sortOrder to 2. Change `version` in `DEFAULT_NAV_CONFIG` from `1` to `2`.

Add version 1→2 migration in `migrateNavConfig()`:
```typescript
function migrateNavConfig(config: NavConfig): NavConfig {
  if (config.version && config.version >= 2) return config;

  // First apply v0→v1 migration if needed (existing code from Task 5)
  if (!config.version || config.version < 1) {
    // ... existing v0→v1 migration logic ...
  }

  // v1→v2: add /integrations to SYSTEM group if not present
  if (config.version === 1 || /* just migrated to v1 */) {
    const hasIntegrations = config.items.some(item => item.id === '/integrations');
    if (!hasIntegrations) {
      config.items.push({
        id: '/integrations', label: 'INTEGRATIONS', icon: '⚡',
        group: 'SYSTEM', sortOrder: 1, hidden: false
      });
      // Bump Settings sortOrder
      const settings = config.items.find(item => item.id === '/settings');
      if (settings) settings.sortOrder = 2;
    }
    return { ...config, version: 2 };
  }
  return config;
}
```

- [ ] **Step 3: Create +page.server.ts**

Load all integrations from DB. For form actions: `add` (insert new), `update` (edit endpoint/notes/config), `delete` (remove), `test` (run health check based on type).

Health check implementation:
- `http-get`: `fetch(endpoint)` with 5s timeout, check for 2xx
- `tcp-connect`: not practical from SvelteKit server — mark as "manual check required"
- `mqtt-ping`: check `beauState.online` from the bridge
- `none`: skip, return current status

- [ ] **Step 4: Create +page.svelte**

Header: `"INTEGRATIONS — wiring beau to the world"`

Grid of integration cards, each showing: icon + name, status dot (green/red/gray), endpoint (editable inline), notes (editable), TEST button, last seen timestamp. "+ INTEGRATION" button at bottom opens inline add form.

Use form actions with `use:enhance` for all mutations.

- [ ] **Step 5: Create IntegrationsStatusWidget**

Compact summary widget: list of integrations with status dots + names. For custom pages / Today page. Register in registry as `integrations-status`, category `system`, dataKind `database`.

- [ ] **Step 6: Add loader case for integrations-status**

- [ ] **Step 7: Verify — full integrations page, TEST button, widget on custom page**

- [ ] **Step 8: Commit**

```bash
git add beau-terminal/src/routes/integrations/ beau-terminal/src/lib/widgets/terminal/IntegrationsStatusWidget.svelte beau-terminal/src/lib/server/db/seed.ts beau-terminal/src/lib/stores/navConfig.svelte.ts beau-terminal/src/lib/widgets/registry.ts beau-terminal/src/lib/server/widgets/loaders.ts
git commit -m "feat: add Integrations Hub page with 9 pre-seeded services and status widget"
```

---

## Chunk 5: Phase 4 — Delight & Polish

### Task 20: Playful microcopy updates

**Files:**
- Modify: `beau-terminal/src/lib/components/StatusBar.svelte`
- Modify: `beau-terminal/src/lib/widgets/terminal/BlockedWaitingWidget.svelte`
- Modify: `beau-terminal/src/lib/widgets/terminal/RecentActivityWidget.svelte`
- Modify: `beau-terminal/src/lib/widgets/terminal/NextStepsWidget.svelte`
- Modify: `beau-terminal/src/routes/todo/+page.svelte`
- Modify: `beau-terminal/src/routes/parts/+page.svelte` (or PartsTrackerWidget)

- [ ] **Step 1: Update StatusBar online/offline labels**

In `StatusBar.svelte`, change:
- `ONLINE` → `AWAKE`
- `OFFLINE` → `SLEEPING`

- [ ] **Step 2: Update empty states in new and existing widgets**

Add/update empty state text in:
- BlockedWaitingWidget: `"all clear. nothing waiting on anything."`
- RecentActivityWidget: `"nothing yet. the build starts with the first step."`
- NextStepsWidget: `"clear board. nice work."`
- Todo page (when all done): `"clear board. nice work."`
- Parts page (nothing in transit): `"nothing in transit. the workshop is quiet."`

- [ ] **Step 3: Add mode-specific greetings to Today hero**

In `+page.svelte` hero section, update the `greeting` derivation (from Task 13) to add mode-specific variants. Replace the `$derived.by` with:
```typescript
let greeting = $derived.by(() => {
  if (beauState.sleepState === 'asleep') return 'beau is resting. the build continues.';
  if (beauState.mode === 'witness') return 'watching closely.';
  if (beauState.mode === 'collaborator') return "let's build something.";
  if (beauState.mode === 'archivist') return 'recording.';
  const hour = new Date().getHours();
  if (hour < 12) return "good morning. here's where things stand.";
  if (hour < 18) return 'afternoon check-in.';
  return "wrapping up. here's the day.";
});
```
Note: `beauState` values may be defaults on initial page load (WebSocket connects asynchronously). The time-based fallback at the bottom ensures a greeting always displays.

- [ ] **Step 4: Commit**

```bash
git add beau-terminal/src/lib/components/StatusBar.svelte beau-terminal/src/routes/+page.svelte
git commit -m "feat: add playful microcopy — AWAKE/SLEEPING, mode greetings, empty states"
```

---

### Task 21: Page templates

**Files:**
- Create: `beau-terminal/src/lib/widgets/templates.ts`
- Modify: `beau-terminal/src/lib/widgets/WidgetDrawer.svelte`

- [ ] **Step 1: Create templates.ts**

```typescript
import { nanoid } from 'nanoid';

export type PageTemplate = {
  label: string;
  icon: string;
  description: string;
  layout: Array<{ widgetId: string; col: number; row: number; colSpan: number; rowSpan: number; config: Record<string, unknown> }>;
};

function tpl(widgetId: string, col: number, row: number, colSpan: number, rowSpan: number, config: Record<string, unknown> = {}) {
  return { widgetId, col, row, colSpan, rowSpan, config };
}

export const PAGE_TEMPLATES: Record<string, PageTemplate> = {
  'vj-session': {
    label: 'VJ Session',
    icon: '▶',
    description: 'Resolume + haiku + prompt console for live sessions',
    layout: [
      tpl('resolume-session', 0, 0, 8, 3),
      tpl('beau-vitals', 8, 0, 4, 1),
      tpl('last-haiku', 8, 1, 4, 2),
      tpl('prompt-console', 0, 3, 8, 3),
      tpl('bmo-face', 8, 3, 4, 1),
      tpl('dispatcher-log', 8, 4, 4, 2),
    ]
  },
  'build-focus': {
    label: 'Build Focus',
    icon: '⬡',
    description: 'Parts + software + stats for assembly days',
    layout: [
      tpl('parts-tracker', 0, 0, 8, 4),
      tpl('build-stats', 8, 0, 4, 2),
      tpl('blocked-waiting', 8, 2, 4, 2),
      tpl('software-build', 0, 4, 8, 3),
      tpl('next-steps', 8, 4, 4, 3),
    ]
  },
  'daily-review': {
    label: 'Daily Review',
    icon: '◈',
    description: 'Activity + vitals + haiku + journal for reflection',
    layout: [
      tpl('recent-activity', 0, 0, 8, 3),
      tpl('beau-vitals', 8, 0, 4, 1),
      tpl('bmo-face', 8, 1, 4, 2),
      tpl('last-haiku', 0, 3, 6, 2),
      tpl('workshop-progress', 6, 3, 6, 2),
    ]
  }
};

/** Convert a template layout into panel objects with unique IDs */
export function instantiateTemplate(template: PageTemplate) {
  return template.layout.map(item => ({
    id: `w:${item.widgetId}:${nanoid(8)}`,
    widgetId: item.widgetId,
    col: item.col,
    row: item.row,
    colSpan: item.colSpan,
    rowSpan: item.rowSpan,
    config: item.config,
  }));
}
```

- [ ] **Step 2: Add TEMPLATES section to WidgetDrawer**

Read `WidgetDrawer.svelte` to find the correct insertion point. Add a "TEMPLATES" heading at the top of the scrollable area, above widget categories. Import `PAGE_TEMPLATES` and `instantiateTemplate` from `templates.ts`.

Show template cards:
```svelte
{#each Object.entries(PAGE_TEMPLATES) as [key, template]}
  <button onclick={() => applyTemplate(template)}
    style="text-align: left; background: var(--bmo-surface); border: 1px solid var(--bmo-border); padding: 0.5rem; cursor: pointer; width: 100%;">
    <div style="color: var(--bmo-text); font-size: 0.8rem;">{template.icon} {template.label}</div>
    <div style="color: var(--bmo-muted); font-size: 0.7rem;">{template.description}</div>
  </button>
{/each}
```

On click: `confirm("Replace current layout with {template.label} template? Existing widgets will be removed. This cannot be undone.")` → call the layout store's save function with `instantiateTemplate(template)`. Check the actual layout store API — the save function may be `setPageLayout()` or similar (read `layout.svelte.ts` to confirm the exact export name).

- [ ] **Step 3: Verify — open drawer on custom page, apply a template**

- [ ] **Step 4: Commit**

```bash
git add beau-terminal/src/lib/widgets/templates.ts beau-terminal/src/lib/widgets/WidgetDrawer.svelte
git commit -m "feat: add 3 page templates (VJ Session, Build Focus, Daily Review)"
```

---

### Task 22: Command palette

**Files:**
- Create: `beau-terminal/src/lib/components/CommandPalette.svelte`
- Modify: `beau-terminal/src/routes/+layout.svelte`

- [ ] **Step 1: Create CommandPalette component**

Modal overlay: backdrop (semi-transparent `var(--bmo-bg)`) + centered card + search input + grouped results list.

Search data sources (combined client + server):
- **Client-side (instant):** Nav pages from navConfig store + built-in commands (hardcoded array: `edit mode`, `new page`, `capture`, `settings`)
- **Server-side (debounced):** DB entities via `GET /api/search?q=...` (same endpoint from Task 15)

Results grouped by type: PAGES, COMMANDS, PARTS, IDEAS, TASKS, PHASES. Arrow keys navigate, Enter selects (navigates via `goto()` or executes command), Escape closes. Auto-focus input on open. Debounce API calls by 200ms.

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { getNavConfig } from '$lib/stores/navConfig.svelte.js';
  import { editModeState } from '$lib/stores/editMode.svelte.js';

  let { open = $bindable(false) }: { open: boolean } = $props();
  let query = $state('');
  let results = $state<Array<{ type: string; id: string; label: string; action?: () => void }>>([]);
  let selectedIndex = $state(0);

  // Built-in commands
  const COMMANDS = [
    { type: 'command', id: 'edit-mode', label: 'Edit Mode (Ctrl+E)', action: () => { editModeState.active = !editModeState.active; open = false; } },
    { type: 'command', id: 'capture', label: 'Quick Capture', action: () => { goto('/'); open = false; } },
    { type: 'command', id: 'settings', label: 'Settings', action: () => { goto('/settings'); open = false; } },
  ];

  // ... debounced fetch, filtering, keyboard handlers, etc.
</script>
```

- [ ] **Step 2: Mount in +layout.svelte**

The existing `+layout.svelte` has a `handleKeydown` function on `<svelte:window>`. **Extend the existing handler** to also handle `Ctrl+K` (do not add a second `onkeydown`):

```typescript
import CommandPalette from '$lib/components/CommandPalette.svelte';
let paletteOpen = $state(false);

// In the existing handleKeydown function:
if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
  // Same form-field guard as Ctrl+E
  if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
  e.preventDefault();
  paletteOpen = !paletteOpen;
}
```

Add `<CommandPalette bind:open={paletteOpen} />` to the template.

- [ ] **Step 3: Verify — Ctrl+K opens palette, search works, navigation works**

- [ ] **Step 4: Commit**

```bash
git add beau-terminal/src/lib/components/CommandPalette.svelte beau-terminal/src/routes/+layout.svelte
git commit -m "feat: add Ctrl+K command palette for quick navigation and search"
```

---

### Task 23: Widget drawer improvements

**Files:**
- Modify: `beau-terminal/src/lib/widgets/registry.ts`
- Modify: `beau-terminal/src/lib/widgets/WidgetDrawer.svelte`
- Modify: `beau-terminal/src/lib/components/PanelCanvas.svelte` (pass `existingWidgetIds` to WidgetDrawer)

- [ ] **Step 1: Add `description` field to WidgetMeta type**

In `registry.ts`, add `description: string` to the `WidgetMeta` type (around line 7-28). Add descriptions to all 41 widget entries. Descriptions for new widgets from this plan:
- `bmo-face` → `"reactive BMO face — reflects emotional state"`
- `workshop-progress` → `"parts, software, ideas, and tasks at a glance"`
- `blocked-waiting` → `"parts in transit or on order"`
- `recent-activity` → `"what happened recently across the build"`
- `beau-vitals` → `"compact system status — mode, emotion, weather"`
- `next-steps` → `"curated list of what to work on next"`
- `quick-capture` → `"capture ideas, tasks, or notes instantly"`
- `integrations-status` → `"connection status for all integrations"`

For the original 33 widgets, add short descriptions following the same lowercase style (e.g., `sleep` → `"beau's current rest state"`, `parts-tracker` → `"sortable parts table with inline editing"`, etc.).

- [ ] **Step 2: Add search filter to WidgetDrawer**

At the top of the scrollable area, add a text input that filters widgets by label + description using case-insensitive `includes()`.

- [ ] **Step 3: Add "already on page" indicator**

In `PanelCanvas.svelte`, compute the list of widget IDs currently on the page and pass it to `<WidgetDrawer>`:
```typescript
const existingWidgetIds = $derived(panels.map(p => p.widgetId));
```
```svelte
<WidgetDrawer {existingWidgetIds} ... />
```

In `WidgetDrawer.svelte`, accept the new prop and show a `✓` badge on widgets that are already placed:
```svelte
let { existingWidgetIds = [] }: { existingWidgetIds?: string[] } = $props();
```

- [ ] **Step 4: Verify — search works, badges show, templates section visible**

- [ ] **Step 5: Commit**

```bash
git add beau-terminal/src/lib/widgets/registry.ts beau-terminal/src/lib/widgets/WidgetDrawer.svelte
git commit -m "feat: improve widget drawer with descriptions, search, and badges"
```

---

### Task 24: BMO speech bubbles

**Files:**
- Create: `beau-terminal/src/lib/components/SpeechBubble.svelte`
- Modify: `beau-terminal/src/routes/+page.svelte`

- [ ] **Step 1: Create SpeechBubble component**

Small floating bubble positioned near the BMO face. Props: `message: string`. Fade-in, hold 5s, fade-out. Click to dismiss.

- [ ] **Step 2: Add bubble logic to Today page**

**Data source:** Use `data.recentActivity` already loaded by `+page.server.ts` (Task 13) — no extra API call needed. Filter client-side by `bmo-last-visit` timestamp.

**Last-visit timing:**
```typescript
import { onMount } from 'svelte';

let lastVisit = $state<string | null>(null);
let bubbleMessage = $state<string | null>(null);

onMount(() => {
  lastVisit = localStorage.getItem('bmo-last-visit');

  // Check for new events since last visit
  if (lastVisit && data.recentActivity) {
    const newEvents = data.recentActivity.filter(e => e.createdAt > lastVisit!);
    if (newEvents.length > 0) {
      // Priority: part delivered > step completed > new haiku > generic
      const delivered = newEvents.find(e => e.entityType === 'part' && e.action === 'updated');
      const step = newEvents.find(e => e.entityType === 'step' && e.action === 'completed');
      const haiku = newEvents.find(e => e.entityType === 'haiku');
      if (delivered) bubbleMessage = 'a package arrived.';
      else if (step) bubbleMessage = 'one more step done.';
      else if (haiku) bubbleMessage = 'wrote something.';
      else bubbleMessage = `${newEvents.length} thing${newEvents.length > 1 ? 's' : ''} happened.`;
    }
  } else if (!lastVisit) {
    // First visit ever — no bubble
  }

  // Write last-visit on page hide (not on load)
  const handleVisibility = () => {
    if (document.hidden) {
      localStorage.setItem('bmo-last-visit', new Date().toISOString());
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);
  return () => document.removeEventListener('visibilitychange', handleVisibility);
});
```

**Live reaction to beauState:** Watch for online transition via `$effect`:
```typescript
let wasOffline = $state(!beauState.online);
$effect(() => {
  if (wasOffline && beauState.online) {
    bubbleMessage = 'good morning.';
  }
  wasOffline = !beauState.online;
});
```

**Long idle (>4h):** Check `lastVisit` timestamp — if older than 4 hours, show `"welcome back."` (overrides other messages).

- [ ] **Step 3: Verify — trigger an activity (toggle a step), reload Today page, see bubble**

- [ ] **Step 4: Commit**

```bash
git add beau-terminal/src/lib/components/SpeechBubble.svelte beau-terminal/src/routes/+page.svelte
git commit -m "feat: add BMO speech bubbles on Today page for activity notifications"
```

---

### Task 25: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update widget count, table count, and nav structure**

Update all references from "33 widgets" to "41 widgets" (33 original + 8 new: bmo-face, workshop-progress, blocked-waiting, recent-activity, beau-vitals, next-steps, quick-capture, integrations-status). Update "21 tables" to "25 tables" (21 original + 4 new: captures, activity_log, entity_links, integrations). Update the nav structure description to show TODAY/WORKSHOP/BEAU/SYSTEM. Add new files (BmoFace, SpeechBubble, CommandPalette, LinkEditor, templates.ts, activity.ts, new API routes, new widgets, integrations route) to the repo structure section.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Phase 1-4 changes — widgets, tables, nav, new pages"
```
