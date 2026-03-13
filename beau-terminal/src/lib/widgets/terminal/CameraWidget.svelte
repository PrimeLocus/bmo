<script lang="ts">
	import { beauState } from '$lib/stores/beau.svelte.js';

	let { config }: { config: Record<string, unknown>; data?: unknown } = $props();

	let active = $derived(beauState.cameraActive);
</script>

<div class="camera-widget">
	<span class="label">CAMERA</span>
	<span class="status" style:color={active ? 'var(--bmo-green)' : 'var(--bmo-muted)'}>
		{active ? 'ACTIVE' : 'OFF'}
	</span>
	<span class="indicator" style:color={active ? 'var(--bmo-green)' : '#636e72'}>
		{active ? '\u25CF' : '\u25CB'}
	</span>
</div>

<style>
	.camera-widget {
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

	.status {
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: 0.08em;
	}

	.indicator {
		font-size: 0.5rem;
	}
</style>
