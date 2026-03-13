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
    addGroup,
    renameGroup,
    removeGroup,
    reorderGroup,
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

  // Group rename state
  let renamingGroup = $state<string | null>(null);
  let groupRenameVal = $state('');

  // Add group state
  let showAddGroup = $state(false);
  let newGroupName = $state('');

  // Custom page creation state
  let creatingPage = $state<string | null>(null);
  let cpName = $state('');
  let cpSlug = $state('');
  let cpIcon = $state('📄');

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

  function startGroupRename(group: string) {
    renamingGroup = group;
    groupRenameVal = group;
  }

  function commitGroupRename() {
    if (renamingGroup && groupRenameVal.trim()) {
      renameGroup(renamingGroup, groupRenameVal.trim().toUpperCase());
    }
    renamingGroup = null;
  }

  function handleAddGroup() {
    if (!newGroupName.trim()) return;
    addGroup(newGroupName.trim().toUpperCase());
    showAddGroup = false;
    newGroupName = '';
  }

  function handleRemoveGroup(group: string) {
    if (config.groups.length <= 1) return;
    if (confirm(`Remove group "${group}"? Items will be moved to ${config.groups.find(g => g !== group)}.`)) {
      removeGroup(group);
    }
  }

  async function handleCreatePage(group: string) {
    if (!cpName.trim() || !cpSlug.trim()) return;
    try {
      const res = await fetch('/api/custom-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cpName.trim(),
          slug: cpSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          icon: cpIcon || '📄',
          groupName: group,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed' }));
        alert(err.message || 'Failed to create page');
        return;
      }
      const page = await res.json();
      // Add to nav
      const siblings = itemsInGroup(group);
      const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(s => s.sortOrder)) : -1;
      addNavItem({
        id: `/custom/${page.slug}`,
        label: cpName.trim().toUpperCase(),
        icon: cpIcon || '📄',
        group,
        sortOrder: maxOrder + 1,
        hidden: false,
      });
      creatingPage = null;
      cpName = '';
      cpSlug = '';
      cpIcon = '📄';
    } catch {
      alert('Failed to create page');
    }
  }

  function autoSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
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
        {#if editing && renamingGroup === group}
          <div class="hidden lg:flex items-center gap-1 px-2 py-1 mb-1">
            <input
              type="text"
              bind:value={groupRenameVal}
              onblur={commitGroupRename}
              onkeydown={(e) => { if (e.key === 'Enter') commitGroupRename(); if (e.key === 'Escape') renamingGroup = null; }}
              class="flex-1 min-w-0 tracking-widest px-1 py-0.5 border"
              style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-green); font-family: inherit; font-size: 0.6rem; text-transform: uppercase"
            />
          </div>
        {:else}
          <div class="hidden lg:flex items-center justify-between w-full px-2 py-1 mb-1"
               style="color: var(--bmo-muted); opacity: 0.6; font-size: 0.6rem">
            <button onclick={() => toggle(group)}
                    class="flex-1 text-left cursor-pointer transition-colors hover:opacity-80"
                    style="background: none; border: none; color: inherit; font-family: inherit; font-size: inherit">
              <span class="tracking-widest">{group}</span>
              <span class="text-xs transition-transform" style="transform: rotate({collapsed[group] ? '-90deg' : '0deg'})">▾</span>
            </button>
            {#if editing}
              <div class="flex items-center gap-0.5 shrink-0">
                <button onclick={() => startGroupRename(group)}
                        style="color: var(--bmo-muted); font-size: 8px; background: none; border: none; cursor: pointer"
                        title="Rename group">✎</button>
                <button onclick={() => reorderGroup(group, 'up')}
                        style="color: var(--bmo-muted); font-size: 8px; background: none; border: none; cursor: pointer"
                        title="Move group up">▲</button>
                <button onclick={() => reorderGroup(group, 'down')}
                        style="color: var(--bmo-muted); font-size: 8px; background: none; border: none; cursor: pointer"
                        title="Move group down">▼</button>
                {#if config.groups.length > 1}
                  <button onclick={() => handleRemoveGroup(group)}
                          style="color: var(--bmo-muted); font-size: 8px; background: none; border: none; cursor: pointer"
                          title="Remove group">✕</button>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
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
              <div class="hidden lg:flex gap-1 px-2 py-1">
                <button onclick={() => startAdd(group)}
                        class="text-xs tracking-widest hover:opacity-80 transition-opacity"
                        style="color: var(--bmo-muted); opacity: 0.4; background: none; border: none; cursor: pointer">
                  + LINK
                </button>
                <button onclick={() => { creatingPage = group; cpName = ''; cpSlug = ''; cpIcon = '📄'; }}
                        class="text-xs tracking-widest hover:opacity-80 transition-opacity"
                        style="color: var(--bmo-muted); opacity: 0.4; background: none; border: none; cursor: pointer">
                  + PAGE
                </button>
              </div>
            {/if}

            <!-- Custom page creation form -->
            {#if creatingPage === group}
              <div class="px-1 py-1 space-y-1">
                <input type="text" bind:value={cpName} placeholder="Page Name"
                       oninput={() => cpSlug = autoSlug(cpName)}
                       class="w-full text-xs px-1 py-0.5 border tracking-widest"
                       style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border); font-family: inherit; text-transform: uppercase" />
                <div class="flex gap-1">
                  <input type="text" bind:value={cpIcon} placeholder="📄" maxlength="2"
                         class="text-xs px-1 py-0.5 border w-8 text-center"
                         style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border); font-family: inherit" />
                  <input type="text" bind:value={cpSlug} placeholder="slug"
                         class="flex-1 text-xs px-1 py-0.5 border"
                         style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border); font-family: inherit" />
                </div>
                <div class="flex gap-1">
                  <button onclick={() => handleCreatePage(group)}
                          class="text-xs px-2 py-0.5 border tracking-widest"
                          style="border-color: var(--bmo-green); color: var(--bmo-green); background: transparent; cursor: pointer">CREATE</button>
                  <button onclick={() => creatingPage = null}
                          class="text-xs px-2 py-0.5 border"
                          style="border-color: var(--bmo-border); color: var(--bmo-muted); background: transparent; cursor: pointer">✕</button>
                </div>
              </div>
            {/if}
          {/if}
        {/if}
      </div>
    {/each}

    <!-- Edit mode: Add Group + Reset Nav -->
    {#if editing}
      {#if showAddGroup}
        <div class="hidden lg:block px-2 py-1 mt-2" style="border-top: 1px solid var(--bmo-border); padding-top: 8px">
          <input type="text" bind:value={newGroupName} placeholder="GROUP NAME"
                 onkeydown={(e) => { if (e.key === 'Enter') handleAddGroup(); if (e.key === 'Escape') showAddGroup = false; }}
                 class="w-full text-xs px-1 py-0.5 border tracking-widest mb-1"
                 style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border); font-family: inherit; text-transform: uppercase; font-size: 0.6rem" />
          <div class="flex gap-1">
            <button onclick={handleAddGroup}
                    class="text-xs px-2 py-0.5 border tracking-widest"
                    style="border-color: var(--bmo-green); color: var(--bmo-green); background: transparent; cursor: pointer; font-size: 0.6rem">ADD</button>
            <button onclick={() => showAddGroup = false}
                    class="text-xs px-2 py-0.5 border"
                    style="border-color: var(--bmo-border); color: var(--bmo-muted); background: transparent; cursor: pointer; font-size: 0.6rem">✕</button>
          </div>
        </div>
      {:else}
        <button onclick={() => { showAddGroup = true; newGroupName = ''; }}
                class="hidden lg:block w-full text-left px-2 py-1 mt-2 text-xs tracking-widest hover:opacity-80 transition-opacity"
                style="color: var(--bmo-muted); opacity: 0.4; background: none; border: none; cursor: pointer; border-top: 1px solid var(--bmo-border); padding-top: 8px; font-size: 0.6rem">
          + GROUP
        </button>
      {/if}
      <button onclick={resetNavConfig}
              class="hidden lg:block w-full text-left px-2 py-1 mt-1 text-xs tracking-widest hover:opacity-80 transition-opacity"
              style="color: var(--bmo-muted); opacity: 0.4; background: none; border: none; cursor: pointer">
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
