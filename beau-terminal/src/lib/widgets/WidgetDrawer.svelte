<script lang="ts">
	import { WIDGET_CATEGORIES, getWidgetsByCategory } from './registry.js';
	import type { WidgetMeta } from './registry.js';
	import { PAGE_TEMPLATES, instantiateTemplate } from './templates.js';
	import type { GridPosition } from '$lib/stores/layout.svelte.js';

	let {
		onAdd,
		onClose,
		onApplyTemplate,
		widgetCount,
		maxWidgets = 24,
		existingWidgetIds = []
	}: {
		onAdd: (widgetId: string) => void;
		onClose: () => void;
		onApplyTemplate?: (panels: Record<string, GridPosition>) => void;
		widgetCount: number;
		maxWidgets?: number;
		existingWidgetIds?: string[];
	} = $props();

	let atLimit = $derived(widgetCount >= maxWidgets);

	// Search filter
	let searchQuery = $state('');

	// Build grouped list, filtered by search query
	let groups: { id: WidgetMeta['category']; label: string; widgets: WidgetMeta[] }[] = $derived(
		WIDGET_CATEGORIES.map((cat) => ({
			...cat,
			widgets: getWidgetsByCategory(cat.id).filter((w) => {
				if (!searchQuery) return true;
				const q = searchQuery.toLowerCase();
				return (
					w.label.toLowerCase().includes(q) ||
					(w.description ?? '').toLowerCase().includes(q)
				);
			})
		})).filter((g) => g.widgets.length > 0)
	);

	function applyTemplate(key: string) {
		const template = PAGE_TEMPLATES[key];
		if (!template || !onApplyTemplate) return;
		if (!confirm(`Replace current layout with "${template.label}"?`)) return;
		onApplyTemplate(instantiateTemplate(template));
		onClose();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onClose}></div>

