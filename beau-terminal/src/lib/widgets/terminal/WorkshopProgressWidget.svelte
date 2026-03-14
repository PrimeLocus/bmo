<script lang="ts">
	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	type WorkshopData = {
		partsReceived: number;
		partsTotal: number;
		totalCost: number;
		stepsDone: number;
		stepsTotal: number;
		ideasOpen: number;
		tasksOpen: number;
	};

	const d: WorkshopData | null = $derived(
		data && typeof data === 'object' ? (data as WorkshopData) : null
	);

	const partsPct = $derived(
		d && d.partsTotal > 0 ? Math.round((d.partsReceived / d.partsTotal) * 100) : 0
	);

	const stepsPct = $derived(
		d && d.stepsTotal > 0 ? Math.round((d.stepsDone / d.stepsTotal) * 100) : 0
	);
</script>

<div class="workshop-widget">
	<div class="widget-label">WORKSHOP PROGRESS</div>

	{#if d}
		<div class="rows">
			<a href="/parts" class="stat-row">
				<span class="stat-key">PARTS</span>
				<span class="stat-value">{d.partsReceived} / {d.partsTotal}</span>
			</a>
			<div class="progress-track">
				<div class="progress-bar" style="width: {partsPct}%"></div>
			</div>

			<a href="/software" class="stat-row">
				<span class="stat-key">SOFTWARE</span>
				<span class="stat-value">{d.stepsDone} / {d.stepsTotal}</span>
			</a>
			<div class="progress-track">
				<div class="progress-bar" style="width: {stepsPct}%"></div>
			</div>

			<a href="/ideas" class="stat-row">
				<span class="stat-key">IDEAS OPEN</span>
				<span class="stat-value">{d.ideasOpen}</span>
			</a>

			<a href="/todo" class="stat-row">
				<span class="stat-key">TASKS OPEN</span>
				<span class="stat-value">{d.tasksOpen}</span>
			</a>

			<div class="cost-row">
				<span class="cost-label">TOTAL COST</span>
				<span class="cost-value">${d.totalCost.toFixed(2)}</span>
			</div>
		</div>
	{:else}
		<div class="empty">loading workshop data...</div>
	{/if}
</div>

<style>
	.workshop-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', Courier, monospace;
	}

	.widget-label {
		font-size: 0.75rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--bmo-muted);
		margin-bottom: 1rem;
	}

	.rows {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.stat-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		text-decoration: none;
	}

	.stat-row:hover .stat-key,
	.stat-row:hover .stat-value {
		color: var(--bmo-green);
	}

	.stat-key {
		letter-spacing: 0.1em;
		color: var(--bmo-muted);
		transition: color 0.15s;
	}

	.stat-value {
		color: var(--bmo-text);
		transition: color 0.15s;
	}

	.progress-track {
		height: 3px;
		background: var(--bmo-border);
		border-radius: 1px;
		margin-bottom: 0.25rem;
	}

	.progress-bar {
		height: 3px;
		background: var(--bmo-green);
		border-radius: 1px;
		transition: width 0.3s ease;
	}

	.cost-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--bmo-border);
		margin-top: 0.25rem;
	}

	.cost-label {
		letter-spacing: 0.1em;
		color: var(--bmo-muted);
	}

	.cost-value {
		color: var(--bmo-text);
	}

	.empty {
		font-size: 0.75rem;
		color: var(--bmo-muted);
		letter-spacing: 0.1em;
	}
</style>
