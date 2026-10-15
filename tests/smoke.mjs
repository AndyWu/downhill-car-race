// Smoke test: node tests/smoke.mjs  (starts vite dev server unless BASE_URL given)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const PORT = 4179;
const base = process.env.BASE_URL || `http://localhost:${PORT}`;
let server = null;
if (!process.env.BASE_URL) {
  const b = spawn('npx', ['vite', 'build'], { stdio: 'ignore' });
  await new Promise((r) => b.on('exit', r));
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { const r = await fetch(base); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
}
fs.mkdirSync('/tmp/claude-0', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
let fail = 0;
const check = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };

await page.goto(`${base}/?autostart=1&truck=0&ai=0&q=low`);
await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
await page.evaluate(() => window.__game.screenshotReady);
await page.screenshot({ timeout: 180000, path: '/tmp/claude-0/smoke-start.png' });
await page.evaluate(() => window.__game.setDebugInput({ steer: 0, paddleL: 1, paddleR: 1 }));
const s0 = await page.evaluate(() => window.__game.state.s);
await page.evaluate(() => window.__game.advance(5));
const r = await page.evaluate(() => ({ s: window.__game.state.s, speed: window.__game.state.speed, nan: window.__game.vehicles.some((v) => !Number.isFinite(v.body.state.position.x)) }));
console.log('after 5s', r);
check(r.speed > 0.5, 'speed > 0');
check(r.s > s0 + 1, 's increasing');
check(!r.nan, 'no NaN');
await page.screenshot({ timeout: 180000, path: '/tmp/claude-0/smoke-5s.png' });
// longer: 30s of downhill, steering straight, with turn test
await page.evaluate(() => window.__game.advance(25));
const r2 = await page.evaluate(() => ({ s: window.__game.state.s, speed: window.__game.state.speed }));
console.log('after 30s', r2);
check(r2.s > r.s, 's keeps increasing');
await page.evaluate(() => { window.__game.setDebugInput({ steer: 1, handbrake: 0.6 }); window.__game.advance(1.5); });
await page.screenshot({ timeout: 180000, path: '/tmp/claude-0/smoke-turn.png' });
// dusk + headlight + teleport
await page.goto(`${base}/?autostart=1&truck=1&s=800&time=dusk&headlight=1&ai=2&q=low`);
await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
await page.evaluate(() => window.__game.screenshotReady);
await page.evaluate(() => window.__game.advance(1));
await page.screenshot({ timeout: 180000, path: '/tmp/claude-0/smoke-dusk.png' });
const r3 = await page.evaluate(() => window.__game.state.s);
check(r3 > 700, `?s=800 teleport (s=${r3.toFixed(0)})`);
await page.goto(`${base}/?autostart=1&truck=2&ai=5&s=300&q=low`);
await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
await page.evaluate(() => { window.__game.advance(20); });
const r4 = await page.evaluate(() => window.__game.vehicles.map((v) => +v.body.state.s.toFixed(0)));
console.log('6 cars s after 20s', r4);
check(r4.length === 6 && r4.every((x) => x > 300), 'player + 5 AI all advance');
await page.screenshot({ timeout: 180000, path: '/tmp/claude-0/smoke-ai.png' });
check(errors.length === 0, 'no console errors ' + JSON.stringify(errors.slice(0, 3)));
await browser.close();
if (server) try { process.kill(-server.pid); } catch {}
process.exit(fail ? 1 : 0);
