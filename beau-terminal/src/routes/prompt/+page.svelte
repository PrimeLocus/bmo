<script lang="ts">
  import PanelCanvas from '$lib/components/PanelCanvas.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import PromptConsoleWidget from '$lib/widgets/terminal/PromptConsoleWidget.svelte';
  import PromptHistoryWidget from '$lib/widgets/terminal/PromptHistoryWidget.svelte';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();
</script>

<div class="max-w-3xl">
  <div class="mb-6">
    <h1 class="text-xl tracking-widest font-bold" style="color: var(--bmo-green)">PROMPT CONSOLE</h1>
    <p class="text-xs mt-1" style="color: var(--bmo-muted)">publish MQTT commands to Beau</p>
  </div>

  <PanelCanvas pageId="/prompt">
    <Panel id="prompt:console" label="Prompt Console" defaultPosition={{ col: 0, row: 0, colSpan: 12, rowSpan: 4 }}>
      <PromptConsoleWidget config={{}} data={data.history} />
    </Panel>

    <Panel id="prompt:history" label="History" defaultPosition={{ col: 0, row: 4, colSpan: 12, rowSpan: 3 }}>
      <PromptHistoryWidget config={{}} data={data.history} />
    </Panel>
  </PanelCanvas>
</div>
