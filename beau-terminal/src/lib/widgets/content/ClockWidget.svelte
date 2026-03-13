<script lang="ts">
	import { onMount } from 'svelte';

	let { config }: { config: Record<string, unknown>; data?: unknown } = $props();

	let time = $state('');
	let date = $state('');

	function update() {
		const tz = typeof config.timezone === 'string' ? config.timezone : 'Local';
		const fmt = typeof config.format === 'string' ? config.format : '12h';
		const hour12 = fmt !== '24h';

		const options: Intl.DateTimeFormatOptions = {
			hour: 'numeric',
			minute: '2-digit',
			second: '2-digit',
			hour12
		};

		const dateOptions: Intl.DateTimeFormatOptions = {
			weekday: 'short',
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		};

		if (tz !== 'Local') {
			options.timeZone = tz;
			dateOptions.timeZone = tz;
		}

		const now = new Date();
		time = new Intl.DateTimeFormat('en-US', options).format(now);
		date = new Intl.DateTimeFormat('en-US', dateOptions).format(now);
	}

	onMount(() => {
		update();
		const interval = setInterval(update, 1000);
		return () => clearInterval(interval);
	});
</script>

<div class="clock-widget">
	<span class="time">{time}</span>
	<span class="date">{date}</span>
</div>

<style>
	.clock-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		font-family: 'Courier New', Courier, monospace;
	}

	.time {
		font-size: 2rem;
		font-weight: 700;
		color: var(--bmo-green);
		letter-spacing: 0.08em;
	}

	.date {
		font-size: 0.75rem;
		color: var(--bmo-muted);
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}
</style>
