<script lang="ts">
	import { enhance } from '$app/forms';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	const PRESET_TOPICS = [
		'beau/command/mode',
		'beau/command/emotion',
		'beau/command/haiku',
		'beau/state/mode',
		'beau/state/emotion',
	];

	const PRESETS: { label: string; topic: string; content: string }[] = [
		{ label: 'mode: ambient', topic: 'beau/state/mode', content: 'ambient' },
		{ label: 'mode: witness', topic: 'beau/state/mode', content: 'witness' },
		{ label: 'mode: collaborator', topic: 'beau/state/mode', content: 'collaborator' },
		{ label: 'mode: archivist', topic: 'beau/state/mode', content: 'archivist' },
		{ label: 'mode: social', topic: 'beau/state/mode', content: 'social' },
		{ label: 'emotion: curious', topic: 'beau/state/emotion', content: 'curious' },
		{ label: 'emotion: playful', topic: 'beau/state/emotion', content: 'playful' },
		{ label: 'emotion: contemplative', topic: 'beau/state/emotion', content: 'contemplative' },
		{ label: 'emotion: sleepy', topic: 'beau/state/emotion', content: 'sleepy' },
	];

	let topic = $state('beau/command/mode');
	let content = $state('');
	let label = $state('');
	let brainContent = $state('');
	let brainLabel = $state('');
	let brainResponse: { text: string | null; tier: string; model: string } | null = $state(null);

	function applyPreset(p: typeof PRESETS[number]) {
		topic = p.topic;
		content = p.content;
	}

	type HistoryEntry = { id: number; content: string; label: string; createdAt: string | Date | null };

	let history = $derived.by((): HistoryEntry[] => {
		if (!data || !Array.isArray(data)) return [];
		return data as HistoryEntry[];
	});

	function fmt(d: string | Date | null): string {
		if (!d) return '';
		return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="console-widget">
	<!-- Presets -->
	<div class="section">
		<div class="section-label">PRESETS</div>
		<div class="presets">
			{#each PRESETS as p}
				<button
					type="button"
					onclick={() => applyPreset(p)}
					class="preset-btn"
				>
					&uarr; {p.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Send form -->
	<form method="POST" action="/prompt?/send" use:enhance
		onsubmit={() => { content = ''; label = ''; }}
		class="send-form">
		<div class="form-row">
			<div class="field field-grow">
				<label class="field-label" for="widget-prompt-topic">TOPIC</label>
				<input
					id="widget-prompt-topic"
					type="text"
					name="topic"
					bind:value={topic}
					list="widget-topic-suggestions"
					class="field-input"
				/>
				<datalist id="widget-topic-suggestions">
					{#each PRESET_TOPICS as t}
						<option value={t}>{t}</option>
					{/each}
				</datalist>
			</div>
			<div class="field field-label-col">
				<label class="field-label" for="widget-prompt-label">LABEL (OPT)</label>
				<input
					id="widget-prompt-label"
					type="text"
					name="label"
					bind:value={label}
					placeholder="memo..."
					class="field-input"
				/>
			</div>
		</div>
		<div class="field">
			<label class="field-label" for="widget-prompt-content">MESSAGE</label>
			<textarea
				id="widget-prompt-content"
				name="content"
				bind:value={content}
				rows="3"
				placeholder="message payload..."
				class="field-textarea"
			></textarea>
		</div>
		<button type="submit" class="publish-btn">PUBLISH</button>
	</form>

	<!-- Brain dispatch form -->
	<div class="section">
		<div class="section-label">BRAIN DISPATCH</div>
		<form method="POST" action="/prompt?/dispatch" use:enhance={() => {
			return async ({ result, update }) => {
				if (result.type === 'success' && result.data) {
					brainResponse = {
						text: (result.data as any).response ?? null,
						tier: (result.data as any).tier ?? '?',
						model: (result.data as any).model ?? '?',
					};
				}
				await update();
				brainContent = '';
				brainLabel = '';
			};
		}} class="send-form">
			<div class="form-row">
				<div class="field field-grow">
					<label class="field-label" for="widget-brain-content">PROMPT</label>
					<textarea
						id="widget-brain-content"
						name="content"
						bind:value={brainContent}
						rows="3"
						placeholder="ask Beau something..."
						class="field-textarea"
					></textarea>
				</div>
				<div class="field field-label-col">
					<label class="field-label" for="widget-brain-label">LABEL (OPT)</label>
					<input
						id="widget-brain-label"
						type="text"
						name="label"
						bind:value={brainLabel}
						placeholder="memo..."
						class="field-input"
					/>
				</div>
			</div>
			<button type="submit" class="publish-btn brain-btn">DISPATCH</button>
		</form>
	</div>

	{#if brainResponse}
		<div class="brain-response">
			<div class="section-label">RESPONSE <span class="tier-badge">{brainResponse.tier}</span> <span class="model-badge">{brainResponse.model}</span></div>
			<div class="response-text">{brainResponse.text ?? '(SILENCE)'}</div>
		</div>
	{/if}

	<!-- Recent history -->
	{#if history.length > 0}
		<div class="history-section">
			<div class="section-label">RECENT</div>
			<div class="history-list">
				{#each history.slice(0, 5) as entry (entry.id)}
					<div class="history-entry">
						<span class="history-time">{fmt(entry.createdAt)}</span>
						<span class="history-content">{entry.content}</span>
						{#if entry.label}
							<span class="history-label">{entry.label}</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.console-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', Courier, monospace;
		padding: 1rem;
		gap: 1rem;
		overflow-y: auto;
	}

	.section-label {
		font-size: 0.625rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--bmo-muted);
		margin-bottom: 0.5rem;
	}

	.presets {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.preset-btn {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.75rem;
		padding: 0.25rem 0.75rem;
		border: 1px solid var(--bmo-border);
		background: transparent;
		color: var(--bmo-muted);
		letter-spacing: 0.15em;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.preset-btn:hover {
		opacity: 0.8;
	}

	.send-form {
		border: 1px solid var(--bmo-border);
		background: var(--bmo-surface);
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.form-row {
		display: flex;
		gap: 0.75rem;
	}

	.field {
		display: flex;
		flex-direction: column;
	}

	.field-grow {
		flex: 1;
	}

	.field-label-col {
		width: 10rem;
	}

	.field-label {
		font-size: 0.625rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--bmo-muted);
		margin-bottom: 0.25rem;
	}

	.field-input {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.75rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--bmo-border);
		background: var(--bmo-bg);
		color: var(--bmo-text);
		width: 100%;
	}

	.field-textarea {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.75rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--bmo-border);
		background: var(--bmo-bg);
		color: var(--bmo-text);
		width: 100%;
		resize: none;
	}

	.publish-btn {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.75rem;
		padding: 0.5rem 1.5rem;
		border: 1px solid var(--bmo-green);
		background: transparent;
		color: var(--bmo-green);
		letter-spacing: 0.15em;
		font-weight: 700;
		cursor: pointer;
		transition: opacity 0.15s;
		align-self: flex-start;
	}

	.publish-btn:hover {
		opacity: 0.8;
	}

	.history-section {
		border-top: 1px solid var(--bmo-border);
		padding-top: 0.75rem;
	}

	.history-list {
		display: flex;
		flex-direction: column;
	}

	.history-entry {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.375rem 0;
		border-bottom: 1px solid var(--bmo-border);
	}

	.history-time {
		font-size: 0.75rem;
		color: var(--bmo-muted);
		flex-shrink: 0;
	}

	.history-content {
		font-size: 0.75rem;
		color: var(--bmo-text);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.history-label {
		font-size: 0.75rem;
		color: var(--bmo-muted);
		font-style: italic;
		flex-shrink: 0;
	}

	.brain-btn {
		border-color: #6ec6ff;
		color: #6ec6ff;
	}

	.brain-response {
		border: 1px solid var(--bmo-border);
		background: var(--bmo-surface);
		padding: 1rem;
	}

	.response-text {
		font-size: 0.875rem;
		color: var(--bmo-text);
		white-space: pre-wrap;
		line-height: 1.5;
	}

	.tier-badge, .model-badge {
		font-size: 0.625rem;
		padding: 0.125rem 0.375rem;
		border: 1px solid var(--bmo-border);
		color: var(--bmo-muted);
		margin-left: 0.5rem;
	}
</style>
