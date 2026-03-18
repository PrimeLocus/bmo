<script lang="ts">
  import { onMount } from 'svelte';
  import { beauState } from '$lib/stores/beau.svelte.js';
  import { editModeState, toggleEditMode } from '$lib/stores/editMode.svelte.js';
  import SitrepModal from './SitrepModal.svelte';

  let sitrepOpen = $state(false);
  let reaction = $state<string | null>(null);
  let reactionTimer: ReturnType<typeof setTimeout> | null = null;

  function openSitrep() {
    sitrepOpen = true;
  }

  function showReaction(msg: string) {
    reaction = msg;
    if (reactionTimer) clearTimeout(reactionTimer);
    reactionTimer = setTimeout(() => { reaction = null; }, 3500);
  }

  onMount(() => {
    const handleSitrep = () => { sitrepOpen = true; };
    const handleReact = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) showReaction(detail);
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
    STATE: <span style="color: var(--bmo-text)">{beauState.emotionalState.toUpperCase()}</span>
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
  {:else if beauState.lastHaiku}
    <div class="italic truncate max-w-xs" style="color: var(--bmo-muted)">
      "{beauState.lastHaiku.split('\n')[0]}..."
    </div>
  {/if}
</div>

<SitrepModal bind:open={sitrepOpen} />

<style>
  .reaction-flash {
    animation: reaction-in 0.2s ease-out;
  }
  @keyframes reaction-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
