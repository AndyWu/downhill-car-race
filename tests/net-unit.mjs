// Node unit checks for src/net: SDP pack/unpack round-trip, wire protocol, interpolator, licensing.
//   node tests/net-unit.mjs
import assert from 'node:assert/strict';
import { packSdp, unpackSdp, parseSdp } from '../src/net/sdpPack.js';
import { encodeInputFrame, decodeInputFrame, packInputPacket, unpackInputPacket, packSnapshot, unpackSnapshot, createSnapshotEncoder, createSnapshotDecoder, packQuat, unpackQuat, SNAP_HEADER, SNAP_STRIDE } from '../src/net/protocol.js';
import { createPredictor } from '../src/net/predictor.js';
import { createSync, normalizeConditions } from '../src/net/sync.js';
import { strokeCount, SNAP_EVENTS } from '../src/net/protocol.js';
import { createFakeWorld, carAt } from './net-fake-world.js';
import { createInterpolator } from '../src/net/interpolator.js';
import { createLicensing, MAX_SEATS } from '../src/net/licensing.js';

let pass = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { console.error('  FAIL', name, '\n', e); process.exitCode = 1; } };

const FP = 'sha-256 ' + Array.from({ length: 32 }, (_, i) => ((i * 37 + 11) & 255).toString(16).toUpperCase().padStart(2, '0')).join(':');
const chromeOffer = (cands) => [
  'v=0', 'o=- 4611731400430051336 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=extmap-allow-mixed', 'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0', ...cands,
  'a=ice-ufrag:Xq3+', 'a=ice-pwd:aB9/cdEFghIJklMNopQRstUV', 'a=ice-options:trickle', `a=fingerprint:${FP}`, 'a=setup:actpass', 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144', '',
].join('\r\n');

console.log('SDP pack/unpack');
const cases = {
  'chrome mDNS': ['a=candidate:3115152306 1 udp 2113937151 4f1c2b7a-93de-4d4b-8c39-0a1b2c3d4e5f.local 54321 typ host generation 0 network-cost 999'],
  'safari mDNS (upper)': ['a=candidate:1 1 udp 2113937151 4F1C2B7A-93DE-4D4B-8C39-0A1B2C3D4E5F.local 60000 typ host generation 0'],
  'hotspot IPv4 + mDNS + v6 + tcp': [
    'a=candidate:1 1 udp 2122260223 172.20.10.2 51234 typ host generation 0 network-id 1',
    'a=candidate:2 1 tcp 1518280447 172.20.10.2 9 typ host tcptype active generation 0',
    'a=candidate:3 1 udp 2122194687 fe80::1c2b:3aff:fe00:42 51235 typ host generation 0',
    'a=candidate:4 1 udp 2113937151 0a1b2c3d-0000-4000-8000-123456789abc.local 51236 typ host generation 0',
  ],
  'no candidates': [],
};
for (const [name, cands] of Object.entries(cases)) {
  await t(name, () => {
    const sdp = chromeOffer(cands);
    const code = packSdp(sdp, { kind: 'offer', slot: 3, tag: 0xbeef });
    const u = unpackSdp(code);
    const a = parseSdp(sdp), b = parseSdp(u.sdp);
    assert.equal(u.packed, 'binary'); assert.equal(u.kind, 'offer'); assert.equal(u.slot, 3); assert.equal(u.tag, 0xbeef);
    assert.equal(b.ufrag, a.ufrag); assert.equal(b.pwd, a.pwd); assert.equal(b.fp, a.fp); assert.equal(b.setup, 'actpass');
    const want = a.candidates.filter((c) => c.transport === 'udp').map((c) => c.address.toLowerCase() + ':' + c.port).sort();
    const got = b.candidates.map((c) => c.address.toLowerCase() + ':' + c.port).sort();
    assert.deepEqual(got, want); // ≤ 3 UDP host candidates are all kept; TCP dropped
    assert.ok(cands.some((c) => c.includes('4F1C')) ? b.candidates[0].address.startsWith('4F1C') : true, 'uuid case preserved');
    console.log(`        ${sdp.length} B SDP → ${u.bytes} B binary → ${code.length} chars`);
  });
}
await t('answer/active + lz fallback when mid ≠ 0', () => {
  const ans = chromeOffer(cases['chrome mDNS']).replace('a=setup:actpass', 'a=setup:active');
  const u = unpackSdp(packSdp(ans, { kind: 'answer', slot: 5, tag: 7 }));
  assert.equal(u.kind, 'answer'); assert.equal(parseSdp(u.sdp).setup, 'active'); assert.equal(u.slot, 5);
  const weird = ans.replace('a=mid:0', 'a=mid:data');
  const code = packSdp(weird, { kind: 'answer', slot: 5, tag: 7 });
  assert.ok(code.startsWith('!'));
  const v = unpackSdp(code); assert.equal(v.packed, 'lz'); assert.equal(parseSdp(v.sdp).mid, 'data');
  console.log(`        lz fallback: ${code.length} chars`);
});

