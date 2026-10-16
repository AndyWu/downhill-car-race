// Binary wire formats for the star topology (all little-endian).
// Every fast-channel packet starts with a 1-byte message type.
//
// INPUT (client → host), type 1: 60 Hz frames sent in packets at 30 Hz.
//   u8 type, u8 nFrames, u16 newest seq, then nFrames × u32 packed frames (newest first).
//   Each packet carries its 2 new frames + the previous packet's 2 (2-frame redundancy) and
//   cumulative per-paddle stroke counters: 22 B × 30 Hz = 660 B/s. Decoded frame = [seq, steer, paddleL, paddleR, handbrake, flags].
//
// SNAPSHOT (host → clients, 30 Hz), type 2: see snapshot.js (wire version 3, track-relative).
//
// PING type 3: u8 type, pad×7, f64 clientTime.   PONG type 4: + f64 hostTime.

export const MSG = { INPUT: 1, SNAPSHOT: 2, PING: 3, PONG: 4 };
export const INPUT_STRIDE = 6;
export const INPUT_REDUNDANCY = 4; // frames per packet (2 new + 2 repeated)
export const INPUT_HZ = 30;
export const FLAG_HEADLIGHT = 1;
export const FLAG_REVERSE = 2;
export const FLAG_HONK = 1 << 18; // decoded-frame flags bit (bits 2-17 hold the stroke counters)
const KEEP = FLAG_HEADLIGHT | FLAG_REVERSE | FLAG_HONK;
export {
  SNAP_HEADER, SNAP_STRIDE, SNAP_VERSION, SNAP_FIELDS, packQuat, unpackQuat,
  createSnapshotEncoder, createSnapshotDecoder, packSnapshot, unpackSnapshot, SNAP_EVENTS, MAX_CARS,
} from './snapshot.js';

// Quantisation shared by client prediction and the host (both must simulate the SAME input):
//   steer int8 (/127), paddleL/paddleR/handbrake 4 bit (/15), flags: headlight, reverse,
//   + 3-bit stroke counters per paddle (bits 2-4 / 5-7 of `flags`) so a stroke lost in a gap
//   can be re-applied by the host.
const q4 = (v) => Math.max(0, Math.min(15, Math.round((v || 0) * 15)));
const q8 = (v) => Math.max(-127, Math.min(127, Math.round((v || 0) * 127)));

/** Input struct → the exact values the host will see (call before running local prediction). */
export function quantizeInput(input, out = {}) {
  out.steer = q8(input.steer) / 127;
  out.paddleL = q4(input.paddleL) / 15;
  out.paddleR = q4(input.paddleR) / 15;
  out.handbrake = q4(input.handbrake) / 15;
  out.headlight = !!input.headlight;
  out.reverse = !!input.reverse;
  out.honk = !!input.honk;
  if (input.draft !== undefined) out.draft = input.draft;
  return out;
}

/** Input struct → Float32Array frame [seq, steer, paddleL, paddleR, handbrake, flags] (quantised). */
export function encodeInputFrame(input, seq, out = new Float32Array(INPUT_STRIDE)) {
  out[0] = seq;
  out[1] = q8(input.steer) / 127;
  out[2] = q4(input.paddleL) / 15;
  out[3] = q4(input.paddleR) / 15;
  out[4] = q4(input.handbrake) / 15;
  out[5] = (input.headlight ? FLAG_HEADLIGHT : 0) | (input.reverse ? FLAG_REVERSE : 0) | (input.honk ? FLAG_HONK : 0);
  return out;
}
export function decodeInputFrame(f) {
  const flags = f[5] | 0;
  return { seq: f[0], steer: f[1], paddleL: f[2], paddleR: f[3], handbrake: f[4], headlight: !!(flags & FLAG_HEADLIGHT), reverse: !!(flags & FLAG_REVERSE), honk: !!(flags & FLAG_HONK) };
}
/** Cumulative (mod 256) stroke count of a paddle as of this frame; stored in flags bits 2-9 (L) / 10-17 (R). */
export const strokeCount = (f, side) => ((f[5] | 0) >> (side ? 10 : 2)) & 255;
export const withStrokeCounts = (f, cL, cR) => { f[5] = ((f[5] | 0) & KEEP) | ((cL & 255) << 2) | ((cR & 255) << 10); return f; };

