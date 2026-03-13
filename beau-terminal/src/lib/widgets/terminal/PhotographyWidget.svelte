<script lang="ts">
	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	type Photo = {
		id: number;
		createdAt: string;
		capturedAt: string | null;
		imagePath: string;
		thumbnailPath: string | null;
		caption: string | null;
		notes: string | null;
		sourceType: string;
		isPrivate: boolean;
	};

	const photos = $derived(Array.isArray(data) ? (data as Photo[]) : []);

	function formatDate(d: string): string {
		return new Date(d).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});
	}

	function formatSourceType(s: string): string {
		return s.toUpperCase().replace(/_/g, ' ');
	}
</script>

<div class="photography-widget">
	<div class="header">
		<span class="label">PHOTOGRAPHY</span>
		<span class="count">{photos.length}</span>
	</div>

	{#if photos.length === 0}
		<div class="empty">
			<span class="empty-label">NO PHOTOS YET</span>
			<span class="empty-sub">upload photos from sessions or daily life</span>
		</div>
	{:else}
		<div class="photo-grid">
			{#each photos as photo (photo.id)}
				<div class="photo-item">
					<img
						src="/photos/{photo.thumbnailPath || photo.imagePath}"
						alt={photo.caption || 'photo'}
						class="photo-img"
					/>
					<div class="photo-overlay">
						{#if photo.caption}
							<span class="photo-caption">{photo.caption}</span>
						{/if}
						<div class="photo-meta">
							<span class="photo-date">{formatDate(photo.createdAt)}</span>
							<span class="photo-source">{formatSourceType(photo.sourceType)}</span>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.photography-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', Courier, monospace;
		overflow: hidden;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		flex-shrink: 0;
		border-bottom: 1px solid var(--bmo-border);
	}

	.label {
		font-size: 0.65rem;
		font-weight: 700;
		color: var(--bmo-muted);
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}

	.count {
		font-size: 0.6rem;
		color: var(--bmo-muted);
		margin-left: auto;
	}

	.empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		padding: 1rem;
	}

	.empty-label {
		font-size: 0.65rem;
		color: var(--bmo-muted);
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}

	.empty-sub {
		font-size: 0.6rem;
		color: var(--bmo-muted);
		opacity: 0.7;
	}

	.photo-grid {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.35rem;
		align-content: start;
	}

	.photo-item {
		position: relative;
		aspect-ratio: 1;
		border: 1px solid var(--bmo-border);
		background: var(--bmo-surface);
		overflow: hidden;
	}

	.photo-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.photo-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		padding: 0.35rem;
		background: linear-gradient(transparent 40%, rgba(10, 15, 13, 0.9));
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.photo-item:hover .photo-overlay {
		opacity: 1;
	}

	.photo-caption {
		font-size: 0.55rem;
		color: var(--bmo-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-bottom: 0.15rem;
	}

	.photo-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.photo-date {
		font-size: 0.5rem;
		color: var(--bmo-muted);
	}

	.photo-source {
		font-size: 0.45rem;
		color: var(--bmo-muted);
		letter-spacing: 0.15em;
	}
</style>
