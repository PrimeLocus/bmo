<script lang="ts">
	import { beauState } from '$lib/stores/beau.svelte.js';

	let { data = null, config = {} }: { data: any; config: Record<string, unknown> } = $props();

	const pressure = $derived(beauState.thoughtPressure ?? 0);
	const pendingCount = $derived(beauState.pendingThoughtCount ?? 0);

	const pending = $derived((data?.pending ?? []) as Array<{
		id: string;
		type: string;
		trigger: string;
		text: string | null;
		status: string;
		priority: number;
		expiresAt: string;
		createdAt: string;
	}>);

	const recent = $derived((data?.recent ?? []) as Array<{
		id: string;
		type: string;
		text: string | null;
		status: string;
		surfacedAt: string | null;
		createdAt: string;
	}>);

	const surfacedToday = $derived(data?.surfacedToday ?? 0);
	const haikuToday = $derived(data?.haikuToday ?? 0);

	const surfaced = $derived(recent.filter((r) => r.status === 'surfaced'));
	const decayed = $derived(recent.filter((r) => r.status === 'decayed' || r.status === 'dropped'));

	/** Return color for a thought type badge. */
	function typeColor(type: string): string {
		if (type === 'haiku') return '#6ec6ff';
		if (type === 'reaction') return '#ffd700';
		return '#00e5a0'; // observation default
	}

	/** Pressure bar fill percentage — clamp 0-100. */
	const pressurePct = $derived(Math.min(100, Math.max(0, pressure * 100)));

	/** Pressure bar color shifts from green → amber → red. */
	const pressureColor = $derived.by(() => {
		if (pressure >= 0.8) return '#d63031';
		if (pressure >= 0.5) return '#ffd700';
		return '#00e5a0';
	});

	/** Compact relative timestamp: "2m ago", "1h ago", etc. */
	function relTime(iso: string | null | undefined): string {
		if (!iso) return '';
		const d = new Date(iso.replace(' ', 'T'));
		if (isNaN(d.getTime())) return '';
		const diffS = Math.round((Date.now() - d.getTime()) / 1000);
		if (diffS < 0) {
			// future — time remaining
			const absS = Math.abs(diffS);
			if (absS < 60) return `${absS}s`;
			if (absS < 3600) return `${Math.round(absS / 60)}m`;
			return `${Math.round(absS / 3600)}h`;
		}
		if (diffS < 60) return `${diffS}s ago`;
		if (diffS < 3600) return `${Math.round(diffS / 60)}m ago`;
		if (diffS < 86400) return `${Math.round(diffS / 3600)}h ago`;
		return `${Math.round(diffS / 86400)}d ago`;
	}

	/** Time remaining until expires — formatted as countdown. */
	function timeRemaining(expiresAt: string | null | undefined): string {
		if (!expiresAt) return '';
		const d = new Date(expiresAt.replace(' ', 'T'));
		if (isNaN(d.getTime())) return '';
		const diffS = Math.round((d.getTime() - Date.now()) / 1000);
		if (diffS <= 0) return 'expired';
		if (diffS < 60) return `${diffS}s`;
		if (diffS < 3600) return `${Math.round(diffS / 60)}m`;
		return `${Math.round(diffS / 3600)}h`;
	}

	/** Truncate text to N chars. */
	function truncate(text: string | null | undefined, n = 60): string {
		if (!text) return '';
		return text.length > n ? text.slice(0, n) + '…' : text;
	}
</script>

