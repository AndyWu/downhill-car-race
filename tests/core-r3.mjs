// Core round-3 checks: headlight tap (synthetic touch, slow frames), deterministic paddle-vs-coast table, finish card never instant-DNF.
//   node tests/core-r3.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT = 4183, base = process.env.BASE_URL || `http://localhost:${PORT}`;
let server = null;
if (!process.env.BASE_URL) {
  await new Promise((r) => spawn('npx', ['vite', 'build'], { stdio: 'ignore' }).on('exit', r));
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
}
let fail = 0;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const open = async (qs, touch = false) => {
  const ctx = await browser.newContext({ viewport: touch ? { width: 1180, height: 820 } : { width: 640, height: 360 }, hasTouch: touch });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  await p.goto(`${base}/${qs}`);
  await p.waitForFunction(() => window.__game && window.__game.state.mode === 'race', null, { timeout: 120000 });
  return { p, ctx };
};

// 1. headlight tap with synthetic touch (start+end back-to-back, page possibly stalled by slow frames)
{
  const { p, ctx } = await open('?autostart=1&ai=0&q=low', true);
  const cdp = await ctx.newCDPSession(p);
  const before = await p.evaluate(() => window.__game.input.read().headlight);
  for (let n = 0; n < 2; n++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 861, y: 680, id: 4 + n }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(300);
    const now = await p.evaluate(() => window.__game.input.read().headlight);
    check(now === (n === 0 ? !before : before), `tap ${n + 1} toggles headlight (${before} -> ${now})`);
  }
  await ctx.close();
}

// 2. deterministic paddle vs coast
{
  const { p, ctx } = await open('?autostart=1&ai=0&q=low&norender=1');
  const table = [];
  for (const truck of [0, 3, 6]) {
    const row = await p.evaluate((t) => {
      const g = window.__game; g.startRace({ truck: t, ai: 0, countdown: 0 });
      const run = (inp) => { g.setDebugInput(inp); g.teleport(100, 2); g.advance(0.05); const s0 = g.state.s; g.advance(10); return +(g.state.s - s0).toFixed(1); };
      const coast = run({ steer: 0 }), pad1 = run({ steer: 0, paddleL: 1, paddleR: 1 }), pad2 = run({ steer: 0, paddleL: 1, paddleR: 1 });
      g.setDebugInput(null);
      return { truck: g.vehicles[0].spec.id, coast, pad1, pad2 };
    }, truck);
    table.push(row); console.log(JSON.stringify(row));
    check(row.pad1 === row.pad2, `${row.truck}: paddle run is deterministic (${row.pad1} == ${row.pad2})`);
    check(row.pad1 > row.coast * 1.15, `${row.truck}: paddling beats coasting by >15% over 10 s from 2 m/s (${row.pad1} vs ${row.coast} m)`);
  }
  await ctx.close();
}

// 3. finish card: AI keep racing, nobody is DNF the instant the player finishes
{
  const { p, ctx } = await open('?autostart=1&ai=3&q=low&s=3050&v=12&norender=1');
  const r = await p.evaluate(async () => {
    const g = window.__game; g.setDebugInput({ steer: 0, paddleL: 1, paddleR: 1 });
    for (let i = 0; i < 60 && !g.state.finished; i++) g.advance(1);
    const mode = g.state.mode, t = g.state.raceTime;
    const rows = [...document.querySelectorAll('.sbd-standings li')].map((l) => l.textContent);
    g.advance(40);
    const later = [...document.querySelectorAll('.sbd-standings li')].map((l) => l.textContent);
    return { mode, t, rows, later, aiFinished: g.vehicles.filter((v) => !v.isPlayer && v.finished).length };
  });
  console.log(JSON.stringify(r));
  check(r.mode === 'finish', 'player finishes');
  check(r.rows.length >= 4 && !r.rows.some((x) => /DNF/.test(x)), 'no DNF on the card the moment the player finishes');
  check(r.aiFinished >= 1, 'AI keep racing after the player finished (' + r.aiFinished + ' finished within 40 s)');
  await ctx.close();
}
check(errors.length === 0, 'no console errors ' + JSON.stringify(errors.slice(0, 3)));
await browser.close(); if (server) try { process.kill(-server.pid); } catch {}
process.exit(fail ? 1 : 0);
