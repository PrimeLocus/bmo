import { describe, it, expect, beforeEach } from 'vitest';
import { PresenceMachine, parsePresenceMessage } from './presence.js';
import type { PresenceState } from '../mqtt/topics.js';

describe('PresenceMachine', () => {
  let machine: PresenceMachine;

  beforeEach(() => {
    machine = new PresenceMachine();
  });

  it('starts in uncertain state', () => {
    expect(machine.state).toBe('uncertain');
    expect(machine.confidence).toBe(0);
  });

  it('transitions to occupied on camera detection', () => {
    machine.onCameraEvent({ detected: true, confidence: 0.9 });
    expect(machine.state).toBe('occupied');
    expect(machine.confidence).toBeCloseTo(0.9);
  });

  it('does not immediately transition to empty on single no-detection', () => {
    machine.onCameraEvent({ detected: true, confidence: 0.9 });
    machine.onCameraEvent({ detected: false, confidence: 0.8 });
    // Debounce: still occupied after single negative
    expect(machine.state).toBe('occupied');
  });

  it('transitions to empty after debounce threshold consecutive negatives', () => {
    machine.onCameraEvent({ detected: true, confidence: 0.9 });
    // Simulate 3 consecutive negatives (debounce threshold)
    for (let i = 0; i < 3; i++) {
      machine.onCameraEvent({ detected: false, confidence: 0.8 });
    }
    expect(machine.state).toBe('empty');
  });

  it('resets negative count on positive detection', () => {
    machine.onCameraEvent({ detected: true, confidence: 0.9 });
    machine.onCameraEvent({ detected: false, confidence: 0.8 });
    machine.onCameraEvent({ detected: true, confidence: 0.85 });
    expect(machine.state).toBe('occupied');
  });

  it('emits state changes', () => {
    const changes: PresenceState[] = [];
    machine.onChange((s) => changes.push(s));
    machine.onCameraEvent({ detected: true, confidence: 0.9 });
    expect(changes).toEqual(['occupied']);
  });

  it('getSnapshot returns current state + confidence', () => {
    machine.onCameraEvent({ detected: true, confidence: 0.85 });
    const snap = machine.getSnapshot();
    expect(snap.state).toBe('occupied');
    expect(snap.confidence).toBeCloseTo(0.85);
  });
});

describe('parsePresenceMessage', () => {
  it('parses valid JSON with detected + confidence', () => {
    const result = parsePresenceMessage('{"detected": true, "confidence": 0.9}');
    expect(result).toEqual({ detected: true, confidence: 0.9 });
  });

  it('defaults confidence to 0.5 when missing', () => {
    const result = parsePresenceMessage('{"detected": false}');
    expect(result).toEqual({ detected: false, confidence: 0.5 });
  });

  it('returns null for invalid JSON', () => {
    expect(parsePresenceMessage('not json')).toBeNull();
  });

  it('returns null when detected field is missing', () => {
    expect(parsePresenceMessage('{"confidence": 0.9}')).toBeNull();
  });
});
