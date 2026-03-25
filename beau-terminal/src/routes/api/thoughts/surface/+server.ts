import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getThoughtSystem } from '$lib/server/thoughts/index.js';
import { getState, patchState } from '$lib/server/mqtt/bridge.js';
import { enqueueMemory } from '$lib/server/memory/index.js';

export const POST: RequestHandler = async () => {
  const system = getThoughtSystem();
  if (!system) throw error(503, 'Thought system not initialized');

  const thought = system.queue.surface();
  if (!thought) throw error(404, 'No thought ready to surface');

  // Publish surfaced event via MQTT
  system.publishSurfaced(thought);

  // Update BeauState so SSE clients see the surfaced thought
  const patch: Record<string, unknown> = {
    lastThoughtText: thought.text,
    lastThoughtAt: thought.surfacedAt,
  };
  if (thought.type === 'haiku' && thought.text) {
    patch.lastHaiku = thought.text;
  }
  patchState(patch);

  // Enqueue surfaced thought for memory indexing
  if (thought.text) {
    enqueueMemory('haiku', thought.id, thought.text, { type: thought.type, trigger: thought.trigger });
  }

  return json({
    id: thought.id,
    type: thought.type,
    text: thought.text,
    trigger: thought.trigger,
    novelty: !!thought.novelty,
  });
};