<div class="pt-widget">
	<!-- ── Pressure Bar ─────────────────────────── -->
	<div class="section">
		<div class="section-label">THOUGHT PRESSURE</div>
		<div class="pressure-row">
			<div class="pressure-track">
				<div
					class="pressure-fill"
					style="width:{pressurePct}%;background:{pressureColor};box-shadow:0 0 6px color-mix(in srgb,{pressureColor} 60%,transparent);"
				></div>
			</div>
			<span class="pressure-value" style="color:{pressureColor};">{pressure.toFixed(2)}</span>
			{#if pendingCount > 0}
				<span class="pending-badge">{pendingCount}</span>
			{/if}
		</div>
	</div>

	<!-- ── Active Queue ────────────────────────── -->
	<div class="section">
		<div class="section-label">ACTIVE QUEUE</div>
		{#if pending.length === 0}
			<div class="empty">no pending thoughts</div>
		{:else}
			<div class="thought-list">
				{#each pending as t (t.id)}
					<div class="thought-row">
						<span class="type-badge" style="color:{typeColor(t.type)};border-color:{typeColor(t.type)}20;">
							{t.type.toUpperCase()}
						</span>
						<span class="status-tag" class:status-generating={t.status === 'generating'} class:status-ready={t.status === 'ready'}>
							{t.status}
						</span>
						{#if t.text}
							<span class="thought-text">{truncate(t.text)}</span>
						{:else}
							<span class="thought-trigger muted">{truncate(t.trigger, 50)}</span>
						{/if}
						<span class="time-remaining">{timeRemaining(t.expiresAt)}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- ── Daily Counts ────────────────────────── -->
	<div class="section counts-row">
		<span class="count-item">
			<span class="count-num" style="color:var(--bmo-green);">{surfacedToday}</span>
			<span class="count-label">/ 5 thoughts</span>
		</span>
		<span class="count-sep">·</span>
		<span class="count-item">
			<span class="count-num" style="color:#6ec6ff;">{haikuToday}</span>
			<span class="count-label">/ 3 haiku</span>
		</span>
	</div>

	<!-- ── Recently Surfaced ───────────────────── -->
	{#if surfaced.length > 0}
		<div class="section">
			<div class="section-label">RECENTLY SURFACED</div>
			<div class="thought-list">
				{#each surfaced.slice(0, 4) as t (t.id)}
					<div class="thought-row surfaced">
						<span class="type-badge" style="color:{typeColor(t.type)};border-color:{typeColor(t.type)}20;">
							{t.type.toUpperCase()}
						</span>
						<span class="thought-text">{truncate(t.text ?? t.id)}</span>
						<span class="rel-time">{relTime(t.surfacedAt ?? t.createdAt)}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- ── Decayed / Dropped ───────────────────── -->
	{#if decayed.length > 0}
		<div class="section">
			<div class="section-label decayed-label">DECAYED</div>
			<div class="thought-list">
				{#each decayed.slice(0, 3) as t (t.id)}
					<div class="thought-row decayed">
						<span class="type-badge decayed-type">{t.type.toUpperCase()}</span>
						<span class="thought-text decayed-text">{truncate(t.text ?? t.trigger, 50)}</span>
						<span class="rel-time decayed-time">{relTime(t.createdAt)}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.pt-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		font-family: 'Courier New', Courier, monospace;
		overflow-y: auto;
	}

	/* ── Section ─────────────────────────────── */

	.section {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.section-label {
		font-size: 0.5625rem;
		letter-spacing: 0.2em;
		color: var(--bmo-muted);
	}

	.decayed-label {
		color: var(--bmo-border);
	}

	/* ── Pressure bar ─────────────────────────── */

	.pressure-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.pressure-track {
		flex: 1;
		height: 6px;
		background: var(--bmo-surface);
		border-radius: 3px;
		overflow: hidden;
	}

	.pressure-fill {
		height: 100%;
		border-radius: 3px;
		transition: width 0.8s ease, background 0.8s ease;
	}

	.pressure-value {
		font-size: 0.625rem;
		letter-spacing: 0.05em;
		min-width: 2rem;
		text-align: right;
		transition: color 0.8s ease;
	}

	.pending-badge {
		font-size: 0.5625rem;
		background: var(--bmo-border);
		color: var(--bmo-text);
		border-radius: 3px;
		padding: 0.0625rem 0.3125rem;
		min-width: 1.25rem;
		text-align: center;
	}

	/* ── Daily counts ─────────────────────────── */

	.counts-row {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0;
		border-top: 1px solid var(--bmo-border);
		border-bottom: 1px solid var(--bmo-border);
	}

	.count-item {
		display: flex;
		align-items: baseline;
		gap: 0.25rem;
	}

	.count-num {
		font-size: 0.875rem;
		font-weight: 600;
	}

	.count-label {
		font-size: 0.5625rem;
		color: var(--bmo-muted);
		letter-spacing: 0.05em;
	}

	.count-sep {
		color: var(--bmo-border);
		font-size: 0.75rem;
	}

	/* ── Thought list rows ──────────────────────── */

	.thought-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.thought-row {
		display: flex;
		align-items: baseline;
		gap: 0.375rem;
		font-size: 0.6875rem;
		line-height: 1.6;
		min-width: 0;
	}

	.type-badge {
		font-size: 0.5rem;
		letter-spacing: 0.08em;
		border: 1px solid transparent;
		border-radius: 2px;
		padding: 0.0625rem 0.25rem;
		flex-shrink: 0;
		white-space: nowrap;
	}

	.decayed-type {
		color: var(--bmo-border) !important;
		border-color: var(--bmo-border) !important;
	}

	.status-tag {
		font-size: 0.5rem;
		letter-spacing: 0.05em;
		color: var(--bmo-muted);
		flex-shrink: 0;
		white-space: nowrap;
	}

	.status-tag.status-generating {
		color: #ffd700;
	}

	.status-tag.status-ready {
		color: var(--bmo-green);
	}

	.thought-text {
		color: var(--bmo-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0;
	}

	.thought-trigger {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0;
	}

	.muted {
		color: var(--bmo-muted);
		font-style: italic;
	}

	.time-remaining {
		font-size: 0.5rem;
		color: var(--bmo-muted);
		flex-shrink: 0;
		white-space: nowrap;
	}

	.rel-time {
		font-size: 0.5rem;
		color: var(--bmo-muted);
		flex-shrink: 0;
		white-space: nowrap;
	}

	/* ── Surfaced rows ─────────────────────────── */

	.thought-row.surfaced .thought-text {
		color: var(--bmo-text);
	}

	/* ── Decayed rows ──────────────────────────── */

	.thought-row.decayed .thought-text,
	.decayed-text {
		color: var(--bmo-border);
		font-style: italic;
	}

	.decayed-time {
		color: var(--bmo-border) !important;
	}

	/* ── Empty state ───────────────────────────── */

	.empty {
		font-size: 0.6875rem;
		color: var(--bmo-muted);
		font-style: italic;
	}
</style>
