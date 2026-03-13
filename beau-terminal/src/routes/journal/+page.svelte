<script lang="ts">
  import { enhance } from '$app/forms';
  import PanelCanvas from '$lib/components/PanelCanvas.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();
</script>

<div class="max-w-4xl">
  <div class="mb-6 flex items-end justify-between">
    <div>
      <h1 class="text-2xl tracking-widest font-bold" style="color: var(--bmo-green)">JOURNAL</h1>
      <p class="text-xs mt-1" style="color: var(--bmo-muted)">
        beau's inner life — {data.total} {data.total === 1 ? 'entry' : 'entries'}
      </p>
    </div>

    {#if data.isUnlocked}
      <form method="POST" action="?/relock" use:enhance>
        <button type="submit"
                class="text-xs tracking-widest px-3 py-2 border transition-all"
                style="border-color: #d63031; color: #d63031; background: transparent">
          RE-LOCK
        </button>
      </form>
    {/if}
  </div>

  <PanelCanvas pageId="/journal">
  <Panel id="journal:entries" label="Journal" defaultPosition={{ col: 0, row: 0, colSpan: 12, rowSpan: 5 }}>

  {#if !data.isUnlocked}
    <!-- Locked state -->
    <div class="p-6 border mb-6" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-4" style="color: var(--bmo-muted)">ACCESS REQUIRED</div>
      <p class="text-sm mb-4 leading-relaxed" style="color: var(--bmo-text)">
        Beau's journal is private by default. Unlocking grants temporary access
        to entry content for this browser session. All views are logged.
      </p>
      <p class="text-xs mb-6" style="color: var(--bmo-muted)">
        Session-scoped — access expires when you close the browser.
      </p>
      <form method="POST" action="?/unlock" use:enhance>
        <button type="submit"
                class="text-xs tracking-widest px-4 py-2 font-bold border"
                style="border-color: var(--bmo-green); color: var(--bmo-bg); background: var(--bmo-green)">
          REQUEST ACCESS
        </button>
      </form>
    </div>

    <!-- Locked entries — metadata only -->
    {#if data.entries.length > 0}
      <div class="space-y-2">
        {#each data.entries as entry}
          <div class="p-3 border flex items-center justify-between"
               style="border-color: var(--bmo-border); background: var(--bmo-surface)">
            <div class="flex items-center gap-3">
              <span class="text-xs" style="color: var(--bmo-muted)">
                {new Date(entry.entryAt).toLocaleDateString()}
              </span>
              {#if entry.title}
                <span class="text-sm tracking-wider" style="color: var(--bmo-text)">
                  {entry.title}
                </span>
              {:else}
                <span class="text-sm italic" style="color: var(--bmo-muted)">untitled</span>
              {/if}
            </div>
            {#if entry.mood}
              <span class="text-xs tracking-widest" style="color: var(--bmo-muted)">
                {entry.mood.toUpperCase()}
              </span>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="p-8 text-center border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
        <div class="text-xs tracking-widest" style="color: var(--bmo-muted)">NO JOURNAL ENTRIES</div>
        <div class="text-xs mt-2" style="color: var(--bmo-muted)">
          entries appear when beau writes them
        </div>
      </div>
    {/if}

  {:else}
    <!-- Unlocked state -->
    <div class="p-3 mb-6 border flex items-center gap-2"
         style="border-color: var(--bmo-green); background: var(--bmo-surface)">
      <div class="w-2 h-2 rounded-full" style="background: var(--bmo-green)"></div>
      <span class="text-xs tracking-widest" style="color: var(--bmo-green)">VIEWING — ALL ACCESS LOGGED</span>
    </div>

    {#if data.entries.length === 0}
      <div class="p-8 text-center border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
        <div class="text-xs tracking-widest" style="color: var(--bmo-muted)">NO JOURNAL ENTRIES</div>
      </div>
    {:else}
      <div class="space-y-4">
        {#each data.entries as entry}
          <div class="p-5 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
            <div class="flex items-start justify-between mb-3">
              <div>
                <div class="text-xs mb-1" style="color: var(--bmo-muted)">
                  {new Date(entry.entryAt).toLocaleString()}
                  {#if entry.mood}
                    <span class="ml-2 tracking-widest">{entry.mood.toUpperCase()}</span>
                  {/if}
                </div>
                {#if entry.title}
                  <div class="text-sm tracking-wider font-bold" style="color: var(--bmo-green)">
                    {entry.title}
                  </div>
                {/if}
              </div>
              <form method="POST" action="?/delete" use:enhance>
                <input type="hidden" name="id" value={entry.id} />
                <button type="submit"
                        class="text-xs px-2 py-1 border transition-all hover:opacity-80"
                        style="border-color: var(--bmo-border); color: var(--bmo-muted); background: transparent"
                        onclick={(e) => { if (!confirm('Delete this entry? This is permanent and logged.')) e.preventDefault(); }}>
                  DELETE
                </button>
              </form>
            </div>
            <div class="text-sm leading-relaxed" style="color: var(--bmo-text)">
              {#each entry.body.split('\n') as line}
                <p class="mb-2">{line}</p>
              {/each}
            </div>
            {#if entry.tagsJson}
              {@const tags = (() => { try { return JSON.parse(entry.tagsJson) as string[]; } catch { return []; } })()}
              {#if tags.length > 0}
                <div class="flex flex-wrap gap-1 mt-3">
                  {#each tags as tag}
                    <span class="text-xs px-2 py-0.5 border" style="border-color: var(--bmo-border); color: var(--bmo-muted)">
                      {tag}
                    </span>
                  {/each}
                </div>
              {/if}
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  </Panel>
  </PanelCanvas>
</div>
