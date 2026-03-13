<script lang="ts">
	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	type VoiceModel = {
		id: number;
		versionName: string;
		createdAt: string;
		activatedAt: string | null;
		retiredAt: string | null;
		modelPath: string | null;
		engine: string;
		trainingNotes: string | null;
		status: string;
		checksum: string | null;
	};

	let models = $derived(Array.isArray(data) ? (data as VoiceModel[]) : []);
	let activeModel = $derived(models.find((m) => m.status === 'active') ?? null);
	let otherModels = $derived(models.filter((m) => m !== activeModel));
</script>

<div class="voice-widget">
	<div class="section-label">VOICE LINEAGE</div>

	{#if activeModel}
		<div class="active-voice">
			<div class="active-header">
				<span class="version-badge">{activeModel.versionName}</span>
				<span class="engine-label">{activeModel.engine}</span>
			</div>
			{#if activeModel.trainingNotes}
				<div class="training-notes">{activeModel.trainingNotes}</div>
			{/if}
		</div>
	{:else}
		<div class="empty-state">
			<div class="empty-text">v0 (pre-training)</div>
		</div>
	{/if}

	{#if otherModels.length > 0}
		<div class="lineage-list">
			{#each otherModels as model}
				<div class="lineage-row">
					<span class="lineage-name">{model.versionName}</span>
					<span class="lineage-status">{model.status.toUpperCase()}</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if models.length === 0}
		<div class="empty-state">
			<div class="empty-text">NO VOICE MODELS</div>
		</div>
	{/if}
</div>

<style>
	.voice-widget {
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

	.active-voice {
		margin-bottom: 0.75rem;
	}

	.active-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.version-badge {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		background: var(--bmo-green);
		color: var(--bmo-bg);
	}

	.engine-label {
		font-size: 0.65rem;
		color: var(--bmo-muted);
	}

	.training-notes {
		font-size: 0.65rem;
		line-height: 1.6;
		color: var(--bmo-muted);
	}

	.lineage-list {
		margin-top: 1rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--bmo-border);
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.lineage-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.65rem;
		color: var(--bmo-muted);
	}

	.lineage-name {
		color: var(--bmo-muted);
	}

	.lineage-status {
		letter-spacing: 0.1em;
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
