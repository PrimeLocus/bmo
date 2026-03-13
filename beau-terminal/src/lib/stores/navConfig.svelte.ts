// src/lib/stores/navConfig.svelte.ts
// Reactive nav configuration store — data-driven sidebar.

export type NavItem = {
  id: string;        // route path, e.g. "/identity"
  label: string;     // display name
  icon: string;      // unicode icon
  group: string;     // group heading (BEAU, CREATIVE, BUILD, SYSTEM)
  sortOrder: number; // within group
  hidden: boolean;   // user-hidden from sidebar
};

export type NavConfig = {
  groups: string[];   // ordered group headings
  items: NavItem[];   // all nav items
};

export const DEFAULT_NAV_CONFIG: NavConfig = {
  groups: ['BEAU', 'CREATIVE', 'BUILD', 'SYSTEM'],
  items: [
    // BEAU
    { id: '/',         label: 'DASHBOARD', icon: '◈', group: 'BEAU',     sortOrder: 0, hidden: false },
    { id: '/identity', label: 'IDENTITY',  icon: '◇', group: 'BEAU',     sortOrder: 1, hidden: false },
    { id: '/presence', label: 'PRESENCE',  icon: '◉', group: 'BEAU',     sortOrder: 2, hidden: false },
    { id: '/journal',  label: 'JOURNAL',   icon: '◬', group: 'BEAU',     sortOrder: 3, hidden: false },
    // CREATIVE
    { id: '/sessions',    label: 'SESSIONS',    icon: '▶', group: 'CREATIVE', sortOrder: 0, hidden: false },
    { id: '/photography', label: 'PHOTOGRAPHY', icon: '◻', group: 'CREATIVE', sortOrder: 1, hidden: false },
    { id: '/haikus',      label: 'HAIKUS',      icon: '✿', group: 'CREATIVE', sortOrder: 2, hidden: false },
    // BUILD
    { id: '/parts',    label: 'PARTS',    icon: '⬡', group: 'BUILD', sortOrder: 0, hidden: false },
    { id: '/software', label: 'SOFTWARE', icon: '◉', group: 'BUILD', sortOrder: 1, hidden: false },
    { id: '/ideas',    label: 'IDEAS',    icon: '✦', group: 'BUILD', sortOrder: 2, hidden: false },
    { id: '/todo',     label: 'TODO',     icon: '◫', group: 'BUILD', sortOrder: 3, hidden: false },
    // SYSTEM
    { id: '/memory',   label: 'MEMORY',   icon: '◎', group: 'SYSTEM', sortOrder: 0, hidden: false },
    { id: '/prompt',   label: 'PROMPT',   icon: '≋', group: 'SYSTEM', sortOrder: 1, hidden: false },
    { id: '/settings', label: 'SETTINGS', icon: '⚙', group: 'SYSTEM', sortOrder: 2, hidden: false },
  ],
};

const LS_KEY = 'bmo-nav-config';
const SQLITE_ID = '__nav__';

// In-memory reactive cache
let _config = $state<NavConfig>(structuredClone(DEFAULT_NAV_CONFIG));

// Debounce timer for SQLite sync
let syncTimer: ReturnType<typeof setTimeout> | undefined;

function readLS(): NavConfig | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (isValidNavConfig(parsed)) return parsed;
    localStorage.removeItem(LS_KEY);
    return null;
  } catch {
    return null;
  }
}

function writeLS(config: NavConfig) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LS_KEY, JSON.stringify(config));
}

function deleteLS() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(LS_KEY);
}

function isValidNavConfig(data: unknown): data is NavConfig {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.groups)) return false;
  if (!Array.isArray(d.items)) return false;
  for (const item of d.items) {
    if (!item || typeof item !== 'object') return false;
    const i = item as Record<string, unknown>;
    if (typeof i.id !== 'string') return false;
    if (typeof i.label !== 'string') return false;
    if (typeof i.icon !== 'string') return false;
    if (typeof i.group !== 'string') return false;
    if (typeof i.sortOrder !== 'number') return false;
    if (typeof i.hidden !== 'boolean') return false;
  }
  return true;
}

