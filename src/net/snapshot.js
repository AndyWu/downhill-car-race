// SNAPSHOT wire format, VERSION 4 (host → clients, 30 Hz), all little-endian. Up to 16 cars
// (races use 10). v4 = v3 with a 4-bit car id in the head byte.
//
// header: u8 type(=2), u8 version(=4), u8 flags (bit0 KEYFRAME, bit1 HAS_ORIGIN), u8 count,
//         u32 tick, u8 baseAge (ticks since the keyframe that UNCHANGED cars refer to)
//         [+ f32 originX, originY, originZ, f32 scale  — only if any car uses a FULL record]
//         → 9 B (25 B when a full record is present)
// per car: u8 head = id(bits0-3) | UNCHANGED(bit4) | HAS_EVENTS(bit5) | HAS_ACK(bit6) | COMPACT(bit7)
//          events bits: SNAP_EVENTS.HONK = 1 (car honked since the last snapshot), others free
//          [u8 events] [u8 ack = input seq & 255 the host has applied for this car]
//   UNCHANGED → nothing more (same as the keyframe) ................................... 1 B
//   COMPACT   (track-relative, needs the deterministic world on both sides) ........ 11 B
//     u16 s       (step = (track.length+60)/65535 ≈ 0.05 m, offset −20 m)
//     i8  lateral (0.1 m, ±12.7 m from the centreline, horizontal right vector)
//     u8  height above ground at that x,z (0.02 m, −1 … +4.1 m)
//     i8  yaw relative to track heading, i8 pitch, i8 roll   (0.5°, ±63.5°; Euler YXZ)
//     u8  horizontal speed (0.25 m/s, ≤ 63.75 m/s)
//     i8  slip: velocity heading − body yaw (360°/256)
//     i8  vertical speed (0.1 m/s)
//   FULL      (keyframes, off-road / airborne / flipped / no world) ................. 22 B
//     3 × u24 position (origin + u·scale), u32 smallest-three quaternion (2 + 3×10 bit),
//     3 × i16 velocity (1/50 m/s), u16 s in decimetres (+100 m offset)
// The encoder decodes every COMPACT record against its own world and falls back to FULL if the
// reconstruction is off by more than 0.15 m / 1.5° / 0.8 m/s, so clients can never drift.
// Keyframes (every 10th snapshot) are all-FULL and re-anchor exact precision.
//
// Decoded snapshot exposed to game code (Float32Array, same as what the host passes in):
//   [tick, count, (id, px,py,pz, qx,qy,qz,qw, vx,vy,vz, s, events, ack, exact) × count]
//   ack = −1 when absent; exact = 1 for FULL records, 0 for COMPACT (quantised) ones.

const MSG_SNAPSHOT = 2;
export const SNAP_HEADER = 2;
export const SNAP_STRIDE = 15;
export const SNAP_VERSION = 4;
export const MAX_CARS = 16;
export const SNAP_EVENTS = { HONK: 1 };
export const SNAP_FIELDS = { id: 0, px: 1, py: 2, pz: 3, qx: 4, qy: 5, qz: 6, qw: 7, vx: 8, vy: 9, vz: 10, s: 11, events: 12, ack: 13, exact: 14 };

const F_KEY = 1, F_ORIGIN = 2;
const ID_MASK = 15, C_UNCHANGED = 16, C_EVENTS = 32, C_ACK = 64, C_COMPACT = 128;
const R = Math.SQRT1_2, U24 = 16777215;
const DEG = Math.PI / 180, ANG = 0.5 * DEG, SLIP = (2 * Math.PI) / 256;
const S_OFF = 20, LAT = 0.1, H_OFF = 1, H_STEP = 0.02, HS = 0.25, VY = 0.1;
const TOL_POS = 0.15, TOL_ANG = 1.5 * DEG, TOL_VEL = 0.8;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };

