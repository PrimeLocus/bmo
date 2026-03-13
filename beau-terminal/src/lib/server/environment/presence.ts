import type { PresenceState } from '../mqtt/topics.js';

export type CameraEvent = {
  detected: boolean;
  confidence: number;
};

const DEBOUNCE_THRESHOLD = 3; // consecutive negatives before transition to empty

export class PresenceMachine {
  state: PresenceState = 'uncertain';
  confidence = 0;

  private negativeCount = 0;
  private listeners = new Set<(state: PresenceState) => void>();

  onChange(fn: (state: PresenceState) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onCameraEvent(event: CameraEvent) {
    if (event.detected) {
      this.negativeCount = 0;
      this.confidence = event.confidence;
      this.transition('occupied');
    } else {
      this.negativeCount++;
      if (this.negativeCount >= DEBOUNCE_THRESHOLD) {
        this.confidence = event.confidence;
        this.transition('empty');
      }
      // Otherwise stay in current state (debounce)
    }
  }

  getSnapshot() {
    return { state: this.state, confidence: this.confidence };
  }

  private transition(next: PresenceState) {
    if (this.state === next) return;
    this.state = next;
    for (const fn of this.listeners) fn(next);
  }
}

export function parsePresenceMessage(msg: string): CameraEvent | null {
  try {
    const parsed = JSON.parse(msg);
    if (typeof parsed.detected !== 'boolean') return null;
    return {
      detected: parsed.detected,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
  } catch {
    return null;
  }
}
