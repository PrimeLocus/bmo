// Brain dispatcher integration test — requires Ollama running with gemma3:4b
// Run with: npx vitest run src/lib/server/brain/integration.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TierRegistry, DEFAULT_TIER_CONFIGS } from './registry.js';
import { routeRequest } from './router.js';
import { preparePrompt } from './prepare.js';
import { executeOnTier, parseSilence } from './executor.js';
import { makeThoughtRequest, makeManualRequest } from './types.js';
import type { TierConfig } from './types.js';

// Use only t2 (gemma3:4b) for integration — it's the model we know is available
// Extend timeout for integration (cold model loading can take 30s+)
const T2_ONLY_CONFIGS: TierConfig[] = DEFAULT_TIER_CONFIGS
	.filter(c => c.id === 't2')
	.map(c => ({ ...c, timeoutMs: 60_000 }));

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
	}, 30_000);

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

		// Prepare
		const prompt = await preparePrompt(request, plan, () => null);
		expect(prompt).toContain('Beau');
		expect(prompt).toContain('quiet room');

		// Execute
		const result = await executeOnTier(prompt, plan.tierConfig);
		expect(result.generationMs).toBeGreaterThan(0);
		console.log(`[integration] observation response (${result.generationMs}ms): ${result.text}`);
	}, 30_000);

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
		const prompt = await preparePrompt(request, plan, () => null);
		expect(prompt).toContain('haiku');

		const result = await executeOnTier(prompt, plan.tierConfig);
		console.log(`[integration] haiku response (${result.generationMs}ms): ${result.text}`);
		// Haiku can be SILENCE — that's valid
	}, 30_000);
});
