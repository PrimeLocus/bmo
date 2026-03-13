<script lang="ts">
	import { beauState } from '$lib/stores/beau.svelte.js';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();
</script>

<div class="haiku-widget">
	<div class="widget-label">LAST HAIKU</div>

	{#if beauState.lastHaiku}
		<div class="haiku-lines">
			{#each beauState.lastHaiku.split('\n') as line}
				<div class="haiku-line">{line}</div>
			{/each}
		</div>
	{:else}
		<div class="empty">no haiku yet</div>
	{/if}
</div>

<style>
	.haiku-widget {
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
		margin-bottom: 0.75rem;
	}

	.haiku-lines {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.haiku-line {
		font-size: 0.875rem;
		line-height: 1.625;
		font-style: italic;
		color: var(--bmo-text);
	}

	.empty {
		font-size: 0.75rem;
		color: var(--bmo-muted);
		letter-spacing: 0.1em;
	}
</style>
