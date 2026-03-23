import type { SectionName } from './sections.js';
import type { Mode } from '../mqtt/topics.js';

export type InjectionLevel = 'always' | 'full' | 'compact' | 'minimal' | 'omit' | 'if relevant';

// Mode x Section injection matrix
// Defines which prompt sections to include and at what detail level per mode
export const INJECTION_POLICY: Record<SectionName, Record<Mode, InjectionLevel>> = {
  CORE_IDENTITY:          { ambient: 'always', witness: 'always', collaborator: 'always', archivist: 'always', social: 'always' },
  SOUL_CODE:              { ambient: 'always', witness: 'always', collaborator: 'always', archivist: 'always', social: 'always' },
  VOICE_IDENTITY:         { ambient: 'always', witness: 'always', collaborator: 'always', archivist: 'always', social: 'always' },
  CONTEXT:                { ambient: 'always', witness: 'always', collaborator: 'always', archivist: 'always', social: 'always' },
  WAKE_WORD_PROTOCOL:     { ambient: 'always', witness: 'always', collaborator: 'always', archivist: 'always', social: 'always' },
  MODE_PROTOCOL:          { ambient: 'always', witness: 'always', collaborator: 'always', archivist: 'always', social: 'always' },
  VOICE_RULES:            { ambient: 'always', witness: 'always', collaborator: 'always', archivist: 'always', social: 'always' },
  LOUISIANA_GROUNDING:    { ambient: 'always', witness: 'always', collaborator: 'always', archivist: 'always', social: 'always' },
  PERSONALITY_LAYERS:     { ambient: 'always', witness: 'always', collaborator: 'always', archivist: 'always', social: 'always' },
  MEMORY:                 { ambient: 'compact', witness: 'minimal', collaborator: 'full', archivist: 'full', social: 'compact' },
  ENVIRONMENTAL_AWARENESS:{ ambient: 'full', witness: 'full', collaborator: 'compact', archivist: 'compact', social: 'compact' },
  NATAL_SELF_KNOWLEDGE:   { ambient: 'omit', witness: 'omit', collaborator: 'if relevant', archivist: 'if relevant', social: 'omit' },
  DOCUMENTATION_PHILOSOPHY:{ ambient: 'omit', witness: 'omit', collaborator: 'omit', archivist: 'omit', social: 'omit' },
  RAG_INJECTION:          { ambient: 'compact', witness: 'minimal', collaborator: 'full', archivist: 'full', social: 'compact' },
  CLOSING:                { ambient: 'always', witness: 'always', collaborator: 'always', archivist: 'always', social: 'always' },
};

// RAG chunk limits per mode
export const RAG_CHUNK_LIMITS: Record<Mode, number> = {
  ambient: 3,
  witness: 1,
  collaborator: 5,
  archivist: 5,
  social: 2,
};

// Placeholder fallback values
export const PLACEHOLDER_FALLBACKS: Record<string, string> = {
  SOUL_CODE_HAIKU: 'not yet written',
  VOICE_MODEL_VERSION: 'v0 (pre-training)',
  WAKE_WORD: '',
  MODE: 'ambient',
  ENVIRONMENT: '',
  TIME_OF_DAY: '',
  SLEEP_STATE: 'awake',
  PRESENCE_STATE: 'unknown',
  SEASONAL_CONTEXT: '',
  EMOTIONAL_STATE: 'present and quiet, settling in',
  WEATHER_SUMMARY: '',
  LUX_CONTEXT: '',
  NATAL_SUMMARY: '',
  RAG_FRAGMENTS: '',
};
