import type { RequestHandler } from '@sveltejs/kit';
import { subscribeToState } from '$lib/server/mqtt/bridge.js';

export const GET: RequestHandler = ({ request }) => {
	let unsub: (() => void) | null = null;
	let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

	function teardown() {
		if (unsub) {
			unsub();
			unsub = null;
		}
		if (keepaliveTimer) {
			clearInterval(keepaliveTimer);
			keepaliveTimer = null;
		}
	}

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			function send(text: string) {
				try {
					controller.enqueue(encoder.encode(text));
				} catch {
					teardown();
				}
			}

			// Tell the browser to retry after 3 seconds on disconnect
			send('retry: 3000\n\n');

			// Subscribe to state — fires immediately with current state, then on each change
			unsub = subscribeToState((state) => {
				send(`data: ${JSON.stringify(state)}\n\n`);
			});

			// Send keepalive comment every 30s to prevent proxy/browser timeout
			keepaliveTimer = setInterval(() => {
				send(': keepalive\n\n');
			}, 30_000);

			// Clean up when client disconnects
			request.signal.addEventListener('abort', () => {
				teardown();
				try {
					controller.close();
				} catch {
					/* already closed */
				}
			});
		},
		cancel() {
			teardown();
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'X-Accel-Buffering': 'no',
		},
	});
};
