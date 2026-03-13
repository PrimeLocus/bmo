<script lang="ts">
	import { beauState } from '$lib/stores/beau.svelte.js';

	let { config }: { config: Record<string, unknown>; data?: unknown } = $props();

	let luxLabel = $derived(beauState.luxLabel);
	let lux = $derived(beauState.lux);

	let labelColor = $derived.by(() => {
		if (!luxLabel) return 'var(--bmo-muted)';
		switch (luxLabel) {
			case 'bright': return 'var(--bmo-green)';
			case 'lamp': return 'var(--bmo-text)';
			case 'dim': return 'var(--bmo-muted)';
			case 'dark': return '#636e72';
			default: return 'var(--bmo-muted)';
		}
	});

	let indicator = $derived.by(() => {
		if (!luxLabel) return '';
		switch (luxLabel) {
			case 'bright': return '||||';
			case 'lamp': return '|||';
			case 'dim': return '||';
			case 'dark': return '|';
			default: return '';
		}
	});
</script>

<div class="light-widget">
	<span class="label">LIGHT</span>
	<div class="reading">
		<span class="level" style:color={labelColor}>
			{luxLabel ? luxLabel.toUpperCase() : '\u2014'}
		</span>
		{#if indicator}
			<span class="indicator" style:color={labelColor}>{indicator}</span>
		{/if}
	</div>
	{#if lux !== null}
		<span class="lux-value">{lux} lux</span>
	{/if}
</div>

<style>
	.light-widget {
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

	.reading {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.level {
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: 0.08em;
	}

	.indicator {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.2em;
	}

	.lux-value {
		font-size: 0.625rem;
		color: var(--bmo-muted);
	}
</style>
