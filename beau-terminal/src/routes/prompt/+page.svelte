<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();

  const PRESET_TOPICS = [
    'beau/command/mode',
    'beau/command/emotion',
    'beau/command/haiku',
    'beau/state/mode',
    'beau/state/emotion',
  ];

  const PRESETS: { label: string; topic: string; content: string }[] = [
    { label: 'mode: ambient', topic: 'beau/state/mode', content: 'ambient' },
    { label: 'mode: witness', topic: 'beau/state/mode', content: 'witness' },
    { label: 'mode: collaborator', topic: 'beau/state/mode', content: 'collaborator' },
    { label: 'mode: archivist', topic: 'beau/state/mode', content: 'archivist' },
    { label: 'mode: social', topic: 'beau/state/mode', content: 'social' },
    { label: 'emotion: curious', topic: 'beau/state/emotion', content: 'curious' },
    { label: 'emotion: playful', topic: 'beau/state/emotion', content: 'playful' },
    { label: 'emotion: contemplative', topic: 'beau/state/emotion', content: 'contemplative' },
    { label: 'emotion: sleepy', topic: 'beau/state/emotion', content: 'sleepy' },
  ];

  let topic = $state('beau/command/mode');
  let content = $state('');
  let label = $state('');

  function applyPreset(p: typeof PRESETS[number]) {
    topic = p.topic;
    content = p.content;
  }

  function fmt(d: Date | null) {
    if (!d) return '';
    return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="max-w-3xl">
  <div class="mb-6">
    <h1 class="text-xl tracking-widest font-bold" style="color: var(--bmo-green)">PROMPT CONSOLE</h1>
    <p class="text-xs mt-1" style="color: var(--bmo-muted)">publish MQTT commands to Beau</p>
  </div>

  <!-- Presets -->
  <div class="mb-5">
    <div class="text-xs tracking-widest mb-2" style="color: var(--bmo-muted)">PRESETS</div>
    <div class="flex flex-wrap gap-2">
      {#each PRESETS as p}
        <button
          type="button"
          onclick={() => applyPreset(p)}
          class="text-xs px-3 py-1 border tracking-widest hover:opacity-80 transition-opacity"
          style="border-color: var(--bmo-border); color: var(--bmo-muted)"
        >
          ↑ {p.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Send form -->
  <form method="POST" action="?/send" use:enhance
        onsubmit={() => { content = ''; label = ''; }}
        class="border p-4 space-y-4" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
    <div class="flex gap-3">
      <div class="flex-1">
        <label class="text-xs tracking-widest block mb-1" for="prompt-topic" style="color: var(--bmo-muted)">TOPIC</label>
        <input
          id="prompt-topic"
          type="text"
          name="topic"
          bind:value={topic}
          list="topic-suggestions"
          class="w-full text-xs px-3 py-2 border"
          style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)"
        />
        <datalist id="topic-suggestions">
          {#each PRESET_TOPICS as t}
            <option value={t}>{t}</option>
          {/each}
        </datalist>
      </div>
      <div class="w-40">
        <label class="text-xs tracking-widest block mb-1" for="prompt-label" style="color: var(--bmo-muted)">LABEL (opt)</label>
        <input
          id="prompt-label"
          type="text"
          name="label"
          bind:value={label}
          placeholder="memo..."
          class="w-full text-xs px-3 py-2 border"
          style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)"
        />
      </div>
    </div>
    <div>
      <label class="text-xs tracking-widest block mb-1" for="prompt-content" style="color: var(--bmo-muted)">MESSAGE</label>
      <textarea
        id="prompt-content"
        name="content"
        bind:value={content}
        rows="3"
        placeholder="message payload..."
        class="w-full text-xs px-3 py-2 border resize-none"
        style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)"
      ></textarea>
    </div>
    <button
      type="submit"
      class="text-xs px-6 py-2 border tracking-widest font-bold hover:opacity-80 transition-opacity"
      style="border-color: var(--bmo-green); color: var(--bmo-green)"
    >
      PUBLISH
    </button>
  </form>

  <!-- History -->
  <div class="mt-6 border" style="border-color: var(--bmo-border)">
    <div class="px-4 py-3 border-b text-xs tracking-widest"
         style="border-color: var(--bmo-border); background: var(--bmo-surface); color: var(--bmo-muted)">
      HISTORY
    </div>
    {#if data.history.length === 0}
      <div class="p-4 text-xs" style="color: var(--bmo-muted)">no commands sent yet</div>
    {:else}
      <div class="divide-y" style="border-color: var(--bmo-border)">
        {#each data.history as entry (entry.id)}
          <div class="flex items-center gap-3 px-4 py-2 border-b" style="border-color: var(--bmo-border)">
            <span class="text-xs shrink-0" style="color: var(--bmo-muted)">{fmt(entry.createdAt)}</span>
            <span class="text-xs flex-1 truncate" style="color: var(--bmo-text)">{entry.content}</span>
            {#if entry.label}
              <span class="text-xs shrink-0 italic" style="color: var(--bmo-muted)">{entry.label}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
