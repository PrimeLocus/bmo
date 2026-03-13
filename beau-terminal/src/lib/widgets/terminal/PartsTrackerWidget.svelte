<script lang="ts">
	import { enhance } from '$app/forms';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	type Part = {
		id: number;
		name: string;
		category: string;
		price: number;
		source: string;
		tracking: string;
		status: string;
		eta: string;
		role: string;
		notes: string;
		expectedDelivery: string;
		buildVersion: string;
	};

	const STATUSES = ['ordered', 'shipped', 'delivered', 'installed', 'waiting', 'cancelled'];

	const STATUS_COLORS: Record<string, string> = {
		ordered: 'var(--bmo-muted)',
		shipped: '#f0a500',
		delivered: '#00b894',
		installed: 'var(--bmo-green)',
		waiting: '#636e72',
		cancelled: '#d63031'
	};

	const BUILD_COLORS: Record<string, string> = {
		v1: 'var(--bmo-green)',
		'v1.5': '#f0a500',
		v2: '#74b9ff',
		'v2.5': '#a29bfe',
		v3: '#fd79a8'
	};

	const BUILD_VERSIONS = ['v1', 'v1.5', 'v2', 'v2.5', 'v3'];

	let expanded = $state<Set<number>>(new Set());
	let sortBy = $state('name');
	let sortDir = $state<'asc' | 'desc'>('asc');

	const categoryFilter = $derived((config.category as string) ?? '');
	const configSort = $derived((config.sort as string) ?? 'name');

	// Map config sort values to column names
	const sortColumn = $derived.by(() => {
		if (sortBy !== 'name' && sortBy !== configSort) return sortBy;
		switch (configSort) {
			case 'status':
				return 'status';
			case 'delivery':
				return 'expectedDelivery';
			default:
				return 'name';
		}
	});

	const parts = $derived<Part[]>(Array.isArray(data) ? (data as Part[]) : []);

	const filtered = $derived(
		categoryFilter ? parts.filter((p) => p.category === categoryFilter) : parts
	);

	const sorted = $derived.by(() => {
		const arr = [...filtered];
		const col = sortColumn;
		return arr.sort((a, b) => {
			if (col === 'price')
				return sortDir === 'asc' ? a.price - b.price : b.price - a.price;
			const av = String((a as Record<string, unknown>)[col] ?? '').toLowerCase();
			const bv = String((b as Record<string, unknown>)[col] ?? '').toLowerCase();
			if (av < bv) return sortDir === 'asc' ? -1 : 1;
			if (av > bv) return sortDir === 'asc' ? 1 : -1;
			return 0;
		});
	});

	const totalCost = $derived(filtered.reduce((s, p) => s + p.price, 0));
	const statusCounts = $derived(
		STATUSES.reduce(
			(acc, s) => {
				acc[s] = filtered.filter((p) => p.status === s).length;
				return acc;
			},
			{} as Record<string, number>
		)
	);

	function toggleSort(col: string) {
		if (sortBy === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else {
			sortBy = col;
			sortDir = 'asc';
		}
	}

	function si(col: string) {
		if (sortBy !== col) return '';
		return sortDir === 'asc' ? ' ↑' : ' ↓';
	}

	function toggle(id: number) {
		const next = new Set(expanded);
		next.has(id) ? next.delete(id) : next.add(id);
		expanded = next;
	}

	function isUrl(val: string) {
		return val.startsWith('http://') || val.startsWith('https://');
	}
</script>

{#if parts.length === 0}
	<div class="empty">
		<span class="empty-label">NO DATA</span>
		<span class="empty-sub">No parts loaded</span>
	</div>
{:else}
	<div class="parts-widget">
		<!-- Summary bar -->
		<div class="summary-bar">
			<span class="summary-count">{filtered.length} PARTS</span>
			<span class="summary-cost">${totalCost.toFixed(2)}</span>
			<span class="summary-statuses">
				{#each STATUSES.filter((s) => statusCounts[s] > 0) as s}
					<span class="status-count" style="color: {STATUS_COLORS[s]}"
						>{statusCounts[s]} {s}</span
					>
				{/each}
			</span>
		</div>

		<!-- Table -->
		<div class="table-wrap">
			<!-- Header -->
			<div class="table-header">
				{#each [
					{ col: 'name', label: 'NAME', flex: 3 },
					{ col: 'category', label: 'TAG', flex: 1 },
					{ col: 'status', label: 'STATUS', flex: 1.5 },
					{ col: 'expectedDelivery', label: 'ARRIVES', flex: 1.5 },
					{ col: 'buildVersion', label: 'BUILD', flex: 1 },
					{ col: 'price', label: 'PRICE', flex: 1 }
				] as h}
					<button
						type="button"
						class="header-cell"
						style="flex: {h.flex}; color: {sortBy === h.col ? 'var(--bmo-green)' : 'var(--bmo-muted)'}"
						onclick={() => toggleSort(h.col)}
					>
						{h.label}{si(h.col)}
					</button>
				{/each}
			</div>

			<!-- Rows -->
			<div class="table-body">
				{#each sorted as part (part.id)}
					<div class="part-row-wrap">
						<button
							type="button"
							class="part-row"
							onclick={() => toggle(part.id)}
							style="background: {expanded.has(part.id) ? 'var(--bmo-surface)' : 'transparent'}"
						>
							<!-- Name -->
							<div class="cell" style="flex: 3">
								<span
									class="expand-icon"
									style="color: {expanded.has(part.id)
										? 'var(--bmo-green)'
										: 'var(--bmo-muted)'}"
									>{expanded.has(part.id) ? '▾' : '▸'}</span
								>
								<span class="cell-name" title={part.name}>{part.name}</span>
							</div>
							<!-- Tag -->
							<div class="cell" style="flex: 1">
								<span class="tag-badge">{part.category}</span>
							</div>
							<!-- Status -->
							<div class="cell" style="flex: 1.5">
								<span
									class="status-badge"
									style="color: {STATUS_COLORS[part.status]}; border-color: {STATUS_COLORS[
										part.status
									]}40"
								>
									{part.status.toUpperCase()}
								</span>
							</div>
							<!-- Arrives -->
							<div class="cell" style="flex: 1.5">
								{#if part.expectedDelivery}
									<span
										style="color: {part.expectedDelivery === 'Delivered'
											? 'var(--bmo-green)'
											: 'var(--bmo-text)'}; font-size: 11px"
									>
										{part.expectedDelivery}
									</span>
								{:else}
									<span style="color: var(--bmo-border)">—</span>
								{/if}
							</div>
							<!-- Build -->
							<div class="cell" style="flex: 1">
								<span
									class="build-badge"
									style="color: {BUILD_COLORS[part.buildVersion] ??
										'var(--bmo-muted)'}"
								>
									{part.buildVersion || 'v1'}
								</span>
							</div>
							<!-- Price -->
							<div class="cell cell-right" style="flex: 1">
								<span style="color: var(--bmo-muted); font-size: 11px">
									{part.price > 0 ? `$${part.price.toFixed(2)}` : 'bundled'}
								</span>
							</div>
						</button>

						<!-- Expanded edit panel -->
						{#if expanded.has(part.id)}
							<div class="expanded-panel">
								{#if part.role}
									<p class="part-role">{part.role}</p>
								{/if}
								{#if part.notes}
									<p class="part-notes">{part.notes}</p>
								{/if}
								<div class="edit-row">
									<!-- Status -->
									<form method="POST" action="/parts?/update" use:enhance>
										<input type="hidden" name="id" value={part.id} />
										<label class="edit-label" for="w-status-{part.id}"
											>STATUS</label
										>
										<select
											id="w-status-{part.id}"
											name="status"
											onchange={(e) =>
												(
													e.currentTarget as HTMLSelectElement
												).closest('form')?.requestSubmit()}
											class="edit-select"
										>
											{#each STATUSES as s}
												<option value={s} selected={s === part.status}
													>{s}</option
												>
											{/each}
										</select>
									</form>

									<!-- Build version -->
									<form method="POST" action="/parts?/update" use:enhance>
										<input type="hidden" name="id" value={part.id} />
										<label class="edit-label" for="w-build-{part.id}"
											>BUILD</label
										>
										<select
											id="w-build-{part.id}"
											name="buildVersion"
											onchange={(e) =>
												(
													e.currentTarget as HTMLSelectElement
												).closest('form')?.requestSubmit()}
											class="edit-select"
											style="color: {BUILD_COLORS[part.buildVersion] ??
												'var(--bmo-text)'}"
										>
											{#each BUILD_VERSIONS as v}
												<option
													value={v}
													selected={v ===
														(part.buildVersion || 'v1')}>{v}</option
												>
											{/each}
										</select>
									</form>

									<!-- Expected Delivery -->
									<form method="POST" action="/parts?/update" use:enhance>
										<input type="hidden" name="id" value={part.id} />
										<label class="edit-label" for="w-exp-{part.id}"
											>ARRIVES</label
										>
										<input
											id="w-exp-{part.id}"
											type="text"
											name="expectedDelivery"
											value={part.expectedDelivery}
											placeholder="Mar 13"
											onblur={(e) =>
												(
													e.currentTarget as HTMLInputElement
												).closest('form')?.requestSubmit()}
											class="edit-input"
											style="width: 80px"
										/>
									</form>

									<!-- Tracking link -->
									{#if part.tracking && isUrl(part.tracking)}
										<a
											href={part.tracking}
											target="_blank"
											rel="noopener noreferrer"
											class="track-link"
										>
											↗ TRACK
										</a>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.empty {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-family: 'Courier New', monospace;
		gap: 4px;
	}
	.empty-label {
		color: var(--bmo-muted);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}
	.empty-sub {
		color: var(--bmo-border);
		font-size: 10px;
		letter-spacing: 0.1em;
	}

	.parts-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', monospace;
		overflow: hidden;
	}

	.summary-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 10px;
		border-bottom: 1px solid var(--bmo-border);
		flex-shrink: 0;
		flex-wrap: wrap;
	}
	.summary-count {
		color: var(--bmo-green);
		font-size: 10px;
		font-weight: bold;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}
	.summary-cost {
		color: var(--bmo-text);
		font-size: 11px;
		font-weight: bold;
	}
	.summary-statuses {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.status-count {
		font-size: 10px;
		letter-spacing: 0.05em;
	}

	.table-wrap {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.table-header {
		display: flex;
		background: var(--bmo-surface);
		border-bottom: 1px solid var(--bmo-border);
		flex-shrink: 0;
	}
	.header-cell {
		padding: 6px 8px;
		font-size: 10px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		text-align: left;
		background: none;
		border: none;
		cursor: pointer;
		font-family: inherit;
		transition: opacity 0.15s;
		white-space: nowrap;
	}
	.header-cell:hover {
		opacity: 0.7;
	}

	.table-body {
		flex: 1;
		overflow-y: auto;
	}

	.part-row-wrap {
		border-bottom: 1px solid var(--bmo-border);
	}
	.part-row {
		display: flex;
		width: 100%;
		text-align: left;
		background: transparent;
		border: none;
		cursor: pointer;
		font-family: inherit;
		transition: opacity 0.15s;
		padding: 0;
	}
	.part-row:hover {
		opacity: 0.8;
	}

	.cell {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 8px;
		min-width: 0;
	}
	.cell-right {
		justify-content: flex-end;
	}

	.expand-icon {
		font-size: 10px;
		flex-shrink: 0;
	}
	.cell-name {
		color: var(--bmo-text);
		font-size: 12px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tag-badge {
		font-size: 9px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--bmo-muted);
		border: 1px solid var(--bmo-border);
		padding: 1px 4px;
	}

	.status-badge {
		font-size: 10px;
		font-weight: bold;
		letter-spacing: 0.08em;
		border: 1px solid;
		padding: 1px 6px;
	}

	.build-badge {
		font-size: 10px;
		font-weight: bold;
		letter-spacing: 0.12em;
	}

	.expanded-panel {
		padding: 8px 12px 10px;
		border-top: 1px solid var(--bmo-border);
		background: var(--bmo-surface);
	}
	.part-role {
		font-size: 11px;
		color: var(--bmo-muted);
		margin-bottom: 6px;
		line-height: 1.4;
	}
	.part-notes {
		font-size: 11px;
		color: #f0a500;
		font-style: italic;
		margin-bottom: 8px;
	}

	.edit-row {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		align-items: flex-end;
	}

	.edit-label {
		display: block;
		font-size: 9px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--bmo-muted);
		margin-bottom: 3px;
	}
	.edit-select {
		font-size: 11px;
		padding: 3px 6px;
		border: 1px solid var(--bmo-border);
		background: var(--bmo-bg);
		color: var(--bmo-text);
		font-family: 'Courier New', monospace;
	}
	.edit-input {
		font-size: 11px;
		padding: 3px 6px;
		border: 1px solid var(--bmo-border);
		background: var(--bmo-bg);
		color: var(--bmo-text);
		font-family: 'Courier New', monospace;
	}

	.track-link {
		font-size: 11px;
		font-weight: bold;
		color: var(--bmo-green);
		text-decoration: none;
		letter-spacing: 0.1em;
		align-self: flex-end;
		padding-bottom: 3px;
	}
	.track-link:hover {
		opacity: 0.7;
	}
</style>