console.log('Protocol');
await t('4-byte input frames, 30 Hz packets, 16-bit seq unwrap', () => {
  const f = encodeInputFrame({ steer: -0.5, paddleL: 1, paddleR: 0, handbrake: 0.25, headlight: true, reverse: true }, 70000);
  const d = decodeInputFrame(f);
  assert.ok(Math.abs(d.steer + 0.5) < 1 / 127 && d.paddleL === 1 && d.paddleR === 0 && Math.abs(d.handbrake - 0.25) < 1 / 15 && d.headlight && d.reverse);
  const frames = [f, encodeInputFrame({ steer: 0.3 }, 69999), encodeInputFrame({}, 69998), encodeInputFrame({ paddleR: 0.6 }, 69997)];
  // cumulative stroke counters: newest frame has seen 41 L strokes and 200 R strokes
  frames[0][5] |= (41 << 2) | (200 << 10);
  const pkt = packInputPacket(frames);
  assert.equal(pkt.byteLength, 6 + 4 * 4);
  const u = unpackInputPacket(pkt, 69990);
  assert.deepEqual(u.map((x) => x[0]), [70000, 69999, 69998, 69997]);
  for (let i = 0; i < 4; i++) for (let k = 1; k < 5; k++) assert.equal(u[i][k], frames[i][k], `frame ${i} field ${k}`);
  // counts walk back through the packet: f0 has an L stroke, f3 an R stroke
  assert.deepEqual(u.map((x) => [strokeCount(x, 0), strokeCount(x, 1)]), [[41, 200], [40, 200], [40, 200], [40, 200]]);
  assert.equal(u[0][5] & 3, 3, 'light + reverse flags');
  console.log(`        packet = ${pkt.byteLength} B for 4 frames (2 new + 2 redundant) → ${(pkt.byteLength * 30)} B/s at 30 Hz (was 124 B × 60 Hz = 7.4 KB/s in R3)`);
});
const mkSnap = (tick, cars) => { const s = new Float32Array(SNAP_HEADER + cars.length * SNAP_STRIDE); s[0] = tick; s[1] = cars.length; cars.forEach((c, i) => s.set(c, SNAP_HEADER + i * SNAP_STRIDE)); return s; };
const randQuat = () => { const q = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]; const l = Math.hypot(...q); return q.map((v) => v / l); };
await t('smallest-three 10-bit quaternion (worst-case angle error)', () => {
  let worst = 0;
  for (let i = 0; i < 20000; i++) {
    const q = randQuat(); const r = unpackQuat(packQuat(...q));
    const dot = Math.abs(q[0] * r[0] + q[1] * r[1] + q[2] * r[2] + q[3] * r[3]);
    worst = Math.max(worst, 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI);
  }
  assert.ok(worst < 0.25, 'worst ' + worst);
  console.log(`        worst rotation error over 20k random quats: ${worst.toFixed(3)}°`);
});
await t('snapshot FULL records (no world available): ≤64 B/car, keyframe+unchanged deltas, acks', () => {
  // 10 cars spread over 3 km of track, 2 parked at the start line (unchanged → 1 B in deltas)
  const car = (id, z, moving, ev = 0) => { const q = randQuat(); return [id, 12.3 + id, 410 - z * 0.12, -z, ...q, moving ? 3.2 : 0, moving ? -1.1 : 0, moving ? -24.5 : 0, z * 1.01 - 5, ev, -1]; };
  const parked = [car(8, 0, false), car(9, 2, false)];
  const enc = createSnapshotEncoder({ keyframeEvery: 10 }), dec = createSnapshotDecoder();
  const acks = new Map([[1, 300], [2, 77], [3, 1023], [4, 5], [5, 6]]);
  let key = 0, delta = 0, nk = 0, nd = 0, maxErr = { p: 0, v: 0, s: 0 };
  for (let tick = 0; tick < 60; tick += 2) {
    const moving = [0, 1, 2, 3, 4, 5, 6, 7].map((id) => car(id, 100 + id * 380 + tick * 0.8, true, tick === 20 && id === 2 ? 4 : 0));
    const src = mkSnap(tick, [...moving, ...parked]);
    const buf = enc.encode(src, acks);
    const isKey = new Uint8Array(buf)[2] & 1;
    if (isKey) { key += buf.byteLength; nk++; } else { delta += buf.byteLength; nd++; }
    const out = dec.decode(buf);
    assert.equal(out.data[1], 10, 'all cars decoded');
    for (let i = 0; i < 10; i++) {
      const b = SNAP_HEADER + i * SNAP_STRIDE;
      assert.equal(out.data[b], src[b]);
      for (let k = 1; k <= 3; k++) maxErr.p = Math.max(maxErr.p, Math.abs(out.data[b + k] - src[b + k]));
      for (let k = 8; k <= 10; k++) maxErr.v = Math.max(maxErr.v, Math.abs(out.data[b + k] - src[b + k]));
      maxErr.s = Math.max(maxErr.s, Math.abs(out.data[b + 11] - src[b + 11]));
      const id = src[b];
      assert.equal(out.data[b + 13], acks.has(id) ? acks.get(id) & 255 : -1, 'ack');
      if (tick === 20 && id === 2) assert.equal(out.data[b + 12], 4, 'event bits');
    }
  }
  assert.ok(maxErr.p < 0.002 && maxErr.v <= 0.011 && maxErr.s <= 0.051, JSON.stringify(maxErr));
  const avg = (key + delta) / (nk + nd);
  const perCar = (key / nk - 25) / 10;
  assert.ok(perCar <= 64, 'per car ' + perCar);
  const total = avg * 30 * 5; // host upstream to 5 clients at 30 Hz
  console.log(`        keyframe ${(key / nk).toFixed(0)} B, delta ${(delta / nd).toFixed(0)} B (10 cars, 2 parked, 5 acks) → ~${perCar.toFixed(1)} B/car incl. ack`);
  console.log(`        30 Hz: ${(avg * 30 / 1024).toFixed(2)} KiB/s per client, ${(total / 1024).toFixed(1)} KiB/s host total for 5 clients (full-record fallback)`);
  console.log(`        max error: pos ${(maxErr.p * 1000).toFixed(2)} mm, vel ${maxErr.v.toFixed(3)} m/s, s ${maxErr.s.toFixed(3)} m`);
  // all 10 moving, no acks: worst case
  const worst = enc.encode(mkSnap(1000, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => car(id, id * 300, true))));
  console.log(`        worst case 10 moving cars: ${worst.byteLength} B → ${(worst.byteLength * 30 * 5 / 1024).toFixed(1)} KiB/s for 5 clients`);
});
await t('snapshot v4: 10 cars, track-relative compact deltas ≤ 12 B/car, exact keyframes every 10', () => {
  const world = createFakeWorld();
  const enc = createSnapshotEncoder({ keyframeEvery: 10, world }), dec = createSnapshotDecoder({ world });
  const acks = new Map([[1, 300], [2, 77], [3, 1023], [4, 5], [5, 6]]);
  let key = 0, delta = 0, nk = 0, nd = 0, deltaCarBytes = 0, deltaCars = 0, worst = { p: 0, a: 0, v: 0 };
  for (let tick = 0; tick < 600; tick += 2) {
    const src = mkSnap(tick, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => [...carAt(world, id, tick / 60), -1, 1]));
    const buf = enc.encode(src, acks);
    const u8 = new Uint8Array(buf);
    const isKey = u8[2] & 1;
    if (isKey) { key += buf.byteLength; nk++; } else { delta += buf.byteLength; nd++; deltaCarBytes += buf.byteLength - (u8[2] & 2 ? 25 : 9); deltaCars += 10; }
    const out = dec.decode(buf).data;
    assert.equal(out[1], 10);
    for (let i = 0; i < 10; i++) {
      const b = SNAP_HEADER + i * SNAP_STRIDE;
      worst.p = Math.max(worst.p, Math.hypot(out[b + 1] - src[b + 1], out[b + 2] - src[b + 2], out[b + 3] - src[b + 3]));
      let dot = 0; for (let k = 4; k < 8; k++) dot += out[b + k] * src[b + k];
      worst.a = Math.max(worst.a, 2 * Math.acos(Math.min(1, Math.abs(dot))) * 180 / Math.PI);
      worst.v = Math.max(worst.v, Math.hypot(out[b + 8] - src[b + 8], out[b + 9] - src[b + 9], out[b + 10] - src[b + 10]));
      assert.equal(out[b + 13], acks.has(out[b]) ? acks.get(out[b]) & 255 : -1);
      assert.equal(out[b + 14], isKey ? 1 : 0, 'exact flag');
    }
  }
  const perCarDelta = deltaCarBytes / deltaCars;
  assert.ok(perCarDelta <= 12, 'delta bytes per car ' + perCarDelta);
  assert.ok(enc.stats.compact > 0 && worst.p < 0.15 && worst.a < 1.5 && worst.v < 0.8, JSON.stringify(worst));
  const avg = (key + delta) / (nk + nd);
  assert.ok(avg * 30 * 5 < 25 * 1024, '10-car stream for 5 clients under 25 KiB/s');
  console.log(`        compact delta: ${perCarDelta.toFixed(2)} B/car (incl. 5 ack bytes spread over 10 cars); keyframe ${(key / nk).toFixed(0)} B, delta ${(delta / nd).toFixed(0)} B per 10-car snapshot`);
  console.log(`        30 Hz avg ${avg.toFixed(1)} B → ${(avg * 30 / 1024).toFixed(2)} KiB/s per client, ${(avg * 30 * 5 / 1024).toFixed(2)} KiB/s for 5 clients`);
  console.log(`        compact reconstruction worst: pos ${(worst.p * 100).toFixed(1)} cm, rot ${worst.a.toFixed(2)}°, vel ${worst.v.toFixed(2)} m/s; records full/compact: ${enc.stats.full}/${enc.stats.compact}`);
  // off-road / airborne cars fall back to FULL records automatically
  const off = enc.encode(mkSnap(9999, [[...carAt(world, 0, 3, { lateral: 30 }), -1, 1]]));
  assert.ok(new Uint8Array(off)[2] & 2, 'off-road car → full record with origin');
});
await t('decoder skips unchanged cars when it missed the keyframe', () => {
  const enc = createSnapshotEncoder({ keyframeEvery: 10 });
  const still = [3, 1, 2, 3, 0, 0, 0, 1, 0, 0, 0, 10, 0, -1, 1], mov = (z) => [1, 0, 0, z, 0, 0, 0, 1, 0, 0, -5, 20, 0, -1, 1];
  enc.encode(mkSnap(0, [mov(0), still])); // keyframe lost
  const d = createSnapshotDecoder().decode(enc.encode(mkSnap(2, [mov(-1), still])));
  assert.equal(d.data[1], 1); assert.equal(d.data[SNAP_HEADER], 1);
});

