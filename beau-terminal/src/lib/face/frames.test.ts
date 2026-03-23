import { describe, it, expect } from 'vitest';
import { FACE_FRAMES } from '$lib/face/frames.js';
import { FACE_STATES } from '$lib/server/mqtt/topics.js';
import type { FaceState } from '$lib/server/mqtt/topics.js';

describe('FACE_FRAMES', () => {
  it('has frames for every face state', () => {
    for (const state of FACE_STATES) {
      expect(FACE_FRAMES[state], `missing frames for ${state}`).toBeDefined();
    }
  });

  it('each state has at least one frame', () => {
    for (const state of FACE_STATES) {
      expect(FACE_FRAMES[state].frames.length, `${state} has no frames`).toBeGreaterThan(0);
    }
  });

  it('each frame has at least one rect', () => {
    for (const state of FACE_STATES) {
      for (const frame of FACE_FRAMES[state].frames) {
        expect(frame.length, `${state} has empty frame`).toBeGreaterThan(0);
      }
    }
  });

  it('each rect has valid x, y, w, h numbers', () => {
    for (const state of FACE_STATES) {
      for (const frame of FACE_FRAMES[state].frames) {
        for (const rect of frame) {
          expect(typeof rect.x).toBe('number');
          expect(typeof rect.y).toBe('number');
          expect(typeof rect.w).toBe('number');
          expect(typeof rect.h).toBe('number');
          expect(rect.w).toBeGreaterThan(0);
          expect(rect.h).toBeGreaterThan(0);
        }
      }
    }
  });

  it('each state has a positive timing value', () => {
    for (const state of FACE_STATES) {
      const t = FACE_FRAMES[state].timing;
      expect(typeof t === 'number' ? t : t(), `${state} has bad timing`).toBeGreaterThan(0);
    }
  });

  it('animated states have multiple frames', () => {
    const animated: FaceState[] = ['idle', 'listening', 'thinking', 'speaking', 'delighted', 'sleepy', 'mischievous'];
    for (const state of animated) {
      expect(FACE_FRAMES[state].frames.length, `${state} should be animated`).toBeGreaterThan(1);
    }
  });

  it('static states can have single frames', () => {
    const staticStates: FaceState[] = ['unamused', 'protective'];
    for (const state of staticStates) {
      expect(FACE_FRAMES[state].frames.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('sleepy state has textFrames for z characters', () => {
    const sleepy = FACE_FRAMES.sleepy;
    expect(sleepy.textFrames, 'sleepy must have textFrames for z z z').toBeDefined();
    expect(sleepy.textFrames!.length).toBeGreaterThan(0);
    for (const tf of sleepy.textFrames!) {
      expect(tf.length).toBeGreaterThan(0);
      for (const t of tf) {
        expect(t.text).toBe('z');
        expect(typeof t.x).toBe('number');
        expect(typeof t.y).toBe('number');
        expect(typeof t.size).toBe('number');
        expect(typeof t.opacity).toBe('number');
      }
    }
  });
});
