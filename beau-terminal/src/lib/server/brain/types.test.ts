import { describe, it, expect } from 'vitest';
import {
  TIER_IDS, TIER_ORDER,
  makeBrainRequest, makeThoughtRequest, makeManualRequest,
  type TierId, type BrainRequestV1, type TierConfig,
} from './types.js';

describe('brain/types', () => {
  describe('TIER_ORDER', () => {
    it('maps tier IDs to numeric order', () => {
      expect(TIER_ORDER.t1).toBe(0);
      expect(TIER_ORDER.t2).toBe(1);
      expect(TIER_ORDER.t3).toBe(2);
      expect(TIER_ORDER.t4).toBe(3);
    });
  });

  describe('makeThoughtRequest', () => {
    it('creates a thought.generate request with defaults', () => {
      const req = makeThoughtRequest({
        type: 'haiku',
        trigger: 'idle',
        novelty: false,
        context: {
          vector: { wonder: 0.5, reflection: 0.8, mischief: 0.2 },
          mode: 'ambient',
          timeOfDay: 'evening',
          environment: 'quiet room, dim light',
          momentum: 'contemplative',
        },
        constraints: { maxLength: 17, tone: 'contemplative' },
      });
      expect(req.v).toBe(1);
      expect(req.kind).toBe('thought.generate');
      expect(req.origin).toBe('thoughts');
      expect(req.requestId).toBeTruthy();
      expect(req.input.type).toBe('haiku');
    });
  });

  describe('makeManualRequest', () => {
    it('creates a manual.prompt request', () => {
      const req = makeManualRequest({ text: 'What do you see?', label: 'test' });
      expect(req.kind).toBe('manual.prompt');
      expect(req.origin).toBe('console');
      expect(req.input.text).toBe('What do you see?');
    });
  });
});
