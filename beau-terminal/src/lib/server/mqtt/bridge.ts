import mqtt from 'mqtt';
import { desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { haikus, dispatches } from '../db/schema.js';
import { TOPICS, SUBSCRIBE_TOPICS } from './topics.js';

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

function backfillDispatcherLog() {
  try {
    const recent = db.select({ querySummary: dispatches.querySummary })
      .from(dispatches)
      .orderBy(desc(dispatches.id))
      .limit(100)
      .all()
      .reverse();
    state = {
      ...state,
      dispatcherLog: recent
        .filter((r) => r.querySummary)
        .map((r) => r.querySummary as string),
    };
  } catch (err) {
    console.warn('[bridge] dispatcher backfill skipped:', (err as Error).message);
  }
}

export function connectMQTT() {
  backfillDispatcherLog();

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
    client.subscribe(SUBSCRIBE_TOPICS);
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
      case TOPICS.STATE_MODE:
        state = { ...state, mode: msg };
        break;
      case TOPICS.STATE_EMOTION:
        state = { ...state, emotionalState: msg };
        break;
      case TOPICS.INTENT_WAKE:
        state = { ...state, wakeWord: msg };
        break;
      case TOPICS.SENSORS_ENVIRONMENT:
        state = { ...state, environment: msg };
        break;
      case TOPICS.OUTPUT_HAIKU:
        state = { ...state, lastHaiku: msg };
        try {
          db.insert(haikus).values({
            text: msg,
            trigger: 'mqtt',
            mode: state.mode,
            createdAt: new Date(),
            haikuType: 'daily',
            wakeWord: state.wakeWord || null,
          }).run();
        } catch { /* non-fatal */ }
        break;
      case TOPICS.DISPATCHER_LOG:
        state = {
          ...state,
          dispatcherLog: [...state.dispatcherLog.slice(-99), msg],
        };
        // Persist JSON dispatcher messages to dispatches table
        try {
          const parsed = JSON.parse(msg);
          try {
            db.insert(dispatches).values({
              tier: parsed.tier ?? null,
              model: parsed.model ?? null,
              querySummary: parsed.query ?? null,
              routingReason: parsed.reason ?? null,
              contextMode: state.mode,
              durationMs: parsed.duration_ms ?? null,
            }).run();
          } catch (dbErr) {
            console.warn('[bridge] dispatch insert failed:', (dbErr as Error).message);
          }
        } catch {
          // Non-JSON dispatcher messages are just logged in-memory, not persisted
        }
        break;
      case TOPICS.SENSORS_CAMERA:
        state = { ...state, cameraActive: msg === 'active' };
        break;
    }
    broadcast();
  });

  return client;
}
