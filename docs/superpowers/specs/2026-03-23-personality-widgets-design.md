# Personality Widgets — Sub-project #3 of Bible Alignment

**Date:** 2026-03-23
**Status:** Design approved
**Depends on:** Personality Engine (sub-project #1, merged), Face States (sub-project #2, merged)

## Overview

Four new widgets and a page template that surface Beau's personality engine data in Beau's Terminal. Two audience layers: **ambient** (living-with-Beau daily use) and **diagnostic** (builder/tuning). The widget system, beauState SSE stream, and personality engine already provide all required data — this project is purely visualization.

## Design Decisions

- **5 deliverables:** 4 widgets + 1 page template
- **Zero new dependencies:** Pure SVG for the timeline chart, hand-rolled with a thin scale utility (~30 lines). No chart library.
- **Color language:** Wonder = `#00e5a0` (BMO green), Reflection = `#6ec6ff` (cool blue), Mischief = `#ffd700` (gold). Consistent across all personality widgets.
- **All websocket-backed except Timeline:** Inner Weather, Vector Gauge, and Signal Sources read directly from `beauState` store. Timeline queries `personality_snapshots` table (database-backed).

## Widget 1: Inner Weather

**Purpose:** Beau's self-narration — the ambient "how is Beau feeling" widget. Designed for the home page and daily-use dashboards.

**Data kind:** `websocket`
**Category:** `identity`
**Default size:** 6 columns × 2 rows

**Layout (top to bottom):**

1. **Mode header** — small colored dot (tinted to dominant dimension) + mode name in muted uppercase tracking-widest (`ARCHIVIST`).
2. **Interpretation text** — `beauState.personalityInterpretation` displayed as primary content. `--bmo-text` color, 14px, line-height 1.7. This is the hero element — it dominates the widget.
3. **Whisper bars** — three tiny horizontal bars (3px tall, ~24–40px wide proportional to value) for wonder/reflection/mischief. Labeled with single-letter abbreviations (W, R, M). Low opacity — present but not demanding attention. These give a glanceable sense of the vector balance without breaking the ambient mood.

**Reactive behavior:**
- All fields update live from `beauState` via SSE.
- Mode dot color shifts with dominant dimension.
- Whisper bar widths animate smoothly on value changes (CSS transition on width).

**Empty state:** Before the first SSE message arrives, `personalityInterpretation` is `''`. Display muted fallback text: `"waiting for first reading..."` until a non-empty interpretation arrives.

**Config schema:** None — this widget is fully driven by live state.

## Widget 2: Vector Gauge

**Purpose:** Live diagnostic view of the personality vector. Shows raw wonder/reflection/mischief values with an optional signal vs momentum layer breakdown.

**Data kind:** `websocket`
**Category:** `identity`
**Default size:** 3 columns × 2 rows

**Layout:**

1. **Header** — `VECTOR` label + toggle: `BLENDED` / `LAYERS`.
2. **Three horizontal bars** (one per dimension):
   - Dimension label left-aligned in dimension color, value right-aligned in muted.
   - Bar: 6px tall, `--bmo-surface` background, gradient fill from dark to dimension color.
   - Subtle glow (`box-shadow`) on the fill, intensity proportional to value.
3. **Mode footer** — colored dot + mode name, separated by a top border.

**Layer toggle (detail mode):**
When toggled to `LAYERS`, each dimension expands from one bar to two:
- **SIG** — signal layer value, 4px bar, 60% opacity.
- **MOM** — momentum layer value, 4px bar, 30% opacity.
- Blended value shown as text label (`blend 0.62`).

**Data sources:**
- Blended mode: `beauState.personalityVector`
- Layer mode: `beauState.signalLayer`, `beauState.momentumLayer`
- Mode: derived from `beauState` (already computed server-side by mode classifier)

**Config schema:**
- `showLayers` (boolean, default `false`) — initial toggle state.

## Widget 3: Signal Sources

**Purpose:** Transparency widget — shows which of the 21 signal rules are currently firing and their contributions. The "why" behind the current vector state.

**Data kind:** `websocket`
**Category:** `identity`
**Default size:** 3 columns × 3 rows

**Layout:**

1. **Header** — `ACTIVE SIGNALS` + counter (`4 of 21`).
2. **Active rules list** — each rule as a card:
   - Colored left border tinted to its strongest dimension contribution.
   - Rule name (`time:late-night`) in primary text.
   - Delta contributions right-aligned: `W+0.3  R+0.2` — letter in muted, value in dimension color. Only non-zero deltas shown.
   - Cards displayed in a vertical stack with 8px gap.
3. **Inactive divider** — horizontal line with `INACTIVE · 17` centered.
4. **Inactive rules** — collapsed, dim text listing all non-firing rule names separated by ` · `.

**Data source:** `beauState.signalSources` provides the active rule name array. The delta contributions per rule are static (defined in `signal-rules.ts`) — the widget imports the rule definitions to look up contributions for display.

**Reactive behavior:** Rules appear/disappear as sensors and activity change. New active rules animate in (fade + slide).

**Config schema:** None.

## Widget 4: Personality Timeline

**Purpose:** Historical view of the personality vector over time. The crown jewel — shows Beau has continuity, that states persist and bleed into subsequent experiences. Two modes: ambient (daily use) and detailed (diagnostic).

**Data kind:** `database`
**Category:** `identity`
**Default size:** 12 columns × 3 rows

### Chart Implementation

**Pure SVG** with a thin scale utility. No chart library.

**Scale utility** (`src/lib/widgets/terminal/personality-chart.ts`):
```typescript
function scaleLinear(domain: [number, number], range: [number, number]) {
  return (value: number) => {
    const [d0, d1] = domain;
    const [r0, r1] = range;
    return r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
  };
}

function scaleTime(domain: [Date, Date], range: [number, number]) {
  return (value: Date) => {
    const [d0, d1] = domain;
    const [r0, r1] = range;
    return r0 + ((value.getTime() - d0.getTime()) / (d1.getTime() - d0.getTime())) * (r1 - r0);
  };
}
```

These two functions (plus a `polylinePath` helper that converts data points to an SVG path string) cover all charting needs.

### Ambient Mode (default)

**Layout:**

1. **Header** — `PERSONALITY · {timeRange}` + mode toggle (`AMBIENT` / `DETAIL`).
2. **Chart area** (SVG viewBox, responsive):
   - Three `<path>` elements for wonder/reflection/mischief lines (1.5px stroke, dimension colors, 70% opacity).
   - Three `<path>` elements for translucent area fills underneath each line (8%/6%/5% opacity respectively — wonder brightest, mischief dimmest).
   - Subtle horizontal grid lines at 0.25 / 0.5 / 0.75 (dashed, `--bmo-border` color).
   - **Mode bands** — thin colored strip at the bottom of the chart. Each mode period rendered as a `<rect>` tinted to the mode's dominant dimension color (12% opacity). Mode name as tiny centered text.
3. **Time axis** — evenly spaced labels below the chart (e.g., `00:00  06:00  12:00  18:00  NOW` for 24h range).
4. **Legend** — three small colored line swatches with dimension names.

**Hover interaction:**
- Invisible `<rect>` overlay covering the chart area tracks mouse position.
- Vertical crosshair line (dashed, muted) follows cursor X position.
- Three colored dots appear on each dimension's line at the hovered X position.
- Values shown via a tooltip or inline readout.

### Detailed Mode

Everything from ambient mode, plus:

- **Signal layer lines** — dashed (stroke-dasharray `3,3`), 50% opacity per dimension.
- **Momentum layer lines** — dotted (stroke-dasharray `1,3`), 30% opacity per dimension.
- **Y-axis labels** — `1.0 / 0.7 / 0.5 / 0.2` along left edge.
- **Notable markers** — vertical lines at notable snapshots (`isNotable=1`) with a `★ notable` label. Click to see the interpretation text for that snapshot.
- **Sources strip** — thin bar below mode bands showing which signal rules were active at the hovered point (from snapshot's `sources` JSON field).
- **Legend update** — adds `SIGNAL` (dashed) and `MOMENTUM` (dotted) line swatches.

### Time Ranges

Configurable via widget config: `6h`, `24h` (default), `7d`, `30d`.

These align naturally with the compaction tiers:
- **6h / 24h** → hot tier (all snapshots, ~5min intervals)
- **7d** → warm tier (hourly peaks)
- **30d** → cool tier (daily snapshots)

### Data Loading

Server-side loader queries `personality_snapshots` ordered by timestamp, filtered to the configured time range. Capped at 500 data points maximum to keep SVG rendering performant — the compaction tiers naturally reduce density for longer ranges so this limit rarely clips.

**DB field transformations (in the loader):**
- `sources` column is stored as JSON text (`JSON.stringify(array)`) — loader must `JSON.parse()` each row.
- `is_notable` column is integer `0`/`1` — loader must convert to boolean.
- `interpretation` column is nullable — loader should default to `''`.

Returns:

```typescript
type TimelineData = {
  snapshots: Array<{
    timestamp: string;
    wonder: number;
    reflection: number;
    mischief: number;
    signalWonder: number;
    signalReflection: number;
    signalMischief: number;
    momentumWonder: number;
    momentumReflection: number;
    momentumMischief: number;
    derivedMode: string;
    interpretation: string;
    sources: string[];
    isNotable: boolean;
  }>;
  modeTransitions: Array<{
    timestamp: string;
    mode: string;
  }>;
};
```

**Naming note:** `derivedMode` matches the DB column name. On live widgets (Inner Weather, Vector Gauge), mode comes from `beauState.mode` instead. The timeline uses DB field names since it's database-backed.

`modeTransitions` is derived in the loader from snapshots by detecting where `derivedMode` changes — used to render mode bands without iterating on the client.

**Config schema:**
- `timeRange` (select: `6h` | `24h` | `7d` | `30d`, default `24h`)
- `defaultMode` (select: `ambient` | `detail`, default `ambient`)

## Widget 5: Page Template — "Beau's Mind"

**Template ID:** `beaus-mind`
**Icon:** `◉`
**Description:** "Personality vector, active signals, mood timeline — Beau's inner world"

**Layout (12-column grid, 0-based coordinates per gridEngine.ts convention):**

| Widget | Col | Row | colSpan | rowSpan |
|--------|-----|-----|---------|---------|
| Inner Weather | 0 | 0 | 6 | 2 |
| Vector Gauge | 6 | 0 | 3 | 2 |
| Signal Sources | 9 | 0 | 3 | 3 |
| Personality Timeline | 0 | 3 | 12 | 3 |

This places the ambient widget (Inner Weather) as the largest element in the top-left, the two diagnostic widgets to its right, and the timeline spanning the full width below. Signal Sources (rows 0–2) sits above the timeline (rows 3–5) with no overlap.

## Registry Entries

Four new entries in `registry.ts`:

| ID | Label | Category | Data Kind | Description |
|----|-------|----------|-----------|-------------|
| `inner-weather` | Inner Weather | identity | websocket | "beau's self-narration — interpretation, mode, and vector whisper" |
| `vector-gauge` | Vector Gauge | identity | websocket | "live personality vector bars with signal/momentum layer toggle" |
| `signal-sources` | Signal Sources | identity | websocket | "which of the 21 signal rules are currently firing and why" |
| `personality-timeline` | Personality Timeline | identity | database | "historical vector chart with ambient/detail modes and mode bands" |

Widget count after: **47** (43 existing + 4 new).

## New Files

| File | Purpose |
|------|---------|
| `src/lib/widgets/terminal/InnerWeatherWidget.svelte` | Inner Weather widget component |
| `src/lib/widgets/terminal/VectorGaugeWidget.svelte` | Vector Gauge widget component |
| `src/lib/widgets/terminal/SignalSourcesWidget.svelte` | Signal Sources widget component |
| `src/lib/widgets/terminal/PersonalityTimelineWidget.svelte` | Personality Timeline widget component |
| `src/lib/widgets/terminal/personality-chart.ts` | SVG scale utility + path helpers for timeline |
| `src/lib/personality/rule-meta.ts` | Client-safe signal rule name → delta map (21 entries) |

## Modified Files

| File | Changes |
|------|---------|
| `src/lib/widgets/registry.ts` | Add 4 widget entries, update count |
| `src/lib/widgets/templates.ts` | Add `beaus-mind` page template |
| `src/lib/server/widgets/loaders.ts` | Add `personality-timeline` case — query snapshots by time range |

## Signal Rule Contributions Export

Signal Sources widget needs to display per-rule delta contributions. The current `SIGNAL_RULES` array in `signal-rules.ts` contains `condition` functions (closures over server-only helpers) which makes it non-importable on the client side.

**Required:** Create a client-safe file `src/lib/personality/rule-meta.ts` that exports a static map:

```typescript
export const SIGNAL_RULE_META: Record<string, { wonder: number; reflection: number; mischief: number }> = {
  'lux:low': { wonder: 0, reflection: 0.3, mischief: 0 },
  'time:late-night': { wonder: 0, reflection: 0.4, mischief: -0.2 },
  // ... all 21 rules
};
```

This is derived from `SIGNAL_RULES` but contains only the static name → delta mapping (no condition functions). The 21-entry map is small enough to maintain manually and should be updated whenever signal rules change.

**Also modify:** `src/lib/server/widgets/loaders.ts` — not needed for this file, but add to **Modified Files** list: `src/lib/server/personality/signal-rules.ts` if a programmatic extraction helper is added.

## Out of Scope

- Interactive editing of signal rules or personality parameters from the UI
- Snapshot export/import UI (already exists as a server-side function)
- Real-time WebSocket for timeline (uses database loading — live data visible in other widgets)
- Personality vector input to prompt assembly (already handled by the engine)
