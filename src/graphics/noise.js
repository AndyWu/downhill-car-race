// Tileable (periodic) noise helpers for procedural texture baking. Pure JS, no DOM.
export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((seed | 0) + 1, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const mod = (a, n) => ((a % n) + n) % n;
const sm = (t) => t * t * (3 - 2 * t);
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const mix = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Periodic value noise; (x,y) in lattice units, period (px,py) integers. 0..1 */
export function vnoise(x, y, px, py, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  let x0 = xi % px, y0 = yi % py;
  if (x0 < 0) x0 += px; if (y0 < 0) y0 += py;
  const x1 = x0 + 1 === px ? 0 : x0 + 1, y1 = y0 + 1 === py ? 0 : y0 + 1;
  const sd = Math.imul(seed + 1, 1274126177);
  const a = hs(x0, y0, sd), b = hs(x1, y0, sd), c = hs(x0, y1, sd), d = hs(x1, y1, sd);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function hs(x, y, sd) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ sd;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) * 2.3283064365386963e-10;
}

/** Periodic fBm over u,v in [0,1). fx,fy base lattice frequency (integers). 0..1 */
export function fbm(u, v, fx, fy, oct = 4, seed = 0, gain = 0.5) {
  let sum = 0, amp = 0.5, norm = 0, ax = fx, ay = fy;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(u * ax, v * ay, ax, ay, seed + o * 17);
    norm += amp; amp *= gain; ax *= 2; ay *= 2;
  }
  return sum / norm;
}

/** Periodic worley. returns out={f1,f2,id,dx,dy} distances in cell units. */
export function worley(u, v, f, seed, out) {
  const x = u * f, y = v * f;
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0, bx = 0, by = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j;
    const wx = mod(cx, f), wy = mod(cy, f);
    const px = cx + hash2(wx, wy, seed), py = cy + hash2(wx, wy, seed + 91);
    const dx = px - x, dy = py - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < f1) { f2 = f1; f1 = d; id = hash2(wx, wy, seed + 7); bx = dx; by = dy; }
    else if (d < f2) f2 = d;
  }
  out.f1 = f1; out.f2 = f2; out.id = id; out.dx = bx; out.dy = by;
  return out;
}

/** deterministic PRNG */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
