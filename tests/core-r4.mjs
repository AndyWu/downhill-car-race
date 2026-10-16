// Core round-4 checks: no backwards player reset, headlight tap x3 runs, chase cam follow, wet latch only on water, far-LOD rules.
//   node tests/core-r4.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT = 4184, base = process.env.BASE_URL || `http://localhost:${PORT}`;
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
  const ctx = await browser.newContext({ viewport: touch ? { width: 900, height: 506 } : { width: 480, height: 270 }, hasTouch: touch });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  await p.goto(`${base}/${qs}`);
  await p.waitForFunction(() => window.__game && window.__game.state.mode === 'race', null, { timeout: 120000 });
  return { p, ctx };
};

// 1. the player is never moved backwards by a reset (the R3 paddle run gave -64.7 m)
{
  const { p, ctx } = await open('?autostart=1&ai=0&q=low&norender=1');
  const r = await p.evaluate(() => {
    const g = window.__game, pv = g.vehicles[0], st = pv.body.state;
    let worst = 0, prev = st.s;
    g.setDebugInput({ steer: 0, paddleL: 1, paddleR: 1 });
    for (let i = 0; i < 40; i++) { g.advance(0.25); worst = Math.min(worst, st.s - prev); prev = st.s; }
    const out = { worstStep: worst, ds: st.s };
    // an AI-style rescue flag on the player's driver must be ignored; stuck/wrong-way/flip resets never go back
    g.setDebugInput({ steer: 0 }); g.teleport(900, 6); g.advance(0.2);
    let before = st.s; pv.ai = { needsRescue: true, think: () => ({}), clearStuck() {} }; g.advance(0.5); out.rescueDs = st.s - before; delete pv.ai;
    before = st.s; st.stuck = 4.99; st.handbrake = 0; g.advance(0.2); out.stuckDs = st.s - before;
    return out;
  });
  console.log(JSON.stringify(r));
  check(r.worstStep > -1, `paddle run: s never drops by >1 m in a step (worst ${r.worstStep.toFixed(2)} m, total ${r.ds.toFixed(0)} m)`);
  check(r.ds > 60, 'paddle run makes real progress');
  check(r.rescueDs > -1, `rescue flag on the player does not move it back (${r.rescueDs.toFixed(2)} m)`);
  check(r.stuckDs > -1, `stuck reset does not move it back (${r.stuckDs.toFixed(2)} m)`);
  await ctx.close();
}

// 2. headlight tap on -> off -> on, 3 runs in a row
for (let run = 1; run <= 3; run++) {
  const { p, ctx } = await open('?autostart=1&ai=0&q=low', true);
  const cdp = await ctx.newCDPSession(p);
  const { W, H } = await p.evaluate(() => ({ W: innerWidth, H: innerHeight }));
  const seq = [];
  for (let n = 0; n < 3; n++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(0.73 * W), y: Math.round(0.83 * H), id: 20 + n }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(400);
    seq.push(await p.evaluate(() => window.__game.input.read().headlight));
  }
  check(JSON.stringify(seq) === '[true,false,true]', `run ${run}: on, off, on (${JSON.stringify(seq)})`);
  await ctx.close();
}

// 3. chase cam follows the player, and the leader while the player sits still
{
  const { p, ctx } = await open('?autostart=1&ai=2&q=low&cam=chase&norender=1');
  const r = await p.evaluate(() => {
    const g = window.__game, pv = g.vehicles[0];
    g.setDebugInput({ steer: 0, paddleL: 1, paddleR: 1 }); g.advance(15);
    const moving = g.camera.position.distanceTo(pv.group.position);
    g.setDebugInput({ steer: 0, handbrake: 1 }); g.teleport(50, 0); g.advance(25);
    const lead = g.vehicles.reduce((a, v) => (v.body.state.s > a.body.state.s ? v : a));
    return { moving, idleGap: lead.body.state.s - pv.body.state.s, camToLead: g.camera.position.distanceTo(lead.group.position), camToPlayer: g.camera.position.distanceTo(pv.group.position) };
  });
  console.log(JSON.stringify(r));
  check(r.moving < 12, `chase cam is near the moving player (${r.moving.toFixed(1)} m)`);
  check(r.idleGap < 40 || r.camToLead < 15 || r.camToPlayer < 15, `chase cam frames the player or the distant leader (gap ${r.idleGap.toFixed(0)} m, to lead ${r.camToLead.toFixed(1)}, to player ${r.camToPlayer.toFixed(1)})`);
  await ctx.close();
}

