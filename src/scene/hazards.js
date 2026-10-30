// Deterministic hazard zones along the road + surface property table.
import { mulberry32, Noise, clamp, smoothstep } from './util.js';

export const SURFACES = {
  dirt:   { friction: 0.85, drag: 0.0,  bump: 0.12 },
  grass:  { friction: 0.58, drag: 0.60, bump: 0.30 },
  gravel: { friction: 0.66, drag: 0.12, bump: 0.35 },
  sand:   { friction: 0.55, drag: 0.45, bump: 0.15 },
  mud:    { friction: 0.38, drag: 1.00, bump: 0.25 },
  water:  { friction: 0.48, drag: 0.28, bump: 0.06 },
  cobble: { friction: 0.78, drag: 0.02, bump: 0.28 },
  asphalt: { friction: 1.0, drag: 0.0, bump: 0.02 },
  corn:   { friction: 0.4, drag: 1.2, bump: 0.55 },
  wall:   { friction: 0.3, drag: 1.4, bump: 0.5 },
  rock:   { friction: 0.80, drag: 0.05, bump: 0.85 },
};

// kind -> surface type, vertical effect
const KINDS = {
  puddle:  { type: 'water', dip: 0.09, bumpAmp: 0, friction: 0.5, drag: 0.22, bump: 0.05 },
  rutpool: { type: 'water', dip: 0.07, bumpAmp: 0, friction: 0.52, drag: 0.2, bump: 0.05 },
  stream:  { type: 'water', dip: 0.36, bumpAmp: 0.006, friction: 0.42, drag: 0.34, bump: 0.2 },
  mud:     { type: 'mud',   dip: 0.10, bumpAmp: 0.01, friction: 0.36, drag: 1.0, bump: 0.25 },
  gravel:  { type: 'gravel', dip: 0, bumpAmp: 0.02, friction: 0.68, drag: 0.1, bump: 0.2 },
  stall:   { type: 'rock', dip: 0, bumpAmp: 0, friction: 0.7, drag: 0.1, bump: 0.35 },
  steps:   { type: 'rock', dip: 0, bumpAmp: 0, friction: 0.7, drag: 0.04, bump: 0.7 },
  rock:    { type: 'rock',  dip: 0, bumpAmp: 0.085, friction: 0.8, drag: 0.05, bump: 0.85 },
  sand:    { type: 'sand',  dip: 0.02, bumpAmp: 0.008, friction: 0.55, drag: 0.45, bump: 0.15 },
};
const WETKIND = { puddle: 1, rutpool: 1, stream: 1, mud: 1 };

