<script lang="ts">
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();
</script>

<div class="max-w-4xl">
  <div class="mb-8">
    <h1 class="text-2xl tracking-widest font-bold" style="color: var(--bmo-green)">IDENTITY</h1>
    <p class="text-xs mt-1" style="color: var(--bmo-muted)">what beau is — immutable or slowly-evolving</p>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <!-- Emergence / Soul Code -->
    <div class="p-5 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-4" style="color: var(--bmo-muted)">EMERGENCE</div>
      {#if data.emergence}
        <div class="text-center py-4">
          {#each data.emergence.haikuText.split('\n') as line}
            <div class="text-sm italic leading-relaxed" style="color: var(--bmo-text)">{line}</div>
          {/each}
        </div>
        <div class="mt-4 pt-3 border-t text-xs space-y-1" style="border-color: var(--bmo-border); color: var(--bmo-muted)">
          <div>Born: {data.emergence.emergenceTimestamp}</div>
          {#if data.emergence.modelUsed}
            <div>Model: {data.emergence.modelUsed}</div>
          {/if}
        </div>
      {:else}
        <div class="text-center py-8">
          <div class="text-sm italic" style="color: var(--bmo-muted)">awaiting first true boot</div>
        </div>
      {/if}
    </div>

    <!-- Natal Chart -->
    <div class="p-5 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-4" style="color: var(--bmo-muted)">NATAL CHART</div>
      {#if data.natal}
        <div class="text-sm" style="color: var(--bmo-text)">
          <div class="mb-2">{data.natal.locationName}</div>
          {#if data.natal.summaryText}
            <div class="text-xs leading-relaxed" style="color: var(--bmo-muted)">{data.natal.summaryText}</div>
          {/if}
        </div>
        <div class="mt-4 pt-3 border-t text-xs" style="border-color: var(--bmo-border); color: var(--bmo-muted)">
          Version {data.natal.version}
        </div>
      {:else}
        <div class="text-center py-8">
          <div class="text-sm italic" style="color: var(--bmo-muted)">calculated at emergence</div>
        </div>
      {/if}
    </div>

    <!-- Voice Lineage -->
    <div class="p-5 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-4" style="color: var(--bmo-muted)">VOICE LINEAGE</div>
      {#if data.activeVoice}
        <div class="flex items-center gap-2 mb-3">
          <span class="px-2 py-1 text-xs font-bold tracking-wider"
                style="background: var(--bmo-green); color: var(--bmo-bg)">
            {data.activeVoice.versionName}
          </span>
          <span class="text-xs" style="color: var(--bmo-muted)">{data.activeVoice.engine}</span>
        </div>
        {#if data.activeVoice.trainingNotes}
          <div class="text-xs leading-relaxed" style="color: var(--bmo-muted)">{data.activeVoice.trainingNotes}</div>
        {/if}
      {:else}
        <div class="text-center py-8">
          <div class="text-sm italic" style="color: var(--bmo-muted)">v0 (pre-training)</div>
        </div>
      {/if}
      {#if data.voiceModels.length > 0}
        <div class="mt-4 pt-3 border-t space-y-1" style="border-color: var(--bmo-border)">
          {#each data.voiceModels as model}
            <div class="flex justify-between text-xs" style="color: var(--bmo-muted)">
              <span>{model.versionName}</span>
              <span class="tracking-wider">{model.status.toUpperCase()}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
