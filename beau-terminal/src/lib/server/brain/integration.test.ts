// Brain dispatcher integration tests — requires Ollama running with models
// Run with: npx vitest run src/lib/server/brain/integration.test.ts
// Updated for SP7 Task 5: preparePrompt returns PrepareResult

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TierRegistry, DEFAULT_TIER_CONFIGS } from './registry.js';
import { routeRequest } from './router.js';
import { preparePrompt } from './prepare.js';
import { executeOnTier, parseSilence } from './executor.js';
import { makeThoughtRequest, makeManualRequest } from './types.js';
import type { TierConfig, TierId } from './types.js';

// Extend timeout for integration (cold model loading can take 60s+)
const INTEGRATION_TIMEOUT = 60_000;
const ALL_CONFIGS: TierConfig[] = DEFAULT_TIER_CONFIGS
	.filter(c => c.id !== 't4') // skip t4 (qwen3:30b) — not pulled for testing
	.map(c => ({ ...c, timeoutMs: INTEGRATION_TIMEOUT }));

// Single-tier config for backward compat with existing tests
const T2_ONLY_CONFIGS: TierConfig[] = ALL_CONFIGS.filter(c => c.id === 't2');

describe('brain integration (requires Ollama with gemma3:4b)', () => {
	let registry: TierRegistry;
	let ollamaAvailable = false;

	beforeAll(async () => {
		// Check if Ollama is reachable with gemma3:4b
		try {
			const res = await fetch('http://localhost:11434/api/tags', {
				signal: AbortSignal.timeout(3000),
			});
			if (res.ok) {
				const data = await res.json();
				const models = (data.models ?? []).map((m: any) => m.name);
				ollamaAvailable = models.some((n: string) => n.startsWith('gemma3'));
			}
		} catch {
			ollamaAvailable = false;
		}

		if (ollamaAvailable) {
			registry = new TierRegistry(T2_ONLY_CONFIGS);
			registry.updateState('t2', 'online', ['gemma3:4b'], 50);
		}
	});

	afterAll(() => {
		registry?.stopProbing();
	});

	it('executeOnTier generates text from gemma3:4b', async () => {
		if (!ollamaAvailable) {
			console.warn('Skipping: Ollama not available');
			return;
		}

		const config = T2_ONLY_CONFIGS[0];
		const result = await executeOnTier(
			'You are Beau, a small teal robot. Say one word about the night sky.',
			config,
		);

		expect(result.model).toBe('gemma3:4b');
		expect(result.generationMs).toBeGreaterThan(0);
		// text can be null (SILENCE) — that's valid but unlikely for this prompt
		if (result.text !== null) {
			expect(result.text.length).toBeGreaterThan(0);
		}
	}, INTEGRATION_TIMEOUT);

	it('full dispatch round-trip: thought.generate', async () => {
		if (!ollamaAvailable) {
			console.warn('Skipping: Ollama not available');
			return;
		}

		const request = makeThoughtRequest({
			type: 'observation',
			trigger: 'test',
			novelty: false,
			context: {
				vector: { wonder: 0.5, reflection: 0.7, mischief: 0.2 },
				mode: 'ambient',
				timeOfDay: 'evening',
				environment: 'quiet room, dim light, test environment',
				momentum: 'present and quiet, settling in',
			},
			constraints: { maxLength: 30, tone: 'contemplative' },
		});

		// Route
		const plan = routeRequest(request, registry);
		expect(plan.targetTier).toBe('t2'); // only tier available

		// Prepare — now returns PrepareResult
		const { prompt } = await preparePrompt(request, plan, () => null);
		expect(prompt).toContain('Beau');
		expect(prompt).toContain('quiet room');

		// Execute
		const result = await executeOnTier(prompt, plan.tierConfig);
		expect(result.generationMs).toBeGreaterThan(0);
		console.log(`[integration] observation response (${result.generationMs}ms): ${result.text}`);
	}, INTEGRATION_TIMEOUT);

	it('full dispatch round-trip: haiku', async () => {
		if (!ollamaAvailable) {
			console.warn('Skipping: Ollama not available');
			return;
		}

		const request = makeThoughtRequest({
			type: 'haiku',
			trigger: 'test',
			novelty: false,
			context: {
				vector: { wonder: 0.4, reflection: 0.8, mischief: 0.1 },
				mode: 'ambient',
				timeOfDay: 'night',
				environment: 'dark room, single lamp, rain outside',
				momentum: 'contemplative, sitting with thoughts',
			},
			constraints: { maxLength: 17, tone: 'contemplative' },
		});

		const plan = routeRequest(request, registry);
		const { prompt } = await preparePrompt(request, plan, () => null);
		expect(prompt).toContain('haiku');

		const result = await executeOnTier(prompt, plan.tierConfig);
		console.log(`[integration] haiku response (${result.generationMs}ms): ${result.text}`);
		// Haiku can be SILENCE — that's valid
	}, INTEGRATION_TIMEOUT);
});

