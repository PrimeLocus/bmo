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
		<span class="widget-label">PERSONALITY &middot; {timeRange.toUpperCase()}</span>
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
						<text x={n.cx} y="-2" text-anchor="middle" fill="var(--bmo-green)" font-size="5" font-family="Courier New" opacity="0.6">&#9733;</text>
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
