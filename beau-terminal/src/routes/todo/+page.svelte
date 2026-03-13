<script lang="ts">
  import { enhance } from '$app/forms';
  import PanelCanvas from '$lib/components/PanelCanvas.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();

  const PRIORITIES = ['high', 'medium', 'low'];
  const PRIORITY_COLORS: Record<string, string> = {
    high:   '#d63031',
    medium: '#f0a500',
    low:    'var(--bmo-muted)',
  };

  let newText     = $state('');
  let newSection  = $state('');
  let newPriority = $state('medium');
  let showDone    = $state(true);
  let editingSection = $state<number | null>(null);
  let editSectionVal = $state('');

  const allTodos = $derived(data.todos);

  const sections = $derived([
    '',
    ...([...new Set(allTodos.filter(t => t.section).map(t => t.section))].sort()),
  ]);

  const totalCount   = $derived(allTodos.length);
  const doneCount    = $derived(allTodos.filter(t => t.done).length);
  const pct          = $derived(totalCount ? Math.round((doneCount / totalCount) * 100) : 0);

  function sectionLabel(s: string) { return s || 'UNSORTED'; }

  function todosInSection(section: string) {
    return allTodos
      .filter(t => t.section === section && (showDone || !t.done))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }

  function startEditSection(id: number, current: string) {
    editingSection = id;
    editSectionVal = current;
  }
</script>

