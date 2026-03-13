<script lang="ts">
	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	type TimelineEvent = {
		eventType: string;
		source: string | null;
		timestamp: string;
		payloadJson?: string | null;
	};

	let limit = $derived(typeof config.limit === 'number' ? config.limit : 50);

	let events = $derived.by(() => {
		if (!Array.isArray(data)) return [] as TimelineEvent[];
		return (data as TimelineEvent[]).slice(0, limit);
	});

	function formatEventType(raw: string): string {
		return raw.replace(/_/g, ' ');
	}

	function formatTimestamp(ts: string): string {
		try {
			const d = new Date(ts);
			if (isNaN(d.getTime())) return ts;
			return d.toLocaleString('en-US', {
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hour12: false
			});
		} catch {
			return ts;
		}
	}
</script>

<div class="timeline-widget">
	<span class="label">EVENT TIMELINE</span>
	{#if events.length === 0}
		<div class="empty">no events yet</div>
	{:else}
		<div class="event-list">
			{#each events as event}
				<div class="event-row">
					<span class="event-type">{formatEventType(event.eventType)}</span>
					<span class="event-source">{event.source ?? ''}</span>
					<span class="event-time">{formatTimestamp(event.timestamp)}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.timeline-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', Courier, monospace;
		overflow: hidden;
	}

	.label {
		font-size: 0.625rem;
		color: var(--bmo-muted);
		text-transform: uppercase;
		letter-spacing: 0.15em;
		margin-bottom: 0.5rem;
		flex-shrink: 0;
	}

	.empty {
		font-size: 0.75rem;
		color: var(--bmo-muted);
	}

	.event-list {
		display: flex;
		flex-direction: column;
		gap: 0;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
	}

	.event-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.75rem;
		padding: 0.25rem 0;
		border-bottom: 1px solid var(--bmo-border);
		flex-shrink: 0;
	}

	.event-type {
		color: var(--bmo-green);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.event-source {
		color: var(--bmo-muted);
		flex-shrink: 0;
		margin: 0 0.75rem;
	}

	.event-time {
		color: var(--bmo-muted);
		flex-shrink: 0;
		white-space: nowrap;
	}
</style>
