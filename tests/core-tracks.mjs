// Core track checks: quick race start on every trackId (no console errors, cars move, s grows); circuit laps keep counting past lapLength.
//   node tests/core-tracks.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT = 4186, base = process.env.BASE_URL || `http://localhost:${PORT}`;
let server = null;
if (!process.env.BASE_URL) {
  await new Promise((r) => spawn('npx', ['vite', 'build'], { stdio: 'ignore' }).on('exit', r));
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
}
let fail = 0;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const id of ['country', 'village', 'corn', 'circuit']) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  await p.goto(`${base}/?autostart=1&ai=3&q=low&norender=1&track=${id}`);
  await p.waitForFunction(() => window.__game && window.__game.state.mode === 'race', null, { timeout: 180000 });
  const r = await p.evaluate(() => {
    const g = window.__game, pv = g.vehicles[0], st = pv.body.state, tr = g.world.track;
    const out = { trackId: g.world.trackId || null, length: tr.length, lap: tr.lapLength || tr.length, cars: g.vehicles.length };
    g.setDebugInput({ steer: 0, paddleL: 1, paddleR: 1 }); const s0 = st.s; g.advance(15); out.ds = st.s - s0;
    out.others = g.vehicles.slice(1).map((v) => Math.round(v.body.state.s));
    if (out.lap < out.length - 1) {
      g.teleport(out.lap - 40, 9); g.advance(0.3); const a = st.s; g.advance(12); out.lapDs = st.s - a; out.sAfter = st.s;
      out.lapNo = Math.floor(st.s / out.lap) + 1;
    }
    return out;
  });
  console.log(id, JSON.stringify(r));
  check(r.ds > 20, `${id}: player moves (${r.ds.toFixed(0)} m in 15 s)`);
  check(Math.max(...r.others) > 20 && r.others.every((s) => s > -10), `${id}: AI move (${r.others})`);
  if (r.lapDs !== undefined) { check(r.lapDs > 20 && r.sAfter > r.lap, `${id}: s keeps growing past lapLength (${r.sAfter.toFixed(0)} > ${r.lap.toFixed(0)}, lap ${r.lapNo})`); }
  check(errors.length === 0, `${id}: no console errors ${JSON.stringify(errors.slice(0, 2))}`);
  await ctx.close();
}
// switching tracks at runtime rebuilds the world (overlay) and starts the race
{
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  await p.goto(`${base}/?autostart=1&ai=2&q=low&norender=1`);
  await p.waitForFunction(() => window.__game && window.__game.state.mode === 'race', null, { timeout: 180000 });
  const r = await p.evaluate(async () => {
    const g = window.__game; const w0 = g.world; await g.startRace({ trackId: 'circuit', countdown: 0, ai: 2 });
    g.setDebugInput({ steer: 0, paddleL: 1, paddleR: 1 }); g.advance(10);
    return { rebuilt: g.world !== w0, mode: g.state.mode, track: g.state.track, s: g.state.s, cars: g.vehicles.length };
  });
  console.log('switch', JSON.stringify(r));
  check(r.rebuilt && r.mode === 'race' && r.s > 10 && r.cars === 3, 'runtime track switch rebuilds the world and races');
  check(errors.length === 0, 'switch: no console errors ' + JSON.stringify(errors.slice(0, 2)));
  await ctx.close();
}
await browser.close(); if (server) try { process.kill(-server.pid); } catch {}
process.exit(fail ? 1 : 0);
