<!-- src/lib/components/EditBar.svelte -->
<script lang="ts">
  import { editModeState } from '$lib/stores/editMode.svelte.js';
</script>

{#if editModeState.active}
  <div class="flex items-center gap-4 px-4 py-1.5 text-xs border-b"
       style="background: var(--bmo-green); color: var(--bmo-bg); border-color: var(--bmo-green)">
    <span class="font-bold tracking-widest">EDIT MODE</span>
    <span style="opacity: 0.7">drag to move · edges to resize · −/+ panel text · PANELS to toggle · + WIDGET on custom pages · ESC to exit</span>
  </div>
{/if}
