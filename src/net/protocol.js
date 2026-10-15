// Binary wire formats for the star topology (inputs 60 Hz, snapshots 30 Hz) (all little-endian).
//
// Every fast-channel packet starts with a 1-byte message type.
//
// INPUT (client → host), type 1:
//   u8 type, u8 nFrames, u16 pad, then nFrames × INPUT_STRIDE float32 (newest first).
//   Each frame = [seq, steer, paddleL, paddleR, handbrake, flags]. We resend the last 3 frames
//   in every packet so a single dropped unreliable packet never loses a paddle stroke.
//
// SNAPSHOT (host → clients), type 2, wire VERSION 2 — sent at 30 Hz by sync.js:
//   header (25 B): u8 type, u8 version(=2), u8 flags(bit0 keyframe), u8 count, u32 tick,
//                  u8 baseAge (ticks since the keyframe this delta refers to),
//                  f32 originX, originY, originZ, f32 scale (metres per 24-bit position unit)
//   per car: u8 head = id(bits0-2) | UNCHANGED(bit3) | HAS_EVENTS(bit4) | HAS_ACK(bit5)
//            [u8 events] [u8 ack = last input seq & 255 the host applied for this car]
//            unless UNCHANGED (car identical to the keyframe → 1 byte total):
//              3 × u24 position (origin + u·scale; 0.2 mm at 3 km spread)
//              u32 quaternion, smallest-three: 2-bit index + 3 × 10 bit
//              3 × i16 velocity (1/50 m/s, ±655 m/s)
//              u16 s in decimetres, offset +100 m (−100 … 6453 m)
//   → 22 B per moving car (+1 per ack/event), 1 B per car at rest; 6 cars ≈ 157-162 B.
//
// PING type 3: u8 type, pad×7, f64 clientTime.   PONG type 4: + f64 hostTime.
//
// The *decoded* snapshot exposed to game code is a Float32Array in the same layout the host
// passes to broadcastSnapshot():
//   [tick, count, (id, px,py,pz, qx,qy,qz,qw, vx,vy,vz, s, events, ack) × count]
// `ack` is filled in by sync.js on the host (last input seq & 255 for that slot, −1 if none);
// clients feed it to createPredictor().

export const MSG = { INPUT: 1, SNAPSHOT: 2, PING: 3, PONG: 4 };
export const INPUT_STRIDE = 6;
export const INPUT_REDUNDANCY = 3;
export const FLAG_HEADLIGHT = 1;
export const FLAG_REVERSE = 2;
export const SNAP_HEADER = 2;
export const SNAP_STRIDE = 14;
export const SNAP_VERSION = 2;
export const SNAP_FIELDS = { id: 0, px: 1, py: 2, pz: 3, qx: 4, qy: 5, qz: 6, qw: 7, vx: 8, vy: 9, vz: 10, s: 11, events: 12, ack: 13 };

/** Input struct → Float32Array frame [seq, steer, paddleL, paddleR, handbrake, flags]. */
export function encodeInputFrame(input, seq, out = new Float32Array(INPUT_STRIDE)) {
  out[0] = seq;
  out[1] = input.steer || 0;
  out[2] = input.paddleL || 0;
  out[3] = input.paddleR || 0;
  out[4] = input.handbrake || 0;
  out[5] = (input.headlight ? FLAG_HEADLIGHT : 0) | (input.reverse ? FLAG_REVERSE : 0);
  return out;
}
export function decodeInputFrame(f) {
  const flags = f[5] | 0;
  return { seq: f[0], steer: f[1], paddleL: f[2], paddleR: f[3], handbrake: f[4], headlight: !!(flags & FLAG_HEADLIGHT), reverse: !!(flags & FLAG_REVERSE) };
}

export function packInputPacket(frames /* newest first, Float32Array[] */) {
  const n = Math.min(frames.length, 255);
  const buf = new ArrayBuffer(4 + n * INPUT_STRIDE * 4);
  const u8 = new Uint8Array(buf);
  u8[0] = MSG.INPUT; u8[1] = n;
  const f = new Float32Array(buf, 4);
  for (let i = 0; i < n; i++) f.set(frames[i].subarray(0, INPUT_STRIDE), i * INPUT_STRIDE);
  return buf;
}
export function unpackInputPacket(buf) {
  const n = new Uint8Array(buf, 0, 2)[1];
  const f = new Float32Array(buf, 4, n * INPUT_STRIDE);
  const out = [];
  for (let i = 0; i < n; i++) out.push(f.slice(i * INPUT_STRIDE, (i + 1) * INPUT_STRIDE));
  return out;
}

const HDR = 25, CAR_FULL = 21;
const F_KEY = 1, C_UNCHANGED = 8, C_EVENTS = 16, C_ACK = 32;
const R = Math.SQRT1_2;
const U24 = 16777215;

