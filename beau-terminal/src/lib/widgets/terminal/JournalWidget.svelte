<script lang="ts">
	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	type JournalEntry = {
		id: number;
		createdAt: string;
		entryAt: string;
		title: string | null;
		body: string;
		mood: string | null;
		tagsJson: string | null;
		visibility: string;
		surfacedAt: string | null;
		filePath: string | null;
	};

	let limit = $derived(typeof config.limit === 'number' ? config.limit : 20);
	let entries = $derived(Array.isArray(data) ? (data as JournalEntry[]).slice(0, limit) : []);

	function parseTags(tagsJson: string | null): string[] {
		if (!tagsJson) return [];
		try {
			const parsed = JSON.parse(tagsJson);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	function formatDate(iso: string): string {
		try {
			return new Date(iso).toLocaleDateString();
		} catch {
			return iso;
		}
	}

	function formatDateTime(iso: string): string {
		try {
			return new Date(iso).toLocaleString();
		} catch {
			return iso;
		}
	}
</script>

<div class="journal-widget">
	<div class="journal-header">
		<div class="section-label">JOURNAL</div>
		<div class="entry-count">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</div>
	</div>

	{#if entries.length === 0}
		<div class="empty-state">
			<div class="empty-label">NO JOURNAL ENTRIES</div>
			<div class="empty-hint">entries appear when beau writes them</div>
		</div>
	{:else}
		<div class="entries-list">
			{#each entries as entry (entry.id)}
				{@const tags = parseTags(entry.tagsJson)}
				<div class="entry-card">
					<div class="entry-header">
						<div class="entry-meta">
							<span class="entry-date">{formatDateTime(entry.entryAt)}</span>
							{#if entry.mood}
								<span class="entry-mood">{entry.mood.toUpperCase()}</span>
							{/if}
						</div>
					</div>

					{#if entry.title}
						<div class="entry-title">{entry.title}</div>
					{/if}

					{#if entry.body}
						<div class="entry-body">
							{#each entry.body.split('\n') as line}
								<p class="body-line">{line}</p>
							{/each}
						</div>
					{/if}

					{#if tags.length > 0}
						<div class="tags-row">
							{#each tags as tag}
								<span class="tag">{tag}</span>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.journal-widget {
		width: 100%;
		height: 100%;
		padding: 0.75rem;
		overflow: auto;
		font-family: 'Courier New', Courier, monospace;
	}

	.journal-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.section-label {
		font-size: 0.65rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--bmo-muted);
	}

	.entry-count {
		font-size: 0.6rem;
		color: var(--bmo-muted);
	}

	.entries-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.entry-card {
		padding: 1rem;
		border: 1px solid var(--bmo-border);
		background: var(--bmo-surface);
	}

	.entry-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.entry-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.entry-date {
		font-size: 0.65rem;
		color: var(--bmo-muted);
	}

	.entry-mood {
		font-size: 0.65rem;
		letter-spacing: 0.15em;
		color: var(--bmo-muted);
	}

	.entry-title {
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--bmo-green);
		margin-bottom: 0.5rem;
	}

	.entry-body {
		font-size: 0.875rem;
		line-height: 1.6;
		color: var(--bmo-text);
	}

	.body-line {
		margin-bottom: 0.5rem;
	}

	.body-line:last-child {
		margin-bottom: 0;
	}

	.tags-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-top: 0.75rem;
	}

	.tag {
		font-size: 0.65rem;
		padding: 0.125rem 0.5rem;
		border: 1px solid var(--bmo-border);
		color: var(--bmo-muted);
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem 0;
		gap: 0.5rem;
	}

	.empty-label {
		font-size: 0.65rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--bmo-muted);
	}

	.empty-hint {
		font-size: 0.65rem;
		color: var(--bmo-muted);
	}
</style>
