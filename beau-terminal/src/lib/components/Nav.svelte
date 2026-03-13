<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { bumpFontSize, settings } from '$lib/stores/settings.svelte.js';
  import { editModeState } from '$lib/stores/editMode.svelte.js';
  import {
    getNavConfig,
    loadNavConfig,
    updateNavItem,
    reorderNavItem,
    resetNavConfig,
    addNavItem,
    removeNavItem,
    type NavItem,
  } from '$lib/stores/navConfig.svelte.js';

  let collapsed: Record<string, boolean> = $state({});

  onMount(() => {
    loadNavConfig();
  });

  const config = $derived(getNavConfig());
  const editing = $derived(editModeState.active);

  // Inline rename state
  let renamingId = $state<string | null>(null);
  let renameVal = $state('');

  // Add nav item state
  let addingToGroup = $state<string | null>(null);
  let newLabel = $state('');
  let newIcon = $state('◇');
  let newHref = $state('');

  function toggle(heading: string) {
    collapsed[heading] = !collapsed[heading];
  }

  function itemsInGroup(group: string): NavItem[] {
    return config.items
      .filter(i => i.group === group)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  function startRename(item: NavItem) {
    renamingId = item.id;
    renameVal = item.label;
  }

  function commitRename() {
    if (renamingId && renameVal.trim()) {
      updateNavItem(renamingId, { label: renameVal.trim().toUpperCase() });
    }
    renamingId = null;
  }

  function startAdd(group: string) {
    addingToGroup = group;
    newLabel = '';
    newIcon = '◇';
    newHref = '/';
  }

  function commitAdd() {
    if (!addingToGroup || !newLabel.trim() || !newHref.trim()) return;
    const siblings = itemsInGroup(addingToGroup);
    const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(s => s.sortOrder)) : -1;
    addNavItem({
      id: newHref.trim(),
      label: newLabel.trim().toUpperCase(),
      icon: newIcon || '◇',
      group: addingToGroup,
      sortOrder: maxOrder + 1,
      hidden: false,
    });
    addingToGroup = null;
  }
</script>

