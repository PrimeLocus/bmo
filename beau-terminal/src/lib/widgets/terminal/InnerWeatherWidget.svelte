<script lang="ts">
	import { beauState, MODE_LABELS } from '$lib/stores/beau.svelte.js';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	const v = $derived(beauState.personalityVector);
	const mode = $derived(beauState.mode);
	const interpretation = $derived(beauState.personalityInterpretation);

	/** Dominant dimension determines the mode dot color. */
	const dominantColor = $derived.by(() => {
		if (v.reflection >= v.wonder && v.reflection >= v.mischief) return 'var(--pw-reflection)';
		if (v.mischief >= v.wonder && v.mischief >= v.reflection) return 'var(--pw-mischief)';
		return 'var(--pw-wonder)';
	});

	/** Whisper bar widths proportional to value (max ~40px). */
	const bars = $derived([
		{ label: 'W', value: v.wonder, color: 'var(--pw-wonder)' },
		{ label: 'R', value: v.reflection, color: 'var(--pw-reflection)' },
		{ label: 'M', value: v.mischief, color: 'var(--pw-mischief)' },
	]);
</script>

<div class="inner-weather">
	<!-- Mode header -->
	<div class="mode-header">
		<span class="mode-dot" style="background:{dominantColor};box-shadow:0 0 6px {dominantColor};"></span>
		<span class="mode-label">{(MODE_LABELS[mode] ?? mode).toUpperCase()}</span>
	</div>

	<!-- Interpretation (hero text) -->
	<div class="interpretation">
		{#if interpretation}
			{interpretation}
		{:else}
			<span class="waiting">waiting for first reading...</span>
		{/if}
	</div>

	<!-- Whisper bars -->
	<div class="whisper-bars">
		{#each bars as bar}
			<div class="whisper-bar">
				<div
					class="whisper-fill"
					style="width:{bar.value * 40}px;background:linear-gradient(90deg,var(--bmo-bg),{bar.color});opacity:{0.3 + bar.value * 0.4};"
				></div>
				<span class="whisper-label">{bar.label}</span>
			</div>
		{/each}
	</div>
</div>

<style>
	.inner-weather {
		--pw-wonder: #00e5a0;
		--pw-reflection: #6ec6ff;
		--pw-mischief: #ffd700;

		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', Courier, monospace;
	}

	.mode-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.mode-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.mode-label {
		font-size: 0.625rem;
		letter-spacing: 0.2em;
		color: var(--bmo-muted);
	}

	.interpretation {
		flex: 1;
		font-size: 0.875rem;
		line-height: 1.7;
		color: var(--bmo-text);
	}

	.waiting {
		color: var(--bmo-muted);
		font-style: italic;
	}

	.whisper-bars {
		display: flex;
		gap: 0.75rem;
		margin-top: 1rem;
	}

	.whisper-bar {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.whisper-fill {
		height: 3px;
		border-radius: 2px;
		transition: width 0.6s ease, opacity 0.6s ease;
	}

	.whisper-label {
		font-size: 0.5625rem;
		color: var(--bmo-muted);
	}
</style>
