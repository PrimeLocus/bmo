// Post-session debrief — schedules reflection prompt after Resolume session ends

export type DebriefInput = {
  durationMinutes: number;
  clips: string[];
  bpmRange: [number, number];
  venue?: string;
};

export function formatDebriefPrompt(input: DebriefInput): string {
  const venueStr = input.venue ? ` at ${input.venue}` : '';
  const clipList = input.clips.join(', ');
  return [
    `Reflect on a ${input.durationMinutes}-minute VJ session${venueStr}.`,
    `BPM ranged from ${input.bpmRange[0]} to ${input.bpmRange[1]}.`,
    `Clips used: ${clipList}.`,
    `Write a brief, poetic debrief — what Beau noticed about the visual flow, energy shifts, and moments of emergence.`,
  ].join(' ');
}

export type DebriefSchedulerConfig = {
  delayMs?: number;
  onDebrief: (sessionId: number) => void;
};

export class DebriefScheduler {
  private _pending = new Map<number, ReturnType<typeof setTimeout>>();
  private _delayMs: number;
  private _onDebrief: (sessionId: number) => void;

  constructor(config: DebriefSchedulerConfig) {
    this._delayMs = config.delayMs ?? 3 * 60 * 1000;
    this._onDebrief = config.onDebrief;
  }

  scheduleDebrief(sessionId: number): void {
    this.cancel(sessionId);
    const timer = setTimeout(() => {
      this._pending.delete(sessionId);
      this._onDebrief(sessionId);
    }, this._delayMs);
    this._pending.set(sessionId, timer);
  }

  cancel(sessionId: number): void {
    const timer = this._pending.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this._pending.delete(sessionId);
    }
  }

  cleanup(): void {
    for (const timer of this._pending.values()) {
      clearTimeout(timer);
    }
    this._pending.clear();
  }
}
