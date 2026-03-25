// Memory provider singleton — register at startup, access from anywhere.
// Pattern mirrors src/lib/server/thoughts/index.ts

import type { MemoryProvider } from './provider.js';

let _provider: MemoryProvider | null = null;

export function registerMemoryProvider(provider: MemoryProvider) {
	_provider = provider;
}

export function getMemoryProvider(): MemoryProvider | null {
	return _provider;
}
