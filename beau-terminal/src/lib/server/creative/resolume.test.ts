import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ResolumeSessionManager, parseResolumeSessionMessage, parseResolumeLiveMessage } from './resolume.js';

describe('ResolumeSessionManager', () => {
  let manager: ResolumeSessionManager;
  let sessionStarts: Array<{ sessionId: number }>;
  let sessionEnds: Array<{ sessionId: number }>;

  beforeEach(() => {
    sessionStarts = [];
    sessionEnds = [];
    manager = new ResolumeSessionManager({
      silenceThresholdMs: 100,
      onSessionStart: (id) => sessionStarts.push({ sessionId: id }),
      onSessionEnd: (id) => sessionEnds.push({ sessionId: id }),
    });
  });

  afterEach(() => {
    manager.cleanup();
  });

  it('starts with no active session', () => {
    expect(manager.activeSessionId).toBeNull();
    expect(manager.isActive).toBe(false);
  });

  it('creates a session on first live event', () => {
    manager.onLiveEvent({ clip: 'clip1', bpm: 120 });
    expect(manager.isActive).toBe(true);
    expect(manager.activeSessionId).toBeTypeOf('number');
    expect(sessionStarts).toHaveLength(1);
  });

  it('does not create duplicate sessions for subsequent events', () => {
    manager.onLiveEvent({ clip: 'clip1', bpm: 120 });
    manager.onLiveEvent({ clip: 'clip2', bpm: 125 });
    expect(sessionStarts).toHaveLength(1);
  });

  it('tracks BPM min/max', () => {
    manager.onLiveEvent({ clip: 'a', bpm: 110 });
    manager.onLiveEvent({ clip: 'b', bpm: 130 });
    manager.onLiveEvent({ clip: 'c', bpm: 120 });
    const stats = manager.getSessionStats();
    expect(stats?.bpmMin).toBe(110);
    expect(stats?.bpmMax).toBe(130);
  });

  it('collects unique clips', () => {
    manager.onLiveEvent({ clip: 'clip1', bpm: 120 });
    manager.onLiveEvent({ clip: 'clip2', bpm: 120 });
    manager.onLiveEvent({ clip: 'clip1', bpm: 120 });
    const stats = manager.getSessionStats();
    expect(stats?.clips).toEqual(['clip1', 'clip2']);
  });

  it('ends session after silence threshold', async () => {
    manager.onLiveEvent({ clip: 'clip1', bpm: 120 });
    await new Promise((r) => setTimeout(r, 150));
    expect(manager.isActive).toBe(false);
    expect(sessionEnds).toHaveLength(1);
  });

  it('resets silence timer on new events', async () => {
    manager.onLiveEvent({ clip: 'clip1', bpm: 120 });
    await new Promise((r) => setTimeout(r, 60));
    manager.onLiveEvent({ clip: 'clip2', bpm: 125 });
    await new Promise((r) => setTimeout(r, 60));
    expect(manager.isActive).toBe(true);
    expect(sessionEnds).toHaveLength(0);
  });

  it('cleanup cancels pending timers', () => {
    manager.onLiveEvent({ clip: 'clip1', bpm: 120 });
    manager.cleanup();
    expect(manager.isActive).toBe(false);
  });
});

describe('parseResolumeSessionMessage', () => {
  it('parses valid session JSON', () => {
    const result = parseResolumeSessionMessage('{"active": true, "sessionId": 1, "name": "Friday Night"}');
    expect(result).toEqual({ active: true, sessionId: 1, name: 'Friday Night' });
  });

  it('returns null for invalid JSON', () => {
    expect(parseResolumeSessionMessage('not json')).toBeNull();
  });
});

describe('parseResolumeLiveMessage', () => {
  it('parses live event JSON', () => {
    const result = parseResolumeLiveMessage('{"clip": "tunnel", "bpm": 128}');
    expect(result).toEqual({ clip: 'tunnel', bpm: 128 });
  });

  it('returns null when clip field missing', () => {
    expect(parseResolumeLiveMessage('{"bpm": 128}')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseResolumeLiveMessage('bad')).toBeNull();
  });
});
