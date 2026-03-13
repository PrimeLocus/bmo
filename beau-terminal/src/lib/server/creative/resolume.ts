// Resolume session lifecycle manager
// Sessions start on first OSC live event after quiet. End on silence threshold.

export type LiveEvent = {
  clip: string;
  bpm: number;
  layer?: number;
  intensity?: number;
};

export type SessionStats = {
  bpmMin: number;
  bpmMax: number;
  bpmSum: number;
  eventCount: number;
  clips: string[];
};

export type ResolumeSessionConfig = {
  silenceThresholdMs?: number;
  onSessionStart?: (sessionId: number) => void;
  onSessionEnd?: (sessionId: number) => void;
};

let nextId = 1;

export class ResolumeSessionManager {
  private _activeSessionId: number | null = null;
  private _silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private _silenceThresholdMs: number;
  private _onSessionStart: (sessionId: number) => void;
  private _onSessionEnd: (sessionId: number) => void;
  private _stats: SessionStats | null = null;

  constructor(config: ResolumeSessionConfig = {}) {
    this._silenceThresholdMs = config.silenceThresholdMs ?? 10 * 60 * 1000;
    this._onSessionStart = config.onSessionStart ?? (() => {});
    this._onSessionEnd = config.onSessionEnd ?? (() => {});
  }

  get activeSessionId(): number | null {
    return this._activeSessionId;
  }

  get isActive(): boolean {
    return this._activeSessionId !== null;
  }

  onLiveEvent(event: LiveEvent): void {
    if (!this._activeSessionId) {
      this._activeSessionId = nextId++;
      this._stats = {
        bpmMin: event.bpm,
        bpmMax: event.bpm,
        bpmSum: event.bpm,
        eventCount: 1,
        clips: [event.clip],
      };
      this._onSessionStart(this._activeSessionId);
    } else if (this._stats) {
      this._stats.bpmMin = Math.min(this._stats.bpmMin, event.bpm);
      this._stats.bpmMax = Math.max(this._stats.bpmMax, event.bpm);
      this._stats.bpmSum += event.bpm;
      this._stats.eventCount++;
      if (!this._stats.clips.includes(event.clip)) {
        this._stats.clips.push(event.clip);
      }
    }
    this._resetSilenceTimer();
  }

  getSessionStats(): SessionStats | null {
    return this._stats ? { ...this._stats, clips: [...this._stats.clips] } : null;
  }

  cleanup(): void {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
    if (this._activeSessionId) {
      const id = this._activeSessionId;
      this._activeSessionId = null;
      this._stats = null;
      this._onSessionEnd(id);
    }
  }

  private _resetSilenceTimer(): void {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
    }
    this._silenceTimer = setTimeout(() => {
      if (this._activeSessionId) {
        const id = this._activeSessionId;
        this._activeSessionId = null;
        this._stats = null;
        this._onSessionEnd(id);
      }
      this._silenceTimer = null;
    }, this._silenceThresholdMs);
  }
}

export function parseResolumeSessionMessage(msg: string): { active: boolean; sessionId: number; name?: string } | null {
  try {
    const data = JSON.parse(msg);
    if (typeof data.active !== 'boolean' || typeof data.sessionId !== 'number') return null;
    return { active: data.active, sessionId: data.sessionId, name: data.name ?? undefined };
  } catch {
    return null;
  }
}

export function parseResolumeLiveMessage(msg: string): LiveEvent | null {
  try {
    const data = JSON.parse(msg);
    if (typeof data.clip !== 'string') return null;
    return {
      clip: data.clip,
      bpm: typeof data.bpm === 'number' ? data.bpm : 0,
      layer: typeof data.layer === 'number' ? data.layer : undefined,
      intensity: typeof data.intensity === 'number' ? data.intensity : undefined,
    };
  } catch {
    return null;
  }
}
