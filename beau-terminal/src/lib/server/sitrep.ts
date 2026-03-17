import { db } from './db/index.js';
import * as schema from './db/schema.js';
import { desc, eq, asc } from 'drizzle-orm';
import { getState } from './mqtt/bridge.js';
import { getEmergenceArtifact, getSoulCodeHaiku } from './identity/emergence.js';
import { getActiveNatalProfile } from './identity/natal.js';
import { getActiveVoiceModel } from './identity/voice.js';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Section Builders ──────────────────────────────────────────────────────────
// Each returns string | null. Null = section omitted from output.

function buildHeader(): string {
	const now = new Date().toISOString();
	return `# BMO Situation Report\n\n**Generated:** ${now}\n**Project:** BMO — Physical robot build (Raspberry Pi 5 + Hailo NPU + custom AI personality)`;
}

function buildProjectContext(): string | null {
	try {
		const claudeMd = readFileSync(join(process.cwd(), '..', 'CLAUDE.md'), 'utf8');
		// Extract key sections — trim to what another LLM needs
		const lines = claudeMd.split('\n');
		const sections: string[] = [];
		let capturing = false;
		let currentSection: string[] = [];

		const keepHeaders = [
			'## Project Overview',
			'## Architecture Decisions',
			'## Tech Stack',
			'## Design System',
			'## Conventions',
		];
		const stopHeaders = [
			'## Development',
			'## Key Files',
			'## Deep Reference',
			'## Repo Structure',
		];

		for (const line of lines) {
			if (stopHeaders.some((h) => line.startsWith(h))) {
				if (capturing && currentSection.length) {
					sections.push(currentSection.join('\n'));
				}
				capturing = false;
				currentSection = [];
				continue;
			}
			if (keepHeaders.some((h) => line.startsWith(h))) {
				if (capturing && currentSection.length) {
					sections.push(currentSection.join('\n'));
				}
				capturing = true;
				currentSection = [line];
				continue;
			}
			if (capturing) {
				currentSection.push(line);
			}
		}
		if (capturing && currentSection.length) {
			sections.push(currentSection.join('\n'));
		}

		if (!sections.length) return null;
		return `## Project Context\n\n${sections.join('\n\n')}`;
	} catch {
		return null;
	}
}

function buildIdentitySection(): string | null {
	const parts: string[] = [];

	const artifact = getEmergenceArtifact();
	if (artifact) {
		parts.push(`- **Emergence:** ${artifact.emergenceTimestamp}`);
		parts.push(`- **Soul Code Haiku:** ${artifact.haikuText}`);
		if (artifact.modelUsed) parts.push(`- **Emergence Model:** ${artifact.modelUsed}`);
	}

	const natal = getActiveNatalProfile();
	if (natal) {
		parts.push(`- **Birth:** ${natal.birthTimestamp} (${natal.timezone})`);
		parts.push(`- **Location:** ${natal.locationName}`);
		if (natal.summaryText) parts.push(`- **Natal Summary:** ${natal.summaryText}`);
	}

	const voice = getActiveVoiceModel();
	if (voice) {
		parts.push(`- **Active Voice:** ${voice.versionName} (${voice.engine})`);
		if (voice.trainingNotes) parts.push(`- **Voice Notes:** ${voice.trainingNotes}`);
	}

	if (!parts.length) return null;
	return `## Identity\n\n${parts.join('\n')}`;
}

function buildCurrentStateSection(): string | null {
	const state = getState();
	const lines: string[] = [];

	lines.push(`- **Mode:** ${state.mode}`);
	lines.push(`- **Emotion:** ${state.emotionalState}`);
	lines.push(`- **Online:** ${state.online ? 'yes' : 'no'}`);
	lines.push(`- **Sleep:** ${state.sleepState}`);
	lines.push(`- **Presence:** ${state.presenceState}`);
	if (state.lux !== null) lines.push(`- **Lux:** ${state.lux} (${state.luxLabel})`);
	if (state.weatherSummary) lines.push(`- **Weather:** ${state.weatherSummary}`);
	if (state.seasonalContext) lines.push(`- **Season:** ${state.seasonalContext}`);
	lines.push(`- **Resolume:** ${state.resolumeActive ? 'LIVE' : 'off'}`);
	if (state.currentBpm) lines.push(`- **BPM:** ${state.currentBpm}`);
	if (state.currentClip) lines.push(`- **Clip:** ${state.currentClip}`);
	if (state.wellnessSessionActive) {
		lines.push(`- **Wellness:** ${state.wellnessDeviceName} at ${state.wellnessActualTemp ?? '?'}°F (${state.wellnessHeatingState})`);
	}
	if (state.lastHaiku) lines.push(`- **Last Haiku:** ${state.lastHaiku}`);

	return `## Current State (Live)\n\n${lines.join('\n')}`;
}

