<script lang="ts">
	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	type EmergenceArtifact = {
		id: number;
		singleton: string;
		createdAt: string;
		emergenceTimestamp: string;
		haikuText: string;
		modelUsed: string | null;
		promptUsed: string | null;
		natalInputJson: string | null;
		filePath: string | null;
		checksum: string | null;
		bootId: string | null;
	};

	let emergence = $derived(data as EmergenceArtifact | null | undefined);
	let haikuLines = $derived(emergence?.haikuText?.split('\n') ?? []);
</script>

<div class="soul-code-widget">
	<div class="section-label">EMERGENCE</div>

	{#if emergence}
		<div class="haiku-container">
			{#each haikuLines as line}
				<div class="haiku-line">{line}</div>
			{/each}
		</div>

		<div class="meta-section">
			<div class="meta-row">Born: {emergence.emergenceTimestamp}</div>
			{#if emergence.modelUsed}
				<div class="meta-row">Model: {emergence.modelUsed}</div>
			{/if}
			{#if emergence.bootId}
				<div class="meta-row">Boot: {emergence.bootId}</div>
			{/if}
		</div>
	{:else}
		<div class="empty-state">
			<div class="empty-text">awaiting first true boot</div>
		</div>
	{/if}
</div>

<style>
	.soul-code-widget {
		width: 100%;
		height: 100%;
		padding: 0.75rem;
		overflow: auto;
		font-family: 'Courier New', Courier, monospace;
	}

	.section-label {
		font-size: 0.65rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--bmo-muted);
		margin-bottom: 1rem;
	}

	.haiku-container {
		text-align: center;
		padding: 1rem 0;
	}

	.haiku-line {
		font-size: 0.875rem;
		font-style: italic;
		line-height: 1.6;
		color: var(--bmo-text);
	}

	.meta-section {
		margin-top: 1rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--bmo-border);
	}

	.meta-row {
		font-size: 0.65rem;
		color: var(--bmo-muted);
		margin-bottom: 0.25rem;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem 0;
	}

	.empty-text {
		font-size: 0.875rem;
		font-style: italic;
		color: var(--bmo-muted);
	}
</style>
