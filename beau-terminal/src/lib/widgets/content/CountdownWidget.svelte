<script lang="ts">
	import { onMount } from 'svelte';

	let { config }: { config: Record<string, unknown>; data?: unknown } = $props();

	let days = $state(0);
	let hours = $state(0);
	let minutes = $state(0);
	let seconds = $state(0);
	let expired = $state(false);
	let hasTarget = $state(false);

	function update() {
		const target = typeof config.targetDate === 'string' ? config.targetDate : '';
		if (!target) {
			hasTarget = false;
			return;
		}

		hasTarget = true;
		const diff = new Date(target).getTime() - Date.now();

		if (diff <= 0) {
			expired = true;
			days = 0;
			hours = 0;
			minutes = 0;
			seconds = 0;
			return;
		}

		expired = false;
		days = Math.floor(diff / (1000 * 60 * 60 * 24));
		hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
		minutes = Math.floor((diff / (1000 * 60)) % 60);
		seconds = Math.floor((diff / 1000) % 60);
	}

	let label = $derived(typeof config.label === 'string' && config.label ? config.label : 'Countdown');

	function pad(n: number): string {
		return String(n).padStart(2, '0');
	}

	onMount(() => {
		update();
		const interval = setInterval(update, 1000);
		return () => clearInterval(interval);
	});
</script>

<div class="countdown-widget">
	<div class="label">{label}</div>

	{#if !hasTarget}
		<div class="placeholder">Set a target date in config</div>
	{:else if expired}
		<div class="complete">COMPLETE</div>
	{:else}
		<div class="columns">
			<div class="col">
				<span class="value">{pad(days)}</span>
				<span class="unit">DD</span>
			</div>
			<div class="col">
				<span class="value">{pad(hours)}</span>
				<span class="unit">HH</span>
			</div>
			<div class="col">
				<span class="value">{pad(minutes)}</span>
				<span class="unit">MM</span>
			</div>
			<div class="col">
				<span class="value">{pad(seconds)}</span>
				<span class="unit">SS</span>
			</div>
		</div>
	{/if}
</div>

<style>
	.countdown-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font-family: 'Courier New', Courier, monospace;
	}

	.label {
		font-size: 0.7rem;
		color: var(--bmo-muted);
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}

	.columns {
		display: flex;
		gap: 1rem;
	}

	.col {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
	}

	.value {
		font-size: 1.6rem;
		font-weight: 700;
		color: var(--bmo-green);
		letter-spacing: 0.08em;
	}

	.unit {
		font-size: 0.6rem;
		color: var(--bmo-muted);
		text-transform: uppercase;
		letter-spacing: 0.2em;
	}

	.complete {
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--bmo-green);
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}

	.placeholder {
		font-size: 0.8rem;
		color: var(--bmo-muted);
		font-style: italic;
	}
</style>
