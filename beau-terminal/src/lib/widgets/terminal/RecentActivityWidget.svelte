<script lang="ts">
	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	type ActivityItem = {
		id: number;
		entityType: string;
		entityId: string | null;
		action: string;
		summary: string;
		createdAt: string;
	};

	const ENTITY_ICONS: Record<string, string> = {
		part: '⬡',
		step: '◉',
		idea: '✦',
		task: '◫',
		haiku: '✿',
		journal: '◬',
		capture: '▪',
	};

	const items: ActivityItem[] = $derived(Array.isArray(data) ? (data as ActivityItem[]) : []);

	function relativeTime(createdAt: string): string {
		const now = Date.now();
		const then = new Date(createdAt).getTime();
		const diffMs = now - then;
		const diffMin = Math.floor(diffMs / 60000);
		if (diffMin < 1) return 'just now';
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffH = Math.floor(diffMin / 60);
		if (diffH < 24) return `${diffH}h ago`;
		const diffD = Math.floor(diffH / 24);
		return `${diffD}d ago`;
	}
</script>

<div class="activity-widget">
	<div class="widget-label">RECENT ACTIVITY</div>

	{#if items.length > 0}
		<ul class="activity-list">
			{#each items as item}
				<li class="activity-row">
					<span class="entity-icon">{ENTITY_ICONS[item.entityType] ?? '▪'}</span>
					<span class="summary">{item.summary}</span>
					<span class="timestamp">{relativeTime(item.createdAt)}</span>
				</li>
			{/each}
		</ul>
	{:else}
		<div class="empty">nothing yet. the build starts with the first step.</div>
	{/if}
</div>

<style>
	.activity-widget {
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
		margin-bottom: 1rem;
		flex-shrink: 0;
	}

	.activity-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		overflow-y: auto;
		flex: 1;
	}

	.activity-row {
		display: grid;
		grid-template-columns: 1.2rem 1fr auto;
		align-items: baseline;
		gap: 0.4rem;
		font-size: 0.75rem;
	}

	.entity-icon {
		color: var(--bmo-green);
		font-size: 0.7rem;
		flex-shrink: 0;
	}

	.summary {
		color: var(--bmo-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.timestamp {
		color: var(--bmo-muted);
		font-size: 0.68rem;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.empty {
		font-size: 0.75rem;
		color: var(--bmo-muted);
		letter-spacing: 0.05em;
		font-style: italic;
	}
</style>