// ---------- quaternion helpers ----------
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
    out = out * 1024 + clamp(Math.round((((q[k] * sg) / n + R) / (2 * R)) * 1023), 0, 1023);
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
/** quaternion → Euler YXZ {yaw (about Y), pitch (X), roll (Z)} (three.js convention). */
function toEuler(x, y, z, w) {
  const m13 = 2 * (x * z + w * y), m23 = 2 * (y * z - w * x), m33 = 1 - 2 * (x * x + y * y);
  const m21 = 2 * (x * y + w * z), m22 = 1 - 2 * (x * x + z * z);
  const pitch = Math.asin(-clamp(m23, -1, 1));
  return { yaw: Math.atan2(m13, m33), pitch, roll: Math.atan2(m21, m22), singular: Math.abs(m23) > 0.999 };
}
function fromEuler(yaw, pitch, roll, out, o) {
  const c1 = Math.cos(pitch / 2), c2 = Math.cos(yaw / 2), c3 = Math.cos(roll / 2);
  const s1 = Math.sin(pitch / 2), s2 = Math.sin(yaw / 2), s3 = Math.sin(roll / 2);
  out[o] = s1 * c2 * c3 + c1 * s2 * s3;
  out[o + 1] = c1 * s2 * c3 - s1 * c2 * s3;
  out[o + 2] = c1 * c2 * s3 - s1 * s2 * c3;
  out[o + 3] = c1 * c2 * c3 + s1 * s2 * s3;
}

// ---------- world access ----------
function resolveWorld(w) {
  const world = typeof w === 'function' ? w() : w || globalThis.__game?.world;
  return world && world.track && typeof world.track.sampleAt === 'function' && typeof world.heightAt === 'function' ? world : null;
}
const sStep = (world) => ((world.track.length || 3218) + 60) / 65535;
function frame(world, s) {
  const smp = world.track.sampleAt(s);
  const rl = Math.hypot(smp.right.x, smp.right.z) || 1;
  return { cx: smp.position.x, cz: smp.position.z, rx: smp.right.x / rl, rz: smp.right.z / rl, trackYaw: Math.atan2(-smp.tangent.x, -smp.tangent.z) };
}

/** Rebuild a car record (fields 1..11) from compact bytes; returns false if impossible. */
function decodeCompact(world, dv, o, out, b) {
  const step = sStep(world);
  const s = dv.getUint16(o, true) * step - S_OFF;
  const lat = dv.getInt8(o + 2) * LAT;
  const h = dv.getUint8(o + 3) * H_STEP - H_OFF;
  const f = frame(world, s);
  const x = f.cx + f.rx * lat, z = f.cz + f.rz * lat;
  const y = world.heightAt(x, z) + h;
  const yaw = f.trackYaw + dv.getInt8(o + 4) * ANG, pitch = dv.getInt8(o + 5) * ANG, roll = dv.getInt8(o + 6) * ANG;
  const hs = dv.getUint8(o + 7) * HS, vh = yaw + dv.getInt8(o + 8) * SLIP, vy = dv.getInt8(o + 9) * VY;
  out[b + 1] = x; out[b + 2] = y; out[b + 3] = z;
  fromEuler(yaw, pitch, roll, out, b + 4);
  out[b + 8] = -Math.sin(vh) * hs; out[b + 9] = vy; out[b + 10] = -Math.cos(vh) * hs;
  out[b + 11] = s;
  return true;
}

