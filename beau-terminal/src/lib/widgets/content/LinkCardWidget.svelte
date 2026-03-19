<script lang="ts">
	let { config }: { config: Record<string, unknown>; data?: unknown } = $props();

	let url = $derived(typeof config.url === 'string' ? config.url : '');
	let title = $derived(
		typeof config.title === 'string' && config.title ? config.title : url || ''
	);
	let description = $derived(
		typeof config.description === 'string' ? config.description : ''
	);
	let hasUrl = $derived(url.length > 0);
</script>

{#if hasUrl}
	<a
		class="link-card"
		href={url}
		target="_blank"
		rel="noopener noreferrer"
	>
		<span class="title">{title}</span>
		{#if description}
			<span class="description">{description}</span>
		{/if}
		<span class="url">{url}</span>
	</a>
{:else}
	<div class="link-card empty">
		<span class="placeholder">Set a URL in config</span>
	</div>
{/if}

<style>
	.link-card {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 0.75rem;
		gap: 0.35rem;
		text-decoration: none;
		font-family: 'Courier New', Courier, monospace;
		border: 1px solid var(--bmo-border);
		border-radius: 4px;
		background: var(--bmo-surface);
		transition: border-color 0.15s ease;
		overflow: hidden;
	}

	.link-card:hover {
		border-color: var(--bmo-green);
	}

	.link-card.empty {
		align-items: center;
	}

	.title {
		font-size: 1rem;
		font-weight: 700;
		color: var(--bmo-green);
		letter-spacing: 0.05em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.description {
		font-size: 0.8rem;
		color: var(--bmo-muted);
		line-height: 1.4;
		overflow: hidden;
		line-clamp: 2;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.url {
		font-size: 0.65rem;
		color: var(--bmo-muted);
		opacity: 0.7;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-top: auto;
	}

	.placeholder {
		font-size: 0.8rem;
		color: var(--bmo-muted);
		font-style: italic;
	}
</style>
