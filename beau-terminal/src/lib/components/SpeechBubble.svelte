<script lang="ts">
  let { message }: { message: string } = $props();
  let visible = $state(true);
  let fading = $state(false);

  $effect(() => {
    const timer = setTimeout(() => {
      fading = true;
      setTimeout(() => { visible = false; }, 500);
    }, 5000);
    return () => clearTimeout(timer);
  });

  function dismiss() {
    fading = true;
    setTimeout(() => { visible = false; }, 300);
  }
</script>

{#if visible}
  <button onclick={dismiss}
    class:fading
    style="background: var(--bmo-surface); border: 1px solid var(--bmo-green); padding: 0.4rem 0.75rem; color: var(--bmo-text); font-family: 'Courier New', monospace; font-size: 0.75rem; cursor: pointer; transition: opacity 0.5s ease; white-space: nowrap;">
    {message}
  </button>
{/if}

<style>
  .fading { opacity: 0; }
</style>
