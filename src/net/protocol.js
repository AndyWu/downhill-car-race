// Binary wire formats for the star topology (all little-endian).
// Every fast-channel packet starts with a 1-byte message type.
//
// INPUT (client → host, 60 Hz), type 1:
//   u8 type, u8 nFrames, u16 pad, then nFrames × INPUT_STRIDE float32 (newest first).
//   Each frame = [seq, steer, paddleL, paddleR, handbrake, flags]. We resend the last 5 frames
//   in every packet so a single dropped unreliable packet never loses a paddle stroke.
//
// SNAPSHOT (host → clients, 30 Hz), type 2: see snapshot.js (wire version 3, track-relative).
//
// PING type 3: u8 type, pad×7, f64 clientTime.   PONG type 4: + f64 hostTime.

export const MSG = { INPUT: 1, SNAPSHOT: 2, PING: 3, PONG: 4 };
export const INPUT_STRIDE = 6;
export const INPUT_REDUNDANCY = 5;
export const FLAG_HEADLIGHT = 1;
export const FLAG_REVERSE = 2;
export {
  SNAP_HEADER, SNAP_STRIDE, SNAP_VERSION, SNAP_FIELDS, packQuat, unpackQuat,
  createSnapshotEncoder, createSnapshotDecoder, packSnapshot, unpackSnapshot,
} from './snapshot.js';

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


export function packPing(t) { const b = new ArrayBuffer(16); const dv = new DataView(b); dv.setUint8(0, MSG.PING); dv.setFloat64(8, t, true); return b; }
export function packPong(clientT, hostT) { const b = new ArrayBuffer(24); const dv = new DataView(b); dv.setUint8(0, MSG.PONG); dv.setFloat64(8, clientT, true); dv.setFloat64(16, hostT, true); return b; }
export function msgType(buf) { return new Uint8Array(buf, 0, 1)[0]; }
