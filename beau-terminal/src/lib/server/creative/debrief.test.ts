import { describe, it, expect } from 'vitest';
import { formatDebriefPrompt, DebriefScheduler } from './debrief.js';

describe('formatDebriefPrompt', () => {
  it('includes session duration and clips', () => {
    const prompt = formatDebriefPrompt({
      durationMinutes: 45,
      clips: ['tunnel', 'waves', 'glitch'],
      bpmRange: [110, 135],
      venue: 'Blue Moon Saloon',
    });
    expect(prompt).toContain('45');
    expect(prompt).toContain('tunnel');
    expect(prompt).toContain('Blue Moon Saloon');
    expect(prompt).toContain('110');
    expect(prompt).toContain('135');
  });

  it('handles missing venue gracefully', () => {
    const prompt = formatDebriefPrompt({
      durationMinutes: 30,
      clips: ['a'],
      bpmRange: [120, 120],
    });
    expect(prompt).not.toContain('undefined');
    expect(prompt).not.toContain('null');
  });
});

describe('DebriefScheduler', () => {
  it('triggers debrief callback after delay', async () => {
    const debriefs: number[] = [];
    const scheduler = new DebriefScheduler({
      delayMs: 50,
      onDebrief: (sessionId) => { debriefs.push(sessionId); },
    });
    scheduler.scheduleDebrief(42);
    expect(debriefs).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 80));
    expect(debriefs).toEqual([42]);
  });

  it('can cancel a pending debrief', async () => {
    const debriefs: number[] = [];
    const scheduler = new DebriefScheduler({
      delayMs: 50,
      onDebrief: (sessionId) => { debriefs.push(sessionId); },
    });
    scheduler.scheduleDebrief(42);
    scheduler.cancel(42);
    await new Promise((r) => setTimeout(r, 80));
    expect(debriefs).toHaveLength(0);
  });

  it('cleanup cancels all pending debriefs', async () => {
    const debriefs: number[] = [];
    const scheduler = new DebriefScheduler({
      delayMs: 50,
      onDebrief: (sessionId) => { debriefs.push(sessionId); },
    });
    scheduler.scheduleDebrief(1);
    scheduler.scheduleDebrief(2);
    scheduler.cleanup();
    await new Promise((r) => setTimeout(r, 80));
    expect(debriefs).toHaveLength(0);
  });
});