<aside class="drawer">
	<!-- Header -->
	<div class="header">
		<span class="title">WIDGETS</span>
		<button class="close-btn" onclick={onClose} aria-label="Close widget drawer">&times;</button>
	</div>

	<!-- Limit warning -->
	{#if atLimit}
		<div class="limit-warning">MAX {maxWidgets} WIDGETS REACHED</div>
	{/if}

	<!-- Search -->
	<div class="search-wrap">
		<input
			class="search-input"
			type="text"
			placeholder="search widgets..."
			bind:value={searchQuery}
			aria-label="Search widgets"
		/>
	</div>

	<!-- Widget list -->
	<div class="list">
		{#if onApplyTemplate && !searchQuery}
			<!-- Templates section — hidden when searching -->
			<div class="category">
				<div class="category-heading">TEMPLATES</div>
				{#each Object.entries(PAGE_TEMPLATES) as [key, template]}
					<button
						class="template-btn"
						onclick={() => applyTemplate(key)}
					>
						<span class="template-icon">{template.icon}</span>
						<div class="template-content">
							<div class="template-label">{template.label}</div>
							<div class="template-description">{template.description}</div>
						</div>
					</button>
				{/each}
			</div>
		{/if}

		{#if groups.length === 0}
			<div class="no-results">no widgets match "{searchQuery}"</div>
		{/if}

		{#each groups as group (group.id)}
			<div class="category">
				<div class="category-heading">{group.label}</div>
				{#each group.widgets as widget (widget.id)}
					{@const alreadyPlaced = existingWidgetIds.includes(widget.id)}
					<button
						class="widget-btn"
						disabled={atLimit}
						onclick={() => onAdd(widget.id)}
					>
						<span class="widget-icon">{widget.icon}</span>
						<span class="widget-content">
							<span class="widget-label">{widget.label}</span>
							{#if widget.description}
								<span class="widget-description">{widget.description}</span>
							{/if}
						</span>
						{#if alreadyPlaced}
							<span class="placed-badge" title="Already on this page">✓</span>
						{/if}
					</button>
				{/each}
			</div>
		{/each}
	</div>
</aside>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 39;
		background: rgba(0, 0, 0, 0.35);
	}

	.drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 280px;
		z-index: 40;
		background: var(--bmo-surface);
		border-left: 2px solid var(--bmo-green);
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', monospace;
		overflow: hidden;
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		border-bottom: 1px solid var(--bmo-border);
		flex-shrink: 0;
	}

	.title {
		color: var(--bmo-green);
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.2em;
	}

	.close-btn {
		background: none;
		border: none;
		color: var(--bmo-muted);
		font-size: 20px;
		cursor: pointer;
		padding: 0 4px;
		line-height: 1;
		transition: color 0.15s;
	}

	.close-btn:hover {
		color: var(--bmo-text);
	}

	.limit-warning {
		flex-shrink: 0;
		padding: 10px 16px;
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: #d63031;
		background: rgba(214, 48, 49, 0.08);
		border-bottom: 1px solid var(--bmo-border);
		text-align: center;
	}

	.search-wrap {
		flex-shrink: 0;
		padding: 8px 12px;
		border-bottom: 1px solid var(--bmo-border);
	}

	.search-input {
		width: 100%;
		background: var(--bmo-bg);
		border: 1px solid var(--bmo-border);
		color: var(--bmo-text);
		font-family: 'Courier New', monospace;
		font-size: 11px;
		padding: 6px 10px;
		outline: none;
		transition: border-color 0.15s;
		box-sizing: border-box;
	}

	.search-input::placeholder {
		color: var(--bmo-muted);
	}

	.search-input:focus {
		border-color: var(--bmo-green);
	}

	.list {
		flex: 1;
		overflow-y: auto;
		padding: 8px 0;
	}

	.no-results {
		padding: 20px 16px;
		font-size: 11px;
		color: var(--bmo-muted);
		text-align: center;
		font-style: italic;
	}

	.category {
		padding: 4px 0;
	}

	.category-heading {
		color: var(--bmo-muted);
		font-size: 8px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.2em;
		padding: 8px 16px 4px;
	}

	.widget-btn {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		width: 100%;
		padding: 8px 16px;
		background: none;
		border: none;
		color: var(--bmo-text);
		font-family: 'Courier New', monospace;
		font-size: 12px;
		text-align: left;
		cursor: pointer;
		transition: background 0.12s;
	}

	.widget-btn:hover:not(:disabled) {
		background: rgba(0, 229, 160, 0.06);
	}

	.widget-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.widget-icon {
		font-size: 14px;
		width: 20px;
		text-align: center;
		flex-shrink: 0;
		margin-top: 1px;
	}

	.widget-content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.widget-label {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: 12px;
	}

	.widget-description {
		color: var(--bmo-muted);
		font-size: 9px;
		line-height: 1.3;
		white-space: normal;
		word-break: break-word;
	}

	.placed-badge {
		flex-shrink: 0;
		color: var(--bmo-green);
		font-size: 11px;
		margin-top: 2px;
		opacity: 0.8;
	}

	.template-btn {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		width: 100%;
		padding: 8px 16px;
		background: none;
		border: none;
		color: var(--bmo-text);
		font-family: 'Courier New', monospace;
		font-size: 11px;
		text-align: left;
		cursor: pointer;
		transition: background 0.12s;
	}

	.template-btn:hover {
		background: rgba(0, 229, 160, 0.06);
	}

	.template-icon {
		font-size: 14px;
		width: 20px;
		text-align: center;
		flex-shrink: 0;
		margin-top: 2px;
	}

	.template-content {
		flex: 1;
		min-width: 0;
	}

	.template-label {
		color: var(--bmo-text);
		font-size: 11px;
		font-weight: 500;
		margin-bottom: 2px;
	}

	.template-description {
		color: var(--bmo-muted);
		font-size: 9px;
		line-height: 1.2;
		white-space: normal;
		word-break: break-word;
	}
</style>