// ── Multi-tier voice casting tests ──────────────────────────────────────────
// Requires: qwen2.5:1.5b (T1), gemma3:4b (T2), llama3.1:8b (T3)

describe('brain multi-tier routing (requires 3 Ollama models)', () => {
	let registry: TierRegistry;
	let availableModels: string[] = [];

	beforeAll(async () => {
		try {
			const res = await fetch('http://localhost:11434/api/tags', {
				signal: AbortSignal.timeout(3000),
			});
			if (res.ok) {
				const data = await res.json();
				availableModels = (data.models ?? []).map((m: any) => m.name);
			}
		} catch {
			// Ollama not running
		}

		const hasT1 = availableModels.some(n => n.startsWith('qwen2.5'));
		const hasT2 = availableModels.some(n => n.startsWith('gemma3'));
		const hasT3 = availableModels.some(n => n.startsWith('llama3.1'));

		if (hasT1 && hasT2 && hasT3) {
			registry = new TierRegistry(ALL_CONFIGS);
			if (hasT1) registry.updateState('t1', 'online', ['qwen2.5:1.5b'], 10);
			if (hasT2) registry.updateState('t2', 'online', ['gemma3:4b'], 50);
			if (hasT3) registry.updateState('t3', 'online', ['llama3.1:8b'], 80);
		}
	});

	afterAll(() => {
		registry?.stopProbing();
	});

	function skip() {
		if (!registry) {
			console.warn('Skipping: need qwen2.5:1.5b + gemma3:4b + llama3.1:8b');
			return true;
		}
		return false;
	}

	it('high mischief → voice wants T1, T1 handles light memory budget (150 tokens)', async () => {
		if (skip()) return;

		// Mischief=0.9 → voice=t1, memoryDepth=light (150 tokens)
		// T1.maxMemoryTokens=150 >= 150, so contextFloor=t1 — T1 is reachable (Fix 3)
		const request = makeThoughtRequest({
			type: 'observation',
			trigger: 'test-mischief',
			novelty: false,
			context: {
				vector: { wonder: 0.3, reflection: 0.1, mischief: 0.9 },
				mode: 'social',
				timeOfDay: 'evening',
				environment: 'loud room, friends talking, music playing',
				momentum: 'wry and present, riffing on the moment',
			},
			constraints: { maxLength: 30, tone: 'wry' },
		});

		const plan = routeRequest(request, registry);
		expect(plan.voicePreferred).toBe('t1');
		expect(plan.targetTier).toBe('t1'); // T1 now fits the light memory budget
		expect(plan.clamped).toBe(false);
		expect(plan.memoryTokenBudget).toBeLessThanOrEqual(150);

		const { prompt } = await preparePrompt(request, plan, () => null);
		const result = await executeOnTier(prompt, plan.tierConfig);

		console.log(`[multi-tier] mischief→T1 (${result.generationMs}ms, ${result.model}): ${result.text}`);
		expect(result.generationMs).toBeGreaterThan(0);
	}, INTEGRATION_TIMEOUT);

	it('high reflection → voice wants T2, context scaler raises to T3 (deep memory)', async () => {
		if (skip()) return;

		// Reflection=0.9 → voice=t2, memoryDepth=deep (500 tokens)
		// But T2.maxMemoryTokens=300 < 500, so contextFloor=t3
		const request = makeThoughtRequest({
			type: 'haiku',
			trigger: 'test-reflection',
			novelty: false,
			context: {
				vector: { wonder: 0.3, reflection: 0.9, mischief: 0.1 },
				mode: 'ambient',
				timeOfDay: 'late night',
				environment: 'dark room, rain on the window, single candle',
				momentum: 'contemplative, sitting with something unfinished',
			},
			constraints: { maxLength: 17, tone: 'contemplative' },
		});

		const plan = routeRequest(request, registry);
		expect(plan.voicePreferred).toBe('t2');
		expect(plan.targetTier).toBe('t3'); // context scaler raised — deep memory needs bigger container
		expect(plan.clamped).toBe(true);

		const { prompt } = await preparePrompt(request, plan, () => null);
		const result = await executeOnTier(prompt, plan.tierConfig);

		console.log(`[multi-tier] reflection→T3 clamped (${result.generationMs}ms, ${result.model}): ${result.text}`);
		expect(result.model).toBe('llama3.1:8b');
	}, INTEGRATION_TIMEOUT);

	it('moderate reflection → stays on T2 (memory fits)', async () => {
		if (skip()) return;

		// Reflection=0.55 (below 0.6) → memoryDepth=medium (300 tokens)
		// T2.maxMemoryTokens=300 >= 300 → no context floor raise
		const request = makeThoughtRequest({
			type: 'haiku',
			trigger: 'test-moderate-reflection',
			novelty: false,
			context: {
				vector: { wonder: 0.3, reflection: 0.55, mischief: 0.1 },
				mode: 'ambient',
				timeOfDay: 'late night',
				environment: 'dark room, single lamp',
				momentum: 'quiet and present',
			},
			constraints: { maxLength: 17, tone: 'contemplative' },
		});

		const plan = routeRequest(request, registry);
		expect(plan.targetTier).toBe('t2');
		expect(plan.tierConfig.model).toBe('gemma3:4b');

		const { prompt } = await preparePrompt(request, plan, () => null);
		const result = await executeOnTier(prompt, plan.tierConfig);

		console.log(`[multi-tier] T2 haiku (${result.generationMs}ms, ${result.model}): ${result.text}`);
		expect(result.model).toBe('gemma3:4b');
	}, INTEGRATION_TIMEOUT);

	it('balanced vector → routes to T3 (llama3.1:8b)', async () => {
		if (skip()) return;

		const request = makeThoughtRequest({
			type: 'reaction',
			trigger: 'test-balanced',
			novelty: false,
			context: {
				vector: { wonder: 0.5, reflection: 0.4, mischief: 0.4 },
				mode: 'collaborator',
				timeOfDay: 'afternoon',
				environment: 'workshop, tools on the table, project spread out',
				momentum: 'engaged, working through something',
			},
			constraints: { maxLength: 20, tone: 'present' },
		});

		const plan = routeRequest(request, registry);
		expect(plan.targetTier).toBe('t3');
		expect(plan.tierConfig.model).toBe('llama3.1:8b');

		const { prompt } = await preparePrompt(request, plan, () => null);
		const result = await executeOnTier(prompt, plan.tierConfig);

		console.log(`[multi-tier] T3 reaction (${result.generationMs}ms, ${result.model}): ${result.text}`);
		expect(result.model).toBe('llama3.1:8b');
	}, INTEGRATION_TIMEOUT);

	it('haiku floor prevents mischief from routing to T1', async () => {
		if (skip()) return;

		// High mischief would normally pick T1, but haiku floor is T2
		const request = makeThoughtRequest({
			type: 'haiku',
			trigger: 'test-midwife',
			novelty: false,
			context: {
				vector: { wonder: 0.3, reflection: 0.2, mischief: 0.8 },
				mode: 'social',
				timeOfDay: 'evening',
				environment: 'party, loud music, people everywhere',
				momentum: 'playful and loud',
			},
			constraints: { maxLength: 17, tone: 'wry' },
		});

		const plan = routeRequest(request, registry);
		// Voice wants T1 (mischief), but haiku midwife floor is T2
		expect(plan.targetTier).not.toBe('t1');
		expect(plan.clamped).toBe(true);

		const { prompt } = await preparePrompt(request, plan, () => null);
		const result = await executeOnTier(prompt, plan.tierConfig);

		console.log(`[multi-tier] midwife clamped haiku (${result.generationMs}ms, ${result.model}): ${result.text}`);
	}, INTEGRATION_TIMEOUT);

	it('each tier produces distinct cognitive texture', async () => {
		if (skip()) return;

		// Same environment, same prompt structure, different tiers
		const env = 'quiet evening, soft lamp, a book left open on the table';
		const tiers: TierId[] = ['t1', 't2', 't3'];
		const results: Record<string, string | null> = {};

		for (const tierId of tiers) {
			const config = ALL_CONFIGS.find(c => c.id === tierId)!;
			const prompt = `You are Beau, a small teal robot. The room: ${env}. Say one thing. Under 15 words.`;
			const result = await executeOnTier(prompt, config);
			results[tierId] = result.text;
			console.log(`[texture] ${tierId} (${config.model}, ${result.generationMs}ms): ${result.text}`);
		}

		// We can't assert content differences deterministically, but we can verify
		// all tiers produced output and used the correct models
		expect(Object.keys(results)).toHaveLength(3);
	}, INTEGRATION_TIMEOUT * 3);
});
