import { describe, it, expect } from 'vitest';
import { FACE_FRAMES, BLINK_HALF, BLINK_CLOSED, OFFLINE_EYES } from '$lib/face/frames.js';
import { FACE_STATES } from '$lib/server/mqtt/topics.js';
import type { FaceState, } from '$lib/server/mqtt/topics.js';
import type { FaceElement } from '$lib/face/frames.js';

function assertValidElement(el: FaceElement, label: string) {
  expect(el.kind, `${label} missing kind`).toBeDefined();

  if (el.kind === 'rect') {
    expect(typeof el.x, `${label} rect.x`).toBe('number');
    expect(typeof el.y, `${label} rect.y`).toBe('number');
    expect(el.w, `${label} rect.w`).toBeGreaterThan(0);
    expect(el.h, `${label} rect.h`).toBeGreaterThan(0);
  } else if (el.kind === 'circle') {
    expect(typeof el.cx, `${label} circle.cx`).toBe('number');
    expect(typeof el.cy, `${label} circle.cy`).toBe('number');
    expect(el.r, `${label} circle.r`).toBeGreaterThan(0);
  } else if (el.kind === 'path') {
    expect(typeof el.d, `${label} path.d`).toBe('string');
    expect(el.d.length, `${label} path.d empty`).toBeGreaterThan(0);
  }
}

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

  it('each frame has at least one element', () => {
    for (const state of FACE_STATES) {
      for (const frame of FACE_FRAMES[state].frames) {
        expect(frame.length, `${state} has empty frame`).toBeGreaterThan(0);
      }
    }
  });

  it('each element has valid properties for its kind', () => {
    for (const state of FACE_STATES) {
      for (let fi = 0; fi < FACE_FRAMES[state].frames.length; fi++) {
        const frame = FACE_FRAMES[state].frames[fi];
        for (let ei = 0; ei < frame.length; ei++) {
          assertValidElement(frame[ei], `${state}[${fi}][${ei}]`);
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
    const animated: FaceState[] = [
      'idle',
      'listening',
      'thinking',
      'speaking',
      'delighted',
      'sleepy',
      'mischievous',
    ];
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

  it('idle eyes are circles (canonical round dots)', () => {
    const idleOpen = FACE_FRAMES.idle.frames[0];
    const circles = idleOpen.filter((el) => el.kind === 'circle');
    expect(circles.length, 'idle should have 2 circle eyes').toBe(2);
  });

  it('idle mouth is a path (smooth curve)', () => {
    const idleOpen = FACE_FRAMES.idle.frames[0];
    const paths = idleOpen.filter((el) => el.kind === 'path');
    expect(paths.length, 'idle should have a path mouth').toBeGreaterThanOrEqual(1);
  });
});

describe('exported transition frames', () => {
  it('BLINK_HALF has valid elements', () => {
    expect(BLINK_HALF.length).toBeGreaterThan(0);
    for (const el of BLINK_HALF) {
      assertValidElement(el, 'BLINK_HALF');
    }
  });

  it('BLINK_CLOSED has valid elements', () => {
    expect(BLINK_CLOSED.length).toBeGreaterThan(0);
    for (const el of BLINK_CLOSED) {
      assertValidElement(el, 'BLINK_CLOSED');
    }
  });

  it('OFFLINE_EYES has valid elements', () => {
    expect(OFFLINE_EYES.length).toBeGreaterThan(0);
    for (const el of OFFLINE_EYES) {
      assertValidElement(el, 'OFFLINE_EYES');
    }
  });
});
