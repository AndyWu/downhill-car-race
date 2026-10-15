/* Soap Box Derby — offline-first service worker (owned by Agent 2 / src/net).
 *
 * The build plugin (vite.sw-manifest.js) replaces the PRECACHE_MANIFEST placeholder below with
 * { version, files:[{url, hash}] } covering every file in dist/. In dev (no build) it falls back
 * to fetching ./precache-manifest.json and, failing that, plain runtime caching.
 */
const PRECACHE_MANIFEST = /*__PRECACHE_MANIFEST__*/ null;
const PREFIX = 'sbd-';
const SCOPE = self.registration.scope;
const INDEX_URL = new URL('index.html', SCOPE).href;

let manifestP = null;
function getManifest() {
  if (PRECACHE_MANIFEST) return Promise.resolve(PRECACHE_MANIFEST);
  manifestP ??= fetch(new URL('precache-manifest.json', SCOPE), { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null)
    .then((m) => m || { version: 'dev', files: [] });
  return manifestP;
}
const cacheNames = (v) => ({ pre: `${PREFIX}precache-${v}`, rt: `${PREFIX}runtime-${v}` });

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const m = await getManifest();
    const cache = await caches.open(cacheNames(m.version).pre);
    // Fetch everything; any failure aborts install so we never activate a half-cached game.
    await Promise.all(m.files.map(async (f) => {
      const url = new URL(f.url, SCOPE).href;
      if (await cache.match(url)) return;
      const res = await fetch(url, { cache: 'reload' });
      if (!res.ok) throw new Error(`precache ${f.url} → ${res.status}`);
      await cache.put(url, res);
    }));
    // Always have the shell, even in dev.
    if (!(await cache.match(INDEX_URL))) {
      const r = await fetch(INDEX_URL, { cache: 'reload' }).catch(() => null);
      if (r && r.ok) await cache.put(INDEX_URL, r);
    }
    // First install: take over immediately. Updates wait for the page to ask (never mid-race).
    if (!self.registration.active) self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const m = await getManifest();
    const keep = Object.values(cacheNames(m.version));
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && !keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function precacheStatus() {
  const m = await getManifest();
  const cache = await caches.open(cacheNames(m.version).pre);
  let cached = 0;
  for (const f of m.files) if (await cache.match(new URL(f.url, SCOPE).href)) cached++;
  return { version: m.version, total: m.files.length, cached, state: self.serviceWorker?.state ?? (self.registration.active ? 'activated' : 'unknown') };
}

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'GET_STATUS') {
    const port = e.ports && e.ports[0];
    e.waitUntil(precacheStatus().then((st) => port ? port.postMessage(st) : e.source?.postMessage({ type: 'STATUS', ...st }))
      .catch((err) => port?.postMessage({ error: String(err) })));
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/precache-manifest.json')) return;

  if (req.mode === 'navigate') {
    // Offline-first app shell: on a hotspot with no internet, network requests can hang for
    // a long time, so never wait on the network for navigation.
    event.respondWith((async () => {
      const m = await getManifest();
      const cache = await caches.open(cacheNames(m.version).pre);
      const hit = (await cache.match(INDEX_URL)) || (await caches.match(INDEX_URL));
      if (hit) return hit;
      try { return await fetch(req); } catch {
        return new Response('<h1>Soap Box Derby is offline</h1><p>Open the game once while online to install it.</p>', { headers: { 'Content-Type': 'text/html' }, status: 503 });
      }
    })());
    return;
  }

  // Cache-first for assets (all hashed by Vite), then network with runtime caching.
  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreVary: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') {
      const m = await getManifest();
      const c = await caches.open(cacheNames(m.version).rt);
      c.put(req, res.clone()).catch(() => {});
    }
    return res;
  })());
});
