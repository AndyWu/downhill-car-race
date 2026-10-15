// Critic round-3 harness: node tests/critic-r2.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';

const PORT = 4173;
const base = `http://localhost:${PORT}`;
const OUT = 'critique/screens/round-3';
const DIST = process.env.CRITIC_DIST || 'dist-critic';
fs.mkdirSync(OUT, { recursive: true });
execSync(`npx vite build --outDir ${DIST} --emptyOutDir`, { stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--outDir', DIST], { stdio: 'ignore', detached: true });
for (let i = 0; i < 60; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }

const R = {};
const log = (k, v) => { R[k] = v; console.log(k, JSON.stringify(v)); };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
const ctxOpts = { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, hasTouch: true };
const errors = [];
async function open(q, ctx) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(q + ' :: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(q + ' :: ' + m.text()); });
  await page.goto(`${base}/?${q}${/(^|&)q=/.test(q) || !q ? '' : '&q=medium'}`);
  await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
  await page.evaluate(() => window.__game.screenshotReady);
  await page.waitForTimeout(600);
  return page;
}
const shot = (page, n) => page.screenshot({ path: `${OUT}/${n}.jpg`, type: 'jpeg', quality: 82, timeout: 180000 });
const PH = (process.env.PHASES || 'offline,controls,shots,trucks,ai').split(',');

try {
  // ---------- 1. offline ----------
  if (PH.includes('offline')) {
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    await page.goto(base + '/');
    let sw = null;
    try { sw = await page.evaluate(async () => { const r = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 20000))]); return r && r.active ? r.active.state : null; }); } catch (e) { sw = 'err ' + e.message; }
    await page.waitForTimeout(3000);
    const swAfter = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r && r.active ? r.active.state : null; });
    const cachesBefore = await page.evaluate(async () => { const out = {}; for (const k of await caches.keys()) { out[k] = (await (await caches.open(k)).keys()).length; } return out; });
    await ctx.setOffline(true);
    let booted = false, err = null;
    try { await page.reload(); await page.waitForFunction(() => window.__game, null, { timeout: 30000 }); booted = true; } catch (e) { err = e.message.slice(0, 200); }
    let offAuto = false;
    try { await page.goto(base + '/?autostart=1&ai=2'); await page.waitForFunction(() => window.__game && window.__game.state.mode === 'race', null, { timeout: 30000 }); offAuto = true; } catch (e) { err = (err || '') + ' | auto: ' + e.message.slice(0, 150); }
    if (booted) await shot(page, 'offline-boot');
    log('offline', { swState: sw, swAfter3s: swAfter, caches: cachesBefore, bootedOffline: booted, autostartOffline: offAuto, err });
    await ctx.close();
  }

  const ctx = await browser.newContext(ctxOpts);

  if (PH.includes('glyph')) {
    const c3 = await browser.newContext(ctxOpts);
    const page = await open('autostart=1&truck=0&ai=0&q=low', c3);
    const series = [];
    for (let t = 0; t <= 60; t += 5) { series.push([t, await page.evaluate(() => { const e = document.querySelector('.sbd-glyphs'); return e ? +(+getComputedStyle(e).opacity).toFixed(2) : null; })]); await page.waitForTimeout(5000); }
    log('glyphOpacitySeries', series);
    await shot(page, 'glyphs-60s');
    await c3.close();
  }
  if (PH.includes('extra')) {
    const c4 = await browser.newContext(ctxOpts);
    const page = await open('autostart=1&truck=0&ai=5&q=default&debug=input', c4);
    const inputLogs = []; page.on('console', (m) => { if (m.text().startsWith('[input]')) inputLogs.push(m.text()); });
    const info = await page.evaluate(() => { const g = window.__game; const r = {}; for (const s of [0, 600, 1500, 3150]) { g.teleport(s, 0); g.vehicles.forEach((v, i) => { if (i) { /* keep AI where they are */ } }); g.advance(1 / 60); const i = g.renderer.info.render; r[s] = { calls: i.calls, triangles: i.triangles }; } return r; });
    log('rendererInfo_q_default_ai5', info);
    const det = await page.evaluate(() => { const g = window.__game; const run = (pad) => { g.setDebugInput(pad ? { steer: 0, paddleL: 1, paddleR: 1 } : { steer: 0 }); g.teleport(100, 2); g.advance(0.05); const s0 = g.state.s; g.advance(10); return +(g.state.s - s0).toFixed(2); };
      const r = { coastA: run(false), coastB: run(false), padA: run(true), padB: run(true) };
      g.setDebugInput({ steer: 0, handbrake: 1 }); g.teleport(400, 12); g.advance(0.05); const b0 = g.state.speed; g.advance(2); r.hbDecel = +((b0 - g.state.speed) / 2).toFixed(2);
      const bm = []; for (const [s0, st] of [[600, 0.35], [1500, -0.35], [2200, 0.5]]) { g.setDebugInput({ steer: st }); g.teleport(s0, 10); let mx = 0; for (let k = 0; k < 60; k++) { g.advance(0.25); const p = g.state; const v = g.vehicles.find((x) => x.isPlayer).body.state; const hw = g.world.track.sampleAt(v.s).width / 2; mx = Math.max(mx, Math.abs(v.lateral) - hw); } bm.push({ s0, steer: st, maxBeyondEdge_m: +mx.toFixed(2) }); }
      r.berm = bm; g.setDebugInput({ steer: 0 }); g.teleport(600, 10); let mx = 0; for (let k = 0; k < 120; k++) { g.advance(0.25); const v = g.vehicles.find((x) => x.isPlayer).body.state; mx = Math.max(mx, Math.abs(v.lateral) - g.world.track.sampleAt(v.s).width / 2); } r.noInput30s_maxBeyondEdge_m = +mx.toFixed(2);
      g.setDebugInput(null);
      r.hazards = (g.world.hazards || []).reduce((o, h) => { const k = h.kind || h.type; o[k] = (o[k] || 0) + 1; return o; }, {});
      r.waterNear150 = (g.world.hazards || []).filter((h) => Math.abs(h.s - 150) < 60).map((h) => ({ kind: h.kind || h.type, s: Math.round(h.s), r: h.radius }));
      return r; });
    log('physics', det);
    await page.evaluate(() => window.__game.teleport(150 - 25, 0)); await page.evaluate(() => window.__game.advance(0.1));
    await shot(page, 'puddle-s150');
    // headlight tap with debug logs
    const cdp = await c4.newCDPSession(page);
    const W = 1180, H = 820; const hx = Math.round(0.73 * W), hy = Math.round(0.8 * H);
    const before = await page.evaluate(() => window.__game.input.read().headlight);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hx, y: hy, id: 9 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => window.__game.input.read().headlight);
    log('headlightTap', { before, after, logs: inputLogs.slice(0, 8) });
    await c4.close();
    // mud splatter at render time + cockpit mud
    const c5 = await browser.newContext(ctxOpts);
    const p5 = await open('scene=mud&ai=0&q=medium', c5);
    await p5.evaluate(() => { const g = window.__game; g.setDebugInput({ steer: 0, paddleL: 1, paddleR: 1 }); for (let i = 0; i < 90; i++) g.advance(1 / 30); });
    await shot(p5, 'mud-splatter-rendered');
    await p5.evaluate(() => { const g = window.__game; for (let i = 0; i < 40; i++) g.advance(1 / 30); });
    await shot(p5, 'mud-splatter-rendered-2');
    await c5.close();
  }
  // ---------- 3. controls ----------
  if (PH.includes('controls')) {
    const page = await open('autostart=1&truck=0&ai=0&s=200&v=6', ctx);
    // tilt: emulate devicemotion gravity vector (landscape-primary angle 90 assumed by screen.orientation)
    const tilt = await page.evaluate(async () => {
      const g = window.__game;
      const pv = g.vehicles.find((v) => v.isPlayer);
      const fire = (x, y, z) => window.dispatchEvent(Object.assign(new Event('devicemotion'), { accelerationIncludingGravity: { x, y, z }, acceleration: { x: 0, y: 0, z: 0 } }));
      const fireO = (b, gm) => window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 0, beta: b, gamma: gm }));
      const res = {};
      const sample = async (label, x, y, z) => {
        for (let i = 0; i < 30; i++) { fire(x, y, z); fireO(5, 30); await new Promise((r) => requestAnimationFrame(r)); }
        res[label] = { raw: +g.input.rawAngleDeg.toFixed(1), steer: +g.input.read().steer.toFixed(2), wheelRotZ: +(pv.parts.steeringWheel.rotation.z).toFixed(3), angVelY: +pv.body.state.angularVelocity.y.toFixed(3) };
      };
      res.hasMotionBefore = g.input.hasMotion;
      await sample('neutral', 0, 0, -9.8 * 0.2 - 0.0001 + 0 /*upright*/, 0);
      await sample('upright', 9.8, 0.0, -1.5);
      g.input.calibrate();
      await sample('tiltA', 9.8 * Math.cos(0.5), 9.8 * Math.sin(0.5), -1.5);
      await sample('tiltB', 9.8 * Math.cos(-0.5), 9.8 * Math.sin(-0.5), -1.5);
      res.screenAngle = screen.orientation && screen.orientation.angle;
      res.isTouch = g.input.isTouch; res.hasMotion = g.input.hasMotion;
      return res;
    });
    log('tilt', tilt);
    await shot(page, 'controls-tilt');
    // swipe paddles: measure speed gain over 4 s real-time with swipes vs none
    const speedAt = () => page.evaluate(() => window.__game.state.speed);
    await page.evaluate(() => { window.__game.setDebugInput({ steer: 0 }); window.__game.teleport(200, 3); });
    await page.waitForTimeout(100);
    const s0 = await speedAt(); await page.waitForTimeout(4000); const sNone = await speedAt();
    await page.evaluate(() => { window.__game.setDebugInput({ steer: 0 }); window.__game.teleport(200, 3); });
    await page.waitForTimeout(100);
    const s1 = await speedAt();
    const cdp = await ctx.newCDPSession(page);
    const swipe = async (x, id) => {
      const pts = (y) => [{ x, y, id }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(300) });
      for (let y = 300; y <= 760; y += 46) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(y) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const t0 = Date.now(); let n = 0;
    while (Date.now() - t0 < 4000) { await swipe(400, 1); await swipe(960, 2); n++; await page.waitForTimeout(120); }
    const sSwipe = await speedAt();
    log('swipe', { noInput: [s0, sNone].map((v) => +v.toFixed(2)), swipes: [s1, sSwipe].map((v) => +v.toFixed(2)), strokePairs: n });
    // handbrake zone hold
    await page.evaluate(() => window.__game.teleport(400, 12));
    const hb = await (async () => {
      const a = await speedAt();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 700, id: 3 }] });
      for (let y = 700; y < 960; y += 40) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150, y, id: 3 }] });
      await page.waitForTimeout(1500);
      const lever = await page.evaluate(() => window.__game.vehicles.find((v) => v.isPlayer).parts.handbrakeLever.rotation.x);
      await shot(page, 'controls-handbrake');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const b = await speedAt();
      return { before: +a.toFixed(2), after1500ms: +b.toFixed(2), leverRotX: +lever.toFixed(3) };
    })();
    log('handbrake', hb);
    // headlight tap & gear drag
    const hl0 = await page.evaluate(() => window.__game.input.read().headlight);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 861, y: 656, id: 4 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
    const hl1 = await page.evaluate(() => window.__game.input.read().headlight);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 1062, y: 560, id: 5 }] });
    for (let y = 560; y < 760; y += 25) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 1062, y, id: 5 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const rev = await page.evaluate(() => window.__game.input.read().reverse);
    const glyph = await page.evaluate(() => { const e = document.querySelector('.sbd-glyphs'); return e ? +getComputedStyle(e).opacity : null; });
    const det = await page.evaluate(() => {
      const g = window.__game; const r = {};
      g.setDebugInput({ steer: 0, handbrake: 0 }); g.teleport(400, 12); g.advance(0.05); const a0 = g.state.speed; g.advance(2); r.coast2s = [+a0.toFixed(2), +g.state.speed.toFixed(2)];
      g.setDebugInput({ steer: 0, handbrake: 1 }); g.teleport(400, 12); g.advance(0.05); const b0 = g.state.speed; g.advance(2); r.hb2s = [+b0.toFixed(2), +g.state.speed.toFixed(2)];
      r.hbDecel = +((b0 - g.state.speed) / 2).toFixed(2);
      g.setDebugInput({ steer: 0 }); g.teleport(100, 2); g.advance(0.05); const c0 = g.state.s; g.advance(10); r.coast10s = { ds: +(g.state.s - c0).toFixed(1), v: +g.state.speed.toFixed(2) };
      g.setDebugInput({ steer: 0, paddleL: 1, paddleR: 1 }); g.teleport(100, 2); g.advance(0.05); const p0 = g.state.s; g.advance(10); r.paddle10s = { ds: +(g.state.s - p0).toFixed(1), v: +g.state.speed.toFixed(2) };
      g.setDebugInput(null); return r; });
    log('physics', det);
    log('glyphOpacityAfterControls', glyph);
    log('zones', { headlightBefore: hl0, headlightAfterTap: hl1, reverseAfterGearDragDown: rev });
    await page.close();
  }

  // ---------- 4. screenshots ----------
  const fps = {};
  const measureFps = (page) => page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else res(+(n / 5).toFixed(1)); }; requestAnimationFrame(f); }));
  const shots = !PH.includes('shots') ? [] : [
    ['title', ''],
    ['cockpit-day-start', 'autostart=1&truck=0&ai=5'],
    ['cockpit-midtrack-speed', 'autostart=1&truck=3&ai=0&s=1500&v=14', 1.5],
    ['cockpit-dusk-headlight', 'autostart=1&truck=1&s=800&time=dusk&headlight=1&ai=2', 1],
    ['night', 'autostart=1&truck=2&s=1200&time=night&headlight=1&ai=2', 1],
    ['golden', 'autostart=1&truck=4&s=600&time=golden&ai=0', 1],
    ['hazard-puddle', 'scene=puddle&ai=0', 1.2],
    ['hazard-stream', 'scene=stream&ai=0', 1.2],
    ['hazard-mud', 'scene=mud&ai=0', 1.2],
    ['hazard-mud-after', 'scene=mud&ai=0', 3.8],
    ['hazard-rock', 'scene=rock&ai=0', 1.2],
    ['hazard-sand', 'scene=sand&ai=0', 1.2],
    ['hazard-gravel', 'scene=gravel&ai=0', 1.2],
    ['barn-chase', 'scene=barn&cam=chase&ai=0', 1],
    ['bridge-cockpit', 'scene=bridge&ai=0', 1],
    ['bridge-chase', 'scene=bridge&cam=chase&ai=0', 1],
    ['finish-arch', 'scene=finish&ai=0', 1],
    ['q-low', 'autostart=1&truck=0&ai=5&s=900&q=low', 1],
    ['q-medium', 'autostart=1&truck=0&ai=5&s=900&q=medium', 1],
    ['q-default', 'autostart=1&truck=0&ai=5&s=900&q=default', 1],
    ['barn-cockpit', 'scene=barn&ai=0', 1],
    ['garage', 'scene=garage'],
    ['lobby-host', 'menu=host'],
    ['lobby-join', 'menu=join'],
    ['chase-ai-race', 'autostart=1&cam=chase&ai=5&truck=5', 6],
    ['cockpit-lowq', 'autostart=1&truck=6&ai=0&s=900&q=low', 1],
  ];
  const ONLY = process.env.SHOTS ? process.env.SHOTS.split(',') : null;
  for (const [name, q, adv] of shots) {
    if (ONLY && !ONLY.includes(name)) continue;
    const c2 = await browser.newContext(ctxOpts);
    try {
      const page = await open(q, c2);
      if (adv) await page.evaluate((a) => { window.__game.setDebugInput({ steer: 0, paddleL: 1, paddleR: 1 }); const st = 1/60; for (let t = 0; t < a; t += 0.25) window.__game.advance(0.25); }, adv);
      await page.waitForTimeout(800);
      await shot(page, name);
      if (['q-low', 'q-medium', 'q-default', 'chase-ai-race'].includes(name)) fps[name] = await measureFps(page);
    } catch (e) { console.log('shot fail', name, e.message.slice(0, 200)); }
    finally { await c2.close().catch(() => {}); }
  }
  log('fps', fps);

  // truck lineup (garage cycles not scripted: chase cam on each truck)
  if (PH.includes('trucks')) for (let t = 0; t < 10; t++) {
    const page = await open(`autostart=1&truck=${t}&ai=0&cam=chase&s=150&q=medium`, ctx);
    await page.evaluate(() => window.__game.advance(0.5));
    await page.waitForTimeout(400);
    await shot(page, `truck-${t}-chase`);
    await page.close();
  }

  // ---------- 5. in-game AI race + finish ----------
  if (PH.includes('ai')) {
    const page = await open('autostart=1&truck=0&ai=5', ctx);
    const trace = await page.evaluate(() => {
      const g = window.__game; g.setDebugInput({ steer: 0, paddleL: 0, paddleR: 0 });
      const rows = [];
      const off = g.vehicles.map(() => 0), slow = g.vehicles.map(() => 0); let leader = -1, changes = 0;
      for (let t = 1; t <= 90; t++) { g.advance(1);
        g.vehicles.forEach((v, i) => { const st = v.body.state; const hw = g.world.track.sampleAt(Math.max(0, Math.min(3218, st.s))).width / 2; if (Math.abs(st.lateral) > hw) off[i]++; if (st.speed < 2 && st.s > 20) slow[i]++; });
        const ld = g.vehicles.slice(1).reduce((b, v, i) => (v.body.state.s > g.vehicles[b + 1].body.state.s ? i : b), 0); if (ld !== leader) { if (leader >= 0) changes++; leader = ld; }
        if (t % 10 === 0) rows.push({ t, s: g.vehicles.map((v) => Math.round(v.body.state.s)), lat: g.vehicles.map((v) => +v.body.state.lateral.toFixed(1)), spd: g.vehicles.map((v) => +v.body.state.speed.toFixed(1)) }); }
      rows.push({ offroadSec: off, slowSec: slow, aiLeadChanges: changes });
      return { rows, names: g.vehicles.map((v) => v.name || v.kind) };
    });
    log('aiRace', trace);
    await page.evaluate(() => window.__game.setDebugInput({ steer: 0, paddleL: 0, paddleR: 0 }));
    await shot(page, 'ai-race-60s');
    // finish: teleport player near end
    const fin = await page.evaluate(() => { const g = window.__game; g.setDebugInput({ steer: 0, paddleL: 1, paddleR: 1 }); g.teleport(3150, 14); for (let i = 0; i < 30 && !g.state.finished; i++) g.advance(1); return { finished: g.state.finished, place: g.state.place, finishTime: g.state.finishTime, mode: g.state.mode, s: g.state.s }; });
    await page.waitForTimeout(1500);
    log('finish', fin);
    await shot(page, 'finish');
    log('resultsCard', await page.evaluate(() => (document.querySelector('.sbd-screen.finish, .sbd-results, [class*=result]') || document.body).innerText.slice(0, 400)));
    await page.close();
  }
} finally {
  log('errors', errors.slice(0, 20));
  fs.writeFileSync(`critique/screens/round-3/results-${PH.join('_')}.json`, JSON.stringify(R, null, 2));
  await browser.close();
  try { process.kill(-server.pid); } catch {}
}
