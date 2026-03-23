/**
 * Client-safe signal rule metadata.
 * Maps rule name → dimension delta contributions.
 * Derived from SIGNAL_RULES in server/personality/signal-rules.ts.
 * Update this file when signal rules change.
 *
 * TODO-B: EXTRACTION TARGET — Pi Personality Service
 */

export type RuleDelta = {
	wonder: number;
	reflection: number;
	mischief: number;
};

export const SIGNAL_RULE_META: Record<string, RuleDelta> = {
	// ── Environmental ──
	'lux:low':                  { wonder: 0,    reflection: 0.3,  mischief: 0 },
	'lux:very-low+late':        { wonder: 0,    reflection: 0.5,  mischief: -0.1 },
	'time:late-night':          { wonder: 0,    reflection: 0.4,  mischief: -0.2 },
	'time:dawn-dusk':           { wonder: 0.2,  reflection: 0.2,  mischief: 0 },
	'presence:empty+extended':  { wonder: 0,    reflection: 0.3,  mischief: -0.3 },
	'presence:occupied+recent': { wonder: 0,    reflection: -0.1, mischief: 0.2 },
	'interaction:active':       { wonder: 0.1,  reflection: -0.1, mischief: 0.3 },
	'interaction:stale':        { wonder: 0,    reflection: 0.2,  mischief: -0.1 },
	'weather:storm':            { wonder: 0.3,  reflection: 0.2,  mischief: 0 },
	'weather:clear-warm':       { wonder: 0.1,  reflection: 0,    mischief: 0.1 },
	'season:august':            { wonder: -0.1, reflection: 0.1,  mischief: -0.1 },
	'season:late-october':      { wonder: 0.3,  reflection: 0.1,  mischief: 0.1 },
	'resolume:active':          { wonder: 0.2,  reflection: 0.1,  mischief: -0.3 },
	'sleep:settling':           { wonder: -0.2, reflection: 0.3,  mischief: -0.3 },
	'sleep:waking':             { wonder: 0.3,  reflection: 0,    mischief: 0 },
	// ── Activity ──
	'activity:haiku':           { wonder: 0.1,  reflection: 0.3,  mischief: 0 },
	'activity:journal':         { wonder: 0,    reflection: 0.4,  mischief: 0 },
	'activity:dispatch':        { wonder: 0.1,  reflection: 0,    mischief: 0.2 },
	'activity:idea':            { wonder: 0.3,  reflection: 0,    mischief: 0.1 },
	'activity:noticing':        { wonder: 0.2,  reflection: 0.2,  mischief: 0 },
	'activity:debrief':         { wonder: 0.2,  reflection: 0.3,  mischief: 0 },
};
