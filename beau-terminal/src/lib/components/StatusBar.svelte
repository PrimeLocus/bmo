<script lang="ts">
  import { beauState } from '$lib/stores/beau.svelte.js';
  import { editModeState, toggleEditMode } from '$lib/stores/editMode.svelte.js';
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

  {#if beauState.lastHaiku}
    <div class="italic truncate max-w-xs" style="color: var(--bmo-muted)">
      "{beauState.lastHaiku.split('\n')[0]}..."
    </div>
  {/if}
</div>
