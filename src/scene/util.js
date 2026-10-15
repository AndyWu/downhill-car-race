// Small deterministic helpers shared across the scene module.
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
export function ihash(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
/** Seeded value noise, output in [-1,1]. */
export class Noise {
  constructor(seed) { this.seed = seed | 0; }
  n1(x) {
    const xi = Math.floor(x), f = fade(x - xi);
    const a = ihash(xi, 0, this.seed) * 2 - 1, b = ihash(xi + 1, 0, this.seed) * 2 - 1;
    return a + (b - a) * f;
  }
  n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = fade(x - xi), fy = fade(y - yi), s = this.seed;
    const a = ihash(xi, yi, s), b = ihash(xi + 1, yi, s), c = ihash(xi, yi + 1, s), d = ihash(xi + 1, yi + 1, s);
    return ((a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy) * 2 - 1;
  }
  fbm2(x, y, oct = 3) {
    let a = 1, f = 1, sum = 0, n = 0;
    for (let i = 0; i < oct; i++) { sum += a * this.n2(x * f, y * f); n += a; a *= 0.5; f *= 2.03; }
    return sum / n;
  }
}
