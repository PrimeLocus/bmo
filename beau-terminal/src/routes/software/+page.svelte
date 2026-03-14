<script lang="ts">
  import { enhance } from '$app/forms';
  import PanelCanvas from '$lib/components/PanelCanvas.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import LinkEditor from '$lib/components/LinkEditor.svelte';
  import type { PageData } from './$types.js';

  const { data }: { data: PageData } = $props();

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

  const allSteps = $derived(data.phases.flatMap(p => p.steps));
  const totalDone = $derived(allSteps.filter(s => s.done).length);
  const totalPct = $derived(allSteps.length > 0 ? Math.round((totalDone / allSteps.length) * 100) : 0);

  let collapsed = $state<Set<number>>(new Set());
  function togglePhase(id: number) {
    const next = new Set(collapsed);
    next.has(id) ? next.delete(id) : next.add(id);
    collapsed = next;
  }

  // Blocked step IDs: steps that have an incoming 'blocks' entity link
  const blockedStepIds = $derived(new Set(data.stepLinks.map((l: { targetId: string }) => l.targetId)));

  let expandedStepLinks = $state<Set<string>>(new Set());
  function toggleStepLinks(id: string) {
    const next = new Set(expandedStepLinks);
    next.has(id) ? next.delete(id) : next.add(id);
    expandedStepLinks = next;
  }
</script>

<div>
  <div class="mb-6">
    <h1 class="text-xl tracking-widest font-bold" style="color: var(--bmo-green)">SOFTWARE BUILD</h1>
    <p class="text-xs mt-1" style="color: var(--bmo-muted)">{totalDone} / {allSteps.length} steps · {totalPct}%</p>
  </div>

  <!-- Overall progress -->
  <div class="mb-6">
    <div class="h-1" style="background: var(--bmo-border); border-radius: 1px">
      <div class="h-1 transition-all" style="width: {totalPct}%; background: var(--bmo-green); border-radius: 1px"></div>
    </div>
  </div>

  <PanelCanvas pageId="/software">
  <Panel id="software:build" label="Software Build" defaultPosition={{ col: 0, row: 0, colSpan: 12, rowSpan: 6 }}>

  <!-- Phases -->
  <div class="space-y-3">
    {#each data.phases as phase (phase.id)}
      {@const done = phase.steps.filter(s => s.done).length}
      {@const pct = phase.steps.length > 0 ? Math.round((done / phase.steps.length) * 100) : 0}
      {@const isOpen = !collapsed.has(phase.id)}

      <div class="border" style="border-color: var(--bmo-border)">
        <!-- Phase header -->
        <button
          type="button"
          onclick={() => togglePhase(phase.id)}
          class="w-full flex items-center justify-between px-4 py-3 text-left hover:opacity-80 transition-opacity"
          style="background: var(--bmo-surface)"
        >
          <div class="flex items-center gap-3">
            <span class="text-xs" style="color: {pct === 100 ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">{isOpen ? '▾' : '▸'}</span>
            <span class="text-xs tracking-widest font-bold" style="color: {pct === 100 ? 'var(--bmo-green)' : 'var(--bmo-text)'}">{phase.phase}</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs" style="color: var(--bmo-muted)">{done}/{phase.steps.length}</span>
            <div class="w-24 h-1" style="background: var(--bmo-border); border-radius: 1px">
              <div class="h-1 transition-all" style="width: {pct}%; background: {pct === 100 ? 'var(--bmo-green)' : 'var(--bmo-muted)'}; border-radius: 1px"></div>
            </div>
          </div>
        </button>

        <!-- Steps -->
        {#if isOpen}
          <div class="border-t" style="border-color: var(--bmo-border)">
            {#each phase.steps as step (step.id)}
              {@const isBlocked = blockedStepIds.has(step.id)}
              <div class="border-b group" style="border-color: var(--bmo-border)">
                <div class="flex items-start gap-3 px-4 py-2">
                  <form method="POST" action="?/toggle" use:enhance class="flex items-start gap-3 flex-1">
                    <input type="hidden" name="id" value={step.id} />
                    <input type="hidden" name="done" value={String(step.done)} />
                    <button type="submit" class="mt-0.5 shrink-0 w-4 h-4 border flex items-center justify-center text-xs hover:opacity-70 transition-opacity"
                            style="border-color: {step.done ? 'var(--bmo-green)' : 'var(--bmo-border)'}; background: {step.done ? 'var(--bmo-green)' : 'transparent'}; color: var(--bmo-bg)">
                      {#if step.done}✓{/if}
                    </button>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-xs leading-relaxed" style="color: {step.done ? 'var(--bmo-muted)' : 'var(--bmo-text)'}; text-decoration: {step.done ? 'line-through' : 'none'}">
                          {step.text}
                        </span>
                        {#if isBlocked}
                          <span class="text-xs px-1 py-0.5 border tracking-widest shrink-0"
                                style="border-color: #d6303140; color: #d63031; font-size: 0.6rem">
                            BLOCKED
                          </span>
                        {/if}
                      </div>
                      {#if step.links.length > 0}
                        <div class="flex flex-wrap gap-2 mt-1.5">
                          {#each step.links as link}
                            <a href={link.url} target="_blank" rel="noopener noreferrer"
                               class="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 border hover:opacity-80 transition-opacity"
                               style="border-color: {KIND_COLOR[link.kind] ?? 'var(--bmo-border)'}; color: {KIND_COLOR[link.kind] ?? 'var(--bmo-muted)'}; font-size: 0.65rem; letter-spacing: 0.04em">
                              <span style="opacity: 0.6">{KIND_PREFIX[link.kind] ?? '↗'}</span>{link.label}
                            </a>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </form>
                  <!-- Links toggle (shown on hover) -->
                  <button type="button"
                          onclick={() => toggleStepLinks(step.id)}
                          class="text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
                          title="Entity links"
                          style="color: {expandedStepLinks.has(step.id) ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
                    ⛓
                  </button>
                </div>
                {#if expandedStepLinks.has(step.id)}
                  <div class="px-4 pb-3">
                    <LinkEditor sourceType="step" sourceId={step.id} />
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  </Panel>
  </PanelCanvas>
</div>