/** One frame → u32: steer int8 | pL<<8 | pR<<12 | hb<<16 | light<<20 | reverse<<21 | honk<<22 */
function frameToU32(f) {
  const fl = f[5] | 0;
  return ((q8(f[1]) & 255) | (q4(f[2]) << 8) | (q4(f[3]) << 12) | (q4(f[4]) << 16) | ((fl & 3) << 20) | ((fl & FLAG_HONK ? 1 : 0) << 22)) >>> 0;
}
function u32ToFrame(u, seq) {
  let st = u & 255; if (st > 127) st -= 256;
  return Float32Array.of(seq, st / 127, ((u >>> 8) & 15) / 15, ((u >>> 12) & 15) / 15, ((u >>> 16) & 15) / 15, ((u >>> 20) & 3) | ((u >>> 22) & 1 ? FLAG_HONK : 0));
}

/**
 * INPUT packet v3: u8 type, u8 n, u16 newest seq (low 16 bits),
 *   u8 cumulative L strokes, u8 cumulative R strokes (as of the newest frame),
 *   then n × u32 frames for consecutive seqs, newest first → 6 + 4n bytes.
 * A stroke = a frame whose paddle impulse is > 0. Older frames' counts are derived by walking
 * back through the packet, so every decoded frame carries its exact cumulative counts and the
 * host can replay any stroke whose frames were lost, merged or dropped.
 */
export function packInputPacket(frames /* newest first, consecutive seqs */) {
  const n = Math.min(frames.length, 255);
  const buf = new ArrayBuffer(6 + n * 4);
  const dv = new DataView(buf);
  dv.setUint8(0, MSG.INPUT); dv.setUint8(1, n); dv.setUint16(2, (frames[0]?.[0] ?? 0) & 0xffff, true);
  dv.setUint8(4, frames[0] ? strokeCount(frames[0], 0) : 0); dv.setUint8(5, frames[0] ? strokeCount(frames[0], 1) : 0);
  for (let i = 0; i < n; i++) dv.setUint32(6 + i * 4, frameToU32(frames[i]), true);
  return buf;
}
/** @param refSeq a recent full seq used to unwrap the 16-bit seq (−1 if none) */
export function unpackInputPacket(buf, refSeq = -1) {
  const dv = new DataView(buf);
  const n = dv.getUint8(1), s16 = dv.getUint16(2, true);
  let cL = dv.getUint8(4), cR = dv.getUint8(5);
  let seq = s16;
  if (refSeq >= 0) { let d = (s16 - (refSeq & 0xffff)) & 0xffff; if (d >= 32768) d -= 65536; seq = refSeq + d; }
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = withStrokeCounts(u32ToFrame(dv.getUint32(6 + i * 4, true), seq - i), cL, cR);
    out.push(f);
    if (f[2] > 0) cL = (cL - 1) & 255;
    if (f[3] > 0) cR = (cR - 1) & 255;
  }
  return out;
}

export function packPing(t) { const b = new ArrayBuffer(16); const dv = new DataView(b); dv.setUint8(0, MSG.PING); dv.setFloat64(8, t, true); return b; }
export function packPong(clientT, hostT) { const b = new ArrayBuffer(24); const dv = new DataView(b); dv.setUint8(0, MSG.PONG); dv.setFloat64(8, clientT, true); dv.setFloat64(16, hostT, true); return b; }
export function msgType(buf) { return new Uint8Array(buf, 0, 1)[0]; }
