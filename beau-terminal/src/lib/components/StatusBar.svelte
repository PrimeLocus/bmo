<script lang="ts">
  import { beauState } from '$lib/stores/beau.svelte.js';
</script>

<div class="flex items-center gap-6 px-4 py-2 text-xs border-b"
     style="background: var(--bmo-surface); border-color: var(--bmo-border)">
  <div class="flex items-center gap-2">
    <div class="w-2 h-2 rounded-full"
         style="background: {beauState.online ? 'var(--bmo-green)' : '#636e72'}"></div>
    <span style="color: var(--bmo-muted); letter-spacing: 2px">
      {beauState.online ? 'ONLINE' : 'OFFLINE'}
    </span>
  </div>

  <div style="color: var(--bmo-muted)">
    MODE: <span style="color: var(--bmo-text)">{beauState.mode.toUpperCase()}</span>
  </div>

  <div style="color: var(--bmo-muted)">
    STATE: <span style="color: var(--bmo-text)">{beauState.emotionalState.toUpperCase()}</span>
  </div>

  {#if beauState.lastHaiku}
    <div class="ml-auto italic truncate max-w-xs" style="color: var(--bmo-muted)">
      "{beauState.lastHaiku.split('\n')[0]}..."
    </div>
  {/if}
</div>
