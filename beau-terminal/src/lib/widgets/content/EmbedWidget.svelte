<script lang="ts">
	let { config }: { config: Record<string, unknown>; data?: unknown } = $props();

	let url = $derived(typeof config.url === 'string' ? config.url : '');
	let height = $derived(
		typeof config.height === 'number' && config.height > 0 ? config.height : 300
	);
	let hasUrl = $derived(url.length > 0);
</script>

<div class="embed-widget">
	{#if hasUrl}
		<iframe
			src={url}
			title="Embedded content"
			sandbox="allow-scripts allow-same-origin"
			style:height="{height}px"
		></iframe>
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
				<circle cx="12" cy="12" r="10" />
				<line x1="2" y1="12" x2="22" y2="12" />
				<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
			</svg>
			<span>Set a URL in config</span>
		</div>
	{/if}
</div>

<style>
	.embed-widget {
		width: 100%;
		height: 100%;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bmo-surface);
	}

	iframe {
		width: 100%;
		border: 1px solid var(--bmo-border);
		border-radius: 4px;
		background: var(--bmo-bg);
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
