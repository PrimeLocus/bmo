<script lang="ts">
  import { onMount } from 'svelte';
  import { connectBeauWS, disconnectBeauWS } from '$lib/stores/beau.svelte.js';
  import { settings, updateSettings } from '$lib/stores/settings.svelte.js';
  import Nav from '$lib/components/Nav.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import '../app.css';

  const { children } = $props();

  onMount(() => {
    // Re-apply settings after hydration (blocking script already ran, this ensures state sync)
    updateSettings({});
    connectBeauWS();
    return () => disconnectBeauWS();
  });
</script>

<div class="flex h-screen overflow-hidden">
  <Nav />
  <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
    <StatusBar />
    <main class="flex-1 p-6 overflow-y-auto">
      {@render children()}
    </main>
  </div>
</div>
