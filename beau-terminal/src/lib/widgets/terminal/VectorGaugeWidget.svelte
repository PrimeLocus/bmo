<script lang="ts">
	import { beauState, MODE_LABELS } from '$lib/stores/beau.svelte.js';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	let showLayers = $state(typeof config.showLayers === 'boolean' ? config.showLayers : false);

	const v = $derived(beauState.personalityVector);
	const sig = $derived(beauState.signalLayer);
	const mom = $derived(beauState.momentumLayer);
	const mode = $derived(beauState.mode);

	const dimensions = $derived([
		{ key: 'wonder', label: 'WONDER', color: 'var(--pw-wonder)', blend: v.wonder, signal: sig.wonder, momentum: mom.wonder },
		{ key: 'reflection', label: 'REFLECTION', color: 'var(--pw-reflection)', blend: v.reflection, signal: sig.reflection, momentum: mom.reflection },
		{ key: 'mischief', label: 'MISCHIEF', color: 'var(--pw-mischief)', blend: v.mischief, signal: sig.mischief, momentum: mom.mischief },
	]);

	const dominantColor = $derived.by(() => {
		if (v.reflection >= v.wonder && v.reflection >= v.mischief) return 'var(--pw-reflection)';
		if (v.mischief >= v.wonder && v.mischief >= v.reflection) return 'var(--pw-mischief)';
		return 'var(--pw-wonder)';
	});
</script>

<div class="vector-gauge">
	<!-- Header -->
	<div class="gauge-header">
		<span class="widget-label">VECTOR</span>
		<div class="toggle">
			<button
				class="toggle-btn"
				class:active={!showLayers}
				onclick={() => showLayers = false}
			>BLENDED</button>
			<button
				class="toggle-btn"
				class:active={showLayers}
				onclick={() => showLayers = true}
			>LAYERS</button>
		</div>
	</div>

	<!-- Bars -->
	<div class="bars">
		{#each dimensions as dim}
			<div class="dimension">
				{#if showLayers}
					<!-- Layer mode: signal + momentum sub-bars -->
					<div class="dim-header">
						<span class="dim-label" style="color:{dim.color};">{dim.label}</span>
						<span class="dim-blend">blend {dim.blend.toFixed(2)}</span>
					</div>
					<div class="layer-row">
						<span class="layer-label">SIG</span>
						<div class="bar-track">
							<div
								class="bar-fill layer-signal"
								style="width:{dim.signal * 100}%;background:{dim.color};opacity:0.6;"
							></div>
						</div>
						<span class="layer-value">{dim.signal.toFixed(2)}</span>
					</div>
					<div class="layer-row">
						<span class="layer-label">MOM</span>
						<div class="bar-track">
							<div
								class="bar-fill layer-momentum"
								style="width:{dim.momentum * 100}%;background:{dim.color};opacity:0.3;"
							></div>
						</div>
						<span class="layer-value">{dim.momentum.toFixed(2)}</span>
					</div>
				{:else}
					<!-- Blended mode: single bar per dimension -->
					<div class="dim-header">
						<span class="dim-label" style="color:{dim.color};">{dim.label}</span>
						<span class="dim-value">{dim.blend.toFixed(2)}</span>
					</div>
					<div class="bar-track blended">
						<div
							class="bar-fill"
							style="width:{dim.blend * 100}%;background:linear-gradient(90deg,var(--bmo-surface),{dim.color});box-shadow:0 0 8px color-mix(in srgb, {dim.color} {Math.round(dim.blend * 60)}%, transparent);"
						></div>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Mode footer -->
	<div class="mode-footer">
		<span class="mode-dot" style="background:{dominantColor};box-shadow:0 0 6px {dominantColor};"></span>
		<span class="mode-name">{(MODE_LABELS[mode] ?? mode).toUpperCase()}</span>
	</div>
</div>

<style>
	.vector-gauge {
		--pw-wonder: #00e5a0;
		--pw-reflection: #6ec6ff;
		--pw-mischief: #ffd700;

		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', Courier, monospace;
	}

	.gauge-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.widget-label {
		font-size: 0.75rem;
		letter-spacing: 0.15em;
		color: var(--bmo-muted);
	}

	.toggle {
		display: flex;
		gap: 0.25rem;
	}

	.toggle-btn {
		background: none;
		border: none;
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
		font-family: inherit;
		font-size: 0.5625rem;
		letter-spacing: 0.05em;
		color: var(--bmo-muted);
		cursor: pointer;
	}

	.toggle-btn.active {
		background: var(--bmo-border);
		color: var(--bmo-green);
	}

	.bars {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		flex: 1;
	}

	.dimension {
		display: flex;
		flex-direction: column;
	}

	.dim-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.25rem;
	}

	.dim-label {
		font-size: 0.625rem;
		letter-spacing: 0.15em;
	}

	.dim-value, .dim-blend {
		font-size: 0.625rem;
		color: var(--bmo-muted);
	}

	.bar-track {
		height: 4px;
		background: var(--bmo-surface);
		border-radius: 3px;
		overflow: hidden;
	}

	.bar-track.blended {
		height: 6px;
	}

	.bar-fill {
		height: 100%;
		border-radius: 3px;
		transition: width 0.6s ease;
	}

	.layer-row {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: 0.1875rem;
	}

	.layer-label {
		font-size: 0.5rem;
		color: var(--bmo-muted);
		width: 1.5rem;
	}

	.layer-value {
		font-size: 0.5rem;
		color: var(--bmo-border);
		width: 1.75rem;
		text-align: right;
	}

	.mode-footer {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--bmo-border);
		margin-top: auto;
	}

	.mode-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.mode-name {
		font-size: 0.5625rem;
		letter-spacing: 0.15em;
		color: var(--bmo-muted);
	}
</style>
