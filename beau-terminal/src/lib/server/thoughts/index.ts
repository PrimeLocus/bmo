import type { ThoughtQueue } from './queue.js';
import type { TOPICS } from '../mqtt/topics.js';

type PublishFn = (topic: string, payload: string) => void;

let _queue: ThoughtQueue | null = null;
let _publish: PublishFn | null = null;
let _topics: typeof TOPICS | null = null;

export function registerThoughtSystem(
  queue: ThoughtQueue,
  publish: PublishFn,
  topics: typeof TOPICS,
) {
  _queue = queue;
  _publish = publish;
  _topics = topics;
}

export function getThoughtSystem() {
  if (!_queue) return null;
  return {
    queue: _queue,
    publishSurfaced(thought: { id: string; type: string; text: string | null; trigger: string; novelty: number }) {
      if (_publish && _topics) {
        _publish(_topics.thoughts.surfaced, JSON.stringify(thought));
      }
    },
  };
}
