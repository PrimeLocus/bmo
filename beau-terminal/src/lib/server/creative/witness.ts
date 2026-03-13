// Witness mode controller
// Activates 'witness' mode when Resolume session is active + room is occupied.

export type WitnessConfig = {
  onModeChange: (mode: string) => void;
};

export class WitnessController {
  private _isWitnessing = false;
  private _previousMode: string | null = null;
  private _onModeChange: (mode: string) => void;

  constructor(config: WitnessConfig) {
    this._onModeChange = config.onModeChange;
  }

  get isWitnessing(): boolean {
    return this._isWitnessing;
  }

  onSessionStart(presenceState: string, currentMode: string): void {
    if (presenceState === 'occupied') {
      this._previousMode = currentMode;
      this._isWitnessing = true;
      this._onModeChange('witness');
    }
  }

  onSessionEnd(): void {
    if (this._isWitnessing && this._previousMode !== null) {
      this._isWitnessing = false;
      this._onModeChange(this._previousMode);
      this._previousMode = null;
    }
  }

  onPresenceChange(presenceState: string, sessionActive: boolean): void {
    if (!sessionActive || this._isWitnessing) return;
    if (presenceState === 'occupied') {
      this._previousMode = this._previousMode ?? 'ambient';
      this._isWitnessing = true;
      this._onModeChange('witness');
    }
  }
}
