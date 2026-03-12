<script lang="ts">
  import { beauState } from '$lib/stores/beau.svelte.js';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();

  const MODES = ['all', 'ambient', 'witness', 'collaborator', 'archivist', 'social'];
  let filterMode = $state('all');

  const filtered = $derived(
    filterMode === 'all' ? data.haikus : data.haikus.filter(h => h.mode === filterMode)
  );

  function fmt(d: Date | null) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
</script>

<div class="max-w-5xl">
  <div class="mb-6 flex items-end justify-between">
    <div>
      <h1 class="text-xl tracking-widest font-bold" style="color: var(--bmo-green)">HAIKU ARCHIVE</h1>
      <p class="text-xs mt-1" style="color: var(--bmo-muted)">{data.haikus.length} haikus total</p>
    </div>
    <!-- Live indicator if Beau just sent one -->
    {#if beauState.lastHaiku}
      <div class="text-xs px-3 py-1 border" style="border-color: var(--bmo-green); color: var(--bmo-green)">
        LIVE ●
      </div>
    {/if}
  </div>

  <!-- Mode filter -->
  <div class="flex gap-2 mb-6 flex-wrap">
    {#each MODES as mode}
      <button
        onclick={() => filterMode = mode}
        class="px-3 py-1 text-xs tracking-widest border transition-all"
        style="
          border-color: {filterMode === mode ? 'var(--bmo-green)' : 'var(--bmo-border)'};
          color: {filterMode === mode ? 'var(--bmo-bg)' : 'var(--bmo-muted)'};
          background: {filterMode === mode ? 'var(--bmo-green)' : 'transparent'};
        "
      >{mode}</button>
    {/each}
  </div>

  <!-- Live haiku if present and not in archive yet -->
  {#if beauState.lastHaiku && data.haikus.length === 0}
    <div class="mb-6 p-5 border" style="border-color: var(--bmo-green); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-3" style="color: var(--bmo-green)">LATEST — LIVE</div>
      <div class="text-sm leading-relaxed italic" style="color: var(--bmo-text)">
        {#each beauState.lastHaiku.split('\n') as line}
          <div>{line}</div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Archive grid -->
  {#if filtered.length === 0}
    <div class="p-8 text-center border" style="border-color: var(--bmo-border); color: var(--bmo-muted)">
      <div class="text-xs tracking-widest">NO HAIKUS YET</div>
      <div class="text-xs mt-2">Beau will write them as the build comes to life</div>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each filtered as haiku (haiku.id)}
        <div class="p-4 border hover:border-opacity-60 transition-all"
             style="border-color: var(--bmo-border); background: var(--bmo-surface)">
          <div class="text-sm leading-relaxed italic mb-4" style="color: var(--bmo-text)">
            {#each haiku.text.split('\n') as line}
              <div>{line}</div>
            {/each}
          </div>
          <div class="flex gap-2 flex-wrap text-xs" style="color: var(--bmo-muted)">
            <span style="color: var(--bmo-green)">{haiku.mode}</span>
            {#if haiku.trigger}<span>· {haiku.trigger}</span>{/if}
            <span>· {fmt(haiku.createdAt)}</span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
