<script lang="ts">
  import { page } from '$app/state';
  import { bumpFontSize, settings } from '$lib/stores/settings.svelte.js';

  type NavLink = { href: string; label: string; icon: string; disabled?: boolean };
  type NavGroup = { heading: string; links: NavLink[] };

  const groups: NavGroup[] = [
    {
      heading: 'BEAU',
      links: [
        { href: '/',         label: 'DASHBOARD', icon: '◈' },
        { href: '/identity', label: 'IDENTITY',  icon: '◇' },
        { href: '/presence', label: 'PRESENCE',  icon: '◉', disabled: true },
        { href: '/journal',  label: 'JOURNAL',   icon: '◬', disabled: true },
      ],
    },
    {
      heading: 'CREATIVE',
      links: [
        { href: '/sessions',    label: 'SESSIONS',    icon: '▶', disabled: true },
        { href: '/photography', label: 'PHOTOGRAPHY', icon: '◻', disabled: true },
        { href: '/haikus',      label: 'HAIKUS',      icon: '✿' },
      ],
    },
    {
      heading: 'BUILD',
      links: [
        { href: '/parts',    label: 'PARTS',    icon: '⬡' },
        { href: '/software', label: 'SOFTWARE', icon: '◉' },
        { href: '/ideas',    label: 'IDEAS',    icon: '✦' },
        { href: '/todo',     label: 'TODO',     icon: '◫' },
      ],
    },
    {
      heading: 'SYSTEM',
      links: [
        { href: '/memory',   label: 'MEMORY',   icon: '◎' },
        { href: '/prompt',   label: 'PROMPT',   icon: '≋' },
        { href: '/settings', label: 'SETTINGS', icon: '⚙' },
      ],
    },
  ];
</script>

<nav class="flex flex-col gap-1 p-3 border-r shrink-0"
     style="border-color: var(--bmo-border); background: var(--bmo-surface);
            width: clamp(52px, 12vw, 200px)">

  <!-- Logo -->
  <div class="flex items-center gap-2 mb-6 pb-4" style="border-bottom: 1px solid var(--bmo-border)">
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

  {#each groups as group}
    <div class="mb-2">
      <div class="hidden lg:block text-xs tracking-widest px-2 py-1 mb-1"
           style="color: var(--bmo-muted); opacity: 0.6; font-size: 0.6rem">
        {group.heading}
      </div>
      {#each group.links as link}
        {@const active = page.url.pathname === link.href}
        {#if link.disabled}
          <div class="flex items-center gap-2 px-2 py-2 text-sm tracking-widest cursor-default"
               title="{link.label} — coming soon"
               style="color: var(--bmo-muted); opacity: 0.3">
            <span class="text-base shrink-0">{link.icon}</span>
            <span class="hidden lg:inline whitespace-nowrap overflow-hidden">{link.label}</span>
          </div>
        {:else}
          <a href={link.href}
             class="flex items-center gap-2 px-2 py-2 text-sm tracking-widest transition-all"
             title={link.label}
             style="
               color: {active ? 'var(--bmo-bg)' : 'var(--bmo-muted)'};
               background: {active ? 'var(--bmo-green)' : 'transparent'};
               border: 1px solid {active ? 'var(--bmo-green)' : 'transparent'};
             ">
            <span class="text-base shrink-0">{link.icon}</span>
            <span class="hidden lg:inline whitespace-nowrap overflow-hidden">{link.label}</span>
          </a>
        {/if}
      {/each}
    </div>
  {/each}

  <!-- Spacer -->
  <div class="flex-1"></div>

  <!-- Text size quick controls -->
  <div class="pt-3 border-t" style="border-color: var(--bmo-border)">
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
