// Wellness device session lifecycle manager
// Sessions start on heating state change, end on silence or cooldown threshold.

import type { HeatingState } from '../mqtt/topics.js';

export type DeviceStatusEvent = {
  deviceId: string;
  deviceType: string;
  displayName: string;
  event: 'connected' | 'disconnected' | 'error';
  batteryPercent?: number;
  firmwareVersion?: string;
};

export type TelemetryEvent = {
  deviceId: string;
  deviceType: string;
  displayName: string;
  targetTemp: number | null;
  actualTemp: number | null;
  heatingState: HeatingState;
  batteryPercent?: number;
  profile?: string;
};

export type SessionEvent = {
  event: 'start' | 'end' | 'heartbeat';
  deviceId: string;
  deviceType: string;
  displayName: string;
  targetTemp?: number;
  peakTemp?: number;
};

export type WellnessSessionStats = {
  deviceId: string;
  deviceType: string;
  displayName: string;
  targetTemp: number | null;
  peakTemp: number;
  tempSum: number;
  tempReadings: number;
  profile: string | null;
  batteryPercent?: number;
};

export type WellnessSessionConfig = {
  cooldownTimeoutMs?: number;  // Default 3 minutes
  cooldownTempF?: number;      // Default 100F
  onSessionStart?: (info: { deviceId: string; deviceType: string; displayName: string; targetTemp: number | null; batteryPercent?: number; profile?: string }) => void;
  onSessionEnd?: (stats: WellnessSessionStats | null) => void;
};

type SessionState = 'idle' | 'heating' | 'active' | 'cooling';

export class WellnessSessionManager {
  private _state: SessionState = 'idle';
  private _cooldownTimer: ReturnType<typeof setTimeout> | null = null;
  private _cooldownTimeoutMs: number;
  private _cooldownTempF: number;
  private _onSessionStart: NonNullable<WellnessSessionConfig['onSessionStart']>;
  private _onSessionEnd: NonNullable<WellnessSessionConfig['onSessionEnd']>;
  private _stats: WellnessSessionStats | null = null;
  private _deviceInfo: { deviceId: string; deviceType: string; displayName: string } | null = null;

  constructor(config: WellnessSessionConfig = {}) {
    this._cooldownTimeoutMs = config.cooldownTimeoutMs ?? 3 * 60 * 1000;
    this._cooldownTempF = config.cooldownTempF ?? 100;
    this._onSessionStart = config.onSessionStart ?? (() => {});
    this._onSessionEnd = config.onSessionEnd ?? (() => {});
  }

  get state(): SessionState { return this._state; }
  get isActive(): boolean { return this._state !== 'idle'; }
  get stats(): WellnessSessionStats | null { return this._stats ? { ...this._stats } : null; }

  onTelemetry(event: TelemetryEvent): void {
    this._deviceInfo = { deviceId: event.deviceId, deviceType: event.deviceType, displayName: event.displayName };

    if (this._state === 'idle') {
      if (event.heatingState === 'heating' || event.heatingState === 'ready' || event.heatingState === 'active') {
        this._startSession(event);
      }
      return;
    }

    // Session is active — accumulate stats
    if (this._stats && event.actualTemp != null) {
      this._stats.peakTemp = Math.max(this._stats.peakTemp, event.actualTemp);
      this._stats.tempSum += event.actualTemp;
      this._stats.tempReadings++;
      if (event.batteryPercent != null) this._stats.batteryPercent = event.batteryPercent;
      if (event.targetTemp != null) this._stats.targetTemp = event.targetTemp;
      if (event.profile) this._stats.profile = event.profile;
    }

    // State transitions
    switch (this._state) {
      case 'heating':
        if (event.heatingState === 'ready' || event.heatingState === 'active') {
          this._state = 'active';
          this._clearCooldownTimer();
        } else if (event.heatingState === 'cooling' || event.heatingState === 'idle') {
          this._state = 'cooling';
          this._startCooldownTimer();
        }
        break;
      case 'active':
        if (event.heatingState === 'cooling' || event.heatingState === 'idle') {
          this._state = 'cooling';
          this._startCooldownTimer();
        }
        break;
      case 'cooling':
        if (event.heatingState === 'heating' || event.heatingState === 'ready' || event.heatingState === 'active') {
          // Back to active — user started another cycle
          this._state = event.heatingState === 'heating' ? 'heating' : 'active';
          this._clearCooldownTimer();
        } else if (event.actualTemp != null && event.actualTemp < this._cooldownTempF) {
          // Temp dropped below threshold — end immediately
          this._endSession();
        } else {
          // Still cooling — reset the silence timer
          this._startCooldownTimer();
        }
        break;
    }
  }

