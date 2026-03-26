// src/lib/server/thoughts/queue.ts

/**
 * TODO-B: EXTRACTION TARGET — Pi Thought Service
 * ThoughtQueue manages the in-memory priority queue for pending thoughts,
 * backed by SQLite for persistence across restarts.
 * See: docs/bible/beaus-bible.md §44, §54
 */

import { eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { pendingThoughts } from '../db/schema.js';
import {
	PRIORITY,
	MAX_QUEUE_SIZE,
	MAX_DAILY_HAIKU,
	MAX_DAILY_THOUGHTS,
	GENERATION_TIMEOUT_MS,
	type ThoughtResult,
	type ThoughtStatus,
	type ThoughtType,
	type DailyBudgetStatus,
} from './types.js';
import { recordFeedback } from '../training/feedback.js';

// ── Internal shape ────────────────────────────────────────────────────────────

export interface PendingThought {
	id: string;
	type: ThoughtType;
	trigger: string;
	text: string | null;
	status: ThoughtStatus;
	priority: number;
	contextJson: string;
	createdAt: string;
	generatedAt: string | null;
	surfacedAt: string | null;
	expiresAt: string;
	novelty: boolean;
	model: string | null;
	generationMs: number | null;
}

// ── EnqueueOpts ───────────────────────────────────────────────────────────────

export interface EnqueueOpts {
	id: string;
	type: ThoughtType;
	trigger: string;
	contextJson: string;
	expiresAt: string; // ISO timestamp
	novelty: boolean;
}

// ── Active statuses (not terminal) ───────────────────────────────────────────

const ACTIVE_STATUSES: Set<ThoughtStatus> = new Set([
	'requested', 'generating', 'pending', 'ready',
]);

// ── ThoughtQueue ─────────────────────────────────────────────────────────────

export class ThoughtQueue {
	private thoughts: Map<string, PendingThought> = new Map();
	private db: BetterSQLite3Database<any> | null;

	constructor(db: BetterSQLite3Database<any> | null) {
		this.db = db;
		if (db) {
			this._loadFromDb();
		}
	}

	// ── Public API ─────────────────────────────────────────────────────────────

	/**
	 * Add a new thought to the queue.
	 * Assigns priority from PRIORITY map. Enforces MAX_QUEUE_SIZE by dropping
	 * the lowest-priority thought if the queue is full. If the new thought
	 * itself is the lowest priority, it is not added.
	 */
	enqueue(opts: EnqueueOpts): PendingThought | null {
		const thought: PendingThought = {
			id: opts.id,
			type: opts.type,
			trigger: opts.trigger,
			text: null,
			status: 'requested',
			priority: PRIORITY[opts.type],
			contextJson: opts.contextJson,
			createdAt: new Date().toISOString(),
			generatedAt: null,
			surfacedAt: null,
			expiresAt: opts.expiresAt,
			novelty: opts.novelty,
			model: null,
			generationMs: null,
		};

		if (this.thoughts.size >= MAX_QUEUE_SIZE) {
			// Find the lowest-priority thought currently in the queue
			const lowestExisting = this._findLowestPriority();
			if (lowestExisting && lowestExisting.priority < thought.priority) {
				// Drop the lowest existing to make room
				this._updateStatus(lowestExisting.id, 'dropped');
				this.thoughts.delete(lowestExisting.id);
			} else {
				// New thought has same or lower priority — reject it
				return null;
			}
		}

		this.thoughts.set(thought.id, thought);
		this._dbUpsert(thought);
		return thought;
	}

	/**
	 * Handle an LLM result for a thought.
	 * If text is null (SILENCE), mark as 'dropped'.
	 * Otherwise, fill in text/model/generationMs and move to 'pending',
	 * then call promoteReady().
	 */
	receiveResult(result: ThoughtResult): void {
		const thought = this.thoughts.get(result.id);
		if (!thought) return;

		if (result.text === null) {
			thought.status = 'dropped';
			this._dbUpdate(thought);
			recordFeedback({ requestId: thought.id, reviewer: 'system', outcomeType: 'dropped' });
			return;
		}

		thought.text = result.text;
		thought.generatedAt = result.generatedAt;
		thought.model = result.model;
		thought.generationMs = result.generationMs;
		thought.status = 'pending';
		this._dbUpdate(thought);

		this._promoteReady();
	}

	/** Returns the thought currently in 'ready' state, or null. */
	getReady(): PendingThought | null {
		for (const t of this.thoughts.values()) {
			if (t.status === 'ready') return t;
		}
		return null;
	}

	/**
	 * Transitions the 'ready' thought to 'surfaced' (sets surfacedAt).
	 * Returns the thought, or null if nothing is ready.
	 */
	surface(): PendingThought | null {
		const thought = this.getReady();
		if (!thought) return null;

		thought.status = 'surfaced';
		thought.surfacedAt = new Date().toISOString();
		this._dbUpdate(thought);
		recordFeedback({ requestId: thought.id, reviewer: 'system', outcomeType: 'surfaced' });
		return thought;
	}

	/**
	 * Check all active thoughts for expiry or generation timeout.
	 * - expiresAt in the past → 'decayed'
	 * - 'requested' for longer than GENERATION_TIMEOUT_MS → 'dropped'
	 */
	runDecay(): void {
		const now = Date.now();

		for (const thought of this.thoughts.values()) {
			// Skip terminal statuses
			if (!ACTIVE_STATUSES.has(thought.status)) continue;

			// Check TTL expiry
			if (new Date(thought.expiresAt).getTime() <= now) {
				thought.status = 'decayed';
				this._dbUpdate(thought);
				recordFeedback({ requestId: thought.id, reviewer: 'system', outcomeType: 'decayed' });
				continue;
			}

			// Check generation timeout for 'requested' state
			if (thought.status === 'requested') {
				const age = now - new Date(thought.createdAt).getTime();
				if (age > GENERATION_TIMEOUT_MS) {
					thought.status = 'dropped';
					this._dbUpdate(thought);
					recordFeedback({ requestId: thought.id, reviewer: 'system', outcomeType: 'dropped' });
				}
			}
		}
	}

	/**
	 * Returns daily budget status.
	 * Uses localtime-adjusted SQLite queries for Lafayette timezone awareness.
	 */
	getDailyBudgetStatus(): DailyBudgetStatus {
		if (!this.db) {
			// In-memory fallback: count surfaced thoughts from today (UTC)
			const todayPrefix = new Date().toISOString().slice(0, 10);
			let surfacedToday = 0;
			let haikuToday = 0;
			for (const t of this.thoughts.values()) {
				if (t.status === 'surfaced' && t.surfacedAt?.startsWith(todayPrefix)) {
					surfacedToday++;
					if (t.type === 'haiku') haikuToday++;
				}
			}
			return {
				surfacedToday,
				haikuToday,
				atHaikuCap: haikuToday >= MAX_DAILY_HAIKU,
				atTotalCap: surfacedToday >= MAX_DAILY_THOUGHTS,
			};
		}

		// DB-backed: use datetime(surfaced_at, 'localtime') for Lafayette timezone
		const rows = this.db
			.select({
				type: pendingThoughts.type,
				count: sql<number>`count(*)`,
			})
			.from(pendingThoughts)
			.where(
				sql`status = 'surfaced'
				  AND date(datetime(surfaced_at, 'localtime')) = date(datetime('now', 'localtime'))`,
			)
			.groupBy(pendingThoughts.type)
			.all();

		let surfacedToday = 0;
		let haikuToday = 0;
		for (const row of rows) {
			surfacedToday += Number(row.count);
			if (row.type === 'haiku') haikuToday += Number(row.count);
		}

		return {
			surfacedToday,
			haikuToday,
			atHaikuCap: haikuToday >= MAX_DAILY_HAIKU,
			atTotalCap: surfacedToday >= MAX_DAILY_THOUGHTS,
		};
	}

	/** Returns the type of the 'ready' thought, or null. */
	getReadyThoughtType(): ThoughtType | null {
		return this.getReady()?.type ?? null;
	}

	/** Count of thoughts in active states (requested/generating/pending/ready). */
	pendingCount(): number {
		let count = 0;
		for (const t of this.thoughts.values()) {
			if (ACTIVE_STATUSES.has(t.status)) count++;
		}
		return count;
	}

	/** All thoughts with the given status. */
	getByStatus(status: ThoughtStatus): PendingThought[] {
		return Array.from(this.thoughts.values()).filter(t => t.status === status);
	}

	/** Look up a thought by ID. */
	get(id: string): PendingThought | undefined {
		return this.thoughts.get(id);
	}

	/** Returns true if the thought exists (any status). */
	has(id: string): boolean {
		return this.thoughts.has(id);
	}

	/** Total number of thoughts in the queue (all statuses). */
	size(): number {
		return this.thoughts.size;
	}

	// ── Private helpers ────────────────────────────────────────────────────────

	/**
	 * Ensure the 'ready' slot holds the highest-priority thought.
	 * - If nothing is ready: promote the best pending thought.
	 * - If something is ready but a pending thought outranks it (or ties with
	 *   a newer createdAt): demote the current ready back to 'pending' and
	 *   promote the better one.
	 * Tiebreak: newer createdAt wins (later timestamp = more recent).
	 */
	private _promoteReady(): void {
		// Find the best pending candidate
		let bestPending: PendingThought | null = null;
		for (const t of this.thoughts.values()) {
			if (t.status !== 'pending') continue;
			if (!bestPending) {
				bestPending = t;
				continue;
			}
			if (t.priority > bestPending.priority) {
				bestPending = t;
			} else if (t.priority === bestPending.priority && t.createdAt > bestPending.createdAt) {
				bestPending = t;
			}
		}

		if (!bestPending) return; // nothing to promote

		const currentReady = this.getReady();

		if (!currentReady) {
			// Simple case — nothing ready yet
			bestPending.status = 'ready';
			this._dbUpdate(bestPending);
			return;
		}

		// Check if bestPending outranks currentReady
		const shouldSwap =
			bestPending.priority > currentReady.priority ||
			(bestPending.priority === currentReady.priority && bestPending.createdAt > currentReady.createdAt);

		if (shouldSwap) {
			// Demote currentReady back to pending
			currentReady.status = 'pending';
			this._dbUpdate(currentReady);
			// Promote bestPending
			bestPending.status = 'ready';
			this._dbUpdate(bestPending);
		}
	}

	/** Find the lowest-priority thought in the queue (any status). */
	private _findLowestPriority(): PendingThought | null {
		let lowest: PendingThought | null = null;
		for (const t of this.thoughts.values()) {
			if (!lowest || t.priority < lowest.priority) {
				lowest = t;
			}
		}
		return lowest;
	}

	/** Load persisted thoughts from DB on startup. */
	private _loadFromDb(): void {
		if (!this.db) return;
		try {
			const rows = this.db.select().from(pendingThoughts).all();
			for (const row of rows) {
				const thought: PendingThought = {
					id: row.id,
					type: row.type as ThoughtType,
					trigger: row.trigger,
					text: row.text ?? null,
					status: row.status as ThoughtStatus,
					priority: row.priority,
					contextJson: row.contextJson,
					createdAt: row.createdAt,
					generatedAt: row.generatedAt ?? null,
					surfacedAt: row.surfacedAt ?? null,
					expiresAt: row.expiresAt,
					novelty: row.novelty === 1,
					model: row.model ?? null,
					generationMs: row.generationMs ?? null,
				};
				this.thoughts.set(thought.id, thought);
			}
			// Promote best pending thought to ready after loading
			this._promoteReady();
		} catch {
			// DB not ready yet — will be populated on first enqueue
		}
	}

	/** Insert or update a thought in the DB. */
	private _dbUpsert(thought: PendingThought): void {
		if (!this.db) return;
		try {
			this.db.insert(pendingThoughts).values({
				id: thought.id,
				type: thought.type,
				trigger: thought.trigger,
				text: thought.text ?? undefined,
				status: thought.status,
				priority: thought.priority,
				contextJson: thought.contextJson,
				createdAt: thought.createdAt,
				generatedAt: thought.generatedAt ?? undefined,
				surfacedAt: thought.surfacedAt ?? undefined,
				expiresAt: thought.expiresAt,
				novelty: thought.novelty ? 1 : 0,
				model: thought.model ?? undefined,
				generationMs: thought.generationMs ?? undefined,
			}).onConflictDoUpdate({
				target: pendingThoughts.id,
				set: {
					status: thought.status,
					text: thought.text ?? undefined,
					generatedAt: thought.generatedAt ?? undefined,
					surfacedAt: thought.surfacedAt ?? undefined,
					model: thought.model ?? undefined,
					generationMs: thought.generationMs ?? undefined,
				},
			}).run();
		} catch {
			// Non-fatal — in-memory state is authoritative
		}
	}

	/** Update an existing thought in the DB. */
	private _dbUpdate(thought: PendingThought): void {
		if (!this.db) return;
		try {
			this.db.update(pendingThoughts).set({
				status: thought.status,
				text: thought.text ?? undefined,
				generatedAt: thought.generatedAt ?? undefined,
				surfacedAt: thought.surfacedAt ?? undefined,
				model: thought.model ?? undefined,
				generationMs: thought.generationMs ?? undefined,
			}).where(eq(pendingThoughts.id, thought.id)).run();
		} catch {
			// Non-fatal
		}
	}

	/** Mark a thought as dropped in the DB (without removing from map yet). */
	private _updateStatus(id: string, status: ThoughtStatus): void {
		const thought = this.thoughts.get(id);
		if (thought) {
			thought.status = status;
			this._dbUpdate(thought);
		}
	}
}