<div class="w-full max-w-3xl">

  <!-- Header -->
  <div class="mb-6">
    <div class="flex items-end justify-between gap-3 mb-3">
      <div>
        <h1 class="text-2xl tracking-widest font-bold" style="color: var(--bmo-green)">TODO</h1>
        <p class="text-base mt-1" style="color: var(--bmo-muted)">
          {doneCount} / {totalCount} done
          {#if totalCount > 0}· {pct}%{/if}
        </p>
      </div>
      <div class="flex gap-2">
        <button onclick={() => showDone = !showDone}
                class="text-xs px-3 py-1.5 border tracking-widest transition-all"
                style="border-color: {showDone ? 'var(--bmo-border)' : 'var(--bmo-green)'};
                       color: {showDone ? 'var(--bmo-muted)' : 'var(--bmo-green)'}">
          {showDone ? 'HIDE DONE' : 'SHOW DONE'}
        </button>
        {#if doneCount > 0}
          <form method="POST" action="?/clearDone" use:enhance>
            <button type="submit"
                    class="text-xs px-3 py-1.5 border tracking-widest"
                    style="border-color: var(--bmo-border); color: var(--bmo-muted)">
              CLEAR DONE
            </button>
          </form>
        {/if}
      </div>
    </div>

    <!-- Progress bar -->
    {#if totalCount > 0}
      <div class="h-1 w-full" style="background: var(--bmo-border)">
        <div class="h-full transition-all" style="width: {pct}%; background: var(--bmo-green)"></div>
      </div>
    {/if}
  </div>

  <PanelCanvas pageId="/todo">
  <Panel id="todo:tasks" label="Tasks" defaultPosition={{ col: 0, row: 0, colSpan: 12, rowSpan: 6 }}>

  <!-- Add form -->
  <form method="POST" action="?/add" use:enhance={() => {
    return async ({ update }) => {
      await update();
      newText = '';
    };
  }} class="mb-8 p-4 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
    <p class="text-xs tracking-widest mb-3" style="color: var(--bmo-muted)">NEW TASK</p>
    <div class="flex gap-3 flex-wrap items-end">
      <div class="flex-1 min-w-48">
        <label class="text-xs tracking-widest block mb-1" for="todo-text" style="color: var(--bmo-muted)">TASK</label>
        <input id="todo-text" type="text" name="text" bind:value={newText}
               placeholder="what needs doing..."
               class="w-full text-sm px-3 py-2 border"
               style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)" />
      </div>
      <div class="w-36">
        <label class="text-xs tracking-widest block mb-1" for="todo-section" style="color: var(--bmo-muted)">SECTION</label>
        <input id="todo-section" type="text" name="section" bind:value={newSection}
               list="section-options"
               placeholder="e.g. Hardware"
               class="w-full text-sm px-3 py-2 border"
               style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)" />
        <datalist id="section-options">
          {#each sections.filter(s => s) as s}
            <option value={s}>{s}</option>
          {/each}
        </datalist>
      </div>
      <div>
        <label class="text-xs tracking-widest block mb-1" for="todo-priority" style="color: var(--bmo-muted)">PRIORITY</label>
        <select id="todo-priority" name="priority" bind:value={newPriority}
                class="text-sm px-3 py-2 border"
                style="background: var(--bmo-bg); color: {PRIORITY_COLORS[newPriority]}; border-color: var(--bmo-border)">
          {#each PRIORITIES as p}
            <option value={p}>{p}</option>
          {/each}
        </select>
      </div>
      <button type="submit" disabled={!newText.trim()}
              class="text-sm px-4 py-2 border tracking-widest transition-all"
              style="border-color: var(--bmo-green); color: var(--bmo-green);
                     opacity: {newText.trim() ? '1' : '0.4'}">
        + ADD
      </button>
    </div>
  </form>

  <!-- Sections -->
  {#each sections as section}
    {@const items = todosInSection(section)}
    {#if items.length > 0 || (section === '' && allTodos.some(t => t.section === ''))}
      {@const allItems = allTodos.filter(t => t.section === section)}
      {@const sectionDone = allItems.filter(t => t.done).length}

      <div class="mb-6">
        <!-- Section header -->
        <div class="flex items-center gap-3 mb-2 pb-2 border-b" style="border-color: var(--bmo-border)">
          <span class="text-xs tracking-widest font-bold" style="color: var(--bmo-muted)">
            {sectionLabel(section)}
          </span>
          <span class="text-xs" style="color: var(--bmo-border)">
            {sectionDone}/{allItems.length}
          </span>
          {#if allItems.length > 0}
            <div class="flex-1 h-px" style="background: var(--bmo-border); max-width: 120px;">
              <div class="h-full" style="width: {Math.round(sectionDone/allItems.length*100)}%; background: var(--bmo-green); transition: width 0.3s"></div>
            </div>
          {/if}
        </div>

        <!-- Tasks -->
        <div class="space-y-0.5">
          {#each items as todo (todo.id)}
            <div class="flex items-start gap-3 px-3 py-2.5 group border-b"
                 style="border-color: var(--bmo-border)20;
                        background: {todo.done ? 'transparent' : 'transparent'}">

              <!-- Priority dot -->
              <div class="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
                   style="background: {todo.done ? 'var(--bmo-border)' : PRIORITY_COLORS[todo.priority]}"></div>

              <!-- Toggle checkbox -->
              <form method="POST" action="?/toggle" use:enhance class="shrink-0 mt-0.5">
                <input type="hidden" name="id" value={todo.id} />
                <button type="submit"
                        class="w-4 h-4 border flex items-center justify-center text-xs transition-all"
                        style="border-color: {todo.done ? 'var(--bmo-muted)' : 'var(--bmo-green)'};
                               background: {todo.done ? 'var(--bmo-surface)' : 'transparent'};
                               color: var(--bmo-green)">
                  {todo.done ? '✓' : ''}
                </button>
              </form>

              <!-- Text -->
              <span class="flex-1 text-base leading-snug"
                    style="color: {todo.done ? 'var(--bmo-muted)' : 'var(--bmo-text)'};
                           text-decoration: {todo.done ? 'line-through' : 'none'}">
                {todo.text}
              </span>

              <!-- Section reassign (hover) -->
              {#if editingSection === todo.id}
                <form method="POST" action="?/updateSection" use:enhance={() => {
                  return async ({ update }) => { await update(); editingSection = null; };
                }} class="flex gap-1">
                  <input type="hidden" name="id" value={todo.id} />
                  <input type="text" name="section" bind:value={editSectionVal}
                         list="section-options"
                         class="text-xs px-1.5 py-0.5 border w-24"
                         style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)" />
                  <button type="submit" class="text-xs px-1.5 border" style="border-color: var(--bmo-green); color: var(--bmo-green)">✓</button>
                  <button type="button" onclick={() => editingSection = null}
                          class="text-xs px-1.5 border" style="border-color: var(--bmo-border); color: var(--bmo-muted)">✕</button>
                </form>
              {:else}
                <button type="button"
                        onclick={() => startEditSection(todo.id, todo.section)}
                        class="text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        style="color: var(--bmo-muted)">
                  ⊞
                </button>
              {/if}

              <!-- Delete -->
              <form method="POST" action="?/delete" use:enhance>
                <input type="hidden" name="id" value={todo.id} />
                <button type="submit"
                        class="text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        style="color: var(--bmo-muted)">
                  ✕
                </button>
              </form>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/each}

  {#if totalCount === 0}
    <p class="text-sm" style="color: var(--bmo-muted)">no tasks yet — add one above</p>
  {/if}

  </Panel>
  </PanelCanvas>
</div>
