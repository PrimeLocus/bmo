<script lang="ts">
	import { beauState, MODE_LABELS } from '$lib/stores/beau.svelte.js';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();
</script>

<div class="mode-widget">
	<div class="widget-label">MODE</div>
	<div class="mode-value">
		{(MODE_LABELS[beauState.mode] ?? beauState.mode).toUpperCase()}
	</div>
</div>

<style>
	.mode-widget {
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
		margin-bottom: 0.5rem;
	}

	.mode-value {
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--bmo-green);
	}
</style>
