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
};

export const beauState = $state<BeauState>({ ...defaultState });

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 3000;
const MAX_DELAY = 60000;

export function connectBeauWS() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (typeof window === 'undefined') return;
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;

  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${window.location.host}/ws`);

  ws.onopen = () => {
    reconnectDelay = 3000; // reset on successful connect
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
    reconnectTimer = setTimeout(connectBeauWS, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY); // backoff: 3s → 6s → 12s → … → 60s
  };

  ws.onerror = () => {
    ws?.close();
  };
}

export function disconnectBeauWS() {
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