export function createHazardField(track, seed = 1, opts = {}) {
  const rng = mulberry32(seed * 4421 + 99);
  const nz = new Noise(seed * 13 + 5);
  const L = track.length;
  const zones = [];
  const pp = {};
  const order = opts.order || ['puddle', 'mud', 'rutpool', 'gravel', 'stream', 'rock', 'rutpool', 'sand', 'puddle', 'stream', 'mud', 'rock', 'rutpool', 'sand', 'gravel', 'stream'];
  let s = (opts.start ?? 110) + rng() * (opts.startJit ?? 25), last = '', oi = 0, streamIdx = 0;
  while (s < L - (opts.endGap ?? 100)) {
    let kind = order[(oi++ + Math.floor(rng() * 2)) % order.length];
    if (kind === last) kind = order[(oi++) % order.length];
    last = kind;
    track.atS(s, pp);
    const hw = pp.hw;
    const sgn = rng() < 0.5 ? -1 : 1;
    const z = { kind, s, lateral: 0, a: 3, b: 2, skew: 0, hw, seed: Math.floor(rng() * 1000), bridge: false, stones: null, ...KINDS[kind] };
    z.type = KINDS[kind].type;
    switch (kind) {
      case 'puddle': z.a = 2.6 + rng() * 3.5; z.b = 1.2 + rng() * 1.3; z.lateral = sgn * rng() * (hw - 1.8); break;
      case 'rutpool': z.a = 4 + rng() * 6; z.b = 0.45; z.lateral = sgn * (0.95 + 0.12 * rng()); break;
      case 'stream': {
        z.a = 2.7 + rng() * 0.6; z.b = hw + 6.4; z.lateral = 0;
        const idx = streamIdx++;
        if (idx % 3 === 1) { z.bridge = true; z.skew = 0; }
        else {
          z.skew = (rng() - 0.5) * 0.7;
          if (idx % 3 === 2) {
            z.stones = [];
            for (let i = 0; i < 12; i++) z.stones.push({ s: z.s + (rng() - 0.5) * z.a * 1.5, d: (rng() - 0.5) * 2 * (hw - 0.3), r: 0.28 + rng() * 0.3, h: 0.14 + rng() * 0.16 });
          }
        }
        break;
      }
      case 'mud':
        if (rng() < 0.2) { z.a = 6 + rng() * 4; z.b = hw + 0.4; z.lateral = 0; }
        else { z.a = 7 + rng() * 9; z.b = 1.6 + rng() * 1.3; z.lateral = sgn * (rng() * Math.max(0.1, hw - z.b - 0.2)); }
        break;
      case 'gravel': z.a = 12 + rng() * 18; z.b = rng() < 0.5 ? hw + 0.3 : 2.2 + rng() * 1.4; z.lateral = z.b > hw ? 0 : sgn * rng() * (hw - z.b); break;
      case 'rock': z.a = 5 + rng() * 5; z.b = 1.6 + rng() * 1.2; z.lateral = sgn * rng() * (hw - z.b); break;
      case 'stall': {
        z.a = 4 + rng() * 3; z.b = hw; z.lateral = 0; z.obstacles = [];
        const n = 3 + Math.floor(rng() * 2);
        for (let i = 0; i < n; i++) z.obstacles.push({ s: z.s + (i - (n - 1) / 2) * 2.6, d: (i % 2 ? 1 : -1) * hw * (0.45 + rng() * 0.15), r: 0.85 + rng() * 0.25, h: 1.1 });
        break;
      }
      case 'steps': z.a = 3 + rng() * 3; z.b = hw + 0.3; z.lateral = 0; z.stairs = true; break;
      case 'sand': z.a = 8 + rng() * 12; z.b = 2.0 + rng() * 1.6; z.lateral = sgn * rng() * (hw - z.b + 0.5); break;
    }
    zones.push(z);
    s += z.a * 1.5 + (opts.gap1 ?? 38) + rng() * (opts.gap2 ?? 50);
  }

  // buckets by s (50 m)
  const BS = 50, buckets = [];
  const nb = Math.ceil((L + 200) / BS) + 2;
  for (let i = 0; i < nb; i++) buckets.push([]);
  for (const z of zones) {
    const ext = z.a * 2.3 + Math.abs(z.skew) * z.b + 2;
    for (let b = Math.floor((z.s - ext + 100) / BS); b <= Math.floor((z.s + ext + 100) / BS); b++) if (buckets[b]) buckets[b].push(z);
  }

  function weight(z, s, d, k = 1) {
    const dd = d - z.lateral, ds = (s - z.s) - z.skew * dd;
    if (z.kind === 'stream') {
      const along = 1 - smoothstep(0.5, 1.0, Math.abs(ds) / (z.a * k));
      if (along <= 0) return 0;
      return along * (1 - smoothstep(0.72, 1.0, Math.abs(dd) / (z.b * (k > 1 ? 1 : 1))));
    }
    let r = Math.sqrt((ds * ds) / (z.a * z.a * k * k) + (dd * dd) / (z.b * z.b * k * k));
    if (r > 1.35) return 0;
    r *= 1 + 0.2 * nz.n2(s * 0.45 + z.seed, d * 0.7);
    return 1 - smoothstep(0.55, 1.0, r);
  }
  const ripple = (s) => { const ph = (s / 0.3) % 1; return ph > 0.86 ? -0.012 : 0.026; };

  /** o <- { zone, w, lift, cut } ; lift = vertical displacement (m, +up) from non-stream zones, cut = stream depth (m, subtract) */
  function query(s, d, o) {
    o.zone = null; o.w = 0; o.lift = 0; o.cut = 0;
    const b = buckets[Math.floor((s + 100) / BS)];
    if (!b) return o;
    for (let i = 0; i < b.length; i++) {
      const z = b[i], w = weight(z, s, d);
      if (z.obstacles) for (const ob of z.obstacles) { const dd = Math.hypot(s - ob.s, d - ob.d); if (dd < ob.r) o.lift += ob.h * (1 - smoothstep(0.82, 1, dd / ob.r)); }
      if (w <= 0) continue;
      if (w > o.w) { o.w = w; o.zone = z; }
      if (z.kind === 'stream') {
        if (z.bridge) {
          const m = 1 - smoothstep(z.hw - 0.7, z.hw - 0.2, Math.abs(d));
          o.cut += w * z.dip * (1 - m);
          o.lift += m * smoothstep(0.3, 0.7, w) * ripple(s);
        } else {
          o.cut += w * z.dip;
          if (z.stones) for (const st of z.stones) { const dd = Math.hypot(s - st.s, d - st.d); if (dd < st.r) o.lift += st.h * (1 - smoothstep(0.35, 1, dd / st.r)); }
        }
      } else if (z.stairs) { o.lift += w * 0.1 * (Math.sin(s * 3.4) > 0.2 ? 1 : 0); }
      else o.lift += w * (-z.dip + z.bumpAmp * (0.6 * nz.n2(s * 1.7 + z.seed, d * 2.1) + 0.4 * nz.n2(s * 4.3, d * 5.1)));
    }
    return o;
  }
  /** wetness 0..1 (dark damp ring around puddles / streams / mud) */
  function wet(s, d) {
    const b = buckets[Math.floor((s + 100) / BS)];
    if (!b) return 0;
    let m = 0;
    for (let i = 0; i < b.length; i++) {
      const z = b[i]; if (!WETKIND[z.kind]) continue;
      const w = weight(z, s, d, z.kind === 'stream' ? 2.2 : 2.7);
      if (w > m) m = w;
    }
    return m;
  }

  const hazards = zones.map((z) => ({
    type: z.type, kind: z.kind, s: z.s, lateral: z.lateral,
    radius: z.kind === 'rutpool' ? 1.2 : Math.min(Math.max(z.a, z.b), 8), halfLength: z.a, halfWidth: z.b, bridge: z.bridge,
  }));
  return { zones, hazards, query, weight, wet };
}
