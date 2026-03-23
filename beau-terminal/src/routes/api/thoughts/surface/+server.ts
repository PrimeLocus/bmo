import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getThoughtSystem } from '$lib/server/thoughts/index.js';

export const POST: RequestHandler = async () => {
  const system = getThoughtSystem();
  if (!system) throw error(503, 'Thought system not initialized');

  const thought = system.queue.surface();
  if (!thought) throw error(404, 'No thought ready to surface');

  // Publish surfaced event via MQTT
  system.publishSurfaced(thought);

  return json({
    id: thought.id,
    type: thought.type,
    text: thought.text,
    trigger: thought.trigger,
    novelty: !!thought.novelty,
  });
};
