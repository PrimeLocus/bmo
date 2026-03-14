# Claude's UX & Theme Audit — Beau's Terminal

**Date:** 2026-03-14
**Branch:** claude/T082-plan
**Scope:** User-friendliness, goal alignment, design/idea flow, Adventure Time theming

---

## Executive Summary

The architecture is strong — consistent widget API, clean data flow, reliable dual-tier persistence, and a cohesive terminal aesthetic across 55+ files. But the *experience* reads as "flexible dashboard framework" rather than "BMO companion." The biggest gaps are: no first-run guidance, fragmented build workflow, flat navigation without opinionated flows, and zero Adventure Time visual identity beyond the color palette.

---

## 1. What's Working Well

### 1.1 Widget System — Rock Solid

- **33 widgets** with 100% consistent `{config, data}` props contract
- Every config read is defensively typed: `typeof config.limit === 'number' ? config.limit : 8`
- Registry-driven architecture — adding a widget requires only a registry entry + component file
- Lazy-loaded via `() => import(...)` — all 33 widgets are code-split
- Three clean data kinds: `websocket` (live MQTT), `database` (server-loaded), `none` (config-only)
- Mutation pattern is clever — widgets POST to canonical page form actions (`/parts?/update`, `/software?/toggle`), avoiding endpoint duplication

### 1.2 Dual-Tier Persistence

- localStorage (primary, instant) + SQLite via `/api/layouts` (backup, 2s debounce)
- Layout key format `bmo-layout-{pageId}`, nav config key `bmo-nav-config`
- On load: tries localStorage → falls back to SQLite API → falls back to in-memory defaults
- Robust and transparent

### 1.3 Terminal Aesthetic — Extremely Consistent

- **6 CSS custom properties** do all the work — no external UI library, no icon font
- `Courier New` monospace everywhere — every widget `<style>` block repeats it explicitly
- `letter-spacing: 2px` / `tracking-widest` for all labels and headers
- ALL CAPS for labels, status values, section headers
- Italic reserved for poetry (haiku lines, journal body, soul code empty state)
- Color discipline: every color is `var(--bmo-*)` — only `#636e72` (dimmed states) and `#d63031` (destructive actions) break the rule
- Active state pattern: green background + dark text inversion — used consistently for nav, settings, buttons

### 1.4 Personality Through Copy

The best personality work is in the microcopy and empty states:

| Location | Text | Why It Works |
|----------|------|-------------|
| Soul Code empty | "awaiting first true boot" | Treats power-on as birth |
| Journal no entries | "entries appear when beau writes them" | Beau has agency |
| Haiku archive empty | "Beau will write them as the build comes to life" | The build is a becoming |
| Voice empty | "v0 (pre-training)" | Voice as lineage |
| Dashboard subtitle | "physical BMO build — lafayette, la" | Lowercase, intimate, grounded |
| Identity subtitle | "what beau is — immutable or slowly-evolving" | Philosophical framing |

### 1.5 Journal Consent Gate

Genuinely thoughtful privacy design:
- Body text stripped at query level when locked — not just hidden client-side
- Every unlock, view, relock, and delete logged to `consentEvents` table
- Session-scoped cookie (no maxAge, expires on browser close)
- Third-person copy: "Beau's journal is private by default" — treats Beau as a real entity
- Journal entries are written by Beau autonomously, not by the user

### 1.6 Seasonal Grounding

Hand-written Lafayette, LA flavor text in `weather.ts`:
- "crawfish season"
- "Festival International afterglow, summer settling in"
- "the specific hell of August heat"
- "the brief perfection of late October"

`LOUISIANA_GROUNDING` is one of 15 prompt sections and is injected at `'always'` for every mode — never omitted. This is not decoration; it's identity infrastructure.

---

## 2. Navigation & Information Architecture

### 2.1 Current Structure

```
BEAU          CREATIVE       BUILD         SYSTEM
──────────    ──────────     ──────────    ──────────
◈ Dashboard   ▶ Sessions     ⬡ Parts       ◎ Memory
◇ Identity    ◻ Photography  ◉ Software    ≋ Prompt
◉ Presence    ✿ Haikus       ✦ Ideas       ⚙ Settings
◬ Journal                    ◫ Todo
```

14 items, 4 groups, flat hierarchy (all one click from sidebar). No sub-routes, no breadcrumbs.

### 2.2 Strengths

