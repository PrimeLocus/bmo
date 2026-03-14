<script lang="ts">
	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	type NatalProfile = {
		locationName: string;
		birthTimestamp: string;
		timezone: string;
		summaryText: string | null;
		latitude: number;
		longitude: number;
		version: number;
		// Chart visualization fields (westernChartJson, vedicChartJson, vargaChartJson)
		// exist in DB schema but are not rendered by this widget — deferred to future phase
	};

	let natal = $derived(data as NatalProfile | null | undefined);
</script>

<div class="natal-widget">
	<div class="section-label">NATAL CHART</div>

	{#if natal}
		<div class="natal-content">
			<div class="location">{natal.locationName}</div>

			{#if natal.birthTimestamp}
				<div class="birth-time">{natal.birthTimestamp}</div>
			{/if}

			{#if natal.timezone}
				<div class="timezone">{natal.timezone}</div>
			{/if}

			{#if natal.summaryText}
				<div class="summary">{natal.summaryText}</div>
			{/if}

			{#if natal.latitude && natal.longitude}
				<div class="coordinates">
					{natal.latitude.toFixed(4)}, {natal.longitude.toFixed(4)}
				</div>
			{/if}
		</div>

		<div class="meta-section">
			Version {natal.version}
		</div>
	{:else}
		<div class="empty-state">
			<div class="empty-text">calculated at emergence</div>
		</div>
	{/if}
</div>

<style>
	.natal-widget {
		width: 100%;
		height: 100%;
		padding: 0.75rem;
		overflow: auto;
		font-family: 'Courier New', Courier, monospace;
	}

	.section-label {
		font-size: 0.65rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--bmo-muted);
		margin-bottom: 1rem;
	}

	.natal-content {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.location {
		font-size: 0.875rem;
		color: var(--bmo-text);
	}

	.birth-time {
		font-size: 0.65rem;
		color: var(--bmo-muted);
	}

	.timezone {
		font-size: 0.65rem;
		color: var(--bmo-muted);
	}

	.summary {
		font-size: 0.65rem;
		line-height: 1.6;
		color: var(--bmo-muted);
		margin-top: 0.25rem;
	}

	.coordinates {
		font-size: 0.6rem;
		color: var(--bmo-muted);
		opacity: 0.7;
		font-variant-numeric: tabular-nums;
	}

	.meta-section {
		margin-top: 1rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--bmo-border);
		font-size: 0.65rem;
		color: var(--bmo-muted);
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem 0;
	}

	.empty-text {
		font-size: 0.875rem;
		font-style: italic;
		color: var(--bmo-muted);
	}
</style>
