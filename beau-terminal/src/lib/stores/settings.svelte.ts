export type Settings = {
  fontSize:   number;            // px applied to <html>
  contrast:   'standard' | 'high';
  fontWeight: '400' | '600';
  lineHeight: '1.5' | '1.7' | '1.9';
};

export const DEFAULTS: Settings = {
  fontSize:   20,
  contrast:   'standard',
  fontWeight: '400',
  lineHeight: '1.6',
};

export const SIZE_PRESETS = [
  { label: 'S',  value: 16 },
  { label: 'M',  value: 18 },
  { label: 'L',  value: 20 },
  { label: 'XL', value: 24 },
  { label: '2X', value: 28 },
] as const;

function load(): Settings {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('bmo-settings') || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(s: Settings) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('bmo-settings', JSON.stringify(s));
}

function apply(s: Settings) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.style.fontSize = `${s.fontSize}px`;
  el.style.setProperty('--bmo-font-weight', s.fontWeight);
  el.style.setProperty('--bmo-line-height', s.lineHeight);
  if (s.contrast === 'high') {
    el.setAttribute('data-contrast', 'high');
  } else {
    el.removeAttribute('data-contrast');
  }
}

export const settings = $state<Settings>(load());

export function updateSettings(patch: Partial<Settings>) {
  Object.assign(settings, patch);
  save({ ...settings });
  apply({ ...settings });
}

export function resetSettings() {
  Object.assign(settings, DEFAULTS);
  save({ ...DEFAULTS });
  apply({ ...DEFAULTS });
}

export function bumpFontSize(delta: number) {
  const next = Math.min(32, Math.max(14, settings.fontSize + delta));
  updateSettings({ fontSize: next });
}
