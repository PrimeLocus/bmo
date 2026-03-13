<script lang="ts">
	let { config }: { config: Record<string, unknown>; data?: unknown } = $props();

	let lineStyle = $derived(
		typeof config.style === 'string' &&
			(config.style === 'solid' || config.style === 'dashed' || config.style === 'dotted')
			? config.style
			: 'solid'
	);
	let label = $derived(typeof config.label === 'string' ? config.label : '');
	let hasLabel = $derived(label.length > 0);
</script>

<div class="divider-widget">
	{#if hasLabel}
		<div class="labeled">
			<hr style:border-style={lineStyle} />
			<span class="label">{label}</span>
			<hr style:border-style={lineStyle} />
		</div>
	{:else}
		<hr class="full" style:border-style={lineStyle} />
	{/if}
</div>

<style>
	.divider-widget {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 0.75rem;
		font-family: 'Courier New', Courier, monospace;
	}

	.labeled {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
	}

	hr {
		flex: 1;
		border: none;
		border-top: 1px solid var(--bmo-border);
		margin: 0;
	}

	.full {
		width: 100%;
	}

	.label {
		font-size: 0.7rem;
		color: var(--bmo-muted);
		text-transform: uppercase;
		letter-spacing: 0.15em;
		white-space: nowrap;
		flex-shrink: 0;
	}
</style>
