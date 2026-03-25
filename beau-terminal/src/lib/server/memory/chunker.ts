import { createHash } from 'crypto';
import { MAX_CHUNK_TOKENS } from './types.js';

/** SHA-256 hex hash of text content */
export function contentHash(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}

const MAX_CHARS = MAX_CHUNK_TOKENS * 4; // ~400 tokens * 4 chars/token

export interface BibleChunk {
	sectionId: string;
	title: string;
	chunkIndex: number;
	text: string;
	hash: string;
}

/**
 * Split beaus-bible.md into chunks by H2 headings.
 * Handles both numbered sections (## 1. Title) and non-numbered (## Glossary).
 */
export function chunkBible(markdown: string): BibleChunk[] {
	const headingRegex = /^## (.+)$/gm;
	const headings: { raw: string; id: string; title: string; start: number }[] = [];

	let match;
	while ((match = headingRegex.exec(markdown)) !== null) {
		const raw = match[1];
		const numbered = raw.match(/^(\d+)\.\s+(.+)$/);
		if (numbered) {
			headings.push({ raw, id: numbered[1], title: numbered[2], start: match.index });
		} else {
			const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
			headings.push({ raw, id: slug, title: raw, start: match.index });
		}
	}

	const results: BibleChunk[] = [];

	for (let i = 0; i < headings.length; i++) {
		const heading = headings[i];
		const end = i + 1 < headings.length ? headings[i + 1].start : markdown.length;
		const body = markdown
			.slice(heading.start, end)
			.replace(/^## .+\n+/, '')
			.trim();

		if (!body) continue;

		const chunks = chunkText(body);
		for (let j = 0; j < chunks.length; j++) {
			results.push({
				sectionId: heading.id,
				title: heading.title,
				chunkIndex: j,
				text: chunks[j],
				hash: contentHash(chunks[j]),
			});
		}
	}

	return results;
}

/**
 * Split text into chunks at paragraph boundaries, respecting MAX_CHUNK_TOKENS.
 * Short text returns as-is. Text without paragraph breaks stays as one chunk.
 */
export function chunkText(text: string): string[] {
	if (text.length <= MAX_CHARS) return [text];

	const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
	if (paragraphs.length <= 1) return [text];

	const chunks: string[] = [];
	let current = '';

	for (const para of paragraphs) {
		if (current && current.length + para.length + 2 > MAX_CHARS) {
			chunks.push(current.trim());
			current = para;
		} else {
			current = current ? `${current}\n\n${para}` : para;
		}
	}

	if (current.trim()) {
		chunks.push(current.trim());
	}

	return chunks.length ? chunks : [text];
}
