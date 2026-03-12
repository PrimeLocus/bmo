import mqtt from 'mqtt';
import { db } from '../db/index.js';
import { haikus } from '../db/schema.js';

export type BeauState = {
  mode: string;
  emotionalState: string;
  wakeWord: string;
  environment: string;
  lastHaiku: string | null;
  dispatcherLog: string[];
  cameraActive: boolean;
  online: boolean;
};

const DEFAULT_STATE: BeauState = {
  mode: 'ambient',
  emotionalState: 'curious',
  wakeWord: '',
  environment: '',
  lastHaiku: null,
  dispatcherLog: [],
  cameraActive: false,
  online: false,
};

let state: BeauState = { ...DEFAULT_STATE };
const listeners = new Set<(state: BeauState) => void>();

export function subscribeToState(fn: (state: BeauState) => void) {
  listeners.add(fn);
  fn({ ...state });
  return () => listeners.delete(fn);
}

export function getState(): BeauState {
  return { ...state };
}

function broadcast() {
  for (const fn of listeners) fn({ ...state });
}

let _publish: ((topic: string, message: string) => void) | null = null;

export function publishToMQTT(topic: string, message: string) {
  _publish?.(topic, message);
}

export function connectMQTT() {
  const brokerUrl = process.env.MQTT_URL || 'mqtt://localhost:1883';

  const client = mqtt.connect(brokerUrl, {
    clientId: `beaus-terminal-${Date.now()}`,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  });

  _publish = (topic: string, message: string) => {
    if (client.connected) {
      client.publish(topic, message);
    }
  };

  client.on('connect', () => {
    state = { ...state, online: true };
    broadcast();
    client.subscribe([
      'beau/state/mode',
      'beau/state/emotion',
      'beau/intent/wake',
      'beau/sensors/environment',
      'beau/output/haiku',
      'beau/dispatcher/log',
      'beau/sensors/camera',
    ]);
  });

  client.on('offline', () => {
    state = { ...state, online: false };
    broadcast();
  });

  let firstError = true;
  client.on('error', (err) => {
    if (firstError) {
      console.warn('[MQTT] broker unreachable, retrying in background:', err.message);
      firstError = false;
    }
    state = { ...state, online: false };
    broadcast();
  });

  client.on('reconnect', () => { firstError = false; });

  client.on('message', (topic, payload) => {
    const msg = payload.toString();
    switch (topic) {
      case 'beau/state/mode':
        state = { ...state, mode: msg };
        break;
      case 'beau/state/emotion':
        state = { ...state, emotionalState: msg };
        break;
      case 'beau/intent/wake':
        state = { ...state, wakeWord: msg };
        break;
      case 'beau/sensors/environment':
        state = { ...state, environment: msg };
        break;
      case 'beau/output/haiku':
        state = { ...state, lastHaiku: msg };
        try {
          db.insert(haikus).values({ text: msg, trigger: 'mqtt', mode: state.mode, createdAt: new Date() }).run();
        } catch { /* non-fatal */ }
        break;
      case 'beau/dispatcher/log':
        state = {
          ...state,
          dispatcherLog: [...state.dispatcherLog.slice(-99), msg],
        };
        break;
      case 'beau/sensors/camera':
        state = { ...state, cameraActive: msg === 'active' };
        break;
    }
    broadcast();
  });

  return client;
}