await t('every paddle stroke survives 30% loss + reordering + jitter-buffer merges (cumulative counters)', async () => {
  for (const loss of [0, 0.15, 0.3]) {
    let deliver = null;
    const hostSide = { id: 1, fast: { readyState: 'open' }, on(ev, cb) { if (ev === 'fast') deliver = cb; return () => {}; }, sendFast() {}, sendCtrl() {} };
    const outbox = [];
    const clientSide = { id: 0, fast: { readyState: 'open' }, on() { return () => {}; }, sendFast(b) { outbox.push(b); }, sendCtrl() {} };
    const host = createSync({ role: 'host', peers: [hostSide] });
    const client = createSync({ role: 'client', peers: [clientSide] });
    let rnd = 12345; const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const inflight = [];
    let made = [0, 0], got = [0, 0];
    for (let tick = 0; tick < 3000; tick++) {
      const inp = { steer: Math.sin(tick / 30), paddleL: tick % 20 === 0 ? 1 : 0, paddleR: tick % 20 === 10 ? 1 : 0 };
      if (tick < 2900) { made[0] += inp.paddleL > 0; made[1] += inp.paddleR > 0; client.sendInput(encodeInputFrame(inp, tick)); }
      while (outbox.length) { const b = outbox.shift(); if (rand() >= loss) inflight.push({ at: tick + 1 + Math.floor(rand() * 6), b }); } // 1-6 ticks of jitter → reordering
      for (let i = inflight.length - 1; i >= 0; i--) if (inflight[i].at <= tick) { deliver(inflight[i].b); inflight.splice(i, 1); }
      const r = host.takeInput(1);
      if (r) { got[0] += r.frame[2] > 0; got[1] += r.frame[3] > 0; }
    }
    host.close(); client.close();
    assert.deepEqual(got, made, `loss ${loss}: strokes applied ${got} vs made ${made}`);
    console.log(`        loss ${Math.round(loss * 100)}%: ${made[0] + made[1]} strokes made, ${got[0] + got[1]} applied on host (recovered from counters: ${host.stats.strokesRecovered || 0}, frames lost ${host.stats.inputsLost || 0}, merged ${host.stats.inputsMerged || 0})`);
  }
});

