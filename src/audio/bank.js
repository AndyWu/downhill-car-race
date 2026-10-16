// Physically-modelled foley bank. Everything here is rendered ONCE at startup (a few ms of DSP) into
// AudioBuffers - no audio files, no licences, fully offline. The runtime then granulates / pitch-shifts
// these by speed & surface (see index.js).
//   gravel/dirt : many randomised impulse grains ringing through resonant modes
//   plank       : modal synthesis of a pine board (free-free beam ratios, damped modes) + thump body
//   creak       : stick-slip pulse train excited through board resonances
//   mud         : suction chirp + low-passed squelch noise
//   splash/drip : Minnaert bubble resonators (f = 3.26 / r), Poisson-decaying density
//   bolt        : inharmonic metallic modes with re-hit rattle
//   cheer       : formant-filtered crowd noise with whoops; cowbell: 808-style inharmonic modes
export const BANK_SR = 32000;
const TAU = Math.PI * 2;

function rngFrom(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mk = (sec) => new Float32Array(Math.max(1, Math.floor(sec * BANK_SR)));

function biquad(x, type, f, q) {
  const w = TAU * f / BANK_SR, al = Math.sin(w) / (2 * q), cw = Math.cos(w);
  let b0, b1, b2;
  if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; } else { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
  const a0 = 1 + al, a1 = -2 * cw / a0, a2 = (1 - al) / a0; b0 /= a0; b1 /= a0; b2 /= a0;
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
const add = (dst, src, gain = 1, off = 0) => { for (let i = 0; i < src.length && i + off < dst.length; i++) dst[i + off] += src[i] * gain; };
function mode(dst, off, f, t60, amp, ph = 0, chirp = 0) { // damped sinusoid starting at sample `off`
  const n = Math.min(dst.length - off, Math.floor(t60 * 1.2 * BANK_SR)), k = 6.9 / (t60 * BANK_SR); let phase = ph;
  for (let i = 0; i < n; i++) { dst[off + i] += amp * Math.exp(-k * i) * Math.sin(phase); phase += TAU * (f * (1 + chirp * i / BANK_SR)) / BANK_SR; }
}
function norm(x, peak = 0.9, fade = 0.004) {
  let m = 1e-6; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  const nf = Math.floor(fade * BANK_SR); for (let i = 0; i < x.length; i++) { let g = peak / m; if (i > x.length - nf) g *= (x.length - i) / nf; x[i] *= g; }
  return x;
}

function gravel(r, { fLo, fHi, grains, dur, body }) {
  const out = mk(dur);
  for (let g = 0; g < grains; g++) {
    const t0 = Math.floor(Math.pow(r(), 1.6) * dur * 0.7 * BANK_SR), a = 0.25 + 0.75 * r() * r();
    const f = fLo * Math.pow(fHi / fLo, r()), t60 = 0.004 + 0.014 * r();
    mode(out, t0, f, t60, a, r() * TAU); mode(out, t0, f * (1.3 + r() * 0.9), t60 * 0.7, a * 0.5, r() * TAU);
    if (body) mode(out, t0, 160 + r() * 260, 0.03, a * body, 0, -2); // pebble hitting packed earth
    for (let i = 0; i < 24 && t0 + i < out.length; i++) out[t0 + i] += (r() * 2 - 1) * a * 0.5 * (1 - i / 24); // contact click
  }
  return norm(out, 0.8);
}
function plank(r, f0, dur, damp = 1) {
  const out = mk(dur), ratios = [1, 2.76, 5.4, 8.93, 13.34, 18.64, 25.1], amps = [1, 0.75, 0.5, 0.36, 0.24, 0.15, 0.1], t60 = [0.34, 0.22, 0.14, 0.09, 0.06, 0.04, 0.03];
  for (let m = 0; m < ratios.length; m++) mode(out, 0, f0 * ratios[m] * (1 + (r() - 0.5) * 0.03), t60[m] * damp, amps[m] * (0.6 + 0.8 * r()), r() * TAU);
  mode(out, 0, 62 + r() * 40, 0.07 * damp, 1.4, Math.PI / 2, -1.5); // body thump
  const click = new Float32Array(Math.floor(0.004 * BANK_SR)); for (let i = 0; i < click.length; i++) click[i] = (r() * 2 - 1) * (1 - i / click.length);
  add(out, biquad(click, 'lp', 2500, 0.7), 1.2);
  return norm(out, 0.9);
}
function creak(r, dur) {
  const n = mk(dur).length, e = new Float32Array(n); let ph = 0, f = 45 + r() * 70; const df = (r() - 0.4) * 90 / n;
  for (let i = 0; i < n; i++) { f += df; ph += f / BANK_SR; if (ph >= 1) { ph -= 1; e[i] = 0.5 + r(); } const t = i / n; e[i] += (r() * 2 - 1) * 0.04; e[i] *= Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 2; }
  const out = new Float32Array(n), f1 = 330 + r() * 420;
  add(out, biquad(e, 'bp', f1, 22), 1); add(out, biquad(e, 'bp', f1 * 2.3, 28), 0.7); add(out, biquad(e, 'bp', f1 * 4.1 + r() * 400, 30), 0.4); add(out, biquad(e, 'bp', 150, 8), 0.3);
  return norm(out, 0.7, 0.03);
}
function mud(r, dur) {
  const n = mk(dur).length, noise = new Float32Array(n); for (let i = 0; i < n; i++) noise[i] = (r() * 2 - 1) * Math.exp(-i / (BANK_SR * dur * 0.35)) * Math.min(1, i / 300);
  const out = biquad(biquad(noise, 'lp', 520, 0.9), 'lp', 380, 0.8);
  const bubbles = 3 + (r() * 4 | 0);
  for (let b = 0; b < bubbles; b++) { const t0 = b === 0 ? 0 : Math.floor(r() * 0.5 * dur * BANK_SR); mode(out, t0, 90 + r() * 120, 0.09 + 0.1 * r(), 0.9 - b * 0.1, 0, 3.5 + r() * 3); } // suction pitch sweep upward
  add(out, biquad(noise, 'bp', 1400, 2), 0.12);
  return norm(out, 0.9, 0.02);
}
function splash(r, dur, bubbles, bursty = 1) {
  const out = mk(dur), n = out.length;
  const noise = new Float32Array(n); for (let i = 0; i < n; i++) noise[i] = (r() * 2 - 1) * Math.exp(-i / (BANK_SR * dur * 0.18)) * bursty;
  add(out, biquad(noise, 'bp', 1800 + r() * 800, 0.6), 0.5);
  for (let b = 0; b < bubbles; b++) {
    const t0 = Math.floor(-Math.log(1 - r() * 0.98) * 0.32 * dur * BANK_SR * (bursty ? 1 : 0.3)); if (t0 >= n) continue;
    const rad = 0.0008 * Math.pow(7, r()), f = 3.26 / rad; // Minnaert resonance (m)
    mode(out, t0, Math.min(f, 9000), 0.008 + rad * 14, rad * 700 * (0.4 + r()), r() * TAU, 18 + r() * 20);
  }
  return norm(out, 0.85, 0.05);
}
function bolt(r, hits, dur = 0.16) {
  const out = mk(dur), base = 2000 + r() * 1300; let t = 0;
  for (let h = 0; h < hits; h++) {
    const o = Math.floor(t * BANK_SR), a = 1 - h * 0.22;
    [[1, 0.035], [1.52, 0.03], [2.31, 0.022], [3.4, 0.014]].forEach(([m, t60], i) => mode(out, o, base * m * (1 + (r() - 0.5) * 0.04), t60, a / (i + 1), r() * TAU));
    t += 0.006 + r() * 0.016;
  }
  return norm(out, 0.8, 0.01);
}
function cheer(r, dur) {
  const n = mk(dur).length, noise = new Float32Array(n); for (let i = 0; i < n; i++) noise[i] = r() * 2 - 1;
  const out = new Float32Array(n);
  add(out, biquad(noise, 'bp', 700, 2.5), 1); add(out, biquad(noise, 'bp', 1150, 3), 0.8); add(out, biquad(noise, 'bp', 2600, 3), 0.35);
  // slow ragged swell like many voices, plus a few whoops
  let a = 0, b = 0; for (let i = 0; i < n; i++) { if (i % 800 === 0) { a = b; b = 0.55 + 0.45 * r(); } const k = (i % 800) / 800; out[i] *= a + (b - a) * k; }
  for (let w = 0; w < 7; w++) { const t0 = Math.floor(r() * 0.8 * n), f = 420 + r() * 380; mode(out, t0, f, 0.5 + r() * 0.6, 0.35, 0, 0.6 + r() * 0.5); }
  const loopFade = Math.floor(0.25 * BANK_SR); for (let i = 0; i < loopFade; i++) { const g = i / loopFade; out[i] *= g; out[n - 1 - i] *= g; }
  return norm(out, 0.8, 0.0);
}
function thunder(r, dur) {
  const n = mk(dur).length, noise = new Float32Array(n); for (let i = 0; i < n; i++) noise[i] = r() * 2 - 1;
  const rumble = biquad(biquad(noise, 'lp', 220 + r() * 120, 0.9), 'lp', 160, 0.7);
  const crack = biquad(noise, 'bp', 1800, 0.7);
  const out = new Float32Array(n); let bump = 0;
  const bumps = Array.from({ length: 6 }, () => [r() * 0.55 * n, 0.4 + r() * 0.6, (0.15 + r() * 0.4) * BANK_SR]);
  for (let i = 0; i < n; i++) {
    const t = i / BANK_SR; let env = Math.exp(-t / (dur * 0.33)) * Math.min(1, t * 8);
    for (const [c, a, w] of bumps) env += a * 0.5 * Math.exp(-(((i - c) / w) ** 2)) * Math.exp(-t / (dur * 0.5));
    out[i] = rumble[i] * env * 5 + (t < 0.35 ? crack[i] * Math.exp(-t / 0.08) * 0.9 : 0);
  }
  return norm(out, 0.85, 0.3);
}
function cowbell(r) {
  const out = mk(1.1);
  mode(out, 0, 562, 0.55, 1, 0); mode(out, 0, 845, 0.35, 0.85, 1); mode(out, 0, 1130, 0.18, 0.3, 2); mode(out, 0, 1690, 0.1, 0.15, 3); mode(out, 0, 2400, 0.05, 0.1, 0);
  const click = new Float32Array(100); for (let i = 0; i < 100; i++) click[i] = (r() * 2 - 1) * (1 - i / 100); add(out, biquad(click, 'bp', 3000, 1.5), 0.8);
  return norm(out, 0.85, 0.05);
}

/** Returns { name: Float32Array[] } of raw PCM at BANK_SR. */
export function renderBankPCM(seed = 1) {
  const r = rngFrom(seed), V = (n, f) => Array.from({ length: n }, f);
  return {
    gravel: V(10, () => gravel(r, { fLo: 1400, fHi: 6500, grains: 9 + (r() * 8 | 0), dur: 0.16, body: 0.3 })),
    dirt: V(10, () => gravel(r, { fLo: 380, fHi: 2600, grains: 7 + (r() * 6 | 0), dur: 0.15, body: 0.9 })),
    plank: V(6, (_, i) => plank(r, 130 + i * 32 + r() * 20, 0.7)),
    knock: V(6, (_, i) => plank(r, 520 + i * 90, 0.28, 0.45)),
    creak: V(5, () => creak(r, 0.8 + r() * 0.7)),
    mud: V(5, () => mud(r, 0.5 + r() * 0.35)),
    splash: V(3, () => splash(r, 1.1, 150, 1)),
    drip: V(6, () => splash(r, 0.3, 10 + (r() * 8 | 0), 0.4)),
    bolt: V(8, () => bolt(r, 2 + (r() * 3 | 0))),
    tick: V(5, () => bolt(r, 1, 0.07)),
    thunder: V(2, () => thunder(r, 4.5)),
    cheer: [cheer(r, 4)],
    cowbell: [cowbell(r)],
  };
}
export function renderBank(ctx, seed = 1) {
  const pcm = renderBankPCM(seed), out = {};
  for (const [k, list] of Object.entries(pcm)) out[k] = list.map((d) => { const b = ctx.createBuffer(1, d.length, BANK_SR); b.getChannelData(0).set(d); return b; });
  return out;
}
