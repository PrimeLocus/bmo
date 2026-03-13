<script lang="ts">
	import { beauState } from '$lib/stores/beau.svelte.js';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	type Haiku = {
		id: number;
		text: string;
		trigger: string;
		mode: string;
		createdAt: Date | string | null;
		haikuType?: string;
		wakeWord?: string | null;
	};

	const limit = $derived(typeof config.limit === 'number' ? config.limit : 50);
	const filterText = $derived(typeof config.filter === 'string' ? config.filter : '');

	const allHaikus = $derived(Array.isArray(data) ? (data as Haiku[]) : []);

	const filtered = $derived.by(() => {
		let items = allHaikus;
		if (filterText) {
			const lower = filterText.toLowerCase();
			items = items.filter(
				(h) =>
					h.text.toLowerCase().includes(lower) ||
					h.trigger.toLowerCase().includes(lower) ||
					h.mode.toLowerCase().includes(lower)
			);
		}
		return items.slice(0, limit);
	});

	function formatDate(d: Date | string | null): string {
		if (!d) return '';
		return new Date(d).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<div class="haiku-archive-widget">
	<div class="header">
		<span class="label">HAIKU ARCHIVE</span>
		<span class="count">{filtered.length} / {allHaikus.length}</span>
		{#if beauState.lastHaiku}
			<span class="live-badge">LIVE</span>
		{/if}
	</div>

	{#if filtered.length === 0}
		<div class="empty">
			<span class="empty-label">NO HAIKUS</span>
			<span class="empty-sub">Beau will write them as the build comes to life</span>
		</div>
	{:else}
		<div class="haiku-list">
			{#each filtered as haiku (haiku.id)}
				<div class="haiku-card">
					<div class="haiku-text">
						{#each haiku.text.split('\n') as line}
							<div>{line}</div>
						{/each}
					</div>
					<div class="haiku-meta">
						<span class="haiku-mode">{haiku.mode}</span>
						{#if haiku.trigger}
							<span class="haiku-separator">&middot;</span>
							<span class="haiku-trigger">{haiku.trigger}</span>
						{/if}
						<span class="haiku-separator">&middot;</span>
						<span class="haiku-date">{formatDate(haiku.createdAt)}</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.haiku-archive-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', Courier, monospace;
		overflow: hidden;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		flex-shrink: 0;
		border-bottom: 1px solid var(--bmo-border);
	}

	.label {
		font-size: 0.65rem;
		font-weight: 700;
		color: var(--bmo-muted);
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}

	.count {
		font-size: 0.6rem;
		color: var(--bmo-muted);
		margin-left: auto;
	}

	.live-badge {
		font-size: 0.55rem;
		font-weight: 700;
		color: var(--bmo-green);
		border: 1px solid var(--bmo-green);
		padding: 0.1rem 0.35rem;
		letter-spacing: 0.15em;
	}

	.empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		padding: 1rem;
	}

	.empty-label {
		font-size: 0.65rem;
		color: var(--bmo-muted);
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}

	.empty-sub {
		font-size: 0.6rem;
		color: var(--bmo-muted);
		opacity: 0.7;
	}

	.haiku-list {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.haiku-card {
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--bmo-border);
		background: var(--bmo-surface);
	}

	.haiku-text {
		font-size: 0.8rem;
		line-height: 1.6;
		font-style: italic;
		color: var(--bmo-text);
		margin-bottom: 0.4rem;
	}

	.haiku-meta {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		flex-wrap: wrap;
		font-size: 0.6rem;
	}

	.haiku-mode {
		color: var(--bmo-green);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.haiku-separator {
		color: var(--bmo-muted);
	}

	.haiku-trigger,
	.haiku-date {
		color: var(--bmo-muted);
	}
</style>
