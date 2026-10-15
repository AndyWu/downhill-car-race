// Binary wire formats for the 60 Hz star topology (all little-endian).
//
// Every fast-channel packet starts with a 1-byte message type.
//
// INPUT (client → host), type 1:
//   u8 type, u8 nFrames, u16 pad, then nFrames × INPUT_STRIDE float32 (newest first).
//   Each frame = [seq, steer, paddleL, paddleR, handbrake, flags]. We resend the last 3 frames
//   in every packet so a single dropped unreliable packet never loses a paddle stroke.
//
// SNAPSHOT (host → clients), type 2:
//   u8 type, u8 count, u32 tick, f32 hostTimeMs(mod 2^24), then count × 32 bytes:
//     u8 id, u8 events, f32 px, f32 py, f32 pz,           (14)
//     i16 qx, qy, qz, qw (×32767)                          (8)
//     i16 vx, vy, vz (×100 → ±327 m/s, 1 cm/s)             (6)
//     f32 s                                                (4)
//
// PING type 3: u8 type, pad×7, f64 clientTime.   PONG type 4: + f64 hostTime.
//
// The *decoded* snapshot exposed to game code is a Float32Array in the same layout the host
// passes to broadcastSnapshot():
//   [tick, count, (id, px,py,pz, qx,qy,qz,qw, vx,vy,vz, s, events) × count]

export const MSG = { INPUT: 1, SNAPSHOT: 2, PING: 3, PONG: 4 };
export const INPUT_STRIDE = 6;
export const INPUT_REDUNDANCY = 3;
export const FLAG_HEADLIGHT = 1;
export const FLAG_REVERSE = 2;
export const SNAP_HEADER = 2;
export const SNAP_STRIDE = 13;
export const SNAP_FIELDS = { id: 0, px: 1, py: 2, pz: 3, qx: 4, qy: 5, qz: 6, qw: 7, vx: 8, vy: 9, vz: 10, s: 11, events: 12 };
const CAR_BYTES = 32;
const SNAP_HDR_BYTES = 10;

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

const qz = (v) => Math.max(-32767, Math.min(32767, Math.round(v * 32767)));
const vz = (v) => Math.max(-32767, Math.min(32767, Math.round(v * 100)));

/** Float32Array snapshot (layout above) → compact ArrayBuffer. */
export function packSnapshot(snap, hostTimeMs = 0) {
  const tick = snap[0] >>> 0;
  const count = Math.min(snap[1] | 0, 255);
  const buf = new ArrayBuffer(SNAP_HDR_BYTES + count * CAR_BYTES);
  const dv = new DataView(buf);
  dv.setUint8(0, MSG.SNAPSHOT); dv.setUint8(1, count);
  dv.setUint32(2, tick, true);
  dv.setFloat32(6, hostTimeMs % 16777216, true);
  let o = SNAP_HDR_BYTES;
  for (let i = 0; i < count; i++) {
    const b = SNAP_HEADER + i * SNAP_STRIDE;
    // renormalise quaternion before quantising
    let x = snap[b + 4], y = snap[b + 5], z = snap[b + 6], w = snap[b + 7];
    const ql = Math.hypot(x, y, z, w) || 1; x /= ql; y /= ql; z /= ql; w /= ql;
    if (w < 0) { x = -x; y = -y; z = -z; w = -w; } // canonical hemisphere
    dv.setUint8(o, snap[b] & 255); dv.setUint8(o + 1, snap[b + 12] & 255);
    dv.setFloat32(o + 2, snap[b + 1], true); dv.setFloat32(o + 6, snap[b + 2], true); dv.setFloat32(o + 10, snap[b + 3], true);
    dv.setInt16(o + 14, qz(x), true); dv.setInt16(o + 16, qz(y), true); dv.setInt16(o + 18, qz(z), true); dv.setInt16(o + 20, qz(w), true);
    dv.setInt16(o + 22, vz(snap[b + 8]), true); dv.setInt16(o + 24, vz(snap[b + 9]), true); dv.setInt16(o + 26, vz(snap[b + 10]), true);
    dv.setFloat32(o + 28, snap[b + 11], true);
    o += CAR_BYTES;
  }
  return buf;
}

/** compact ArrayBuffer → { tick, hostTimeMs, data: Float32Array (layout above) } */
export function unpackSnapshot(buf) {
  const dv = new DataView(buf);
  const count = dv.getUint8(1);
  const tick = dv.getUint32(2, true);
  const hostTimeMs = dv.getFloat32(6, true);
  const out = new Float32Array(SNAP_HEADER + count * SNAP_STRIDE);
  out[0] = tick; out[1] = count;
  let o = SNAP_HDR_BYTES;
  for (let i = 0; i < count; i++) {
    const b = SNAP_HEADER + i * SNAP_STRIDE;
    out[b] = dv.getUint8(o); out[b + 12] = dv.getUint8(o + 1);
    out[b + 1] = dv.getFloat32(o + 2, true); out[b + 2] = dv.getFloat32(o + 6, true); out[b + 3] = dv.getFloat32(o + 10, true);
    let x = dv.getInt16(o + 14, true) / 32767, y = dv.getInt16(o + 16, true) / 32767, z = dv.getInt16(o + 18, true) / 32767, w = dv.getInt16(o + 20, true) / 32767;
    const ql = Math.hypot(x, y, z, w) || 1;
    out[b + 4] = x / ql; out[b + 5] = y / ql; out[b + 6] = z / ql; out[b + 7] = w / ql;
    out[b + 8] = dv.getInt16(o + 22, true) / 100; out[b + 9] = dv.getInt16(o + 24, true) / 100; out[b + 10] = dv.getInt16(o + 26, true) / 100;
    out[b + 11] = dv.getFloat32(o + 28, true);
    o += CAR_BYTES;
  }
  return { tick, hostTimeMs, data: out };
}

export function packPing(t) { const b = new ArrayBuffer(16); const dv = new DataView(b); dv.setUint8(0, MSG.PING); dv.setFloat64(8, t, true); return b; }
export function packPong(clientT, hostT) { const b = new ArrayBuffer(24); const dv = new DataView(b); dv.setUint8(0, MSG.PONG); dv.setFloat64(8, clientT, true); dv.setFloat64(16, hostT, true); return b; }
export function msgType(buf) { return new Uint8Array(buf, 0, 1)[0]; }
