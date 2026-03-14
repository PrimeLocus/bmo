<script lang="ts">
  import PanelCanvas from '$lib/components/PanelCanvas.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import DispatcherLogWidget from '$lib/widgets/terminal/DispatcherLogWidget.svelte';
  import HaikuArchiveWidget from '$lib/widgets/terminal/HaikuArchiveWidget.svelte';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();
</script>

<div>
  <div class="mb-6">
    <h1 class="text-xl tracking-widest font-bold" style="color: var(--bmo-green)">MEMORY</h1>
    <p class="text-xs mt-1" style="color: var(--bmo-muted)">live dispatcher · {data.haikus.length} haikus stored</p>
  </div>

  <PanelCanvas pageId="/memory">
    <Panel id="memory:dispatcher" label="Dispatcher Log" defaultPosition={{ col: 0, row: 0, colSpan: 6, rowSpan: 4 }}>
      <DispatcherLogWidget config={{}} />
    </Panel>

    <Panel id="memory:haiku-archive" label="Haiku Archive" defaultPosition={{ col: 6, row: 0, colSpan: 6, rowSpan: 4 }}>
      <HaikuArchiveWidget config={{}} data={data.haikus} />
    </Panel>
  </PanelCanvas>
</div>
