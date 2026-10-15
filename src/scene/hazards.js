// Deterministic hazard zones along the road + surface property table.
import { mulberry32, Noise, clamp, smoothstep } from './util.js';

export const SURFACES = {
  dirt:   { friction: 0.85, drag: 0.0,  bump: 0.12 },
  grass:  { friction: 0.62, drag: 0.30, bump: 0.22 },
  gravel: { friction: 0.66, drag: 0.12, bump: 0.35 },
  sand:   { friction: 0.55, drag: 0.45, bump: 0.15 },
  mud:    { friction: 0.38, drag: 1.00, bump: 0.25 },
  water:  { friction: 0.48, drag: 0.28, bump: 0.06 },
  rock:   { friction: 0.80, drag: 0.05, bump: 0.85 },
};

// kind -> surface type, vertical effect
const KINDS = {
  puddle: { type: 'water', dip: 0.05, bumpAmp: 0, friction: 0.5, drag: 0.22, bump: 0.05 },
  stream: { type: 'water', dip: 0.15, bumpAmp: 0.01, friction: 0.42, drag: 0.34, bump: 0.12 },
  mud:    { type: 'mud',   dip: 0.10, bumpAmp: 0.01, friction: 0.36, drag: 1.0, bump: 0.25 },
  gravel: { type: 'gravel', dip: 0, bumpAmp: 0.025, friction: 0.66, drag: 0.12, bump: 0.35 },
  rock:   { type: 'rock',  dip: 0, bumpAmp: 0.085, friction: 0.8, drag: 0.05, bump: 0.85 },
  sand:   { type: 'sand',  dip: 0.02, bumpAmp: 0.008, friction: 0.55, drag: 0.45, bump: 0.15 },
};

export function createHazardField(track, seed = 1) {
  const rng = mulberry32(seed * 4421 + 99);
  const nz = new Noise(seed * 13 + 5);
  const L = track.length;
  const zones = [];
  const pp = {};
  const order = ['puddle', 'mud', 'gravel', 'stream', 'rock', 'sand', 'puddle', 'mud', 'rock', 'sand', 'gravel', 'stream'];
  let s = 85 + rng() * 25, last = '', oi = 0;
  while (s < L - 70) {
    let kind = order[(oi++ + Math.floor(rng() * 3)) % order.length];
    if (kind === last) kind = order[(oi++) % order.length];
    last = kind;
    track.atS(s, pp);
    const hw = pp.hw;
    const sgn = rng() < 0.5 ? -1 : 1;
    const z = { kind, s, lateral: 0, a: 3, b: 2, skew: 0, seed: Math.floor(rng() * 1000), ...KINDS[kind] };
    z.type = KINDS[kind].type;
    switch (kind) {
      case 'puddle': z.a = 2.5 + rng() * 3.5; z.b = 1.1 + rng() * 1.3; z.lateral = sgn * rng() * (hw - 1.8); break;
      case 'stream': z.a = 1.3 + rng() * 0.6; z.b = hw + 2.8; z.lateral = 0; z.skew = (rng() - 0.5) * 0.9; break;
      case 'mud':
        if (rng() < 0.2) { z.a = 6 + rng() * 4; z.b = hw + 0.4; z.lateral = 0; }
        else { z.a = 7 + rng() * 9; z.b = 1.6 + rng() * 1.3; z.lateral = sgn * (rng() * Math.max(0.1, hw - z.b - 0.2)); }
        break;
      case 'gravel': z.a = 12 + rng() * 18; z.b = rng() < 0.5 ? hw + 0.3 : 2.2 + rng() * 1.4; z.lateral = z.b > hw ? 0 : sgn * rng() * (hw - z.b); break;
      case 'rock': z.a = 5 + rng() * 5; z.b = 1.6 + rng() * 1.2; z.lateral = sgn * rng() * (hw - z.b); break;
      case 'sand': z.a = 8 + rng() * 12; z.b = 2.0 + rng() * 1.6; z.lateral = sgn * rng() * (hw - z.b + 0.5); break;
    }
    zones.push(z);
    s += z.a * 1.5 + 40 + rng() * 55;
  }

  // buckets by s (50 m)
  const BS = 50, buckets = [];
  const nb = Math.ceil((L + 200) / BS) + 2;
  for (let i = 0; i < nb; i++) buckets.push([]);
  for (const z of zones) {
    const ext = z.a * 1.3 + Math.abs(z.skew) * z.b + 2;
    for (let b = Math.floor((z.s - ext + 100) / BS); b <= Math.floor((z.s + ext + 100) / BS); b++) if (buckets[b]) buckets[b].push(z);
  }

  function weight(z, s, d) {
    const ds = (s - z.s) - z.skew * (d - z.lateral), dd = d - z.lateral;
    let r = Math.sqrt((ds * ds) / (z.a * z.a) + (dd * dd) / (z.b * z.b));
    if (r > 1.35) return 0;
    r *= 1 + 0.2 * nz.n2(s * 0.45 + z.seed, d * 0.7);
    return 1 - smoothstep(0.55, 1.0, r);
  }

  /** o <- { zone, w, lift } where lift = vertical road displacement from hazards (m) */
  function query(s, d, o) {
    o.zone = null; o.w = 0; o.lift = 0;
    const b = buckets[Math.floor((s + 100) / BS)];
    if (!b) return o;
    for (let i = 0; i < b.length; i++) {
      const z = b[i], w = weight(z, s, d);
      if (w <= 0) continue;
      if (w > o.w) { o.w = w; o.zone = z; }
      o.lift += w * (-z.dip + z.bumpAmp * (0.6 * nz.n2(s * 1.7 + z.seed, d * 2.1) + 0.4 * nz.n2(s * 4.3, d * 5.1)));
    }
    return o;
  }

  const hazards = zones.map((z) => ({
    type: z.type, kind: z.kind, s: z.s, lateral: z.lateral,
    radius: Math.min(Math.max(z.a, z.b), 8), halfLength: z.a, halfWidth: z.b,
  }));
  return { zones, hazards, query, weight };
}