/** Try to write a compact record for car at snap[b..]; returns bytes written or 0 if it must be FULL. */
function encodeCompact(world, snap, b, dv, o, check) {
  const step = sStep(world);
  const px = snap[b + 1], py = snap[b + 2], pz = snap[b + 3];
  let sq = Math.round((snap[b + 11] + S_OFF) / step);
  if (!(sq >= 0 && sq <= 65535)) return 0;
  let f = frame(world, sq * step - S_OFF);
  // refine s so the car sits on the normal of the centreline (s from physics may be approximate)
  for (let it = 0; it < 2; it++) {
    const along = (px - f.cx) * f.rz - (pz - f.cz) * f.rx; // horizontal tangent = (rz, -rx)
    if (Math.abs(along) < step * 0.5) break;
    sq = Math.round((sq * step - S_OFF + along + S_OFF) / step);
    if (!(sq >= 0 && sq <= 65535)) return 0;
    f = frame(world, sq * step - S_OFF);
  }
  const lq = Math.round(((px - f.cx) * f.rx + (pz - f.cz) * f.rz) / LAT);
  if (lq < -127 || lq > 127) return 0;
  const gx = f.cx + f.rx * lq * LAT, gz = f.cz + f.rz * lq * LAT;
  const hq = Math.round((py - world.heightAt(gx, gz) + H_OFF) / H_STEP);
  if (hq < 0 || hq > 255) return 0;
  const e = toEuler(snap[b + 4], snap[b + 5], snap[b + 6], snap[b + 7]);
  if (e.singular) return 0;
  const yq = Math.round(wrap(e.yaw - f.trackYaw) / ANG), pq = Math.round(e.pitch / ANG), rq = Math.round(e.roll / ANG);
  if (Math.abs(yq) > 127 || Math.abs(pq) > 127 || Math.abs(rq) > 127) return 0;
  const vx = snap[b + 8], vy = snap[b + 9], vz = snap[b + 10];
  const hsq = Math.round(Math.hypot(vx, vz) / HS);
  const vyq = Math.round(vy / VY);
  if (hsq > 255 || Math.abs(vyq) > 127) return 0;
  const yawQ = f.trackYaw + yq * ANG;
  let slq = hsq ? Math.round(wrap(Math.atan2(-vx, -vz) - yawQ) / SLIP) : 0;
  if (slq > 127) slq -= 256;
  dv.setUint16(o, sq, true); dv.setInt8(o + 2, lq); dv.setUint8(o + 3, hq);
  dv.setInt8(o + 4, yq); dv.setInt8(o + 5, pq); dv.setInt8(o + 6, rq);
  dv.setUint8(o + 7, hsq); dv.setInt8(o + 8, slq); dv.setInt8(o + 9, vyq);
  // self-check: reconstruct exactly as a client would
  decodeCompact(world, dv, o, check, 0);
  const dp = Math.hypot(check[1] - px, check[2] - py, check[3] - pz);
  let dot = 0; for (let k = 0; k < 4; k++) dot += check[4 + k] * snap[b + 4 + k];
  const da = 2 * Math.acos(Math.min(1, Math.abs(dot) / (Math.hypot(snap[b + 4], snap[b + 5], snap[b + 6], snap[b + 7]) || 1)));
  const dvv = Math.hypot(check[8] - vx, check[9] - vy, check[10] - vz);
  if (!(dp < TOL_POS && da < TOL_ANG && dvv < TOL_VEL)) return 0;
  return 10;
}

function sameAsBase(snap, b, base) {
  if (!base) return false;
  if ((snap[b + 12] | 0) !== 0) return false;
  for (let k = 1; k <= 3; k++) if (Math.abs(snap[b + k] - base[k]) > 0.002) return false;
  for (let k = 8; k <= 10; k++) if (Math.abs(snap[b + k] - base[k]) > 0.02) return false;
  if (Math.abs(snap[b + 11] - base[11]) > 0.05) return false;
  let dot = 0; for (let k = 4; k <= 7; k++) dot += snap[b + k] * base[k];
  return Math.abs(dot) > 0.99999;
}

const CAR_MAX = 1 + 2 + 21;

/**
 * Stateful host-side encoder.
 * @param {{keyframeEvery?:number, world?:object|(()=>object), compact?:boolean}} o
 *   world: the deterministic scene world (track.sampleAt, heightAt). Defaults to window.__game.world.
 */
