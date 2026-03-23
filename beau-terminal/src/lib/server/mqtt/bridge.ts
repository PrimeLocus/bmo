import mqtt from 'mqtt';
import { desc, eq, gte, isNull } from 'drizzle-orm';
import { db, sqlite } from '../db/index.js';
import { haikus, dispatches, journalEntries, noticings, personalitySnapshots } from '../db/schema.js';
import { logActivity } from '../db/activity.js';
import { TOPICS, SUBSCRIBE_TOPICS } from './topics.js';
import { environmentSnapshots, environmentEvents } from '../db/schema.js';
import { PresenceMachine, parsePresenceMessage } from '../environment/presence.js';
import { SleepMachine } from '../environment/sleep.js';
import { processLuxReading } from '../environment/lux.js';
import { startWeatherPolling, getSeasonalContext, formatWeatherSummary } from '../environment/weather.js';
import type { WeatherData } from '../environment/weather.js';
import { ResolumeSessionManager, parseResolumeLiveMessage } from '../creative/resolume.js';
import { WitnessController } from '../creative/witness.js';
import { DebriefScheduler, formatDebriefPrompt } from '../creative/debrief.js';
import { resolumeSessions, resolumeEvents, wellnessSessions, wellnessEvents } from '../db/schema.js';
import { WellnessDeviceCoordinator, parseDeviceStatus, parseDeviceTelemetry, parseSessionEvent } from '../wellness/sessions.js';
import { PersonalityEngine, DEFAULT_CONFIG } from '../personality/engine.js';
import type { ActivitySignals, PersonalityVector } from '../personality/types.js';
import { runCompaction, scheduleBackup, isNotable } from '../personality/compaction.js';

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
  // Phase 3
  resolumeActive: boolean;
  currentSessionId: number | null;
  currentClip: string | null;
  currentBpm: number | null;
  // Phase 5 — wellness
  wellnessSessionActive: boolean;
  wellnessDeviceType: string | null;
  wellnessDeviceName: string | null;
  wellnessTargetTemp: number | null;
  wellnessActualTemp: number | null;
  wellnessHeatingState: string | null;
  wellnessSessionId: number | null;
  wellnessBattery: number | null;
  wellnessProfile: string | null;
  // ── Personality Engine ──
  personalityVector: { wonder: number; reflection: number; mischief: number };
  personalityInterpretation: string;
  signalLayer: { wonder: number; reflection: number; mischief: number };
  momentumLayer: { wonder: number; reflection: number; mischief: number };
  signalSources: string[];
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
  // ── Personality Engine ──
  personalityVector: { wonder: 0.5, reflection: 0.3, mischief: 0.3 },
  personalityInterpretation: '',
  signalLayer: { wonder: 0.5, reflection: 0.3, mischief: 0.3 },
  momentumLayer: { wonder: 0.5, reflection: 0.3, mischief: 0.3 },
  signalSources: [],
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

  // T088: Close any wellness sessions left open by a previous server instance
  try {
    db.update(wellnessSessions).set({
      endedAt: new Date().toISOString(),
      status: 'interrupted',
    }).where(isNull(wellnessSessions.endedAt)).run();
  } catch { /* non-fatal */ }

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

  // T087: Track last user interaction time for sleep machine
  let lastInteractionAt = Date.now();

  // Phase 3 — Resolume session lifecycle
  let dbSessionId: number | null = null;
  let eventSequence = 0;

  const debriefScheduler = new DebriefScheduler({
    onDebrief: (sessionId) => {
      try {
        const session = db.select().from(resolumeSessions).where(eq(resolumeSessions.id, sessionId)).get();
        if (!session || session.debriefText) return;
        const startTime = new Date(session.startedAt).getTime();
        const endTime = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
        const durationMinutes = Math.round((endTime - startTime) / 60000);
        const clips = session.clipsUsedJson ? JSON.parse(session.clipsUsedJson) : [];
        const prompt = formatDebriefPrompt({
          durationMinutes,
          clips,
          bpmRange: [session.bpmMin ?? 0, session.bpmMax ?? 0],
          venue: session.venue ?? undefined,
        });
        _publish?.(TOPICS.command.prompt, prompt);
      } catch { /* non-fatal */ }
    },
  });

  const resolumeManager = new ResolumeSessionManager({
    onSessionStart: () => {
      // Always update state — DB persistence is best-effort
      state = { ...state, resolumeActive: true };
      eventSequence = 0;
      try {
        const result = db.insert(resolumeSessions).values({
          startedAt: new Date().toISOString(),
          beauPresent: state.presenceState === 'occupied',
        }).run();
        dbSessionId = Number(result.lastInsertRowid);
        state = { ...state, currentSessionId: dbSessionId };
      } catch (e) {
        console.warn('[bridge] resolume session DB insert failed:', e);
      }
      witnessController.onSessionStart(state.presenceState, state.mode);
      broadcast();
    },
    onSessionEnd: () => {
      if (dbSessionId) {
        const stats = resolumeManager.getSessionStats();
        try {
          db.update(resolumeSessions).set({
            endedAt: new Date().toISOString(),
            status: 'completed',
            bpmMin: stats?.bpmMin ?? null,
            bpmMax: stats?.bpmMax ?? null,
            bpmAvg: stats ? Math.round(stats.bpmSum / stats.eventCount) : null,
            clipsUsedJson: stats ? JSON.stringify(stats.clips) : null,
          }).where(eq(resolumeSessions.id, dbSessionId)).run();
        } catch { /* non-fatal */ }
        debriefScheduler.scheduleDebrief(dbSessionId);
      }
      witnessController.onSessionEnd();
      state = { ...state, resolumeActive: false, currentSessionId: null, currentClip: null, currentBpm: null };
      dbSessionId = null;
      broadcast();
    },
  });

  const witnessController = new WitnessController({
    onModeChange: (mode) => {
      state = { ...state, mode };
      _publish?.(TOPICS.state.mode, mode);
      broadcast();
    },
  });

  // T085: Per-device wellness session tracking (supports concurrent devices)
  const wellnessDbSessionIds = new Map<string, number>();
  const wellnessEventSequences = new Map<string, number>();

  const wellnessCoordinator = new WellnessDeviceCoordinator({
    onSessionStart: (info) => {
      // Update live state to the most recently started device
      state = {
        ...state,
        wellnessSessionActive: true,
        wellnessDeviceType: info.deviceType,
        wellnessDeviceName: info.displayName,
        wellnessTargetTemp: info.targetTemp,
        wellnessHeatingState: 'heating',
        wellnessBattery: info.batteryPercent ?? null,
        wellnessProfile: info.profile ?? null,
      };
      wellnessEventSequences.set(info.deviceId, 0);
      try {
        const result = db.insert(wellnessSessions).values({
          startedAt: new Date().toISOString(),
          deviceId: info.deviceId,
          deviceType: info.deviceType,
          displayName: info.displayName,
          targetTemp: info.targetTemp,
          batteryStart: info.batteryPercent ?? null,
          contextMode: state.mode,
        }).run();
        const newId = Number(result.lastInsertRowid);
        wellnessDbSessionIds.set(info.deviceId, newId);
        state = { ...state, wellnessSessionId: newId };
      } catch (e) {
        console.warn('[bridge] wellness session DB insert failed:', e);
      }
      logActivity('wellness_session', null, 'started',
        `${info.displayName} session started at ${info.targetTemp ?? '?'}°F`);
      broadcast();
    },
    onSessionEnd: (stats) => {
      if (stats) {
        const sessionId = wellnessDbSessionIds.get(stats.deviceId);
        if (sessionId) {
          const avgTemp = stats.tempReadings > 0 ? Math.round(stats.tempSum / stats.tempReadings) : null;
          try {
            const endedAt = new Date().toISOString();
            const startRow = db.select({ startedAt: wellnessSessions.startedAt })
              .from(wellnessSessions).where(eq(wellnessSessions.id, sessionId)).get();
            const durationSeconds = startRow
              ? Math.round((new Date(endedAt).getTime() - new Date(startRow.startedAt).getTime()) / 1000)
              : null;
            db.update(wellnessSessions).set({
              endedAt,
              status: 'completed',
              peakTemp: stats.peakTemp,
              avgTemp,
              profile: stats.profile,
              batteryEnd: stats.batteryPercent ?? null,
              durationSeconds,
            }).where(eq(wellnessSessions.id, sessionId)).run();
          } catch { /* non-fatal */ }
          wellnessDbSessionIds.delete(stats.deviceId);
          wellnessEventSequences.delete(stats.deviceId);
        }
      }
      logActivity('wellness_session', null, 'ended',
        `${stats?.displayName ?? 'Device'} session ended — ${stats?.peakTemp ?? '?'}°F peak`);
      // Only clear wellness state if no other device sessions remain active
      if (wellnessDbSessionIds.size === 0) {
        state = {
          ...state,
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
      }
      broadcast();
    },
  });

  // Start weather polling (no-op if API key not set)
  const weatherPoller = startWeatherPolling((weather, summary) => {
    state = { ...state, weather, weatherSummary: summary };
    broadcast();
  });

  // ── Personality Engine ────────────────────────────────────────────────────
  const personalityEngine = new PersonalityEngine(DEFAULT_CONFIG);

  // Deprecated emotionalState mapping — bridges old consumers
  function vectorToEmotionalState(v: { wonder: number; reflection: number; mischief: number }): string {
    const dominant = Math.max(v.wonder, v.reflection, v.mischief);
    if (dominant === v.reflection) return dominant > 0.6 ? 'reflective' : 'contemplative';
    if (dominant === v.mischief) return dominant > 0.6 ? 'mischievous' : 'playful';
    return dominant > 0.6 ? 'wonder' : 'curious';
  }

  // Activity signal cache — refreshed every 30 seconds
  let activityCache: ActivitySignals = {
    haikuRecent: false,
    journalRecent: false,
    dispatchRecent: false,
    ideaRecent: false,
    noticingRecent: false,
    debriefRecent: false,
  };

  function refreshActivityCache() {
    const cutoff30min = new Date(Date.now() - 30 * 60 * 1000);
    const cutoffText = cutoff30min.toISOString().replace('T', ' ').slice(0, 19);
    try {
      // haikus.createdAt is integer (timestamp mode) — compare with Date object
      activityCache.haikuRecent = !!db.select({ id: haikus.id })
        .from(haikus).where(gte(haikus.createdAt, cutoff30min)).limit(1).get();

      // journalEntries.createdAt is text (datetime format)
      activityCache.journalRecent = !!db.select({ id: journalEntries.id })
        .from(journalEntries).where(gte(journalEntries.createdAt, cutoffText)).limit(1).get();

      // dispatches.createdAt is text (datetime format)
      activityCache.dispatchRecent = !!db.select({ id: dispatches.id })
        .from(dispatches).where(gte(dispatches.createdAt, cutoffText)).limit(1).get();

      // ideas table has no timestamp column — always false
      activityCache.ideaRecent = false;

      // noticings.createdAt is text (datetime format)
      activityCache.noticingRecent = !!db.select({ id: noticings.id })
        .from(noticings).where(gte(noticings.createdAt, cutoffText)).limit(1).get();

      // resolumeSessions with debriefText written recently
      activityCache.debriefRecent = !!db.select({ id: resolumeSessions.id })
        .from(resolumeSessions).where(gte(resolumeSessions.createdAt, cutoffText)).limit(1).get();
    } catch (e) {
      console.error('[personality] activity cache refresh failed:', e);
    }
  }

  // Wire vector change → state update + snapshot persistence + MQTT publish
  let previousSnapshotVector: PersonalityVector = { ...DEFAULT_CONFIG.restingBaseline };
  let previousSnapshotMode: string = 'ambient';

  personalityEngine.onVectorChange((vector) => {
    // Consume snapshot once (getLastSnapshot clears after read)
    const snap = personalityEngine.getLastSnapshot();
    const derivedMode = personalityEngine.getDerivedMode();

    state = {
      ...state,
      personalityVector: vector,
      personalityInterpretation: personalityEngine.getInterpretation(),
      signalLayer: personalityEngine.getSignalLayer(),
      momentumLayer: personalityEngine.getMomentumLayer(),
      signalSources: snap?.sources ?? state.signalSources,
      mode: derivedMode,
      emotionalState: vectorToEmotionalState(vector),
    };
    broadcast();

    // Persist snapshot if engine produced one
    if (snap) {
      const hasCreativeActivity = activityCache.haikuRecent || activityCache.journalRecent || activityCache.ideaRecent;
      const hadModeTransition = derivedMode !== previousSnapshotMode;
      const notable = isNotable(vector, previousSnapshotVector, hasCreativeActivity, hadModeTransition);

      try {
        db.insert(personalitySnapshots).values({
          wonder: snap.wonder,
          reflection: snap.reflection,
          mischief: snap.mischief,
          signalWonder: snap.signalWonder,
          signalReflection: snap.signalReflection,
          signalMischief: snap.signalMischief,
          momentumWonder: snap.momentumWonder,
          momentumReflection: snap.momentumReflection,
          momentumMischief: snap.momentumMischief,
          derivedMode: snap.derivedMode,
          interpretation: snap.interpretation,
          sources: JSON.stringify(snap.sources),
          snapshotReason: snap.snapshotReason,
          isNotable: notable ? 1 : 0,
        }).run();
      } catch (e) {
        console.error('[personality] snapshot write failed:', e);
      }

      previousSnapshotVector = { ...vector };
      previousSnapshotMode = derivedMode;
    }
  });

  // Restore momentum from last persisted snapshot
  try {
    const lastSnapshot = db.select()
      .from(personalitySnapshots)
      .orderBy(desc(personalitySnapshots.timestamp))
      .limit(1)
      .get();
    if (lastSnapshot) {
      personalityEngine.restoreMomentum({
        wonder: lastSnapshot.momentumWonder,
        reflection: lastSnapshot.momentumReflection,
        mischief: lastSnapshot.momentumMischief,
      });
      console.log('[personality] Restored momentum from last snapshot');
    }
  } catch (e) {
    console.error('[personality] momentum restoration failed:', e);
  }

  // Start the engine tick loop
  personalityEngine.start(
    () => ({
      lux: state.lux,
      presenceState: state.presenceState as 'occupied' | 'empty' | 'uncertain',
      sleepState: state.sleepState as 'awake' | 'settling' | 'asleep' | 'waking',
      interactionAge: Math.floor((Date.now() - lastInteractionAt) / 1000),
      weather: state.weather?.condition ?? null,
      seasonalContext: state.seasonalContext || null,
      timeOfDay: new Date(),
      resolumeActive: state.resolumeActive,
    }),
    () => activityCache,
  );

  // Start activity cache refresh interval
  setInterval(refreshActivityCache, 30_000);
  refreshActivityCache();

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
        lastInteractionAt = Date.now(); // T087: wake word = explicit user interaction
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
          logActivity('haiku', null, 'created', 'New haiku written');
        } catch { /* non-fatal */ }
        break;
      case TOPICS.dispatcher.log:
        state = {
          ...state,
          dispatcherLog: [...state.dispatcherLog.slice(-99), msg],
        };
        lastInteractionAt = Date.now(); // T087: any dispatch = active conversation
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
            interactionAge: Math.floor((Date.now() - lastInteractionAt) / 1000),
          });
          maybeWriteSnapshot();
          witnessController.onPresenceChange(presenceMachine.state, resolumeManager.isActive);
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
      // Phase 3 — creative
      case TOPICS.creative.resolume.session:
        // External session status (informational — actual lifecycle driven by live events)
        break;
      case TOPICS.creative.resolume.live: {
        const liveEvent = parseResolumeLiveMessage(msg);
        if (liveEvent) {
          resolumeManager.onLiveEvent(liveEvent);
          state = { ...state, currentClip: liveEvent.clip, currentBpm: liveEvent.bpm };
          // Persist event
          if (dbSessionId) {
            try {
              db.insert(resolumeEvents).values({
                sessionId: dbSessionId,
                timestamp: new Date().toISOString(),
                sequence: eventSequence++,
                eventType: 'clip_change',
                payloadJson: JSON.stringify(liveEvent),
              }).run();
            } catch { /* non-fatal */ }
          }
        }
        break;
      }
      case TOPICS.creative.resolume.debrief:
        // Debrief arrives 3-5 min after session ends — no active session guard
        try {
          const parsed = JSON.parse(msg);
          if (typeof parsed.sessionId === 'number' && typeof parsed.text === 'string') {
            db.update(resolumeSessions).set({
              debriefText: parsed.text,
            }).where(eq(resolumeSessions.id, parsed.sessionId)).run();
          }
        } catch { /* ignore malformed */ }
        break;
      // Phase 5 — wellness
      case TOPICS.wellness.device.status: {
        const statusEvent = parseDeviceStatus(msg);
        if (statusEvent) {
          wellnessCoordinator.onDeviceStatus(statusEvent);
          logEnvironmentEvent('wellness_device_' + statusEvent.event,
            { deviceId: statusEvent.deviceId, deviceType: statusEvent.deviceType },
            'ble_bridge');
        }
        break;
      }
      case TOPICS.wellness.device.telemetry: {
        const telemetry = parseDeviceTelemetry(msg);
        if (telemetry) {
          wellnessCoordinator.onTelemetry(telemetry);
          state = {
            ...state,
            wellnessActualTemp: telemetry.actualTemp,
            wellnessTargetTemp: telemetry.targetTemp ?? state.wellnessTargetTemp,
            wellnessHeatingState: telemetry.heatingState,
            wellnessBattery: telemetry.batteryPercent ?? state.wellnessBattery,
          };
          const wellnessSessionId = wellnessDbSessionIds.get(telemetry.deviceId);
          if (wellnessSessionId) {
            const seq = wellnessEventSequences.get(telemetry.deviceId) ?? 0;
            try {
              db.insert(wellnessEvents).values({
                sessionId: wellnessSessionId,
                timestamp: new Date().toISOString(),
                sequence: seq,
                eventType: 'telemetry',
                payloadJson: JSON.stringify(telemetry),
              }).run();
              wellnessEventSequences.set(telemetry.deviceId, seq + 1);
            } catch { /* non-fatal */ }
          }
        }
        break;
      }
      case TOPICS.wellness.session: {
        const sessionEvent = parseSessionEvent(msg);
        if (sessionEvent) {
          wellnessCoordinator.onSessionEvent(sessionEvent);
        }
        break;
      }
    }
    broadcast();
  });

  return client;
}
