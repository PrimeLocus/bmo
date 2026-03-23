// src/lib/server/personality/signal-rules.ts

/**
 * TODO-B: EXTRACTION TARGET — Pi Personality Service
 * See: docs/bible/beaus-bible.md §24
 */

import type { PersonalityVector, SensorState, ActivitySignals, SignalRule } from './types.js';

export const RESTING_BASELINE: PersonalityVector = {
	wonder: 0.5,
	reflection: 0.3,
	mischief: 0.3,
};

function hour(date: Date): number {
	return date.getHours();
}

function isLateNight(date: Date): boolean {
	const h = hour(date);
	return h >= 1 && h < 5;
}

function isDawnDusk(date: Date): boolean {
	const h = hour(date);
	return (h >= 5 && h < 7) || (h >= 17 && h < 20);
}

function isStormWeather(weather: string | null): boolean {
	if (!weather) return false;
	const w = weather.toLowerCase();
	return w.includes('rain') || w.includes('storm') || w.includes('thunder') || w.includes('drizzle');
}

function isClearWarm(weather: string | null): boolean {
	if (!weather) return false;
	const w = weather.toLowerCase();
	return w.includes('clear') || w.includes('sunny');
}

function isAugust(date: Date): boolean {
	return date.getMonth() === 7;
}

function isLateOctober(date: Date): boolean {
	return date.getMonth() === 9 && date.getDate() >= 15;
}

/** All signal rules — the "parenting" config */
export const SIGNAL_RULES: SignalRule[] = [
	// ── Environmental rules ──
	{
		name: 'lux:low',
		condition: (s) => s.lux !== null && s.lux < 20 && s.lux >= 5,
		wonder: 0, reflection: 0.3, mischief: 0,
	},
	{
		name: 'lux:very-low+late',
		condition: (s) => s.lux !== null && s.lux < 5 && isLateNight(s.timeOfDay),
		wonder: 0, reflection: 0.5, mischief: -0.1,
	},
	{
		name: 'time:late-night',
		condition: (s) => isLateNight(s.timeOfDay),
		wonder: 0, reflection: 0.4, mischief: -0.2,
	},
	{
		name: 'time:dawn-dusk',
		condition: (s) => isDawnDusk(s.timeOfDay),
		wonder: 0.2, reflection: 0.2, mischief: 0,
	},
	{
		name: 'presence:empty+extended',
		condition: (s) => s.presenceState === 'empty' && s.interactionAge > 300,
		wonder: 0, reflection: 0.3, mischief: -0.3,
	},
	{
		name: 'presence:occupied+recent',
		condition: (s) => s.presenceState === 'occupied' && s.interactionAge < 120,
		wonder: 0, reflection: -0.1, mischief: 0.2,
	},
	{
		name: 'interaction:active',
		condition: (s) => s.interactionAge < 60,
		wonder: 0.1, reflection: -0.1, mischief: 0.3,
	},
	{
		name: 'interaction:stale',
		condition: (s) => s.interactionAge > 1800,
		wonder: 0, reflection: 0.2, mischief: -0.1,
	},
	{
		name: 'weather:storm',
		condition: (s) => isStormWeather(s.weather),
		wonder: 0.3, reflection: 0.2, mischief: 0,
	},
	{
		name: 'weather:clear-warm',
		condition: (s) => isClearWarm(s.weather),
		wonder: 0.1, reflection: 0, mischief: 0.1,
	},
	{
		name: 'season:august',
		condition: (s) => isAugust(s.timeOfDay),
		wonder: -0.1, reflection: 0.1, mischief: -0.1,
	},
	{
		name: 'season:late-october',
		condition: (s) => isLateOctober(s.timeOfDay),
		wonder: 0.3, reflection: 0.1, mischief: 0.1,
	},
	{
		name: 'resolume:active',
		condition: (s) => s.resolumeActive,
		wonder: 0.2, reflection: 0.1, mischief: -0.3,
	},
	{
		name: 'sleep:settling',
		condition: (s) => s.sleepState === 'settling',
		wonder: -0.2, reflection: 0.3, mischief: -0.3,
	},
	{
		name: 'sleep:waking',
		condition: (s) => s.sleepState === 'waking',
		wonder: 0.3, reflection: 0, mischief: 0,
	},

	// ── Activity signal rules ──
	{
		name: 'activity:haiku',
		condition: (_s, a) => a.haikuRecent,
		wonder: 0.1, reflection: 0.3, mischief: 0,
	},
	{
		name: 'activity:journal',
		condition: (_s, a) => a.journalRecent,
		wonder: 0, reflection: 0.4, mischief: 0,
	},
	{
		name: 'activity:dispatch',
		condition: (_s, a) => a.dispatchRecent,
		wonder: 0.1, reflection: 0, mischief: 0.2,
	},
	{
		name: 'activity:idea',
		condition: (_s, a) => a.ideaRecent,
		wonder: 0.3, reflection: 0, mischief: 0.1,
	},
	{
		name: 'activity:noticing',
		condition: (_s, a) => a.noticingRecent,
		wonder: 0.2, reflection: 0.2, mischief: 0,
	},
	{
		name: 'activity:debrief',
		condition: (_s, a) => a.debriefRecent,
		wonder: 0.2, reflection: 0.3, mischief: 0,
	},
];

/** Compute signal targets from sensor state + activity flags */
export function computeSignalTargets(
	sensor: SensorState,
	activity: ActivitySignals,
): PersonalityVector & { sources: string[] } {
	let wonder = RESTING_BASELINE.wonder;
	let reflection = RESTING_BASELINE.reflection;
	let mischief = RESTING_BASELINE.mischief;
	const sources: string[] = [];

	for (const rule of SIGNAL_RULES) {
		if (rule.condition(sensor, activity)) {
			wonder += rule.wonder;
			reflection += rule.reflection;
			mischief += rule.mischief;
			sources.push(rule.name);
		}
	}

	return {
		wonder: Math.max(0, Math.min(1, wonder)),
		reflection: Math.max(0, Math.min(1, reflection)),
		mischief: Math.max(0, Math.min(1, mischief)),
		sources,
	};
}
