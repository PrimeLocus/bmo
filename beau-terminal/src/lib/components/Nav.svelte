<script lang="ts">
  import { page } from '$app/state';
  import { bumpFontSize, settings } from '$lib/stores/settings.svelte.js';

  const links = [
    { href: '/',         label: 'DASHBOARD', icon: '◈' },
    { href: '/parts',    label: 'PARTS',     icon: '⬡' },
    { href: '/software', label: 'SOFTWARE',  icon: '◉' },
    { href: '/ideas',    label: 'IDEAS',     icon: '✦' },
    { href: '/todo',     label: 'TODO',      icon: '◫' },
    { href: '/memory',   label: 'MEMORY',    icon: '◎' },
    { href: '/prompt',   label: 'PROMPT',    icon: '≋' },
    { href: '/haikus',   label: 'HAIKUS',    icon: '✿' },
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

  {#each links as link}
    {@const active = page.url.pathname === link.href}
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
    <a href="/settings"
       class="flex items-center justify-center gap-2 mt-1 px-2 py-2 text-sm tracking-widest border transition-all w-full"
       style="
         color: {page.url.pathname === '/settings' ? 'var(--bmo-bg)' : 'var(--bmo-muted)'};
         background: {page.url.pathname === '/settings' ? 'var(--bmo-green)' : 'transparent'};
         border-color: {page.url.pathname === '/settings' ? 'var(--bmo-green)' : 'var(--bmo-border)'};
       ">
      <span class="text-base shrink-0">⚙</span>
      <span class="hidden lg:inline whitespace-nowrap">DISPLAY</span>
    </a>
  </div>
</nav>
