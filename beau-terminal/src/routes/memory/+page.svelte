<script lang="ts">
  import PanelCanvas from '$lib/components/PanelCanvas.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import { beauState } from '$lib/stores/beau.svelte.js';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();

  function fmt(d: Date | null) {
    if (!d) return '';
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="max-w-5xl">
  <div class="mb-6">
    <h1 class="text-xl tracking-widest font-bold" style="color: var(--bmo-green)">MEMORY</h1>
    <p class="text-xs mt-1" style="color: var(--bmo-muted)">live dispatcher · {data.haikus.length} haikus stored</p>
  </div>

  <PanelCanvas pageId="/memory">
    <Panel id="memory:dispatcher" label="Dispatcher Log" defaultPosition={{ col: 0, row: 0, colSpan: 6, rowSpan: 4 }}>
      <div class="px-4 py-3 border-b text-xs tracking-widest"
           style="border-color: var(--bmo-border); color: var(--bmo-muted)">
        DISPATCHER LOG
        <span class="ml-2 inline-block w-1.5 h-1.5 rounded-full" style="background: {beauState.online ? 'var(--bmo-green)' : '#636e72'}"></span>
        LIVE
      </div>
      <div class="p-4 max-h-96 overflow-y-auto">
        {#if beauState.dispatcherLog.length === 0}
          <div class="text-xs" style="color: var(--bmo-muted)">no events yet — waiting for Beau</div>
        {:else}
          <div class="space-y-1">
            {#each beauState.dispatcherLog.slice().reverse() as entry, i}
              <div class="text-xs py-1" style="color: {i === 0 ? 'var(--bmo-text)' : 'var(--bmo-muted)'}">
                <span style="color: var(--bmo-green)">&gt;</span> {entry}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </Panel>

    <Panel id="memory:haiku-archive" label="Haiku Archive" defaultPosition={{ col: 6, row: 0, colSpan: 6, rowSpan: 4 }}>
      <div class="px-4 py-3 border-b text-xs tracking-widest"
           style="border-color: var(--bmo-border); color: var(--bmo-muted)">
        HAIKU ARCHIVE
      </div>
      <div class="divide-y max-h-96 overflow-y-auto" style="border-color: var(--bmo-border)">
        {#if data.haikus.length === 0}
          <div class="p-4 text-xs" style="color: var(--bmo-muted)">no haikus yet — they'll appear here as Beau generates them</div>
        {:else}
          {#each data.haikus as haiku (haiku.id)}
            <div class="px-4 py-3 border-b" style="border-color: var(--bmo-border)">
              <div class="text-xs leading-relaxed italic mb-2" style="color: var(--bmo-text)">
                {#each haiku.text.split('\n') as line}
                  <div>{line}</div>
                {/each}
              </div>
              <div class="flex gap-3 text-xs" style="color: var(--bmo-muted)">
                <span>{haiku.mode}</span>
                {#if haiku.trigger}<span>· {haiku.trigger}</span>{/if}
                <span>· {fmt(haiku.createdAt)}</span>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </Panel>
  </PanelCanvas>
</div>
