import type { Handle } from '@sveltejs/kit';
import { connectMQTT } from '$lib/server/mqtt/bridge.js';
import { seed, seedLinks, seedIntegrations } from '$lib/server/db/seed.js';

let started = false;

export const handle: Handle = async ({ event, resolve }) => {
  if (!started) {
    started = true;
    try {
      seed();
      seedLinks();
      seedIntegrations();
    } catch (e) {
      console.error('[seed]', e);
    }
    connectMQTT();
  }

  return resolve(event);
};