export function createSnapshotEncoder({ keyframeEvery = 10, world, compact = true } = {}) {
  let sinceKey = Infinity, keyTick = 0;
  const base = new Map();
  const scratch = new Uint8Array(25 + MAX_CARS * CAR_MAX);
  const carBuf = new Uint8Array(MAX_CARS * CAR_MAX);
  const check = new Float32Array(SNAP_STRIDE);
  const stats = { full: 0, compact: 0, unchanged: 0 };
  return {
    stats,
    encode(snap, acks) {
      const tick = snap[0] >>> 0;
      const count = Math.min(snap[1] | 0, MAX_CARS);
      const key = sinceKey >= keyframeEvery - 1 || tick - keyTick > 255;
      if (key) { sinceKey = 0; keyTick = tick; base.clear(); } else sinceKey++;
      const w = compact && !key ? resolveWorld(world) : null;
      // pass 1: classify + write car bodies into carBuf (full records need origin/scale → pass 2)
      const kinds = new Array(count);
      const cdv = new DataView(carBuf.buffer);
      const compactAt = new Array(count);
      let co = 0, anyFull = false;
      for (let i = 0; i < count; i++) {
        const b = SNAP_HEADER + i * SNAP_STRIDE;
        const id = snap[b] & ID_MASK;
        if (!key && sameAsBase(snap, b, base.get(id))) { kinds[i] = 'u'; continue; }
        const n = w ? encodeCompact(w, snap, b, cdv, co, check) : 0;
        if (n) { kinds[i] = 'c'; compactAt[i] = co; co += n; } else { kinds[i] = 'f'; anyFull = true; }
      }
      let mn = [0, 0, 0], scale = 1;
      if (anyFull) {
        mn = [Infinity, Infinity, Infinity]; const mx = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < count; i++) {
          if (kinds[i] !== 'f') continue;
          const b = SNAP_HEADER + i * SNAP_STRIDE;
          for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], snap[b + 1 + k]); mx[k] = Math.max(mx[k], snap[b + 1 + k]); }
        }
        mn = mn.map((v) => Math.fround(Math.floor(v)));
        const range = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2], 1);
        scale = Math.fround(Math.max(range / U24, 1e-4) * 1.0001);
      }
      const dv = new DataView(scratch.buffer);
      dv.setUint8(0, MSG_SNAPSHOT); dv.setUint8(1, SNAP_VERSION); dv.setUint8(2, (key ? F_KEY : 0) | (anyFull ? F_ORIGIN : 0)); dv.setUint8(3, count);
      dv.setUint32(4, tick, true); dv.setUint8(8, key ? 0 : tick - keyTick);
      let o = 9;
      if (anyFull) { dv.setFloat32(9, mn[0], true); dv.setFloat32(13, mn[1], true); dv.setFloat32(17, mn[2], true); dv.setFloat32(21, scale, true); o = 25; }
      for (let i = 0; i < count; i++) {
        const b = SNAP_HEADER + i * SNAP_STRIDE;
        const id = snap[b] & ID_MASK;
        const ev = snap[b + 12] & 255;
        const ack = acks && acks.has(id) ? acks.get(id) & 255 : -1;
        const k = kinds[i];
        dv.setUint8(o++, id | (k === 'u' ? C_UNCHANGED : 0) | (k === 'c' ? C_COMPACT : 0) | (ev ? C_EVENTS : 0) | (ack >= 0 ? C_ACK : 0));
        if (ev) dv.setUint8(o++, ev);
        if (ack >= 0) dv.setUint8(o++, ack);
        if (k === 'u') { stats.unchanged++; continue; }
        if (k === 'c') { scratch.set(carBuf.subarray(compactAt[i], compactAt[i] + 10), o); o += 10; stats.compact++; continue; }
        stats.full++;
        const pu = [0, 1, 2].map((a) => clamp(Math.round((snap[b + 1 + a] - mn[a]) / scale), 0, U24));
        pu.forEach((v, a) => { dv.setUint16(o + a * 3, v & 0xffff, true); dv.setUint8(o + a * 3 + 2, v >>> 16); }); o += 9;
        const qu = packQuat(snap[b + 4], snap[b + 5], snap[b + 6], snap[b + 7]);
        dv.setUint32(o, qu, true); o += 4;
        const vq = [0, 1, 2].map((a) => clamp(Math.round(snap[b + 8 + a] * 50), -32767, 32767));
        vq.forEach((v) => { dv.setInt16(o, v, true); o += 2; });
        const su = clamp(Math.round((snap[b + 11] + 100) * 10), 0, 65535);
        dv.setUint16(o, su, true); o += 2;
        if (key) {
          const d = new Float32Array(SNAP_STRIDE);
          d[0] = id; for (let a = 0; a < 3; a++) d[1 + a] = mn[a] + pu[a] * scale;
          unpackQuat(qu, d, 4);
          for (let a = 0; a < 3; a++) d[8 + a] = vq[a] / 50;
          d[11] = su / 10 - 100; d[13] = -1; d[14] = 1;
          base.set(id, d);
        }
      }
      return scratch.slice(0, o).buffer;
    },
  };
}

