import { describe, it, expect } from 'vitest';
import { SIGNAL_RULE_META } from './rule-meta.js';

describe('SIGNAL_RULE_META', () => {
	it('has exactly 21 rules', () => {
		expect(Object.keys(SIGNAL_RULE_META)).toHaveLength(21);
	});

	it('every rule has wonder, reflection, mischief numbers', () => {
		for (const [name, delta] of Object.entries(SIGNAL_RULE_META)) {
			expect(typeof delta.wonder, `${name}.wonder`).toBe('number');
			expect(typeof delta.reflection, `${name}.reflection`).toBe('number');
			expect(typeof delta.mischief, `${name}.mischief`).toBe('number');
		}
	});

	it('includes known environmental rules', () => {
		expect(SIGNAL_RULE_META['lux:low']).toEqual({ wonder: 0, reflection: 0.3, mischief: 0 });
		expect(SIGNAL_RULE_META['time:late-night']).toEqual({ wonder: 0, reflection: 0.4, mischief: -0.2 });
		expect(SIGNAL_RULE_META['weather:storm']).toEqual({ wonder: 0.3, reflection: 0.2, mischief: 0 });
	});

	it('includes known activity rules', () => {
		expect(SIGNAL_RULE_META['activity:haiku']).toEqual({ wonder: 0.1, reflection: 0.3, mischief: 0 });
		expect(SIGNAL_RULE_META['activity:journal']).toEqual({ wonder: 0, reflection: 0.4, mischief: 0 });
	});

	it('has no condition functions (client-safe)', () => {
		for (const delta of Object.values(SIGNAL_RULE_META)) {
			expect(Object.keys(delta).sort()).toEqual(['mischief', 'reflection', 'wonder']);
		}
	});
});
