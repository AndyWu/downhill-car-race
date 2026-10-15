// PWA bootstrap: service worker registration + runtime fallback for iOS home-screen meta tags.

const HEAD_TAGS = [
  ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
  ['meta', { name: 'mobile-web-app-capable', content: 'yes' }],
  ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }],
  ['meta', { name: 'apple-mobile-web-app-title', content: 'Soap Box' }],
  ['meta', { name: 'theme-color', content: '#2b2418' }],
  ['link', { rel: 'manifest', href: './manifest.webmanifest' }],
  ['link', { rel: 'apple-touch-icon', href: './icons/apple-touch-icon-180.png', sizes: '180x180' }],
  ['link', { rel: 'icon', href: './icons/icon-192.png', type: 'image/png', sizes: '192x192' }],
];

/** Adds iOS/Android PWA head tags if index.html did not already include them. Idempotent. */
export function injectPWAHead(doc = document) {
  for (const [tag, attrs] of HEAD_TAGS) {
    const key = attrs.name ? `${tag}[name="${attrs.name}"]` : `${tag}[rel="${attrs.rel}"]`;
    if (doc.head.querySelector(key)) continue;
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    doc.head.appendChild(el);
  }
  // viewport-fit=cover so the black-translucent status bar area is usable in landscape
  const vp = doc.head.querySelector('meta[name="viewport"]');
  if (vp && !/viewport-fit/.test(vp.content)) vp.content += ', viewport-fit=cover';
  if (!vp) {
    const m = doc.createElement('meta');
    m.name = 'viewport'; m.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    doc.head.appendChild(m);
  }
}

/** true when launched from the Home Screen (standalone) */
export function isStandalone() {
  return !!(globalThis.navigator?.standalone || globalThis.matchMedia?.('(display-mode: standalone)').matches);
}

// ---------------- offline readiness ----------------
// Resolves only when the service worker controlling scope is in state 'activated' AND every
// file in the precache manifest is present in the versioned cache (asked from the SW itself).
let offlineState = { ready: false, cached: 0, total: 0, version: null, state: 'none' };
const offlineCbs = new Set();
let resolveOffline;
/** Promise<{ready:true, cached, total, version}> — pending until the game can launch fully offline. */
export const offlineReady = new Promise((r) => { resolveOffline = r; });
/** cb(status) once offline-ready (immediately if already). Also dispatched as window event 'sbd:offline-ready'. */
export function onOfflineReady(cb) { if (offlineState.ready) cb(offlineState); else offlineCbs.add(cb); return () => offlineCbs.delete(cb); }
/** Synchronous snapshot { ready, cached, total, version, state } for a title-screen badge / progress. */
export function getOfflineStatus() { return { ...offlineState }; }

function askWorker(worker) {
  return new Promise((res) => {
    const ch = new MessageChannel();
    const t = setTimeout(() => res(null), 4000);
    ch.port1.onmessage = (e) => { clearTimeout(t); res(e.data); };
    worker.postMessage({ type: 'GET_STATUS' }, [ch.port2]);
  });
}
function waitActivated(worker) {
  if (!worker) return Promise.resolve(false);
  if (worker.state === 'activated') return Promise.resolve(true);
  return new Promise((res) => worker.addEventListener('statechange', function h() {
    if (worker.state === 'activated') { worker.removeEventListener('statechange', h); res(true); }
    else if (worker.state === 'redundant') { worker.removeEventListener('statechange', h); res(false); }
  }));
}
async function checkOffline(reg) {
  for (let attempt = 0; attempt < 20 && !offlineState.ready; attempt++) {
    const w = reg.active || reg.waiting || reg.installing;
    offlineState.state = w?.state ?? 'none';
    if (await waitActivated(reg.active || w)) {
      const st = await askWorker(reg.active);
      if (st && !st.error) {
        offlineState = { ready: st.total > 0 && st.cached === st.total, cached: st.cached, total: st.total, version: st.version, state: 'activated' };
        if (offlineState.ready) {
          offlineCbs.forEach((cb) => { try { cb(offlineState); } catch (e) { console.error(e); } });
          offlineCbs.clear();
          resolveOffline(offlineState);
          window.dispatchEvent(new CustomEvent('sbd:offline-ready', { detail: offlineState }));
          return;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/**
 * Registers ./sw.js (built output). Skipped in Vite dev unless URL has ?sw=1.
 * Dispatches window 'sbd:sw-update' when a new version is waiting; call applyUpdate() to swap.
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registerServiceWorker({ url = './sw.js', force = false } = {}) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  const isDev = typeof import.meta.env !== 'undefined' && import.meta.env.DEV;
  if (isDev && !force && !/[?&]sw=1/.test(location.search)) return null;
  if (!globalThis.isSecureContext) return null;
  try {
    const reg = await navigator.serviceWorker.register(url, { scope: './' });
    const announce = (w) => window.dispatchEvent(new CustomEvent('sbd:sw-update', { detail: { worker: w, registration: reg } }));
    if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
    checkOffline(reg);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) announce(w); });
    });
    // Ask the browser not to evict our caches / IndexedDB (licence + assets).
    navigator.storage?.persist?.().catch(() => {});
    // Check for updates whenever we regain focus (only succeeds when online).
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    return reg;
  } catch (e) {
    console.warn('[net] service worker registration failed', e);
    return null;
  }
}

/** Activate a waiting service worker and reload once it takes control. */
export function applyUpdate(registration) {
  const w = registration?.waiting;
  if (!w) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  w.postMessage({ type: 'SKIP_WAITING' });
}