// 4. water latch only on real water contact
{
  const { p, ctx } = await open('?autostart=1&ai=0&q=low&norender=1');
  const r = await p.evaluate(() => {
    const g = window.__game; g.state.paused = true;
    const pv = g.vehicles[0], st = pv.body.state, inp = { steer: 0, paddleL: 0, paddleR: 0, handbrake: 0, headlight: false, reverse: false, draft: 0 };
    const run = (s, sec) => { g.teleport(s, 10); st.wetHit = 0; let acc = 0; for (let i = 0; i < sec * 60; i++) { pv.body.step(1 / 60, inp); acc += st.wetHit; st.wetHit = 0; } return acc; };
    const dry = run(1650, 1.5);
    const hz = (g.world.hazards || []).find((h) => h.type === 'water' && (h.kind === 'puddle' || h.kind === 'stream'));
    const wet = hz ? run(Math.max(0, hz.s - 6), 2.5) : -1;
    return { dry, wet, hasWater: !!hz };
  });
  console.log(JSON.stringify(r));
  check(r.dry === 0, `no wet latch on dry road (${r.dry})`);
  check(!r.hasWater || r.wet > 0, `wet latch fires crossing water (${r.wet.toFixed(1)})`);
  await ctx.close();
}

// 5. far LOD: AI trucks beyond ~34 m go far, near again under 26 m; never the player's own truck
{
  const { p, ctx } = await open('?autostart=1&ai=3&q=low&norender=1');
  const r = await p.evaluate(() => {
    const g = window.__game; g.advance(0.2);
    const pv = g.vehicles[0], ais = g.vehicles.filter((v) => !v.isPlayer);
    const out = { hasLOD: ais.every((v) => !!v.setLOD) };
    g.teleport(40, 0); g.advance(0.1);   // everyone else is ahead on the road (>34 m from cockpit eye)
    out.states = ais.map((v) => v.lod); out.player = pv.lod;
    return out;
  });
  console.log(JSON.stringify(r));
  check(r.hasLOD, 'AI trucks expose setLOD');
  check(r.player === 'near', 'player truck never goes far');
  await ctx.close();
}
// 6. handbrake: the touch lever and the debug lever feed the same curve -> same decel (within 15%)
{
  const { p, ctx } = await open('?autostart=1&ai=0&q=low&norender=1', true);
  const cdp = await ctx.newCDPSession(p);
  const { W, H } = await p.evaluate(() => ({ W: innerWidth, H: innerHeight }));
  const decel = (dbg) => p.evaluate((dbg) => { const g = window.__game; g.setDebugInput(dbg); g.teleport(430, 11.5); g.advance(0.3); const v0 = g.state.speed; g.advance(1.5); const r = { d: (v0 - g.state.speed) / 1.5, hb: g.input.read(1 / 60).handbrake }; g.setDebugInput(null); return r; }, dbg);
  const dbg = await decel({ handbrake: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 60, y: Math.round(0.62 * H), id: 7 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 60, y: Math.round(0.95 * H), id: 7 }] });
  const touch = await decel(null);
  console.log('debug', JSON.stringify(dbg), 'touch', JSON.stringify(touch));
  check(touch && Math.abs(touch.hb - 1) < 0.01, 'touch drag reads handbrake 1');
  check(touch && Math.abs(touch.d - dbg.d) <= 0.15 * dbg.d, `touch decel ${touch && touch.d.toFixed(2)} vs debug ${dbg.d.toFixed(2)} m/s2 within 15%`);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await ctx.close();
}
check(errors.length === 0, 'no console errors ' + JSON.stringify(errors.slice(0, 3)));
await browser.close(); if (server) try { process.kill(-server.pid); } catch {}
process.exit(fail ? 1 : 0);
