// src/lib/server/personality/compaction.ts

/**
 * TODO-B: EXTRACTION TARGET — Pi Personality Service
 * Tiered retention, notable detection, compaction job, and backup scheduler.
 * When the Pi is assembled, extract with the engine to the standalone process.
 * See: docs/bible/beaus-bible.md §24
 */

import { mkdirSync } from 'fs';
import { join } from 'path';
import { and, eq, lt, gte, lte, ne } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../db/schema.js';
import { personalitySnapshots } from '../db/schema.js';
import type { PersonalityVector } from './types.js';

export type RetentionTier = 'hot' | 'warm' | 'cool' | 'cold';

type DrizzleDB = BetterSQLite3Database<typeof schema>;

// ── Tier boundaries ──────────────────────────────────────────────────────────

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY  = 24 * MS_PER_HOUR;
const TIER_HOT_MS  = 1  * MS_PER_DAY;   // 0–24h
const TIER_WARM_MS = 7  * MS_PER_DAY;   // 1–7d
const TIER_COOL_MS = 30 * MS_PER_DAY;   // 7–30d
// cold: > 30d

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Determines whether a personality snapshot is historically notable enough
 * to retain through compaction.
 *
 * A snapshot is notable if ANY of:
 * - Any dimension is above 0.85 or below 0.15 (extreme state)
 * - Any dimension delta vs previousVector exceeds 0.2 (large change)
 * - hasCreativeActivity is true (haiku, journal, idea coincided)
 * - hadModeTransition is true
 */
export function isNotable(
	vector: PersonalityVector,
	previousVector: PersonalityVector,
	hasCreativeActivity: boolean,
	hadModeTransition: boolean,
): boolean {
	// Extreme state check
	const dims: (keyof PersonalityVector)[] = ['wonder', 'reflection', 'mischief'];
	for (const dim of dims) {
		if (vector[dim] > 0.85 || vector[dim] < 0.15) return true;
	}

	// Large delta check
	for (const dim of dims) {
		if (Math.abs(vector[dim] - previousVector[dim]) > 0.2) return true;
	}

	// Activity / transition flags
	if (hasCreativeActivity) return true;
	if (hadModeTransition) return true;

	return false;
}

/**
 * Classifies a snapshot timestamp into a retention tier based on age.
 *
 * hot:  < 24 hours
 * warm: 24h–7d
 * cool: 7d–30d
 * cold: > 30d
 */
export function getRetentionTier(timestamp: Date, now: Date): RetentionTier {
	const ageMs = now.getTime() - timestamp.getTime();
	if (ageMs < TIER_HOT_MS)  return 'hot';
	if (ageMs < TIER_WARM_MS) return 'warm';
	if (ageMs < TIER_COOL_MS) return 'cool';
	return 'cold';
}

// ── SQLite datetime helpers ───────────────────────────────────────────────────

/** Convert a JS Date to the SQLite `datetime('now')` format (space separator). */
function toSQLiteTs(d: Date): string {
	return d.toISOString().replace('T', ' ').slice(0, 19);
}

// ── Compaction job ────────────────────────────────────────────────────────────

/**
 * Runs tiered compaction against the personality_snapshots table.
 *
 * Rules:
 * - hot tier (< 24h):  keep everything
 * - warm tier (1–7d):  keep one snapshot per hour (the one with the highest
 *                      combined dimension sum, i.e. the "peak"), delete the rest
 * - cool tier (7–30d): keep one snapshot per calendar day (earliest per day),
 *                      delete the rest
 * - cold tier (> 30d): delete all non-notable rows
 *
 * Notable rows (is_notable = 1) are NEVER deleted regardless of tier.
 */
