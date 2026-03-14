<script lang="ts">
	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	let captureType = $state<'idea' | 'task' | 'note'>('note');
	let captureText = $state('');
	let status = $state<'idle' | 'submitting' | 'success' | 'error'>('idle');
	let errorMsg = $state('');

	async function handleSubmit(e: Event) {
		e.preventDefault();
		const trimmed = captureText.trim();
		if (!trimmed) return;

		status = 'submitting';
		errorMsg = '';

		try {
			const res = await fetch('/api/capture', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: trimmed, type: captureType })
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
			}

			captureText = '';
			status = 'success';
			setTimeout(() => {
				status = 'idle';
			}, 2000);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'unknown error';
			status = 'error';
			setTimeout(() => {
				status = 'idle';
				errorMsg = '';
			}, 4000);
		}
	}
</script>

<div class="capture-widget">
	<div class="widget-label">QUICK CAPTURE</div>

	<form class="capture-form" onsubmit={handleSubmit}>
		<div class="type-row">
			{#each ['idea', 'task', 'note'] as t}
				<button
					type="button"
					class="type-btn"
					class:active={captureType === t}
					onclick={() => { captureType = t as 'idea' | 'task' | 'note'; }}
				>
					{t.toUpperCase()}
				</button>
			{/each}
		</div>

		<textarea
			class="capture-input"
			placeholder="capture something..."
			bind:value={captureText}
			rows="3"
			disabled={status === 'submitting'}
		></textarea>

		<button
			type="submit"
			class="submit-btn"
			class:success={status === 'success'}
			class:error={status === 'error'}
			disabled={status === 'submitting' || !captureText.trim()}
		>
			{#if status === 'submitting'}
				SAVING...
			{:else if status === 'success'}
				SAVED
			{:else if status === 'error'}
				ERROR
			{:else}
				CAPTURE
			{/if}
		</button>

		{#if status === 'error' && errorMsg}
			<div class="error-msg">{errorMsg}</div>
		{/if}
	</form>
</div>

<style>
	.capture-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', Courier, monospace;
	}

	.widget-label {
		font-size: 0.75rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--bmo-muted);
		margin-bottom: 1rem;
	}

	.capture-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		flex: 1;
	}

	.type-row {
		display: flex;
		gap: 0.4rem;
	}

	.type-btn {
		padding: 0.25rem 0.6rem;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		background: transparent;
		border: 1px solid var(--bmo-border);
		color: var(--bmo-muted);
		cursor: pointer;
		transition: all 0.15s;
	}

	.type-btn:hover {
		border-color: var(--bmo-green);
		color: var(--bmo-green);
	}

	.type-btn.active {
		border-color: var(--bmo-green);
		color: var(--bmo-green);
		background: rgba(0, 229, 160, 0.07);
	}

	.capture-input {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.8rem;
		background: var(--bmo-bg);
		border: 1px solid var(--bmo-border);
		color: var(--bmo-text);
		padding: 0.5rem 0.6rem;
		resize: none;
		flex: 1;
		min-height: 60px;
		transition: border-color 0.15s;
	}

	.capture-input:focus {
		outline: none;
		border-color: var(--bmo-green);
	}

	.capture-input:disabled {
		opacity: 0.5;
	}

	.capture-input::placeholder {
		color: var(--bmo-muted);
	}

	.submit-btn {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.75rem;
		letter-spacing: 0.15em;
		padding: 0.4rem 0.75rem;
		background: transparent;
		border: 1px solid var(--bmo-green);
		color: var(--bmo-green);
		cursor: pointer;
		align-self: flex-end;
		transition: all 0.15s;
	}

	.submit-btn:hover:not(:disabled) {
		background: rgba(0, 229, 160, 0.1);
	}

	.submit-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.submit-btn.success {
		border-color: var(--bmo-green);
		color: var(--bmo-green);
		background: rgba(0, 229, 160, 0.12);
	}

	.submit-btn.error {
		border-color: #d63031;
		color: #d63031;
	}

	.error-msg {
		font-size: 0.7rem;
		color: #d63031;
		letter-spacing: 0.05em;
	}
</style>
