<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();

  const PRIORITIES = ['high', 'medium', 'low'] as const;
  const KINDS = ['docs', 'github', 'video', 'guide'] as const;
  const KIND_COLOR: Record<string, string> = {
    github: 'var(--bmo-green)',
    docs: '#9cdcfe',
    video: '#f0a500',
    guide: 'var(--bmo-muted)',
  };
  const KIND_PREFIX: Record<string, string> = {
    github: 'GH',
    docs: 'DOC',
    video: 'VID',
    guide: '→',
  };
  const PRIORITY_COLORS: Record<string, string> = {
    high: 'var(--bmo-green)',
    medium: '#f0a500',
    low: 'var(--bmo-muted)',
  };

  // Add state
  let newText = $state('');
  let newPriority = $state('medium');

  // Edit state
  let editingId = $state<string | null>(null);
  let editText = $state('');
  let editPriority = $state('medium');
  let editLinks = $state<Array<{ label: string; url: string; kind: string }>>([]);
  let newLinkLabel = $state('');
  let newLinkUrl = $state('');
  let newLinkKind = $state('docs');

  function startEdit(idea: (typeof data.ideas)[number]) {
    editingId = idea.id;
    editText = idea.text;
    editPriority = idea.priority;
    editLinks = idea.links.map(l => ({ ...l }));
    newLinkLabel = '';
    newLinkUrl = '';
    newLinkKind = 'docs';
  }

  function cancelEdit() {
    editingId = null;
  }

  function removeEditLink(i: number) {
    editLinks = editLinks.filter((_, idx) => idx !== i);
  }

  function addEditLink() {
    if (!newLinkLabel.trim() || !newLinkUrl.trim()) return;
    editLinks = [...editLinks, { label: newLinkLabel.trim(), url: newLinkUrl.trim(), kind: newLinkKind }];
    newLinkLabel = '';
    newLinkUrl = '';
  }

  function byPriority(p: string) {
    return data.ideas.filter(i => i.priority === p);
  }
</script>

