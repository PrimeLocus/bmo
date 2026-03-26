// src/lib/server/brain/prepare.ts
// Brain Dispatcher — SP6 Task 4
// Translates a BrainRequest + RoutePlan into a ready-to-send prompt string.
// SP7 Task 5: returns PrepareResult with provenance metadata.

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { formatFragments, RETRIEVAL_TIMEOUT_MS } from '../memory/types.js';
import { assemblePrompt, buildReflexPrompt } from '../prompt/assembler.js';
import type { BrainRequestV1, RoutePlan } from './types.js';
import type { MemoryProvider } from '../memory/provider.js';
import type { Mode } from '../mqtt/topics.js';
import type { PrepareResult, RetrievalProvenance } from '../training/types.js';

// ---------------------------------------------------------------------------
// State snapshot type — values needed for placeholder substitution
// ---------------------------------------------------------------------------

export interface PrepareState {
  mode: string;
  environment: string;
  wakeWord: string;
  personalityVector?: { wonder: number; reflection: number; mischief: number };
  timeOfDay?: string;
  sleepState?: string;
  presenceState?: string;
  weather?: string;
  lux?: string;
  soulCode?: string;
  voiceVersion?: string;
  natal?: string;
  [key: string]: unknown;
}

export type GetMemProvider = () => MemoryProvider | null;
export type GetState = () => PrepareState;

// ---------------------------------------------------------------------------
// Provenance constants + helpers
// ---------------------------------------------------------------------------

export const ASSEMBLER_VERSION = '1.0.0';

/** SHA-256 hex digest of a string (deterministic, no salt) */
export function computeHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Memory retrieval result — carries both formatted text and provenance
// ---------------------------------------------------------------------------

interface RetrievalResult {
  memoryContext: string;
  provenance: RetrievalProvenance[];
}

// ---------------------------------------------------------------------------
// Memory retrieval helper — fail-open with 2s timeout
// ---------------------------------------------------------------------------

async function retrieveMemory(
  query: string,
  mode: string,
  caller: 'thoughts' | 'prompt',
  tokenBudget: number,
  getMemProvider: GetMemProvider,
): Promise<RetrievalResult> {
  const empty: RetrievalResult = { memoryContext: '', provenance: [] };
  const mem = getMemProvider();
  if (!mem) return empty;

  try {
    const retrieval = mem.retrieve(query, {
      mode,
      caller,
      maxTokens: tokenBudget,
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('retrieval timeout')), RETRIEVAL_TIMEOUT_MS),
    );

    const { fragments, provenance } = await Promise.race([retrieval, timeout]);

    if (fragments.length === 0) return { memoryContext: '', provenance };

    const formatted = formatFragments(fragments);
    return {
      memoryContext: `Some things you remember:\n${formatted}`,
      provenance,
    };
  } catch {
    // Fail-open: ChromaDB unreachable, timeout, or any other error
    return empty;
  }
}

// ---------------------------------------------------------------------------
// prepareThoughtPrompt
// ---------------------------------------------------------------------------

/**
 * Build a self-contained LLM prompt for a thought.generate request.
 * Templates ported from scripts/ollama-listener.js.
 * Memory retrieval is fail-open: proceeds without context if unavailable.
 */
export async function prepareThoughtPrompt(
  request: Extract<BrainRequestV1, { kind: 'thought.generate' }>,
  plan: RoutePlan,
  getMemProvider: GetMemProvider,
): Promise<PrepareResult> {
  const { context, novelty } = request.input;
  const { environment, momentum, mode, timeOfDay } = context;

  // Retrieve memory context (fail-open)
  const { memoryContext, provenance: retrievals } = await retrieveMemory(
    `${environment} ${mode}`,
    mode,
    'thoughts',
    plan.memoryTokenBudget,
    getMemProvider,
  );

  let prompt: string;

  // Novelty override — unprompted thought, no type discrimination
  if (novelty) {
    const parts = [
      `You are Beau. You just had a thought — unprompted, no reason.`,
      `You feel: ${momentum}`,
    ];
    if (memoryContext) parts.push(memoryContext);
    parts.push(`What came to mind? One sentence, under 20 words.`);
    prompt = parts.join('\n');
  } else if (request.input.type === 'observation') {
    const parts = [
      `You are Beau, a small teal robot in Lafayette, Louisiana. You notice things.`,
      `Right now: ${environment}`,
      `You feel: ${momentum}`,
    ];
    if (memoryContext) parts.push(memoryContext);
    parts.push(
      `Say one small true thing about what you notice. Under 30 words.`,
      `Do not explain. Do not announce. Just the noticing itself.`,
    );
    prompt = parts.join('\n');
  } else if (request.input.type === 'reaction') {
    const parts = [
      `You are Beau. ${momentum}`,
      `The room: ${environment}`,
      `Time: ${timeOfDay}`,
    ];
    if (memoryContext) parts.push(memoryContext);
    parts.push(
      `What rises in you right now? One feeling, one sentence. Under 20 words.`,
      `Not a report. A feeling.`,
    );
    prompt = parts.join('\n');
  } else if (request.input.type === 'haiku') {
    const parts = [
      `You are Beau, a small robot in Lafayette, Louisiana.`,
      `You feel: ${momentum}`,
      `The room: ${environment}`,
      `Time: ${timeOfDay}`,
    ];
    if (memoryContext) parts.push('', memoryContext);
    parts.push(
      ``,
      `Write one haiku about this moment. Three lines, 5-7-5 is a guideline not a cage.`,
      `The haiku must earn its place. If nothing comes, respond with only: SILENCE`,
    );
    prompt = parts.join('\n');
  } else {
    throw new Error(`prepareThoughtPrompt: unknown thought type "${request.input.type}"`);
  }

  // For thought prompts, templateHash is a hash of the assembled prompt parts
  // (there is no separate system prompt template for thoughts)
  const templateHash = computeHash(prompt);

  return {
    prompt,
    provenance: {
      templateHash,
      promptPolicyVersion: '1.0.0',
      retrievalPolicyVersion: '1.0.0',
      assemblerVersion: ASSEMBLER_VERSION,
      promptProfile: plan.promptProfile,
      promptHash: computeHash(prompt),
    },
    retrievals,
  };
}

