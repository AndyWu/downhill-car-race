// Offline-readiness test against the REAL game build (full precache manifest, not a stub).
// Builds the game with the repo's vite.config.js into a temp dir, serves it with `vite preview`,
// boots the game, and asserts:
//   • 'sbd:offline-ready' (= offlineReady / onOfflineReady) fires only AFTER the worker's
//     statechange reaches 'activated' — never while installing / installed / activating;
//   • its detail says cached === total === number of entries in dist/precache-manifest.json;
//   • independently, every manifest URL is present in the versioned cache;
//   • with the network off, a reload and an ?autostart deep link both boot the game from cache
//     with zero failed requests.
//   node tests/net-offline.mjs
import { chromium } from 'playwright';
import { build, preview } from 'vite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(join(tmpdir(), 'sbd-net-offline-dist-'));
let fail = 0;
const check = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
let srv, browser;
try {
  await build({ root: ROOT, configFile: join(ROOT, 'vite.config.js'), logLevel: 'warn', build: { outDir: out, emptyOutDir: true } });
  const manifest = JSON.parse(readFileSync(join(out, 'precache-manifest.json'), 'utf8'));
  const swSrc = readFileSync(join(out, 'sw.js'), 'utf8');
  console.log(`  real build: ${manifest.files.length} precache entries, version ${manifest.version}`);
  check(swSrc.includes(`"version":"${manifest.version}"`), 'manifest is inlined into dist/sw.js');
  check(manifest.files.some((f) => f.url === 'index.html') && manifest.files.some((f) => /^assets\/index-.*\.js$/.test(f.url)), 'manifest covers index.html and the main bundle');

  srv = await preview({ root: ROOT, configFile: join(ROOT, 'vite.config.js'), logLevel: 'warn', build: { outDir: out }, preview: { port: 0, host: '127.0.0.1', strictPort: false } });
  const url = `http://127.0.0.1:${srv.httpServer.address().port}/`;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  await ctx.addInitScript(() => {
    window.__swLog = []; window.__ready = null; window.__activeState = null;
    addEventListener('sbd:offline-ready', (e) => { window.__ready = { ...e.detail, activeStateAtEvent: window.__activeState }; window.__swLog.push(['<offline-ready>', true]); });
    if (!navigator.serviceWorker) return;
    const seen = new WeakSet();
    const track = (w) => {
      if (!w || seen.has(w)) return; seen.add(w);
      window.__swLog.push([w.state, !!window.__ready]);
      w.addEventListener('statechange', () => { if (w.state === 'activated' || w.state === 'activating') window.__activeState = w.state; window.__swLog.push([w.state, !!window.__ready]); });
    };
    const poll = setInterval(async () => {
      const r = await navigator.serviceWorker.getRegistration().catch(() => null);
      if (!r) return;
      track(r.installing); track(r.waiting); track(r.active);
      if (r.active && !window.__activeState) window.__activeState = r.active.state;
      r.addEventListener('updatefound', () => track(r.installing));
      if (window.__ready) clearInterval(poll);
    }, 5);
  });
  const p = await ctx.newPage();
  const failed = [];
  p.on('requestfailed', (r) => failed.push(r.url()));
  p.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await p.goto(url + '?q=low&norender=1');
  await p.waitForFunction(() => window.__game, null, { timeout: 120000 });
  const ready = await p.waitForFunction(() => window.__ready, null, { timeout: 120000 }).then((h) => h.jsonValue());
  const log = await p.evaluate(() => window.__swLog);
  console.log(`  state log: ${log.map(([s, r]) => s + (r ? '✓' : '·')).join(' → ')}`);
  const before = log.filter(([s]) => ['installing', 'installed', 'activating'].includes(s));
  check(before.length >= 2 && before.every(([, r]) => !r), `not ready during ${before.map((x) => x[0]).join(' → ')}`);
  const iAct = log.findIndex(([s]) => s === 'activated'), iReady = log.findIndex(([s]) => s === '<offline-ready>');
  check(iAct >= 0 && iReady > iAct && ready.activeStateAtEvent === 'activated', `offline-ready fired after statechange → activated (worker state at event: ${ready.activeStateAtEvent})`);
  check(ready.ready && ready.cached === ready.total && ready.total === manifest.files.length && ready.version === manifest.version,
    `offline-ready detail: ${ready.cached}/${ready.total} cached, manifest has ${manifest.files.length}, version ${ready.version}`);
  const missing = await p.evaluate(async (m) => {
    const c = await caches.open('sbd-precache-' + m.version);
    const miss = [];
    for (const f of m.files) if (!(await c.match(new URL(f.url, location.href).href))) miss.push(f.url);
    return miss;
  }, manifest);
  check(missing.length === 0, `every manifest entry is in sbd-precache-${manifest.version} (${manifest.files.length - missing.length}/${manifest.files.length})${missing.length ? ' missing: ' + missing.slice(0, 5).join(', ') : ''}`);
  const totalKiB = manifest.files.reduce((a, f) => a, 0);
  void totalKiB;

  await ctx.setOffline(true);
  failed.length = 0;
  await p.reload();
  const booted = await p.waitForFunction(() => window.__game, null, { timeout: 120000 }).then(() => true).catch(() => false);
  check(booted && failed.length === 0, `offline reload boots the game from cache (failed requests: ${failed.length}${failed.length ? ' e.g. ' + failed[0] : ''})`);
  failed.length = 0;
  await p.goto(url + '?autostart=1&truck=3&q=low&norender=1');
  const booted2 = await p.waitForFunction(() => window.__game, null, { timeout: 120000 }).then(() => true).catch(() => false);
  check(booted2 && failed.length === 0, `offline ?autostart deep link boots from cache (failed requests: ${failed.length})`);
} catch (e) { console.error(e); fail++; }
finally { await browser?.close(); srv?.httpServer.close(); rmSync(out, { recursive: true, force: true }); }
console.log(fail ? `\n${fail} FAILED` : '\nall offline checks passed');
process.exit(fail ? 1 : 0);
