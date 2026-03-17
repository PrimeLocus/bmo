import type { BeauState } from '$lib/server/mqtt/bridge.js';

const defaultState: BeauState = {
  mode: 'ambient',
  emotionalState: 'curious',
  wakeWord: '',
  environment: '',
  lastHaiku: null,
  dispatcherLog: [],
  cameraActive: false,
  online: false,
  // Phase 2
  sleepState: 'awake',
  presenceState: 'uncertain',
  lux: null,
  luxLabel: '',
  weather: null,
  weatherSummary: '',
  seasonalContext: '',
  // Phase 3
  resolumeActive: false,
  currentSessionId: null,
  currentClip: null,
  currentBpm: null,
  // Phase 5 — wellness
  wellnessSessionActive: false,
  wellnessDeviceType: null,
  wellnessDeviceName: null,
  wellnessTargetTemp: null,
  wellnessActualTemp: null,
  wellnessHeatingState: null,
  wellnessSessionId: null,
  wellnessBattery: null,
  wellnessProfile: null,
};

export const beauState = $state<BeauState>({ ...defaultState });

let es: EventSource | null = null;
let visibilityBound = false;

export function connectBeauStream() {
  if (typeof window === 'undefined') return;
  if (es && es.readyState !== EventSource.CLOSED) return;

  es = new EventSource('/api/sse');

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as BeauState;
      Object.assign(beauState, data);
    } catch {
      // ignore malformed frames
    }
  };

  es.onerror = () => {
    // EventSource reconnects automatically using the server's retry interval (3s).
    // If the connection is permanently closed (server returned non-2xx), reopen.
    if (es?.readyState === EventSource.CLOSED) {
      es = null;
      setTimeout(connectBeauStream, 3000);
    }
  };

  // Reconnect immediately when tab becomes visible again
  if (!visibilityBound) {
    visibilityBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (!es || es.readyState === EventSource.CLOSED) {
          connectBeauStream();
        }
      }
    });
  }
}

export function disconnectBeauStream() {
  es?.close();
  es = null;
}

export const MODE_LABELS: Record<string, string> = {
  ambient: 'Ambient',
  witness: 'Witness',
  collaborator: 'Collaborator',
  archivist: 'Archivist',
  social: 'Social',
};

export const EMOTION_LABELS: Record<string, string> = {
  curious: 'Curious',
  contemplative: 'Contemplative',
  playful: 'Playful',
  sleepy: 'Sleepy',
};

export const SLEEP_LABELS: Record<string, string> = {
  awake: 'Awake',
  settling: 'Settling',
  asleep: 'Asleep',
  waking: 'Waking',
};

export const PRESENCE_LABELS: Record<string, string> = {
  occupied: 'Occupied',
  empty: 'Empty',
  uncertain: 'Uncertain',
};
