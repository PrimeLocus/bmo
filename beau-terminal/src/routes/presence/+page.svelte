<script lang="ts">
  import PanelCanvas from '$lib/components/PanelCanvas.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import SleepWidget from '$lib/widgets/terminal/SleepWidget.svelte';
  import RoomWidget from '$lib/widgets/terminal/RoomWidget.svelte';
  import LightWidget from '$lib/widgets/terminal/LightWidget.svelte';
  import CameraWidget from '$lib/widgets/terminal/CameraWidget.svelte';
  import WeatherWidget from '$lib/widgets/terminal/WeatherWidget.svelte';
  import SeasonWidget from '$lib/widgets/terminal/SeasonWidget.svelte';
  import EventTimelineWidget from '$lib/widgets/terminal/EventTimelineWidget.svelte';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();
</script>

<div>
  <div class="mb-8">
    <h1 class="text-2xl tracking-widest font-bold" style="color: var(--bmo-green)">PRESENCE</h1>
    <p class="text-xs mt-1" style="color: var(--bmo-muted)">what beau senses — room, light, weather</p>
  </div>

  <PanelCanvas pageId="/presence">
    <Panel id="presence:sleep" label="Sleep" defaultPosition={{ col: 0, row: 0, colSpan: 6, rowSpan: 2 }}>
      <SleepWidget config={{}} />
    </Panel>

    <Panel id="presence:room" label="Room" defaultPosition={{ col: 6, row: 0, colSpan: 6, rowSpan: 2 }}>
      <RoomWidget config={{}} />
    </Panel>

    <Panel id="presence:light" label="Light" defaultPosition={{ col: 0, row: 2, colSpan: 3, rowSpan: 1 }}>
      <LightWidget config={{}} />
    </Panel>

    <Panel id="presence:camera" label="Camera" defaultPosition={{ col: 3, row: 2, colSpan: 3, rowSpan: 1 }}>
      <CameraWidget config={{}} />
    </Panel>

    <Panel id="presence:weather" label="Weather" defaultPosition={{ col: 6, row: 2, colSpan: 3, rowSpan: 1 }}>
      <WeatherWidget config={{}} />
    </Panel>

    <Panel id="presence:season" label="Season" defaultPosition={{ col: 9, row: 2, colSpan: 3, rowSpan: 1 }}>
      <SeasonWidget config={{}} />
    </Panel>

    <Panel id="presence:timeline" label="Event Timeline" defaultPosition={{ col: 0, row: 3, colSpan: 12, rowSpan: 3 }}>
      <EventTimelineWidget config={{}} data={data.recentEvents} />
    </Panel>
  </PanelCanvas>
</div>
