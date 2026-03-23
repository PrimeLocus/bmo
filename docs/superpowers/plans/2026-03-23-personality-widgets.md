# Personality Widgets Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 4 widgets + 1 page template that visualize the personality engine's wonder/reflection/mischief vector in Beau's Terminal.

**Architecture:** Four Svelte 5 widget components (3 websocket-backed, 1 database-backed) registered in the existing widget system. A thin SVG scale utility powers the timeline chart. A client-safe signal rule meta map enables the Signal Sources widget. A "Beau's Mind" page template ties all widgets together.

**Tech Stack:** SvelteKit 2 / Svelte 5 (runes), Vitest, Drizzle ORM (SQLite), pure SVG charting, CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-03-23-personality-widgets-design.md`

**Status:** COMPLETE — all 8 tasks implemented, 221/221 tests passing, merged to master. Branch: `feature/personality-widgets`.

---

### Task 1: Signal Rule Meta — Client-Safe Export

The Signal Sources widget needs per-rule delta contributions, but `signal-rules.ts` contains server-only condition functions. Extract a static name→delta map into a client-safe file.

**Files:**
- Create: `beau-terminal/src/lib/personality/rule-meta.ts`
- Test: `beau-terminal/src/lib/personality/rule-meta.test.ts`

- [ ] **Step 1: Write the failing test**

Create `beau-terminal/src/lib/personality/rule-meta.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SIGNAL_RULE_META } from './rule-meta.js';

