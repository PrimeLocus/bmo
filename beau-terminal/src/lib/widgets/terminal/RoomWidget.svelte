<script lang="ts">
	import { beauState, PRESENCE_LABELS } from '$lib/stores/beau.svelte.js';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	const isOccupied = $derived(beauState.presenceState === 'occupied');
</script>

<div class="room-widget">
	<div class="widget-label">ROOM</div>
	<div class="room-value" class:dimmed={!isOccupied}>
		{(PRESENCE_LABELS[beauState.presenceState] ?? beauState.presenceState).toUpperCase()}
	</div>
</div>

<style>
	.room-widget {
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

	.room-value {
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--bmo-green);
	}

	.room-value.dimmed {
		color: var(--bmo-muted);
	}
</style>
