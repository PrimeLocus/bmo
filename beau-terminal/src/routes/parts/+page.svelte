<script lang="ts">
  import { enhance } from '$app/forms';
  import { onMount } from 'svelte';
  import PanelCanvas from '$lib/components/PanelCanvas.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();

  const STATUSES = ['ordered', 'shipped', 'delivered', 'installed', 'waiting', 'cancelled'];
  const CATEGORY_ORDER = ['Core', 'AI', 'Audio', 'Power', 'Display', 'Storage', 'Hardware', 'Setup'];

  let expanded = $state<Set<number>>(new Set());
  let activeCategory = $state('ALL');
  let refreshing = $state<Set<number>>(new Set());
  let sortBy = $state('id');
  let sortDir = $state<'asc' | 'desc'>('asc');
  let showColSettings = $state(false);

  // Column widths (percentages, must total ≤ 100)
  const DEFAULT_WIDTHS = { name: 22, tag: 8, vendor: 13, status: 11, tracking: 8, arrives: 13, build: 8, price: 10 };
  let colWidths = $state({ ...DEFAULT_WIDTHS });

  onMount(() => {
    const saved = localStorage.getItem('beau-parts-cols');
    if (saved) {
      try { colWidths = { ...DEFAULT_WIDTHS, ...JSON.parse(saved) }; } catch { /* ignore */ }
    }
  });

  function saveWidths() {
    localStorage.setItem('beau-parts-cols', JSON.stringify(colWidths));
    showColSettings = false;
  }

  function resetWidths() {
    colWidths = { ...DEFAULT_WIDTHS };
    localStorage.removeItem('beau-parts-cols');
  }

  const colTemplate = $derived(
    `${colWidths.name}% ${colWidths.tag}% ${colWidths.vendor}% ${colWidths.status}% ${colWidths.tracking}% ${colWidths.arrives}% ${colWidths.build}% ${colWidths.price}%`
  );

  const BUILD_VERSIONS = ['v1', 'v1.5', 'v2', 'v2.5', 'v3'];
  const BUILD_COLORS: Record<string, string> = {
    'v1':   'var(--bmo-green)',
    'v1.5': '#f0a500',
    'v2':   '#74b9ff',
    'v2.5': '#a29bfe',
    'v3':   '#fd79a8',
  };

  const categories = $derived(['ALL', ...CATEGORY_ORDER.filter(c => data.parts.some(p => p.category === c))]);

  const filtered = $derived(
    activeCategory === 'ALL' ? data.parts : data.parts.filter(p => p.category === activeCategory)
  );

  const sorted = $derived.by(() => {
    const arr = [...filtered];
    return arr.sort((a, b) => {
      if (sortBy === 'price') return sortDir === 'asc' ? a.price - b.price : b.price - a.price;
      const av = String((a as Record<string,unknown>)[sortBy] ?? '').toLowerCase();
      const bv = String((b as Record<string,unknown>)[sortBy] ?? '').toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  });

  const totalCost = $derived(data.parts.reduce((s, p) => s + p.price, 0));
  const filteredCost = $derived(filtered.reduce((s, p) => s + p.price, 0));
  const statusCounts = $derived(
    STATUSES.reduce((acc, s) => {
      acc[s] = filtered.filter(p => p.status === s).length;
      return acc;
    }, {} as Record<string, number>)
  );

  function toggleSort(col: string) {
    if (sortBy === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortBy = col; sortDir = 'asc'; }
  }

  function si(col: string) {
    if (sortBy !== col) return '↕';
    return sortDir === 'asc' ? '↑' : '↓';
  }

  function toggle(id: number) {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    expanded = next;
  }

  const STATUS_COLORS: Record<string, string> = {
    ordered:   'var(--bmo-muted)',
    shipped:   '#f0a500',
    delivered: '#00b894',
    installed: 'var(--bmo-green)',
    waiting:   '#636e72',
    cancelled: '#d63031',
  };

  function isUrl(val: string) {
    return val.startsWith('http://') || val.startsWith('https://');
  }
</script>

<div class="w-full">
  <!-- Header -->
  <div class="mb-4 flex items-end justify-between flex-wrap gap-3">
    <div>
      <h1 class="text-2xl tracking-widest font-bold" style="color: var(--bmo-green)">PARTS TRACKER</h1>
      <p class="text-base mt-1" style="color: var(--bmo-muted)">{data.parts.length} parts · ${totalCost.toFixed(2)} total</p>
    </div>
    <div class="flex items-center gap-4">
      <div class="text-sm" style="color: var(--bmo-muted)">
        {data.parts.filter(p => p.status === 'shipped').length} shipped ·
        {data.parts.filter(p => p.status === 'delivered').length} delivered ·
        {data.parts.filter(p => p.status === 'ordered').length} ordered
      </div>
      <button onclick={() => showColSettings = !showColSettings}
              class="text-xs px-2 py-1 border tracking-widest transition-all"
              style="border-color: {showColSettings ? 'var(--bmo-green)' : 'var(--bmo-border)'};
                     color: {showColSettings ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
        ⊞ COLS
      </button>
    </div>
  </div>

  <PanelCanvas pageId="/parts">
  <Panel id="parts:tracker" label="Parts Tracker" defaultPosition={{ col: 0, row: 0, colSpan: 12, rowSpan: 8 }}>

  <!-- Column width settings -->
  {#if showColSettings}
    <div class="mb-4 p-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <p class="text-xs tracking-widest mb-3" style="color: var(--bmo-muted)">COLUMN WIDTHS (%)</p>
      <div class="flex gap-4 flex-wrap items-end">
        {#each [
          { key: 'name', label: 'NAME' },
          { key: 'tag', label: 'TAG' },
          { key: 'vendor', label: 'VENDOR' },
          { key: 'status', label: 'STATUS' },
          { key: 'tracking', label: 'TRACK' },
          { key: 'arrives', label: 'ARRIVES' },
          { key: 'build', label: 'BUILD' },
          { key: 'price', label: 'PRICE' },
        ] as col}
          <div>
            <label class="text-xs tracking-widest block mb-1" for="col-{col.key}" style="color: var(--bmo-muted)">{col.label}</label>
            <input id="col-{col.key}" type="number" min="4" max="60" step="1"
                   value={colWidths[col.key as keyof typeof colWidths]}
                   oninput={(e) => { colWidths = { ...colWidths, [col.key]: Number((e.currentTarget as HTMLInputElement).value) }; }}
                   class="text-sm px-2 py-1.5 border w-16 text-center"
                   style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)" />
          </div>
        {/each}
        <div class="flex gap-2 pb-0.5">
          <button onclick={saveWidths}
                  class="text-sm px-3 py-1.5 border tracking-widest"
                  style="border-color: var(--bmo-green); color: var(--bmo-green)">SAVE</button>
          <button onclick={resetWidths}
                  class="text-sm px-3 py-1.5 border tracking-widest"
                  style="border-color: var(--bmo-border); color: var(--bmo-muted)">RESET</button>
        </div>
      </div>
      <p class="text-xs mt-2" style="color: var(--bmo-muted)">
        Total: {Object.values(colWidths).reduce((s, v) => s + v, 0)}%
        {#if Object.values(colWidths).reduce((s, v) => s + v, 0) > 100}
          <span style="color: #d63031">⚠ exceeds 100%</span>
        {/if}
      </p>
    </div>
  {/if}

  <!-- Category filter -->
  <div class="flex gap-2 mb-5 flex-wrap">
    {#each categories as cat}
      <button
        onclick={() => activeCategory = cat}
        class="px-3 py-1 text-sm tracking-widest border transition-all"
        style="
          border-color: {activeCategory === cat ? 'var(--bmo-green)' : 'var(--bmo-border)'};
          color: {activeCategory === cat ? 'var(--bmo-bg)' : 'var(--bmo-muted)'};
          background: {activeCategory === cat ? 'var(--bmo-green)' : 'transparent'};
        "
      >{cat}</button>
    {/each}
  </div>

  <!-- ── DESKTOP TABLE (md+) ─────────────────────────────── -->
  <div class="hidden md:block border overflow-x-auto" style="border-color: var(--bmo-border)">

    <!-- Header row -->
    <div class="grid text-sm tracking-widest border-b"
         style="grid-template-columns: {colTemplate};
                border-color: var(--bmo-border); background: var(--bmo-surface)">
      {#each [
        { col: 'name',             label: 'NAME' },
        { col: 'category',         label: 'TAG' },
        { col: 'source',           label: 'VENDOR' },
        { col: 'status',           label: 'STATUS' },
        { col: 'tracking',         label: 'TRACK' },
        { col: 'expectedDelivery', label: 'ARRIVES' },
        { col: 'buildVersion',     label: 'BUILD' },
        { col: 'price',            label: 'PRICE' },
      ] as h}
        <button
          onclick={() => toggleSort(h.col)}
          class="px-4 py-3 text-left flex items-center gap-1 hover:opacity-80 transition-opacity w-full"
          style="color: {sortBy === h.col ? 'var(--bmo-green)' : 'var(--bmo-muted)'}"
        >
          <span>{h.label}</span>
          <span class="opacity-50 text-xs">{si(h.col)}</span>
        </button>
      {/each}
    </div>

    <!-- Data rows -->
    {#each sorted as part (part.id)}
      <div class="border-b" style="border-color: var(--bmo-border)">

        <!-- Main row -->
        <button
          type="button"
          onclick={() => toggle(part.id)}
          class="grid w-full text-left hover:opacity-80 transition-opacity"
          style="grid-template-columns: {colTemplate};
                 background: {expanded.has(part.id) ? 'var(--bmo-surface)' : 'transparent'}"
        >
          <!-- Name -->
          <div class="px-4 py-3 flex items-center gap-2 min-w-0">
            <span class="text-xs shrink-0" style="color: {expanded.has(part.id) ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">{expanded.has(part.id) ? '▾' : '▸'}</span>
            <span class="text-base leading-snug truncate" title={part.name} style="color: var(--bmo-text)">{part.name}</span>
          </div>
          <!-- Tag / Category -->
          <div class="px-4 py-3 flex items-center">
            <span class="text-xs tracking-widest px-1.5 py-0.5 border"
                  style="color: var(--bmo-muted); border-color: var(--bmo-border)">
              {part.category}
            </span>
          </div>
          <!-- Vendor -->
          <div class="px-4 py-3 flex items-center min-w-0">
            <span class="text-sm truncate" title={part.source || ''} style="color: var(--bmo-muted)">{part.source || '—'}</span>
          </div>
          <!-- Status -->
          <div class="px-4 py-3 flex items-center">
            <span class="text-sm font-bold tracking-wide px-2 py-0.5 border"
                  style="color: {STATUS_COLORS[part.status]}; border-color: {STATUS_COLORS[part.status]}20">
              {part.status.toUpperCase()}
            </span>
          </div>
          <!-- Tracking -->
          <div class="px-4 py-3 flex items-center">
            {#if part.tracking && isUrl(part.tracking)}
              <a href={part.tracking} target="_blank" rel="noopener noreferrer"
                 class="text-sm font-bold hover:opacity-70 transition-opacity"
                 style="color: var(--bmo-green)"
                 onclick={(e) => e.stopPropagation()}>↗ TRACK</a>
            {:else}
              <span class="text-sm" style="color: var(--bmo-border)">—</span>
            {/if}
          </div>
          <!-- Expected Delivery -->
          <div class="px-4 py-3 flex items-center">
            {#if part.expectedDelivery}
              <span class="text-base font-bold"
                    style="color: {part.expectedDelivery === 'Delivered' ? 'var(--bmo-green)' : 'var(--bmo-text)'}">
                {part.expectedDelivery}
              </span>
            {:else}
              <span class="text-sm" style="color: var(--bmo-border)">—</span>
            {/if}
          </div>
          <!-- Build version -->
          <div class="px-4 py-3 flex items-center">
            <span class="text-xs font-bold tracking-widest"
                  style="color: {BUILD_COLORS[part.buildVersion] ?? 'var(--bmo-muted)'}">
              {part.buildVersion || 'v1'}
            </span>
          </div>
          <!-- Price -->
          <div class="px-4 py-3 flex items-center justify-end">
            <span class="text-sm" style="color: var(--bmo-muted)">
              {part.price > 0 ? `$${part.price.toFixed(2)}` : 'bundled'}
            </span>
          </div>
        </button>

        <!-- Expanded edit panel -->
        {#if expanded.has(part.id)}
          <div class="px-6 pb-5 pt-3 border-t" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
            {#if part.role}
              <p class="text-sm mb-3 leading-relaxed" style="color: var(--bmo-muted)">{part.role}</p>
            {/if}
            {#if part.notes}
              <p class="text-sm mb-4 italic" style="color: #f0a500">⚠ {part.notes}</p>
            {/if}
            <div class="flex gap-4 flex-wrap items-end">
              <!-- Status -->
              <form method="POST" action="?/update" use:enhance>
                <input type="hidden" name="id" value={part.id} />
                <label class="text-sm tracking-widest block mb-1" for="status-{part.id}" style="color: var(--bmo-muted)">STATUS</label>
                <select id="status-{part.id}" name="status"
                  onchange={(e) => (e.currentTarget as HTMLSelectElement).closest('form')?.requestSubmit()}
                  class="text-sm px-2 py-1.5 border"
                  style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)">
                  {#each STATUSES as s}
                    <option value={s} selected={s === part.status}>{s}</option>
                  {/each}
                </select>
              </form>

              <!-- Build version -->
              <form method="POST" action="?/update" use:enhance>
                <input type="hidden" name="id" value={part.id} />
                <label class="text-sm tracking-widest block mb-1" for="build-{part.id}" style="color: var(--bmo-muted)">BUILD</label>
                <select id="build-{part.id}" name="buildVersion"
                  onchange={(e) => (e.currentTarget as HTMLSelectElement).closest('form')?.requestSubmit()}
                  class="text-sm px-2 py-1.5 border"
                  style="background: var(--bmo-bg); color: {BUILD_COLORS[part.buildVersion] ?? 'var(--bmo-text)'}; border-color: var(--bmo-border)">
                  {#each BUILD_VERSIONS as v}
                    <option value={v} selected={v === (part.buildVersion || 'v1')}>{v}</option>
                  {/each}
                </select>
              </form>

              <!-- Vendor -->
              <form method="POST" action="?/update" use:enhance>
                <input type="hidden" name="id" value={part.id} />
                <label class="text-sm tracking-widest block mb-1" for="source-{part.id}" style="color: var(--bmo-muted)">VENDOR</label>
                <input id="source-{part.id}" type="text" name="source" value={part.source}
                  placeholder="e.g. PiShop.us"
                  onblur={(e) => (e.currentTarget as HTMLInputElement).closest('form')?.requestSubmit()}
                  class="text-sm px-2 py-1.5 border w-40"
                  style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)" />
              </form>

              <!-- Tracking URL -->
              <form method="POST" action="?/update" use:enhance class="flex-1 min-w-56">
                <input type="hidden" name="id" value={part.id} />
                <div class="flex items-center gap-2 mb-1">
                  <label class="text-sm tracking-widest" for="tracking-{part.id}" style="color: var(--bmo-muted)">TRACKING URL</label>
                  {#if part.tracking && isUrl(part.tracking)}
                    <a href={part.tracking} target="_blank" rel="noopener noreferrer"
                       class="text-sm tracking-widest hover:opacity-70" style="color: var(--bmo-green)">↗ OPEN</a>
                  {/if}
                </div>
                <input id="tracking-{part.id}" type="url" name="tracking" value={part.tracking}
                  placeholder="https://..."
                  onblur={(e) => (e.currentTarget as HTMLInputElement).closest('form')?.requestSubmit()}
                  class="text-sm px-2 py-1.5 border w-full"
                  style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)" />
              </form>

              <!-- Expected Delivery -->
              <form method="POST" action="?/update" use:enhance>
                <input type="hidden" name="id" value={part.id} />
                <label class="text-sm tracking-widest block mb-1" for="exp-{part.id}" style="color: var(--bmo-muted)">EXP. DELIVERY</label>
                <input id="exp-{part.id}" type="text" name="expectedDelivery" value={part.expectedDelivery}
                  placeholder="Mar 13"
                  onblur={(e) => (e.currentTarget as HTMLInputElement).closest('form')?.requestSubmit()}
                  class="text-sm px-2 py-1.5 border w-28"
                  style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)" />
              </form>

              <!-- Fetch from carrier -->
              {#if part.tracking && isUrl(part.tracking)}
                <form method="POST" action="?/refreshDelivery"
                      use:enhance={() => {
                        refreshing = new Set([...refreshing, part.id]);
                        return async ({ update }) => {
                          refreshing = new Set([...refreshing].filter(x => x !== part.id));
                          await update();
                        };
                      }}>
                  <input type="hidden" name="id" value={part.id} />
                  <input type="hidden" name="tracking"
                         value={part.tracking
                           .replace('https://tools.usps.com/go/TrackConfirmAction?tLabels=', '')
                           .replace('https://www.ups.com/track?tracknum=', '')} />
                  <div class="mb-1 text-sm" style="color: transparent">.</div>
                  <button type="submit" disabled={refreshing.has(part.id)}
                          class="text-sm px-3 py-1.5 border tracking-widest hover:opacity-80 transition-opacity"
                          style="border-color: var(--bmo-border); color: var(--bmo-muted)">
                    {refreshing.has(part.id) ? '...' : '↻ FETCH'}
                  </button>
                </form>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/each}

    <!-- Totals row -->
    <div class="grid border-t-2" style="grid-template-columns: {colTemplate};
         border-color: var(--bmo-border); background: var(--bmo-surface)">
      <!-- Name / count -->
      <div class="px-4 py-3 flex items-center gap-2">
        <span class="text-sm font-bold tracking-widest" style="color: var(--bmo-green)">
          {filtered.length} PARTS
        </span>
        {#if activeCategory !== 'ALL'}
          <span class="text-xs" style="color: var(--bmo-muted)">in {activeCategory}</span>
        {/if}
      </div>
      <!-- Tag: empty -->
      <div class="px-4 py-3"></div>
      <!-- Vendor: empty -->
      <div class="px-4 py-3"></div>
      <!-- Status breakdown -->
      <div class="px-4 py-3 flex flex-col gap-0.5">
        {#each STATUSES.filter(s => statusCounts[s] > 0) as s}
          <span class="text-xs tracking-wide" style="color: {STATUS_COLORS[s]}">
            {statusCounts[s]} {s}
          </span>
        {/each}
      </div>
      <!-- Tracking: empty -->
      <div class="px-4 py-3"></div>
      <!-- Arrives: empty -->
      <div class="px-4 py-3"></div>
      <!-- Build breakdown -->
      <div class="px-4 py-3 flex flex-col gap-0.5">
        {#each BUILD_VERSIONS.filter(v => filtered.some(p => (p.buildVersion || 'v1') === v)) as v}
          <span class="text-xs font-bold tracking-wide" style="color: {BUILD_COLORS[v]}">
            {filtered.filter(p => (p.buildVersion || 'v1') === v).length} {v}
          </span>
        {/each}
      </div>
      <!-- Price total -->
      <div class="px-4 py-3 flex items-center justify-end">
        <span class="text-base font-bold" style="color: var(--bmo-green)">
          ${filteredCost.toFixed(2)}
        </span>
      </div>
    </div>
  </div>

  <!-- ── MOBILE CARDS (< md) ────────────────────────────── -->
  <div class="md:hidden space-y-2">

    <!-- Sort controls -->
    <div class="flex gap-2 flex-wrap mb-3">
      {#each [
        { col: 'name', label: 'NAME' },
        { col: 'status', label: 'STATUS' },
        { col: 'expectedDelivery', label: 'DELIVERY' },
        { col: 'price', label: 'PRICE' },
      ] as h}
        <button onclick={() => toggleSort(h.col)}
                class="text-xs px-2 py-1 border tracking-widest"
                style="border-color: {sortBy === h.col ? 'var(--bmo-green)' : 'var(--bmo-border)'};
                       color: {sortBy === h.col ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
          {h.label} {si(h.col)}
        </button>
      {/each}
    </div>

    {#each sorted as part (part.id)}
      <div class="border" style="border-color: var(--bmo-border)">
        <!-- Card header (tap to expand) -->
        <button type="button" onclick={() => toggle(part.id)}
                class="w-full text-left p-4"
                style="background: {expanded.has(part.id) ? 'var(--bmo-surface)' : 'transparent'}">
          <div class="flex items-start justify-between gap-2 mb-2">
            <span class="text-base font-bold leading-snug" style="color: var(--bmo-text)">{part.name}</span>
            <span class="text-sm font-bold shrink-0 px-2 py-0.5 border"
                  style="color: {STATUS_COLORS[part.status]}; border-color: {STATUS_COLORS[part.status]}30">
              {part.status.toUpperCase()}
            </span>
          </div>
          <div class="flex gap-4 flex-wrap text-sm" style="color: var(--bmo-muted)">
            {#if part.source}<span>{part.source}</span>{/if}
            {#if part.expectedDelivery}
              <span style="color: var(--bmo-text)">· {part.expectedDelivery}</span>
            {/if}
            {#if part.price > 0}
              <span>· ${part.price.toFixed(2)}</span>
            {/if}
          </div>
          {#if part.tracking && isUrl(part.tracking)}
            <div class="mt-2">
              <a href={part.tracking} target="_blank" rel="noopener noreferrer"
                 class="text-sm font-bold" style="color: var(--bmo-green)"
                 onclick={(e) => e.stopPropagation()}>↗ TRACK SHIPMENT</a>
            </div>
          {/if}
        </button>

        <!-- Mobile expanded -->
        {#if expanded.has(part.id)}
          <div class="border-t px-4 pb-4 pt-3" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
            {#if part.role}
              <p class="text-sm leading-relaxed mb-3" style="color: var(--bmo-muted)">{part.role}</p>
            {/if}
            {#if part.notes}
              <p class="text-sm italic mb-3" style="color: #f0a500">⚠ {part.notes}</p>
            {/if}
            <div class="space-y-3">
              <form method="POST" action="?/update" use:enhance class="flex gap-3 items-end flex-wrap">
                <input type="hidden" name="id" value={part.id} />
                <div>
                  <label class="text-xs tracking-widest block mb-1" for="m-status-{part.id}" style="color: var(--bmo-muted)">STATUS</label>
                  <select id="m-status-{part.id}" name="status"
                    onchange={(e) => (e.currentTarget as HTMLSelectElement).closest('form')?.requestSubmit()}
                    class="text-sm px-2 py-1.5 border"
                    style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)">
                    {#each STATUSES as s}
                      <option value={s} selected={s === part.status}>{s}</option>
                    {/each}
                  </select>
                </div>
                <div class="flex-1 min-w-32">
                  <label class="text-xs tracking-widest block mb-1" for="m-exp-{part.id}" style="color: var(--bmo-muted)">EXP. DELIVERY</label>
                  <input id="m-exp-{part.id}" type="text" name="expectedDelivery" value={part.expectedDelivery}
                    placeholder="Mar 13"
                    onblur={(e) => (e.currentTarget as HTMLInputElement).closest('form')?.requestSubmit()}
                    class="text-sm px-2 py-1.5 border w-full"
                    style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)" />
                </div>
              </form>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  </Panel>
  </PanelCanvas>
</div>