/** Stateful client-side decoder. decode(buf) → { tick, keyframe, data }. Cars that cannot be rebuilt are omitted. */
export function createSnapshotDecoder({ world } = {}) {
  let keyTick = -1;
  const base = new Map();
  return {
    decode(buf) {
      const dv = new DataView(buf);
      const ver = dv.getUint8(1);
      if (ver !== SNAP_VERSION) throw new Error('snapshot version ' + ver);
      const flags = dv.getUint8(2), key = flags & F_KEY, count = dv.getUint8(3), tick = dv.getUint32(4, true), age = dv.getUint8(8);
      let o = 9, org = [0, 0, 0], scale = 1;
      if (flags & F_ORIGIN) { org = [dv.getFloat32(9, true), dv.getFloat32(13, true), dv.getFloat32(17, true)]; scale = dv.getFloat32(21, true); o = 25; }
      const haveBase = !key && keyTick === tick - age;
      if (key && tick > keyTick) { keyTick = tick; base.clear(); }
      const w = resolveWorld(world);
      const out = new Float32Array(SNAP_HEADER + count * SNAP_STRIDE);
      let n = 0;
      for (let i = 0; i < count; i++) {
        const head = dv.getUint8(o++);
        const id = head & ID_MASK;
        const ev = head & C_EVENTS ? dv.getUint8(o++) : 0;
        const ack = head & C_ACK ? dv.getUint8(o++) : -1;
        const b = SNAP_HEADER + n * SNAP_STRIDE;
        if (head & C_UNCHANGED) {
          const bs = haveBase && base.get(id);
          if (!bs) continue;
          out.set(bs, b);
        } else if (head & C_COMPACT) {
          const at = o; o += 10;
          if (!w) continue;
          decodeCompact(w, dv, at, out, b);
          out[b + 14] = 0;
        } else {
          for (let k = 0; k < 3; k++) out[b + 1 + k] = org[k] + (dv.getUint16(o + k * 3, true) | (dv.getUint8(o + k * 3 + 2) << 16)) * scale;
          o += 9;
          unpackQuat(dv.getUint32(o, true), out, b + 4); o += 4;
          for (let k = 0; k < 3; k++) { out[b + 8 + k] = dv.getInt16(o, true) / 50; o += 2; }
          out[b + 11] = dv.getUint16(o, true) / 10 - 100; o += 2;
          out[b + 14] = 1;
          if (key && tick === keyTick) { const d = out.slice(b, b + SNAP_STRIDE); d[0] = id; d[12] = 0; d[13] = -1; base.set(id, d); }
        }
        out[b] = id; out[b + 12] = ev; out[b + 13] = ack;
        n++;
      }
      out[0] = tick; out[1] = n;
      return { tick, keyframe: !!key, data: n === count ? out : out.slice(0, SNAP_HEADER + n * SNAP_STRIDE) };
    },
  };
}

/** Stateless convenience (always a keyframe → FULL records). */
export function packSnapshot(snap, acks) { return createSnapshotEncoder({ keyframeEvery: 0 }).encode(snap, acks); }
export function unpackSnapshot(buf) { return createSnapshotDecoder().decode(buf); }
