<script lang="ts">
  interface LinkEditorProps {
    sourceType: string;
    sourceId: string;
  }

  const { sourceType, sourceId }: LinkEditorProps = $props();

  type EntityLink = {
    id: number;
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
    relationship: string;
    createdAt?: string;
  };

  type SearchResult = {
    type: string;
    id: string;
    label: string;
  };

  const RELATIONSHIPS = ['relates-to', 'blocks', 'inspired-by', 'used-in'] as const;

  const ENTITY_ICONS: Record<string, string> = {
    part: '⬡',
    step: '◉',
    idea: '✦',
    task: '◫',
    phase: '⬢',
    page: '⊞',
  };

  const ENTITY_COLORS: Record<string, string> = {
    part:    '#74b9ff',
    step:    'var(--bmo-green)',
    idea:    '#a29bfe',
    task:    '#f0a500',
    phase:   'var(--bmo-muted)',
    page:    '#fd79a8',
  };

  const REL_COLORS: Record<string, string> = {
    'blocks':      '#d63031',
    'relates-to':  'var(--bmo-muted)',
    'inspired-by': '#a29bfe',
    'used-in':     'var(--bmo-green)',
  };

  let links = $state<EntityLink[]>([]);
  let loading = $state(false);
  let showAdd = $state(false);
  let searchQuery = $state('');
  let searchResults = $state<SearchResult[]>([]);
  let searching = $state(false);
  let selectedResult = $state<SearchResult | null>(null);
  let selectedRelationship = $state<string>('relates-to');
  let saving = $state(false);
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (!sourceType || !sourceId) return;
    loading = true;
    fetch(`/api/entity-links?sourceType=${encodeURIComponent(sourceType)}&sourceId=${encodeURIComponent(sourceId)}`)
      .then(r => r.json())
      .then((d: { links: EntityLink[] }) => {
        links = d.links ?? [];
      })
      .catch(() => { links = []; })
      .finally(() => { loading = false; });
  });

  function handleSearchInput() {
    if (searchTimeout) clearTimeout(searchTimeout);
    if (searchQuery.trim().length < 2) {
      searchResults = [];
      return;
    }
    searchTimeout = setTimeout(() => {
      searching = true;
      fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`)
        .then(r => r.json())
        .then((d: { results: SearchResult[] }) => {
          // Filter out self
          searchResults = (d.results ?? []).filter(
            r => !(r.type === sourceType && r.id === sourceId)
          );
        })
        .catch(() => { searchResults = []; })
        .finally(() => { searching = false; });
    }, 250);
  }

  function selectResult(r: SearchResult) {
    selectedResult = r;
    searchQuery = r.label;
    searchResults = [];
  }

  async function saveLink() {
    if (!selectedResult) return;
    saving = true;
    try {
      const res = await fetch('/api/entity-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType,
          sourceId,
          targetType: selectedResult.type,
          targetId: selectedResult.id,
          relationship: selectedRelationship,
        }),
      });
      if (res.ok) {
        // Refresh links
        const fresh = await fetch(
          `/api/entity-links?sourceType=${encodeURIComponent(sourceType)}&sourceId=${encodeURIComponent(sourceId)}`
        );
        const d = await fresh.json() as { links: EntityLink[] };
        links = d.links ?? [];
        // Reset form
        showAdd = false;
        searchQuery = '';
        searchResults = [];
        selectedResult = null;
        selectedRelationship = 'relates-to';
      }
    } catch {
      // silently fail
    } finally {
      saving = false;
    }
  }

  async function deleteLink(id: number) {
    try {
      await fetch(`/api/entity-links?id=${id}`, { method: 'DELETE' });
      links = links.filter(l => l.id !== id);
    } catch {
      // silently fail
    }
  }

  function cancelAdd() {
    showAdd = false;
    searchQuery = '';
    searchResults = [];
    selectedResult = null;
    selectedRelationship = 'relates-to';
  }
</script>

<div class="mt-3 pt-3 border-t" style="border-color: var(--bmo-border)">
  <div class="flex items-center gap-2 mb-2">
    <span class="text-xs tracking-widest" style="color: var(--bmo-muted)">LINKS</span>
    {#if loading}
      <span class="text-xs" style="color: var(--bmo-muted)">...</span>
    {/if}
  </div>

  <!-- Existing link pills -->
  {#if links.length > 0}
    <div class="flex flex-wrap gap-1.5 mb-2">
      {#each links as link (link.id)}
        {@const icon = ENTITY_ICONS[link.targetType] ?? '○'}
        {@const color = ENTITY_COLORS[link.targetType] ?? 'var(--bmo-muted)'}
        {@const relColor = REL_COLORS[link.relationship] ?? 'var(--bmo-muted)'}
        <span class="inline-flex items-center gap-1 px-1.5 py-0.5 border" style="border-color: {color}30; background: {color}10">
          <span style="color: {color}; font-size: 0.6rem">{icon}</span>
          <span class="text-xs" style="color: {color}; font-size: 0.65rem">{link.targetType}</span>
          <span class="text-xs" style="color: {relColor}; font-size: 0.6rem; opacity: 0.7">·{link.relationship}·</span>
          <span class="text-xs truncate max-w-24" style="color: var(--bmo-text); font-size: 0.65rem">{link.targetId}</span>
          <button
            type="button"
            onclick={() => deleteLink(link.id)}
            class="ml-0.5 hover:opacity-70 transition-opacity"
            style="color: var(--bmo-muted); font-size: 0.6rem; line-height: 1"
            title="Remove link"
          >✕</button>
        </span>
      {/each}
    </div>
  {/if}

  <!-- Add link UI -->
  {#if showAdd}
    <div class="border p-2 mt-1" style="border-color: var(--bmo-border); background: var(--bmo-bg)">
      <!-- Type-ahead search -->
      <div class="relative mb-2">
        <input
          type="text"
          placeholder="search entities..."
          bind:value={searchQuery}
          oninput={handleSearchInput}
          class="w-full text-xs px-2 py-1.5 border"
          style="background: var(--bmo-surface); color: var(--bmo-text); border-color: var(--bmo-border); font-family: inherit"
        />
        {#if searching}
          <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style="color: var(--bmo-muted)">...</span>
        {/if}
        {#if searchResults.length > 0}
          <div class="absolute left-0 right-0 top-full z-50 border border-t-0 max-h-40 overflow-y-auto"
               style="background: var(--bmo-surface); border-color: var(--bmo-border)">
            {#each searchResults as r}
              {@const icon = ENTITY_ICONS[r.type] ?? '○'}
              {@const color = ENTITY_COLORS[r.type] ?? 'var(--bmo-muted)'}
              <button
                type="button"
                onclick={() => selectResult(r)}
                class="w-full text-left flex items-center gap-2 px-2 py-1.5 hover:opacity-80 transition-opacity border-b"
                style="border-color: var(--bmo-border)"
              >
                <span style="color: {color}; font-size: 0.65rem; flex-shrink: 0">{icon} {r.type}</span>
                <span class="text-xs truncate" style="color: var(--bmo-text); font-family: inherit">{r.label}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Selected entity + relationship row -->
      {#if selectedResult}
        {@const icon = ENTITY_ICONS[selectedResult.type] ?? '○'}
        {@const color = ENTITY_COLORS[selectedResult.type] ?? 'var(--bmo-muted)'}
        <div class="flex items-center gap-2 mb-2 flex-wrap">
          <span class="text-xs px-1.5 py-0.5 border" style="border-color: {color}40; color: {color}; font-family: inherit">
            {icon} {selectedResult.type}: {selectedResult.label.substring(0, 40)}
          </span>
          <select
            bind:value={selectedRelationship}
            class="text-xs px-1.5 py-0.5 border"
            style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border); font-family: inherit"
          >
            {#each RELATIONSHIPS as rel}
              <option value={rel}>{rel}</option>
            {/each}
          </select>
        </div>
      {/if}

      <div class="flex gap-2">
        <button
          type="button"
          onclick={saveLink}
          disabled={!selectedResult || saving}
          class="text-xs px-2 py-1 border tracking-widest hover:opacity-80 transition-opacity"
          style="border-color: {selectedResult && !saving ? 'var(--bmo-green)' : 'var(--bmo-border)'}; color: {selectedResult && !saving ? 'var(--bmo-green)' : 'var(--bmo-muted)'}; opacity: {!selectedResult || saving ? '0.5' : '1'}"
        >{saving ? '...' : 'LINK'}</button>
        <button
          type="button"
          onclick={cancelAdd}
          class="text-xs px-2 py-1 border hover:opacity-70 transition-opacity"
          style="border-color: var(--bmo-border); color: var(--bmo-muted)"
        >CANCEL</button>
      </div>
    </div>
  {:else}
    <button
      type="button"
      onclick={() => { showAdd = true; }}
      class="text-xs px-2 py-1 border tracking-widest hover:opacity-80 transition-opacity"
      style="border-color: var(--bmo-border); color: var(--bmo-muted)"
    >+ LINK</button>
  {/if}
</div>
