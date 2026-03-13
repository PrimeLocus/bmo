<script lang="ts">
	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	type BuildData = {
		partsCount: number;
		totalCost: number;
		doneSteps: number;
		totalSteps: number;
	};

	const buildData: BuildData | null = $derived(
		data && typeof data === 'object' ? (data as BuildData) : null
	);

	const pct = $derived(
		buildData && buildData.totalSteps > 0
			? Math.round((buildData.doneSteps / buildData.totalSteps) * 100)
			: 0
	);
</script>

<div class="build-stats-widget">
	<div class="widget-label">BUILD STATS</div>

	{#if buildData}
		<div class="stats">
			<div class="stat-row">
				<span class="stat-key">PARTS TRACKED</span>
				<span class="stat-value">{buildData.partsCount}</span>
			</div>
			<div class="stat-row">
				<span class="stat-key">TOTAL COST</span>
				<span class="stat-value">${buildData.totalCost.toFixed(2)}</span>
			</div>
			<div class="stat-row">
				<span class="stat-key">SOFTWARE STEPS</span>
				<span class="stat-value">{buildData.doneSteps} / {buildData.totalSteps}</span>
			</div>
			<div class="progress-container">
				<div class="progress-track">
					<div class="progress-bar" style="width: {pct}%"></div>
				</div>
				<div class="progress-label">{pct}% complete</div>
			</div>
		</div>
	{:else}
		<div class="empty">loading build data...</div>
	{/if}
</div>

<style>
	.build-stats-widget {
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

	.stats {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.stat-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
	}

	.stat-key {
		color: var(--bmo-muted);
	}

	.stat-value {
		color: var(--bmo-text);
	}

	.progress-container {
		margin-top: 0.25rem;
	}

	.progress-track {
		height: 4px;
		background: var(--bmo-border);
		border-radius: 1px;
	}

	.progress-bar {
		height: 4px;
		background: var(--bmo-green);
		border-radius: 1px;
		transition: width 0.3s ease;
	}

	.progress-label {
		font-size: 0.75rem;
		color: var(--bmo-muted);
		margin-top: 0.25rem;
	}

	.empty {
		font-size: 0.75rem;
		color: var(--bmo-muted);
		letter-spacing: 0.1em;
	}
</style>
