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
  lineHeight: '1.5',
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
    const raw = JSON.parse(localStorage.getItem('bmo-settings') || '{}') ?? {};

    const fontSize =
      typeof raw.fontSize === 'number' && raw.fontSize >= 14 && raw.fontSize <= 32
        ? raw.fontSize
        : DEFAULTS.fontSize;

    const contrast =
      raw.contrast === 'high' || raw.contrast === 'standard'
        ? raw.contrast
        : DEFAULTS.contrast;

    const fontWeight =
      raw.fontWeight === '400' || raw.fontWeight === '600'
        ? raw.fontWeight
        : DEFAULTS.fontWeight;

    let lineHeight = raw.lineHeight;
    if (lineHeight === '1.6') lineHeight = '1.5'; // migration
    lineHeight =
      lineHeight === '1.5' || lineHeight === '1.7' || lineHeight === '1.9'
        ? lineHeight
        : DEFAULTS.lineHeight;

    return { fontSize, contrast, fontWeight, lineHeight };
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

export function applyCurrentSettings() {
  apply({ ...settings });
}