/** smallest-three quaternion → u32 (2-bit index of the dropped largest component + 3×10 bit). */
export function packQuat(x, y, z, w) {
  const q = [x, y, z, w];
  let i = 0;
  for (let k = 1; k < 4; k++) if (Math.abs(q[k]) > Math.abs(q[i])) i = k;
  const sg = q[i] < 0 ? -1 : 1;
  const n = Math.hypot(x, y, z, w) || 1;
  let out = i;
  for (let k = 0; k < 4; k++) {
    if (k === i) continue;
    const v = (q[k] * sg) / n;
    const u = Math.max(0, Math.min(1023, Math.round(((v + R) / (2 * R)) * 1023)));
    out = out * 1024 + u;
  }
  return out >>> 0;
}
export function unpackQuat(u, out = [0, 0, 0, 1], o = 0) {
  const c = u & 1023, b = (u >>> 10) & 1023, a = (u >>> 20) & 1023, i = u >>> 30;
  const vals = [a, b, c].map((v) => (v / 1023) * 2 * R - R);
  const big = Math.sqrt(Math.max(0, 1 - vals[0] * vals[0] - vals[1] * vals[1] - vals[2] * vals[2]));
  let j = 0;
  for (let k = 0; k < 4; k++) out[o + k] = k === i ? big : vals[j++];
  return out;
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
function setU24(dv, o, v) { dv.setUint16(o, v & 0xffff, true); dv.setUint8(o + 2, v >>> 16); }
function getU24(dv, o) { return dv.getUint16(o, true) | (dv.getUint8(o + 2) << 16); }

function sameAsBase(snap, b, base) {
  if (!base) return false;
  if ((snap[b + 12] | 0) !== 0) return false;
  for (let k = 1; k <= 3; k++) if (Math.abs(snap[b + k] - base[k]) > 0.002) return false;
  for (let k = 8; k <= 10; k++) if (Math.abs(snap[b + k] - base[k]) > 0.02) return false;
  if (Math.abs(snap[b + 11] - base[11]) > 0.05) return false;
  let dot = 0; for (let k = 4; k <= 7; k++) dot += snap[b + k] * base[k];
  return Math.abs(dot) > 0.99999;
}

/**
 * Stateful host-side encoder (keyframe every `keyframeEvery` snapshots, deltas in between:
 * cars that have not moved since the keyframe cost 1 byte).
 */
export function createSnapshotEncoder({ keyframeEvery = 10 } = {}) {
  let sinceKey = Infinity, keyTick = 0;
  const base = new Map(); // id → Float32Array(14) dequantised keyframe values
  const scratch = new Uint8Array(HDR + 8 * (CAR_FULL + 3));
  return {
    /** @param snap Float32Array layout above; @param acks Map<id, seq> (optional) */
    encode(snap, acks) {
      const tick = snap[0] >>> 0;
      const count = Math.min(snap[1] | 0, 8);
      const key = sinceKey >= keyframeEvery || tick - keyTick > 255;
      if (key) { sinceKey = 0; keyTick = tick; base.clear(); } else sinceKey++;
      // origin + uniform scale over all cars
      let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < count; i++) {
        const b = SNAP_HEADER + i * SNAP_STRIDE;
        for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], snap[b + 1 + k]); mx[k] = Math.max(mx[k], snap[b + 1 + k]); }
      }
      if (!count) mn = mx = [0, 0, 0];
      mn = mn.map((v) => Math.fround(Math.floor(v)));
      const range = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2], 1);
      const scale = Math.fround(Math.max(range / U24, 1e-4) * 1.0001);
      const dv = new DataView(scratch.buffer);
      dv.setUint8(0, MSG.SNAPSHOT); dv.setUint8(1, SNAP_VERSION); dv.setUint8(2, key ? F_KEY : 0); dv.setUint8(3, count);
      dv.setUint32(4, tick, true); dv.setUint8(8, key ? 0 : tick - keyTick);
      dv.setFloat32(9, mn[0], true); dv.setFloat32(13, mn[1], true); dv.setFloat32(17, mn[2], true); dv.setFloat32(21, scale, true);
      let o = HDR;
      for (let i = 0; i < count; i++) {
        const b = SNAP_HEADER + i * SNAP_STRIDE;
        const id = snap[b] & 7;
        const ev = snap[b + 12] & 255;
        const ack = acks && acks.has(id) ? acks.get(id) & 255 : -1;
        const unchanged = !key && sameAsBase(snap, b, base.get(id));
        dv.setUint8(o++, id | (unchanged ? C_UNCHANGED : 0) | (ev ? C_EVENTS : 0) | (ack >= 0 ? C_ACK : 0));
        if (ev) dv.setUint8(o++, ev);
        if (ack >= 0) dv.setUint8(o++, ack);
        if (unchanged) continue;
        const pu = [0, 1, 2].map((k) => clamp(Math.round((snap[b + 1 + k] - mn[k]) / scale), 0, U24));
        pu.forEach((v, k) => setU24(dv, o + k * 3, v)); o += 9;
        const qu = packQuat(snap[b + 4], snap[b + 5], snap[b + 6], snap[b + 7]);
        dv.setUint32(o, qu, true); o += 4;
        for (let k = 0; k < 3; k++) { dv.setInt16(o, clamp(Math.round(snap[b + 8 + k] * 50), -32767, 32767), true); o += 2; }
        const su = clamp(Math.round((snap[b + 11] + 100) * 10), 0, 65535);
        dv.setUint16(o, su, true); o += 2;
        if (key) { // remember exactly what clients will reconstruct
          const d = new Float32Array(SNAP_STRIDE);
          d[0] = id; for (let k = 0; k < 3; k++) d[1 + k] = mn[k] + pu[k] * scale;
          unpackQuat(qu, d, 4);
          for (let k = 0; k < 3; k++) d[8 + k] = clamp(Math.round(snap[b + 8 + k] * 50), -32767, 32767) / 50;
          d[11] = su / 10 - 100; d[12] = 0; d[13] = -1;
          base.set(id, d);
        }
      }
      return scratch.slice(0, o).buffer;
    },
  };
}

