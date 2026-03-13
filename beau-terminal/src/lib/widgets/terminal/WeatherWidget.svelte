<script lang="ts">
	import { beauState } from '$lib/stores/beau.svelte.js';

	let { config }: { config: Record<string, unknown>; data?: unknown } = $props();

	let units = $derived(typeof config.units === 'string' ? config.units : '°F');

	let weather = $derived(beauState.weather);

	let tempDisplay = $derived.by(() => {
		if (!weather) return null;
		if (units === '°C') {
			return `${Math.round(weather.tempC)}°C`;
		}
		return `${Math.round(weather.tempC * 9 / 5 + 32)}°F`;
	});
</script>

<div class="weather-widget">
	<span class="label">WEATHER</span>
	{#if weather}
		<span class="condition">{weather.condition.toUpperCase()}</span>
		<div class="details">
			<span class="temp">{tempDisplay}</span>
			<span class="separator">|</span>
			<span class="humidity">{weather.humidity}% RH</span>
			<span class="separator">|</span>
			<span class="pressure">{weather.pressureHpa} hPa</span>
		</div>
	{:else if beauState.weatherSummary}
		<span class="summary">{beauState.weatherSummary}</span>
	{:else}
		<span class="empty">&mdash;</span>
	{/if}
</div>

<style>
	.weather-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		font-family: 'Courier New', Courier, monospace;
	}

	.label {
		font-size: 0.625rem;
		color: var(--bmo-muted);
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}

	.condition {
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--bmo-green);
		letter-spacing: 0.08em;
	}

	.details {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.7rem;
		color: var(--bmo-muted);
	}

	.temp {
		color: var(--bmo-text);
		font-weight: 600;
	}

	.separator {
		color: var(--bmo-border);
	}

	.humidity,
	.pressure {
		color: var(--bmo-muted);
	}

	.summary {
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--bmo-green);
	}

	.empty {
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--bmo-muted);
	}
</style>
