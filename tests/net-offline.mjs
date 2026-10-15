// Production-build PWA check for src/net: builds a tiny page that boots the net module, serves it
// with `vite preview`, waits for offlineReady (SW 'activated' + precache count == manifest count),
// then goes offline and reloads.     node tests/net-offline.mjs
import { chromium } from 'playwright';
import { build, preview } from 'vite';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import swManifest from '../vite.sw-manifest.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'sbd-net-offline-'));
let fail = 0;
const check = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
writeFileSync(join(tmp, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>net offline</title></head><body><p id="s">boot</p>
<script type="module">
import { registerServiceWorker, injectPWAHead, offlineReady, onOfflineReady, getOfflineStatus } from '${join(ROOT, 'src/net/index.js')}';
injectPWAHead();
window.events = [];
window.addEventListener('sbd:offline-ready', (e) => window.events.push(e.detail));
window.early = getOfflineStatus();
registerServiceWorker();
offlineReady.then((s) => { window.ready = s; });
onOfflineReady((s) => { window.cbReady = s; });
document.getElementById('s').textContent = 'app ok';
</script></body></html>`);
let srv, browser;
try {
  await build({ root: tmp, configFile: false, base: './', logLevel: 'warn', publicDir: join(ROOT, 'public'), plugins: [swManifest()], build: { outDir: join(tmp, 'dist'), target: 'es2022' } });
  srv = await preview({ root: tmp, configFile: false, logLevel: 'warn', build: { outDir: join(tmp, 'dist') }, preview: { port: 0, host: '127.0.0.1' } });
  const url = `http://127.0.0.1:${srv.httpServer.address().port}/`;
  browser = await chromium.launch();
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(url);
  const early = await p.evaluate(() => window.early);
  check(early.ready === false, 'not reported ready before the SW is activated');
  const st = await p.waitForFunction(() => window.ready, null, { timeout: 30000 }).then((h) => h.jsonValue());
  const sw = await p.evaluate(async () => ({ state: navigator.serviceWorker.controller?.state, reg: (await navigator.serviceWorker.getRegistration()).active.state, keys: await caches.keys() }));
  check(st.ready && st.cached === st.total && st.total > 0, `offlineReady: ${st.cached}/${st.total} files cached, version ${st.version}`);
  check(sw.reg === 'activated', `SW state at ready: ${sw.reg}`);
  check(await p.evaluate(() => !!window.cbReady && window.events.length === 1), 'onOfflineReady callback + sbd:offline-ready event fired once');
  await ctx.setOffline(true);
  await p.reload();
  check((await p.textContent('#s')) === 'app ok', 'offline reload boots from cache');
  await p.goto(url + '?autostart=1&truck=3');
  check((await p.textContent('#s')) === 'app ok', 'offline ?autostart navigation boots from cache');
  const again = await p.waitForFunction(() => window.ready, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => null);
  check(again?.ready === true, 'offlineReady also resolves while offline (already-cached app)');
} catch (e) { console.error(e); fail++; }
finally { await browser?.close(); srv?.httpServer.close(); rmSync(tmp, { recursive: true, force: true }); }
console.log(fail ? `\n${fail} FAILED` : '\nall offline checks passed');
process.exit(fail ? 1 : 0);
