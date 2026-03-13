// Memory retrieval policy engine
// Given mode + context, determines which memory sources to query and at what depth.
// Used by the Pi-side personality system to build RAG context.

export const MEMORY_SOURCES = [
  'journal',
  'haikus',
  'dispatches',
  'environment',
  'sessions',
  'noticings',
] as const;

export type MemorySource = (typeof MEMORY_SOURCES)[number];
export type RetrievalDepth = 'shallow' | 'moderate' | 'deep';

export type RetrievalPolicy = {
  sources: MemorySource[];
  maxDepth: RetrievalDepth;
  maxResults: number;
};

export type RetrievalContext = {
  maxResults?: number;
};

const MODE_POLICIES: Record<string, { sources: MemorySource[]; maxDepth: RetrievalDepth }> = {
  ambient: {
    sources: ['haikus', 'environment', 'noticings'],
    maxDepth: 'shallow',
  },
  witness: {
    sources: ['sessions', 'environment', 'haikus'],
    maxDepth: 'moderate',
  },
  collaborator: {
    sources: ['dispatches', 'journal', 'sessions', 'haikus', 'environment'],
    maxDepth: 'deep',
  },
  archivist: {
    sources: [...MEMORY_SOURCES],
    maxDepth: 'deep',
  },
  social: {
    sources: ['haikus', 'environment', 'sessions', 'noticings'],
    maxDepth: 'shallow',
  },
};

const DEFAULT_MAX_RESULTS = 5;

export function getRetrievalPolicy(mode: string, context: RetrievalContext): RetrievalPolicy {
  const modePolicy = MODE_POLICIES[mode];

  if (!modePolicy) {
    return {
      sources: ['haikus', 'environment'],
      maxDepth: 'shallow',
      maxResults: context.maxResults ?? DEFAULT_MAX_RESULTS,
    };
  }

  return {
    sources: [...modePolicy.sources],
    maxDepth: modePolicy.maxDepth,
    maxResults: context.maxResults ?? DEFAULT_MAX_RESULTS,
  };
}
