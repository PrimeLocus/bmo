<script lang="ts">
	import { WIDGET_CATEGORIES, getWidgetsByCategory } from './registry.js';
	import type { WidgetMeta } from './registry.js';

	let {
		onAdd,
		onClose,
		widgetCount,
		maxWidgets = 24
	}: {
		onAdd: (widgetId: string) => void;
		onClose: () => void;
		widgetCount: number;
		maxWidgets?: number;
	} = $props();

	let atLimit = $derived(widgetCount >= maxWidgets);

	// Build grouped list once
	let groups: { id: WidgetMeta['category']; label: string; widgets: WidgetMeta[] }[] = $derived(
		WIDGET_CATEGORIES.map((cat) => ({
			...cat,
			widgets: getWidgetsByCategory(cat.id)
		})).filter((g) => g.widgets.length > 0)
	);
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

	<!-- Widget list -->
	<div class="list">
		{#each groups as group (group.id)}
			<div class="category">
				<div class="category-heading">{group.label}</div>
				{#each group.widgets as widget (widget.id)}
					<button
						class="widget-btn"
						disabled={atLimit}
						onclick={() => onAdd(widget.id)}
					>
						<span class="widget-icon">{widget.icon}</span>
						<span class="widget-label">{widget.label}</span>
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
		width: 260px;
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

	.list {
		flex: 1;
		overflow-y: auto;
		padding: 8px 0;
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
		align-items: center;
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
	}

	.widget-label {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