function scheduleSQLiteSync(config: NavConfig) {
  if (typeof fetch === 'undefined') return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    fetch(`/api/layouts?page=${encodeURIComponent(SQLITE_ID)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }).catch(() => {/* silent */});
  }, 2000);
}

function persist(config: NavConfig) {
  _config = structuredClone(config);
  writeLS(config);
  scheduleSQLiteSync(config);
}

/** Synchronous read — returns current config from memory or localStorage. */
export function getNavConfig(): NavConfig {
  return _config;
}

/** Async load — tries memory, localStorage, then SQLite fallback. */
export async function loadNavConfig(): Promise<NavConfig> {
  // Try localStorage first
  const ls = readLS();
  if (ls) {
    _config = ls;
    return ls;
  }
  // SQLite fallback
  if (typeof fetch !== 'undefined') {
    try {
      const res = await fetch(`/api/layouts?page=${encodeURIComponent(SQLITE_ID)}`);
      if (res.ok) {
        const data = await res.json();
        if (isValidNavConfig(data)) {
          _config = data;
          writeLS(data);
          return data;
        }
      }
    } catch {/* use default */}
  }
  return _config;
}

export function saveNavConfig(config: NavConfig) {
  persist(config);
}

export function resetNavConfig() {
  _config = structuredClone(DEFAULT_NAV_CONFIG);
  deleteLS();
  clearTimeout(syncTimer);
  if (typeof fetch !== 'undefined') {
    fetch(`/api/layouts?page=${encodeURIComponent(SQLITE_ID)}`, { method: 'DELETE' })
      .catch(() => {});
  }
}

export function updateNavItem(id: string, updates: Partial<Omit<NavItem, 'id'>>) {
  const idx = _config.items.findIndex(i => i.id === id);
  if (idx === -1) return;
  const updated = { ..._config, items: [..._config.items] };
  updated.items[idx] = { ...updated.items[idx], ...updates };
  persist(updated);
}

export function addNavItem(item: NavItem) {
  const updated = { ..._config, items: [..._config.items, item] };
  persist(updated);
}

export function removeNavItem(id: string) {
  const updated = { ..._config, items: _config.items.filter(i => i.id !== id) };
  persist(updated);
}

export function reorderNavItem(id: string, direction: 'up' | 'down') {
  const items = [..._config.items];
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return;
  const item = items[idx];
  // Get siblings in same group, sorted by sortOrder
  const siblings = items
    .filter(i => i.group === item.group)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const sibIdx = siblings.findIndex(s => s.id === id);
  if (direction === 'up' && sibIdx > 0) {
    // Swap sortOrders with the sibling above
    const above = siblings[sibIdx - 1];
    const aIdx = items.findIndex(i => i.id === above.id);
    const bIdx = items.findIndex(i => i.id === id);
    const tmpOrder = items[aIdx].sortOrder;
    items[aIdx] = { ...items[aIdx], sortOrder: items[bIdx].sortOrder };
    items[bIdx] = { ...items[bIdx], sortOrder: tmpOrder };
  } else if (direction === 'down' && sibIdx < siblings.length - 1) {
    const below = siblings[sibIdx + 1];
    const aIdx = items.findIndex(i => i.id === below.id);
    const bIdx = items.findIndex(i => i.id === id);
    const tmpOrder = items[aIdx].sortOrder;
    items[aIdx] = { ...items[aIdx], sortOrder: items[bIdx].sortOrder };
    items[bIdx] = { ...items[bIdx], sortOrder: tmpOrder };
  }
  persist({ ..._config, items });
}

export function reorderGroup(group: string, direction: 'up' | 'down') {
  const groups = [..._config.groups];
  const idx = groups.indexOf(group);
  if (idx === -1) return;
  if (direction === 'up' && idx > 0) {
    [groups[idx], groups[idx - 1]] = [groups[idx - 1], groups[idx]];
  } else if (direction === 'down' && idx < groups.length - 1) {
    [groups[idx], groups[idx + 1]] = [groups[idx + 1], groups[idx]];
  }
  persist({ ..._config, groups });
}
