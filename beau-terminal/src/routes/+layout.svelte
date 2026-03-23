<script lang="ts">
  import { onMount } from 'svelte';
  import { connectBeauStream, disconnectBeauStream } from '$lib/stores/beau.svelte.js';
  import { applyCurrentSettings } from '$lib/stores/settings.svelte.js';
  import { editModeState, toggleEditMode, exitEditMode } from '$lib/stores/editMode.svelte.js';
  import Nav from '$lib/components/Nav.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import EditBar from '$lib/components/EditBar.svelte';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import '../app.css';

  const { children } = $props();

  let paletteOpen = $state(false);

  function handleKeydown(e: KeyboardEvent) {
    // Ctrl+K / Cmd+K — open command palette (allow from anywhere except active text inputs)
    if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      e.preventDefault();
      paletteOpen = !paletteOpen;
      return;
    }

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
    (window as any).__BMO_READY = true;
    applyCurrentSettings();
    connectBeauStream();

    const handleThoughtSurface = async () => {
      try {
        const res = await fetch('/api/thoughts/surface', { method: 'POST' });
        if (!res.ok) return;
        const thought = await res.json();
        if (!thought.text) return;

        // Duration by type
        const durations: Record<string, number> = { observation: 3500, reaction: 5000, haiku: 8000 };
        const duration = durations[thought.type] ?? 5000;

        // Show via StatusBar
        window.dispatchEvent(new CustomEvent('bmo:react', {
          detail: { text: thought.text, duration },
        }));
      } catch {
        // silently fail — thought may have decayed
      }
    };

    window.addEventListener('bmo:thought-surface', handleThoughtSurface);
    return () => {
      disconnectBeauStream();
      window.removeEventListener('bmo:thought-surface', handleThoughtSurface);
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<CommandPalette bind:open={paletteOpen} />

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
