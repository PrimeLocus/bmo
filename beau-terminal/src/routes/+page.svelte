<script lang="ts">
  import { beauState, MODE_LABELS, EMOTION_LABELS } from '$lib/stores/beau.svelte.js';
  import PanelCanvas from '$lib/components/PanelCanvas.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();

  const pct = $derived(
    data.totalSteps > 0 ? Math.round((data.doneSteps / data.totalSteps) * 100) : 0
  );
</script>

<div class="max-w-4xl">
  <!-- Header (outside panel system — not draggable) -->
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

  <PanelCanvas pageId="/" columns={2}>
    <!-- Identity: Soul Code -->
    <Panel id="dashboard:soul-code">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">SOUL CODE</div>
      <div class="text-sm tracking-wider font-bold"
           style="color: {data.soulCodeStatus === 'exists' ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
        {data.soulCodeStatus === 'exists' ? 'WRITTEN' : 'AWAITING'}
      </div>
    </Panel>

    <!-- Identity: Voice -->
    <Panel id="dashboard:voice">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">VOICE</div>
      <div class="text-sm tracking-wider font-bold" style="color: var(--bmo-green)">
        {data.voiceModelVersion.toUpperCase()}
      </div>
    </Panel>

    <!-- Environment: Sleep -->
    <Panel id="dashboard:sleep">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">SLEEP</div>
      <div class="text-sm tracking-wider font-bold"
           style="color: {beauState.sleepState === 'asleep' ? '#636e72' : 'var(--bmo-green)'}">
        {beauState.sleepState.toUpperCase()}
      </div>
    </Panel>

    <!-- Environment: Room -->
    <Panel id="dashboard:room">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">ROOM</div>
      <div class="text-sm tracking-wider font-bold"
           style="color: {beauState.presenceState === 'occupied' ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
        {beauState.presenceState.toUpperCase()}
      </div>
    </Panel>

    <!-- Environment: Weather -->
    <Panel id="dashboard:weather">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">WEATHER</div>
      <div class="text-sm tracking-wider font-bold" style="color: var(--bmo-text)">
        {beauState.weatherSummary || '—'}
      </div>
    </Panel>

    <!-- Environment: Resolume -->
    <Panel id="dashboard:resolume">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">RESOLUME</div>
      <div class="text-sm tracking-wider font-bold"
           style="color: {beauState.resolumeActive ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
        {beauState.resolumeActive ? 'LIVE' : 'INACTIVE'}
      </div>
      {#if beauState.resolumeActive && beauState.currentClip}
        <div class="text-xs mt-1 truncate" style="color: var(--bmo-text)">
          {beauState.currentClip} · {beauState.currentBpm ?? '—'} BPM
        </div>
      {/if}
    </Panel>

    <!-- Live State: Mode -->
    <Panel id="dashboard:mode">
      <div class="text-xs mb-2 tracking-widest" style="color: var(--bmo-muted)">MODE</div>
      <div class="text-sm tracking-wider font-bold" style="color: var(--bmo-green)">
        {(MODE_LABELS[beauState.mode] ?? beauState.mode).toUpperCase()}
      </div>
    </Panel>

    <!-- Live State: Emotion -->
    <Panel id="dashboard:emotion">
      <div class="text-xs mb-2 tracking-widest" style="color: var(--bmo-muted)">STATE</div>
      <div class="text-sm tracking-wider font-bold" style="color: var(--bmo-green)">
        {(EMOTION_LABELS[beauState.emotionalState] ?? beauState.emotionalState).toUpperCase()}
      </div>
    </Panel>

    <!-- Live State: Environment -->
    <Panel id="dashboard:env">
      <div class="text-xs mb-2 tracking-widest" style="color: var(--bmo-muted)">ENVIRONMENT</div>
      <div class="text-sm tracking-wider font-bold" style="color: var(--bmo-green)">
        {(beauState.environment || '—').toUpperCase()}
      </div>
    </Panel>

    <!-- Live State: Camera -->
    <Panel id="dashboard:camera">
      <div class="text-xs mb-2 tracking-widest" style="color: var(--bmo-muted)">CAMERA</div>
      <div class="text-sm tracking-wider font-bold" style="color: var(--bmo-green)">
        {beauState.cameraActive ? 'ACTIVE' : 'OFF'}
      </div>
    </Panel>

    <!-- Last Haiku (spans 2 columns in grid mode) -->
    {#if beauState.lastHaiku}
      <div style="grid-column: span 2">
        <Panel id="dashboard:haiku">
          <div class="text-xs tracking-widest mb-3" style="color: var(--bmo-muted)">LAST HAIKU</div>
          <div class="text-sm leading-relaxed italic" style="color: var(--bmo-text)">
            {#each beauState.lastHaiku.split('\n') as line}
              <div>{line}</div>
            {/each}
          </div>
        </Panel>
      </div>
    {/if}

    <!-- Build Stats -->
    <Panel id="dashboard:build-stats">
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
    </Panel>

    <!-- Dispatcher Log -->
    <Panel id="dashboard:dispatcher">
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
    </Panel>
  </PanelCanvas>

  <!-- Wake word (outside panel system) -->
  {#if beauState.wakeWord}
    <div class="mt-4 p-3 border text-xs" style="border-color: var(--bmo-border); color: var(--bmo-muted)">
      LAST WAKE: <span style="color: var(--bmo-green)">{beauState.wakeWord}</span>
    </div>
  {/if}
</div>
