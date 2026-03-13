import { describe, it, expect } from 'vitest';
import { TOPICS, SUBSCRIBE_TOPICS, MODES, SLEEP_STATES, PRESENCE_STATES, HAIKU_TYPES, DISPATCH_TIERS } from './topics.js';
import type { Mode, SleepState, PresenceState, HaikuType, DispatchTier } from './topics.js';

describe('TOPICS', () => {
  it('all topics have beau/ prefix', () => {
    const allValues: string[] = [];
    function collect(obj: Record<string, unknown>) {
      for (const val of Object.values(obj)) {
        if (typeof val === 'string') allValues.push(val);
        else if (typeof val === 'object' && val !== null) collect(val as Record<string, unknown>);
      }
    }
    collect(TOPICS as unknown as Record<string, unknown>);
    for (const topic of allValues) {
      expect(topic).toMatch(/^beau\//);
    }
  });

  it('SUBSCRIBE_TOPICS is a non-empty string array', () => {
    expect(SUBSCRIBE_TOPICS.length).toBeGreaterThan(0);
    for (const t of SUBSCRIBE_TOPICS) {
      expect(typeof t).toBe('string');
    }
  });

  it('SUBSCRIBE_TOPICS includes Phase 1 and Phase 2 topics', () => {
    expect(SUBSCRIBE_TOPICS).toContain(TOPICS.state.mode);
    expect(SUBSCRIBE_TOPICS).toContain(TOPICS.environment.presence);
    expect(SUBSCRIBE_TOPICS).toContain(TOPICS.state.sleep);
  });

  it('SUBSCRIBE_TOPICS includes Phase 3 creative topics', () => {
    expect(SUBSCRIBE_TOPICS).toContain(TOPICS.creative.resolume.session);
    expect(SUBSCRIBE_TOPICS).toContain(TOPICS.creative.resolume.live);
    expect(SUBSCRIBE_TOPICS).toContain(TOPICS.creative.resolume.debrief);
  });
});

describe('type unions', () => {
  it('MODES contains all 5 modes', () => {
    expect(MODES).toEqual(['ambient', 'witness', 'collaborator', 'archivist', 'social']);
  });

  it('SLEEP_STATES contains 4 states', () => {
    expect(SLEEP_STATES).toEqual(['awake', 'settling', 'asleep', 'waking']);
  });

  it('PRESENCE_STATES contains 3 states', () => {
    expect(PRESENCE_STATES).toEqual(['occupied', 'empty', 'uncertain']);
  });

  it('HAIKU_TYPES contains 5 types', () => {
    expect(HAIKU_TYPES).toEqual(['daily', 'emergence', 'reflective', 'seasonal', 'prompted']);
  });

  it('DISPATCH_TIERS contains 3 tiers', () => {
    expect(DISPATCH_TIERS).toEqual(['reflex', 'philosopher', 'heavy']);
  });
});
