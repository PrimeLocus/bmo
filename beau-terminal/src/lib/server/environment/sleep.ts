import type { SleepState, PresenceState } from '../mqtt/topics.js';

export type SleepInput = {
  presenceState: PresenceState;
  lux: number | null;
  interactionAge: number; // seconds since last interaction
  noiseLevel?: number; // optional RMS value
};

export type SleepThresholds = {
  luxDark: number; // lux below this = dark (default 15)
  interactionStale: number; // seconds without interaction before settling (default 300)
  settlingDuration: number; // how many updates in settling before asleep (default 2)
};

const DEFAULT_THRESHOLDS: SleepThresholds = {
  luxDark: 15,
  interactionStale: 300,
  settlingDuration: 2,
};

export class SleepMachine {
  state: SleepState = 'awake';
  isOverridden = false;

  private thresholds: SleepThresholds;
  private settlingCount = 0;
  private listeners = new Set<(state: SleepState) => void>();

  constructor(thresholds?: Partial<SleepThresholds>) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  onChange(fn: (state: SleepState) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  update(input: SleepInput) {
    if (this.isOverridden) return;

    const isDark = input.lux !== null && input.lux < this.thresholds.luxDark;
    const isStale = input.interactionAge > this.thresholds.interactionStale;
    const isEmpty = input.presenceState === 'empty';

    switch (this.state) {
      case 'awake':
        if (isEmpty && isDark && isStale) {
          this.settlingCount = 1;
          this.transition('settling');
        }
        break;

      case 'settling':
        if (!isEmpty || !isDark || !isStale) {
          this.settlingCount = 0;
          this.transition('awake');
        } else {
          this.settlingCount++;
          if (this.settlingCount >= this.thresholds.settlingDuration) {
            this.transition('asleep');
          }
        }
        break;

      case 'asleep':
        if (!isEmpty || input.interactionAge < 10) {
          this.transition('waking');
        }
        break;

      case 'waking':
        this.settlingCount = 0;
        this.transition('awake');
        break;
    }
  }

  override(state: SleepState) {
    this.isOverridden = true;
    this.transition(state);
  }

  clearOverride() {
    this.isOverridden = false;
  }

  getSnapshot() {
    return { state: this.state, isOverridden: this.isOverridden };
  }

  private transition(next: SleepState) {
    if (this.state === next) return;
    this.state = next;
    for (const fn of this.listeners) fn(next);
  }
}
