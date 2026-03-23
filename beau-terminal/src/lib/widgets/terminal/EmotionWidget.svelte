<script lang="ts">
	import { beauState, FACE_STATE_LABELS } from '$lib/stores/beau.svelte.js';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();
</script>

<div class="emotion-widget">
	<div class="widget-label">STATE</div>
	<div class="emotion-value">
		{(FACE_STATE_LABELS[beauState.faceState] ?? beauState.faceState).toUpperCase()}
	</div>
</div>

<style>
	.emotion-widget {
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

	.emotion-value {
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--bmo-green);
	}
</style>
