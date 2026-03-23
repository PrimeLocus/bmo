<script lang="ts">
	import { beauState, SLEEP_LABELS, MODE_LABELS, FACE_STATE_LABELS, PRESENCE_LABELS } from '$lib/stores/beau.svelte.js';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	const statusLabel = $derived(
		beauState.online
			? (SLEEP_LABELS[beauState.sleepState] ?? beauState.sleepState).toUpperCase()
			: 'OFFLINE'
	);

	const statusClass = $derived(
		!beauState.online ? 'offline' : beauState.sleepState === 'asleep' ? 'asleep' : 'online'
	);
</script>

<div class="vitals-widget">
	<div class="widget-label">BEAU VITALS</div>

	<div class="vitals-rows">
		<div class="vitals-row">
			<span class="vitals-key">STATUS</span>
			<span class="vitals-value status-{statusClass}">
				<span class="status-dot status-dot-{statusClass}"></span>
				{statusLabel}
			</span>
		</div>

		<div class="vitals-row">
			<span class="vitals-key">MODE</span>
			<span class="vitals-value">{(MODE_LABELS[beauState.mode] ?? beauState.mode).toUpperCase()}</span>
		</div>

		<div class="vitals-row">
			<span class="vitals-key">FEELING</span>
			<span class="vitals-value">{(FACE_STATE_LABELS[beauState.faceState] ?? beauState.faceState).toUpperCase()}</span>
		</div>

		<div class="vitals-row">
			<span class="vitals-key">ROOM</span>
			<span class="vitals-value">{(PRESENCE_LABELS[beauState.presenceState] ?? beauState.presenceState).toUpperCase()}</span>
		</div>

		{#if beauState.weatherSummary}
			<div class="vitals-row">
				<span class="vitals-key">WEATHER</span>
				<span class="vitals-value weather">{beauState.weatherSummary}</span>
			</div>
		{/if}
	</div>
</div>

<style>
	.vitals-widget {
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
		margin-bottom: 1rem;
	}

	.vitals-rows {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.vitals-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.75rem;
	}

	.vitals-key {
		letter-spacing: 0.1em;
		color: var(--bmo-muted);
	}

	.vitals-value {
		color: var(--bmo-text);
		letter-spacing: 0.05em;
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.vitals-value.weather {
		font-size: 0.7rem;
		max-width: 55%;
		text-align: right;
		text-transform: uppercase;
	}

	.status-dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.status-dot-online {
		background: var(--bmo-green);
		box-shadow: 0 0 4px var(--bmo-green);
	}

	.status-dot-asleep {
		background: #636e72;
	}

	.status-dot-offline {
		background: #d63031;
	}

	.status-online {
		color: var(--bmo-green);
	}

	.status-asleep {
		color: #636e72;
	}

	.status-offline {
		color: #d63031;
	}
</style>
