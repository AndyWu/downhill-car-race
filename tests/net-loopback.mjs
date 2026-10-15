// Playwright loopback test for src/net — no camera: offer/answer code strings are carried
// between pages with page.evaluate (exactly what the QR codes carry on real iPads).
//   node tests/net-loopback.mjs            (starts its own Vite dev server)
//   NET_HARNESS_URL=http://localhost:5173/tests/net-harness.html node tests/net-loopback.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.NET_PORT || 5287);
let server = null;
let browser = null;
let url = process.env.NET_HARNESS_URL;
let failed = 0;
const check = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failed++; };

async function startVite() {
  // Programmatic Vite with deps pre-declared so it never re-optimises + full-reloads mid-test.
  const { createServer } = await import('vite');
  server = await createServer({
    root: ROOT, configFile: false, logLevel: 'warn',
    server: { port: PORT, strictPort: false, host: '127.0.0.1', hmr: false, watch: null },
    optimizeDeps: { entries: ['tests/net-harness.html'], include: ['lz-string', 'qrcode-generator', 'jsqr'] },
  });
  await server.listen();
  const port = server.httpServer.address().port;
  return `http://127.0.0.1:${port}/tests/net-harness.html`;
}

async function main() {
  url ??= await startVite();
  const mdnsOff = process.env.NET_NO_MDNS === '1';
  browser = await chromium.launch({ args: mdnsOff ? ['--disable-features=WebRtcHideLocalIpsWithMdns'] : [] });
  const open = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 700 } });
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error') console.log(`  [${name} console] ${m.text()}`); });
    p.on('framenavigated', (f) => { if (f === p.mainFrame()) console.log(`  [${name}] navigated ${f.url()}`); });
    p.on('pageerror', (e) => console.log(`  [${name} pageerror] ${e.message}`));
    await p.goto(url);
    await p.waitForFunction(() => window.netReady === true);
    return p;
  };
  const host = await open('host');
  const client = await open('client');

  // ---------------- 1. raw signaling ----------------
  console.log('1) Serverless signaling (codes passed via page.evaluate)');
  const t0 = Date.now();
  const offer = await host.evaluate(async () => { const r = await net.hostCreateOffer(1, 4242); window.hp = r.peer; return r.code; });
  const answer = await client.evaluate(async (code) => { const r = await net.clientAcceptOffer(code); window.cp = r.peer; window.mySlot = r.slot; return r.code; }, offer);
  const offerInfo = await host.evaluate((c) => { const u = net.unpackSdp(c); return { bytes: u.bytes, packed: u.packed, cands: u.candidates }; }, offer);
  const answerInfo = await host.evaluate((c) => { const u = net.unpackSdp(c); return { bytes: u.bytes, packed: u.packed, cands: u.candidates }; }, answer);
  console.log(`     offer : ${offerInfo.bytes} B ${offerInfo.packed} → ${offer.length} chars  candidates=${JSON.stringify(offerInfo.cands)}`);
  console.log(`     answer: ${answerInfo.bytes} B ${answerInfo.packed} → ${answer.length} chars  candidates=${JSON.stringify(answerInfo.cands)}`);
  check(offer.length < 250 && answer.length < 250, `encoded payloads < 250 chars (${offer.length}, ${answer.length})`);
  await host.evaluate(async (code) => { await net.hostAcceptAnswer(window.hp, code, 4242); }, answer);
  const opened = await Promise.all([
    host.evaluate(() => Promise.race([window.hp.opened.then(() => 'open'), new Promise((r) => setTimeout(() => r('timeout'), 15000))])),
    client.evaluate(() => Promise.race([window.cp.opened.then(() => 'open'), new Promise((r) => setTimeout(() => r('timeout'), 15000))])),
  ]);
  check(opened.every((s) => s === 'open'), `DataChannels open on both sides (${opened.join('/')}) in ${Date.now() - t0} ms`);
  const chans = await client.evaluate(() => ({ fast: [cp.fast.ordered, cp.fast.maxRetransmits, cp.fast.readyState], ctrl: [cp.ctrl.ordered, cp.ctrl.readyState], slot: window.mySlot }));
  check(chans.fast[0] === false && chans.fast[1] === 0 && chans.ctrl[0] === true, `fast channel unordered/maxRetransmits 0, ctrl reliable ordered; client slot=${chans.slot}`);
  if (opened.some((s) => s !== 'open')) throw new Error('no connection');

  // ---------------- 2. 60 Hz sync ----------------
  console.log('2) 60 Hz inputs + 30 Hz snapshots, no world → FULL records (host steps at 60 Hz for 3 s)');
  await host.evaluate(() => {
    window.hs = net.createSync({ role: 'host', peers: [hp] });
    window.rx = { inputs: 0, lastSeq: -1, gaps: 0, ctrl: [] };
    hs.onInput((id, f) => { rx.inputs++; if (rx.lastSeq >= 0 && f[0] !== rx.lastSeq + 1) rx.gaps++; rx.lastSeq = f[0]; });
    hs.onControl((id, m) => rx.ctrl.push(m));
  });
  await client.evaluate(() => {
    window.cs = net.createSync({ role: 'client', peers: [cp] });
    window.ip = net.createInterpolator({ delayMs: 100 });
    window.rx = { snaps: 0, ctrl: [], sampled: 0, lastPos: null };
    cs.onSnapshot((data) => { rx.snaps++; ip.push(data); });
    cs.onControl((id, m) => rx.ctrl.push(m));
  });
  const run = (page, role) => page.evaluate((role) => new Promise((done) => {
    const N = 180, dt = 1000 / 60, start = performance.now();
    let sent = 0;
    const snap = new Float32Array(net.SNAP_HEADER + 6 * net.SNAP_STRIDE);
    const frame = new Float32Array(net.INPUT_STRIDE);
    const iv = setInterval(() => {
      const due = Math.min(N, Math.floor((performance.now() - start) / dt) + 1);
      while (sent < due) {
        if (role === 'host') {
          snap[0] = sent; snap[1] = 6;
          for (let i = 0; i < 6; i++) { const b = net.SNAP_HEADER + i * net.SNAP_STRIDE; snap.set([i, i * 3, 100 - sent * 0.2 - i * 40, -sent * 0.5 - i * 300, 0, Math.sin(sent / 50), 0, Math.cos(sent / 50), 0, -12, -30, sent * 0.5 + i * 300, 0, 0], b); }
          const by = hs.broadcastSnapshot(snap); if (by) { window.snapBytes = by; window.snapTotal = (window.snapTotal || 0) + by; }
        } else {
          net.encodeInputFrame({ steer: Math.sin(sent / 10), paddleL: sent % 20 === 0 ? 1 : 0, headlight: true }, sent, frame);
          cs.sendInput(frame);
          if (window.ip) { const m = ip.sample(); if (m.size) { rx.sampled++; rx.lastPos = m.get(0)?.position.slice(); } }
        }
        sent++;
      }
      if (sent >= N) { clearInterval(iv); done({ sent, ms: performance.now() - start }); }
    }, 4);
  }), role);
  const [hRes, cRes] = await Promise.all([run(host, 'host'), run(client, 'client')]);
  await host.waitForTimeout(300);
  await host.evaluate(() => hs.sendControl({ t: 'seed', seed: 99 }));
  await client.evaluate(() => cs.sendControl({ t: 'truck', id: 4 }));
  await host.waitForTimeout(300);
  const hRx = await host.evaluate(() => ({ ...rx, stats: hs.stats, snapBytes: window.snapBytes }));
  const cRx = await client.evaluate(() => ({ ...rx, stats: cs.stats, rtt: cs.clock.rtt, synced: cs.clock.synced, offset: cs.clock.offset }));
  const snapTotal = await host.evaluate(() => window.snapTotal);
  console.log(`     host stepped ${hRes.sent} ticks, sent ${hRx.stats.snapshotsTx} snapshots (last ${hRx.snapBytes} B, ${(snapTotal / (hRes.ms / 1000) / 1024).toFixed(2)} KiB/s per client) in ${hRes.ms.toFixed(0)} ms; client sent ${cRes.sent} inputs`);
  console.log(`     host received ${hRx.inputs} input frames (seq gaps ${hRx.gaps}); client received ${cRx.snaps} snapshots; interpolator samples ${cRx.sampled}, last pos ${JSON.stringify(cRx.lastPos?.map((v) => +v.toFixed(2)))}`);
  console.log(`     clock: synced=${cRx.synced} rtt=${cRx.rtt.toFixed(2)} ms; bytes host tx=${hRx.stats.sentBytes} client tx=${cRx.stats.sentBytes}`);
  check(hRx.inputs >= 175, `≥175/180 input frames delivered at 60 Hz (${hRx.inputs})`);
  check(hRx.stats.snapshotsTx === 90 && cRx.snaps >= 85, `30 Hz snapshots: ${hRx.stats.snapshotsTx} sent, ${cRx.snaps} delivered`);
  check(snapTotal / (hRes.ms / 1000) * 5 < 25 * 1024, `6-car snapshot stream × 5 clients < 25 KiB/s (${(snapTotal / (hRes.ms / 1000) * 5 / 1024).toFixed(1)} KiB/s)`);
  check(cRx.sampled > 100, 'interpolator produced samples');
  check(cRx.synced && cRx.rtt < 50, 'clock ping/pong synced');
  check(cRx.ctrl.some((m) => m.t === 'seed' && m.seed === 99) && hRx.ctrl.some((m) => m.t === 'truck'), 'reliable control channel both ways');

  // ---------------- 2b. Lossy, jittery link: interpolation + prediction smoothness ----------------
  for (const [loss, jMin, jMax] of [[0.05, 20, 80], [0.15, 20, 80]]) {
    console.log(`2b) ${Math.round(loss * 100)}% loss, ${jMin}-${jMax} ms jitter on the fast channel (8 s, v3 track-relative snapshots, prediction on)`);
    const shim = (page) => page.evaluate(([loss, jMin, jMax]) => {
      const peer = window.hp || window.cp;
      const ch = peer.fast;
      ch.__send ??= ch.send.bind(ch);
      ch.send = (d) => { if (Math.random() < loss) return; const copy = d.slice ? d.slice(0) : d; setTimeout(() => { if (ch.readyState === 'open') ch.__send(copy); }, jMin + Math.random() * (jMax - jMin)); };
      window.world = fw.createFakeWorld();
    }, [loss, jMin, jMax]);
    await shim(host); await shim(client);
    await host.evaluate(() => {
      window.hs?.close();
      window.hs = net.createSync({ role: 'host', peers: [hp], world });
      window.hbody = fw.createToyBody(world, 60);
    });
    await client.evaluate(() => {
      window.cs?.close();
      window.cs = net.createSync({ role: 'client', peers: [cp], world });
      window.ip = net.createInterpolator({ delayMs: 100 });
      window.cbody = fw.createToyBody(world, 60);
      window.pred = net.createPredictor({ body: cbody, slot: 1 });
      window.m2 = { interpMax: 0, interpSum: 0, interpN: 0, pop: 0, ackLat: [], sentAt: new Map(), lastSeq: -1, snaps: 0 };
      cs.onSnapshot((data) => {
        m2.snaps++; ip.push(data); pred.onSnapshot(data);
        for (let i = 0; i < data[1]; i++) {
          const b = net.SNAP_HEADER + i * net.SNAP_STRIDE;
          if (data[b] !== 1 || data[b + 13] < 0) continue;
          let seq = m2.lastSeq; while (seq >= 0 && (seq & 255) !== data[b + 13]) seq--;
          if (seq >= 0 && m2.sentAt.has(seq)) { m2.ackLat.push(performance.now() - m2.sentAt.get(seq)); m2.sentAt.delete(seq); }
        }
      });
    });
    const run2 = (page, role) => page.evaluate((role) => new Promise((done) => {
      const N = 480, dt = 1 / 60, start = performance.now();
      let k = 0, prev = null;
      const snap = new Float32Array(net.SNAP_HEADER + 6 * net.SNAP_STRIDE);
      const fr = new Float32Array(20);
      const iv = setInterval(() => {
        const due = Math.min(N, Math.floor((performance.now() - start) / (dt * 1000)) + 1);
        while (k < due) {
          if (role === 'host') {
            const r = hs.takeInput(1);
            if (r) hbody.step(dt, net.decodeInputFrame(r.frame));
            snap[0] = k; snap[1] = 6;
            for (let id = 0; id < 6; id++) {
              const b = net.SNAP_HEADER + id * net.SNAP_STRIDE;
              if (id === 1) { hbody.serialize(fr); snap.set([1, fr[0], fr[1], fr[2], fr[3], fr[4], fr[5], fr[6], fr[7], fr[8], fr[9], fr[13], 0, -1, 1], b); }
              else snap.set([...fw.carAt(world, id, k * dt), -1, 1], b);
            }
            hs.broadcastSnapshot(snap);
          } else {
            const inp = { steer: fw.followTrack(world, cbody, 0.35 * Math.sin(k / 37)), paddleL: k % 30 === 0 ? 1 : 0 };
            m2.sentAt.set(k, performance.now()); m2.lastSeq = k;
            cs.sendInput(net.encodeInputFrame(inp, k));
            pred.step(dt, inp, k);
            const rp = pred.renderPose();
            if (prev && k > 90) {
              const v = cbody.state.velocity;
              const jump = Math.hypot(rp.position[0] - prev[0], rp.position[1] - prev[1], rp.position[2] - prev[2]);
              m2.pop = Math.max(m2.pop, Math.abs(jump - Math.hypot(v.x, v.y, v.z) * dt));
            }
            prev = rp.position.slice();
            if (k === 90) { pred.stats.maxError = 0; pred.stats.corrections = 0; pred.stats.skipped = 0; pred.stats.reconciles = 0; } // ignore the join warm-up
            const m = ip.sample(performance.now());
            if (k > 90 && m.size) {
              const rt = ip.renderTick * dt;
              for (const [id, c] of m) {
                if (id === 1) continue;
                const truth = fw.carAt(world, id, rt);
                const e = Math.hypot(c.position[0] - truth[1], c.position[1] - truth[2], c.position[2] - truth[3]);
                m2.interpMax = Math.max(m2.interpMax, e); m2.interpSum += e; m2.interpN++;
              }
            }
          }
          k++;
        }
        if (k >= N) { clearInterval(iv); done(k); }
      }, 4);
    }), role);
    await Promise.all([run2(host, 'host'), run2(client, 'client')]);
    await host.waitForTimeout(200);
    const H2 = await host.evaluate(() => ({ st: hs.stats, enc: hs.encoderStats }));
    const C2 = await client.evaluate(() => ({ ...m2, tx: cs.stats.sentBytes, sentAt: 0, ack: m2.ackLat.slice().sort((a, b) => a - b), pred: pred.stats, delay: ip.delayMs, jit: ip.jitterMs, ext: ip.stats.extrapolated, samples: ip.stats.samples }));
    const p95 = C2.ack[Math.floor(C2.ack.length * 0.95)] ?? Infinity;
    const avgSnap = H2.st.snapshotBytesTotal / H2.st.snapshotsTx;
    console.log(`     host: ${H2.st.snapshotsTx} snapshots avg ${avgSnap.toFixed(1)} B (${(avgSnap * 30 / 1024).toFixed(2)} KiB/s per client, ${(avgSnap * 30 * 5 / 1024).toFixed(2)} KiB/s ×5); records full/compact ${H2.enc.full}/${H2.enc.compact}; inputs repeated ${H2.st.inputsRepeated || 0}, merged ${H2.st.inputsMerged || 0} (latency trims ${H2.st.inputsTrimmed || 0})`);
    console.log(`     client: ${C2.snaps} snapshots received; interp delay adapted to ${C2.delay.toFixed(0)} ms (jitter ${C2.jit.toFixed(0)} ms), extrapolated ${C2.ext}/${C2.samples * 5} samples`);
    console.log(`     interpolation error vs ground truth: max ${(C2.interpMax * 100).toFixed(1)} cm, mean ${(C2.interpSum / C2.interpN * 100).toFixed(1)} cm`);
    console.log(`     prediction: ${C2.pred.reconciles} reconciles, ${C2.pred.corrections} corrections >1 cm, ${C2.pred.skipped} inside deadband, max correction ${(C2.pred.maxError * 100).toFixed(1)} cm, max visual pop ${(C2.pop * 100).toFixed(2)} cm/frame; ack latency p50 ${C2.ack[C2.ack.length >> 1]?.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms`);
    console.log(`     client upload: ${(C2.tx / 8 / 1024).toFixed(2)} KiB/s (inputs 30 Hz × 20 B + pings)`);
    check(C2.tx / 8 <= 1536, `client tx ≤ 1.5 KiB/s (${(C2.tx / 8).toFixed(0)} B/s)`);
    check(C2.interpMax < 0.5, `interpolated remote cars stay within 0.5 m of truth (max ${(C2.interpMax * 100).toFixed(1)} cm)`);
    // Floor: 20-80 ms each way (sum p95 ≈ 145 ms) + up to 33 ms snapshot phase + lost acks.
    const p50 = C2.ack[C2.ack.length >> 1];
    check(p50 < 200 && p95 < 250, `own inputs reconciled: p50 ${p50.toFixed(0)} ms < 200, p95 ${p95.toFixed(0)} ms < 250 (link alone ≈ 145 ms p95)`);
    // a correction is one host input repeat (~speed·dt ≈ 20-30 cm); smoothing spreads it so the
    // rendered car never pops more than a few cm in a frame.
    check(C2.pop < 0.1, `prediction smooth: max visual pop ${(C2.pop * 100).toFixed(2)} cm/frame (< 10); largest pending correction ${(C2.pred.maxError * 100).toFixed(1)} cm glides out at ≤ 2.5 m/s`);
    check(avgSnap * 30 * 5 < 25 * 1024, `bandwidth ${(avgSnap * 30 * 5 / 1024).toFixed(2)} KiB/s for 5 clients`);
    await host.evaluate(() => { hp.fast.send = hp.fast.__send; });
    await client.evaluate(() => { cp.fast.send = cp.fast.__send; });
  }

  // ---------------- 3. Lobby state machine + QR render/decode ----------------
  console.log('3) Lobby state machine (host + 2 clients, fallback modal, manual codes, QR decode)');
  const client2 = await open('client2');
  await host.evaluate(() => {
    window.gumCalls = 0;
    if (navigator.mediaDevices) { const orig = navigator.mediaDevices.getUserMedia?.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = (c) => { window.gumCalls++; return orig ? orig(c) : Promise.reject(new Error('none')); }; }
    window.lobby = net.createLobby({ role: 'host', name: 'Dad' }); // camera enabled: must stay off until asked
    window.peerLog = []; lobby.onPeer((p) => { window.peerLog.push('open ' + p.id); p.on('state', (st) => window.peerLog.push(p.id + ':' + st + ':' + p.pc.connectionState)); });
    window.lobbyReady = null;
    lobby.onReady((info) => { window.lobbyReady = { n: info.peers.length, players: info.players }; });
    lobby.start();
  });
  const pre = await host.waitForFunction(() => lobby.state.offerCode && lobby.state, null, { timeout: 15000 }).then((h) => h.jsonValue());
  check(pre.phase === 'radio' && pre.steps.every((x) => x.state !== 'done'), `host starts on the hotspot step with nothing pre-ticked (${pre.steps.map((x) => x.state[0]).join('')})`);
  await host.evaluate(() => lobby.confirmRadio());
  const post = await host.evaluate(() => ({ steps: lobby.state.steps.map((x) => x.state), gum: window.gumCalls, notice: lobby.state.notice, scanning: lobby.state.scanning }));
  check(post.steps[0] === 'done' && post.steps[1] === 'active' && post.gum === 0 && !post.notice, `after "My hotspot is on": step 1 ticked, offer step active, camera NOT opened (getUserMedia calls: ${post.gum})`);
  const pasteLink = await host.evaluate(() => [...document.querySelectorAll('.sbd-net-actions button')].map((b) => b.textContent));
  check(pasteLink.some((t) => /Can’t use the camera\? Tap to paste/.test(t)) && pasteLink.some((t) => /Scan Player 2’s reply/.test(t)), `host actions: ${pasteLink.join(' | ')}`);
  await host.evaluate(() => lobby.scanAnswer());
  const scan = await host.waitForFunction(() => window.gumCalls > 0 && (lobby.state.cameraOn || lobby.state.notice) && lobby.state, null, { timeout: 10000 }).then((h) => h.jsonValue());
  console.log('     steps while scanning:', scan.steps.map((x) => x.state).join(','));
  check(scan.scanning && scan.steps.some((x) => x.state === 'active' && /reply/.test(x.text)) && (scan.cameraOn || /isn’t available here, and that’s OK/.test(scan.notice)), `"Scan reply" opens the camera only now (cameraOn=${scan.cameraOn}, soft notice: "${scan.notice || ''}")`);
  await host.evaluate(() => lobby.stopScan());
  for (const [i, cp2] of [[1, client], [2, client2]]) {
    let offerCode = await host.waitForFunction((slot) => lobby.state.phase === 'offering' && lobby.state.slot === slot && lobby.state.offerCode, i, { timeout: 15000 }).then((h) => h.jsonValue());
    // decode the on-screen QR canvas with jsQR to prove the rendered code round-trips
    const decoded = await host.evaluate(async () => {
      const c = document.querySelector('.sbd-lobby canvas.qr');
      const img = c.getContext('2d').getImageData(0, 0, c.width, c.height);
      return { text: jsQR(img.data, c.width, c.height)?.data, modules: +c.dataset.modules, px: c.width };
    });
    check(decoded.text === offerCode, `slot ${i}: offer QR (${decoded.modules}×${decoded.modules} modules, ${decoded.px}px) decodes back to the code`);
    await cp2.evaluate((name) => {
      window.lobby = net.createLobby({ role: 'client', camera: false, name, slowMs: 1500 });
      window.lobbyReady = null;
      lobby.onReady((info) => { window.lobbyReady = { slot: info.localSlot }; });
      lobby.start(); lobby.confirmRadio();
    }, 'Kid' + i);
    if (i === 1) {
      // client whose reply is never scanned: becomes "slow", Try again regenerates a fresh reply
      await cp2.evaluate((c) => { lobby.submitCode(c); }, offerCode);
      const first = await cp2.waitForFunction(() => lobby.state.phase === 'showAnswer' && lobby.state.answerCode, null, { timeout: 15000 }).then((h) => h.jsonValue());
      await cp2.waitForFunction(() => lobby.state.slow, null, { timeout: 5000 });
      const btns = await cp2.evaluate(() => [...document.querySelectorAll('.sbd-net-actions button')].map((b) => b.textContent));
      await cp2.evaluate(() => lobby.retry());
      const ph = await cp2.evaluate(() => lobby.state.phase);
      check(btns.includes('Try again') && ph === 'scanOffer', `unscanned client offers "Try again" after timeout → back to ${ph}`);
      check(!!first, 'first reply code was generated');
      // that reply is now useless; the host mints a fresh single-use code for the same seat
      await host.evaluate(() => lobby.refreshOffer());
      offerCode = await host.waitForFunction((old) => lobby.state.offerCode && lobby.state.offerCode !== old && lobby.state.offerCode, offerCode, { timeout: 15000 }).then((h) => h.jsonValue());
      const stale = await host.evaluate(async (a) => { await lobby.submitCode(a); return lobby.state.notice; }, first);
      check(/older code/.test(stale || ''), `host rejects the stale reply politely: "${stale}"`);
    }
    await cp2.evaluate((c) => { lobby.submitCode(c); }, offerCode); // resolves only once connected
    const ans = await cp2.waitForFunction(() => lobby.state.phase === 'showAnswer' && lobby.state.answerCode, null, { timeout: 15000 }).then((h) => h.jsonValue());
    await host.evaluate((c) => lobby.submitCode(c), ans);
    const r = await cp2.waitForFunction(() => window.lobbyReady, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(async (e) => {
      console.log('host', JSON.stringify(await host.evaluate(() => ({ ...lobby.state, copy: 0, steps: 0 }))));
      console.log('client', JSON.stringify(await cp2.evaluate(() => ({ ...lobby.state, copy: 0, steps: 0 }))));
      throw e;
    });
    check(r.slot === i, `client ${i} connected in slot ${r.slot}`);
  }
  await host.waitForFunction(() => lobby.peers.size === 2 && lobby.state.peers.filter((p) => p.name.startsWith('Kid')).length === 2, null, { timeout: 10000 });
  if (process.env.NET_SHOT) await host.screenshot({ path: process.env.NET_SHOT }).catch(() => {});
  await host.evaluate(() => lobby.startRace());
  const ready = await host.evaluate(() => window.lobbyReady);
  if (!ready || ready.n !== 2) console.log('     host lobby state', JSON.stringify(await host.evaluate(() => ({ peers: lobby.state.peers, notice: lobby.state.notice, log: window.peerLog }))));
  check(ready && ready.n === 2 && ready.players.length === 3, `host onReady with ${ready?.n} peers: ${ready?.players.map((p) => p.name).join(', ')}`);

  // ---------------- 4. Agent 4 UI slot adapter ----------------
  console.log('4) Lobby driving the UI slot API (mock ui object)');
  const calls = await client2.evaluate(async () => {
    const calls = [];
    const ui = {};
    for (const m of ['setLobbyRole', 'setLobbySteps', 'showQR', 'showScanner', 'clearQR', 'setCaption', 'setLobbyStatus', 'setPlayers', 'setStartEnabled']) ui[m] = (...a) => calls.push([m, a[0] instanceof HTMLCanvasElement ? 'canvas' : a[0]]);
    const l = net.createLobby({ role: 'host', ui, camera: false, name: 'Mum' });
    l.start();
    await new Promise((r) => { const iv = setInterval(() => { if (l.state.offerCode) { clearInterval(iv); r(); } }, 50); });
    l.confirmRadio();
    l.close({ keepPeers: false });
    return calls;
  });
  const names = new Set(calls.map((c) => c[0]));
  check(names.has('setLobbyRole') && calls.some((c) => c[0] === 'showQR' && c[1] === 'canvas') && names.has('setPlayers') && names.has('setLobbySteps') , `adapter called ${[...names].join(', ')}`);

  await browser.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nall loopback checks passed');
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close().catch(() => {}); await server?.close(); });
