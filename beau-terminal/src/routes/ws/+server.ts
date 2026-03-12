import type { RequestHandler } from '@sveltejs/kit';

// WebSocket upgrade is handled in hooks.server.ts
// This stub registers the /ws route with SvelteKit
export const GET: RequestHandler = () => {
  return new Response('WebSocket endpoint', { status: 200 });
};
