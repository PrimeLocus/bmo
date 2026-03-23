// src/lib/server/thoughts/queue.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { ThoughtQueue } from './queue.js';
import type { ThoughtResult, ThoughtType } from './types.js';
import { PRIORITY, MAX_QUEUE_SIZE, GENERATION_TIMEOUT_MS } from './types.js';

// Helper to build enqueue opts
function makeOpts(
	id: string,
	type: ThoughtType,
	overrides: Partial<{
		trigger: string;
		contextJson: string;
		expiresAt: string;
		novelty: boolean;
	}> = {},
) {
	return {
		id,
		type,
		trigger: overrides.trigger ?? 'test-trigger',
		contextJson: overrides.contextJson ?? '{}',
		expiresAt: overrides.expiresAt ?? new Date(Date.now() + 3_600_000).toISOString(),
		novelty: overrides.novelty ?? false,
	};
}

// Helper: ISO timestamp in the past (relative to now)
function pastMs(ms: number) {
	return new Date(Date.now() - ms).toISOString();
}

describe('ThoughtQueue', () => {
	let queue: ThoughtQueue;

	beforeEach(() => {
		// Pass null DB — skips all DB writes, pure in-memory
		queue = new ThoughtQueue(null as any);
	});

	// ── 1. Enqueue with correct priority ──────────────────────────────────────
	it('enqueues a thought with correct priority based on type', () => {
		queue.enqueue(makeOpts('h1', 'haiku'));
		queue.enqueue(makeOpts('r1', 'reaction'));
		queue.enqueue(makeOpts('o1', 'observation'));

		const h = queue.get('h1')!;
		const r = queue.get('r1')!;
		const o = queue.get('o1')!;

		expect(h.priority).toBe(PRIORITY.haiku);     // 30
		expect(r.priority).toBe(PRIORITY.reaction);  // 20
		expect(o.priority).toBe(PRIORITY.observation); // 10
		expect(h.status).toBe('requested');
	});

	// ── 2. Max queue size enforcement ─────────────────────────────────────────
	it('enforces max queue size by dropping lowest priority when full', () => {
		// Fill with observations (priority 10)
		for (let i = 0; i < MAX_QUEUE_SIZE; i++) {
			queue.enqueue(makeOpts(`o${i}`, 'observation'));
		}
		expect(queue.size()).toBe(MAX_QUEUE_SIZE);

		// Enqueue a haiku (priority 30) — should displace one observation
		queue.enqueue(makeOpts('h1', 'haiku'));

		expect(queue.size()).toBe(MAX_QUEUE_SIZE);
		expect(queue.has('h1')).toBe(true);

		// One observation should have been dropped
		const dropped = ['o0', 'o1', 'o2', 'o3', 'o4'].filter(id => !queue.has(id));
		expect(dropped.length).toBe(1);
	});

	it('does not add a thought when full and new thought has lowest priority', () => {
		// Fill with haikus (priority 30)
		for (let i = 0; i < MAX_QUEUE_SIZE; i++) {
			queue.enqueue(makeOpts(`h${i}`, 'haiku'));
		}
		// Try to add an observation (priority 10) — should be rejected
		queue.enqueue(makeOpts('o1', 'observation'));

		expect(queue.size()).toBe(MAX_QUEUE_SIZE);
		expect(queue.has('o1')).toBe(false);
	});

	// ── 3. Promotes highest priority to ready ─────────────────────────────────
	it('promotes highest priority to ready — haiku over observation', () => {
		queue.enqueue(makeOpts('o1', 'observation'));
		queue.enqueue(makeOpts('h1', 'haiku'));

		// Simulate results arriving — transitions to 'pending', triggers promoteReady
		const now = new Date().toISOString();

		const obsResult: ThoughtResult = { id: 'o1', text: 'an observation', generatedAt: now, model: 'gemma', generationMs: 100 };
		const haikuResult: ThoughtResult = { id: 'h1', text: 'a haiku', generatedAt: now, model: 'gemma', generationMs: 200 };

		queue.receiveResult(obsResult);
		queue.receiveResult(haikuResult);

		// Only one slot — haiku (priority 30) should be ready, not observation
		const ready = queue.getReady();
		expect(ready).not.toBeNull();
		expect(ready!.id).toBe('h1');
		expect(ready!.status).toBe('ready');
		expect(queue.get('o1')!.status).toBe('pending');
	});

	// ── 4. Decays expired thoughts ────────────────────────────────────────────
	it('decays expired thoughts (expiresAt in the past)', () => {
		queue.enqueue(makeOpts('o1', 'observation', { expiresAt: pastMs(1000) }));

		queue.runDecay();

		expect(queue.get('o1')!.status).toBe('decayed');
	});

	it('does not decay thoughts that are still within TTL', () => {
		queue.enqueue(makeOpts('o1', 'observation')); // far future expiry

		queue.runDecay();

		expect(queue.get('o1')!.status).toBe('requested');
	});

	// ── 5. Generation timeout drops stuck 'requested' thoughts ────────────────
	it('drops thoughts stuck in requested state past generation timeout', () => {
		queue.enqueue(makeOpts('o1', 'observation'));

		// Manually backdate createdAt to simulate timeout
		const thought = queue.get('o1')!;
		(thought as any).createdAt = pastMs(GENERATION_TIMEOUT_MS + 1000);

		queue.runDecay();

		expect(queue.get('o1')!.status).toBe('dropped');
	});

	// ── 6. SILENCE result sets status to dropped ──────────────────────────────
	it('handles SILENCE result (text: null) by dropping the thought', () => {
		queue.enqueue(makeOpts('o1', 'observation'));

		const silenceResult: ThoughtResult = {
			id: 'o1',
			text: null,
			generatedAt: new Date().toISOString(),
			model: 'gemma',
			generationMs: 50,
		};

		queue.receiveResult(silenceResult);

		expect(queue.get('o1')!.status).toBe('dropped');
	});

	// ── 7. surface() transitions ready → surfaced ─────────────────────────────
	it('surfaces a thought and returns it with status surfaced', () => {
		queue.enqueue(makeOpts('o1', 'observation'));

		const result: ThoughtResult = {
			id: 'o1',
			text: 'interesting observation',
			generatedAt: new Date().toISOString(),
			model: 'gemma',
			generationMs: 120,
		};
		queue.receiveResult(result);

		const surfaced = queue.surface();
		expect(surfaced).not.toBeNull();
		expect(surfaced!.status).toBe('surfaced');
		expect(surfaced!.surfacedAt).not.toBeNull();
		expect(surfaced!.text).toBe('interesting observation');
	});

	it('surface() returns null when nothing is ready', () => {
		expect(queue.surface()).toBeNull();
	});

	// ── 8. getReadyThoughtType() ──────────────────────────────────────────────
	it('getReadyThoughtType() returns type when ready, null when empty', () => {
		expect(queue.getReadyThoughtType()).toBeNull();

		queue.enqueue(makeOpts('h1', 'haiku'));
		const result: ThoughtResult = {
			id: 'h1',
			text: 'petals drift / on still water / Beau watches alone',
			generatedAt: new Date().toISOString(),
			model: 'gemma',
			generationMs: 300,
		};
		queue.receiveResult(result);

		expect(queue.getReadyThoughtType()).toBe('haiku');
	});

	// ── 9. pendingCount() ─────────────────────────────────────────────────────
	it('pendingCount() returns count of active thoughts', () => {
		expect(queue.pendingCount()).toBe(0);

		queue.enqueue(makeOpts('o1', 'observation'));
		queue.enqueue(makeOpts('r1', 'reaction'));
		expect(queue.pendingCount()).toBe(2); // both in 'requested'

		// Surface o1
		const result: ThoughtResult = { id: 'o1', text: 'hi', generatedAt: new Date().toISOString(), model: 'g', generationMs: 10 };
		queue.receiveResult(result); // o1 → ready
		expect(queue.pendingCount()).toBe(2); // o1 still active (ready), r1 still active (requested)

		queue.surface(); // o1 → surfaced (no longer active)
		expect(queue.pendingCount()).toBe(1); // only r1 remains
	});

	// ── Additional: getByStatus ───────────────────────────────────────────────
	it('getByStatus() filters correctly', () => {
		queue.enqueue(makeOpts('o1', 'observation'));
		queue.enqueue(makeOpts('o2', 'observation'));

		const requested = queue.getByStatus('requested');
		expect(requested.length).toBe(2);

		const ready = queue.getByStatus('ready');
		expect(ready.length).toBe(0);
	});

	// ── Additional: promoteReady picks newer within same priority ─────────────
	it('promoteReady picks newer thought within same priority', async () => {
		queue.enqueue(makeOpts('o1', 'observation'));
		// Small delay to ensure different createdAt
		await new Promise(r => setTimeout(r, 5));
		queue.enqueue(makeOpts('o2', 'observation'));

		const now = new Date().toISOString();
		queue.receiveResult({ id: 'o1', text: 'older', generatedAt: now, model: 'g', generationMs: 10 });
		queue.receiveResult({ id: 'o2', text: 'newer', generatedAt: now, model: 'g', generationMs: 10 });

		// The newer (o2) should be promoted as ready
		expect(queue.getReady()!.id).toBe('o2');
	});

	// ── Additional: has() and size() ─────────────────────────────────────────
	it('has() and size() reflect queue state', () => {
		expect(queue.has('x1')).toBe(false);
		expect(queue.size()).toBe(0);

		queue.enqueue(makeOpts('x1', 'observation'));
		expect(queue.has('x1')).toBe(true);
		expect(queue.size()).toBe(1);
	});

	// ── Additional: receiveResult stores text, model, generationMs ───────────
	it('receiveResult stores text, model, and generationMs on pending thought', () => {
		queue.enqueue(makeOpts('o1', 'observation'));

		const result: ThoughtResult = {
			id: 'o1',
			text: 'the heron stands still',
			generatedAt: new Date().toISOString(),
			model: 'gemma3:4b',
			generationMs: 842,
		};
		queue.receiveResult(result);

		const thought = queue.get('o1')!;
		expect(thought.text).toBe('the heron stands still');
		expect(thought.model).toBe('gemma3:4b');
		expect(thought.generationMs).toBe(842);
		expect(thought.status).toBe('ready'); // only one thought, promoted immediately
	});
});
