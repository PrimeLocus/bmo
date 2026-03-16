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
};

export const beauState = $state<BeauState>({ ...defaultState });

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
const MAX_DELAY = 10000;
let intentionalClose = false;
let visibilityBound = false;

export function connectBeauWS() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (typeof window === 'undefined') return;
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;

  intentionalClose = false;

  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${window.location.host}/ws`);

  ws.onopen = () => {
    reconnectDelay = 1000; // reset on successful connect
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as BeauState;
      Object.assign(beauState, data);
    } catch {
      // ignore malformed frames
    }
  };

  ws.onclose = () => {
    ws = null;
    if (!intentionalClose) {
      reconnectTimer = setTimeout(connectBeauWS, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_DELAY);
    }
  };

  ws.onerror = () => {
    ws?.close();
  };

  // Re-check connection when tab becomes visible again
  if (!visibilityBound) {
    visibilityBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // If the socket is gone or closing, reconnect immediately
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          reconnectDelay = 1000;
          connectBeauWS();
        }
      }
    });
  }
}

export function disconnectBeauWS() {
  intentionalClose = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  ws?.close();
  ws = null;
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