export function runCompaction(db: DrizzleDB): void {
	const now = new Date();
	const hotCutoff  = new Date(now.getTime() - TIER_HOT_MS);
	const warmCutoff = new Date(now.getTime() - TIER_WARM_MS);
	const coolCutoff = new Date(now.getTime() - TIER_COOL_MS);

	const hotCutoffTs  = toSQLiteTs(hotCutoff);
	const warmCutoffTs = toSQLiteTs(warmCutoff);
	const coolCutoffTs = toSQLiteTs(coolCutoff);

	// ── warm tier: keep hourly peaks ─────────────────────────────────────────
	// Fetch all non-notable warm-tier rows
	const warmRows = db.select({
		id: personalitySnapshots.id,
		timestamp: personalitySnapshots.timestamp,
		wonder: personalitySnapshots.wonder,
		reflection: personalitySnapshots.reflection,
		mischief: personalitySnapshots.mischief,
	})
	.from(personalitySnapshots)
	.where(
		and(
			lt(personalitySnapshots.timestamp, hotCutoffTs),
			gte(personalitySnapshots.timestamp, warmCutoffTs),
			eq(personalitySnapshots.isNotable, 0),
		),
	)
	.all();

	// Group by hour, identify peak (highest sum), delete non-peaks
	const hourGroups = new Map<string, typeof warmRows>();
	for (const row of warmRows) {
		const hourKey = row.timestamp.slice(0, 13); // "YYYY-MM-DD HH"
		if (!hourGroups.has(hourKey)) hourGroups.set(hourKey, []);
		hourGroups.get(hourKey)!.push(row);
	}

	const warmDeleteIds: number[] = [];
	for (const rows of hourGroups.values()) {
		if (rows.length <= 1) continue;
		// Keep the peak (highest wonder + reflection + mischief), delete the rest
		let peakIdx = 0;
		let peakSum = rows[0].wonder + rows[0].reflection + rows[0].mischief;
		for (let i = 1; i < rows.length; i++) {
			const s = rows[i].wonder + rows[i].reflection + rows[i].mischief;
			if (s > peakSum) { peakSum = s; peakIdx = i; }
		}
		for (let i = 0; i < rows.length; i++) {
			if (i !== peakIdx) warmDeleteIds.push(rows[i].id);
		}
	}

	for (const id of warmDeleteIds) {
		db.delete(personalitySnapshots)
			.where(and(eq(personalitySnapshots.id, id), eq(personalitySnapshots.isNotable, 0)))
			.run();
	}

	// ── cool tier: keep daily summaries (first row per day) ─────────────────
	const coolRows = db.select({
		id: personalitySnapshots.id,
		timestamp: personalitySnapshots.timestamp,
	})
	.from(personalitySnapshots)
	.where(
		and(
			lt(personalitySnapshots.timestamp, warmCutoffTs),
			gte(personalitySnapshots.timestamp, coolCutoffTs),
			eq(personalitySnapshots.isNotable, 0),
		),
	)
	.all();

	const dayGroups = new Map<string, typeof coolRows>();
	for (const row of coolRows) {
		const dayKey = row.timestamp.slice(0, 10); // "YYYY-MM-DD"
		if (!dayGroups.has(dayKey)) dayGroups.set(dayKey, []);
		dayGroups.get(dayKey)!.push(row);
	}

	const coolDeleteIds: number[] = [];
	for (const rows of dayGroups.values()) {
		if (rows.length <= 1) continue;
		// Keep the first (earliest) row in the day, delete the rest
		const sorted = [...rows].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
		for (let i = 1; i < sorted.length; i++) {
			coolDeleteIds.push(sorted[i].id);
		}
	}

	for (const id of coolDeleteIds) {
		db.delete(personalitySnapshots)
			.where(and(eq(personalitySnapshots.id, id), eq(personalitySnapshots.isNotable, 0)))
			.run();
	}

	// ── cold tier: delete all non-notable rows older than 30d ───────────────
	db.delete(personalitySnapshots)
		.where(
			and(
				lt(personalitySnapshots.timestamp, coolCutoffTs),
				eq(personalitySnapshots.isNotable, 0),
			),
		)
		.run();
}

// ── Timeline export ───────────────────────────────────────────────────────────

type TierCounts = { hot: number; warm: number; cool: number; cold: number };

interface PersonalityExport {
	exportDate: string;
	totalSnapshots: number;
	tierCounts: TierCounts;
	snapshots: Array<{
		id: number;
		timestamp: string;
		tier: RetentionTier;
		wonder: number;
		reflection: number;
		mischief: number;
		derivedMode: string;
		interpretation: string | null;
		isNotable: number;
		snapshotReason: string;
	}>;
}

/**
 * Exports a JSON timeline of all personality snapshots to `outputPath`.
 * The file is named `personality-export-YYYY-MM-DD.json`.
 * Includes metadata: export date, total snapshots, per-tier counts.
 */
export function exportPersonalityTimeline(db: DrizzleDB, outputPath: string): void {
	const { writeFileSync } = await_import_sync();

	const now = new Date();
	const rows = db.select().from(personalitySnapshots).all();

	const tierCounts: TierCounts = { hot: 0, warm: 0, cool: 0, cold: 0 };
	const snapshots = rows.map((row) => {
		const tier = getRetentionTier(new Date(row.timestamp), now);
		tierCounts[tier]++;
		return {
			id:               row.id,
			timestamp:        row.timestamp,
			tier,
			wonder:           row.wonder,
			reflection:       row.reflection,
			mischief:         row.mischief,
			derivedMode:      row.derivedMode,
			interpretation:   row.interpretation ?? null,
			isNotable:        row.isNotable,
			snapshotReason:   row.snapshotReason,
		};
	});

	const dateStr = now.toISOString().slice(0, 10);
	const filename = `personality-export-${dateStr}.json`;
	const fullPath = join(outputPath, filename);

	mkdirSync(outputPath, { recursive: true });

	const payload: PersonalityExport = {
		exportDate:      now.toISOString(),
		totalSnapshots:  rows.length,
		tierCounts,
		snapshots,
	};

	writeFileSync(fullPath, JSON.stringify(payload, null, 2), 'utf8');
}

/**
 * Lazy sync import shim — avoids top-level fs import issues in tests.
 * @internal
 */
function await_import_sync() {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { writeFileSync } = require('fs') as typeof import('fs');
	return { writeFileSync };
}

// ── Backup scheduler ──────────────────────────────────────────────────────────

/**
 * Schedules periodic SQLite hot backups using the `better-sqlite3` `.backup()` API.
 *
 * @param sqliteInstance  Raw better-sqlite3 instance (NOT the Drizzle wrapper).
 * @param backupPath      Directory where backup files will be written.
 * @param intervalMs      How often to run the backup (e.g. 3_600_000 for hourly).
 * @returns               Cleanup function — call to stop the interval.
 */
export function scheduleBackup(
	sqliteInstance: { backup: (destination: string) => Promise<void> },
	backupPath: string,
	intervalMs: number,
): () => void {
	mkdirSync(backupPath, { recursive: true });

	const doBackup = async () => {
		const now = new Date();
		const dateStr = now.toISOString().slice(0, 10);                   // YYYY-MM-DD
		const hour    = now.toISOString().slice(11, 13);                  // HH
		const filename = `beau-backup-${dateStr}-${hour}.db`;
		const filepath = join(backupPath, filename);
		try {
			await sqliteInstance.backup(filepath);
		} catch (err) {
			console.error('[personality/compaction] Backup failed:', err);
		}
	};

	const handle = setInterval(doBackup, intervalMs);

	return () => clearInterval(handle);
}