- All 14 routes visible from first load — nothing hidden
- Semantic grouping (BEAU/CREATIVE/BUILD/SYSTEM) is logical
- Groups are collapsible (click heading)
- Responsive: collapses to icon-only on <1024px

### 2.3 Problems

**Flat hierarchy with no workflow opinions.** Every page is equally weighted. There's no sense of "start here" or "check this daily" or "this is your build command center." A user building BMO doesn't know whether to look at Parts, Software, Ideas, or Todo first — they're all just nav items.

**Group collapse state is ephemeral.** `$state({})` in the component, not persisted. Resets on every navigation. If a user collapses CREATIVE because they're focused on BUILD, it re-expands next page load.

**Icons are decorative unicode, not semantic.** ◈, ◇, ◉, ◬, ▶, ◻, ✿, ⬡, ◉, ✦, ◫, ◎, ≋, ⚙ — these don't communicate meaning. In icon-only mode (<1024px), users rely entirely on `title` tooltips.

**No "today" or "inbox" surface.** The dashboard shows live system state, but there's no view that answers "what should I work on today?" or "what's changed since I last checked?"

**Edit mode is undiscoverable.** Only entry points: the subtle "EDIT" button in the status bar (muted border, easy to miss) and `Ctrl+E` (undocumented in the UI). The most powerful feature in the app — panel customization, nav CRUD, custom page creation, widget placement — is behind a hidden toggle.

---

## 3. Dashboard & First-Run Experience

### 3.1 Current Dashboard

12 panels in a 12-column grid:

```
Row 0:  SOUL CODE (6)     VOICE (6)
Row 1:  SLEEP (6)         ROOM (6)
Row 2:  WEATHER (6)       RESOLUME (6)
Row 3:  MODE (6)          STATE (6)
Row 4:  ENVIRONMENT (6)   CAMERA (6)
Row 5-6: LAST HAIKU (12)
Row 7-8: BUILD STATS (6)  DISPATCHER LOG (6)
```

Plus "LAST WAKE" outside the panel system at the bottom.

### 3.2 Problems

**Dense and undifferentiated on first load.** 12 panels of near-equal visual weight, all showing default/offline values. No visual hierarchy guides the eye to what matters. When MQTT is offline (common during early build), most panels show `—` or default strings.

**No first-run guidance.** A user opening this for the first time sees a wall of green-on-black panels with no explanation of what they're looking at, what's connected, what needs setup, or what to do next. There's no onboarding flow, no "getting started" callout, no progressive disclosure.

