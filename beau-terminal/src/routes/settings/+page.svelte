<script lang="ts">
  import {
    settings, updateSettings, resetSettings,
    SIZE_PRESETS, DEFAULTS,
  } from '$lib/stores/settings.svelte.js';
</script>

<div class="w-full max-w-2xl">

  <!-- Header — deliberately large -->
  <div class="mb-10">
    <h1 class="tracking-widest font-bold mb-2" style="font-size: 2rem; color: var(--bmo-green)">
      DISPLAY SETTINGS
    </h1>
    <p style="color: var(--bmo-muted)">Changes apply instantly and persist across sessions.</p>
  </div>

  <!-- ── TEXT SCALE ─────────────────────────────────────── -->
  <section class="mb-10 pb-10 border-b" style="border-color: var(--bmo-border)">
    <h2 class="tracking-widest font-bold mb-6" style="font-size: 1.1rem; color: var(--bmo-muted)">
      TEXT SCALE
    </h2>

    <!-- Preset buttons — big, chunky, impossible to miss -->
    <div class="flex gap-3 mb-6 flex-wrap">
      {#each SIZE_PRESETS as preset}
        {@const active = settings.fontSize === preset.value}
        <button
          onclick={() => updateSettings({ fontSize: preset.value })}
          class="border-2 font-bold tracking-widest transition-all"
          style="
            padding: 1rem 1.5rem;
            font-size: {preset.value}px;
            border-color: {active ? 'var(--bmo-green)' : 'var(--bmo-border)'};
            color: {active ? 'var(--bmo-bg)' : 'var(--bmo-text)'};
            background: {active ? 'var(--bmo-green)' : 'transparent'};
            min-width: 5rem;
          "
        >
          {preset.label}
          <div style="font-size: 0.65em; opacity: 0.7; margin-top: 0.2em">{preset.value}px</div>
        </button>
      {/each}
    </div>

    <!-- Fine-tune slider -->
    <div class="mb-3">
      <div class="flex items-center justify-between mb-3">
        <span style="color: var(--bmo-muted)">Fine-tune</span>
        <span class="font-bold" style="color: var(--bmo-green); font-size: 1.3em">
          {settings.fontSize}px
        </span>
      </div>
      <input
        type="range" min="14" max="32" step="1"
        value={settings.fontSize}
        oninput={(e) => updateSettings({ fontSize: Number((e.currentTarget as HTMLInputElement).value) })}
        class="w-full cursor-pointer"
        style="height: 8px; accent-color: var(--bmo-green)"
      />
      <div class="flex justify-between mt-1" style="color: var(--bmo-muted); font-size: 0.75em">
        <span>14px smallest</span>
        <span>32px largest</span>
      </div>
    </div>

    <!-- Live preview -->
    <div class="mt-6 p-5 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="mb-1" style="color: var(--bmo-muted); font-size: 0.7em; letter-spacing: 0.1em">PREVIEW</div>
      <div class="font-bold mb-1" style="color: var(--bmo-green)">RASPBERRY PI 5 16GB</div>
      <div style="color: var(--bmo-text)">Core component · PiShop.us · SHIPPED · Mar 12–13</div>
      <div class="mt-2" style="color: var(--bmo-muted)">
        Expected delivery based on USPS Priority Mail tracking data.
      </div>
    </div>
  </section>

  <!-- ── CONTRAST ───────────────────────────────────────── -->
  <section class="mb-10 pb-10 border-b" style="border-color: var(--bmo-border)">
    <h2 class="tracking-widest font-bold mb-2" style="font-size: 1.1rem; color: var(--bmo-muted)">
      CONTRAST
    </h2>
    <p class="mb-6" style="color: var(--bmo-muted); font-size: 0.85em">
      High contrast brightens dim/muted text — helpful if secondary labels are hard to read.
    </p>
    <div class="flex gap-3">
      {#each [
        { value: 'standard', label: 'STANDARD', desc: 'Default terminal look' },
        { value: 'high',     label: 'HIGH',     desc: 'Brighter muted text' },
      ] as opt}
        {@const active = settings.contrast === opt.value}
        <button
          onclick={() => updateSettings({ contrast: opt.value as 'standard' | 'high' })}
          class="flex-1 border-2 text-left transition-all"
          style="
            padding: 1.25rem 1.5rem;
            border-color: {active ? 'var(--bmo-green)' : 'var(--bmo-border)'};
            background: {active ? 'var(--bmo-green)' : 'transparent'};
          "
        >
          <div class="font-bold tracking-widest mb-1"
               style="color: {active ? 'var(--bmo-bg)' : 'var(--bmo-text)'}">
            {opt.label}
          </div>
          <div style="color: {active ? 'var(--bmo-bg)' : 'var(--bmo-muted)'}; font-size: 0.8em">
            {opt.desc}
          </div>
        </button>
      {/each}
    </div>
  </section>

  <!-- ── FONT WEIGHT ────────────────────────────────────── -->
  <section class="mb-10 pb-10 border-b" style="border-color: var(--bmo-border)">
    <h2 class="tracking-widest font-bold mb-2" style="font-size: 1.1rem; color: var(--bmo-muted)">
      FONT WEIGHT
    </h2>
    <p class="mb-6" style="color: var(--bmo-muted); font-size: 0.85em">
      Courier New is thin by default. Bold makes every character heavier and sharper.
    </p>
    <div class="flex gap-3">
      {#each [
        { value: '400', label: 'NORMAL',  desc: 'Courier New standard weight' },
        { value: '600', label: 'BOLD',    desc: 'Thicker, sharper characters' },
      ] as opt}
        {@const active = settings.fontWeight === opt.value}
        <button
          onclick={() => updateSettings({ fontWeight: opt.value as '400' | '600' })}
          class="flex-1 border-2 text-left transition-all"
          style="
            padding: 1.25rem 1.5rem;
            font-weight: {opt.value};
            border-color: {active ? 'var(--bmo-green)' : 'var(--bmo-border)'};
            background: {active ? 'var(--bmo-green)' : 'transparent'};
          "
        >
          <div class="tracking-widest mb-1"
               style="color: {active ? 'var(--bmo-bg)' : 'var(--bmo-text)'}">
            {opt.label}
          </div>
          <div style="color: {active ? 'var(--bmo-bg)' : 'var(--bmo-muted)'}; font-size: 0.8em">
            {opt.desc}
          </div>
        </button>
      {/each}
    </div>
  </section>

  <!-- ── LINE HEIGHT ────────────────────────────────────── -->
  <section class="mb-10 pb-10 border-b" style="border-color: var(--bmo-border)">
    <h2 class="tracking-widest font-bold mb-2" style="font-size: 1.1rem; color: var(--bmo-muted)">
      LINE SPACING
    </h2>
    <p class="mb-6" style="color: var(--bmo-muted); font-size: 0.85em">
      More space between lines reduces the "wall of text" effect.
    </p>
    <div class="flex gap-3">
      {#each [
        { value: '1.5', label: 'TIGHT',       desc: 'Dense, compact reading' },
        { value: '1.7', label: 'COMFORTABLE', desc: 'Balanced — recommended' },
        { value: '1.9', label: 'LOOSE',       desc: 'Maximum breathing room' },
      ] as opt}
        {@const active = settings.lineHeight === opt.value}
        <button
          onclick={() => updateSettings({ lineHeight: opt.value as '1.5' | '1.7' | '1.9' })}
          class="flex-1 border-2 text-left transition-all"
          style="
            padding: 1.25rem 1.25rem;
            line-height: {opt.value};
            border-color: {active ? 'var(--bmo-green)' : 'var(--bmo-border)'};
            background: {active ? 'var(--bmo-green)' : 'transparent'};
          "
        >
          <div class="font-bold tracking-widest mb-1"
               style="color: {active ? 'var(--bmo-bg)' : 'var(--bmo-text)'}">
            {opt.label}
          </div>
          <div style="color: {active ? 'var(--bmo-bg)' : 'var(--bmo-muted)'}; font-size: 0.8em">
            {opt.desc}
          </div>
        </button>
      {/each}
    </div>
  </section>

  <!-- ── RESET ──────────────────────────────────────────── -->
  <div class="flex items-center justify-between flex-wrap gap-4">
    <div style="color: var(--bmo-muted); font-size: 0.85em">
      Current: {settings.fontSize}px · {settings.contrast} contrast ·
      {settings.fontWeight === '600' ? 'bold' : 'normal'} weight · {settings.lineHeight} leading
    </div>
    <button
      onclick={resetSettings}
      class="border tracking-widest transition-all hover:opacity-80"
      style="padding: 0.75rem 1.5rem; border-color: var(--bmo-border); color: var(--bmo-muted)"
    >
      RESET TO DEFAULTS
    </button>
  </div>
</div>
