<script lang="ts">
  import PanelCanvas from '$lib/components/PanelCanvas.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import WidgetRenderer from '$lib/widgets/WidgetRenderer.svelte';
  import WidgetDrawer from '$lib/widgets/WidgetDrawer.svelte';
  import WidgetConfigModal from '$lib/widgets/WidgetConfigModal.svelte';
  import { editModeState } from '$lib/stores/editMode.svelte.js';
  import { getPageLayout, savePageLayout } from '$lib/stores/layout.svelte.js';
  import { getWidgetMeta } from '$lib/widgets/registry.js';
  import { nanoid } from 'nanoid';
  import { applyMove, compact } from '$lib/stores/gridEngine.js';

  const { data } = $props();

  const pageId = $derived(`custom:${data.page.slug}`);
  const layout = $derived(getPageLayout(pageId));

  // Widget panels from saved layout
  const widgetPanels = $derived(() => {
    if (!layout?.panels) return [];
    return Object.entries(layout.panels)
      .filter(([, pos]) => pos.widgetId)
      .map(([id, pos]) => ({
        id,
        widgetId: pos.widgetId!,
        config: pos.config ?? {},
        position: pos,
      }));
  });

  // Widget drawer state
  let showWidgetDrawer = $state(false);
  let widgetCount = $derived(widgetPanels().length);

  // Config modal state
  let configPanelId = $state<string | null>(null);
  let configWidgetId = $state<string | null>(null);
  let configValues = $state<Record<string, unknown>>({});

  function handleAddWidget(widgetId: string) {
    const meta = getWidgetMeta(widgetId);
    if (!meta) return;

    const instanceId = `w:${widgetId}:${nanoid(8)}`;
    const currentLayout = getPageLayout(pageId);
    const panels = currentLayout?.panels ? { ...currentLayout.panels } : {};

    // Build default config from schema
    const defaultConfig: Record<string, unknown> = {};
    for (const field of meta.configSchema) {
      defaultConfig[field.key] = field.default;
    }

    // Place at row 0, col 0 and let applyMove push others down
    const newPos = {
      col: 0,
      row: 0,
      colSpan: meta.defaultPosition.colSpan,
      rowSpan: meta.defaultPosition.rowSpan,
      widgetId,
      instanceId,
      config: defaultConfig,
    };

    panels[instanceId] = newPos;
    const compacted = compact(panels);
    savePageLayout(pageId, { ...currentLayout, panels: compacted });
    showWidgetDrawer = false;
  }

  function handleRemoveWidget(panelId: string) {
    const currentLayout = getPageLayout(pageId);
    if (!currentLayout?.panels) return;
    const { [panelId]: _, ...rest } = currentLayout.panels;
    savePageLayout(pageId, { ...currentLayout, panels: compact(rest) });
  }

  function openConfig(panelId: string) {
    const pos = layout?.panels[panelId];
    if (!pos?.widgetId) return;
    configPanelId = panelId;
    configWidgetId = pos.widgetId;
    configValues = pos.config ? { ...pos.config } : {};
  }

  function handleConfigSave(newConfig: Record<string, unknown>) {
    if (!configPanelId) return;
    const currentLayout = getPageLayout(pageId);
    if (!currentLayout?.panels?.[configPanelId]) return;
    const updated = {
      ...currentLayout,
      panels: {
        ...currentLayout.panels,
        [configPanelId]: {
          ...currentLayout.panels[configPanelId],
          config: newConfig,
        },
      },
    };
    savePageLayout(pageId, updated);
    configPanelId = null;
  }
</script>

<svelte:head>
  <title>{data.page.name} — Beau Terminal</title>
</svelte:head>

<div class="mb-6">
  <h1 class="text-sm tracking-widest font-bold" style="color: var(--bmo-green)">
    {data.page.icon} {data.page.name}
  </h1>
</div>

{#if widgetPanels().length === 0 && !editModeState.active}
  <div class="flex flex-col items-center justify-center py-20 gap-4">
    <div class="text-sm tracking-widest" style="color: var(--bmo-muted)">EMPTY PAGE</div>
    <div class="text-xs" style="color: var(--bmo-muted); opacity: 0.6">Press Ctrl+E to enter edit mode and add widgets</div>
  </div>
{:else}
  <PanelCanvas {pageId}>
    {#each widgetPanels() as wp (wp.id)}
      <Panel id={wp.id} defaultPosition={wp.position} label={wp.widgetId}>
        {#if editModeState.active}
          <div class="widget-edit-controls">
            <button onclick={() => openConfig(wp.id)} title="Configure">⚙</button>
            <button onclick={() => handleRemoveWidget(wp.id)} title="Remove">✕</button>
          </div>
        {/if}
        <WidgetRenderer
          widgetId={wp.widgetId}
          config={wp.config}
          data={data.widgetData[wp.id]}
        />
      </Panel>
    {/each}
  </PanelCanvas>
{/if}

{#if editModeState.active}
  <div class="flex items-center justify-center gap-3 mt-4">
    <button
      onclick={() => showWidgetDrawer = true}
      class="text-xs tracking-widest px-4 py-2 border transition-all hover:opacity-80"
      style="border-color: var(--bmo-green); color: var(--bmo-green); cursor: pointer"
    >
      + WIDGET
    </button>
  </div>
{/if}

{#if showWidgetDrawer}
  <WidgetDrawer
    onAdd={handleAddWidget}
    onClose={() => showWidgetDrawer = false}
    {widgetCount}
  />
{/if}

{#if configPanelId && configWidgetId}
  <WidgetConfigModal
    widgetId={configWidgetId}
    config={configValues}
    onSave={handleConfigSave}
    onClose={() => configPanelId = null}
  />
{/if}

<style>
  .widget-edit-controls {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    gap: 4px;
    z-index: 10;
  }

  .widget-edit-controls button {
    background: var(--bmo-surface);
    border: 1px solid var(--bmo-border);
    color: var(--bmo-muted);
    font-size: 10px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 2px;
    transition: all 0.15s;
  }

  .widget-edit-controls button:hover {
    border-color: var(--bmo-green);
    color: var(--bmo-green);
  }
</style>
