import type { Handle } from '@sveltejs/kit';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import { subscribeToState, connectMQTT } from '$lib/server/mqtt/bridge.js';
import { seed, seedLinks } from '$lib/server/db/seed.js';

let wss: WebSocketServer | null = null;
let mqttStarted = false;

function getWSS(server: Server): WebSocketServer {
  if (!wss) {
    wss = new WebSocketServer({ noServer: true });
    wss.on('connection', (ws: WebSocket) => {
      const unsub = subscribeToState((state) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify(state));
        }
      });
      ws.on('close', unsub);
      ws.on('error', () => unsub());
    });
  }
  return wss;
}

export const handle: Handle = async ({ event, resolve }) => {
  if (!mqttStarted) {
    mqttStarted = true;
    try { seed(); seedLinks(); } catch (e) { console.error('[seed]', e); }
    connectMQTT();
  }

  if (
    event.request.headers.get('upgrade')?.toLowerCase() === 'websocket' &&
    event.url.pathname === '/ws'
  ) {
    const platform = event.platform as { server?: Server; socket?: unknown } | undefined;
    if (platform?.server) {
      const wsServer = getWSS(platform.server);
      return new Promise<Response>((resolve) => {
        wsServer.handleUpgrade(
          event.request as unknown as IncomingMessage,
          platform.socket as import('net').Socket,
          Buffer.alloc(0),
          (ws: WebSocket) => {
            wsServer.emit('connection', ws, event.request);
            resolve(new Response(null, { status: 101 }));
          }
        );
      });
    } else {
      console.error('[WS] platform.server not available — cannot upgrade WebSocket');
      return new Response('WebSocket upgrade unavailable', { status: 503 });
    }
  }

  return resolve(event);
};