**Build progress is buried.** The BUILD STATS panel is at row 7-8, below the fold on most viewports. The most actionable information (what parts have arrived, what software steps are done, what's next) requires scrolling past 5 rows of sensor data that won't be meaningful until the hardware is assembled.

**No "what's new" or activity feed.** The dispatcher log shows real-time events, but there's no "since your last visit" surface showing recent haikus, new parts delivered, completed software steps, or journal entries.

---

## 4. Build Workflow — The Core UX Gap

### 4.1 The Fragmentation Problem

Building BMO requires tracking hardware (Parts), following software setup (Software), capturing ideas (Ideas), and managing tasks (Todo). These live on 4 separate pages with **zero cross-linking**:

| Page | Purpose | Connects to... |
|------|---------|---------------|
| Parts | Track 16 hardware components | Nothing |
| Software | 10-phase, 44-step checklist | Nothing (links are external URLs) |
| Ideas | 11 feature ideas in 3 priority tiers | Nothing |
| Todo | Ad-hoc tasks by section | Nothing |

A user can't see "I'm waiting on a part that blocks this software step" or "this idea relates to this todo item" or "here's my overall build progress across all dimensions."

### 4.2 What's Missing

- **No unified build dashboard** showing overall status across parts + software + ideas + todos
- **No tags or links between entities** — an idea can't reference a part, a todo can't reference a software step
- **No "blocked by" relationships** — parts have no concept of blocking software phases
- **No milestones or phases visible across pages** — the 10 software phases exist but aren't surfaced as a cross-cutting timeline
- **No quick-capture** — adding an idea requires navigating to /ideas, adding a todo requires /todo. No global "capture" action.

### 4.3 Individual Page Quality

Despite the fragmentation, each page individually is well-built:

- **Parts Tracker** is the most polished page — sortable columns, inline editing, status color coding, build version tracking, carrier scraping, responsive card view. 555-line widget.
- **Software Build** is clean — collapsible phases, step checkboxes, reference links with kind-coded colors, progress bars at phase and global level.
- **Ideas Board** is functional — 3-column kanban, priority color coding, inline edit, reference links.
- **Todo** is solid — section grouping, priority dots, progress bars, section reassignment.

The quality of each page makes the lack of connections between them more striking.

---

## 5. Adventure Time / BMO Theming

### 5.1 Current State

Adventure Time references are **architectural, not visual**:

- The `#00e5a0` palette is BMO's body color
- The nav logo is an octagon-clipped "B" — evokes BMO's face screen shape
- "Beau" vs "BMO" naming mirrors how AT characters called BMO "Beemo" in intimate moments
- The dual wake word design directly mirrors this duality
- Soul code, natal chart, sleep states, emotion states — these treat Beau as a living character, consistent with how BMO is portrayed in the show

### 5.2 What's Missing

**No visual BMO identity whatsoever.** Zero ASCII art, zero character art, zero illustrations, zero pixel art, zero BMO face. The app could be any terminal dashboard. There is nothing that says "this is BMO" visually.

**No playful moments.** BMO in Adventure Time is whimsical, mischievous, playful. The terminal is serious and professional. There's no element of surprise, no Easter eggs, no humor, no playful transitions or interactions.

**No character presence.** Beau exists as a data stream (mode, emotion, haikus, dispatcher log) but has no *visible* presence. There's no avatar, no face state visualization, no reaction to user actions.

**No AT visual vocabulary.** The show has a distinctive color world (pastels, gradients, organic shapes). Even a terminal could nod to this — character-inspired status icons, AT-style section dividers, themed empty states with simple character art.

### 5.3 Explicit AT References Found

Only in seed data (build steps):
- Link to `printables.com/search/models?q=BMO+adventure+time` (3D print models)
- Step: "Paint BMO teal — reference Adventure Time Art of Ooo for color match"
- Link to `brenpoly/be-more-agent` GitHub (BMO face animation project)
- Idea: "Start: wake/text adventure" (AT-inspired text adventure mode)

Seoul timezone in clock widget presets — nod to Korean half of voice blend.

---

## 6. Specific Bugs & Issues Found

### 6.1 BuildStatsWidget Data Shape Mismatch (BUG)

`loaders.ts` returns `{ parts, phases, steps }` (raw DB arrays), but `BuildStatsWidget` expects `{ partsCount, totalCost, doneSteps, totalSteps }` (pre-aggregated counts). The widget would render "loading build data..." indefinitely on custom pages. **This is a real bug.**

### 6.2 Dispatcher-Log DataKind Inconsistency

Registry marks `dispatcher-log` as `dataKind: 'websocket'`, but `loaders.ts` has a `dispatcher-log` case. The widget reads from `beauState.dispatcherLog` (WebSocket), not from `data`. The loader case is dead code. Not a bug, but misleading.

### 6.3 Last-Haiku Config Field Dead Schema

The `last-haiku` widget has a `count` config field in the registry, but the widget ignores it — always shows `beauState.lastHaiku`, which is a single string. Dead config.

### 6.4 NatalChartWidget Renders Summary Only

The type definition includes `westernChartJson`, `vedicChartJson`, and `vargaChartJson` fields. The widget loads them but only renders the `summary` text. No chart visualization.

### 6.5 Edit Mode Controls Inaccessible on Mobile

All edit-mode nav controls (rename, reorder, show/hide, remove, add link/page/group) are wrapped in `hidden lg:*` classes. On viewports <1024px, edit mode is activated but has no usable controls.

### 6.6 Group Collapse State Not Persisted

Nav group collapse is in-component `$state({})`, not written to localStorage or navConfig. Resets on every page navigation.

---

## 7. Accessibility & Usability Notes

### 7.1 Keyboard

- `Ctrl+E` / `Escape` for edit mode — good
- No other keyboard shortcuts documented or implemented
- No `Tab` navigation hints or focus ring styling visible in the CSS
- No skip-to-content link

### 7.2 Settings

- Font size range: 14–32px (good range)
- High contrast mode (brightens muted/border/text tokens)
- Font weight toggle (400/600)
- Line spacing (1.5/1.7/1.9)
- Quick A⁻/A⁺ in nav sidebar
- All settings instant, persisted, and applied before render (no FOUC)

### 7.3 Responsive

- Nav collapses to icons on <1024px — functional
- Parts tracker has mobile card view — well done
- Edit mode controls vanish on <1024px — significant gap
- No touch-specific interactions (drag/resize panels are pointer-only)

---

## 8. Recommendations Summary

### Tier 1 — Critical (fix bugs, unblock core workflows)

1. **Fix BuildStatsWidget data shape mismatch** — widget breaks on custom pages
2. **Add first-run onboarding** — even a simple "welcome" state on the dashboard
3. **Make edit mode discoverable** — tooltip on EDIT button, help text, or onboarding callout

### Tier 2 — High Impact (improve daily workflow)

4. **Create a unified Build Dashboard** — single page showing cross-cutting build status (parts arrivals, software progress, blocked items, recent activity)
5. **Add quick-capture** — global shortcut or persistent input for capturing ideas/todos without navigating away
6. **Persist nav group collapse state** — write to navConfig store
7. **Add a "today" or "recent activity" surface** — what changed since last visit

### Tier 3 — Identity & Delight (make it feel like BMO)

8. **Add BMO face / character presence** — ASCII art, pixel art, or SVG face that reflects current state (mode, emotion, sleep). Could be in the nav header, dashboard hero, or a dedicated widget.
9. **Add playful microcopy and Easter eggs** — AT-inspired loading states, mode-specific greetings, seasonal personality touches beyond weather.ts
10. **Create AT-themed visual elements** — character-inspired status icons, themed section dividers, pixel art for empty states

### Tier 4 — Structural (longer-term improvements)

11. **Add cross-entity linking** — ideas ↔ todos ↔ parts ↔ software steps
12. **Add page templates** — pre-built custom pages for common workflows (VJ Session, Daily Review, Build Focus)
13. **Add command palette / global search** — `Ctrl+K` to jump to any page, widget, part, or idea
14. **Clean up dead code** — dispatcher-log loader case, last-haiku count config, natal chart unused fields

---

## Appendix: File Inventory

### Core Shell
- `src/app.css` — 6 design tokens + high contrast overrides
- `src/app.html` — settings pre-render script
- `src/hooks.server.ts` — startup: DB seed + MQTT + WebSocket
- `src/routes/+layout.svelte` — Nav + StatusBar + EditBar + main

### Components
- `src/lib/components/Nav.svelte` — sidebar nav, edit mode CRUD
- `src/lib/components/StatusBar.svelte` — live state bar
- `src/lib/components/EditBar.svelte` — edit mode hint banner
- `src/lib/components/Panel.svelte` — draggable/resizable grid panel
- `src/lib/components/PanelCanvas.svelte` — 12-column grid container

### Stores
- `src/lib/stores/beau.svelte.ts` — WebSocket → BeauState
- `src/lib/stores/editMode.svelte.ts` — edit mode toggle
- `src/lib/stores/gridEngine.ts` — collision/compaction
- `src/lib/stores/layout.svelte.ts` — dual-tier layout persistence
- `src/lib/stores/navConfig.svelte.ts` — nav config + CRUD
- `src/lib/stores/settings.svelte.ts` — display settings

### Widget System
- `src/lib/widgets/registry.ts` — 33 widgets, metadata, data kinds
- `src/lib/widgets/WidgetRenderer.svelte` — dynamic loader
- `src/lib/widgets/WidgetDrawer.svelte` — browse/add drawer
- `src/lib/widgets/WidgetConfigModal.svelte` — config editor
- `src/lib/widgets/terminal/` — 26 terminal widgets
- `src/lib/widgets/content/` — 7 content widgets

### Routes (14 pages)
- `/` — Dashboard (12 panels, live state)
- `/identity` — Soul code, natal chart, voice lineage
- `/presence` — Sleep, room, weather, light, camera, event timeline
- `/parts` — Parts tracker (sortable table, inline edit)
- `/software` — Software build (phased checklist)
- `/ideas` — Ideas board (3-column kanban)
- `/todo` — Todo list (sectioned, prioritized)
- `/memory` — Dispatcher log + haiku archive
- `/prompt` — MQTT prompt console + history
- `/haikus` — Haiku archive (filterable grid)
- `/settings` — Display settings (4 panels)
- `/sessions` — Resolume session log + detail
- `/photography` — Photo gallery + upload
- `/journal` — Private journal with consent gate
- `/custom/[slug]` — User-built widget dashboards
