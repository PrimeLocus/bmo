<script lang="ts">
	import { beauState, SLEEP_LABELS } from '$lib/stores/beau.svelte.js';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	const isAsleep = $derived(beauState.sleepState === 'asleep');
</script>

<div class="sleep-widget">
	<div class="widget-label">SLEEP</div>
	<div class="sleep-value" class:asleep={isAsleep}>
		{(SLEEP_LABELS[beauState.sleepState] ?? beauState.sleepState).toUpperCase()}
	</div>
</div>

<style>
	.sleep-widget {
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

	.sleep-value {
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--bmo-green);
	}

	.sleep-value.asleep {
		color: #636e72;
	}
</style>
