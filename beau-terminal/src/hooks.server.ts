import type { Handle } from '@sveltejs/kit';
import { connectMQTT } from '$lib/server/mqtt/bridge.js';
import { seed, seedLinks, seedIntegrations } from '$lib/server/db/seed.js';
import { MemoryProvider } from '$lib/server/memory/provider.js';
import { registerMemoryProvider, getMemoryProvider } from '$lib/server/memory/index.js';
import { initTraining } from '$lib/server/training/index.js';

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

    // Create and register memory provider BEFORE connectMQTT
    // so the thought system can access memory via singleton
    try {
      const memProvider = new MemoryProvider({
        chromaUrl: process.env.CHROMA_URL || 'http://localhost:8000',
        ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
      });
      registerMemoryProvider(memProvider);
    } catch (e) {
      console.error('[memory] provider creation failed (non-fatal):', e);
    }

    connectMQTT();
    initTraining();

    // Fire-and-forget async startup for memory
    // Sweep always starts — even if bootstrap partially fails
    (async () => {
      const mem = getMemoryProvider();
      if (!mem) return;

      // Best-effort bootstrap — each step independent
      try { await mem.ensureCollections(); } catch (e) { console.error('[memory] ensureCollections failed (non-fatal):', e); }
      try { await mem.reconcileAll(); } catch (e) { console.error('[memory] reconcileAll failed (non-fatal):', e); }
      try { await mem.indexBible(); } catch (e) { console.error('[memory] indexBible failed (non-fatal):', e); }

      // Sweep interval — always starts, processes whatever is in the queue
      let isSweeping = false;
      const sweepMs = parseInt(process.env.MEMORY_SWEEP_INTERVAL_MS || '60000', 10);
      setInterval(() => {
        if (isSweeping) return;
        isSweeping = true;
        mem.processBatch(5)
          .then(s => { if (s.processed > 0) console.log(`[memory] sweep: ${s.processed} embedded, ${s.pending} pending`); })
          .catch(e => console.error('[memory] sweep error:', e))
          .finally(() => { isSweeping = false; });
      }, sweepMs);
      console.log('[memory] startup complete');
    })();
  }

  return resolve(event);
};
