// Renders every truck from a 3/4 exterior view and from its driverEye (first person) to /tmp/claude-0/truck-*.png
// Usage: node tests/trucks-preview.mjs [truckIndex ...]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 5199;
const only = process.argv.slice(2).map(Number);
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function up() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/tests/trucks-preview.html`); if (r.ok) return; } catch {}
    await wait(500);
  }
  throw new Error('vite did not start');
}
let code = 0;
try {
  await up();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('[console]', m.type(), m.text()); });
  page.on('pageerror', (e) => { console.log('[pageerror]', e.message); code = 1; });
  await page.goto(`http://127.0.0.1:${PORT}/tests/trucks-preview.html`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  const n = await page.evaluate(() => window.__count);
  const ids = await page.evaluate(() => Array.from({ length: window.__count }, (_, i) => i));
  const report = [];
  for (const i of ids) {
    if (only.length && !only.includes(i)) continue;
    for (const view of ['ext', 'fp', 'mech']) {
      await page.waitForFunction(() => typeof window.__show === 'function', null, { timeout: 60000 });
      const info = await page.evaluate(([i, v]) => window.__show(i, v), [i, view]);
      const file = `/tmp/claude-0/truck-${String(i).padStart(2, '0')}-${info.id}-${view}.png`;
      await page.locator('canvas').screenshot({ path: file });
      if (view === 'ext') report.push(info);
    }
  }
  console.log(JSON.stringify(report, null, 1));
  await browser.close();
} catch (e) { console.error(e); code = 1; }
vite.kill();
process.exit(code);