<div class="h-full flex flex-col">
  <!-- Header -->
  <div class="mb-4 shrink-0">
    <h1 class="text-xl tracking-widest font-bold" style="color: var(--bmo-green)">IDEAS BOARD</h1>
    <p class="text-xs mt-1" style="color: var(--bmo-muted)">
      {data.ideas.filter(i => !i.done).length} open · {data.ideas.filter(i => i.done).length} done
    </p>
  </div>

  <!-- Priority columns — fills remaining space, each column scrolls internally -->
  <div class="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-3 gap-4">
    {#each PRIORITIES as priority}
      {@const items = byPriority(priority)}
      <div class="border flex flex-col overflow-hidden" style="border-color: var(--bmo-border)">
        <!-- Column header -->
        <div class="px-3 py-2 border-b text-xs tracking-widest font-bold shrink-0"
             style="border-color: var(--bmo-border); background: var(--bmo-surface); color: {PRIORITY_COLORS[priority]}">
          {priority.toUpperCase()} · {items.filter(i => !i.done).length}
        </div>
        <!-- Scrollable items -->
        <div class="flex-1 overflow-y-auto divide-y" style="border-color: var(--bmo-border)">
          {#each items as idea (idea.id)}
            <div class="px-3 py-3" style="border-color: var(--bmo-border)">
              {#if editingId === idea.id}
                <!-- Inline edit form -->
                <form method="POST" action="?/update"
                  use:enhance={() => {
                    return async ({ update }) => {
                      await update();
                      editingId = null;
                    };
                  }}>
                  <input type="hidden" name="id" value={idea.id} />
                  <input type="hidden" name="links" value={JSON.stringify(editLinks)} />

                  <textarea name="text" bind:value={editText} rows="3"
                    class="w-full text-xs leading-relaxed resize-none border p-1.5 mb-2 block"
                    style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-green); font-family: inherit"></textarea>

                  <select name="priority" bind:value={editPriority}
                    class="text-xs px-1.5 py-1 border mb-2 w-full"
                    style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border); font-family: inherit">
                    {#each PRIORITIES as p}
                      <option value={p}>{p}</option>
                    {/each}
                  </select>

                  <!-- Existing links -->
                  {#if editLinks.length > 0}
                    <div class="flex flex-col gap-1 mb-2">
                      {#each editLinks as link, i}
                        <div class="flex items-center gap-1">
                          <span class="flex-1 truncate px-1.5 py-0.5 border"
                            style="border-color: {KIND_COLOR[link.kind] ?? 'var(--bmo-border)'}; color: {KIND_COLOR[link.kind] ?? 'var(--bmo-muted)'}; font-size: 0.65rem; letter-spacing: 0.04em">
                            <span style="opacity:0.6">{KIND_PREFIX[link.kind] ?? '↗'}</span> {link.label}
                          </span>
                          <button type="button" onclick={() => removeEditLink(i)}
                            class="text-xs px-1 hover:opacity-70 shrink-0"
                            style="color: var(--bmo-muted)">×</button>
                        </div>
                      {/each}
                    </div>
                  {/if}

                  <!-- Add link row -->
                  <div class="flex gap-1 mb-2">
                    <select bind:value={newLinkKind}
                      class="border px-1 py-0.5 shrink-0"
                      style="background: var(--bmo-bg); color: var(--bmo-muted); border-color: var(--bmo-border); font-size: 0.65rem; width: 3rem; font-family: inherit">
                      {#each KINDS as k}
                        <option value={k}>{KIND_PREFIX[k]}</option>
                      {/each}
                    </select>
                    <input bind:value={newLinkLabel} placeholder="label"
                      class="border px-1.5 py-0.5 flex-1 min-w-0"
                      style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border); font-size: 0.65rem; font-family: inherit" />
                    <input bind:value={newLinkUrl} placeholder="url"
                      class="border px-1.5 py-0.5 flex-1 min-w-0"
                      style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border); font-size: 0.65rem; font-family: inherit" />
                    <button type="button" onclick={addEditLink}
                      class="text-xs px-1.5 border hover:opacity-70 shrink-0"
                      style="border-color: var(--bmo-green); color: var(--bmo-green)">+</button>
                  </div>

                  <div class="flex gap-2">
                    <button type="submit"
                      class="text-xs px-2 py-1 border tracking-widest hover:opacity-80 transition-opacity"
                      style="border-color: var(--bmo-green); color: var(--bmo-green)">SAVE</button>
                    <button type="button" onclick={cancelEdit}
                      class="text-xs px-2 py-1 border hover:opacity-70 transition-opacity"
                      style="border-color: var(--bmo-border); color: var(--bmo-muted)">CANCEL</button>
                  </div>
                </form>
              {:else}
                <!-- Normal view -->
                <div class="flex items-start gap-2">
                  <form method="POST" action="?/toggle" use:enhance class="flex items-start gap-2 flex-1 min-w-0">
                    <input type="hidden" name="id" value={idea.id} />
                    <input type="hidden" name="done" value={String(idea.done)} />
                    <button type="submit"
                      class="mt-0.5 shrink-0 w-4 h-4 border flex items-center justify-center text-xs hover:opacity-70 transition-opacity"
                      style="border-color: {idea.done ? PRIORITY_COLORS[idea.priority] : 'var(--bmo-border)'}; background: {idea.done ? PRIORITY_COLORS[idea.priority] : 'transparent'}; color: var(--bmo-bg)">
                      {#if idea.done}✓{/if}
                    </button>
                    <div class="flex-1 min-w-0">
                      <span class="text-xs leading-relaxed" style="color: {idea.done ? 'var(--bmo-muted)' : 'var(--bmo-text)'}; text-decoration: {idea.done ? 'line-through' : 'none'}">
                        {idea.text}
                      </span>
                      {#if idea.links.length > 0}
                        <div class="flex flex-wrap gap-1.5 mt-1.5">
                          {#each idea.links as link}
                            <a href={link.url} target="_blank" rel="noopener noreferrer"
                              class="inline-flex items-center gap-1 px-1.5 py-0.5 border hover:opacity-80 transition-opacity"
                              style="border-color: {KIND_COLOR[link.kind] ?? 'var(--bmo-border)'}; color: {KIND_COLOR[link.kind] ?? 'var(--bmo-muted)'}; font-size: 0.65rem; letter-spacing: 0.04em">
                              <span style="opacity: 0.6">{KIND_PREFIX[link.kind] ?? '↗'}</span>{link.label}
                            </a>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </form>
                  <!-- Edit + Delete -->
                  <div class="flex gap-1.5 shrink-0">
                    <button type="button" onclick={() => startEdit(idea)}
                      class="text-xs hover:opacity-70 transition-opacity"
                      style="color: var(--bmo-muted)">✎</button>
                    <form method="POST" action="?/delete" use:enhance>
                      <input type="hidden" name="id" value={idea.id} />
                      <button type="submit" class="text-xs hover:opacity-70 transition-opacity"
                        style="color: var(--bmo-muted)">×</button>
                    </form>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
          {#if items.length === 0}
            <div class="px-3 py-4 text-xs" style="color: var(--bmo-muted)">—</div>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- Add idea — always pinned at bottom -->
  <div class="border p-4 mt-4 shrink-0" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
    <div class="text-xs tracking-widest mb-3" style="color: var(--bmo-muted)">ADD IDEA</div>
    <form method="POST" action="?/add" use:enhance onsubmit={() => { newText = ''; newPriority = 'medium'; }} class="flex gap-3 flex-wrap">
      <select name="priority" bind:value={newPriority}
        class="text-xs px-2 py-2 border"
        style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)">
        {#each PRIORITIES as p}
          <option value={p}>{p}</option>
        {/each}
      </select>
      <input type="text" name="text" bind:value={newText} placeholder="new idea..."
        class="text-xs px-3 py-2 border flex-1 min-w-48"
        style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)" />
      <button type="submit"
        class="text-xs px-4 py-2 border tracking-widest hover:opacity-80 transition-opacity"
        style="border-color: var(--bmo-green); color: var(--bmo-green)">
        ADD
      </button>
    </form>
  </div>
</div>
