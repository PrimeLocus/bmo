import { describe, it, expect } from 'vitest';
import { chunkBible, chunkText, contentHash } from './chunker.js';

describe('contentHash', () => {
	it('returns stable SHA-256 hex for same input', () => {
		const h1 = contentHash('hello world');
		const h2 = contentHash('hello world');
		expect(h1).toBe(h2);
		expect(h1).toHaveLength(64);
	});

	it('returns different hash for different input', () => {
		expect(contentHash('a')).not.toBe(contentHash('b'));
	});
});

describe('chunkText', () => {
	it('returns single chunk for short text', () => {
		const chunks = chunkText('Short text.');
		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toBe('Short text.');
	});

	it('splits long text at paragraph boundaries', () => {
		const paragraphs = Array(50)
			.fill('This is a paragraph with enough words to accumulate tokens over the threshold limit for chunking.')
			.join('\n\n');
		const chunks = chunkText(paragraphs);
		expect(chunks.length).toBeGreaterThan(1);
		// Each chunk should be under the max (~400 tokens * 4 chars + margin)
		for (const chunk of chunks) {
			expect(chunk.length).toBeLessThanOrEqual(1800);
		}
	});

	it('never produces empty chunks', () => {
		const chunks = chunkText('A\n\n\n\nB\n\n\n\nC');
		for (const chunk of chunks) {
			expect(chunk.trim().length).toBeGreaterThan(0);
		}
	});

	it('splits long text without paragraph breaks by words', () => {
		const long = 'word '.repeat(500); // ~2500 chars, well over MAX_CHARS
		const chunks = chunkText(long);
		expect(chunks.length).toBeGreaterThan(1);
		for (const chunk of chunks) {
			expect(chunk.length).toBeLessThanOrEqual(1700); // MAX_CHARS + margin
		}
	});
});

describe('chunkBible', () => {
	it('splits by ## N. headings', () => {
		const bible = '## 1. First Section\n\nContent one.\n\n## 2. Second Section\n\nContent two.';
		const sections = chunkBible(bible);
		expect(sections).toHaveLength(2);
		expect(sections[0].sectionId).toBe('1');
		expect(sections[0].title).toBe('First Section');
		expect(sections[0].text).toBe('Content one.');
		expect(sections[1].sectionId).toBe('2');
		expect(sections[1].title).toBe('Second Section');
		expect(sections[1].text).toBe('Content two.');
	});

	it('handles non-numbered sections (Glossary, Appendices)', () => {
		const bible = '## Purpose & Scope\n\nThis is the scope.\n\n## 1. First\n\nContent.\n\n## Glossary\n\nTerms here.';
		const sections = chunkBible(bible);
		expect(sections.length).toBe(3);
		expect(sections[0].sectionId).toBe('purpose-scope');
		expect(sections[0].title).toBe('Purpose & Scope');
		expect(sections[2].sectionId).toBe('glossary');
		expect(sections[2].title).toBe('Glossary');
	});

	it('chunks long sections into multiple pieces', () => {
		const longContent = Array(80)
			.fill('A long paragraph with substantial content for testing that should push us over the token limit.')
			.join('\n\n');
		const bible = `## 1. Long Section\n\n${longContent}`;
		const sections = chunkBible(bible);
		expect(sections.length).toBeGreaterThan(1);
		expect(sections[0].sectionId).toBe('1');
		expect(sections[0].chunkIndex).toBe(0);
		expect(sections[1].sectionId).toBe('1');
		expect(sections[1].chunkIndex).toBe(1);
	});

	it('keeps short sections intact', () => {
		const bible = '## 42. Short One\n\nJust a few words.';
		const sections = chunkBible(bible);
		expect(sections).toHaveLength(1);
		expect(sections[0].chunkIndex).toBe(0);
	});

	it('includes content hash per chunk', () => {
		const bible = '## 1. Test\n\nContent here.';
		const sections = chunkBible(bible);
		expect(sections[0].hash).toHaveLength(64);
	});

	it('produces stable hashes for same content', () => {
		const bible = '## 1. Test\n\nSame content.';
		const a = chunkBible(bible);
		const b = chunkBible(bible);
		expect(a[0].hash).toBe(b[0].hash);
	});

	it('skips sections with empty bodies', () => {
		const bible = '## 1. Has Content\n\nReal stuff.\n\n## 2. Empty\n\n## 3. Also Content\n\nMore stuff.';
		const sections = chunkBible(bible);
		const ids = sections.map((s) => s.sectionId);
		expect(ids).toContain('1');
		expect(ids).toContain('3');
		expect(ids).not.toContain('2');
	});
});