function buildBuildProgressSection(): string | null {
	const allParts = db.select().from(schema.parts).all();
	const allSteps = db.select().from(schema.softwareSteps).all();
	const allPhases = db.select().from(schema.softwarePhases).orderBy(asc(schema.softwarePhases.order)).all();

	if (!allParts.length && !allSteps.length) return null;

	const lines: string[] = [];

	// Workshop stats
	const received = allParts.filter((p) => p.status === 'delivered' || p.status === 'installed').length;
	const totalCost = allParts.reduce((sum, p) => sum + (p.price ?? 0), 0);
	const stepsDone = allSteps.filter((s) => s.done).length;

	lines.push(`- **Parts:** ${received}/${allParts.length} received ($${totalCost.toFixed(2)} total)`);
	lines.push(`- **Software Steps:** ${stepsDone}/${allSteps.length} complete`);

	// Blocked / shipping parts
	const blocked = allParts.filter((p) => p.status === 'ordered' || p.status === 'shipped');
	if (blocked.length) {
		lines.push('');
		lines.push('**Waiting on:**');
		for (const p of blocked) {
			const eta = p.expectedDelivery ? ` (ETA: ${p.expectedDelivery})` : '';
			lines.push(`- ${p.name} — ${p.status}${eta}`);
		}
	}

	// Phase completion
	if (allPhases.length) {
		lines.push('');
		lines.push('**Phases:**');
		for (const phase of allPhases) {
			const steps = allSteps.filter((s) => s.phaseId === phase.id);
			const done = steps.filter((s) => s.done).length;
			const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
			lines.push(`- ${phase.phase}: ${done}/${steps.length} (${pct}%)`);
		}
	}

	return `## Build Progress\n\n${lines.join('\n')}`;
}

function buildIdeasAndTasksSection(): string | null {
	const allIdeas = db.select().from(schema.ideas).all();
	const allTodos = db.select().from(schema.todos).all();

	const openIdeas = allIdeas.filter((i) => !i.done);
	const openTodos = allTodos.filter((t) => !t.done);

	if (!openIdeas.length && !openTodos.length) return null;

	const lines: string[] = [];
	const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

	if (openIdeas.length) {
		lines.push('**Open Ideas:**');
		const sorted = [...openIdeas].sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));
		for (const idea of sorted) {
			lines.push(`- [${idea.priority}] ${idea.text}`);
		}
	}

	if (openTodos.length) {
		if (lines.length) lines.push('');
		lines.push('**Open Tasks:**');
		const sorted = [...openTodos].sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));
		for (const todo of sorted) {
			const section = todo.section ? ` (${todo.section})` : '';
			lines.push(`- [${todo.priority}] ${todo.text}${section}`);
		}
	}

	return `## Ideas & Tasks\n\n${lines.join('\n')}`;
}

function buildRecentActivitySection(): string | null {
	const recent = db
		.select()
		.from(schema.activityLog)
		.orderBy(desc(schema.activityLog.id))
		.limit(15)
		.all();

	if (!recent.length) return null;

	const lines = recent.map(
		(a) => `- **${a.entityType}** ${a.action}: ${a.summary} (${a.createdAt})`
	);
	return `## Recent Activity\n\n${lines.join('\n')}`;
}

function buildHaikusSection(): string | null {
	const recent = db
		.select()
		.from(schema.haikus)
		.orderBy(desc(schema.haikus.id))
		.limit(5)
		.all();

	if (!recent.length) return null;

	const lines = recent.map((h) => {
		const meta = [h.mode, h.trigger].filter(Boolean).join(', ');
		return `> ${h.text.replace(/\n/g, ' / ')}\n> — _${meta}_`;
	});
	return `## Recent Haikus\n\n${lines.join('\n\n')}`;
}

function buildDispatchesSection(): string | null {
	const recent = db
		.select()
		.from(schema.dispatches)
		.orderBy(desc(schema.dispatches.id))
		.limit(10)
		.all();

	if (!recent.length) return null;

	const lines = recent.map((d) => {
		const parts: string[] = [];
		if (d.tier) parts.push(`tier=${d.tier}`);
		if (d.model) parts.push(`model=${d.model}`);
		if (d.routingReason) parts.push(`reason=${d.routingReason}`);
		if (d.durationMs) parts.push(`${d.durationMs}ms`);
		const meta = parts.length ? ` (${parts.join(', ')})` : '';
		return `- ${d.querySummary ?? 'unknown query'}${meta}`;
	});
	return `## Recent Dispatches\n\n${lines.join('\n')}`;
}

