<script lang="ts">
	import { beauState } from '$lib/stores/beau.svelte.js';

	let { config }: { config: Record<string, unknown>; data?: unknown } = $props();

	let season = $derived(beauState.seasonalContext);

	let monthLabel = $derived.by(() => {
		const now = new Date();
		return now.toLocaleString('en-US', { month: 'short' }).toUpperCase();
	});
</script>

<div class="season-widget">
	<span class="label">SEASON</span>
	<span class="month">{monthLabel}</span>
	<span class="context">{season || '\u2014'}</span>
</div>

<style>
	.season-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		font-family: 'Courier New', Courier, monospace;
	}

	.label {
		font-size: 0.625rem;
		color: var(--bmo-muted);
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}

	.month {
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--bmo-green);
		letter-spacing: 0.1em;
	}

	.context {
		font-size: 0.7rem;
		color: var(--bmo-text);
		text-align: center;
		line-height: 1.4;
		max-width: 90%;
	}
</style>
