// Node unit checks for src/net: SDP pack/unpack round-trip, wire protocol, interpolator, licensing.
//   node tests/net-unit.mjs
import assert from 'node:assert/strict';
import { packSdp, unpackSdp, parseSdp } from '../src/net/sdpPack.js';
import { encodeInputFrame, decodeInputFrame, packInputPacket, unpackInputPacket, packSnapshot, unpackSnapshot, SNAP_HEADER, SNAP_STRIDE } from '../src/net/protocol.js';
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
await t('input frame + redundancy packet', () => {
  const f = encodeInputFrame({ steer: -0.5, paddleL: 1, paddleR: 0, handbrake: 0.25, headlight: true, reverse: true }, 42);
  const d = decodeInputFrame(f);
  assert.deepEqual(d, { seq: 42, steer: -0.5, paddleL: 1, paddleR: 0, handbrake: 0.25, headlight: true, reverse: true });
  const pkt = packInputPacket([f, encodeInputFrame({}, 41), encodeInputFrame({}, 40)]);
  assert.equal(pkt.byteLength, 4 + 3 * 24);
  assert.deepEqual(unpackInputPacket(pkt).map((x) => x[0]), [42, 41, 40]);
});
await t('snapshot quantisation 6 cars', () => {
  const s = new Float32Array(SNAP_HEADER + 6 * SNAP_STRIDE); s[0] = 123456; s[1] = 6;
  for (let i = 0; i < 6; i++) {
    const b = SNAP_HEADER + i * SNAP_STRIDE; const h = Math.SQRT1_2;
    s.set([i, 10.5 + i, -200.25, -2900.75, 0, h, 0, h, 12.34, -3.21, -25.5, 3100.5, 5], b);
  }
  const buf = packSnapshot(s, 1000);
  const u = unpackSnapshot(buf);
  assert.equal(u.tick, 123456);
  for (let k = 0; k < s.length; k++) assert.ok(Math.abs(u.data[k] - s[k]) < 0.006, `field ${k}: ${u.data[k]} vs ${s[k]}`);
  console.log(`        snapshot 6 cars = ${buf.byteLength} B  (${(buf.byteLength * 60 / 1024).toFixed(1)} KiB/s per client @60 Hz)`);
});

console.log('Interpolator');
await t('hermite between snapshots, ~100 ms behind', () => {
  const ip = createInterpolator({ delayMs: 100 });
  const mk = (tick) => { const s = new Float32Array(SNAP_HEADER + SNAP_STRIDE); s[0] = tick; s[1] = 1; s.set([7, 0, 0, -tick / 60 * 10, 0, 0, 0, 1, 0, 0, -10, tick / 6, tick === 30 ? 2 : 0], SNAP_HEADER); return s; };
  for (let tick = 0; tick <= 60; tick++) ip.push(mk(tick), 1000 + tick * 1000 / 60);
  const m = ip.sample(1000 + 1000 + 0); // local "now" = arrival of tick 60 → render tick 54
  const c = m.get(7);
  assert.ok(Math.abs(ip.renderTick - 54) < 0.01, 'renderTick ' + ip.renderTick);
  assert.ok(Math.abs(c.position[2] - (-9)) < 1e-3, 'z ' + c.position[2]);
  assert.equal(c.events & 2, 2, 'events OR-accumulated');
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
