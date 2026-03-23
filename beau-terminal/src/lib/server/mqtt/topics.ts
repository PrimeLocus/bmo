// MQTT topic constants — canonical source for all topic strings and type unions

export const TOPICS = {
  state: {
    mode: 'beau/state/mode',
    emotion: 'beau/state/emotion',
    sleep: 'beau/state/sleep',
    online: 'beau/state/online',
  },
  intent: {
    wake: 'beau/intent/wake',
  },
  sensors: {
    environment: 'beau/sensors/environment',
    camera: 'beau/sensors/camera',
  },
  environment: {
    presence: 'beau/environment/presence',
    lux: 'beau/environment/lux',
    weather: 'beau/environment/weather',
    seasonal: 'beau/environment/seasonal',
  },
  output: {
    haiku: 'beau/output/haiku',
  },
  dispatcher: {
    log: 'beau/dispatcher/log',
  },
  command: {
    prompt: 'beau/command/prompt',
  },
  creative: {
    resolume: {
      session: 'beau/creative/resolume/session',
      live: 'beau/creative/resolume/live',
      debrief: 'beau/creative/resolume/debrief',
    },
  },
  wellness: {
    device: {
      status: 'beau/wellness/device/status',
      telemetry: 'beau/wellness/device/telemetry',
    },
    session: 'beau/wellness/session',
  },
  personality: {
    vector: 'beau/personality/vector',
    signal: 'beau/personality/signal',
    momentum: 'beau/personality/momentum',
    mode: 'beau/personality/mode',
    interpret: 'beau/personality/interpret',
  },
  voice: {
    listening: 'beau/voice/listening',
    speaking: 'beau/voice/speaking',
    thinking: 'beau/voice/thinking',
  },
  security: {
    stranger: 'beau/security/stranger',
  },
} as const;

// Topics the terminal subscribes to (inbound from BMO)
export const SUBSCRIBE_TOPICS: string[] = [
  // Phase 1
  TOPICS.state.mode,
  TOPICS.state.emotion,
  TOPICS.intent.wake,
  TOPICS.sensors.environment,
  TOPICS.output.haiku,
  TOPICS.dispatcher.log,
  TOPICS.sensors.camera,
  // Phase 2
  TOPICS.state.sleep,
  TOPICS.environment.presence,
  TOPICS.environment.lux,
  TOPICS.environment.weather,
  TOPICS.environment.seasonal,
  // Phase 3
  TOPICS.creative.resolume.session,
  TOPICS.creative.resolume.live,
  TOPICS.creative.resolume.debrief,
  // Phase 5 — wellness
  TOPICS.wellness.device.status,
  TOPICS.wellness.device.telemetry,
  TOPICS.wellness.session,
  // Face state — interaction signals
  TOPICS.voice.listening,
  TOPICS.voice.speaking,
  TOPICS.voice.thinking,
  TOPICS.security.stranger,
];

// ─── Type unions ───

export const MODES = ['ambient', 'witness', 'collaborator', 'archivist', 'social'] as const;
export type Mode = (typeof MODES)[number];

export const SLEEP_STATES = ['awake', 'settling', 'asleep', 'waking'] as const;
export type SleepState = (typeof SLEEP_STATES)[number];

export const PRESENCE_STATES = ['occupied', 'empty', 'uncertain'] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

export const HAIKU_TYPES = ['daily', 'emergence', 'reflective', 'seasonal', 'prompted'] as const;
export type HaikuType = (typeof HAIKU_TYPES)[number];

export const DISPATCH_TIERS = ['reflex', 'philosopher', 'heavy'] as const;
export type DispatchTier = (typeof DISPATCH_TIERS)[number];

export const DEVICE_TYPES = ['volcano-hybrid', 'puffco-peak-pro', 'dr-dabber-switch2'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const HEATING_STATES = ['idle', 'heating', 'ready', 'active', 'cooling'] as const;
export type HeatingState = (typeof HEATING_STATES)[number];

export const FACE_STATES = [
  'idle', 'listening', 'thinking', 'speaking', 'delighted',
  'witness', 'sleepy', 'unamused', 'mischievous', 'protective',
] as const;
export type FaceState = (typeof FACE_STATES)[number];
