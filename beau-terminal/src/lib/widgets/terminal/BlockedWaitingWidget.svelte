<script lang="ts">
	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	type WaitingItem = {
		name: string;
		status: string;
		expectedDelivery: string | null;
	};

	const items: WaitingItem[] = $derived(
		Array.isArray(data) ? (data as WaitingItem[]).slice(0, 8) : []
	);
</script>

<div class="blocked-widget">
	<div class="widget-label">BLOCKED / WAITING</div>

	{#if items.length > 0}
		<ul class="item-list">
			{#each items as item}
				<li class="item-row">
					<span class="item-status" class:shipped={item.status === 'shipped'}>
						{item.status.toUpperCase()}
					</span>
					<span class="item-name">{item.name}</span>
					{#if item.expectedDelivery}
						<span class="item-eta">~{item.expectedDelivery}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<div class="empty">all clear. nothing waiting on anything.</div>
	{/if}
</div>

<style>
	.blocked-widget {
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

	.item-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.item-row {
		display: grid;
		grid-template-columns: 6rem 1fr auto;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.75rem;
	}

	.item-status {
		letter-spacing: 0.1em;
		font-size: 0.7rem;
		color: var(--bmo-muted);
	}

	.item-status.shipped {
		color: var(--bmo-green);
	}

	.item-name {
		color: var(--bmo-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.item-eta {
		color: var(--bmo-muted);
		font-size: 0.7rem;
		white-space: nowrap;
	}

	.empty {
		font-size: 0.75rem;
		color: var(--bmo-muted);
		letter-spacing: 0.05em;
		font-style: italic;
	}
</style>