// ---------------------------------------------------------------------------
// prepareManualPrompt
// ---------------------------------------------------------------------------

/**
 * Build a full or reflex-tier prompt for a manual.prompt request.
 * Reads system prompt template, substitutes placeholders, appends RAG + user text.
 *
 * @param request   The BrainRequest (manual.prompt)
 * @param plan      The resolved RoutePlan (supplies promptProfile + memoryTokenBudget)
 * @param getMemProvider  Getter for the MemoryProvider singleton (may return null)
 * @param getState  Getter for current BeauState values used in placeholder substitution
 * @param promptText  Optional system prompt text (defaults to reading docs/bible/bmo-system-prompt.md)
 */
export async function prepareManualPrompt(
  request: Extract<BrainRequestV1, { kind: 'manual.prompt' }>,
  plan: RoutePlan,
  getMemProvider: GetMemProvider,
  getState: GetState,
  promptText?: string,
): Promise<PrepareResult> {
  const userText = request.input.text;

  // Load system prompt text — injected in tests, read from disk in production
  const template = promptText ?? loadSystemPrompt();

  // Retrieve memory context (fail-open)
  const { memoryContext, provenance: retrievals } = await retrieveMemory(
    userText,
    'ambient', // default mode for prompt retrieval; overridden below with real mode
    'prompt',
    plan.memoryTokenBudget,
    getMemProvider,
  );

  // Get current state values for placeholder substitution
  const state = getState();
  const mode = (state.mode ?? 'ambient') as Mode;

  const values: Record<string, string> = {
    MODE: state.mode ?? 'ambient',
    ENVIRONMENT: state.environment ?? '',
    WAKE_WORD: state.wakeWord ?? '',
    TIME_OF_DAY: state.timeOfDay ?? '',
    SLEEP_STATE: state.sleepState ?? 'awake',
    PRESENCE_STATE: state.presenceState ?? 'unknown',
    WEATHER_SUMMARY: state.weather ?? '',
    LUX_CONTEXT: state.lux ?? '',
    SOUL_CODE_HAIKU: state.soulCode ?? '',
    VOICE_MODEL_VERSION: state.voiceVersion ?? '',
    NATAL_SUMMARY: state.natal ?? '',
    RAG_FRAGMENTS: memoryContext,
    EMOTIONAL_STATE: '',
  };

  // Assemble system prompt based on profile
  let systemPrompt: string;
  if (plan.promptProfile === 'reflex') {
    systemPrompt = buildReflexPrompt(template, mode, values);
  } else {
    systemPrompt = assemblePrompt(template, mode, values);
  }

  // Append memory fragments and user text
  const parts: string[] = [systemPrompt];

  if (memoryContext) {
    parts.push(memoryContext);
  }

  parts.push(userText);

  const prompt = parts.join('\n\n');

  // Compute provenance — templateHash from raw template, promptHash from final assembled text
  const templateHash = computeHash(template);

  return {
    prompt,
    provenance: {
      templateHash,
      promptPolicyVersion: '1.0.0',
      retrievalPolicyVersion: '1.0.0',
      assemblerVersion: ASSEMBLER_VERSION,
      promptProfile: plan.promptProfile,
      promptHash: computeHash(prompt),
    },
    retrievals,
  };
}

// ---------------------------------------------------------------------------
// loadSystemPrompt — reads from docs/bible/bmo-system-prompt.md
// ---------------------------------------------------------------------------

function loadSystemPrompt(): string {
  // beau-terminal/ is the working directory at runtime; prompt lives in ../docs/bible/
  const promptPath = join(process.cwd(), '..', 'docs', 'bible', 'bmo-system-prompt.md');
  try {
    return readFileSync(promptPath, 'utf8');
  } catch {
    // Graceful degradation — return a minimal identity stub
    return `<!-- SECTION: CORE_IDENTITY -->\nYou are Beau.`;
  }
}

// ---------------------------------------------------------------------------
// preparePrompt — dispatcher
// ---------------------------------------------------------------------------

/**
 * Top-level dispatcher: routes to prepareThoughtPrompt or prepareManualPrompt
 * based on request kind.
 *
 * Returns a PrepareResult containing the assembled prompt string, provenance
 * metadata (template hash, policy versions, prompt hash), and retrieval
 * provenance from the memory system.
 *
 * @param request        The BrainRequest to prepare
 * @param plan           The resolved RoutePlan
 * @param getMemProvider Getter for the MemoryProvider singleton
 * @param getState       Getter for current BeauState (required for manual.prompt)
 * @param promptText     Optional system prompt override (for testing)
 */
export async function preparePrompt(
  request: BrainRequestV1,
  plan: RoutePlan,
  getMemProvider: GetMemProvider,
  getState?: GetState,
  promptText?: string,
): Promise<PrepareResult> {
  if (request.kind === 'thought.generate') {
    return prepareThoughtPrompt(request, plan, getMemProvider);
  }

  if (request.kind === 'manual.prompt') {
    const stateGetter = getState ?? (() => ({
      mode: 'ambient',
      environment: '',
      wakeWord: '',
    }));
    return prepareManualPrompt(request, plan, getMemProvider, stateGetter, promptText);
  }

  throw new Error(`preparePrompt: unknown request kind "${(request as BrainRequestV1).kind}"`);
}
