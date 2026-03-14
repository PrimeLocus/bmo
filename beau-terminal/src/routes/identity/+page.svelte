<script lang="ts">
  import PanelCanvas from '$lib/components/PanelCanvas.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import SoulCodeWidget from '$lib/widgets/terminal/SoulCodeWidget.svelte';
  import NatalChartWidget from '$lib/widgets/terminal/NatalChartWidget.svelte';
  import VoiceWidget from '$lib/widgets/terminal/VoiceWidget.svelte';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();
</script>

<div>
  <div class="mb-8">
    <h1 class="text-2xl tracking-widest font-bold" style="color: var(--bmo-green)">IDENTITY</h1>
    <p class="text-xs mt-1" style="color: var(--bmo-muted)">what beau is — immutable or slowly-evolving</p>
  </div>

  <PanelCanvas pageId="/identity">
    <Panel id="identity:emergence" label="Emergence" defaultPosition={{ col: 0, row: 0, colSpan: 4, rowSpan: 3 }}>
      <SoulCodeWidget config={{}} data={data.emergence} />
    </Panel>

    <Panel id="identity:natal" label="Natal Chart" defaultPosition={{ col: 4, row: 0, colSpan: 4, rowSpan: 3 }}>
      <NatalChartWidget config={{}} data={data.natal} />
    </Panel>

    <Panel id="identity:voice" label="Voice Lineage" defaultPosition={{ col: 8, row: 0, colSpan: 4, rowSpan: 3 }}>
      <VoiceWidget config={{}} data={data.voiceModels} />
    </Panel>
  </PanelCanvas>
</div>
