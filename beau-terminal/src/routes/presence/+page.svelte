<script lang="ts">
  import PanelCanvas from '$lib/components/PanelCanvas.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import { beauState } from '$lib/stores/beau.svelte.js';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();
</script>

<div class="max-w-4xl">
  <div class="mb-8">
    <h1 class="text-2xl tracking-widest font-bold" style="color: var(--bmo-green)">PRESENCE</h1>
    <p class="text-xs mt-1" style="color: var(--bmo-muted)">what beau senses — room, light, weather</p>
  </div>

  <PanelCanvas pageId="/presence">
    <Panel id="presence:sleep" label="Sleep" defaultPosition={{ col: 0, row: 0, colSpan: 6, rowSpan: 2 }}>
      <div class="text-xs tracking-widest mb-4" style="color: var(--bmo-muted)">SLEEP STATE</div>
      <div class="text-3xl font-bold tracking-widest text-center py-4"
           style="color: {beauState.sleepState === 'asleep' ? '#636e72' : beauState.sleepState === 'waking' ? 'var(--bmo-green)' : 'var(--bmo-text)'}">
        {beauState.sleepState.toUpperCase()}
      </div>
    </Panel>

    <Panel id="presence:room" label="Room" defaultPosition={{ col: 6, row: 0, colSpan: 6, rowSpan: 2 }}>
      <div class="text-xs tracking-widest mb-4" style="color: var(--bmo-muted)">ROOM PRESENCE</div>
      <div class="text-3xl font-bold tracking-widest text-center py-4"
           style="color: {beauState.presenceState === 'occupied' ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
        {beauState.presenceState.toUpperCase()}
      </div>
    </Panel>

    <Panel id="presence:light" label="Light" defaultPosition={{ col: 0, row: 2, colSpan: 3, rowSpan: 1 }}>
      <div class="text-xs tracking-widest mb-2" style="color: var(--bmo-muted)">LIGHT</div>
      <div class="text-sm font-bold" style="color: var(--bmo-green)">
        {beauState.luxLabel ? beauState.luxLabel.toUpperCase() : '—'}
      </div>
      {#if beauState.lux !== null}
        <div class="text-xs mt-1" style="color: var(--bmo-muted)">{beauState.lux} lux</div>
      {/if}
    </Panel>

    <Panel id="presence:camera" label="Camera" defaultPosition={{ col: 3, row: 2, colSpan: 3, rowSpan: 1 }}>
      <div class="text-xs tracking-widest mb-2" style="color: var(--bmo-muted)">CAMERA</div>
      <div class="text-sm font-bold" style="color: {beauState.cameraActive ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
        {beauState.cameraActive ? 'ACTIVE' : 'OFF'}
      </div>
    </Panel>

    <Panel id="presence:weather" label="Weather" defaultPosition={{ col: 6, row: 2, colSpan: 3, rowSpan: 1 }}>
      <div class="text-xs tracking-widest mb-2" style="color: var(--bmo-muted)">WEATHER</div>
      <div class="text-sm font-bold" style="color: var(--bmo-green)">
        {beauState.weatherSummary || '—'}
      </div>
    </Panel>

    <Panel id="presence:season" label="Season" defaultPosition={{ col: 9, row: 2, colSpan: 3, rowSpan: 1 }}>
      <div class="text-xs tracking-widest mb-2" style="color: var(--bmo-muted)">SEASON</div>
      <div class="text-sm font-bold" style="color: var(--bmo-text)">
        {beauState.seasonalContext || '—'}
      </div>
    </Panel>

    <Panel id="presence:timeline" label="Event Timeline" defaultPosition={{ col: 0, row: 3, colSpan: 12, rowSpan: 3 }}>
      <div class="text-xs tracking-widest mb-4" style="color: var(--bmo-muted)">EVENT TIMELINE</div>
      {#if data.recentEvents.length === 0}
        <div class="text-xs" style="color: var(--bmo-muted)">no events yet</div>
      {:else}
        <div class="space-y-1 max-h-64 overflow-y-auto">
          {#each data.recentEvents as event}
            <div class="flex justify-between text-xs py-1 border-b" style="border-color: var(--bmo-border)">
              <span style="color: var(--bmo-green)">{event.eventType.replace(/_/g, ' ')}</span>
              <span style="color: var(--bmo-muted)">{event.source ?? ''}</span>
              <span style="color: var(--bmo-muted)">{event.timestamp}</span>
            </div>
          {/each}
        </div>
      {/if}
    </Panel>
  </PanelCanvas>
</div>
