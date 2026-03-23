import { describe, it, expect } from 'vitest';
import { scaleLinear, scaleTime, polylinePath, areaPath } from './personality-chart.js';

describe('scaleLinear', () => {
	it('maps domain to range', () => {
		const s = scaleLinear([0, 1], [0, 100]);
		expect(s(0)).toBe(0);
		expect(s(0.5)).toBe(50);
		expect(s(1)).toBe(100);
	});

	it('handles inverted range (SVG y-axis)', () => {
		const s = scaleLinear([0, 1], [100, 0]);
		expect(s(0)).toBe(100);
		expect(s(1)).toBe(0);
		expect(s(0.5)).toBe(50);
	});

	it('extrapolates outside domain', () => {
		const s = scaleLinear([0, 1], [0, 100]);
		expect(s(1.5)).toBe(150);
		expect(s(-0.5)).toBe(-50);
	});
});

describe('scaleTime', () => {
	it('maps dates to pixel range', () => {
		const d0 = new Date('2026-03-23T00:00:00Z');
		const d1 = new Date('2026-03-24T00:00:00Z');
		const s = scaleTime([d0, d1], [0, 400]);
		expect(s(d0)).toBe(0);
		expect(s(d1)).toBe(400);
		const mid = new Date('2026-03-23T12:00:00Z');
		expect(s(mid)).toBeCloseTo(200, 0);
	});
});

describe('polylinePath', () => {
	it('builds SVG path from points', () => {
		const points = [
			{ x: 0, y: 100 },
			{ x: 50, y: 60 },
			{ x: 100, y: 80 },
		];
		expect(polylinePath(points)).toBe('M0,100 L50,60 L100,80');
	});

	it('returns empty string for no points', () => {
		expect(polylinePath([])).toBe('');
	});

	it('handles single point', () => {
		expect(polylinePath([{ x: 10, y: 20 }])).toBe('M10,20');
	});

	it('rounds coordinates to 1 decimal', () => {
		const points = [
			{ x: 0.123, y: 99.876 },
			{ x: 50.555, y: 60.444 },
		];
		expect(polylinePath(points)).toBe('M0.1,99.9 L50.6,60.4');
	});
});

describe('areaPath', () => {
	it('closes path to baseline', () => {
		const points = [
			{ x: 0, y: 40 },
			{ x: 50, y: 20 },
			{ x: 100, y: 60 },
		];
		expect(areaPath(points, 100)).toBe('M0,40 L50,20 L100,60 L100,100 L0,100 Z');
	});

	it('returns empty string for no points', () => {
		expect(areaPath([], 100)).toBe('');
	});

	it('handles single point', () => {
		expect(areaPath([{ x: 10, y: 20 }], 100)).toBe('M10,20 L10,100 L10,100 Z');
	});
});