await t('honk: input flag survives the wire, merges and is not re-sent on repeats; snapshot honk event per car', () => {
  const f = encodeInputFrame({ honk: true, headlight: true }, 5);
  assert.equal(decodeInputFrame(f).honk, true);
  const u = unpackInputPacket(packInputPacket([f, encodeInputFrame({}, 4)]), 0);
  assert.equal(decodeInputFrame(u[0]).honk, true); assert.equal(decodeInputFrame(u[1]).honk, false);
  assert.equal(decodeInputFrame(u[0]).headlight, true);
  // event bit per car through snapshots (car 7 honks)
  const world = createFakeWorld();
  const enc = createSnapshotEncoder({ world }), dec = createSnapshotDecoder({ world });
  const cars = (tick, honker) => mkSnap(tick, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => { const c = [...carAt(world, id, tick / 60), -1, 1]; if (id === honker) c[12] = SNAP_EVENTS.HONK; return c; }));
  enc.encode(cars(0, -1));
  const out = dec.decode(enc.encode(cars(2, 7))).data;
  const honks = []; for (let i = 0; i < out[1]; i++) { const b = SNAP_HEADER + i * SNAP_STRIDE; if (out[b + 12] & SNAP_EVENTS.HONK) honks.push(out[b]); }
  assert.deepEqual(honks, [7]);
});
await t('host honk via sync: merged frames keep the honk, starved repeats never re-honk; race conditions whitelist', async () => {
  let deliver = null;
  const hostSide = { id: 1, fast: { readyState: 'open' }, on(ev, cb) { if (ev === 'fast') deliver = cb; return () => {}; }, sendFast() {}, sendCtrl() {} };
  const outbox = [];
  const clientSide = { id: 0, fast: { readyState: 'open' }, on() { return () => {}; }, sendFast(b) { outbox.push(b); }, sendCtrl() {} };
  const host = createSync({ role: 'host', peers: [hostSide] }), client = createSync({ role: 'client', peers: [clientSide] });
  for (let k = 0; k < 40; k++) client.sendInput(encodeInputFrame({ honk: k === 10 }, k));
  outbox.forEach((b) => deliver(b));
  let honks = 0;
  for (let k = 0; k < 60; k++) { const r = host.takeInput(1); if (r && decodeInputFrame(r.frame).honk) honks++; }
  assert.equal(honks, 1, 'exactly one honk applied');
  assert.deepEqual(host.setRaceConditions({ weather: 'Stormy', time: 'night' }), { weather: 'storm', time: 'night' });
  assert.deepEqual(normalizeConditions({ weather: 'lava', time: 'noon' }), { weather: 'clear', time: 'day' });
  host.close(); client.close();
});