  onExplicitStart(event: SessionEvent): void {
    if (this._state === 'idle') {
      this._startSession({
        deviceId: event.deviceId,
        deviceType: event.deviceType,
        displayName: event.displayName,
        targetTemp: event.targetTemp ?? null,
        actualTemp: null,
        heatingState: 'heating',
      });
    }
  }

  onExplicitEnd(): void {
    if (this._state !== 'idle') {
      this._endSession();
    }
  }

  onDisconnect(): void {
    if (this._state !== 'idle') {
      this._endSession();
    }
  }

  cleanup(): void {
    this._clearCooldownTimer();
    if (this._state !== 'idle') {
      this._endSession();
    }
  }

  private _startSession(event: TelemetryEvent): void {
    this._state = event.heatingState === 'heating' ? 'heating' : 'active';
    this._stats = {
      deviceId: event.deviceId,
      deviceType: event.deviceType,
      displayName: event.displayName,
      targetTemp: event.targetTemp,
      peakTemp: event.actualTemp ?? 0,
      tempSum: event.actualTemp ?? 0,
      tempReadings: event.actualTemp != null ? 1 : 0,
      profile: event.profile ?? null,
      batteryPercent: event.batteryPercent,
    };
    this._onSessionStart({
      deviceId: event.deviceId,
      deviceType: event.deviceType,
      displayName: event.displayName,
      targetTemp: event.targetTemp,
      batteryPercent: event.batteryPercent,
      profile: event.profile,
    });
  }

  private _endSession(): void {
    this._clearCooldownTimer();
    const stats = this._stats;
    this._state = 'idle';
    this._stats = null;
    this._onSessionEnd(stats);
  }

  private _startCooldownTimer(): void {
    this._clearCooldownTimer();
    this._cooldownTimer = setTimeout(() => {
      if (this._state === 'cooling') {
        this._endSession();
      }
      this._cooldownTimer = null;
    }, this._cooldownTimeoutMs);
  }

  private _clearCooldownTimer(): void {
    if (this._cooldownTimer) {
      clearTimeout(this._cooldownTimer);
      this._cooldownTimer = null;
    }
  }
}

// ── Device Coordinator ──────────────────────────────────────────────────────

export type CoordinatorConfig = {
  onSessionStart?: WellnessSessionConfig['onSessionStart'];
  onSessionEnd?: WellnessSessionConfig['onSessionEnd'];
  cooldownTimeoutMs?: number;
  cooldownTempF?: number;
};

export class WellnessDeviceCoordinator {
  private _managers = new Map<string, WellnessSessionManager>();
  private _devices = new Map<string, { deviceType: string; displayName: string; connected: boolean }>();
  private _config: CoordinatorConfig;

  constructor(config: CoordinatorConfig = {}) {
    this._config = config;
  }

  onDeviceStatus(event: DeviceStatusEvent): void {
    if (event.event === 'connected') {
      this._devices.set(event.deviceId, {
        deviceType: event.deviceType,
        displayName: event.displayName,
        connected: true,
      });
    } else {
      const manager = this._managers.get(event.deviceId);
      if (manager) {
        manager.onDisconnect();
        this._managers.delete(event.deviceId);
      }
      const device = this._devices.get(event.deviceId);
      if (device) device.connected = false;
    }
  }

