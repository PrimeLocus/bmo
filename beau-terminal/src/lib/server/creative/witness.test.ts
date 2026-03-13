import { describe, it, expect, beforeEach } from 'vitest';
import { WitnessController } from './witness.js';

describe('WitnessController', () => {
  let controller: WitnessController;
  const modeChanges: string[] = [];

  beforeEach(() => {
    modeChanges.length = 0;
    controller = new WitnessController({
      onModeChange: (mode) => modeChanges.push(mode),
    });
  });

  it('activates witness mode when session starts and room is occupied', () => {
    controller.onSessionStart('occupied', 'ambient');
    expect(controller.isWitnessing).toBe(true);
    expect(modeChanges).toEqual(['witness']);
  });

  it('does not activate when room is empty', () => {
    controller.onSessionStart('empty', 'ambient');
    expect(controller.isWitnessing).toBe(false);
    expect(modeChanges).toEqual([]);
  });

  it('does not activate when room is uncertain', () => {
    controller.onSessionStart('uncertain', 'ambient');
    expect(controller.isWitnessing).toBe(false);
    expect(modeChanges).toEqual([]);
  });

  it('restores previous mode on session end', () => {
    controller.onSessionStart('occupied', 'ambient');
    controller.onSessionEnd();
    expect(controller.isWitnessing).toBe(false);
    expect(modeChanges).toEqual(['witness', 'ambient']);
  });

  it('does not restore if was not witnessing', () => {
    controller.onSessionStart('empty', 'ambient');
    controller.onSessionEnd();
    expect(modeChanges).toEqual([]);
  });

  it('activates witness if presence changes to occupied during active session', () => {
    controller.onSessionStart('empty', 'collaborator');
    controller.onPresenceChange('occupied', true);
    expect(controller.isWitnessing).toBe(true);
    expect(modeChanges).toEqual(['witness']);
  });

  it('does not deactivate witness if presence goes empty during session', () => {
    controller.onSessionStart('occupied', 'ambient');
    controller.onPresenceChange('empty', true);
    expect(controller.isWitnessing).toBe(true);
  });
});