/** Stateful client-side decoder. decode(buf) → { tick, keyframe, data } (cars whose baseline is missing are omitted). */
export function createSnapshotDecoder() {
  let keyTick = -1;
  const base = new Map();
  return {
    decode(buf) {
      const dv = new DataView(buf);
      if (dv.getUint8(1) !== SNAP_VERSION) throw new Error('snapshot version ' + dv.getUint8(1));
      const key = dv.getUint8(2) & F_KEY, count = dv.getUint8(3), tick = dv.getUint32(4, true), age = dv.getUint8(8);
      const org = [dv.getFloat32(9, true), dv.getFloat32(13, true), dv.getFloat32(17, true)], scale = dv.getFloat32(21, true);
      const haveBase = !key && keyTick === tick - age;
      if (key && tick > keyTick) { keyTick = tick; base.clear(); }
      const out = new Float32Array(SNAP_HEADER + count * SNAP_STRIDE);
      let o = HDR, n = 0;
      for (let i = 0; i < count; i++) {
        const head = dv.getUint8(o++);
        const id = head & 7;
        const ev = head & C_EVENTS ? dv.getUint8(o++) : 0;
        const ack = head & C_ACK ? dv.getUint8(o++) : -1;
        const b = SNAP_HEADER + n * SNAP_STRIDE;
        if (head & C_UNCHANGED) {
          const bs = haveBase && base.get(id);
          if (!bs) continue; // missed the keyframe: skip this car until the next one
          out.set(bs, b);
        } else {
          for (let k = 0; k < 3; k++) out[b + 1 + k] = org[k] + getU24(dv, o + k * 3) * scale;
          o += 9;
          unpackQuat(dv.getUint32(o, true), out, b + 4); o += 4;
          for (let k = 0; k < 3; k++) { out[b + 8 + k] = dv.getInt16(o, true) / 50; o += 2; }
          out[b + 11] = dv.getUint16(o, true) / 10 - 100; o += 2;
          if (key && tick === keyTick) { const d = out.slice(b, b + SNAP_STRIDE); d[12] = 0; d[13] = -1; d[0] = id; base.set(id, d); }
        }
        out[b] = id; out[b + 12] = ev; out[b + 13] = ack;
        n++;
      }
      out[0] = tick; out[1] = n;
      return { tick, keyframe: !!key, data: n === count ? out : out.slice(0, SNAP_HEADER + n * SNAP_STRIDE) };
    },
  };
}

/** Stateless convenience: always a keyframe. */
export function packSnapshot(snap, acks) { return createSnapshotEncoder({ keyframeEvery: 0 }).encode(snap, acks); }
export function unpackSnapshot(buf) { return createSnapshotDecoder().decode(buf); }

export function packPing(t) { const b = new ArrayBuffer(16); const dv = new DataView(b); dv.setUint8(0, MSG.PING); dv.setFloat64(8, t, true); return b; }
export function packPong(clientT, hostT) { const b = new ArrayBuffer(24); const dv = new DataView(b); dv.setUint8(0, MSG.PONG); dv.setFloat64(8, clientT, true); dv.setFloat64(16, hostT, true); return b; }
export function msgType(buf) { return new Uint8Array(buf, 0, 1)[0]; }
