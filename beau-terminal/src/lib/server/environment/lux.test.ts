import { describe, it, expect } from 'vitest';
import { getLuxLabel, processLuxReading } from './lux.js';

describe('getLuxLabel', () => {
  it('returns "dark" for lux < 10', () => {
    expect(getLuxLabel(0)).toBe('dark');
    expect(getLuxLabel(5)).toBe('dark');
    expect(getLuxLabel(9.9)).toBe('dark');
  });

  it('returns "dim" for lux 10-100', () => {
    expect(getLuxLabel(10)).toBe('dim');
    expect(getLuxLabel(50)).toBe('dim');
    expect(getLuxLabel(99)).toBe('dim');
  });

  it('returns "lamp" for lux 100-300', () => {
    expect(getLuxLabel(100)).toBe('lamp');
    expect(getLuxLabel(200)).toBe('lamp');
  });

  it('returns "bright" for lux >= 300', () => {
    expect(getLuxLabel(300)).toBe('bright');
    expect(getLuxLabel(1000)).toBe('bright');
  });
});

describe('processLuxReading', () => {
  it('parses JSON lux message and returns numeric value + label', () => {
    const result = processLuxReading('{"lux": 45}');
    expect(result).toEqual({ lux: 45, label: 'dim' });
  });

  it('returns null for invalid JSON', () => {
    expect(processLuxReading('not json')).toBeNull();
  });

  it('returns null for missing lux field', () => {
    expect(processLuxReading('{"brightness": 100}')).toBeNull();
  });
});
