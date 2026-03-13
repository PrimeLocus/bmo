import { describe, it, expect, beforeEach } from 'vitest';
import { SleepMachine } from './sleep.js';
import type { SleepState } from '../mqtt/topics.js';

describe('SleepMachine', () => {
  let machine: SleepMachine;

  beforeEach(() => {
    machine = new SleepMachine();
  });

  it('starts awake', () => {
    expect(machine.state).toBe('awake');
  });

  it('transitions to settling when room empties and lux is low', () => {
    machine.update({ presenceState: 'empty', lux: 5, interactionAge: 600 });
    expect(machine.state).toBe('settling');
  });

  it('stays awake if room is occupied', () => {
    machine.update({ presenceState: 'occupied', lux: 5, interactionAge: 600 });
    expect(machine.state).toBe('awake');
  });

  it('transitions settling → asleep after sustained conditions', () => {
    machine.update({ presenceState: 'empty', lux: 5, interactionAge: 600 });
    expect(machine.state).toBe('settling');
    // Second update with continued conditions
    machine.update({ presenceState: 'empty', lux: 3, interactionAge: 900 });
    expect(machine.state).toBe('asleep');
  });

  it('transitions asleep → waking on interaction', () => {
    // Get to asleep
    machine.update({ presenceState: 'empty', lux: 5, interactionAge: 600 });
    machine.update({ presenceState: 'empty', lux: 3, interactionAge: 900 });
    expect(machine.state).toBe('asleep');
    // Wake on interaction
    machine.update({ presenceState: 'occupied', lux: 50, interactionAge: 0 });
    expect(machine.state).toBe('waking');
  });

  it('transitions waking → awake on next update', () => {
    machine.update({ presenceState: 'empty', lux: 5, interactionAge: 600 });
    machine.update({ presenceState: 'empty', lux: 3, interactionAge: 900 });
    machine.update({ presenceState: 'occupied', lux: 50, interactionAge: 0 });
    expect(machine.state).toBe('waking');
    machine.update({ presenceState: 'occupied', lux: 100, interactionAge: 5 });
    expect(machine.state).toBe('awake');
  });

  it('manual override forces state', () => {
    machine.override('asleep');
    expect(machine.state).toBe('asleep');
    expect(machine.isOverridden).toBe(true);
  });

  it('clearOverride resumes normal state machine', () => {
    machine.override('asleep');
    machine.clearOverride();
    expect(machine.isOverridden).toBe(false);
  });

  it('emits state changes', () => {
    const changes: SleepState[] = [];
    machine.onChange((s) => changes.push(s));
    machine.update({ presenceState: 'empty', lux: 5, interactionAge: 600 });
    expect(changes).toEqual(['settling']);
  });
});
