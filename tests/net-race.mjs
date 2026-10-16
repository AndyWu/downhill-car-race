// Two-page multiplayer race test on the REAL game (real physics, real world), using the text-code
// fallback (offer/answer codes carried via page.evaluate). Runs twice:
//   1. clean link  2. lossy link: 15 % loss + 20-80 ms jitter shimmed into RTCDataChannel.send
//      for the unreliable 'fast' channel on BOTH pages.
// Reports interpolation error (client proxies vs host truth at the same host tick), prediction
// error (client-predicted own car vs host-simulated car for the same input seq), corrections,
// visual pop and bandwidth in both directions.
//   node tests/net-race.mjs   (builds + previews on its own unless BASE_URL is given)
//   NET_RACE_MODES=lossy node tests/net-race.mjs   (only the lossy run)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT = +(process.env.NET_RACE_PORT || 4300 + Math.floor(Math.random() * 500));
const base = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
const MODES = (process.env.NET_RACE_MODES || 'clean,lossy').split(',');
let server = null;
if (!process.env.BASE_URL) {
  await new Promise((r) => spawn('npx', ['vite', 'build'], { stdio: 'ignore' }).on('exit', r));
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
}
let fail = 0;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns'] });

const pct = (arr, p) => { if (!arr.length) return NaN; const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; };

