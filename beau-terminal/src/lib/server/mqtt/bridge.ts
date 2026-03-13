import mqtt from 'mqtt';
import { desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { haikus, dispatches } from '../db/schema.js';
import { TOPICS, SUBSCRIBE_TOPICS } from './topics.js';
import { environmentSnapshots, environmentEvents } from '../db/schema.js';
import { PresenceMachine, parsePresenceMessage } from '../environment/presence.js';
import { SleepMachine } from '../environment/sleep.js';
import { processLuxReading } from '../environment/lux.js';
import { startWeatherPolling, getSeasonalContext, formatWeatherSummary } from '../environment/weather.js';
import type { WeatherData } from '../environment/weather.js';

export type BeauState = {
  mode: string;
  emotionalState: string;
  wakeWord: string;
  environment: string;
  lastHaiku: string | null;
  dispatcherLog: string[];
  cameraActive: boolean;
  online: boolean;
  // Phase 2
  sleepState: string;
  presenceState: string;
  lux: number | null;
  luxLabel: string;
  weather: WeatherData | null;
  weatherSummary: string;
  seasonalContext: string;
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
  // Phase 2
  sleepState: 'awake',
  presenceState: 'uncertain',
  lux: null,
  luxLabel: '',
  weather: null,
  weatherSummary: '',
  seasonalContext: getSeasonalContext(),
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

let lastSnapshotTime = 0;
const SNAPSHOT_MIN_INTERVAL = 60_000; // 60 seconds

function logEnvironmentEvent(eventType: string, payload: Record<string, unknown>, source: string) {
  try {
    db.insert(environmentEvents).values({
      eventType,
      payloadJson: JSON.stringify(payload),
      source,
    }).run();
  } catch { /* non-fatal */ }
}

function maybeWriteSnapshot() {
  const now = Date.now();
  if (now - lastSnapshotTime < SNAPSHOT_MIN_INTERVAL) return;
  lastSnapshotTime = now;
  try {
    db.insert(environmentSnapshots).values({
      presenceState: state.presenceState || null,
      occupancyConfidence: null,
      lux: state.lux,
      sleepState: state.sleepState || null,
      weatherJson: state.weather ? JSON.stringify(state.weather) : null,
      seasonalSummary: state.seasonalContext || null,
      contextMode: state.mode || null,
    }).run();
  } catch { /* non-fatal */ }
}

export function connectMQTT() {
  backfillDispatcherLog();

  const presenceMachine = new PresenceMachine();
  const sleepMachine = new SleepMachine();

  // Sync presence changes to state
  presenceMachine.onChange((ps) => {
    state = { ...state, presenceState: ps };
    logEnvironmentEvent('presence_changed', { state: ps }, 'camera');
    broadcast();
  });

  // Sync sleep changes to state
  sleepMachine.onChange((ss) => {
    state = { ...state, sleepState: ss };
    logEnvironmentEvent(ss === 'asleep' ? 'sleep_entered' : ss === 'waking' ? 'wake_triggered' : 'sleep_state_changed', { state: ss }, 'system');
    broadcast();
  });

  // Start weather polling (no-op if API key not set)
  const weatherPoller = startWeatherPolling((weather, summary) => {
    state = { ...state, weather, weatherSummary: summary };
    broadcast();
  });

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
      case TOPICS.state.mode:
        state = { ...state, mode: msg };
        break;
      case TOPICS.state.emotion:
        state = { ...state, emotionalState: msg };
        break;
      case TOPICS.intent.wake:
        state = { ...state, wakeWord: msg };
        break;
      case TOPICS.sensors.environment:
        state = { ...state, environment: msg };
        break;
      case TOPICS.output.haiku:
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
      case TOPICS.dispatcher.log:
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
      case TOPICS.sensors.camera:
        state = { ...state, cameraActive: msg === 'active' };
        break;
      case TOPICS.state.sleep:
        // Direct MQTT override of sleep state (manual control)
        if (['awake', 'settling', 'asleep', 'waking'].includes(msg)) {
          sleepMachine.override(msg as any);
          state = { ...state, sleepState: msg };
        }
        break;
      case TOPICS.environment.presence: {
        const event = parsePresenceMessage(msg);
        if (event) {
          presenceMachine.onCameraEvent(event);
          // Also update sleep machine with latest conditions
          sleepMachine.update({
            presenceState: presenceMachine.state,
            lux: state.lux,
            interactionAge: 0, // TODO: track actual interaction age
          });
          maybeWriteSnapshot();
        }
        break;
      }
      case TOPICS.environment.lux: {
        const reading = processLuxReading(msg);
        if (reading) {
          state = { ...state, lux: reading.lux, luxLabel: reading.label };
          logEnvironmentEvent('lux_shift', { lux: reading.lux, label: reading.label }, 'lux_sensor');
          maybeWriteSnapshot();
        }
        break;
      }
      case TOPICS.environment.weather:
        try {
          const weatherData = JSON.parse(msg);
          state = { ...state, weather: weatherData, weatherSummary: formatWeatherSummary(weatherData) };
          maybeWriteSnapshot();
        } catch { /* ignore malformed */ }
        break;
      case TOPICS.environment.seasonal:
        state = { ...state, seasonalContext: msg };
        break;
    }
    broadcast();
  });

  return client;
}
