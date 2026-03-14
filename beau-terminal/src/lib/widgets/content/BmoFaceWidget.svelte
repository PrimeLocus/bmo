<script lang="ts">
  import BmoFace from '$lib/components/BmoFace.svelte';
  let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();
</script>

<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
  <BmoFace size="standard" />
</div>
