<script lang="ts">
  import { onMount } from 'svelte';
  import { connectBeauWS, disconnectBeauWS } from '$lib/stores/beau.svelte.js';
  import { applyCurrentSettings } from '$lib/stores/settings.svelte.js';
  import { editModeState, toggleEditMode, exitEditMode } from '$lib/stores/editMode.svelte.js';
  import Nav from '$lib/components/Nav.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import EditBar from '$lib/components/EditBar.svelte';
  import '../app.css';

  const { children } = $props();

  function handleKeydown(e: KeyboardEvent) {
    // Guard: don't intercept when typing in form fields
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) return;

    if (e.key === 'Escape' && editModeState.active) {
      exitEditMode();
      return;
    }
    if (e.ctrlKey && e.key === 'e') {
      e.preventDefault();
      toggleEditMode();
    }
  }

  onMount(() => {
    applyCurrentSettings();
    connectBeauWS();
    return () => disconnectBeauWS();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-screen overflow-hidden">
  <Nav />
  <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
    <StatusBar />
    <EditBar />
    <main class="flex-1 p-6 overflow-y-auto">
      {@render children()}
    </main>
  </div>
</div>
