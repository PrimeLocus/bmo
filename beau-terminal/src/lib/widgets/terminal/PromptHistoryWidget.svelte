<script lang="ts">
	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	let limit = $derived(typeof config.limit === 'number' ? config.limit : 20);

	type HistoryEntry = { id: number; content: string; label: string; createdAt: string | Date | null };

	let entries = $derived.by((): HistoryEntry[] => {
		if (!data || !Array.isArray(data)) return [];
		return (data as HistoryEntry[]).slice(0, limit);
	});

	function fmt(d: string | Date | null): string {
		if (!d) return '';
		return new Date(d).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	}
</script>

<div class="history-widget">
	<div class="header">
		<span class="header-label">PROMPT HISTORY</span>
		{#if entries.length > 0}
			<span class="header-count">{entries.length}</span>
		{/if}
	</div>

	<div class="list-body">
		{#if entries.length === 0}
			<div class="empty">NO DATA</div>
		{:else}
			<div class="entries">
				{#each entries as entry (entry.id)}
					<div class="entry">
						<span class="entry-time">{fmt(entry.createdAt)}</span>
						<span class="entry-content">{entry.content}</span>
						{#if entry.label}
							<span class="entry-label">{entry.label}</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.history-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', Courier, monospace;
		overflow: hidden;
	}

	.header {
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--bmo-border);
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.header-label {
		font-size: 0.625rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--bmo-muted);
	}

	.header-count {
		font-size: 0.625rem;
		color: var(--bmo-green);
		letter-spacing: 0.08em;
	}

	.list-body {
		flex: 1;
		overflow-y: auto;
	}

	.empty {
		font-size: 0.625rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--bmo-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		padding: 2rem;
	}

	.entries {
		display: flex;
		flex-direction: column;
	}

	.entry {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid var(--bmo-border);
	}

	.entry-time {
		font-size: 0.75rem;
		color: var(--bmo-muted);
		flex-shrink: 0;
		white-space: nowrap;
	}

	.entry-content {
		font-size: 0.75rem;
		color: var(--bmo-text);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.entry-label {
		font-size: 0.75rem;
		color: var(--bmo-muted);
		font-style: italic;
		flex-shrink: 0;
		white-space: nowrap;
	}
</style>
