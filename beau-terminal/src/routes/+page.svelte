<script lang="ts">
  import { onMount } from 'svelte';
  import { beauState } from '$lib/stores/beau.svelte.js';
  import PanelCanvas from '$lib/components/PanelCanvas.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import BmoFace from '$lib/components/BmoFace.svelte';
  import WorkshopProgressWidget from '$lib/widgets/terminal/WorkshopProgressWidget.svelte';
  import BlockedWaitingWidget from '$lib/widgets/terminal/BlockedWaitingWidget.svelte';
  import RecentActivityWidget from '$lib/widgets/terminal/RecentActivityWidget.svelte';
  import BeauVitalsWidget from '$lib/widgets/terminal/BeauVitalsWidget.svelte';
  import NextStepsWidget from '$lib/widgets/terminal/NextStepsWidget.svelte';
  import LastHaikuWidget from '$lib/widgets/terminal/LastHaikuWidget.svelte';
  import type { PageData } from './$types.js';

  let { data }: { data: PageData } = $props();

  let onboarded = $state(true);  // default true to avoid flash during SSR
  onMount(() => {
    onboarded = localStorage.getItem('bmo-onboarded') === 'true';
  });

  let greeting = $derived.by(() => {
    if (beauState.sleepState === 'asleep') return 'beau is resting. the build continues.';
    const hour = new Date().getHours();
    if (hour < 12) return "good morning. here's where things stand.";
    if (hour < 18) return 'afternoon check-in.';
    return "wrapping up. here's the day.";
  });

  let captureText = $state('');
  let captureType = $state<'idea' | 'task' | 'note'>('idea');
  let captureStatus = $state<'idle' | 'ok' | 'err'>('idle');

  async function submitCapture() {
    if (!captureText.trim()) return;
    captureStatus = 'idle';
    const res = await fetch('/api/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: captureText.trim(), type: captureType }),
    });
    if (res.ok) {
      captureText = '';
      captureStatus = 'ok';
      setTimeout(() => { captureStatus = 'idle'; }, 1500);
    } else {
      captureStatus = 'err';
    }
  }
</script>

<!-- Hero strip -->
<div style="display: flex; align-items: center; gap: 1.5rem; padding: 1rem 1.5rem; background: var(--bmo-surface); border-bottom: 1px solid var(--bmo-border);">
  <BmoFace size="standard" />
  <div>
    <div style="color: var(--bmo-text); font-family: 'Courier New', monospace; font-size: 1rem;">{greeting}</div>
    <div style="color: var(--bmo-muted); font-family: 'Courier New', monospace; font-size: 0.75rem; letter-spacing: 2px; margin-top: 0.25rem; text-transform: uppercase;">
      {beauState.mode ?? '—'} · {beauState.emotionalState ?? '—'}
    </div>
  </div>
</div>

<!-- Quick capture bar -->
<div style="display: flex; gap: 0.5rem; padding: 0.75rem 1.5rem; border-bottom: 1px solid var(--bmo-border); font-family: 'Courier New', monospace;">
  <select
    bind:value={captureType}
    style="background: var(--bmo-bg); color: var(--bmo-text); border: 1px solid var(--bmo-border); padding: 0.25rem 0.5rem; font-family: inherit; font-size: 0.75rem; letter-spacing: 1px; cursor: pointer;"
  >
    <option value="idea">IDEA</option>
    <option value="task">TASK</option>
    <option value="note">NOTE</option>
  </select>
  <input
    bind:value={captureText}
    placeholder="capture an idea, task, or note..."
    onkeydown={(e) => { if (e.key === 'Enter') submitCapture(); }}
    style="flex: 1; background: var(--bmo-bg); color: var(--bmo-text); border: 1px solid {captureStatus === 'err' ? '#d63031' : captureStatus === 'ok' ? 'var(--bmo-green)' : 'var(--bmo-border)'}; padding: 0.25rem 0.5rem; font-family: inherit; font-size: 0.75rem;"
  />
  <button
    onclick={submitCapture}
    style="background: var(--bmo-green); color: var(--bmo-bg); border: none; padding: 0.25rem 0.75rem; cursor: pointer; font-family: inherit; font-size: 0.75rem; letter-spacing: 2px; font-weight: bold;"
  >+</button>
</div>

<!-- First-run onboarding hint -->
{#if !onboarded}
  <div style="padding: 0.75rem 1.5rem; color: var(--bmo-muted); font-family: 'Courier New', monospace; font-size: 0.8rem; border-bottom: 1px solid var(--bmo-border); display: flex; justify-content: space-between; align-items: center;">
    <span>tip: press Ctrl+E to customize panels, add widgets, and build custom pages.</span>
    <button onclick={() => { localStorage.setItem('bmo-onboarded', 'true'); onboarded = true; }}
      style="color: var(--bmo-green); background: none; border: 1px solid var(--bmo-green); padding: 0.15rem 0.5rem; cursor: pointer; font-family: inherit; font-size: 0.75rem; letter-spacing: 2px;">
      got it
    </button>
  </div>
{/if}

<!-- Panel grid -->
<PanelCanvas pageId="/">
  <!-- Row 0–1: WORKSHOP PROGRESS (col 0, span 8) -->
  <Panel id="today:workshop-progress" label="WORKSHOP PROGRESS" defaultPosition={{ col: 0, row: 0, colSpan: 8, rowSpan: 2 }}>
    <WorkshopProgressWidget config={{}} data={data.workshopProgress} />
  </Panel>

  <!-- Row 0–1: BLOCKED / WAITING (col 8, span 4) -->
  <Panel id="today:blocked-waiting" label="BLOCKED / WAITING" defaultPosition={{ col: 8, row: 0, colSpan: 4, rowSpan: 2 }}>
    <BlockedWaitingWidget config={{}} data={data.blockedParts} />
  </Panel>

  <!-- Row 2–3: RECENT ACTIVITY (col 0, span 8) -->
  <Panel id="today:recent-activity" label="RECENT ACTIVITY" defaultPosition={{ col: 0, row: 2, colSpan: 8, rowSpan: 2 }}>
    <RecentActivityWidget config={{}} data={data.recentActivity} />
  </Panel>

  <!-- Row 2–3: BEAU VITALS (col 8, span 4) -->
  <Panel id="today:beau-vitals" label="BEAU VITALS" defaultPosition={{ col: 8, row: 2, colSpan: 4, rowSpan: 2 }}>
    <BeauVitalsWidget config={{}} />
  </Panel>

  <!-- Row 4–5: NEXT STEPS (col 0, span 6) -->
  <Panel id="today:next-steps" label="NEXT STEPS" defaultPosition={{ col: 0, row: 4, colSpan: 6, rowSpan: 2 }}>
    <NextStepsWidget config={{}} data={data.nextSteps} />
  </Panel>

  <!-- Row 4–5: LAST HAIKU (col 6, span 6) -->
  <Panel id="today:last-haiku" label="LAST HAIKU" defaultPosition={{ col: 6, row: 4, colSpan: 6, rowSpan: 2 }}>
    <LastHaikuWidget config={{}} />
  </Panel>
</PanelCanvas>
