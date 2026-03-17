<script lang="ts">
	let { open = $bindable(false) }: { open: boolean } = $props();

	let markdown = $state('');
	let loading = $state(false);
	let copied = $state(false);

	$effect(() => {
		if (open) {
			loading = true;
			markdown = '';
			copied = false;
			fetch('/api/sitrep')
				.then((r) => r.json())
				.then((data) => {
					markdown = data.markdown;
				})
				.catch(() => {
					markdown = '# Error\n\nFailed to generate sitrep.';
				})
				.finally(() => {
					loading = false;
				});
		}
	});

	function handleCopy() {
		navigator.clipboard.writeText(markdown).then(() => {
			copied = true;
			setTimeout(() => { copied = false; }, 2000);
		});
	}

	function handleDownload() {
		const blob = new Blob([markdown], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `bmo-sitrep-${new Date().toISOString().slice(0, 10)}.md`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') open = false;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- Backdrop -->
	<div
		class="sitrep-backdrop"
		role="presentation"
		onclick={() => { open = false; }}
	></div>

	<!-- Modal -->
	<div
		class="sitrep-card"
		role="dialog"
		aria-modal="true"
		aria-label="Situation Report"
	>
		<!-- Header -->
		<div class="sitrep-header">
			<span class="sitrep-title">SITREP</span>
			<div class="sitrep-actions">
				<button
					class="sitrep-btn"
					onclick={handleCopy}
					disabled={loading || !markdown}
				>
					{copied ? 'COPIED' : 'COPY'}
				</button>
				<button
					class="sitrep-btn"
					onclick={handleDownload}
					disabled={loading || !markdown}
				>
					DOWNLOAD
				</button>
				<button
					class="sitrep-btn sitrep-btn--close"
					onclick={() => { open = false; }}
				>
					ESC
				</button>
			</div>
		</div>

		<!-- Divider -->
		<div class="sitrep-divider"></div>

		<!-- Content -->
		<div class="sitrep-body">
			{#if loading}
				<div class="sitrep-loading">Generating sitrep...</div>
			{:else}
				<pre class="sitrep-preview">{markdown}</pre>
			{/if}
		</div>
	</div>
{/if}

<style>
	.sitrep-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 9000;
		backdrop-filter: blur(2px);
	}

	.sitrep-card {
		position: fixed;
		top: 5%;
		left: 50%;
		transform: translateX(-50%);
		width: min(800px, calc(100vw - 2rem));
		max-height: 88vh;
		background: var(--bmo-surface);
		border: 1px solid var(--bmo-border);
		border-radius: 4px;
		display: flex;
		flex-direction: column;
		z-index: 9001;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.7);
		font-family: 'Courier New', Courier, monospace;
		overflow: hidden;
	}

	.sitrep-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		flex-shrink: 0;
	}

	.sitrep-title {
		font-size: 0.75rem;
		letter-spacing: 0.15em;
		color: var(--bmo-green);
		font-weight: 600;
	}

	.sitrep-actions {
		display: flex;
		gap: 0.5rem;
	}

	.sitrep-btn {
		font-family: inherit;
		font-size: 0.65rem;
		letter-spacing: 0.1em;
		color: var(--bmo-text);
		background: transparent;
		border: 1px solid var(--bmo-border);
		border-radius: 3px;
		padding: 0.3rem 0.6rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.sitrep-btn:hover:not(:disabled) {
		border-color: var(--bmo-green);
		color: var(--bmo-green);
	}

	.sitrep-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.sitrep-btn--close {
		color: var(--bmo-muted);
	}

	.sitrep-divider {
		height: 1px;
		background: var(--bmo-border);
		flex-shrink: 0;
	}

	.sitrep-body {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
	}

	.sitrep-body::-webkit-scrollbar {
		width: 4px;
	}
	.sitrep-body::-webkit-scrollbar-track {
		background: transparent;
	}
	.sitrep-body::-webkit-scrollbar-thumb {
		background: var(--bmo-border);
		border-radius: 2px;
	}

	.sitrep-loading {
		padding: 3rem 1rem;
		text-align: center;
		color: var(--bmo-muted);
		font-size: 0.875rem;
		letter-spacing: 0.05em;
	}

	.sitrep-preview {
		margin: 0;
		padding: 1rem;
		font-family: inherit;
		font-size: 0.8rem;
		line-height: 1.6;
		color: var(--bmo-text);
		white-space: pre-wrap;
		word-wrap: break-word;
	}
</style>
