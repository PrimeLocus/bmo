<script lang="ts">
	import { beauState } from '$lib/stores/beau.svelte.js';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	const isActive = $derived(beauState.wellnessSessionActive);
	const statusColor = $derived(isActive ? 'var(--bmo-green)' : 'var(--bmo-muted)');
	const statusLabel = $derived(isActive ? 'ACTIVE' : 'IDLE');

	const heatingLabel = $derived(
		beauState.wellnessHeatingState?.toUpperCase() ?? ''
	);

	const heatingColor = $derived.by(() => {
		switch (beauState.wellnessHeatingState) {
			case 'heating': return '#f39c12';
			case 'ready': return 'var(--bmo-green)';
			case 'active': return 'var(--bmo-green)';
			case 'cooling': return '#3498db';
			default: return 'var(--bmo-muted)';
		}
	});

	// Temp color gradient: blue (<150) → green (150-350) → yellow (350-450) → red (>450)
	function tempColor(temp: number | null): string {
		if (temp == null) return 'var(--bmo-text)';
		if (temp < 150) return '#3498db';
		if (temp < 350) return 'var(--bmo-green)';
		if (temp < 450) return '#f39c12';
		return '#e74c3c';
	}

	const actualTempColor = $derived(tempColor(beauState.wellnessActualTemp));

	// Live duration counter
	let elapsed = $state('');
	let intervalId: ReturnType<typeof setInterval> | null = null;
	const sessionId = $derived(beauState.wellnessSessionId);

	$effect(() => {
		if (intervalId) clearInterval(intervalId);
		if (isActive && sessionId) {
			const startTime = Date.now();
			const tick = () => {
				const sec = Math.floor((Date.now() - startTime) / 1000);
				const m = Math.floor(sec / 60);
				const s = sec % 60;
				elapsed = `${m}:${s.toString().padStart(2, '0')}`;
			};
			tick();
			intervalId = setInterval(tick, 1000);
		} else {
			elapsed = '';
		}
		return () => {
			if (intervalId) clearInterval(intervalId);
		};
	});
</script>

<div class="wellness-widget">
	<div class="header-row">
		<span class="label">SESSION</span>
		<span class="indicator" class:active={isActive} style="background: {statusColor}"></span>
		<span class="status" style="color: {statusColor}">{statusLabel}</span>
	</div>

	{#if isActive}
		<div class="device-name">{beauState.wellnessDeviceName?.toUpperCase() ?? 'DEVICE'}</div>

		<div class="details">
			<div class="temp-row">
				<div class="temp-block">
					<span class="temp-label">TARGET</span>
					<span class="temp-value">
						{beauState.wellnessTargetTemp != null ? `${beauState.wellnessTargetTemp}°F` : '—'}
					</span>
				</div>
				<div class="temp-divider"></div>
				<div class="temp-block">
					<span class="temp-label">ACTUAL</span>
					<span class="temp-value" style="color: {actualTempColor}">
						{beauState.wellnessActualTemp != null ? `${beauState.wellnessActualTemp}°F` : '—'}
					</span>
				</div>
			</div>

			<div class="meta-grid">
				<div class="meta-item">
					<span class="meta-label">STATE</span>
					<span class="meta-value" style="color: {heatingColor}">{heatingLabel}</span>
				</div>
				<div class="meta-item">
					<span class="meta-label">DURATION</span>
					<span class="meta-value">{elapsed}</span>
				</div>
				{#if beauState.wellnessBattery != null}
					<div class="meta-item">
						<span class="meta-label">BATTERY</span>
						<span class="meta-value">{beauState.wellnessBattery}%</span>
					</div>
				{/if}
				{#if beauState.wellnessProfile}
					<div class="meta-item">
						<span class="meta-label">PROFILE</span>
						<span class="meta-value">{beauState.wellnessProfile}</span>
					</div>
				{/if}
			</div>
		</div>
	{:else}
		<div class="idle-message">no active session</div>
	{/if}
</div>

<style>
	.wellness-widget {
		width: 100%;
		height: 100%;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-family: 'Courier New', Courier, monospace;
	}

	.header-row {
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
	}

	.indicator.active {
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

	.device-name {
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--bmo-green);
		letter-spacing: 0.1em;
	}

	.details {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.temp-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.temp-block {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.temp-label {
		font-size: 0.55rem;
		color: var(--bmo-muted);
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}

	.temp-value {
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--bmo-text);
		letter-spacing: 0.05em;
	}

	.temp-divider {
		width: 1px;
		height: 2rem;
		background: var(--bmo-border);
	}

	.meta-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.35rem 1rem;
	}

	.meta-item {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
	}

	.meta-label {
		font-size: 0.55rem;
		color: var(--bmo-muted);
		text-transform: uppercase;
		letter-spacing: 0.15em;
		flex-shrink: 0;
	}

	.meta-value {
		font-size: 0.75rem;
		color: var(--bmo-text);
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.idle-message {
		font-size: 0.7rem;
		color: var(--bmo-muted);
		font-style: italic;
		margin-top: 0.5rem;
	}
</style>