function buildEnvironmentSection(): string | null {
	const snapshot = db
		.select()
		.from(schema.environmentSnapshots)
		.orderBy(desc(schema.environmentSnapshots.id))
		.limit(1)
		.get();

	if (!snapshot) return null;

	const lines: string[] = [];
	lines.push(`- **Timestamp:** ${snapshot.timestamp}`);
	if (snapshot.presenceState) lines.push(`- **Presence:** ${snapshot.presenceState}`);
	if (snapshot.sleepState) lines.push(`- **Sleep:** ${snapshot.sleepState}`);
	if (snapshot.lux !== null) lines.push(`- **Lux:** ${snapshot.lux}`);
	if (snapshot.contextMode) lines.push(`- **Mode:** ${snapshot.contextMode}`);
	if (snapshot.seasonalSummary) lines.push(`- **Season:** ${snapshot.seasonalSummary}`);
	if (snapshot.weatherJson) {
		try {
			const w = JSON.parse(snapshot.weatherJson);
			if (w.description) lines.push(`- **Weather:** ${w.description}`);
		} catch { /* skip */ }
	}

	return `## Environment (Last Snapshot)\n\n${lines.join('\n')}`;
}

function buildCreativeSection(): string | null {
	const sessions = db
		.select()
		.from(schema.resolumeSessions)
		.orderBy(desc(schema.resolumeSessions.id))
		.limit(5)
		.all();

	if (!sessions.length) return null;

	const lines = sessions.map((s) => {
		const parts: string[] = [];
		parts.push(`**${s.sessionName ?? `Session #${s.id}`}**`);
		parts.push(`started ${s.startedAt}`);
		if (s.endedAt) parts.push(`ended ${s.endedAt}`);
		parts.push(`status: ${s.status}`);
		if (s.bpmAvg) parts.push(`avg BPM: ${s.bpmAvg}`);
		if (s.venue) parts.push(`venue: ${s.venue}`);
		return `- ${parts.join(' | ')}`;
	});
	return `## Creative Sessions (Resolume)\n\n${lines.join('\n')}`;
}

function buildWellnessSection(): string | null {
	const state = getState();
	const sessions = db
		.select()
		.from(schema.wellnessSessions)
		.orderBy(desc(schema.wellnessSessions.id))
		.limit(5)
		.all();

	if (!sessions.length && !state.wellnessSessionActive) return null;

	const lines: string[] = [];

	if (state.wellnessSessionActive) {
		lines.push(`- **Active Session:** ${state.wellnessDeviceName} at ${state.wellnessTargetTemp ?? '?'}°F (actual: ${state.wellnessActualTemp ?? '?'}°F)`);
		lines.push(`- **Heating State:** ${state.wellnessHeatingState}`);
	}

	for (const s of sessions) {
		const parts: string[] = [];
		parts.push(`**${s.displayName}**`);
		parts.push(`started ${s.startedAt}`);
		if (s.endedAt) parts.push(`ended ${s.endedAt}`);
		if (s.targetTemp) parts.push(`target: ${s.targetTemp}°F`);
		if (s.peakTemp) parts.push(`peak: ${s.peakTemp}°F`);
		if (s.durationSeconds) parts.push(`${Math.round(s.durationSeconds / 60)}min`);
		lines.push(`- ${parts.join(' | ')}`);
	}

	return `## Wellness Sessions\n\n${lines.join('\n')}`;
}

function buildIntegrationsSection(): string | null {
	const integs = db.select().from(schema.integrations).all();
	if (!integs.length) return null;

	const lines = integs.map(
		(i) => `- ${i.icon} **${i.name}** — ${i.status}${i.lastSeen ? ` (last seen: ${i.lastSeen})` : ''}`
	);
	return `## Integrations\n\n${lines.join('\n')}`;
}

function buildEntityLinksSection(): string | null {
	const links = db.select().from(schema.entityLinks).all();
	if (!links.length) return null;

	const lines = links.map(
		(l) => `- ${l.sourceType}:${l.sourceId} → ${l.relationship} → ${l.targetType}:${l.targetId}`
	);
	return `## Entity Links\n\n${lines.join('\n')}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateSitrep(): { markdown: string; generatedAt: string } {
	const sections = [
		buildHeader(),
		buildProjectContext(),
		buildIdentitySection(),
		buildCurrentStateSection(),
		buildBuildProgressSection(),
		buildIdeasAndTasksSection(),
		buildRecentActivitySection(),
		buildHaikusSection(),
		buildDispatchesSection(),
		buildEnvironmentSection(),
		buildCreativeSection(),
		buildWellnessSection(),
		buildIntegrationsSection(),
		buildEntityLinksSection(),
	].filter(Boolean) as string[];

	const generatedAt = new Date().toISOString();
	return { markdown: sections.join('\n\n---\n\n'), generatedAt };
}
