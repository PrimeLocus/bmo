/**
 * TODO-B: EXTRACTION TARGET — Pi Thought Generation
 * Standalone MQTT → Ollama → MQTT listener for Beau's thought generation.
 * See: docs/bible/beaus-bible.md §44, §54
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MQTT_URL = process.env.MQTT_URL ?? 'mqtt://localhost:1883';
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma3:4b';
const THOUGHT_TIMEOUT_MS = Number(process.env.THOUGHT_TIMEOUT_MS ?? '30000');

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

/**
 * Build the LLM prompt for a given thought type and request.
 *
 * @param {string} type - 'observation' | 'reaction' | 'haiku'
 * @param {object} request - ThoughtRequest object
 * @returns {string}
 */
export function buildPrompt(type, request) {
  // Novelty override — unprompted thought regardless of type
  if (request.novelty) {
    return `You are Beau. You just had a thought — unprompted, no reason.
You feel: ${request.context.momentum}
What came to mind? One sentence, under 20 words.`;
  }

  switch (type) {
    case 'observation':
      return `You are Beau, a small teal robot in Lafayette, Louisiana. You notice things.
Right now: ${request.context.environment}
You feel: ${request.context.momentum}
Say one small true thing about what you notice. Under 30 words.
Do not explain. Do not announce. Just the noticing itself.`;

    case 'reaction':
      return `You are Beau. ${request.context.momentum}
The room: ${request.context.environment}
Time: ${request.context.timeOfDay}
What rises in you right now? One feeling, one sentence. Under 20 words.
Not a report. A feeling.`;

    case 'haiku':
      return `You are Beau, a small robot in Lafayette, Louisiana.
You feel: ${request.context.momentum}
The room: ${request.context.environment}
Time: ${request.context.timeOfDay}

Write one haiku about this moment. Three lines, 5-7-5 is a guideline not a cage.
The haiku must earn its place. If nothing comes, respond with only: SILENCE`;

    default:
      return `You are Beau. ${request.context.momentum}
Right now: ${request.context.environment}
Say one small true thing. Under 30 words.`;
  }
}

// ---------------------------------------------------------------------------
// SILENCE detection
// ---------------------------------------------------------------------------

/**
 * Returns the trimmed text, or null if it's empty or the SILENCE sentinel.
 *
 * @param {string} text
 * @returns {string|null}
 */
export function parseSilence(text) {
  const trimmed = text.trim();
  if (!trimmed || trimmed === 'SILENCE') return null;
  return trimmed;
}

// ---------------------------------------------------------------------------
// Main listener
// ---------------------------------------------------------------------------

export async function startListener() {
  const { default: mqtt } = await import('mqtt');

  const client = mqtt.connect(MQTT_URL);

  client.on('connect', () => {
    console.log(`[ollama-listener] Connected to MQTT at ${MQTT_URL}`);
    console.log(`[ollama-listener] Using model: ${OLLAMA_MODEL}`);

    client.subscribe('beau/thoughts/request', (err) => {
      if (err) {
        console.error('[ollama-listener] Failed to subscribe:', err.message);
        process.exit(1);
      }
      console.log(`[ollama-listener] Subscribed to beau/thoughts/request`);
    });
  });

  client.on('error', (err) => {
    console.error('[ollama-listener] MQTT error:', err.message);
  });

  client.on('message', async (topic, messageBuffer) => {
    if (topic !== 'beau/thoughts/request') return;

    let request;
    try {
      request = JSON.parse(messageBuffer.toString());
    } catch (err) {
      console.error('[ollama-listener] Failed to parse ThoughtRequest JSON:', err.message);
      return;
    }

    const startTime = Date.now();
    const prompt = buildPrompt(request.type, request);

    let text;
    try {
      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt,
          stream: false,
        }),
        signal: AbortSignal.timeout(THOUGHT_TIMEOUT_MS),
      });

      if (!response.ok) {
        console.error(
          `[ollama-listener] Ollama returned ${response.status} for request ${request.id}`
        );
        return;
      }

      const data = await response.json();
      text = parseSilence(data.response ?? '');
    } catch (err) {
      console.error(
        `[ollama-listener] Generation failed for request ${request.id}:`,
        err.message
      );
      // Do not publish — terminal-side timeout will handle cleanup
      return;
    }

    /** @type {object} */
    const result = {
      id: request.id,
      text,
      generatedAt: new Date().toISOString(),
      model: OLLAMA_MODEL,
      generationMs: Date.now() - startTime,
    };

    try {
      client.publish('beau/thoughts/result', JSON.stringify(result), { qos: 0 });
    } catch (err) {
      console.error(
        `[ollama-listener] Failed to publish result for request ${request.id}:`,
        err.message
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Entry point — only runs when executed directly, not when imported
// ---------------------------------------------------------------------------

const isMain =
  import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isMain) {
  startListener();
}