describe('SIGNAL_RULE_META', () => {
	it('has exactly 21 rules', () => {
		expect(Object.keys(SIGNAL_RULE_META)).toHaveLength(21);
	});

	it('every rule has wonder, reflection, mischief numbers', () => {
		for (const [name, delta] of Object.entries(SIGNAL_RULE_META)) {
			expect(typeof delta.wonder, `${name}.wonder`).toBe('number');
			expect(typeof delta.reflection, `${name}.reflection`).toBe('number');
			expect(typeof delta.mischief, `${name}.mischief`).toBe('number');
		}
	});

	it('includes known environmental rules', () => {
		expect(SIGNAL_RULE_META['lux:low']).toEqual({ wonder: 0, reflection: 0.3, mischief: 0 });
		expect(SIGNAL_RULE_META['time:late-night']).toEqual({ wonder: 0, reflection: 0.4, mischief: -0.2 });
		expect(SIGNAL_RULE_META['weather:storm']).toEqual({ wonder: 0.3, reflection: 0.2, mischief: 0 });
	});

	it('includes known activity rules', () => {
		expect(SIGNAL_RULE_META['activity:haiku']).toEqual({ wonder: 0.1, reflection: 0.3, mischief: 0 });
		expect(SIGNAL_RULE_META['activity:journal']).toEqual({ wonder: 0, reflection: 0.4, mischief: 0 });
	});

	it('has no condition functions (client-safe)', () => {
		for (const delta of Object.values(SIGNAL_RULE_META)) {
			expect(Object.keys(delta).sort()).toEqual(['mischief', 'reflection', 'wonder']);
		}
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd beau-terminal && npx vitest run src/lib/personality/rule-meta.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `beau-terminal/src/lib/personality/rule-meta.ts`:

```typescript
/**
 * Client-safe signal rule metadata.
 * Maps rule name → dimension delta contributions.
 * Derived from SIGNAL_RULES in server/personality/signal-rules.ts.
 * Update this file when signal rules change.
 *
 * TODO-B: EXTRACTION TARGET — Pi Personality Service
 */

export type RuleDelta = {
	wonder: number;
	reflection: number;
	mischief: number;
};

export const SIGNAL_RULE_META: Record<string, RuleDelta> = {
	// ── Environmental ──
	'lux:low':                  { wonder: 0,    reflection: 0.3,  mischief: 0 },
	'lux:very-low+late':        { wonder: 0,    reflection: 0.5,  mischief: -0.1 },
	'time:late-night':          { wonder: 0,    reflection: 0.4,  mischief: -0.2 },
	'time:dawn-dusk':           { wonder: 0.2,  reflection: 0.2,  mischief: 0 },
	'presence:empty+extended':  { wonder: 0,    reflection: 0.3,  mischief: -0.3 },
	'presence:occupied+recent': { wonder: 0,    reflection: -0.1, mischief: 0.2 },
	'interaction:active':       { wonder: 0.1,  reflection: -0.1, mischief: 0.3 },
	'interaction:stale':        { wonder: 0,    reflection: 0.2,  mischief: -0.1 },
	'weather:storm':            { wonder: 0.3,  reflection: 0.2,  mischief: 0 },
	'weather:clear-warm':       { wonder: 0.1,  reflection: 0,    mischief: 0.1 },
	'season:august':            { wonder: -0.1, reflection: 0.1,  mischief: -0.1 },
	'season:late-october':      { wonder: 0.3,  reflection: 0.1,  mischief: 0.1 },
	'resolume:active':          { wonder: 0.2,  reflection: 0.1,  mischief: -0.3 },
	'sleep:settling':           { wonder: -0.2, reflection: 0.3,  mischief: -0.3 },
	'sleep:waking':             { wonder: 0.3,  reflection: 0,    mischief: 0 },
	// ── Activity ──
	'activity:haiku':           { wonder: 0.1,  reflection: 0.3,  mischief: 0 },
	'activity:journal':         { wonder: 0,    reflection: 0.4,  mischief: 0 },
	'activity:dispatch':        { wonder: 0.1,  reflection: 0,    mischief: 0.2 },
	'activity:idea':            { wonder: 0.3,  reflection: 0,    mischief: 0.1 },
	'activity:noticing':        { wonder: 0.2,  reflection: 0.2,  mischief: 0 },
	'activity:debrief':         { wonder: 0.2,  reflection: 0.3,  mischief: 0 },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd beau-terminal && npx vitest run src/lib/personality/rule-meta.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add beau-terminal/src/lib/personality/rule-meta.ts beau-terminal/src/lib/personality/rule-meta.test.ts
git commit -m "feat: client-safe signal rule meta map (21 rules)"
```

---

### Task 2: SVG Scale Utility

Thin charting helpers for the Personality Timeline widget. Two scale functions + a polyline path builder.

**Files:**
- Create: `beau-terminal/src/lib/widgets/terminal/personality-chart.ts`
- Test: `beau-terminal/src/lib/widgets/terminal/personality-chart.test.ts`

- [ ] **Step 1: Write the failing test**

Create `beau-terminal/src/lib/widgets/terminal/personality-chart.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { scaleLinear, scaleTime, polylinePath, areaPath } from './personality-chart.js';

describe('scaleLinear', () => {
	it('maps domain to range', () => {
		const s = scaleLinear([0, 1], [0, 100]);
		expect(s(0)).toBe(0);
		expect(s(0.5)).toBe(50);
		expect(s(1)).toBe(100);
	});

	it('handles inverted range (SVG y-axis)', () => {
		const s = scaleLinear([0, 1], [100, 0]);
		expect(s(0)).toBe(100);
		expect(s(1)).toBe(0);
		expect(s(0.5)).toBe(50);
	});

	it('extrapolates outside domain', () => {
		const s = scaleLinear([0, 1], [0, 100]);
		expect(s(1.5)).toBe(150);
		expect(s(-0.5)).toBe(-50);
	});
});

describe('scaleTime', () => {
	it('maps dates to pixel range', () => {
		const d0 = new Date('2026-03-23T00:00:00Z');
		const d1 = new Date('2026-03-24T00:00:00Z');
		const s = scaleTime([d0, d1], [0, 400]);
		expect(s(d0)).toBe(0);
		expect(s(d1)).toBe(400);
		// Midpoint (12h)
		const mid = new Date('2026-03-23T12:00:00Z');
		expect(s(mid)).toBeCloseTo(200, 0);
	});
});

describe('polylinePath', () => {
	it('builds SVG path from points', () => {
		const points = [
			{ x: 0, y: 100 },
			{ x: 50, y: 60 },
			{ x: 100, y: 80 },
		];
		expect(polylinePath(points)).toBe('M0,100 L50,60 L100,80');
	});

	it('returns empty string for no points', () => {
		expect(polylinePath([])).toBe('');
	});

	it('handles single point', () => {
		expect(polylinePath([{ x: 10, y: 20 }])).toBe('M10,20');
	});

	it('rounds coordinates to 1 decimal', () => {
		const points = [
			{ x: 0.123, y: 99.876 },
			{ x: 50.555, y: 60.444 },
		];
		expect(polylinePath(points)).toBe('M0.1,99.9 L50.6,60.4');
	});
});

describe('areaPath', () => {
	it('closes path to baseline', () => {
		const points = [
			{ x: 0, y: 40 },
			{ x: 50, y: 20 },
			{ x: 100, y: 60 },
		];
		expect(areaPath(points, 100)).toBe('M0,40 L50,20 L100,60 L100,100 L0,100 Z');
	});

	it('returns empty string for no points', () => {
		expect(areaPath([], 100)).toBe('');
	});

	it('handles single point', () => {
		expect(areaPath([{ x: 10, y: 20 }], 100)).toBe('M10,20 L10,100 L10,100 Z');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd beau-terminal && npx vitest run src/lib/widgets/terminal/personality-chart.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `beau-terminal/src/lib/widgets/terminal/personality-chart.ts`:

```typescript
/**
 * Minimal SVG charting utilities for the Personality Timeline widget.
 * No external dependencies — just math.
 */

/** Linear scale: maps a numeric domain to a pixel range. */
export function scaleLinear(domain: [number, number], range: [number, number]) {
	const [d0, d1] = domain;
	const [r0, r1] = range;
	const dSpan = d1 - d0;
	const rSpan = r1 - r0;
	return (value: number): number => r0 + ((value - d0) / dSpan) * rSpan;
}

/** Time scale: maps a Date domain to a pixel range. */
export function scaleTime(domain: [Date, Date], range: [number, number]) {
	const [d0, d1] = domain;
	const t0 = d0.getTime();
	const t1 = d1.getTime();
	const [r0, r1] = range;
	const tSpan = t1 - t0;
	const rSpan = r1 - r0;
	return (value: Date): number => r0 + ((value.getTime() - t0) / tSpan) * rSpan;
}

/** Build an SVG path string from an array of {x, y} points. */
export function polylinePath(points: Array<{ x: number; y: number }>): string {
	if (points.length === 0) return '';
	const r = (n: number) => Math.round(n * 10) / 10;
	return points
		.map((p, i) => `${i === 0 ? 'M' : 'L'}${r(p.x)},${r(p.y)}`)
		.join(' ');
}

/** Build an SVG area path (line + close to bottom). */
export function areaPath(
	points: Array<{ x: number; y: number }>,
	baseline: number,
): string {
	if (points.length === 0) return '';
	const line = polylinePath(points);
	const r = (n: number) => Math.round(n * 10) / 10;
	const last = points[points.length - 1];
	const first = points[0];
	return `${line} L${r(last.x)},${r(baseline)} L${r(first.x)},${r(baseline)} Z`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd beau-terminal && npx vitest run src/lib/widgets/terminal/personality-chart.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add beau-terminal/src/lib/widgets/terminal/personality-chart.ts beau-terminal/src/lib/widgets/terminal/personality-chart.test.ts
git commit -m "feat: SVG scale utility for personality timeline charting"
```

---

### Task 3: Inner Weather Widget

The ambient "how is Beau feeling" widget. Prose-first with mode header and whisper bars.

**Files:**
- Create: `beau-terminal/src/lib/widgets/terminal/InnerWeatherWidget.svelte`
- Modify: `beau-terminal/src/lib/widgets/registry.ts`

- [ ] **Step 1: Create the widget component**

Create `beau-terminal/src/lib/widgets/terminal/InnerWeatherWidget.svelte`:

```svelte
<script lang="ts">
	import { beauState, MODE_LABELS } from '$lib/stores/beau.svelte.js';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	const v = $derived(beauState.personalityVector);
	const mode = $derived(beauState.mode);
	const interpretation = $derived(beauState.personalityInterpretation);

	/** Dominant dimension determines the mode dot color. */
	const dominantColor = $derived.by(() => {
		if (v.reflection >= v.wonder && v.reflection >= v.mischief) return 'var(--pw-reflection)';
		if (v.mischief >= v.wonder && v.mischief >= v.reflection) return 'var(--pw-mischief)';
		return 'var(--pw-wonder)';
	});

	/** Whisper bar widths proportional to value (max ~40px). */
	const bars = $derived([
		{ label: 'W', value: v.wonder, color: 'var(--pw-wonder)' },
		{ label: 'R', value: v.reflection, color: 'var(--pw-reflection)' },
		{ label: 'M', value: v.mischief, color: 'var(--pw-mischief)' },
	]);
</script>

<div class="inner-weather">
	<!-- Mode header -->
	<div class="mode-header">
		<span class="mode-dot" style="background:{dominantColor};box-shadow:0 0 6px {dominantColor};"></span>
		<span class="mode-label">{(MODE_LABELS[mode] ?? mode).toUpperCase()}</span>
	</div>

	<!-- Interpretation (hero text) -->
	<div class="interpretation">
		{#if interpretation}
			{interpretation}
		{:else}
			<span class="waiting">waiting for first reading...</span>
		{/if}
	</div>

	<!-- Whisper bars -->
	<div class="whisper-bars">
		{#each bars as bar}
			<div class="whisper-bar">
				<div
					class="whisper-fill"
					style="width:{bar.value * 40}px;background:linear-gradient(90deg,var(--bmo-bg),{bar.color});opacity:{0.3 + bar.value * 0.4};"
				></div>
				<span class="whisper-label">{bar.label}</span>
			</div>
		{/each}
	</div>
</div>

<style>
	.inner-weather {
		--pw-wonder: #00e5a0;
		--pw-reflection: #6ec6ff;
		--pw-mischief: #ffd700;

		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', Courier, monospace;
	}

	.mode-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.mode-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.mode-label {
		font-size: 0.625rem;
		letter-spacing: 0.2em;
		color: var(--bmo-muted);
	}

	.interpretation {
		flex: 1;
		font-size: 0.875rem;
		line-height: 1.7;
		color: var(--bmo-text);
	}

	.waiting {
		color: var(--bmo-muted);
		font-style: italic;
	}

	.whisper-bars {
		display: flex;
		gap: 0.75rem;
		margin-top: 1rem;
	}

	.whisper-bar {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.whisper-fill {
		height: 3px;
		border-radius: 2px;
		transition: width 0.6s ease, opacity 0.6s ease;
	}

	.whisper-label {
		font-size: 0.5625rem;
		color: var(--bmo-muted);
	}
</style>
```

- [ ] **Step 2: Register in widget registry**

In `beau-terminal/src/lib/widgets/registry.ts`, add to the `identity` section (after existing identity widgets like `soul-code`, `natal-chart`, `voice`):

```typescript
	'inner-weather': {
		id: 'inner-weather',
		label: 'Inner Weather',
		description: "beau's self-narration — interpretation, mode, and vector whisper",
		icon: '\u{1F30A}',
		category: 'identity',
		component: () => import('./terminal/InnerWeatherWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 2 },
		configSchema: [],
		dataKind: 'websocket',
	},
```

- [ ] **Step 3: Verify dev server compiles**

Run: `cd beau-terminal && npx vite build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add beau-terminal/src/lib/widgets/terminal/InnerWeatherWidget.svelte beau-terminal/src/lib/widgets/registry.ts
git commit -m "feat: Inner Weather widget — personality interpretation + mode + whisper bars"
```

---

### Task 4: Vector Gauge Widget

Live diagnostic view — horizontal bars with gradient fills and signal/momentum layer toggle.

**Files:**
- Create: `beau-terminal/src/lib/widgets/terminal/VectorGaugeWidget.svelte`
- Modify: `beau-terminal/src/lib/widgets/registry.ts`

- [ ] **Step 1: Create the widget component**

Create `beau-terminal/src/lib/widgets/terminal/VectorGaugeWidget.svelte`:

```svelte
<script lang="ts">
	import { beauState, MODE_LABELS } from '$lib/stores/beau.svelte.js';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	let showLayers = $state(typeof config.showLayers === 'boolean' ? config.showLayers : false);

	const v = $derived(beauState.personalityVector);
	const sig = $derived(beauState.signalLayer);
	const mom = $derived(beauState.momentumLayer);
	const mode = $derived(beauState.mode);

	const dimensions = $derived([
		{ key: 'wonder', label: 'WONDER', color: 'var(--pw-wonder)', blend: v.wonder, signal: sig.wonder, momentum: mom.wonder },
		{ key: 'reflection', label: 'REFLECTION', color: 'var(--pw-reflection)', blend: v.reflection, signal: sig.reflection, momentum: mom.reflection },
		{ key: 'mischief', label: 'MISCHIEF', color: 'var(--pw-mischief)', blend: v.mischief, signal: sig.mischief, momentum: mom.mischief },
	]);

	const dominantColor = $derived.by(() => {
		if (v.reflection >= v.wonder && v.reflection >= v.mischief) return 'var(--pw-reflection)';
		if (v.mischief >= v.wonder && v.mischief >= v.reflection) return 'var(--pw-mischief)';
		return 'var(--pw-wonder)';
	});
</script>

<div class="vector-gauge">
	<!-- Header -->
	<div class="gauge-header">
		<span class="widget-label">VECTOR</span>
		<div class="toggle">
			<button
				class="toggle-btn"
				class:active={!showLayers}
				onclick={() => showLayers = false}
			>BLENDED</button>
			<button
				class="toggle-btn"
				class:active={showLayers}
				onclick={() => showLayers = true}
			>LAYERS</button>
		</div>
	</div>

	<!-- Bars -->
	<div class="bars">
		{#each dimensions as dim}
			<div class="dimension">
				{#if showLayers}
					<!-- Layer mode: signal + momentum sub-bars -->
					<div class="dim-header">
						<span class="dim-label" style="color:{dim.color};">{dim.label}</span>
						<span class="dim-blend">blend {dim.blend.toFixed(2)}</span>
					</div>
					<div class="layer-row">
						<span class="layer-label">SIG</span>
						<div class="bar-track">
							<div
								class="bar-fill layer-signal"
								style="width:{dim.signal * 100}%;background:{dim.color};opacity:0.6;"
							></div>
						</div>
						<span class="layer-value">{dim.signal.toFixed(2)}</span>
					</div>
					<div class="layer-row">
						<span class="layer-label">MOM</span>
						<div class="bar-track">
							<div
								class="bar-fill layer-momentum"
								style="width:{dim.momentum * 100}%;background:{dim.color};opacity:0.3;"
							></div>
						</div>
						<span class="layer-value">{dim.momentum.toFixed(2)}</span>
					</div>
				{:else}
					<!-- Blended mode: single bar per dimension -->
					<div class="dim-header">
						<span class="dim-label" style="color:{dim.color};">{dim.label}</span>
						<span class="dim-value">{dim.blend.toFixed(2)}</span>
					</div>
					<div class="bar-track blended">
						<div
							class="bar-fill"
							style="width:{dim.blend * 100}%;background:linear-gradient(90deg,var(--bmo-surface),{dim.color});box-shadow:0 0 8px color-mix(in srgb, {dim.color} {Math.round(dim.blend * 60)}%, transparent);"
						></div>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Mode footer -->
	<div class="mode-footer">
		<span class="mode-dot" style="background:{dominantColor};box-shadow:0 0 6px {dominantColor};"></span>
		<span class="mode-name">{(MODE_LABELS[mode] ?? mode).toUpperCase()}</span>
	</div>
</div>

<style>
	.vector-gauge {
		--pw-wonder: #00e5a0;
		--pw-reflection: #6ec6ff;
		--pw-mischief: #ffd700;

		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', Courier, monospace;
	}

	.gauge-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.widget-label {
		font-size: 0.75rem;
		letter-spacing: 0.15em;
		color: var(--bmo-muted);
	}

	.toggle {
		display: flex;
		gap: 0.25rem;
	}

	.toggle-btn {
		background: none;
		border: none;
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
		font-family: inherit;
		font-size: 0.5625rem;
		letter-spacing: 0.05em;
		color: var(--bmo-muted);
		cursor: pointer;
	}

	.toggle-btn.active {
		background: var(--bmo-border);
		color: var(--bmo-green);
	}

	.bars {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		flex: 1;
	}

	.dimension {
		display: flex;
		flex-direction: column;
	}

	.dim-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.25rem;
	}

	.dim-label {
		font-size: 0.625rem;
		letter-spacing: 0.15em;
	}

	.dim-value, .dim-blend {
		font-size: 0.625rem;
		color: var(--bmo-muted);
	}

	.bar-track {
		height: 4px;
		background: var(--bmo-surface);
		border-radius: 3px;
		overflow: hidden;
	}

	.bar-track.blended {
		height: 6px;
	}

	.bar-fill {
		height: 100%;
		border-radius: 3px;
		transition: width 0.6s ease;
	}

	.layer-row {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: 0.1875rem;
	}

	.layer-label {
		font-size: 0.5rem;
		color: var(--bmo-muted);
		width: 1.5rem;
	}

	.layer-value {
		font-size: 0.5rem;
		color: var(--bmo-border);
		width: 1.75rem;
		text-align: right;
	}

	.mode-footer {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--bmo-border);
		margin-top: auto;
	}

	.mode-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.mode-name {
		font-size: 0.5625rem;
		letter-spacing: 0.15em;
		color: var(--bmo-muted);
	}
</style>
```

- [ ] **Step 2: Register in widget registry**

In `beau-terminal/src/lib/widgets/registry.ts`, add after `inner-weather`:

```typescript
	'vector-gauge': {
		id: 'vector-gauge',
		label: 'Vector Gauge',
		description: 'live personality vector bars with signal/momentum layer toggle',
		icon: '\u{1F4CA}',
		category: 'identity',
		component: () => import('./terminal/VectorGaugeWidget.svelte'),
		defaultPosition: { colSpan: 3, rowSpan: 2 },
		configSchema: [
			{
				key: 'showLayers',
				label: 'Show Layers',
				type: 'boolean',
				default: false,
			},
		],
		dataKind: 'websocket',
	},
```

- [ ] **Step 3: Verify dev server compiles**

Run: `cd beau-terminal && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add beau-terminal/src/lib/widgets/terminal/VectorGaugeWidget.svelte beau-terminal/src/lib/widgets/registry.ts
git commit -m "feat: Vector Gauge widget — live bars with signal/momentum layer toggle"
```

---

### Task 5: Signal Sources Widget

Transparency widget — shows which signal rules are firing and their delta contributions.

**Files:**
- Create: `beau-terminal/src/lib/widgets/terminal/SignalSourcesWidget.svelte`
- Modify: `beau-terminal/src/lib/widgets/registry.ts`

- [ ] **Step 1: Create the widget component**

Create `beau-terminal/src/lib/widgets/terminal/SignalSourcesWidget.svelte`:

```svelte
<script lang="ts">
	import { beauState } from '$lib/stores/beau.svelte.js';
	import { SIGNAL_RULE_META, type RuleDelta } from '$lib/personality/rule-meta.js';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	const TOTAL_RULES = Object.keys(SIGNAL_RULE_META).length;
	const ALL_RULE_NAMES = Object.keys(SIGNAL_RULE_META);

	const activeSources = $derived(beauState.signalSources ?? []);

	const activeRules = $derived(
		activeSources
			.filter((name: string) => name in SIGNAL_RULE_META)
			.map((name: string) => ({ name, delta: SIGNAL_RULE_META[name] }))
	);

	const inactiveNames = $derived(
		ALL_RULE_NAMES.filter((name) => !activeSources.includes(name))
	);

	/** Border color = color of the strongest absolute contribution. */
	function borderColor(delta: RuleDelta): string {
		const aw = Math.abs(delta.wonder);
		const ar = Math.abs(delta.reflection);
		const am = Math.abs(delta.mischief);
		if (ar >= aw && ar >= am) return 'var(--pw-reflection)';
		if (am >= aw && am >= ar) return 'var(--pw-mischief)';
		return 'var(--pw-wonder)';
	}

	/** Format a delta value: "+0.3" or "−0.2". */
	function fmt(v: number): string {
		if (v === 0) return '';
		return (v > 0 ? '+' : '\u2212') + Math.abs(v).toFixed(1);
	}

	const DIM_COLORS: Record<string, string> = {
		W: 'var(--pw-wonder)',
		R: 'var(--pw-reflection)',
		M: 'var(--pw-mischief)',
	};
</script>

<div class="signal-sources">
	<!-- Header -->
	<div class="sources-header">
		<span class="widget-label">ACTIVE SIGNALS</span>
		<span class="counter">{activeRules.length} of {TOTAL_RULES}</span>
	</div>

	<!-- Active rules -->
	<div class="active-list">
		{#each activeRules as rule (rule.name)}
			<div class="rule-card" style="border-left-color:{borderColor(rule.delta)};">
				<span class="rule-name">{rule.name}</span>
				<div class="rule-deltas">
					{#if rule.delta.wonder !== 0}
						<span class="delta"><span class="delta-dim">W</span><span style="color:var(--pw-wonder);">{fmt(rule.delta.wonder)}</span></span>
					{/if}
					{#if rule.delta.reflection !== 0}
						<span class="delta"><span class="delta-dim">R</span><span style="color:var(--pw-reflection);">{fmt(rule.delta.reflection)}</span></span>
					{/if}
					{#if rule.delta.mischief !== 0}
						<span class="delta"><span class="delta-dim">M</span><span style="color:var(--pw-mischief);">{fmt(rule.delta.mischief)}</span></span>
					{/if}
				</div>
			</div>
		{/each}
		{#if activeRules.length === 0}
			<div class="empty">no signals firing</div>
		{/if}
	</div>

	<!-- Inactive divider -->
	{#if inactiveNames.length > 0}
		<div class="inactive-divider">
			<span class="divider-line"></span>
			<span class="divider-label">INACTIVE \u00B7 {inactiveNames.length}</span>
			<span class="divider-line"></span>
		</div>

		<div class="inactive-list">
			{inactiveNames.join(' \u00B7 ')}
		</div>
	{/if}
</div>

<style>
	.signal-sources {
		--pw-wonder: #00e5a0;
		--pw-reflection: #6ec6ff;
		--pw-mischief: #ffd700;

		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', Courier, monospace;
		overflow-y: auto;
	}

	.sources-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.875rem;
	}

	.widget-label {
		font-size: 0.75rem;
		letter-spacing: 0.15em;
		color: var(--bmo-muted);
	}

	.counter {
		font-size: 0.5625rem;
		color: var(--bmo-border);
	}

	.active-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 0.875rem;
	}

	.rule-card {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.5rem;
		background: var(--bmo-surface);
		border-radius: 4px;
		border-left: 2px solid var(--bmo-border);
	}

	.rule-name {
		flex: 1;
		font-size: 0.6875rem;
		color: var(--bmo-text);
	}

	.rule-deltas {
		display: flex;
		gap: 0.375rem;
	}

	.delta {
		font-size: 0.5625rem;
	}

	.delta-dim {
		color: var(--bmo-muted);
		margin-right: 1px;
	}

	.empty {
		font-size: 0.75rem;
		color: var(--bmo-muted);
		letter-spacing: 0.1em;
	}

	.inactive-divider {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.divider-line {
		flex: 1;
		height: 1px;
		background: var(--bmo-border);
	}

	.divider-label {
		font-size: 0.5rem;
		letter-spacing: 0.15em;
		color: var(--bmo-border);
		white-space: nowrap;
	}

	.inactive-list {
		font-size: 0.5625rem;
		color: var(--bmo-border);
		line-height: 1.6;
	}
</style>
```

- [ ] **Step 2: Register in widget registry**

In `beau-terminal/src/lib/widgets/registry.ts`, add after `vector-gauge`:

```typescript
	'signal-sources': {
		id: 'signal-sources',
		label: 'Signal Sources',
		description: 'which of the 21 signal rules are currently firing and why',
		icon: '\u{1F50D}',
		category: 'identity',
		component: () => import('./terminal/SignalSourcesWidget.svelte'),
		defaultPosition: { colSpan: 3, rowSpan: 3 },
		configSchema: [],
		dataKind: 'websocket',
	},
```

- [ ] **Step 3: Verify dev server compiles**

Run: `cd beau-terminal && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add beau-terminal/src/lib/widgets/terminal/SignalSourcesWidget.svelte beau-terminal/src/lib/widgets/registry.ts
git commit -m "feat: Signal Sources widget — active rules with delta contributions"
```

---

### Task 6: Personality Timeline Widget + Data Loader

The crown jewel — historical vector chart with ambient/detail toggle. Database-backed with SVG rendering.

**Files:**
- Create: `beau-terminal/src/lib/widgets/terminal/PersonalityTimelineWidget.svelte`
- Modify: `beau-terminal/src/lib/widgets/registry.ts`
- Modify: `beau-terminal/src/lib/server/widgets/loaders.ts`

- [ ] **Step 1: Add the data loader**

In `beau-terminal/src/lib/server/widgets/loaders.ts`, add a new case before the `default:` case:

```typescript
    case 'personality-timeline': {
      const range = typeof config.timeRange === 'string' ? config.timeRange : '24h';
      const rangeMs: Record<string, number> = {
        '6h': 6 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
      };
      const ms = rangeMs[range] ?? rangeMs['24h'];
      const cutoff = new Date(Date.now() - ms).toISOString().replace('T', ' ').slice(0, 19);

      const rows = db.select().from(schema.personalitySnapshots)
        .where(sql`${schema.personalitySnapshots.timestamp} >= ${cutoff}`)
        .orderBy(asc(schema.personalitySnapshots.timestamp))
        .limit(500)
        .all();

      const snapshots = rows.map(r => ({
        timestamp: r.timestamp,
        wonder: r.wonder,
        reflection: r.reflection,
        mischief: r.mischief,
        signalWonder: r.signalWonder,
        signalReflection: r.signalReflection,
        signalMischief: r.signalMischief,
        momentumWonder: r.momentumWonder,
        momentumReflection: r.momentumReflection,
        momentumMischief: r.momentumMischief,
        derivedMode: r.derivedMode,
        interpretation: r.interpretation ?? '',
        sources: (() => { try { return JSON.parse(r.sources ?? '[]'); } catch { return []; } })(),
        isNotable: r.isNotable === 1,
      }));

      // Derive mode transitions
      const modeTransitions: Array<{ timestamp: string; mode: string }> = [];
      for (let i = 0; i < snapshots.length; i++) {
        if (i === 0 || snapshots[i].derivedMode !== snapshots[i - 1].derivedMode) {
          modeTransitions.push({ timestamp: snapshots[i].timestamp, mode: snapshots[i].derivedMode });
        }
      }

      return { snapshots, modeTransitions };
    }
```

Also add `sql` to the imports at the top of `loaders.ts` if not already present:

```typescript
import { asc, desc, eq, sql } from 'drizzle-orm';
```

- [ ] **Step 2: Create the widget component**

Create `beau-terminal/src/lib/widgets/terminal/PersonalityTimelineWidget.svelte`:

```svelte
<script lang="ts">
	import { scaleLinear, scaleTime, polylinePath, areaPath } from './personality-chart.js';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	let detailMode = $state(config.defaultMode === 'detail');

	type Snapshot = {
		timestamp: string;
		wonder: number; reflection: number; mischief: number;
		signalWonder: number; signalReflection: number; signalMischief: number;
		momentumWonder: number; momentumReflection: number; momentumMischief: number;
		derivedMode: string; interpretation: string; sources: string[]; isNotable: boolean;
	};
	type ModeTransition = { timestamp: string; mode: string };
	type TimelineData = { snapshots: Snapshot[]; modeTransitions: ModeTransition[] };

	const td: TimelineData | null = $derived(
		data && typeof data === 'object' && 'snapshots' in (data as object)
			? (data as TimelineData)
			: null
	);

	const timeRange = $derived(typeof config.timeRange === 'string' ? config.timeRange : '24h');

	// Chart dimensions
	const W = 800;
	const H = 180;
	const PAD = $derived({ top: 8, right: 8, bottom: 28, left: detailMode ? 28 : 8 });
	const chartW = $derived(W - PAD.left - PAD.right);
	const chartH = $derived(H - PAD.top - PAD.bottom);

	// Scales
	const dates = $derived(td?.snapshots.map(s => new Date(s.timestamp.replace(' ', 'T'))) ?? []);
	const xScale = $derived(
		dates.length >= 2
			? scaleTime([dates[0], dates[dates.length - 1]], [0, chartW])
			: (_d: Date) => 0
	);
	const yScale = $derived(scaleLinear([0, 1], [chartH, 0]));

	// Dimension configs
	const DIMS = [
		{ key: 'wonder', sigKey: 'signalWonder', momKey: 'momentumWonder', color: '#00e5a0', fill: 0.08 },
		{ key: 'reflection', sigKey: 'signalReflection', momKey: 'momentumReflection', color: '#6ec6ff', fill: 0.06 },
		{ key: 'mischief', sigKey: 'signalMischief', momKey: 'momentumMischief', color: '#ffd700', fill: 0.05 },
	] as const;

	type DimKey = 'wonder' | 'reflection' | 'mischief';
	type SigKey = 'signalWonder' | 'signalReflection' | 'signalMischief';
	type MomKey = 'momentumWonder' | 'momentumReflection' | 'momentumMischief';

	// Line/area paths
	function dimPoints(key: DimKey) {
		if (!td) return [];
		return td.snapshots.map((s, i) => ({
			x: xScale(dates[i]),
			y: yScale(s[key]),
		}));
	}

	function sigPoints(key: SigKey) {
		if (!td) return [];
		return td.snapshots.map((s, i) => ({
			x: xScale(dates[i]),
			y: yScale(s[key]),
		}));
	}

	function momPoints(key: MomKey) {
		if (!td) return [];
		return td.snapshots.map((s, i) => ({
			x: xScale(dates[i]),
			y: yScale(s[key]),
		}));
	}

	// Mode band color
	const MODE_COLORS: Record<string, string> = {
		ambient: '#00e5a0',
		witness: '#00e5a0',
		collaborator: '#ffd700',
		archivist: '#6ec6ff',
		social: '#ffd700',
	};

	// Mode bands
	const modeBands = $derived.by(() => {
		if (!td || td.modeTransitions.length === 0 || dates.length < 2) return [];
		const bands: Array<{ x: number; w: number; mode: string; color: string }> = [];
		for (let i = 0; i < td.modeTransitions.length; i++) {
			const start = xScale(new Date(td.modeTransitions[i].timestamp.replace(' ', 'T')));
			const end = i < td.modeTransitions.length - 1
				? xScale(new Date(td.modeTransitions[i + 1].timestamp.replace(' ', 'T')))
				: chartW;
			bands.push({
				x: start,
				w: end - start,
				mode: td.modeTransitions[i].mode,
				color: MODE_COLORS[td.modeTransitions[i].mode] ?? '#00e5a0',
			});
		}
		return bands;
	});

	// Notable markers
	const notables = $derived.by(() => {
		if (!td) return [];
		return td.snapshots
			.map((s, i) => ({ ...s, cx: xScale(dates[i]) }))
			.filter(s => s.isNotable);
	});

	// Hover state
	let hoverX = $state<number | null>(null);
	let hoverSnap = $derived.by(() => {
		if (hoverX === null || !td || dates.length === 0) return null;
		// Find nearest snapshot
		let best = 0;
		let bestDist = Infinity;
		for (let i = 0; i < dates.length; i++) {
			const dist = Math.abs(xScale(dates[i]) - hoverX);
			if (dist < bestDist) { bestDist = dist; best = i; }
		}
		return td.snapshots[best];
	});

	function onMouseMove(e: MouseEvent) {
		const svg = (e.currentTarget as SVGSVGElement);
		const rect = svg.getBoundingClientRect();
		const svgX = ((e.clientX - rect.left) / rect.width) * W;
		hoverX = svgX - PAD.left;
	}

	function onMouseLeave() {
		hoverX = null;
	}

	// Time axis labels
	const timeLabels = $derived.by(() => {
		if (dates.length < 2) return [];
		const first = dates[0];
		const last = dates[dates.length - 1];
		const count = 5;
		const labels: Array<{ x: number; text: string }> = [];
		for (let i = 0; i < count; i++) {
			const t = new Date(first.getTime() + (last.getTime() - first.getTime()) * (i / (count - 1)));
			const x = xScale(t);
			const text = i === count - 1 ? 'NOW' : `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
			labels.push({ x, text });
		}
		return labels;
	});

	// Grid lines
	const gridYs = $derived([0.25, 0.5, 0.75].map(v => yScale(v)));
</script>

<div class="personality-timeline">
	<!-- Header -->
	<div class="tl-header">
		<span class="widget-label">PERSONALITY \u00B7 {timeRange.toUpperCase()}</span>
		<div class="toggle">
			<button class="toggle-btn" class:active={!detailMode} onclick={() => detailMode = false}>AMBIENT</button>
			<button class="toggle-btn" class:active={detailMode} onclick={() => detailMode = true}>DETAIL</button>
		</div>
	</div>

	{#if td && td.snapshots.length > 1}
		<!-- Chart -->
		<svg
			viewBox="0 0 {W} {H}"
			class="chart-svg"
			onmousemove={onMouseMove}
			onmouseleave={onMouseLeave}
		>
			<g transform="translate({PAD.left},{PAD.top})">
				<!-- Grid lines -->
				{#each gridYs as gy}
					<line x1="0" y1={gy} x2={chartW} y2={gy} stroke="var(--bmo-border)" stroke-width="0.5" stroke-dasharray="2,4" />
				{/each}

				<!-- Y-axis labels (detail mode) -->
				{#if detailMode}
					{#each [1.0, 0.75, 0.5, 0.25] as v}
						<text x="-4" y={yScale(v) + 3} text-anchor="end" fill="var(--bmo-border)" font-size="8" font-family="Courier New">{v.toFixed(1)}</text>
					{/each}
				{/if}

				<!-- Area fills (ambient) -->
				{#each DIMS as dim}
					<path d={areaPath(dimPoints(dim.key), chartH)} fill={dim.color} opacity={dim.fill} />
				{/each}

				<!-- Blended lines -->
				{#each DIMS as dim}
					<path d={polylinePath(dimPoints(dim.key))} fill="none" stroke={dim.color} stroke-width="1.5" opacity="0.7" />
				{/each}

				<!-- Signal layer lines (detail mode) -->
				{#if detailMode}
					{#each DIMS as dim}
						<path d={polylinePath(sigPoints(dim.sigKey))} fill="none" stroke={dim.color} stroke-width="0.8" stroke-dasharray="3,3" opacity="0.5" />
					{/each}
					{#each DIMS as dim}
						<path d={polylinePath(momPoints(dim.momKey))} fill="none" stroke={dim.color} stroke-width="0.8" stroke-dasharray="1,3" opacity="0.3" />
					{/each}
				{/if}

				<!-- Mode bands -->
				{#each modeBands as band}
					<rect x={band.x} y={chartH + 4} width={band.w} height="8" rx="1" fill={band.color} opacity="0.12" />
					{#if band.w > 40}
						<text x={band.x + band.w / 2} y={chartH + 10} text-anchor="middle" fill="var(--bmo-muted)" font-size="5" font-family="Courier New">{band.mode}</text>
					{/if}
				{/each}

				<!-- Notable markers (detail mode) -->
				{#if detailMode}
					{#each notables as n}
						<line x1={n.cx} y1="0" x2={n.cx} y2={chartH} stroke="var(--bmo-green)" stroke-width="0.5" opacity="0.4" />
						<text x={n.cx} y="-2" text-anchor="middle" fill="var(--bmo-green)" font-size="5" font-family="Courier New" opacity="0.6">\u2605</text>
					{/each}
				{/if}

				<!-- Hover crosshair -->
				{#if hoverX !== null && hoverSnap}
					<line x1={hoverX} y1="0" x2={hoverX} y2={chartH} stroke="var(--bmo-muted)" stroke-width="0.5" stroke-dasharray="2,2" />
					<circle cx={hoverX} cy={yScale(hoverSnap.wonder)} r="3" fill="#00e5a0" stroke="var(--bmo-bg)" stroke-width="1" />
					<circle cx={hoverX} cy={yScale(hoverSnap.reflection)} r="3" fill="#6ec6ff" stroke="var(--bmo-bg)" stroke-width="1" />
					<circle cx={hoverX} cy={yScale(hoverSnap.mischief)} r="3" fill="#ffd700" stroke="var(--bmo-bg)" stroke-width="1" />
				{/if}
			</g>
		</svg>

		<!-- Time axis -->
		<div class="time-axis">
			{#each timeLabels as tl}
				<span class="time-label" style="left:{((tl.x + PAD.left) / W) * 100}%;">{tl.text}</span>
			{/each}
		</div>

		<!-- Hover tooltip -->
		{#if hoverSnap}
			<div class="hover-values">
				<span style="color:#00e5a0;">W:{hoverSnap.wonder.toFixed(2)}</span>
				<span style="color:#6ec6ff;">R:{hoverSnap.reflection.toFixed(2)}</span>
				<span style="color:#ffd700;">M:{hoverSnap.mischief.toFixed(2)}</span>
				{#if detailMode && hoverSnap.sources.length > 0}
					<span class="hover-sources">{hoverSnap.sources.join(' \u00B7 ')}</span>
				{/if}
			</div>
		{/if}

		<!-- Legend -->
		<div class="legend">
			<div class="legend-item"><span class="legend-line" style="background:#00e5a0;"></span> WONDER</div>
			<div class="legend-item"><span class="legend-line" style="background:#6ec6ff;"></span> REFLECTION</div>
			<div class="legend-item"><span class="legend-line" style="background:#ffd700;"></span> MISCHIEF</div>
			{#if detailMode}
				<div class="legend-item"><span class="legend-line dashed" style="background:#00e5a0;"></span> SIGNAL</div>
				<div class="legend-item"><span class="legend-line dotted" style="background:#00e5a0;"></span> MOMENTUM</div>
			{/if}
		</div>
	{:else}
		<div class="empty">
			{#if td && td.snapshots.length <= 1}
				not enough data yet — personality snapshots build over time
			{:else}
				loading timeline...
			{/if}
		</div>
	{/if}
</div>

<style>
	.personality-timeline {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', Courier, monospace;
	}

	.tl-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.widget-label {
		font-size: 0.75rem;
		letter-spacing: 0.15em;
		color: var(--bmo-muted);
	}

	.toggle {
		display: flex;
		gap: 0.25rem;
	}

	.toggle-btn {
		background: none;
		border: none;
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
		font-family: inherit;
		font-size: 0.5625rem;
		letter-spacing: 0.05em;
		color: var(--bmo-muted);
		cursor: pointer;
	}

	.toggle-btn.active {
		background: var(--bmo-border);
		color: var(--bmo-green);
	}

	.chart-svg {
		width: 100%;
		flex: 1;
		min-height: 0;
	}

	.time-axis {
		position: relative;
		height: 1rem;
	}

	.time-label {
		position: absolute;
		transform: translateX(-50%);
		font-size: 0.5rem;
		color: var(--bmo-border);
	}

	.hover-values {
		display: flex;
		gap: 0.75rem;
		font-size: 0.625rem;
		padding: 0.25rem 0;
		flex-wrap: wrap;
	}

	.hover-sources {
		color: var(--bmo-muted);
		font-size: 0.5625rem;
		width: 100%;
	}

	.legend {
		display: flex;
		gap: 1rem;
		justify-content: center;
		padding-top: 0.25rem;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.5rem;
		color: var(--bmo-muted);
	}

	.legend-line {
		display: inline-block;
		width: 12px;
		height: 2px;
		border-radius: 1px;
	}

	.legend-line.dashed {
		background: repeating-linear-gradient(90deg, currentColor 0 3px, transparent 3px 6px) !important;
		height: 1px;
	}

	.legend-line.dotted {
		background: repeating-linear-gradient(90deg, currentColor 0 1px, transparent 1px 4px) !important;
		height: 1px;
	}

	.empty {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		color: var(--bmo-muted);
		letter-spacing: 0.1em;
	}
</style>
```

- [ ] **Step 3: Register in widget registry**

In `beau-terminal/src/lib/widgets/registry.ts`, add after `signal-sources`:

```typescript
	'personality-timeline': {
		id: 'personality-timeline',
		label: 'Personality Timeline',
		description: 'historical vector chart with ambient/detail modes and mode bands',
		icon: '\u{1F4C8}',
		category: 'identity',
		component: () => import('./terminal/PersonalityTimelineWidget.svelte'),
		defaultPosition: { colSpan: 12, rowSpan: 3 },
		configSchema: [
			{
				key: 'timeRange',
				label: 'Time Range',
				type: 'select',
				default: '24h',
				options: [
					{ label: '6 hours', value: '6h' },
					{ label: '24 hours', value: '24h' },
					{ label: '7 days', value: '7d' },
					{ label: '30 days', value: '30d' },
				],
			},
			{
				key: 'defaultMode',
				label: 'Default View',
				type: 'select',
				default: 'ambient',
				options: [
					{ label: 'Ambient', value: 'ambient' },
					{ label: 'Detailed', value: 'detail' },
				],
			},
		],
		dataKind: 'database',
	},
```

- [ ] **Step 4: Verify dev server compiles**

Run: `cd beau-terminal && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add beau-terminal/src/lib/widgets/terminal/PersonalityTimelineWidget.svelte beau-terminal/src/lib/widgets/registry.ts beau-terminal/src/lib/server/widgets/loaders.ts
git commit -m "feat: Personality Timeline widget — SVG area chart with ambient/detail toggle"
```

---

### Task 7: "Beau's Mind" Page Template

Predefined layout that brings all 4 personality widgets together on a custom page.

**Files:**
- Modify: `beau-terminal/src/lib/widgets/templates.ts`

- [ ] **Step 1: Add the template**

In `beau-terminal/src/lib/widgets/templates.ts`, add a new entry to `PAGE_TEMPLATES` after `'daily-review'`:

```typescript
  'beaus-mind': {
    label: "Beau's Mind",
    icon: '◉',
    description: "Personality vector, active signals, mood timeline — Beau's inner world",
    layout: [
      tpl('inner-weather', 0, 0, 6, 2),
      tpl('vector-gauge', 6, 0, 3, 2),
      tpl('signal-sources', 9, 0, 3, 3),
      tpl('personality-timeline', 0, 3, 12, 3),
    ]
  },
```

- [ ] **Step 2: Verify dev server compiles**

Run: `cd beau-terminal && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add beau-terminal/src/lib/widgets/templates.ts
git commit -m "feat: Beau's Mind page template — personality widget dashboard"
```

---

### Task 8: Integration Verification

Final check — run all tests, build clean, and visually verify in the dev server.

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `cd beau-terminal && npx vitest run`
Expected: All tests pass (existing ~205 + 2 new test files).

- [ ] **Step 2: Build production**

Run: `cd beau-terminal && npx vite build`
Expected: Clean build, no errors, no warnings.

- [ ] **Step 3: Dev server smoke test**

Run: `cd beau-terminal && npm run dev`
Then in browser:
1. Open `http://localhost:4242`
2. Press Ctrl+E (edit mode)
3. Create a custom page "Beau's Mind" using the new template
4. Verify all 4 widgets render (Inner Weather shows "waiting for first reading...", Vector Gauge shows resting baseline, Signal Sources shows "no signals firing", Timeline shows "not enough data yet")
5. Verify the widget drawer shows all 4 new widgets with descriptions

- [ ] **Step 4: Update CLAUDE.md widget count**

In `E:\Dev\BMO\CLAUDE.md`, update references from "43 widgets" to "47 widgets" in the Widget System section and registry.ts description.

- [ ] **Step 5: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md widget count to 47 (personality widgets)"
```
