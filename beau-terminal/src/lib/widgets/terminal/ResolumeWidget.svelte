<script lang="ts">
	import { beauState } from '$lib/stores/beau.svelte.js';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	const statusLabel = $derived(beauState.resolumeActive ? 'LIVE' : 'IDLE');
	const statusColor = $derived(beauState.resolumeActive ? 'var(--bmo-green)' : 'var(--bmo-muted)');
</script>

<div class="resolume-widget">
	<div class="status-row">
		<span class="label">RESOLUME</span>
		<span class="indicator" style="background: {statusColor}"></span>
		<span class="status" style="color: {statusColor}">{statusLabel}</span>
	</div>

	{#if beauState.resolumeActive}
		<div class="details">
			{#if beauState.currentClip}
				<div class="detail-row">
					<span class="detail-label">CLIP</span>
					<span class="detail-value">{beauState.currentClip}</span>
				</div>
			{/if}
			{#if beauState.currentBpm != null}
				<div class="detail-row">
					<span class="detail-label">BPM</span>
					<span class="detail-value bpm">{beauState.currentBpm}</span>
				</div>
			{/if}
			{#if beauState.currentSessionId != null}
				<div class="detail-row">
					<span class="detail-label">SESSION</span>
					<span class="detail-value">#{beauState.currentSessionId}</span>
				</div>
			{/if}
		</div>
	{:else}
		<div class="idle-message">
			no active session
		</div>
	{/if}
</div>

<style>
	.resolume-widget {
		width: 100%;
		height: 100%;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-family: 'Courier New', Courier, monospace;
	}

	.status-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.label {
		font-size: 0.65rem;
		font-weight: 700;
		color: var(--bmo-muted);
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}

	.indicator {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.status {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.15em;
	}

	.details {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.detail-row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.detail-label {
		font-size: 0.6rem;
		color: var(--bmo-muted);
		text-transform: uppercase;
		letter-spacing: 0.15em;
		flex-shrink: 0;
	}

	.detail-value {
		font-size: 0.8rem;
		color: var(--bmo-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.detail-value.bpm {
		color: var(--bmo-green);
		font-weight: 700;
	}

	.idle-message {
		font-size: 0.7rem;
		color: var(--bmo-muted);
		font-style: italic;
	}
</style>