await t('honk events: repeated in 3 snapshots, de-duplicated on the client, survive 30% snapshot loss', () => {
  const world = createFakeWorld();
  let toClient = null; const sent = [];
  const hostPeer = { id: 1, fast: { readyState: 'open' }, on() { return () => {}; }, sendFast(b) { sent.push(b); }, sendCtrl() {} };
  const clientPeer = { id: 0, fast: { readyState: 'open' }, on(ev, cb) { if (ev === 'fast') toClient = cb; return () => {}; }, sendFast() {}, sendCtrl() {} };
  const host = createSync({ role: 'host', peers: [hostPeer], world }), client = createSync({ role: 'client', peers: [clientPeer], world });
  const heard = new Map();
  client.onSnapshot((d) => { for (let i = 0; i < d[1]; i++) { const b = SNAP_HEADER + i * SNAP_STRIDE; if (d[b + 12] & SNAP_EVENTS.HONK) heard.set(d[b], (heard.get(d[b]) || 0) + 1); } });
  let rnd = 7; const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const honked = new Map();
  for (let tick = 0; tick < 1200; tick++) {
    const snap = mkSnap(tick, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => { const c = [...carAt(world, id, tick / 60), -1, 1]; if (tick % 97 === id * 7) { c[12] = SNAP_EVENTS.HONK; honked.set(id, (honked.get(id) || 0) + 1); } return c; }));
    host.broadcastSnapshot(snap);
    while (sent.length) { const b = sent.shift(); if (rand() >= 0.3) toClient(b); }
  }
  host.close(); client.close();
  const h = [...honked.values()].reduce((a, b) => a + b, 0), g = [...heard.values()].reduce((a, b) => a + b, 0);
  console.log(`        ${h} honks sent across 10 cars, ${g} heard by the client at 30% snapshot loss (no duplicates)`);
  assert.ok(g <= h && g >= h * 0.93, `heard ${g} of ${h}`); // all 3 copies lost: 0.3^3 ≈ 2.7%
});

