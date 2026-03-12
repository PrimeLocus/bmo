<script lang="ts">
  import { beauState, MODE_LABELS, EMOTION_LABELS } from '$lib/stores/beau.svelte.js';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();

  const pct = $derived(
    data.totalSteps > 0 ? Math.round((data.doneSteps / data.totalSteps) * 100) : 0
  );
</script>

<div class="max-w-4xl">
  <!-- Header -->
  <div class="mb-8 flex items-end justify-between">
    <div>
      <h1 class="text-2xl tracking-widest font-bold" style="color: var(--bmo-green)">BEAU'S TERMINAL</h1>
      <p class="text-xs mt-1" style="color: var(--bmo-muted)">physical BMO build — lafayette, la</p>
    </div>
    <div class="flex items-center gap-2 text-xs" style="color: var(--bmo-muted)">
      <div class="w-2 h-2 rounded-full transition-colors"
           style="background: {beauState.online ? 'var(--bmo-green)' : '#636e72'}"></div>
      <span>{beauState.online ? 'BEAU ONLINE' : 'BEAU OFFLINE'}</span>
    </div>
  </div>

  <!-- Live state grid -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
    {#each [
      { label: 'MODE', value: MODE_LABELS[beauState.mode] ?? beauState.mode },
      { label: 'STATE', value: EMOTION_LABELS[beauState.emotionalState] ?? beauState.emotionalState },
      { label: 'ENVIRONMENT', value: beauState.environment || '—' },
      { label: 'CAMERA', value: beauState.cameraActive ? 'ACTIVE' : 'OFF' },
    ] as card}
      <div class="p-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
        <div class="text-xs mb-2 tracking-widest" style="color: var(--bmo-muted)">{card.label}</div>
        <div class="text-sm tracking-wider font-bold" style="color: var(--bmo-green)">{card.value.toUpperCase()}</div>
      </div>
    {/each}
  </div>

  <!-- Last haiku -->
  {#if beauState.lastHaiku}
    <div class="p-5 mb-6 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-3" style="color: var(--bmo-muted)">LAST HAIKU</div>
      <div class="text-sm leading-relaxed italic" style="color: var(--bmo-text)">
        {#each beauState.lastHaiku.split('\n') as line}
          <div>{line}</div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Stats + dispatcher -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <!-- Build stats -->
    <div class="p-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-4" style="color: var(--bmo-muted)">BUILD STATS</div>
      <div class="space-y-3">
        <div class="flex justify-between text-xs">
          <span style="color: var(--bmo-muted)">PARTS TRACKED</span>
          <span style="color: var(--bmo-text)">{data.partsCount}</span>
        </div>
        <div class="flex justify-between text-xs">
          <span style="color: var(--bmo-muted)">TOTAL COST</span>
          <span style="color: var(--bmo-text)">${data.totalCost.toFixed(2)}</span>
        </div>
        <div class="flex justify-between text-xs">
          <span style="color: var(--bmo-muted)">SOFTWARE STEPS</span>
          <span style="color: var(--bmo-text)">{data.doneSteps} / {data.totalSteps}</span>
        </div>
        <div>
          <div class="h-1 mt-1" style="background: var(--bmo-border); border-radius: 1px">
            <div class="h-1 transition-all" style="width: {pct}%; background: var(--bmo-green); border-radius: 1px"></div>
          </div>
          <div class="text-xs mt-1" style="color: var(--bmo-muted)">{pct}% complete</div>
        </div>
      </div>
    </div>

    <!-- Dispatcher log -->
    <div class="p-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-4" style="color: var(--bmo-muted)">DISPATCHER LOG</div>
      {#if beauState.dispatcherLog.length === 0}
        <div class="text-xs" style="color: var(--bmo-muted)">no events yet</div>
      {:else}
        <div class="space-y-1">
          {#each beauState.dispatcherLog.slice(-8).reverse() as entry}
            <div class="text-xs py-1 border-b" style="color: var(--bmo-text); border-color: var(--bmo-border)">
              &gt; {entry}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Wake word -->
  {#if beauState.wakeWord}
    <div class="mt-4 p-3 border text-xs" style="border-color: var(--bmo-border); color: var(--bmo-muted)">
      LAST WAKE: <span style="color: var(--bmo-green)">{beauState.wakeWord}</span>
    </div>
  {/if}
</div>