  onTelemetry(event: TelemetryEvent): void {
    let manager = this._managers.get(event.deviceId);
    if (!manager) {
      manager = new WellnessSessionManager({
        onSessionStart: this._config.onSessionStart,
        onSessionEnd: this._config.onSessionEnd,
        cooldownTimeoutMs: this._config.cooldownTimeoutMs,
        cooldownTempF: this._config.cooldownTempF,
      });
      this._managers.set(event.deviceId, manager);
    }
    if (!this._devices.has(event.deviceId)) {
      this._devices.set(event.deviceId, {
        deviceType: event.deviceType,
        displayName: event.displayName,
        connected: true,
      });
    }
    manager.onTelemetry(event);
  }

  onSessionEvent(event: SessionEvent): void {
    if (event.event === 'start') {
      let manager = this._managers.get(event.deviceId);
      if (!manager) {
        manager = new WellnessSessionManager({
          onSessionStart: this._config.onSessionStart,
          onSessionEnd: this._config.onSessionEnd,
          cooldownTimeoutMs: this._config.cooldownTimeoutMs,
          cooldownTempF: this._config.cooldownTempF,
        });
        this._managers.set(event.deviceId, manager);
      }
      manager.onExplicitStart(event);
    } else if (event.event === 'end') {
      const manager = this._managers.get(event.deviceId);
      if (manager) manager.onExplicitEnd();
    }
  }

  /** Returns the most recently active session's manager, or null */
  getActiveManager(): WellnessSessionManager | null {
    for (const manager of this._managers.values()) {
      if (manager.isActive) return manager;
    }
    return null;
  }

  cleanup(): void {
    for (const manager of this._managers.values()) {
      manager.cleanup();
    }
    this._managers.clear();
  }
}

// ── Parsers ─────────────────────────────────────────────────────────────────

export function parseDeviceStatus(msg: string): DeviceStatusEvent | null {
  try {
    const data = JSON.parse(msg);
    if (typeof data.deviceId !== 'string' || typeof data.event !== 'string') return null;
    if (!['connected', 'disconnected', 'error'].includes(data.event)) return null;
    return {
      deviceId: data.deviceId,
      deviceType: data.deviceType ?? 'unknown',
      displayName: data.displayName ?? data.deviceType ?? 'Unknown Device',
      event: data.event,
      batteryPercent: typeof data.batteryPercent === 'number' ? data.batteryPercent : undefined,
      firmwareVersion: typeof data.firmwareVersion === 'string' ? data.firmwareVersion : undefined,
    };
  } catch {
    return null;
  }
}

export function parseDeviceTelemetry(msg: string): TelemetryEvent | null {
  try {
    const data = JSON.parse(msg);
    if (typeof data.deviceId !== 'string') return null;
    const heatingState = data.heatingState ?? 'idle';
    if (!['idle', 'heating', 'ready', 'active', 'cooling'].includes(heatingState)) return null;
    return {
      deviceId: data.deviceId,
      deviceType: data.deviceType ?? 'unknown',
      displayName: data.displayName ?? data.deviceType ?? 'Unknown Device',
      targetTemp: typeof data.targetTemp === 'number' ? data.targetTemp : null,
      actualTemp: typeof data.actualTemp === 'number' ? data.actualTemp : null,
      heatingState,
      batteryPercent: typeof data.batteryPercent === 'number' ? data.batteryPercent : undefined,
      profile: typeof data.profile === 'string' ? data.profile : undefined,
    };
  } catch {
    return null;
  }
}

export function parseSessionEvent(msg: string): SessionEvent | null {
  try {
    const data = JSON.parse(msg);
    if (typeof data.deviceId !== 'string' || typeof data.event !== 'string') return null;
    if (!['start', 'end', 'heartbeat'].includes(data.event)) return null;
    return {
      event: data.event,
      deviceId: data.deviceId,
      deviceType: data.deviceType ?? 'unknown',
      displayName: data.displayName ?? data.deviceType ?? 'Unknown Device',
      targetTemp: typeof data.targetTemp === 'number' ? data.targetTemp : undefined,
      peakTemp: typeof data.peakTemp === 'number' ? data.peakTemp : undefined,
    };
  } catch {
    return null;
  }
}
