<script lang="ts">
	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();
</script>

<div class="widget-stub">
	<span class="stub-label">WIDGET STUB</span>
</div>

<style>
	.widget-stub {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: 'Courier New', monospace;
	}
	.stub-label {
		color: var(--bmo-muted);
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}
</style>