async function runRace(mode) {
  const lines = [];
  const log = (...a) => lines.push(a.join(' '));
  const chk = (c, m) => { lines.push((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  const lossy = mode === 'lossy';
  const shim = lossy ? { loss: 0.15, jMin: 20, jMax: 80 } : null;
  log(`\n=== ${mode} link${shim ? ` (${shim.loss * 100}% loss, ${shim.jMin}-${shim.jMax} ms jitter on 'fast')` : ''} ===`);
  const errors = [];
  const ctxs = [];
  const mk = async (qs, tag) => {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 180 } });
    ctxs.push(ctx);
    await ctx.addInitScript((shim) => {
      window.__NET_DEBUG = true;
      if (shim) {
        const orig = RTCDataChannel.prototype.send;
        RTCDataChannel.prototype.send = function (d) {
          if (this.label !== 'fast') return orig.call(this, d);
          if (Math.random() < shim.loss) return;
          const copy = d && d.slice ? d.slice(0) : d;
          setTimeout(() => { if (this.readyState === 'open') { try { orig.call(this, copy); } catch { /* closed */ } } }, shim.jMin + Math.random() * (shim.jMax - shim.jMin));
        };
      }
    }, shim);
    const p = await ctx.newPage();
    p.on('console', (m) => { if (process.env.VERBOSE) log(tag, m.type(), m.text()); if (m.type() === 'error') errors.push(tag + ': ' + m.text()); });
    p.on('pageerror', (e) => errors.push(tag + ' pageerror: ' + e.message));
    await p.goto(base + '/' + qs);
    await p.waitForFunction(() => window.__game && window.__game.lobby, null, { timeout: 90000 });
    return p;
  };
  const host = await mk('?menu=host&q=low&norender=1', 'host');
  const client = await mk('?menu=join&q=low&norender=1', 'client');
  const offer = await host.waitForFunction(() => window.__game.lobby.state.offerCode, null, { timeout: 30000 }).then((h) => h.jsonValue());
  chk(!!offer, 'host produced an offer code (' + offer.length + ' chars)');
  client.evaluate((c) => { window.__game.lobby.submitCode(c); }, offer); // resolves only once connected, so don't await
  const answer = await client.waitForFunction(() => window.__game.lobby.state.answerCode, null, { timeout: 30000 }).then((h) => h.jsonValue());
  chk(!!answer, 'client produced an answer code');
  host.evaluate((c) => { window.__game.lobby.submitCode(c); }, answer);
  await client.waitForFunction(() => window.__game.lobby.state.phase === 'connected', null, { timeout: 30000 }).catch(async () => {
    log('host state', JSON.stringify(await host.evaluate(() => ({ ...window.__game.lobby.state, copy: undefined }))));
    log('client state', JSON.stringify(await client.evaluate(() => ({ ...window.__game.lobby.state, copy: undefined }))));
    log(errors); process.exit(1);
  });
  chk(true, 'client connected');
  await host.waitForFunction(() => window.__game.lobby.peers.size === 1, null, { timeout: 30000 });
  await host.evaluate(() => window.__game.lobby.startRace());
  await host.waitForFunction(() => window.__game.state.mode === 'race', null, { timeout: 30000 });
  await client.waitForFunction(() => window.__game.state.mode === 'race', null, { timeout: 30000 });
  chk(true, 'both pages in race mode');

  // ---- instrumentation (host: authoritative per-tick truth; client: what it renders/predicts) ----
  await host.evaluate(() => {
    const D = window.__netDebug; const sync = D.sync; const g = window.__game;
    window.hostLog = [];
    const orig = sync.broadcastSnapshot.bind(sync);
    sync.broadcastSnapshot = (snap) => {
      const cars = {};
      for (const v of g.vehicles) { const p = v.body.state.position; cars[v.slot] = [p.x, p.y, p.z, v.body.state.s]; }
      window.hostLog.push([snap[0], sync.consumedSeq(1), cars, performance.now(), g.state.countdown]);
      return orig(snap);
    };
  });
  await client.evaluate(() => {
    const D = window.__netDebug; const g = window.__game;
    window.clientLog = []; window.popLog = [];
    let prev = null;
    const rec = () => {
      const t = performance.now();
      const proxies = {};
      for (const v of g.vehicles) if (v.kind === 'proxy') { const p = v.body.state.position; proxies[v.slot] = [p.x, p.y, p.z]; }
      if (D.interp) window.clientLog.push([D.interp.renderTick, proxies]);
      const me = g.vehicles.find((v) => v.isPlayer);
      if (me && me.group) {
        const p = me.group.position, vel = me.body.state.velocity;
        if (prev) { const dt = (t - prev.t) / 1000; const jump = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z); window.popLog.push(Math.abs(jump - Math.hypot(vel.x, vel.y, vel.z) * dt)); }
        prev = { t, x: p.x, y: p.y, z: p.z };
      }
      requestAnimationFrame(rec);
    };
    requestAnimationFrame(rec);
  });
  const k0 = { c: await client.evaluate(() => window.__netDebug.sync.stats.strokesSent || 0), h: await host.evaluate(() => window.__netDebug.sync.stats.strokesApplied || 0) };
  const t0 = await client.evaluate(() => ({ tx: window.__netDebug.sync.stats.sentBytes, rx: window.__netDebug.sync.stats.recvBytes, t: performance.now() }));
  const h0 = await host.evaluate(() => ({ tx: window.__netDebug.sync.stats.sentBytes, t: performance.now() }));
  await client.evaluate(() => window.__game.setDebugInput({ paddleL: 1, paddleR: 1 }));
  await host.evaluate(() => window.__game.setDebugInput({ paddleL: 1, paddleR: 1 }));
  // phase A (distance metric): straight paddling from GO for 600 host ticks — deterministic inputs
  await host.waitForFunction(() => { const L = window.hostLog; const go = L.findIndex((e) => e[4] === 0); return go >= 0 && L[L.length - 1][0] >= L[go][0] + 600; }, null, { timeout: 60000, polling: 200 });
  // phase B (prediction metrics): weave the client's car so steering is exercised too
  const weave = client.evaluate(() => new Promise((done) => { let k = 0; const iv = setInterval(() => { k++; window.__game.setDebugInput({ paddleL: k % 8 < 4 ? 1 : 0, paddleR: k % 8 >= 4 ? 1 : 0, steer: 0.3 * Math.sin(k / 6) }); if (k > 60) { clearInterval(iv); done(); } }, 100); }));
  await weave;
  await host.waitForTimeout(1500); // let in-flight inputs land before counting
  const k1 = { c: await client.evaluate(() => window.__netDebug.sync.stats.strokesSent || 0), h: await host.evaluate(() => window.__netDebug.sync.stats.strokesApplied || 0) };
  log(`  paddle strokes during the run: client made ${k1.c - k0.c}, host applied ${k1.h - k0.h}`);
  chk(Math.abs((k1.c - k0.c) - (k1.h - k0.h)) <= 2, 'every client paddle stroke applied on the host (±2 in flight)');
  const t1 = await client.evaluate(() => ({ tx: window.__netDebug.sync.stats.sentBytes, rx: window.__netDebug.sync.stats.recvBytes, t: performance.now() }));
  const h1 = await host.evaluate(() => ({ tx: window.__netDebug.sync.stats.sentBytes, t: performance.now(), st: window.__netDebug.sync.stats, enc: window.__netDebug.sync.encoderStats }));
  const h = await host.evaluate(() => ({ cars: window.__game.vehicles.map((v) => [v.slot, v.kind, +v.body.state.s.toFixed(1)]), cd: window.__game.state.countdown, t: window.__game.state.raceTime }));
  const c = await client.evaluate(() => ({ cars: window.__game.vehicles.map((v) => [v.slot, v.kind, +v.body.state.s.toFixed(1)]), cd: window.__game.state.countdown, t: window.__game.state.raceTime, me: window.__game.state.s }));
  log('host', JSON.stringify(h)); log('client', JSON.stringify(c));
  chk(h.cars.length === 6 && c.cars.length === 6, 'six cars on both pages');
  const hostSlot1 = h.cars.find((x) => x[0] === 1)[2];
  chk(hostSlot1 > 5, 'host simulates the client car (remote input applied): s=' + hostSlot1);
  const cl0 = c.cars.find((x) => x[0] === 0)[2];
  chk(cl0 > 5, 'client sees the host car moving via snapshots: s=' + cl0);
  chk(c.me > 5, 'client own car advances: s=' + c.me);
  chk(Math.abs(c.me - hostSlot1) < 40, 'client/host agree on client car position');

  // ---- metrics ----
  const hostLog = await host.evaluate(() => window.hostLog);
  const { clientLog, popLog, predLog, pstats, visLog } = await client.evaluate(() => ({ clientLog: window.clientLog, popLog: window.popLog, predLog: window.__netDebug.pred?.debugLog || [], pstats: window.__netDebug.pred?.stats, visLog: window.__netDebug.pred?.visLog || [] }));
  const byTick = new Map(hostLog.map((e) => [e[0], e[2]]));
  const firstTick = hostLog[0]?.[0] ?? 0;
  const interpErr = [];
  for (const [rt, proxies] of clientLog) {
    if (!(rt > firstTick + 120)) continue; // skip warm-up (first 2 s of instrumented ticks)
    const a = byTick.get(Math.floor(rt)), b = byTick.get(Math.floor(rt) + 1);
    if (!a || !b) continue;
    const f = rt - Math.floor(rt);
    for (const [slot, p] of Object.entries(proxies)) {
      if (!a[slot] || !b[slot]) continue;
      const q = [0, 1, 2].map((k) => a[slot][k] + (b[slot][k] - a[slot][k]) * f);
      interpErr.push(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
    }
  }
  const hostAtSeq = new Map();
  for (const [, seq, cars] of hostLog) if (seq >= 0 && !hostAtSeq.has(seq) && cars[1]) hostAtSeq.set(seq, cars[1]);
  const predErr = [];
  const seqs = [...hostAtSeq.keys()].sort((x, y) => x - y);
  const skipBefore = seqs[Math.floor(seqs.length * 0.15)] ?? 0;
  for (const [seq, x, y, z] of predLog) {
    if (seq < skipBefore) continue;
    const hp = hostAtSeq.get(seq);
    if (hp) predErr.push(Math.hypot(x - hp[0], y - hp[1], z - hp[2]));
  }
  const hl = hostLog.length ? (hostLog[hostLog.length - 1][0] - hostLog[0][0]) / ((hostLog[hostLog.length - 1][3] - hostLog[0][3]) / 1000) : 0;
  const crate = await client.evaluate(() => window.__netDebug.interp?.hostTickRate);
  log(`  host simulation rate ${hl.toFixed(1)} ticks/s (client estimate ${crate?.toFixed(1)})`);
  if (process.env.NET_DEBUG) {
    const worst = []; for (const [seq, x, y, z] of predLog) { const hp = hostAtSeq.get(seq); if (hp) worst.push([Math.hypot(x - hp[0], y - hp[1], z - hp[2]), seq]); }
    worst.sort((a, b) => b[0] - a[0]); log('  worst pred seqs', JSON.stringify(worst.slice(0, 8).map((w) => [+w[0].toFixed(2), w[1]])), 'seq range', predLog[0]?.[0], predLog.at(-1)?.[0], 'skipBefore', skipBefore);
  }
  // client car distance over a fixed number of host ticks (wall-clock independent)
  const TICKS = 600;
  const startE = hostLog.find((e) => e[4] === 0), endE = hostLog.find((e) => e[0] >= startE[0] + TICKS) || hostLog[hostLog.length - 1];
  const dist = endE[2][1][3] - startE[2][1][3];
  const vis = visLog.slice(Math.floor(visLog.length * 0.1));
  log(`  client car distance over the first ${endE[0] - startE[0]} host ticks after GO (straight paddling): ${dist.toFixed(1)} m (host-simulated)`);
  log(`  predictor visual correction per 60 Hz step: p95 ${(pct(vis, 0.95) * 100).toFixed(2)} cm, max ${(Math.max(...vis) * 100).toFixed(2)} cm (${vis.length} steps, snaps ${pstats?.snaps})`);
  chk(vis.length > 100 && Math.max(...vis) <= 0.05, `own-car visual correction ≤ 5 cm per step (max ${(Math.max(...vis) * 100).toFixed(2)} cm)`);
  const pops = popLog.slice(Math.floor(popLog.length * 0.15));
  const cSec = (t1.t - t0.t) / 1000, hSec = (h1.t - h0.t) / 1000;
  const clientTx = (t1.tx - t0.tx) / cSec, clientRx = (t1.rx - t0.rx) / cSec, hostTx = (h1.tx - h0.tx) / hSec;
  log(`  bandwidth: client upload ${clientTx.toFixed(0)} B/s, client download ${clientRx.toFixed(0)} B/s (host tx ${hostTx.toFixed(0)} B/s to 1 client); snapshot records full/compact/unchanged ${h1.enc.full}/${h1.enc.compact}/${h1.enc.unchanged}`);
  log(`  host jitter buffer: repeated ${h1.st.inputsRepeated || 0}, merged ${h1.st.inputsMerged || 0}, lost ${h1.st.inputsLost || 0}, strokes recovered ${h1.st.strokesRecovered || 0}`);
  log(`  interpolation (client proxies vs host truth at the same tick, ${interpErr.length} samples): p50 ${(pct(interpErr, 0.5) * 100).toFixed(1)} cm, p95 ${(pct(interpErr, 0.95) * 100).toFixed(1)} cm, max ${(Math.max(...interpErr) * 100).toFixed(1)} cm`);
  log(`  prediction (client-predicted own car vs host car for the same input seq, ${predErr.length} samples): p50 ${(pct(predErr, 0.5) * 100).toFixed(1)} cm, p95 ${(pct(predErr, 0.95) * 100).toFixed(1)} cm, max ${(Math.max(...predErr) * 100).toFixed(1)} cm`);
  log(`  predictor: ${pstats?.reconciles} reconciles, ${pstats?.corrections} corrections >1 cm, ${pstats?.skipped} inside deadband, largest pending correction ${((pstats?.maxError || 0) * 100).toFixed(1)} cm; visual pop p95 ${(pct(pops, 0.95) * 100).toFixed(2)} cm, max ${(Math.max(...pops) * 100).toFixed(2)} cm per frame (${pops.length} frames)`);
  chk(clientTx <= 1536, `client upload ≤ 1.5 KiB/s (${clientTx.toFixed(0)} B/s)`);
  chk(interpErr.length > 100 && pct(interpErr, 0.95) < 0.5, `interpolated remote cars within 0.5 m of host truth (p95 ${(pct(interpErr, 0.95) * 100).toFixed(1)} cm)`);
  chk(predErr.length > 100 && pct(predErr, 0.95) < 0.5, `predicted own car within 0.5 m of host simulation for the same input (p95 ${(pct(predErr, 0.95) * 100).toFixed(1)} cm)`);
  chk(errors.length === 0, 'no console errors ' + JSON.stringify(errors.slice(0, 3)));
  for (const ctx of ctxs) await ctx.close();
  return { dist, lines };
}

const results = {};
try {
  // run both links at the same time so they share the same machine load (the distance metric
  // depends on how fast each page can simulate)
  const runs = await Promise.all(MODES.map((m) => runRace(m)));
  MODES.forEach((m, i) => { results[m] = runs[i]; console.log(runs[i].lines.join('\n')); });
  if (results.clean && results.lossy) {
    const r = results.lossy.dist / results.clean.dist;
    console.log(`\nclient car distance: lossy ${results.lossy.dist.toFixed(1)} m vs clean ${results.clean.dist.toFixed(1)} m (${(r * 100).toFixed(1)}%)`);
    check(Math.abs(r - 1) <= 0.1, `under 15% loss + jitter the client covers within 10% of the no-loss distance (${(r * 100).toFixed(1)}%)`);
  }
}
catch (e) { console.error(e); fail++; }
finally { await browser.close().catch(() => {}); if (server) { try { process.kill(-server.pid); } catch { /* already gone */ } } }
console.log(fail ? `\n${fail} FAILED` : '\nall net-race checks passed');
process.exit(fail ? 1 : 0);
