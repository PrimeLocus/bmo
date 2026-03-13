<script lang="ts">
	import { getWidgetMeta } from './registry.js';
	import type { WidgetMeta } from './registry.js';

	let { widgetId, config, data }: { widgetId: string; config: Record<string, unknown>; data?: unknown } = $props();

	let meta: WidgetMeta | undefined = $derived(getWidgetMeta(widgetId));
	let fetchedData: unknown = $state(undefined);
	let fetchError: string | null = $state(null);

	// For database widgets added at runtime where data wasn't provided by the
	// server load function, fetch it client-side on mount.
	$effect(() => {
		if (meta && meta.dataKind === 'database' && data === undefined) {
			fetchError = null;
			const params = new URLSearchParams({ config: JSON.stringify(config) });
			fetch(`/api/widgets/${widgetId}/data?${params}`)
				.then((res) => {
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					return res.json();
				})
				.then((json) => {
					fetchedData = json;
				})
				.catch((err) => {
					fetchError = err.message ?? 'fetch failed';
				});
		}
	});

	let resolvedData: unknown = $derived(data !== undefined ? data : fetchedData);
</script>

{#if !meta}
	<div class="unknown">UNKNOWN WIDGET: {widgetId}</div>
{:else}
	{#await meta.component()}
		<div class="loading">LOADING...</div>
	{:then mod}
		{#if fetchError}
			<div class="error">WIDGET DATA FAILED: {fetchError}</div>
		{:else}
			<mod.default {config} data={resolvedData} />
		{/if}
	{:catch}
		<div class="error">WIDGET FAILED TO LOAD</div>
	{/await}
{/if}

<style>
	.unknown,
	.loading,
	.error {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		font-family: 'Courier New', monospace;
		font-size: 10px;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	.unknown {
		color: var(--bmo-muted);
	}

	.loading {
		color: var(--bmo-muted);
	}

	.error {
		color: #d63031;
	}
</style>