<nav class="flex flex-col gap-1 p-3 border-r shrink-0"
     style="border-color: var(--bmo-border); background: var(--bmo-surface);
            width: clamp(52px, 12vw, 200px); min-height: 0">

  <!-- Logo -->
  <div class="flex items-center gap-2 mb-4 pb-4 shrink-0" style="border-bottom: 1px solid var(--bmo-border)">
    <div class="flex items-center justify-center w-8 h-8 font-bold text-base shrink-0"
         style="background: var(--bmo-green); color: var(--bmo-bg);
                clip-path: polygon(10% 0%, 90% 0%, 100% 10%, 100% 90%, 90% 100%, 10% 100%, 0% 90%, 0% 10%)">
      B
    </div>
    <div class="hidden lg:block overflow-hidden">
      <div class="text-xs tracking-widest whitespace-nowrap" style="color: var(--bmo-green)">BEAU</div>
      <div class="text-xs whitespace-nowrap" style="color: var(--bmo-muted); letter-spacing: 2px">TERMINAL</div>
    </div>
  </div>

  <!-- Scrollable nav groups -->
  <div class="flex-1 overflow-y-auto min-h-0" style="scrollbar-width: thin; scrollbar-color: var(--bmo-border) transparent">
    {#each config.groups as group}
      <div class="mb-2">
        <button onclick={() => toggle(group)}
                class="hidden lg:flex items-center justify-between w-full text-left px-2 py-1 mb-1 cursor-pointer transition-colors hover:opacity-80"
                style="color: var(--bmo-muted); opacity: 0.6; font-size: 0.6rem; background: none; border: none">
          <span class="tracking-widest">{group}</span>
          <span class="text-xs transition-transform" style="transform: rotate({collapsed[group] ? '-90deg' : '0deg'})">▾</span>
        </button>
        {#if !collapsed[group]}
          {#each itemsInGroup(group) as item (item.id)}
            {@const active = page.url.pathname === item.id}
            {#if !editing && item.hidden}
              <!-- Hidden items not shown in normal mode -->
            {:else if editing}
              <!-- Edit mode: show all items with controls -->
              <div class="flex items-center gap-1 px-1 py-1"
                   style="opacity: {item.hidden ? '0.35' : '1'}">
                <!-- Visibility toggle -->
                <button
                  onclick={() => updateNavItem(item.id, { hidden: !item.hidden })}
                  class="shrink-0 hover:opacity-80 transition-opacity"
                  style="color: {item.hidden ? 'var(--bmo-muted)' : 'var(--bmo-green)'}; font-size: 10px; background: none; border: none; cursor: pointer; width: 16px"
                  title={item.hidden ? 'Show' : 'Hide'}
                >{item.hidden ? '○' : '●'}</button>

                <!-- Icon -->
                <span class="shrink-0" style="font-size: 12px; width: 16px; text-align: center">{item.icon}</span>

                <!-- Label (inline rename or text) -->
                {#if renamingId === item.id}
                  <input
                    type="text"
                    bind:value={renameVal}
                    onblur={commitRename}
                    onkeydown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') renamingId = null; }}
                    class="flex-1 min-w-0 text-xs tracking-widest px-1 py-0.5 border"
                    style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-green); font-family: inherit; text-transform: uppercase"
                  />
                {:else}
                  <span
                    class="hidden lg:inline flex-1 min-w-0 truncate text-xs tracking-widest"
                    style="color: {item.hidden ? 'var(--bmo-muted)' : 'var(--bmo-text)'}; text-decoration: {item.hidden ? 'line-through' : 'none'}"
                  >{item.label}</span>
                {/if}

                <!-- Action buttons -->
                <div class="hidden lg:flex items-center gap-0.5 shrink-0">
                  <button onclick={() => startRename(item)}
                          style="color: var(--bmo-muted); font-size: 9px; background: none; border: none; cursor: pointer"
                          title="Rename">✎</button>
                  <button onclick={() => reorderNavItem(item.id, 'up')}
                          style="color: var(--bmo-muted); font-size: 9px; background: none; border: none; cursor: pointer"
                          title="Move up">▲</button>
                  <button onclick={() => reorderNavItem(item.id, 'down')}
                          style="color: var(--bmo-muted); font-size: 9px; background: none; border: none; cursor: pointer"
                          title="Move down">▼</button>
                  <button onclick={() => { if (confirm(`Remove "${item.label}" from nav?`)) removeNavItem(item.id); }}
                          style="color: var(--bmo-muted); font-size: 9px; background: none; border: none; cursor: pointer"
                          title="Remove">✕</button>
                </div>
              </div>
            {:else}
              <!-- Normal mode -->
              <a href={item.id}
                 class="flex items-center gap-2 px-2 py-2 text-sm tracking-widest transition-all"
                 title={item.label}
                 style="
                   color: {active ? 'var(--bmo-bg)' : 'var(--bmo-muted)'};
                   background: {active ? 'var(--bmo-green)' : 'transparent'};
                   border: 1px solid {active ? 'var(--bmo-green)' : 'transparent'};
                 ">
                <span class="text-base shrink-0">{item.icon}</span>
                <span class="hidden lg:inline whitespace-nowrap overflow-hidden">{item.label}</span>
              </a>
            {/if}
          {/each}

          <!-- Add button in edit mode -->
          {#if editing}
            {#if addingToGroup === group}
              <div class="px-1 py-1 space-y-1">
                <input type="text" bind:value={newLabel} placeholder="LABEL"
                       class="w-full text-xs px-1 py-0.5 border tracking-widest"
                       style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border); font-family: inherit; text-transform: uppercase" />
                <div class="flex gap-1">
                  <input type="text" bind:value={newIcon} placeholder="◇" maxlength="2"
                         class="text-xs px-1 py-0.5 border w-8 text-center"
                         style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border); font-family: inherit" />
                  <input type="text" bind:value={newHref} placeholder="/path"
                         class="flex-1 text-xs px-1 py-0.5 border"
                         style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border); font-family: inherit" />
                </div>
                <div class="flex gap-1">
                  <button onclick={commitAdd}
                          class="text-xs px-2 py-0.5 border tracking-widest"
                          style="border-color: var(--bmo-green); color: var(--bmo-green); background: transparent; cursor: pointer">ADD</button>
                  <button onclick={() => addingToGroup = null}
                          class="text-xs px-2 py-0.5 border"
                          style="border-color: var(--bmo-border); color: var(--bmo-muted); background: transparent; cursor: pointer">✕</button>
                </div>
              </div>
            {:else}
              <button onclick={() => startAdd(group)}
                      class="hidden lg:block w-full text-left px-2 py-1 text-xs tracking-widest hover:opacity-80 transition-opacity"
                      style="color: var(--bmo-muted); opacity: 0.4; background: none; border: none; cursor: pointer">
                + ADD
              </button>
            {/if}
          {/if}
        {/if}
      </div>
    {/each}

    <!-- Reset nav in edit mode -->
    {#if editing}
      <button onclick={resetNavConfig}
              class="hidden lg:block w-full text-left px-2 py-1 mt-2 text-xs tracking-widest hover:opacity-80 transition-opacity"
              style="color: var(--bmo-muted); opacity: 0.4; background: none; border: none; cursor: pointer; border-top: 1px solid var(--bmo-border); padding-top: 8px">
        RESET NAV
      </button>
    {/if}
  </div>

  <!-- Text size quick controls -->
  <div class="pt-3 border-t shrink-0" style="border-color: var(--bmo-border)">
    <div class="hidden lg:flex items-center justify-between mb-1 px-1">
      <span class="text-xs tracking-widest" style="color: var(--bmo-muted)">TEXT</span>
      <span class="text-xs font-bold" style="color: var(--bmo-green)">{settings.fontSize}px</span>
    </div>
    <div class="flex gap-1">
      <button onclick={() => bumpFontSize(-1)}
              title="Decrease text size"
              class="flex-1 py-2 text-sm font-bold border transition-all hover:opacity-80"
              style="border-color: var(--bmo-border); color: var(--bmo-muted); background: transparent">
        A⁻
      </button>
      <button onclick={() => bumpFontSize(1)}
              title="Increase text size"
              class="flex-1 py-2 text-sm font-bold border transition-all hover:opacity-80"
              style="border-color: var(--bmo-border); color: var(--bmo-green); background: transparent">
        A⁺
      </button>
    </div>
  </div>
</nav>
