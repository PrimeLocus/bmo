<script lang="ts">
	let { config }: { config: Record<string, unknown>; data?: unknown } = $props();

	let src = $derived(typeof config.src === 'string' ? config.src : '');
	let alt = $derived(typeof config.alt === 'string' ? config.alt : '');
	let fit = $derived(
		typeof config.fit === 'string' && (config.fit === 'cover' || config.fit === 'contain')
			? config.fit
			: 'cover'
	);
	let hasSrc = $derived(src.length > 0);
</script>

<div class="image-widget">
	{#if hasSrc}
		<img
			{src}
			alt={alt || 'Widget image'}
			style:object-fit={fit}
		/>
	{:else}
		<div class="placeholder">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="32"
				height="32"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
				<circle cx="8.5" cy="8.5" r="1.5" />
				<polyline points="21 15 16 10 5 21" />
			</svg>
			<span>Set an image source in config</span>
		</div>
	{/if}
</div>

<style>
	.image-widget {
		width: 100%;
		height: 100%;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bmo-surface);
	}

	img {
		width: 100%;
		height: 100%;
		display: block;
	}

	.placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		color: var(--bmo-muted);
		font-family: 'Courier New', Courier, monospace;
	}

	.placeholder svg {
		opacity: 0.5;
	}

	.placeholder span {
		font-size: 0.75rem;
		font-style: italic;
	}
</style>
