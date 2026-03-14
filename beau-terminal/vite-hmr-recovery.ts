import type { Plugin } from 'vite';

/**
 * Vite plugin: automatic dev server recovery.
 *
 * When the Vite dev server drops (WebSocket fails, modules don't load,
 * server crashes), this plugin:
 *   1. Detects if the app failed to hydrate after page load
 *   2. Monitors server health with periodic heartbeats
 *   3. Shows a small overlay while recovering
 *   4. Auto-reloads when the server is available again
 *   5. Prevents infinite reload loops via sessionStorage counter
 *
 * Only runs in dev mode (`apply: 'serve'`). Does nothing in production builds.
 *
 * Pair with `(window as any).__BMO_READY = true` in your root layout's onMount.
 */
export function hmrRecovery(): Plugin {
  return {
    name: 'vite-hmr-recovery',
    apply: 'serve',

    transformIndexHtml(html) {
      const script = `<script>
// [vite-hmr-recovery] Auto-detect and recover from dev server disconnections
(function() {
  var INIT_TIMEOUT = 8000;
  var POLL_MS = 2000;
  var HEARTBEAT_MS = 15000;
  var MAX_HEARTBEAT_FAILS = 3;
  var MAX_RELOADS = 5;
  var RELOAD_KEY = '__hmr_recovery_reloads';

  var el, active = false, heartbeatFails = 0;
  var reloads = +(sessionStorage.getItem(RELOAD_KEY) || 0);

  function show(t) {
    if (!document.body) return;
    if (!el) {
      el = document.createElement('div');
      el.style.cssText = 'position:fixed;bottom:1rem;right:1rem;background:#0c1710;color:#00e5a0;font:13px/1.4 "Courier New",monospace;padding:8px 16px;border:1px solid #1a3a2a;border-radius:6px;z-index:99999;pointer-events:none;opacity:.92';
      document.body.appendChild(el);
    }
    el.textContent = t;
  }

  function hide() { if (el) { el.remove(); el = null; } }

  function ping() {
    return fetch('/__vite_ping', { cache: 'no-store' });
  }

  function doReload() {
    sessionStorage.setItem(RELOAD_KEY, String(reloads + 1));
    location.reload();
  }

  function recover(reason) {
    if (active) return;
    if (reloads >= MAX_RELOADS) {
      show('[dev] Reload limit reached — restart the server');
      return;
    }
    active = true;
    var n = 0;
    show('[dev] ' + reason + ' — reconnecting…');
    var iv = setInterval(function() {
      n++;
      ping().then(function(r) {
        if (r.ok) {
          clearInterval(iv);
          show('[dev] Reloading…');
          setTimeout(doReload, 400);
        }
      }).catch(function() {
        show('[dev] Waiting for server (' + n + ')…');
      });
    }, POLL_MS);
  }

  // Reset reload counter once the app hydrates successfully
  setTimeout(function() {
    if (window.__BMO_READY) sessionStorage.removeItem(RELOAD_KEY);
  }, INIT_TIMEOUT + 2000);

  // Phase 1: Hydration gate — if SvelteKit hasn't mounted, trigger recovery
  setTimeout(function() {
    if (!window.__BMO_READY && !active) recover('App failed to initialize');
  }, INIT_TIMEOUT);

  // Phase 2: Heartbeat — once running, poll the server for liveness
  setInterval(function() {
    if (!window.__BMO_READY || active) return;
    ping()
      .then(function() { heartbeatFails = 0; hide(); })
      .catch(function() {
        if (++heartbeatFails >= MAX_HEARTBEAT_FAILS) recover('Dev server lost');
      });
  }, HEARTBEAT_MS);
})();
</script>`;

      return html.replace('</head>', script + '\n</head>');
    },
  };
}
