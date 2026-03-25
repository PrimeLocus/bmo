// Memory provider singleton — register at startup, access from anywhere.
// Pattern mirrors src/lib/server/thoughts/index.ts

import type { MemoryProvider } from './provider.js';
import type { SourceType } from './types.js';

let _provider: MemoryProvider | null = null;

export function registerMemoryProvider(provider: MemoryProvider) {
	_provider = provider;
}

export function getMemoryProvider(): MemoryProvider | null {
	return _provider;
}

/** Fire-and-forget enqueue for memory indexing */
export function enqueueMemory(
	source: SourceType,
	entityId: string | number,
	text: string,
	metadata: Record<string, string | number> = {},
) {
	const provider = _provider;
	if (!provider) return;
	provider
		.upsert({
			source,
			entityId: String(entityId),
			text,
			metadata: { ...metadata, createdAt: new Date().toISOString() },
		})
		.catch(() => {}); // fire-and-forget
}

/** Fire-and-forget remove from memory */
export function removeMemory(source: SourceType, entityId: string | number) {
	const provider = _provider;
	if (!provider) return;
	provider.remove({ source, entityId: String(entityId) }).catch(() => {});
}