console.log('Interpolator');
await t('hermite between 30 Hz snapshots, ~100 ms behind', () => {
  const ip = createInterpolator({ delayMs: 100 });
  const mk = (tick) => { const s = new Float32Array(SNAP_HEADER + SNAP_STRIDE); s[0] = tick; s[1] = 1; s.set([7, 0, 0, -tick / 60 * 10, 0, 0, 0, 1, 0, 0, -10, tick / 6, tick === 30 ? 2 : 0, -1], SNAP_HEADER); return s; };
  for (let tick = 0; tick <= 60; tick += 2) ip.push(mk(tick), 1000 + tick * 1000 / 60); // 30 Hz
  const m = ip.sample(1000 + 1000 + 0); // local "now" = arrival of tick 60 → render tick 54
  const c = m.get(7);
  assert.ok(Math.abs(ip.renderTick - 54) < 0.01, 'renderTick ' + ip.renderTick);
  assert.ok(Math.abs(c.position[2] - (-9)) < 1e-3, 'z ' + c.position[2]);
  assert.equal(c.events & 2, 2, 'events OR-accumulated');
});

console.log('Client-side prediction');
await t('predict + reconcile with acks: local car responds instantly, converges to host', () => {
  // toy deterministic body following the physics contract (kinematic bicycle on a plane)
  const mkBody = () => {
    const st = { position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, quaternion: { x: 0, y: 0, z: 0, w: 1, set(x, y, z, w) { Object.assign(this, { x, y, z, w }); } }, velocity: { x: 0, y: 0, z: -10, set(x, y, z) { Object.assign(this, { x, y, z }); } }, s: 0, yaw: 0 };
    return {
      state: st,
      step(dt, inp) { st.yaw += (inp.steer || 0) * dt; const sp = Math.hypot(st.velocity.x, st.velocity.z) + (inp.paddleL || 0) * 0.5; st.velocity.x = -Math.sin(st.yaw) * sp; st.velocity.z = -Math.cos(st.yaw) * sp; st.position.x += st.velocity.x * dt; st.position.z += st.velocity.z * dt; st.s += sp * dt; st.quaternion.set(0, Math.sin(st.yaw / 2), 0, Math.cos(st.yaw / 2)); },
      serialize(a, o = 0) { a[o] = st.position.x; a[o + 1] = st.position.y; a[o + 2] = st.position.z; a[o + 3] = st.quaternion.x; a[o + 4] = st.quaternion.y; a[o + 5] = st.quaternion.z; a[o + 6] = st.quaternion.w; a[o + 7] = st.velocity.x; a[o + 8] = st.velocity.y; a[o + 9] = st.velocity.z; a[o + 13] = st.s; return o + 20; },
      deserialize(a, o = 0) { st.position.set(a[o], a[o + 1], a[o + 2]); st.quaternion.set(a[o + 3], a[o + 4], a[o + 5], a[o + 6]); st.yaw = 2 * Math.atan2(a[o + 4], a[o + 6]); st.velocity.set(a[o + 7], a[o + 8], a[o + 9]); st.s = a[o + 13]; return o + 20; },
    };
  };
  const host = mkBody(), local = mkBody();
  const pred = createPredictor({ body: local, slot: 2 });
  const dt = 1 / 60, LAT = 6; // 100 ms one-way in steps
  const inFlight = []; const snaps = [];
  const enc = createSnapshotEncoder(), dec = createSnapshotDecoder();
  let firstTurnLocal = null;
  for (let seq = 0; seq < 240; seq++) {
    const inp = { steer: seq > 30 && seq < 90 ? 0.8 : 0, paddleL: seq % 20 === 0 ? 1 : 0 };
    pred.step(dt, inp, seq);
    if (seq === 31) firstTurnLocal = local.state.yaw;
    inFlight.push({ at: seq + LAT, seq, inp });
    // host applies inputs that have arrived, one per tick
    const arrived = inFlight.filter((m) => m.at === seq);
    for (const m of arrived) { host.step(dt, m.inp); host.lastSeq = m.seq; }
    if (seq % 2 === 0 && host.lastSeq !== undefined) {
      const a = new Float32Array(20); host.serialize(a);
      const snap = mkSnap(seq, [[2, a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[13], 0, -1]]);
      snaps.push({ at: seq + LAT, buf: enc.encode(snap, new Map([[2, host.lastSeq]])) });
    }
    for (const sn of snaps.filter((x) => x.at === seq)) pred.onSnapshot(dec.decode(sn.buf).data);
  }
  assert.ok(firstTurnLocal > 0, 'local steering applied immediately (no round trip)');
  // host is 6 inputs behind; compare predicted state against host state replayed with those inputs
  const err = Math.hypot(local.state.position.x - host.state.position.x, local.state.position.z - host.state.position.z);
  const r = pred.renderPose();
  assert.ok(pred.stats.reconciles > 50, 'reconciled ' + pred.stats.reconciles);
  assert.ok(pred.stats.lastError < 0.05, 'reconcile error ' + pred.stats.lastError);
  assert.ok(Number.isFinite(r.position[0]) && Math.abs(Math.hypot(...r.quaternion) - 1) < 1e-6);
  console.log(`        ${pred.stats.reconciles} reconciles, ${pred.pending} unacked inputs in flight, last correction ${(pred.stats.lastError * 1000).toFixed(1)} mm, local ahead of host by ${err.toFixed(2)} m (= latency)`);
});

