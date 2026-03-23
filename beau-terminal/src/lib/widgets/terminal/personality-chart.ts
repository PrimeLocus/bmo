/**
 * Minimal SVG charting utilities for the Personality Timeline widget.
 * No external dependencies — just math.
 */

/** Linear scale: maps a numeric domain to a pixel range. */
export function scaleLinear(domain: [number, number], range: [number, number]) {
	const [d0, d1] = domain;
	const [r0, r1] = range;
	const dSpan = d1 - d0;
	const rSpan = r1 - r0;
	return (value: number): number => r0 + ((value - d0) / dSpan) * rSpan;
}

/** Time scale: maps a Date domain to a pixel range. */
export function scaleTime(domain: [Date, Date], range: [number, number]) {
	const [d0, d1] = domain;
	const t0 = d0.getTime();
	const t1 = d1.getTime();
	const [r0, r1] = range;
	const tSpan = t1 - t0;
	const rSpan = r1 - r0;
	return (value: Date): number => r0 + ((value.getTime() - t0) / tSpan) * rSpan;
}

/** Build an SVG path string from an array of {x, y} points. */
export function polylinePath(points: Array<{ x: number; y: number }>): string {
	if (points.length === 0) return '';
	const r = (n: number) => Math.round(n * 10) / 10;
	return points
		.map((p, i) => `${i === 0 ? 'M' : 'L'}${r(p.x)},${r(p.y)}`)
		.join(' ');
}

/** Build an SVG area path (line + close to bottom). */
export function areaPath(
	points: Array<{ x: number; y: number }>,
	baseline: number,
): string {
	if (points.length === 0) return '';
	const line = polylinePath(points);
	const r = (n: number) => Math.round(n * 10) / 10;
	const last = points[points.length - 1];
	const first = points[0];
	return `${line} L${r(last.x)},${r(baseline)} L${r(first.x)},${r(baseline)} Z`;
}
