<script lang="ts">
  import { goto } from '$app/navigation';
  import { getNavConfig } from '$lib/stores/navConfig.svelte.js';
  import { editModeState } from '$lib/stores/editMode.svelte.js';

  let { open = $bindable(false) }: { open: boolean } = $props();
  let query = $state('');
  let results = $state<Array<{ type: string; id: string; label: string; action?: () => void }>>([]);
  let selectedIndex = $state(0);

  // Built-in commands
  const COMMANDS = [
    {
      type: 'command',
      id: 'edit-mode',
      label: 'Edit Mode (Ctrl+E)',
      action: () => { editModeState.active = !editModeState.active; open = false; }
    },
    {
      type: 'command',
      id: 'capture',
      label: 'Quick Capture',
      action: () => { goto('/'); open = false; }
    },
    {
      type: 'command',
      id: 'settings',
      label: 'Settings',
      action: () => { goto('/settings'); open = false; }
    },
  ];

  // Type icons
  const TYPE_ICONS: Record<string, string> = {
    page:    '◈',
    command: '≋',
    part:    '⬡',
    idea:    '✦',
    task:    '◫',
    phase:   '◉',
    step:    '◦',
  };

  // Type group labels
  const TYPE_LABELS: Record<string, string> = {
    page:    'PAGES',
    command: 'COMMANDS',
    part:    'PARTS',
    idea:    'IDEAS',
    task:    'TASKS',
    phase:   'PHASES',
    step:    'STEPS',
  };

  // Client-side nav pages (instant filter)
  function getPageResults(q: string) {
    const config = getNavConfig();
    const lower = q.toLowerCase();
    return config.items
      .filter(item => !item.hidden && (q === '' || item.label.toLowerCase().includes(lower)))
      .map(item => ({ type: 'page', id: item.id, label: item.label }));
  }

  // Server-side search (debounced)
  let debounceTimer: ReturnType<typeof setTimeout>;
  function searchServer(q: string) {
    clearTimeout(debounceTimer);
    if (q.length < 2) return;
    debounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          // Merge with existing client results
          const clientResults = [
            ...getPageResults(q),
            ...COMMANDS.filter(c => c.label.toLowerCase().includes(q.toLowerCase()))
          ];
          results = [...clientResults, ...data.results];
          selectedIndex = 0;
        }
      } catch {
        // Silent fail — server may be offline
      }
    }, 200);
  }

  // Reactive search
  $effect(() => {
    if (!query.trim()) {
      results = [...getPageResults(''), ...COMMANDS];
      selectedIndex = 0;
      return;
    }
    // Instant client results
    const lower = query.toLowerCase();
    results = [
      ...getPageResults(query),
      ...COMMANDS.filter(c => c.label.toLowerCase().includes(lower))
    ];
    selectedIndex = 0;
    // Debounced server search
    searchServer(query);
  });

  function handleSelect(item: typeof results[0]) {
    if (item.action) { item.action(); return; }
    // Navigate based on type
    if (item.type === 'page') { goto(item.id); open = false; }
    else if (item.type === 'part') { goto('/parts'); open = false; }
    else if (item.type === 'idea') { goto('/ideas'); open = false; }
    else if (item.type === 'task') { goto('/todo'); open = false; }
    else if (item.type === 'phase' || item.type === 'step') { goto('/software'); open = false; }
    else { open = false; }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
      scrollSelectedIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      scrollSelectedIntoView();
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      open = false;
    }
  }

  // Scroll selected item into view
  let listEl: HTMLUListElement = $state() as HTMLUListElement;
  function scrollSelectedIntoView() {
    // Run after the DOM update
    setTimeout(() => {
      const el = listEl?.querySelector('[data-selected="true"]');
      el?.scrollIntoView({ block: 'nearest' });
    }, 0);
  }

  // Auto-focus and reset on open
  let inputEl: HTMLInputElement = $state() as HTMLInputElement;
  $effect(() => {
    if (open) {
      query = '';
      selectedIndex = 0;
      setTimeout(() => inputEl?.focus(), 50);
    }
  });

  // Group results by type for display
  const groupedResults = $derived(() => {
    const groups: Array<{ typeLabel: string; items: Array<typeof results[0] & { globalIndex: number }> }> = [];
    let globalIndex = 0;
    const seen = new Set<string>();
    for (const item of results) {
      const typeLabel = TYPE_LABELS[item.type] ?? item.type.toUpperCase();
      if (!seen.has(typeLabel)) {
        seen.add(typeLabel);
        groups.push({ typeLabel, items: [] });
      }
      groups[groups.length - 1].items.push({ ...item, globalIndex: globalIndex++ });
    }
    return groups;
  });
</script>

