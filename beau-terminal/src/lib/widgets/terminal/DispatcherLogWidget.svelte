<script lang="ts">
	import { beauState } from '$lib/stores/beau.svelte.js';

	let { config }: { config: Record<string, unknown>; data?: unknown } = $props();

	let limit = $derived(typeof config.limit === 'number' ? config.limit : 8);

	// Parse dispatcher log entries — they may be raw JSON strings with structured data
	// or plain text strings. We normalize them for display.
	type ParsedEntry = {
		raw: string;
		tier: string | null;
		model: string | null;
		query: string | null;
		duration: number | null;
	};

	let entries = $derived.by(() => {
		const log = beauState.dispatcherLog;
		if (!log || log.length === 0) return [];

		const recent = log.slice(-limit).reverse();
		return recent.map((entry): ParsedEntry => {
			try {
				const parsed = JSON.parse(entry);
				return {
					raw: entry,
					tier: parsed.tier ?? null,
					model: parsed.model ?? null,
					query: parsed.query ?? null,
					duration: parsed.duration_ms ?? null,
				};
			} catch {
				return {
					raw: entry,
					tier: null,
					model: null,
					query: entry,
					duration: null,
				};
			}
		});
	});

	function fmtDuration(ms: number | null): string {
		if (ms === null) return '';
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}

	function tierColor(tier: string | null): string {
		switch (tier) {
			case 'reflex': return 'var(--bmo-green)';
			case 'local': return '#f39c12';
			case 'remote': return '#e17055';
			default: return 'var(--bmo-muted)';
		}
	}
</script>

<div class="dispatcher-widget">
	<div class="header">
		<span class="header-label">DISPATCHER LOG</span>
		<span class="status-dot" style="background: {beauState.online ? 'var(--bmo-green)' : '#636e72'}"></span>
		<span class="header-label">LIVE</span>
	</div>

	<div class="log-body">
		{#if entries.length === 0}
			<div class="empty">NO DATA</div>
		{:else}
			<div class="entries">
				{#each entries as entry, i}
					<div class="entry" style="color: {i === 0 ? 'var(--bmo-text)' : 'var(--bmo-muted)'}">
						<span class="prompt-char" style="color: var(--bmo-green)">&gt;</span>
						{#if entry.tier}
							<span class="tier" style="color: {tierColor(entry.tier)}">[{entry.tier}]</span>
						{/if}
						{#if entry.model}
							<span class="model">{entry.model}</span>
						{/if}
						<span class="query">{entry.query ?? entry.raw}</span>
						{#if entry.duration !== null}
							<span class="duration">{fmtDuration(entry.duration)}</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.dispatcher-widget {
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

	.status-dot {
		display: inline-block;
		width: 0.375rem;
		height: 0.375rem;
		border-radius: 50%;
	}

	.log-body {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem 1rem;
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
	}

	.entries {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.entry {
		font-size: 0.75rem;
		line-height: 1.4;
		display: flex;
		align-items: baseline;
		gap: 0.375rem;
		overflow: hidden;
	}

	.prompt-char {
		flex-shrink: 0;
	}

	.tier {
		font-size: 0.625rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		flex-shrink: 0;
	}

	.model {
		font-size: 0.625rem;
		color: var(--bmo-muted);
		flex-shrink: 0;
	}

	.query {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.duration {
		font-size: 0.625rem;
		color: var(--bmo-muted);
		flex-shrink: 0;
		margin-left: auto;
	}
</style>
