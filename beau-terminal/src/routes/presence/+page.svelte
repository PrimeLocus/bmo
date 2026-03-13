<script lang="ts">
  import { beauState } from '$lib/stores/beau.svelte.js';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();
</script>

<div class="max-w-4xl">
  <div class="mb-8">
    <h1 class="text-2xl tracking-widest font-bold" style="color: var(--bmo-green)">PRESENCE</h1>
    <p class="text-xs mt-1" style="color: var(--bmo-muted)">what beau senses — room, light, weather</p>
  </div>

  <!-- State machine widget -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
    <!-- Sleep state -->
    <div class="p-5 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-4" style="color: var(--bmo-muted)">SLEEP STATE</div>
      <div class="text-3xl font-bold tracking-widest text-center py-4"
           style="color: {beauState.sleepState === 'asleep' ? '#636e72' : beauState.sleepState === 'waking' ? 'var(--bmo-green)' : 'var(--bmo-text)'}">
        {beauState.sleepState.toUpperCase()}
      </div>
    </div>

    <!-- Presence -->
    <div class="p-5 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-4" style="color: var(--bmo-muted)">ROOM PRESENCE</div>
      <div class="text-3xl font-bold tracking-widest text-center py-4"
           style="color: {beauState.presenceState === 'occupied' ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
        {beauState.presenceState.toUpperCase()}
      </div>
    </div>
  </div>

  <!-- Sensor readouts -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
    <div class="p-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-2" style="color: var(--bmo-muted)">LIGHT</div>
      <div class="text-sm font-bold" style="color: var(--bmo-green)">
        {beauState.luxLabel ? beauState.luxLabel.toUpperCase() : '—'}
      </div>
      {#if beauState.lux !== null}
        <div class="text-xs mt-1" style="color: var(--bmo-muted)">{beauState.lux} lux</div>
      {/if}
    </div>
    <div class="p-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-2" style="color: var(--bmo-muted)">CAMERA</div>
      <div class="text-sm font-bold" style="color: {beauState.cameraActive ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
        {beauState.cameraActive ? 'ACTIVE' : 'OFF'}
      </div>
    </div>
    <div class="p-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-2" style="color: var(--bmo-muted)">WEATHER</div>
      <div class="text-sm font-bold" style="color: var(--bmo-green)">
        {beauState.weatherSummary || '—'}
      </div>
    </div>
    <div class="p-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-2" style="color: var(--bmo-muted)">SEASON</div>
      <div class="text-sm font-bold" style="color: var(--bmo-text)">
        {beauState.seasonalContext || '—'}
      </div>
    </div>
  </div>

  <!-- Event timeline -->
  <div class="p-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
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
  </div>
</div>