{#if open}
  <!-- Backdrop -->
  <div
    class="palette-backdrop"
    role="presentation"
    onclick={() => { open = false; }}
  ></div>

  <!-- Modal card -->
  <div
    class="palette-card"
    role="dialog"
    aria-modal="true"
    aria-label="Command palette"
  >
    <!-- Search input -->
    <div class="palette-input-row">
      <span class="palette-search-icon" aria-hidden="true">⌕</span>
      <input
        bind:this={inputEl}
        bind:value={query}
        class="palette-input"
        type="text"
        placeholder="Search pages, commands, parts…"
        autocomplete="off"
        spellcheck="false"
        onkeydown={handleKeydown}
      />
      <kbd class="palette-esc-hint">ESC</kbd>
    </div>

    <!-- Divider -->
    <div class="palette-divider"></div>

    <!-- Results list -->
    {#if results.length > 0}
      <ul bind:this={listEl} class="palette-list" role="listbox">
        {#each groupedResults() as group}
          <!-- Group header -->
          <li class="palette-group-header" role="presentation">
            {group.typeLabel}
          </li>
          <!-- Group items -->
          {#each group.items as item}
            <li
              class="palette-item"
              class:palette-item--selected={selectedIndex === item.globalIndex}
              data-selected={selectedIndex === item.globalIndex ? 'true' : undefined}
              role="option"
              aria-selected={selectedIndex === item.globalIndex}
              onmouseenter={() => { selectedIndex = item.globalIndex; }}
              onclick={() => handleSelect(item)}
              onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') handleSelect(item); }}
            >
              <span class="palette-item-icon" aria-hidden="true">
                {TYPE_ICONS[item.type] ?? '◦'}
              </span>
              <span class="palette-item-label">{item.label}</span>
            </li>
          {/each}
        {/each}
      </ul>
    {:else}
      <div class="palette-empty">No results</div>
    {/if}

    <!-- Footer hint -->
    <div class="palette-footer">
      <span><kbd>↑↓</kbd> navigate</span>
      <span><kbd>↵</kbd> select</span>
      <span><kbd>Esc</kbd> close</span>
    </div>
  </div>
{/if}

<style>
  .palette-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 9000;
    backdrop-filter: blur(2px);
  }

  .palette-card {
    position: fixed;
    top: 15%;
    left: 50%;
    transform: translateX(-50%);
    width: min(640px, calc(100vw - 2rem));
    max-height: 60vh;
    background: var(--bmo-surface);
    border: 1px solid var(--bmo-border);
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    z-index: 9001;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.7);
    font-family: 'Courier New', Courier, monospace;
    overflow: hidden;
  }

  .palette-input-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
  }

  .palette-search-icon {
    color: var(--bmo-muted);
    font-size: 1.1rem;
    flex-shrink: 0;
    user-select: none;
  }

  .palette-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--bmo-text);
    font-family: inherit;
    font-size: 1rem;
    caret-color: var(--bmo-green);
  }

  .palette-input::placeholder {
    color: var(--bmo-muted);
  }

  .palette-esc-hint {
    font-size: 0.65rem;
    color: var(--bmo-muted);
    background: transparent;
    border: 1px solid var(--bmo-border);
    border-radius: 3px;
    padding: 0.1rem 0.35rem;
    font-family: inherit;
    flex-shrink: 0;
    letter-spacing: 0.05em;
  }

  .palette-divider {
    height: 1px;
    background: var(--bmo-border);
    flex-shrink: 0;
  }

  .palette-list {
    list-style: none;
    margin: 0;
    padding: 0.25rem 0;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .palette-list::-webkit-scrollbar {
    width: 4px;
  }
  .palette-list::-webkit-scrollbar-track {
    background: transparent;
  }
  .palette-list::-webkit-scrollbar-thumb {
    background: var(--bmo-border);
    border-radius: 2px;
  }

  .palette-group-header {
    padding: 0.4rem 1rem 0.2rem;
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    color: var(--bmo-muted);
    text-transform: uppercase;
    user-select: none;
  }

  .palette-group-header:not(:first-child) {
    margin-top: 0.25rem;
    border-top: 1px solid var(--bmo-border);
    padding-top: 0.5rem;
  }

  .palette-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.45rem 1rem;
    cursor: pointer;
    transition: background 0.1s;
  }

  .palette-item:hover,
  .palette-item--selected {
    background: color-mix(in srgb, var(--bmo-green) 12%, transparent);
  }

  .palette-item--selected .palette-item-label {
    color: var(--bmo-green);
  }

  .palette-item-icon {
    color: var(--bmo-muted);
    font-size: 0.85rem;
    width: 1rem;
    text-align: center;
    flex-shrink: 0;
    user-select: none;
  }

  .palette-item--selected .palette-item-icon {
    color: var(--bmo-green);
  }

  .palette-item-label {
    color: var(--bmo-text);
    font-size: 0.875rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .palette-empty {
    padding: 1.5rem 1rem;
    text-align: center;
    color: var(--bmo-muted);
    font-size: 0.875rem;
    letter-spacing: 0.05em;
  }

  .palette-footer {
    display: flex;
    gap: 1rem;
    padding: 0.5rem 1rem;
    border-top: 1px solid var(--bmo-border);
    background: color-mix(in srgb, var(--bmo-bg) 60%, transparent);
    flex-shrink: 0;
  }

  .palette-footer span {
    font-size: 0.65rem;
    color: var(--bmo-muted);
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .palette-footer kbd {
    font-family: inherit;
    font-size: 0.6rem;
    color: var(--bmo-muted);
    background: transparent;
    border: 1px solid var(--bmo-border);
    border-radius: 3px;
    padding: 0.1rem 0.3rem;
  }
</style>
