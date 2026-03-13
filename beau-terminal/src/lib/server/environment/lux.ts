export type LuxLabel = 'dark' | 'dim' | 'lamp' | 'bright';

const LUX_THRESHOLDS: [number, LuxLabel][] = [
  [300, 'bright'],
  [100, 'lamp'],
  [10, 'dim'],
  [0, 'dark'],
];

export function getLuxLabel(lux: number): LuxLabel {
  for (const [threshold, label] of LUX_THRESHOLDS) {
    if (lux >= threshold) return label;
  }
  return 'dark';
}

export function processLuxReading(msg: string): { lux: number; label: LuxLabel } | null {
  try {
    const parsed = JSON.parse(msg);
    if (typeof parsed.lux !== 'number') return null;
    return { lux: parsed.lux, label: getLuxLabel(parsed.lux) };
  } catch {
    return null;
  }
}
