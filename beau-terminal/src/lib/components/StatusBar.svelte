<script lang="ts">
  import { onMount } from 'svelte';
  import { beauState } from '$lib/stores/beau.svelte.js';
  import { editModeState, toggleEditMode } from '$lib/stores/editMode.svelte.js';
  import SitrepModal from './SitrepModal.svelte';

  let sitrepOpen = $state(false);
  let reaction = $state<string | null>(null);
  let reactionTimer: ReturnType<typeof setTimeout> | null = null;

  // Toast for surfaced thoughts — persistent until dismissed
  let toast = $state<{ text: string; type: string } | null>(null);

  function openSitrep() {
    sitrepOpen = true;
  }

  function showReaction(msg: string, duration = 3500) {
    reaction = msg;
    if (reactionTimer) clearTimeout(reactionTimer);
    reactionTimer = setTimeout(() => { reaction = null; }, duration);
  }

  function showToast(text: string, type: string) {
    toast = { text, type };
  }

  function dismissToast() {
    toast = null;
  }

  onMount(() => {
    const handleSitrep = () => { sitrepOpen = true; };
    const handleReact = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      if (typeof detail === 'string') {
        // Simple string reactions (parts delivered, etc.)
        showReaction(detail);
      } else if (detail.type) {
        // Thought system — show as persistent toast
        showToast(detail.text, detail.type);
      } else {
        // Object with text + optional duration (legacy)
        showReaction(detail.text, detail.duration ?? 3500);
      }
    };
    window.addEventListener('bmo:sitrep', handleSitrep);
    window.addEventListener('bmo:react', handleReact);
    return () => {
      window.removeEventListener('bmo:sitrep', handleSitrep);
      window.removeEventListener('bmo:react', handleReact);
    };
  });
</script>

<div class="flex items-center gap-6 px-4 py-2 text-xs border-b"
     style="background: var(--bmo-surface); border-color: var(--bmo-border)">
  <div class="flex items-center gap-2">
    <div class="w-2 h-2 rounded-full"
         style="background: {beauState.online ? 'var(--bmo-green)' : '#636e72'}"></div>
    <span style="color: var(--bmo-muted); letter-spacing: 2px">
      {beauState.online ? 'AWAKE' : 'SLEEPING'}
    </span>
  </div>

  <div style="color: var(--bmo-muted)">
    MODE: <span style="color: var(--bmo-text)">{beauState.mode.toUpperCase()}</span>
  </div>

  <div style="color: var(--bmo-muted)">
    STATE: <span style="color: var(--bmo-text)">{beauState.faceState.toUpperCase()}</span>
  </div>

  <div style="color: var(--bmo-muted)">
    SLEEP: <span style="color: {beauState.sleepState === 'asleep' ? '#636e72' : 'var(--bmo-text)'}">
      {beauState.sleepState.toUpperCase()}
    </span>
  </div>

  <div style="color: var(--bmo-muted)">
    ROOM: <span style="color: {beauState.presenceState === 'occupied' ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
      {beauState.presenceState.toUpperCase()}
    </span>
  </div>

  <div style="color: var(--bmo-muted)">
    VJ: <span style="color: {beauState.resolumeActive ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
      {beauState.resolumeActive ? 'LIVE' : 'OFF'}
    </span>
  </div>

  <!-- Edit mode toggle -->
  <button
    onclick={toggleEditMode}
    title="Toggle edit mode (Ctrl+E) — drag panels, resize, add widgets"
    class="ml-auto text-xs tracking-widest px-3 py-1 border transition-all hover:opacity-80"
    style="
      border-color: {editModeState.active ? 'var(--bmo-green)' : 'var(--bmo-border)'};
      background: {editModeState.active ? 'var(--bmo-green)' : 'transparent'};
      color: {editModeState.active ? 'var(--bmo-bg)' : 'var(--bmo-muted)'};
      cursor: pointer;
    "
  >
    {editModeState.active ? 'EDIT MODE' : 'EDIT'}
  </button>

  <button
    onclick={openSitrep}
    title="Export situation report"
    class="text-xs tracking-widest px-3 py-1 border transition-all hover:opacity-80"
    style="
      border-color: var(--bmo-border);
      background: transparent;
      color: var(--bmo-muted);
      cursor: pointer;
    "
  >
    SITREP
  </button>

  {#if reaction}
    <div class="italic truncate max-w-xs reaction-flash" style="color: var(--bmo-green)">
      {reaction}
    </div>
  {:else if !toast && beauState.lastHaiku}
    <div class="italic truncate max-w-xs" style="color: var(--bmo-muted)">
      "{beauState.lastHaiku.split('\n')[0]}..."
    </div>
  {/if}
</div>

<SitrepModal bind:open={sitrepOpen} />

{#if toast}
  <div class="thought-toast" role="status">
    <div class="thought-toast-header">
      <span class="thought-toast-type">{toast.type.toUpperCase()}</span>
      <button class="thought-toast-close" onclick={dismissToast} title="Dismiss">✕</button>
    </div>
    <div class="thought-toast-text" class:thought-toast-haiku={toast.type === 'haiku'}>
      {#if toast.type === 'haiku'}
        {#each toast.text.split('\n') as line}
          <div>{line}</div>
        {/each}
      {:else}
        {toast.text}
      {/if}
    </div>
  </div>
{/if}

<style>
  .reaction-flash {
    animation: reaction-in 0.2s ease-out;
  }
  @keyframes reaction-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .thought-toast {
    position: fixed;
    top: 56px;
    right: 16px;
    z-index: 1000;
    min-width: 280px;
    max-width: 400px;
    border: 1px solid var(--bmo-green);
    background: var(--bmo-bg);
    padding: 0;
    animation: toast-in 0.3s ease-out;
    box-shadow: 0 0 20px rgba(0, 229, 160, 0.1);
  }

  .thought-toast-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    border-bottom: 1px solid var(--bmo-border);
    background: var(--bmo-surface);
  }

  .thought-toast-type {
    font-size: 0.6rem;
    letter-spacing: 3px;
    color: var(--bmo-muted);
  }

  .thought-toast-close {
    background: none;
    border: none;
    color: var(--bmo-muted);
    cursor: pointer;
    font-size: 0.7rem;
    padding: 2px 6px;
    transition: color 0.15s;
  }

  .thought-toast-close:hover {
    color: var(--bmo-green);
  }

  .thought-toast-text {
    padding: 12px 14px;
    font-size: 0.85rem;
    line-height: 1.6;
    color: var(--bmo-green);
    font-style: italic;
    white-space: pre-wrap;
  }

  .thought-toast-haiku {
    text-align: center;
    font-size: 0.9rem;
    line-height: 1.8;
    padding: 16px 20px;
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
