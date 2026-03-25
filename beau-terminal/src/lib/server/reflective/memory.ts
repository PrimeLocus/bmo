// Memory retrieval policy engine
// Given mode + context, determines which memory sources to query and at what depth.
// Used by the Pi-side personality system to build RAG context.

import type { CollectionName } from '../memory/types.js';

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

// --- Collection-based policy (SP5 Memory/RAG) ---
// Maps (mode, caller) → ChromaDB collections + token budget.
// beau_private is NEVER accessible via 'prompt' caller (structural privacy boundary).

export interface CollectionPolicy {
  collections: CollectionName[];
  maxTokens: number;
}

type Caller = 'prompt' | 'thoughts' | 'internal';

const I: CollectionName = 'beau_identity';
const E: CollectionName = 'beau_experience';
const P: CollectionName = 'beau_private';

const COLLECTION_POLICIES: Record<string, { prompt: CollectionPolicy; thoughts: CollectionPolicy }> = {
  ambient:      { prompt: { collections: [I], maxTokens: 175 },       thoughts: { collections: [I], maxTokens: 175 } },
  witness:      { prompt: { collections: [I, E], maxTokens: 225 },    thoughts: { collections: [I, E], maxTokens: 225 } },
  collaborator: { prompt: { collections: [I, E], maxTokens: 350 },    thoughts: { collections: [I, E, P], maxTokens: 350 } },
  archivist:    { prompt: { collections: [I, E], maxTokens: 525 },    thoughts: { collections: [I, E, P], maxTokens: 525 } },
  social:       { prompt: { collections: [I, E], maxTokens: 175 },    thoughts: { collections: [I, E], maxTokens: 175 } },
};

const FALLBACK_POLICY: CollectionPolicy = { collections: [I], maxTokens: 175 };

export function getCollectionPolicy(mode: string, caller: Caller): CollectionPolicy {
  const entry = COLLECTION_POLICIES[mode];
  if (!entry) return { collections: [...FALLBACK_POLICY.collections], maxTokens: FALLBACK_POLICY.maxTokens };
  // 'internal' follows 'thoughts' rules (Beau's own cognition)
  const key = caller === 'prompt' ? 'prompt' : 'thoughts';
  const policy = entry[key];
  return { collections: [...policy.collections], maxTokens: policy.maxTokens };
}

// --- Legacy source-based policy (preserved for backward compat) ---

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