console.log('Licensing (memory store in Node)');
await t('dev pass → 6 seats max, grant/accept bound seat, tamper rejected', async () => {
  const opts = { trustDevIssuer: true, loadDevIssuer: () => import('../src/net/devIssuer.js') };
  const owner = createLicensing(opts); await owner.init();
  assert.equal((await owner.verify()).ok, false);
  const st = await owner.devIssuePass();
  assert.equal(st.ok, true); assert.equal(st.isOwner, true);
  for (let i = 0; i < MAX_SEATS - 1; i++) await owner.provisionSeat('Kid ' + i);
  const other = createLicensing(opts); await other.init();
  const req = await other.createSeatRequest('Grandma');
  const grant = await owner.grantSeat({ request: req });
  assert.equal(owner.seats().length, MAX_SEATS - 1, 'bound seat not stored as owner token');
  await assert.rejects(owner.provisionSeat('one too many'), /All 6/);
  const r = await other.acceptSeatGrant(grant);
  assert.equal(r.ok, true); assert.equal(r.seats[0].name, 'Grandma'); assert.equal(r.seats[0].index, 5);
  const third = createLicensing(opts); await third.init();
  await assert.rejects(third.acceptSeatGrant(grant), /different iPad/);
  const [p, s] = grant.slice(6).split('~');
  const tampered = `SBDG1.${p}~${s.slice(0, 10)}${s[10] === 'A' ? 'B' : 'A'}${s.slice(11)}`;
  await assert.rejects(other.acceptSeatGrant(tampered));
  // transfer seat 5 again → generation bump, compareSeats flags the stale one
  const third2 = await third.createSeatRequest('Grandpa');
  const g2 = await owner.grantSeat({ request: third2, index: 5 });
  assert.equal((await third.acceptSeatGrant(g2)).seats[0].generation, 1);
  const cmp = await owner.compareSeats([grant.split('~')[1], g2.split('~')[1]]);
  assert.deepEqual(cmp.map((c) => c.valid), [false, true]);
  console.log(`        grant QR text = ${grant.length} chars`);
  const prod = createLicensing({ trustDevIssuer: false }); await prod.init();
  await assert.rejects(prod.acceptSeatGrant(grant), /pass signature invalid/, 'prod build rejects dev-issued passes');
});
console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`);
