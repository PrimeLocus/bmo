<script lang="ts">
  import { enhance } from '$app/forms';
  import PanelCanvas from '$lib/components/PanelCanvas.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();

  const TYPES = ['api', 'mqtt', 'osc', 'pipe', 'hardware', 'custom'];
  const HEALTH_CHECKS = ['none', 'http-get', 'mqtt-ping'];

  let expanded = $state<Set<number>>(new Set());
  let showAddForm = $state(false);
  let testing = $state<Set<number>>(new Set());

  function toggle(id: number) {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    expanded = next;
  }

  const STATUS_COLORS: Record<string, string> = {
    online:  'var(--bmo-green)',
    offline: '#d63031',
    unknown: 'var(--bmo-muted)',
  };

  const STATUS_DOT: Record<string, string> = {
    online:  '●',
    offline: '●',
    unknown: '○',
  };

  const TYPE_COLORS: Record<string, string> = {
    api:      '#74b9ff',
    mqtt:     'var(--bmo-green)',
    osc:      '#a29bfe',
    pipe:     '#f0a500',
    hardware: '#fd79a8',
    custom:   'var(--bmo-muted)',
  };
</script>

<div class="w-full">
  <!-- Header -->
  <div class="mb-5 flex items-end justify-between flex-wrap gap-3">
    <div>
      <h1 class="text-2xl tracking-widest font-bold" style="color: var(--bmo-green)">INTEGRATIONS</h1>
      <p class="text-sm mt-1" style="color: var(--bmo-muted); letter-spacing: 0.1em">
        wiring beau to the world · {data.integrations.length} services
      </p>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-xs tracking-widest" style="color: var(--bmo-muted)">
        {data.integrations.filter(i => i.status === 'online').length} online ·
        {data.integrations.filter(i => i.status === 'offline').length} offline ·
        {data.integrations.filter(i => i.status === 'unknown').length} unknown
      </span>
    </div>
  </div>

  <PanelCanvas pageId="/integrations">
  <Panel id="integrations:grid" label="Integrations Hub" defaultPosition={{ col: 0, row: 0, colSpan: 12, rowSpan: 10 }}>

  <!-- Integration cards grid -->
  <div class="space-y-2">
    {#each data.integrations as integration (integration.id)}
      <div class="border transition-all" style="border-color: {expanded.has(integration.id) ? 'var(--bmo-green)' : 'var(--bmo-border)'}">

        <!-- Card header row -->
        <button
          type="button"
          onclick={() => toggle(integration.id)}
          class="w-full text-left px-4 py-3 flex items-center gap-3 hover:opacity-90 transition-opacity"
          style="background: {expanded.has(integration.id) ? 'var(--bmo-surface)' : 'transparent'}"
        >
          <!-- Status dot -->
          <span class="text-xs shrink-0 font-bold"
                style="color: {STATUS_COLORS[integration.status] ?? STATUS_COLORS.unknown}">
            {STATUS_DOT[integration.status] ?? '○'}
          </span>

          <!-- Icon + Name -->
          <span class="text-base shrink-0">{integration.icon}</span>
          <span class="text-sm font-bold tracking-wide flex-1" style="color: var(--bmo-text)">
            {integration.name}
          </span>

          <!-- Type badge -->
          <span class="text-xs tracking-widest px-1.5 py-0.5 border shrink-0"
                style="color: {TYPE_COLORS[integration.type] ?? 'var(--bmo-muted)'}; border-color: {TYPE_COLORS[integration.type] ?? 'var(--bmo-muted)'}30">
            {integration.type.toUpperCase()}
          </span>

          <!-- Endpoint (truncated) -->
          {#if integration.endpoint}
            <span class="text-xs hidden md:block truncate max-w-xs" style="color: var(--bmo-muted)">
              {integration.endpoint}
            </span>
          {/if}

          <!-- Last seen -->
          {#if integration.lastSeen}
            <span class="text-xs shrink-0 hidden lg:block" style="color: var(--bmo-muted); letter-spacing: 0.05em">
              {integration.lastSeen}
            </span>
          {/if}

          <!-- Expand indicator -->
          <span class="text-xs shrink-0" style="color: var(--bmo-muted)">
            {expanded.has(integration.id) ? '▾' : '▸'}
          </span>
        </button>

        <!-- Expanded edit + test panel -->
        {#if expanded.has(integration.id)}
          <div class="px-5 pb-5 pt-3 border-t" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
            {#if integration.notes}
              <p class="text-sm mb-4 italic" style="color: var(--bmo-muted)">
                ↳ {integration.notes}
              </p>
            {/if}

            <div class="flex gap-4 flex-wrap items-end">

              <!-- Name -->
              <form method="POST" action="?/update" use:enhance>
                <input type="hidden" name="id" value={integration.id} />
                <label class="text-xs tracking-widest block mb-1" for="name-{integration.id}" style="color: var(--bmo-muted)">NAME</label>
                <input id="name-{integration.id}" type="text" name="name" value={integration.name}
                  onblur={(e) => (e.currentTarget as HTMLInputElement).closest('form')?.requestSubmit()}
                  class="text-sm px-2 py-1.5 border w-44"
                  style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)" />
              </form>

              <!-- Icon -->
              <form method="POST" action="?/update" use:enhance>
                <input type="hidden" name="id" value={integration.id} />
                <label class="text-xs tracking-widest block mb-1" for="icon-{integration.id}" style="color: var(--bmo-muted)">ICON</label>
                <input id="icon-{integration.id}" type="text" name="icon" value={integration.icon}
                  onblur={(e) => (e.currentTarget as HTMLInputElement).closest('form')?.requestSubmit()}
                  class="text-sm px-2 py-1.5 border w-16 text-center"
                  style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)" />
              </form>

              <!-- Type -->
              <form method="POST" action="?/update" use:enhance>
                <input type="hidden" name="id" value={integration.id} />
                <label class="text-xs tracking-widest block mb-1" for="type-{integration.id}" style="color: var(--bmo-muted)">TYPE</label>
                <select id="type-{integration.id}" name="type"
                  onchange={(e) => (e.currentTarget as HTMLSelectElement).closest('form')?.requestSubmit()}
                  class="text-sm px-2 py-1.5 border"
                  style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)">
                  {#each TYPES as t}
                    <option value={t} selected={t === integration.type}>{t}</option>
                  {/each}
                </select>
              </form>

              <!-- Health check -->
              <form method="POST" action="?/update" use:enhance>
                <input type="hidden" name="id" value={integration.id} />
                <label class="text-xs tracking-widest block mb-1" for="hc-{integration.id}" style="color: var(--bmo-muted)">HEALTH CHECK</label>
                <select id="hc-{integration.id}" name="healthCheck"
                  onchange={(e) => (e.currentTarget as HTMLSelectElement).closest('form')?.requestSubmit()}
                  class="text-sm px-2 py-1.5 border"
                  style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)">
                  {#each HEALTH_CHECKS as hc}
                    <option value={hc} selected={hc === (integration.healthCheck ?? 'none')}>{hc}</option>
                  {/each}
                </select>
              </form>

              <!-- Endpoint -->
              <form method="POST" action="?/update" use:enhance class="flex-1 min-w-56">
                <input type="hidden" name="id" value={integration.id} />
                <label class="text-xs tracking-widest block mb-1" for="endpoint-{integration.id}" style="color: var(--bmo-muted)">ENDPOINT</label>
                <input id="endpoint-{integration.id}" type="text" name="endpoint"
                  value={integration.endpoint ?? ''}
                  placeholder="e.g. http://localhost:1234"
                  onblur={(e) => (e.currentTarget as HTMLInputElement).closest('form')?.requestSubmit()}
                  class="text-sm px-2 py-1.5 border w-full"
                  style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)" />
              </form>

              <!-- Notes -->
              <form method="POST" action="?/update" use:enhance class="flex-1 min-w-48">
                <input type="hidden" name="id" value={integration.id} />
                <label class="text-xs tracking-widest block mb-1" for="notes-{integration.id}" style="color: var(--bmo-muted)">NOTES</label>
                <input id="notes-{integration.id}" type="text" name="notes"
                  value={integration.notes ?? ''}
                  placeholder="optional notes"
                  onblur={(e) => (e.currentTarget as HTMLInputElement).closest('form')?.requestSubmit()}
                  class="text-sm px-2 py-1.5 border w-full"
                  style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)" />
              </form>
            </div>

            <!-- Action buttons -->
            <div class="flex gap-3 mt-4 items-center flex-wrap">

              <!-- TEST button -->
              <form method="POST" action="?/test"
                    use:enhance={() => {
                      testing = new Set([...testing, integration.id]);
                      return async ({ update }) => {
                        testing = new Set([...testing].filter(x => x !== integration.id));
                        await update();
                      };
                    }}>
                <input type="hidden" name="id" value={integration.id} />
                <button type="submit" disabled={testing.has(integration.id)}
                        class="text-xs px-3 py-1.5 border tracking-widest font-bold hover:opacity-80 transition-opacity"
                        style="border-color: var(--bmo-green); color: var(--bmo-green)">
                  {testing.has(integration.id) ? '...' : '▶ TEST'}
                </button>
              </form>

              <!-- Status display -->
              <span class="text-xs tracking-widest font-bold"
                    style="color: {STATUS_COLORS[integration.status] ?? STATUS_COLORS.unknown}">
                {STATUS_DOT[integration.status] ?? '○'} {integration.status.toUpperCase()}
              </span>

              {#if integration.lastSeen}
                <span class="text-xs" style="color: var(--bmo-muted)">last seen {integration.lastSeen}</span>
              {/if}

              <!-- Spacer -->
              <span class="flex-1"></span>

              <!-- DELETE button -->
              <form method="POST" action="?/delete" use:enhance>
                <input type="hidden" name="id" value={integration.id} />
                <button type="submit"
                        onclick={(e) => { if (!confirm(`Remove ${integration.name}?`)) e.preventDefault(); }}
                        class="text-xs px-3 py-1.5 border tracking-widest hover:opacity-80 transition-opacity"
                        style="border-color: #d63031; color: #d63031">
                  ✕ REMOVE
                </button>
              </form>
            </div>
          </div>
        {/if}
      </div>
    {/each}

    <!-- Add integration button / inline form -->
    {#if !showAddForm}
      <button
        type="button"
        onclick={() => showAddForm = true}
        class="w-full py-3 border-2 border-dashed text-sm tracking-widest hover:opacity-80 transition-opacity"
        style="border-color: var(--bmo-border); color: var(--bmo-muted)">
        + INTEGRATION
      </button>
    {:else}
      <form method="POST" action="?/add"
            use:enhance={() => {
              return async ({ update }) => {
                showAddForm = false;
                await update();
              };
            }}
            class="border p-4 space-y-3"
            style="border-color: var(--bmo-green); background: var(--bmo-surface)">
        <p class="text-xs tracking-widest font-bold" style="color: var(--bmo-green)">+ ADD INTEGRATION</p>

        <div class="flex gap-3 flex-wrap items-end">
          <!-- Icon -->
          <div>
            <label class="text-xs tracking-widest block mb-1" for="add-icon" style="color: var(--bmo-muted)">ICON</label>
            <input id="add-icon" type="text" name="icon" value="⚡" placeholder="⚡"
              class="text-sm px-2 py-1.5 border w-16 text-center"
              style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)" />
          </div>

          <!-- Name -->
          <div class="flex-1 min-w-40">
            <label class="text-xs tracking-widest block mb-1" for="add-name" style="color: var(--bmo-muted)">NAME *</label>
            <input id="add-name" type="text" name="name" required placeholder="My Service"
              class="text-sm px-2 py-1.5 border w-full"
              style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)" />
          </div>

          <!-- Type -->
          <div>
            <label class="text-xs tracking-widest block mb-1" for="add-type" style="color: var(--bmo-muted)">TYPE</label>
            <select id="add-type" name="type"
              class="text-sm px-2 py-1.5 border"
              style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)">
              {#each TYPES as t}
                <option value={t}>{t}</option>
              {/each}
            </select>
          </div>

          <!-- Health Check -->
          <div>
            <label class="text-xs tracking-widest block mb-1" for="add-hc" style="color: var(--bmo-muted)">HEALTH CHECK</label>
            <select id="add-hc" name="healthCheck"
              class="text-sm px-2 py-1.5 border"
              style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)">
              {#each HEALTH_CHECKS as hc}
                <option value={hc}>{hc}</option>
              {/each}
            </select>
          </div>

          <!-- Endpoint -->
          <div class="flex-1 min-w-48">
            <label class="text-xs tracking-widest block mb-1" for="add-endpoint" style="color: var(--bmo-muted)">ENDPOINT</label>
            <input id="add-endpoint" type="text" name="endpoint" placeholder="http://localhost:1234"
              class="text-sm px-2 py-1.5 border w-full"
              style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)" />
          </div>

          <!-- Notes -->
          <div class="flex-1 min-w-40">
            <label class="text-xs tracking-widest block mb-1" for="add-notes" style="color: var(--bmo-muted)">NOTES</label>
            <input id="add-notes" type="text" name="notes" placeholder="optional"
              class="text-sm px-2 py-1.5 border w-full"
              style="background: var(--bmo-bg); color: var(--bmo-text); border-color: var(--bmo-border)" />
          </div>
        </div>

        <div class="flex gap-3 pt-1">
          <button type="submit"
                  class="text-sm px-4 py-1.5 border tracking-widest font-bold hover:opacity-80 transition-opacity"
                  style="border-color: var(--bmo-green); color: var(--bmo-green)">
            + ADD
          </button>
          <button type="button" onclick={() => showAddForm = false}
                  class="text-sm px-4 py-1.5 border tracking-widest hover:opacity-80 transition-opacity"
                  style="border-color: var(--bmo-border); color: var(--bmo-muted)">
            CANCEL
          </button>
        </div>
      </form>
    {/if}
  </div>

  </Panel>
  </PanelCanvas>
</div>
