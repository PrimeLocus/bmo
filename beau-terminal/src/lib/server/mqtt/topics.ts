// MQTT topic constants and mode type definitions

export const TOPICS = {
  STATE_MODE: 'beau/state/mode',
  STATE_EMOTION: 'beau/state/emotion',
  INTENT_WAKE: 'beau/intent/wake',
  SENSORS_ENVIRONMENT: 'beau/sensors/environment',
  OUTPUT_HAIKU: 'beau/output/haiku',
  DISPATCHER_LOG: 'beau/dispatcher/log',
  SENSORS_CAMERA: 'beau/sensors/camera',
} as const;

export const SUBSCRIBE_TOPICS = Object.values(TOPICS);

export const MODES = ['ambient', 'witness', 'collaborator', 'archivist', 'social'] as const;

export type Mode = (typeof MODES)[number];
