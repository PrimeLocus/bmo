<script lang="ts">
  import { beauState } from '$lib/stores/beau.svelte.js';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();

  function formatDuration(startedAt: string, endedAt: string | null): string {
    const start = new Date(startedAt).getTime();
    const end = endedAt ? new Date(endedAt).getTime() : Date.now();
    const mins = Math.round((end - start) / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }
</script>

<div class="max-w-4xl">
  <div class="mb-6">
    <h1 class="text-2xl tracking-widest font-bold" style="color: var(--bmo-green)">SESSIONS</h1>
    <p class="text-xs mt-1" style="color: var(--bmo-muted)">resolume vj session archive</p>
  </div>

  {#if beauState.resolumeActive}
    <div class="p-4 mb-6 border" style="border-color: var(--bmo-green); background: var(--bmo-surface)">
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full animate-pulse" style="background: var(--bmo-green)"></div>
        <span class="text-xs tracking-widest font-bold" style="color: var(--bmo-green)">LIVE SESSION</span>
      </div>
      {#if beauState.currentClip}
        <div class="text-sm mt-2" style="color: var(--bmo-text)">
          {beauState.currentClip} · {beauState.currentBpm ?? '—'} BPM
        </div>
      {/if}
    </div>
  {/if}

  {#if data.sessions.length === 0}
    <div class="p-8 text-center border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest" style="color: var(--bmo-muted)">NO SESSIONS RECORDED</div>
      <div class="text-xs mt-2" style="color: var(--bmo-muted)">
        sessions appear automatically when resolume sends OSC data
      </div>
    </div>
  {:else}
    <div class="border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <table class="w-full text-xs">
        <thead>
          <tr style="border-bottom: 1px solid var(--bmo-border)">
            <th class="text-left p-3 tracking-widest" style="color: var(--bmo-muted)">DATE</th>
            <th class="text-left p-3 tracking-widest" style="color: var(--bmo-muted)">DURATION</th>
            <th class="text-left p-3 tracking-widest hidden md:table-cell" style="color: var(--bmo-muted)">BPM</th>
            <th class="text-left p-3 tracking-widest hidden md:table-cell" style="color: var(--bmo-muted)">STATUS</th>
            <th class="text-left p-3 tracking-widest" style="color: var(--bmo-muted)">DEBRIEF</th>
          </tr>
        </thead>
        <tbody>
          {#each data.sessions as session}
            <tr style="border-bottom: 1px solid var(--bmo-border)">
              <td class="p-3">
                <a href="/sessions/{session.id}" class="hover:underline" style="color: var(--bmo-green)">
                  {new Date(session.startedAt).toLocaleDateString()}
                </a>
              </td>
              <td class="p-3" style="color: var(--bmo-text)">
                {formatDuration(session.startedAt, session.endedAt)}
              </td>
              <td class="p-3 hidden md:table-cell" style="color: var(--bmo-text)">
                {#if session.bpmMin != null && session.bpmMax != null}
                  {Math.round(session.bpmMin)}–{Math.round(session.bpmMax)}
                {:else}
                  —
                {/if}
              </td>
              <td class="p-3 hidden md:table-cell">
                <span class="tracking-widest"
                      style="color: {session.status === 'active' ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
                  {session.status.toUpperCase()}
                </span>
              </td>
              <td class="p-3" style="color: var(--bmo-muted)">
                {session.debriefText ? 'YES' : '—'}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if data.totalPages > 1}
      <div class="flex justify-center gap-2 mt-4">
        {#if data.page > 1}
          <a href="?page={data.page - 1}" class="text-xs px-3 py-1 border"
             style="border-color: var(--bmo-border); color: var(--bmo-green)">PREV</a>
        {/if}
        <span class="text-xs px-3 py-1" style="color: var(--bmo-muted)">
          {data.page} / {data.totalPages}
        </span>
        {#if data.page < data.totalPages}
          <a href="?page={data.page + 1}" class="text-xs px-3 py-1 border"
             style="border-color: var(--bmo-border); color: var(--bmo-green)">NEXT</a>
        {/if}
      </div>
    {/if}
  {/if}
</div>
