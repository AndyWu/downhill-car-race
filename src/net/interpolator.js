// Client-side snapshot interpolation: renders remote cars ~100 ms in the past using cubic
// Hermite on position (velocities as tangents) and nlerp on rotation.
// Host tick → local time mapping is self-calibrated from arrival times over a 3 s window:
//   rate   = host ticks per wall-clock second (a slow host may simulate < 60 ticks/s),
//   offset = min(arrival − tick/rate) (lower envelope, so jitter only adds delay),
//   jitter = max(arrival − tick/rate − offset) → drives the adaptive render delay.
// Hermite tangents use simulation time (Δtick / tickRate), since velocities are per sim second.

import { SNAP_HEADER, SNAP_STRIDE } from './protocol.js';

export function createInterpolator({ delayMs = 100, tickRate = 60, maxBuffer = 48, maxExtrapolateMs = 120, adaptive = true, maxDelayMs = 220 } = {}) {
  // adaptive: render delay = max(delayMs, 1.5 snapshot intervals + observed arrival jitter), so
  // jittery hotspot links interpolate instead of extrapolating; capped at maxDelayMs.
  let jitter = 0, interval = 1 / 30, lastT = null, effDelay = delayMs / 1000;
  let rate = tickRate;             // host ticks per wall second (estimated)
  const win = [];                  // [localSec, tick] arrivals, last ~3 s
  const istats = { extrapolated: 0, samples: 0 };
  const buf = []; // { t (host seconds), data }
  let offset = null; // local seconds - host seconds (min-filtered)
  let lastSampleT = -Infinity;
  const out = new Map();
  const pending = new Map(); // id -> OR'd event bits since last sample

  function push(data, arrivalMs = performance.now()) {
    const tick = data[0];
    const local = arrivalMs / 1000;
    win.push([local, tick]);
    while (win.length > 2 && local - win[0][0] > 3) win.shift();
    // tick rate from the window (lowest-latency samples at both ends would be ideal; the 3 s
    // baseline keeps jitter error to a few %)
    // lower-envelope fit: lowest-latency arrival in each half of the window
    if (win[win.length - 1][0] - win[0][0] > 0.75) {
      const mid = win.length >> 1;
      const best = (from, to) => { let bi = from; for (let i = from; i < to; i++) if (win[i][0] - win[i][1] / tickRate < win[bi][0] - win[bi][1] / tickRate) bi = i; return win[bi]; };
      const lo = best(0, mid), hi = best(mid, win.length);
      if (hi[0] - lo[0] > 0.5 && hi[1] > lo[1]) {
        const r = Math.max(10, Math.min(120, (hi[1] - lo[1]) / (hi[0] - lo[0])));
        rate += (r - rate) * 0.1;
      }
    }
    let o = Infinity;
    for (const [l, t] of win) o = Math.min(o, l - t / rate);
    offset = o;
    let jmax = 0;
    for (const [l, t] of win) jmax = Math.max(jmax, l - t / rate - offset);
    jitter = jmax;
    const t = tick; // buffer keyed by tick
    if (lastT !== null && t > lastT) interval += (Math.min(0.2, (t - lastT) / rate) - interval) * 0.05;
    if (lastT === null || t > lastT) lastT = t;
    const want = adaptive ? Math.min(maxDelayMs / 1000, Math.max(delayMs / 1000, interval * 1.5 + jitter)) : delayMs / 1000;
    effDelay += (want - effDelay) * (want > effDelay ? 0.2 : 0.01); // grow fast, shrink slowly (no visible time warps)
    if (buf.length && t <= buf[buf.length - 1].t) {
      if (buf.some((b) => b.t === t)) return; // duplicate
      buf.push({ t, data }); buf.sort((a, b) => a.t - b.t);
    } else buf.push({ t, data });
    while (buf.length > maxBuffer) buf.shift();
    const n = data[1] | 0;
    for (let i = 0; i < n; i++) {
      const b = SNAP_HEADER + i * SNAP_STRIDE;
      const ev = data[b + 12] | 0;
      if (ev) pending.set(data[b], (pending.get(data[b]) | 0) | ev);
    }
  }

  function carState(id) {
    let c = out.get(id);
    if (!c) { c = { id, position: [0, 0, 0], quaternion: [0, 0, 0, 1], velocity: [0, 0, 0], s: 0, events: 0 }; out.set(id, c); }
    return c;
  }

  function findCar(data, id) {
    const n = data[1] | 0;
    for (let i = 0; i < n; i++) { const b = SNAP_HEADER + i * SNAP_STRIDE; if (data[b] === id) return b; }
    return -1;
  }

  /** @returns Map<id, {position, quaternion, velocity, s, events}> at render time now - delay */
  function sample(nowMs = performance.now()) {
    if (!buf.length || offset === null) return out;
    const rt = (nowMs / 1000 - offset - effDelay) * rate; // render time in host ticks
    istats.samples++;
    lastSampleT = rt;
    // locate bracketing snapshots
    let i1 = buf.findIndex((b) => b.t >= rt);
    let a, b;
    if (i1 === -1) { a = buf[buf.length - 1]; b = null; }
    else if (i1 === 0) { a = buf[0]; b = null; }
    else { a = buf[i1 - 1]; b = buf[i1]; }
    const da = a.data;
    const n = da[1] | 0;
    for (let k = 0; k < n; k++) {
      const pa = SNAP_HEADER + k * SNAP_STRIDE;
      const id = da[pa];
      const c = carState(id);
      const pb = b ? findCar(b.data, id) : -1;
      if (pb < 0) {
        if (rt > a.t) istats.extrapolated++;
        // extrapolate (or hold) from a
        const dt = Math.max(0, Math.min((rt - a.t) / tickRate, maxExtrapolateMs / 1000)); // sim seconds
        for (let j = 0; j < 3; j++) { c.position[j] = da[pa + 1 + j] + da[pa + 8 + j] * dt; c.velocity[j] = da[pa + 8 + j]; }
        for (let j = 0; j < 4; j++) c.quaternion[j] = da[pa + 4 + j];
        c.s = da[pa + 11];
      } else {
        const db = b.data;
        const span = (b.t - a.t) / tickRate; // sim seconds between the two snapshots
        const u = b.t > a.t ? (rt - a.t) / (b.t - a.t) : 1;
        const u2 = u * u, u3 = u2 * u;
        const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
        for (let j = 0; j < 3; j++) {
          const p0 = da[pa + 1 + j], p1 = db[pb + 1 + j], v0 = da[pa + 8 + j], v1 = db[pb + 8 + j];
          c.position[j] = h00 * p0 + h10 * span * v0 + h01 * p1 + h11 * span * v1;
          c.velocity[j] = v0 + (v1 - v0) * u;
        }
        let dot = 0;
        for (let j = 0; j < 4; j++) dot += da[pa + 4 + j] * db[pb + 4 + j];
        const sgn = dot < 0 ? -1 : 1;
        let len = 0;
        for (let j = 0; j < 4; j++) { const q = da[pa + 4 + j] + (sgn * db[pb + 4 + j] - da[pa + 4 + j]) * u; c.quaternion[j] = q; len += q * q; }
        len = Math.sqrt(len) || 1;
        for (let j = 0; j < 4; j++) c.quaternion[j] /= len;
        c.s = da[pa + 11] + (db[pb + 11] - da[pa + 11]) * u;
      }
      c.events = pending.get(id) | 0;
      pending.delete(id);
    }
    // drop snapshots that are entirely in the past (keep one before rt)
    while (buf.length > 2 && buf[1].t < rt) buf.shift();
    return out;
  }

  const api = {
    push, sample,
    get renderTick() { return lastSampleT; },
    get bufferedMs() { return buf.length ? ((buf[buf.length - 1].t - lastSampleT) / rate) * 1000 : 0; },
    get hostTickRate() { return rate; },
    setDelay(ms) { delayMs = ms; },
    get delayMs() { return effDelay * 1000; },
    get jitterMs() { return jitter * 1000; },
    stats: istats,
    clear() { buf.length = 0; offset = null; out.clear(); pending.clear(); jitter = 0; lastT = null; effDelay = delayMs / 1000; win.length = 0; rate = tickRate; },
  };
  if (globalThis.__NET_DEBUG) (globalThis.__netDebug ??= {}).interp = api; // test instrumentation
  return api;
}
