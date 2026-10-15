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
  const ctx = await browser.newContext({ viewport: touch ? { width: 900, height: 506 } : { width: 640, height: 360 }, hasTouch: touch });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (process.env.VERBOSE && /input/.test(m.text())) console.log(m.text()); if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  await p.goto(`${base}/${qs}`);
  await p.waitForFunction(() => window.__game && window.__game.state.mode === 'race', null, { timeout: 120000 });
  return { p, ctx };
};

// 1. headlight tap with synthetic touch (start+end back-to-back, page possibly stalled by slow frames): on -> off -> on, in 3 fresh pages
for (let run = 1; run <= 3; run++) {
  const { p, ctx } = await open('?autostart=1&ai=0&q=low&debug=input', true);
  const cdp = await ctx.newCDPSession(p);
  const { W, H } = await p.evaluate(() => ({ W: innerWidth, H: innerHeight }));
  const seq = [];
  for (let n = 0; n < 3; n++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(0.73 * W), y: Math.round(0.83 * H), id: 10 + n }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(300);
    seq.push(await p.evaluate(() => window.__game.input.read().headlight));
  }
  check(JSON.stringify(seq) === '[true,false,true]', `run ${run}: three taps give on, off, on (${JSON.stringify(seq)})`);
  await ctx.close();
}

// 1a. resets never move the player backwards along the track; a stale reverse latch can't make paddling run backwards
{
  const { p, ctx } = await open('?autostart=1&ai=0&q=low&norender=1');
  const r = await p.evaluate(() => {
    const g = window.__game, out = {}, pv = g.vehicles[0], st = pv.body.state;
    g.input.setReverse(true); g.teleport(430, 2);               // teleport clears the reverse latch
    g.setDebugInput({ steer: 0, paddleL: 1, paddleR: 1 }); g.advance(0.05); const s0 = g.state.s; g.advance(10);
    out.paddleDs = g.state.s - s0; g.setDebugInput(null);
    g.teleport(1000, 8); g.advance(0.2); let before = st.s; st.stuck = 4.99; st.handbrake = 0; g.advance(0.1); out.stuckDs = st.s - before;
    g.teleport(1500, 8); g.advance(0.2); before = st.s; st.upsideDown = 2.5; pv.body.recover(0); out.flipDs = st.s - before;
    g.teleport(2000, 8); g.advance(0.2); before = st.s; st.wrongWay = 4.5; st.quaternion.multiply(new st.quaternion.constructor().setFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI)); st.velocity.set(0, 0, 0); g.advance(1); out.wrongDs = st.s - before;
    return out;
  });
  console.log(JSON.stringify(r));
  check(r.paddleDs > 50, 'paddle run after a reverse latch + teleport moves forward (' + r.paddleDs.toFixed(1) + ' m)');
  check(r.stuckDs > -0.5, 'stuck recovery never moves backwards (' + r.stuckDs.toFixed(1) + ' m)');
  check(r.flipDs > -0.5, 'flip recovery never moves backwards (' + r.flipDs.toFixed(1) + ' m)');
  check(r.wrongDs > -5, 'wrong-way handling does not throw the car back (' + r.wrongDs.toFixed(1) + ' m)');
  await ctx.close();
}

// 1c. chase camera follows the car even through long advance() steps
{
  const { p, ctx } = await open('?autostart=1&ai=0&q=low&cam=chase&norender=1');
  const r = await p.evaluate(() => { const g = window.__game; g.setDebugInput({ steer: 0, paddleL: 1, paddleR: 1 }); g.advance(20); return g.camera.position.distanceTo(g.vehicles[0].group.position); });
  check(r < 12, 'chase camera is near the car after a 20 s advance (' + r.toFixed(1) + ' m)');
  await ctx.close();
}

// 1b. tilt calibration from the pre-GO buffer: already turned 20 deg during the countdown must read as zero at GO
{
  const { p, ctx } = await open('?autostart=1&ai=0&q=low&norender=1', true);
  const r = await p.evaluate(async () => {
    const g = window.__game; g.startRace({ ai: 0, countdown: 1 });
    const fire = (a) => window.dispatchEvent(Object.assign(new Event('devicemotion'), { accelerationIncludingGravity: { x: -Math.sin(a) * 9.8, y: Math.cos(a) * 9.8, z: 0 } }));
    for (let i = 0; i < 40; i++) fire(0.35);   // 20 deg of wheel already applied while the countdown runs
    g.advance(1.2);                              // GO happens inside: calibration uses the buffered samples
    for (let i = 0; i < 30; i++) fire(0.35);
    let s0 = 0; for (let i = 0; i < 60; i++) s0 = g.input.read(1 / 60).steer;
    for (let i = 0; i < 40; i++) fire(0.35 + 0.35);
    let s1 = 0; for (let i = 0; i < 60; i++) s1 = g.input.read(1 / 60).steer;
    return { s0, s1 };
  });
  console.log(JSON.stringify(r));
  check(Math.abs(r.s0) < 0.05, 'pose held at GO reads zero steer (' + r.s0.toFixed(3) + ')');
  check(r.s1 > 0.3 && r.s1 < 0.6, 'a further 20 deg turn reads ~0.4 steer (' + r.s1.toFixed(3) + ')');
  await ctx.close();
}

// 2. deterministic paddle vs coast
{
  const { p, ctx } = await open('?autostart=1&ai=0&q=low&norender=1');
  const table = [];
  for (const truck of [0, 3, 6]) {
    const row = await p.evaluate((t) => {
      const g = window.__game; g.startRace({ truck: t, ai: 0, countdown: 0 });
      const run = (inp) => { g.setDebugInput(inp); g.teleport(430, 2); g.advance(0.05); const s0 = g.state.s; g.advance(10); return +(g.state.s - s0).toFixed(1); };
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
  const { p, ctx } = await open('?autostart=1&ai=3&q=low&s=3100&v=12&norender=1');
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
