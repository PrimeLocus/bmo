import { describe, it, expect } from 'vitest';
import { getCollectionPolicy } from '../reflective/memory.js';

describe('getCollectionPolicy', () => {
	// Privacy invariant: beau_private NEVER in prompt caller
	it('collaborator/prompt NEVER includes private', () => {
		const p = getCollectionPolicy('collaborator', 'prompt');
		expect(p.collections).not.toContain('beau_private');
	});

	it('archivist/prompt NEVER includes private', () => {
		const p = getCollectionPolicy('archivist', 'prompt');
		expect(p.collections).not.toContain('beau_private');
	});

	// Thoughts caller can access private in deep modes
	it('collaborator/thoughts includes private', () => {
		const p = getCollectionPolicy('collaborator', 'thoughts');
		expect(p.collections).toContain('beau_private');
		expect(p.collections).toContain('beau_identity');
		expect(p.collections).toContain('beau_experience');
	});

	it('archivist/thoughts includes all three', () => {
		const p = getCollectionPolicy('archivist', 'thoughts');
		expect(p.collections).toHaveLength(3);
	});

	// Internal caller follows thoughts rules
	it('collaborator/internal includes private', () => {
		const p = getCollectionPolicy('collaborator', 'internal');
		expect(p.collections).toContain('beau_private');
	});

	// Ambient — identity only
	it('ambient/prompt returns only identity', () => {
		const p = getCollectionPolicy('ambient', 'prompt');
		expect(p.collections).toEqual(['beau_identity']);
		expect(p.maxTokens).toBeGreaterThanOrEqual(100);
		expect(p.maxTokens).toBeLessThanOrEqual(250);
	});

	// Witness — identity + experience
	it('witness/prompt returns identity + experience', () => {
		const p = getCollectionPolicy('witness', 'prompt');
		expect(p.collections).toContain('beau_identity');
		expect(p.collections).toContain('beau_experience');
		expect(p.collections).not.toContain('beau_private');
	});

	// Social — excludes private for all callers
	it('social excludes private for both callers', () => {
		expect(getCollectionPolicy('social', 'prompt').collections).not.toContain('beau_private');
		expect(getCollectionPolicy('social', 'thoughts').collections).not.toContain('beau_private');
	});

	// Unknown mode — safe fallback
	it('unknown mode falls back to identity only', () => {
		const p = getCollectionPolicy('unknown_mode', 'prompt');
		expect(p.collections).toEqual(['beau_identity']);
		expect(p.maxTokens).toBeGreaterThan(0);
	});

	// Token budgets scale with depth
	it('archivist has higher token budget than ambient', () => {
		const arch = getCollectionPolicy('archivist', 'thoughts');
		const amb = getCollectionPolicy('ambient', 'thoughts');
		expect(arch.maxTokens).toBeGreaterThan(amb.maxTokens);
	});
});
