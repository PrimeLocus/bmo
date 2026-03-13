<script lang="ts">
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();
  const session = $derived(data.session);

  function formatDuration(startedAt: string, endedAt: string | null): string {
    const start = new Date(startedAt).getTime();
    const end = endedAt ? new Date(endedAt).getTime() : Date.now();
    const mins = Math.round((end - start) / 60000);
    if (mins < 60) return `${mins} minutes`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  const clips = $derived(session.clipsUsedJson ? JSON.parse(session.clipsUsedJson) as string[] : []);
  const moodTags = $derived(session.moodTagsJson ? JSON.parse(session.moodTagsJson) as string[] : []);
</script>

<div class="max-w-4xl">
  <div class="mb-6 flex items-start justify-between">
    <div>
      <a href="/sessions" class="text-xs tracking-widest mb-2 inline-block" style="color: var(--bmo-muted)">
        ← SESSIONS
      </a>
      <h1 class="text-2xl tracking-widest font-bold" style="color: var(--bmo-green)">
        {session.sessionName || new Date(session.startedAt).toLocaleDateString()}
      </h1>
      <p class="text-xs mt-1" style="color: var(--bmo-muted)">
        {new Date(session.startedAt).toLocaleString()} · {formatDuration(session.startedAt, session.endedAt)}
        {#if session.venue} · {session.venue}{/if}
      </p>
    </div>
    <span class="text-xs tracking-widest px-2 py-1 border"
          style="border-color: var(--bmo-border);
                 color: {session.status === 'active' ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
      {session.status.toUpperCase()}
    </span>
  </div>

  <div class="grid grid-cols-3 gap-3 mb-6">
    <div class="p-3 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">BPM RANGE</div>
      <div class="text-sm font-bold" style="color: var(--bmo-green)">
        {#if session.bpmMin != null && session.bpmMax != null}
          {Math.round(session.bpmMin)} — {Math.round(session.bpmMax)}
        {:else}—{/if}
      </div>
    </div>
    <div class="p-3 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">CLIPS</div>
      <div class="text-sm font-bold" style="color: var(--bmo-green)">{clips.length}</div>
    </div>
    <div class="p-3 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-1" style="color: var(--bmo-muted)">EVENTS</div>
      <div class="text-sm font-bold" style="color: var(--bmo-green)">{data.events.length}</div>
    </div>
  </div>

  {#if clips.length > 0}
    <div class="p-4 mb-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-3" style="color: var(--bmo-muted)">CLIPS USED</div>
      <div class="flex flex-wrap gap-2">
        {#each clips as clip}
          <span class="text-xs px-2 py-1 border" style="border-color: var(--bmo-border); color: var(--bmo-text)">
            {clip}
          </span>
        {/each}
      </div>
    </div>
  {/if}

  {#if moodTags.length > 0}
    <div class="p-4 mb-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-3" style="color: var(--bmo-muted)">MOOD</div>
      <div class="flex flex-wrap gap-2">
        {#each moodTags as tag}
          <span class="text-xs px-2 py-1" style="color: var(--bmo-green)">{tag}</span>
        {/each}
      </div>
    </div>
  {/if}

  {#if session.debriefText}
    <div class="p-5 mb-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-3" style="color: var(--bmo-muted)">DEBRIEF</div>
      <div class="text-sm leading-relaxed italic" style="color: var(--bmo-text)">
        {#each session.debriefText.split('\n') as line}
          <p class="mb-2">{line}</p>
        {/each}
      </div>
    </div>
  {/if}

  {#if data.events.length > 0}
    <div class="p-4 mb-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-3" style="color: var(--bmo-muted)">
        EVENT TIMELINE ({data.events.length})
      </div>
      <div class="space-y-1 max-h-64 overflow-y-auto">
        {#each data.events as event}
          <div class="flex gap-3 text-xs py-1 border-b" style="border-color: var(--bmo-border)">
            <span style="color: var(--bmo-muted)" class="shrink-0">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
            <span class="tracking-widest" style="color: var(--bmo-green)">{event.eventType}</span>
            {#if event.payloadJson}
              <span class="truncate" style="color: var(--bmo-text)">
                {event.payloadJson}
              </span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if data.linkedHaikus.length > 0}
    <div class="p-4 mb-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-3" style="color: var(--bmo-muted)">HAIKUS</div>
      {#each data.linkedHaikus as haiku}
        <div class="text-sm leading-relaxed italic mb-3" style="color: var(--bmo-text)">
          {#each haiku.text.split('\n') as line}
            <div>{line}</div>
          {/each}
        </div>
      {/each}
    </div>
  {/if}

  {#if data.linkedPhotos.length > 0}
    <div class="p-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest mb-3" style="color: var(--bmo-muted)">PHOTOS</div>
      <div class="grid grid-cols-3 gap-2">
        {#each data.linkedPhotos as photo}
          <div class="aspect-square border overflow-hidden" style="border-color: var(--bmo-border)">
            <img src="/photos/{photo.thumbnailPath || photo.imagePath}"
                 alt={photo.caption || 'session photo'}
                 class="w-full h-full object-cover" />
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
