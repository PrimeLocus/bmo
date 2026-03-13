// Section markers used in bmo-system-prompt.md
// Format in the markdown file: <!-- SECTION: NAME -->

export const SECTIONS = [
  'CORE_IDENTITY',
  'SOUL_CODE',
  'VOICE_IDENTITY',
  'CONTEXT',
  'WAKE_WORD_PROTOCOL',
  'MODE_PROTOCOL',
  'VOICE_RULES',
  'LOUISIANA_GROUNDING',
  'PERSONALITY_LAYERS',
  'MEMORY',
  'ENVIRONMENTAL_AWARENESS',
  'NATAL_SELF_KNOWLEDGE',
  'DOCUMENTATION_PHILOSOPHY',
  'RAG_INJECTION',
  'CLOSING',
] as const;

export type SectionName = (typeof SECTIONS)[number];
