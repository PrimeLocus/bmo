<script lang="ts">
	import { getWidgetMeta } from './registry.js';
	import type { ConfigField } from './registry.js';

	let {
		widgetId,
		config,
		onSave,
		onClose
	}: {
		widgetId: string;
		config: Record<string, unknown>;
		onSave: (config: Record<string, unknown>) => void;
		onClose: () => void;
	} = $props();

	let meta = $derived(getWidgetMeta(widgetId));
	let schema: ConfigField[] = $derived(meta?.configSchema ?? []);

	// Draft state — deep clone so edits don't mutate the original config.
	// Re-initialize when the modal opens with a new config.
	let draft: Record<string, unknown> = $state({});
	$effect(() => {
		draft = structuredClone(config);
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}

	function handleOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onClose();
		}
	}

	function handleSave() {
		onSave(structuredClone(draft));
	}

	function updateField(key: string, value: unknown) {
		draft = { ...draft, [key]: value };
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay" onclick={handleOverlayClick}>
	<div class="panel">
		<!-- Header -->
		<div class="header">
			{#if meta}
				<span class="icon">{meta.icon}</span>
				<span class="label">{meta.label}</span>
			{/if}
			<span class="config-tag">CONFIG</span>
		</div>

		<!-- Body -->
		<div class="body">
			{#if schema.length === 0}
				<p class="no-config">No configuration options</p>
			{:else}
				{#each schema as field (field.key)}
					<div class="field">
						<label class="field-label" for="cfg-{field.key}">{field.label}</label>

						{#if field.type === 'text'}
							<input
								id="cfg-{field.key}"
								type="text"
								class="field-input"
								value={String(draft[field.key] ?? field.default ?? '')}
								oninput={(e) => updateField(field.key, (e.currentTarget as HTMLInputElement).value)}
							/>
						{:else if field.type === 'number'}
							<input
								id="cfg-{field.key}"
								type="number"
								class="field-input"
								value={Number(draft[field.key] ?? field.default ?? 0)}
								oninput={(e) => updateField(field.key, Number((e.currentTarget as HTMLInputElement).value))}
							/>
						{:else if field.type === 'boolean'}
							<label class="checkbox-row">
								<input
									id="cfg-{field.key}"
									type="checkbox"
									checked={Boolean(draft[field.key] ?? field.default ?? false)}
									onchange={(e) => updateField(field.key, (e.currentTarget as HTMLInputElement).checked)}
								/>
								<span class="checkbox-label">{field.label}</span>
							</label>
						{:else if field.type === 'select'}
							<select
								id="cfg-{field.key}"
								class="field-input"
								value={String(draft[field.key] ?? field.default ?? '')}
								onchange={(e) => updateField(field.key, (e.currentTarget as HTMLSelectElement).value)}
							>
								{#each field.options ?? [] as opt (opt.value)}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						{:else if field.type === 'textarea'}
							<textarea
								id="cfg-{field.key}"
								class="field-textarea"
								rows="6"
								value={String(draft[field.key] ?? field.default ?? '')}
								oninput={(e) => updateField(field.key, (e.currentTarget as HTMLTextAreaElement).value)}
							></textarea>
						{:else if field.type === 'datetime'}
							<input
								id="cfg-{field.key}"
								type="datetime-local"
								class="field-input"
								value={String(draft[field.key] ?? field.default ?? '')}
								oninput={(e) => updateField(field.key, (e.currentTarget as HTMLInputElement).value)}
							/>
						{/if}
					</div>
				{/each}
			{/if}
		</div>

		<!-- Footer -->
		<div class="footer">
			<button class="btn-cancel" onclick={onClose}>CANCEL</button>
			<button class="btn-save" onclick={handleSave}>SAVE</button>
		</div>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.7);
	}

	.panel {
		width: 100%;
		max-width: 440px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		background: var(--bmo-surface);
		border: 1px solid var(--bmo-green);
		border-radius: 4px;
		font-family: 'Courier New', monospace;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 14px 16px;
		border-bottom: 1px solid var(--bmo-border);
	}

	.icon {
		font-size: 16px;
	}

	.label {
		color: var(--bmo-text);
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.config-tag {
		margin-left: auto;
		color: var(--bmo-green);
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}

	.body {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.no-config {
		color: var(--bmo-muted);
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		text-align: center;
		padding: 24px 0;
		margin: 0;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field-label {
		color: var(--bmo-muted);
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}

	.field-input,
	.field-textarea {
		background: var(--bmo-bg);
		border: 1px solid var(--bmo-border);
		border-radius: 3px;
		color: var(--bmo-text);
		font-family: 'Courier New', monospace;
		font-size: 13px;
		padding: 8px 10px;
		outline: none;
		transition: border-color 0.15s;
	}

	.field-input:focus,
	.field-textarea:focus {
		border-color: var(--bmo-green);
	}

	.field-textarea {
		resize: vertical;
	}

	select.field-input {
		cursor: pointer;
	}

	select.field-input option {
		background: var(--bmo-bg);
		color: var(--bmo-text);
	}

	.checkbox-row {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	.checkbox-row input[type='checkbox'] {
		accent-color: var(--bmo-green);
		width: 16px;
		height: 16px;
		cursor: pointer;
	}

	.checkbox-label {
		color: var(--bmo-text);
		font-size: 13px;
	}

	.footer {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		padding: 12px 16px;
		border-top: 1px solid var(--bmo-border);
	}

	.btn-cancel {
		background: transparent;
		border: 1px solid var(--bmo-border);
		color: var(--bmo-muted);
		font-family: 'Courier New', monospace;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.15em;
		padding: 8px 18px;
		border-radius: 3px;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s;
	}

	.btn-cancel:hover {
		border-color: var(--bmo-muted);
		color: var(--bmo-text);
	}

	.btn-save {
		background: var(--bmo-green);
		border: 1px solid var(--bmo-green);
		color: var(--bmo-bg);
		font-family: 'Courier New', monospace;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.15em;
		padding: 8px 18px;
		border-radius: 3px;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.btn-save:hover {
		opacity: 0.85;
	}
</style>
