<script lang="ts">
	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	type IntegrationSummary = {
		name: string;
		icon: string;
		status: string;
	};

	const items: IntegrationSummary[] = $derived(Array.isArray(data) ? (data as IntegrationSummary[]) : []);

	const STATUS_DOT: Record<string, string> = {
		online:  '●',
		offline: '●',
		unknown: '○',
	};

	const STATUS_COLOR: Record<string, string> = {
		online:  'var(--bmo-green)',
		offline: '#d63031',
		unknown: 'var(--bmo-muted)',
	};
</script>

<div class="integrations-widget">
	<div class="widget-label">INTEGRATIONS</div>

	{#if items.length > 0}
		<ul class="integrations-list">
			{#each items as item}
				<li class="integration-row">
					<span class="status-dot" style="color: {STATUS_COLOR[item.status] ?? STATUS_COLOR.unknown}">
						{STATUS_DOT[item.status] ?? '○'}
					</span>
					<span class="icon">{item.icon}</span>
					<span class="name">{item.name}</span>
					<span class="status-label" style="color: {STATUS_COLOR[item.status] ?? STATUS_COLOR.unknown}">
						{item.status}
					</span>
				</li>
			{/each}
		</ul>

		<div class="summary">
			<span style="color: var(--bmo-green)">
				{items.filter(i => i.status === 'online').length} online
			</span>
			<span style="color: var(--bmo-muted)">·</span>
			<span style="color: #d63031">
				{items.filter(i => i.status === 'offline').length} offline
			</span>
			<span style="color: var(--bmo-muted)">·</span>
			<span style="color: var(--bmo-muted)">
				{items.filter(i => i.status === 'unknown').length} unknown
			</span>
		</div>
	{:else}
		<div class="empty">no integrations configured.</div>
	{/if}
</div>

<style>
	.integrations-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', Courier, monospace;
		overflow: hidden;
	}

	.widget-label {
		font-size: 0.75rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--bmo-muted);
		margin-bottom: 0.75rem;
		flex-shrink: 0;
	}

	.integrations-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		overflow-y: auto;
		flex: 1;
	}

	.integration-row {
		display: grid;
		grid-template-columns: 0.9rem 1.2rem 1fr auto;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.75rem;
	}

	.status-dot {
		font-size: 0.55rem;
		text-align: center;
	}

	.icon {
		font-size: 0.8rem;
		text-align: center;
	}

	.name {
		color: var(--bmo-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.status-label {
		font-size: 0.65rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.summary {
		margin-top: 0.75rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--bmo-border);
		font-size: 0.7rem;
		letter-spacing: 0.05em;
		display: flex;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.empty {
		font-size: 0.75rem;
		color: var(--bmo-muted);
		letter-spacing: 0.05em;
		font-style: italic;
	}
</style>
