// Seeded PRNG (mulberry32). createRng(seed) returns a function () => [0,1) with helpers.
export function createRng(seed = 1) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.seed = seed;
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.normal = () => normal(f);
  f.fork = (salt = 0) => createRng((Math.floor(f() * 4294967296) ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0);
  return f;
}

/** Standard normal from any () => [0,1) source (Box-Muller, always consumes 2 draws -> deterministic). */
export function normal(rng) {
  const u = Math.max(1e-12, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
