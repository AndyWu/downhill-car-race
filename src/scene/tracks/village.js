// Hill Village: gentle cobbled main street with 3 splits (market square / riverside lane / back alley), buildings, church, fountain.
import * as THREE from 'three';
import { mulberry32, clamp, smoothstep, lerp } from '../util.js';
import { makeRoad, buildNetwork } from '../roadnet.js';
import { createHazardField, SURFACES } from '../hazards.js';
import { Batch, boxG, cylG, sphG, prismG, xf } from '../batch.js';
import { bannerTexture } from '../materials.js';
import { scatterTrees } from './scatter.js';
import { createRegistry } from './registry.js';
import { G } from '../../graphics/shared.js';

const PRE = 40, POST = 70, LEN = 3218;
const SPLITS = [
  { id: 1, fromS: 500, toS: 740, paths: [{ name: 'Market Square', width: 11, kind: 'market', note: 'Wide and straight but full of stalls and carts' }, { name: 'Back Alley', width: 3.2, kind: 'alley', note: 'Shortest, steep and tight, with steps and loose cobbles' }] },
  { id: 2, fromS: 1450, toS: 1700, paths: [{ name: 'Riverside Lane', width: 5.4, kind: 'river', note: 'Longer but smooth and open' }, { name: 'Back Alley', width: 3.4, kind: 'alley', note: 'Shortest, steep and tight, with steps' }] },
  { id: 3, fromS: 2400, toS: 2660, paths: [{ name: 'Market Square', width: 10, kind: 'market', note: 'Busy market with carts' }, { name: 'Riverside Lane', width: 5, kind: 'river', note: 'Long smooth lane' }] },
];
const MAIN_W = 6.2;

function mainPoints() {
  const rng = mulberry32(2024);
  const ph1 = rng() * 6.28, ph2 = rng() * 6.28;
  const bumps = [];
  for (const sp of SPLITS) { const a = sp.fromS, sg = rng() < 0.5 ? 1 : -1; bumps.push({ s: a + 50, k: sg / 56, sig: 20 }, { s: a + 185, k: -sg / 56, sig: 20 }); }
  const N = Math.ceil((PRE + LEN + POST) / 20) + 1;
  const pts = []; let x = 0, z = 0, th = 0;
  for (let i = 0; i < N; i++) {
    pts.push([x, z]);
    const s = i * 20 - PRE;
    for (let m = 0; m < 20; m++) {
      const ss = s + m;
      let k = 0.0016 * Math.sin((ss / 520) * 6.283 + ph1) + 0.0011 * Math.sin((ss / 230) * 6.283 + ph2);
      for (const b of bumps) { const u = (ss - b.s) / b.sig; if (Math.abs(u) < 4.5) k += b.k * Math.exp(-0.5 * u * u); }
      th += (k - 0.0035 * th) * smoothstep(-30, 20, ss);
      x += Math.sin(th); z -= Math.cos(th);
    }
  }
  return pts;
}

export function planVillage(seed) {
  // ---- elevation: gentle downhill, never flatter than 3.5 % ----
  const ytab = [];
  { let y = 0; for (let s = -PRE; s <= LEN + POST + 2; s++) { ytab.push(y); const g = Math.max(0.035, 0.05 + 0.011 * Math.sin((s / 700) * 6.283 + 1) + 0.007 * Math.sin((s / 230) * 6.283)); y -= g; } }
  const yMain = (s) => { const f = clamp(s + PRE, 0, ytab.length - 1.001), i = Math.floor(f); return ytab[i] + (ytab[i + 1] - ytab[i]) * (f - i); };
  const main = makeRoad({
    pts: mainPoints(), closed: false, lengthTarget: LEN, pre: PRE, post: POST, id: 0, name: 'Main Street',
    yFn: (s) => yMain(s), widthFn: () => MAIN_W, camberFn: () => 0,
  });
  main.surf = { type: 'cobble', friction: 0.8, drag: 0.02, bump: 0.2 };

  // ---- branches ----
  const branches = [], splits = [];
  const mp = {}, mq = {};
  const mainPts = (s0, s1, step = 6) => { const out = []; for (let s = s0; s <= s1; s += step) { main.atS(s, mp); out.push([mp.px, mp.pz]); } return out; };
  const builtMid = [];
  for (const sp of SPLITS) {
    const A = { ...main.atS(sp.fromS, {}) }, B = { ...main.atS(sp.toS, {}) };
    const A0 = { ...main.atS(sp.fromS - 18, {}) }, B1 = { ...main.atS(sp.toS + 18, {}) };
    const chord = [B.px - A.px, B.pz - A.pz], cl = Math.hypot(chord[0], chord[1]), nx = -chord[1] / cl, nz = chord[0] / cl;
    const zoneMain = mainPts(sp.fromS + 25, sp.toS - 25, 5);
    const entry = { index: 0, name: 'Main Street', length: sp.toS - sp.fromS, width: MAIN_W, note: 'The main street, gently winding' };
    const paths = [entry];
    sp.paths.forEach((pd, j) => {
      const pathIndex = j + 1;
      let best = null;
      const amps = pd.kind === 'alley' ? [0] : pd.kind === 'market' ? [16, 22, 28, -16, -22, -28] : [-30, -36, 30, 36, -42, 42];
      for (const amp of amps) {
        const pts = [[A0.px, A0.pz], [A.px, A.pz]];
        const nseg = 6;
        for (let k = 1; k < nseg; k++) {
          const u = k / nseg, wig = pd.kind === 'alley' ? (k % 2 ? 3.5 : -3.5) * Math.sin(Math.PI * u) : 0;
          const bulge = amp * Math.sin(Math.PI * u) ** 1.3;
          pts.push([A.px + chord[0] * u + nx * (bulge + wig), A.pz + chord[1] * u + nz * (bulge + wig)]);
        }
        pts.push([B.px, B.pz], [B1.px, B1.pz]);
        let minD = 1e9;
        for (let k = 1; k < nseg; k++) { const p = pts[k + 1]; for (const m of zoneMain) minD = Math.min(minD, Math.hypot(p[0] - m[0], p[1] - m[1])); for (const q of builtMid) minD = Math.min(minD, Math.hypot(p[0] - q[0], p[1] - q[1])); }
        const need = pd.kind === 'alley' ? 9 : 17;
        if (!best || (minD >= need && best.minD < need)) best = { pts, minD, amp };
        if (minD >= need) break;
      }
      const w0 = pd.width, fromS = sp.fromS, toS = sp.toS;
      const road = makeRoad({
        pts: best.pts.slice(1, -1), phantomStart: best.pts[0], phantomEnd: best.pts[best.pts.length - 1], closed: false, noScale: true, id: branches.length + 1, name: pd.name,
        yFn: (s, x, z, total) => yMain(fromS + (clamp(s, 0, total) / total) * (toS - fromS)),
        widthFn: (s, kap, total) => lerp(MAIN_W, w0, smoothstep(0, 28, s) * smoothstep(0, 28, total - s)), camberFn: () => 0,
      });
      road.surf = pd.kind === 'alley' ? { type: 'cobble', friction: 0.95, drag: 0.0, bump: 0.08 } : pd.kind === 'river' ? { type: 'cobble', friction: 0.86, drag: 0.0, bump: 0.1 } : { type: 'cobble', friction: 0.8, drag: 0.02, bump: 0.22 };
      road.kind = pd.kind;
      branches.push({ road, splitId: sp.id, pathIndex, fromS, toS, name: pd.name, note: pd.note });
      for (let k = 0.3; k <= 0.7; k += 0.2) { road.atS(road.length * k, mq); builtMid.push([mq.px, mq.pz]); }
      paths.push({ index: pathIndex, name: pd.name, length: Math.round(road.length * 10) / 10, width: w0, note: pd.note });
    });
    let ml = 0, prev = null; for (let s = sp.fromS; s <= sp.toS; s += 2) { main.atS(s, mp); if (prev) ml += Math.hypot(mp.px - prev[0], mp.pz - prev[1]); prev = [mp.px, mp.pz]; }
    entry.length = Math.round(ml * 10) / 10;
    splits.push({ id: sp.id, fromS: sp.fromS, toS: sp.toS, paths });
  }
  for (const b of branches) if (b.road.kind === 'river') {   // river runs on the side facing away from Main Street
    const o = {}, m = {}; b.road.atS(b.road.length / 2, o); main.atS((b.fromS + b.toS) / 2, m);
    b.road.riverSide = ((o.px - m.px) * o.rhx + (o.pz - m.pz) * o.rhz) >= 0 ? 1 : -1;
  }
  // branch roads start/end on main-street samples: the polyline above includes the two anchor points, which were
  // used only for tangent shaping; trim them so the branch begins exactly at the split point
  const net = buildNetwork({ main, branches, length: LEN, lapLength: LEN });
  const registry = createRegistry(net);
  // river water runs only where the whole ribbon (water + far-bank wall) keeps >= 1.5 m from every OTHER road's corridor: longest such run
  const RIV_WA = 0.8, RIV_WB = 7.2;
  for (const b of branches) if (b.road.kind === 'river') {
    const road = b.road, rs = road.riverSide, o = {};
    const okRow = (sx) => { road.atS(sx, o); for (let dd = RIV_WA; dd <= RIV_WB + 1.2; dd += 0.8) { const d = rs * (o.hw + dd); if (registry.clear(o.px + o.rhx * d, o.pz + o.rhz * d, road.id) < 1.5) return false; } return true; };
    let best = null, cur = null;
    for (let sx = 14; sx <= road.length - 14 + 1e-6; sx += 2) { if (okRow(sx)) { if (!cur) cur = [sx, sx]; cur[1] = sx; if (!best || cur[1] - cur[0] > best[1] - best[0]) best = cur; } else cur = null; }
    road.waterRun = best && best[1] - best[0] >= 24 ? [best[0] + 2, best[1] - 2] : null;
  }

  // ---- hazards per road ----
  const hz = [];
  const mapS = (road, s) => (road.map ? road.map.fromS + (s / road.map.len) * (road.map.toS - road.map.fromS) : s);
  const addHaz = (road, field) => {
    for (const h of field.hazards) {
      let sp = {};
      if (road.map) sp = { splitId: road.map.splitId, pathIndex: road.map.pathIndex };
      else for (const sx of SPLITS) if (h.s >= sx.fromS && h.s <= sx.toS) sp = { splitId: sx.id, pathIndex: 0 };
      const k = road.map ? (road.map.toS - road.map.fromS) / road.map.len : 1;
      hz.push({ ...h, s: mapS(road, h.s), halfLength: h.halfLength * k, ...sp });
    }
  };
  main.field = createHazardField(main, seed + 11, { order: ['puddle', 'rock', 'puddle', 'stall', 'rock', 'puddle'], start: 190, startJit: 25, gap1: 55, gap2: 60, endGap: 110, stallEdge: true, noStall: [[-1e9, 1e9]] });
  main.field.zones.forEach((z, zi) => {   // main-street stalls: all props on ONE kerb side (a clear 4 m lane on the other) instead of a zig-zag chicane that trapped the AI
    if (z.kind !== 'stall') return;
    const side = zi % 2 ? 1 : -1;
    for (const ob of z.obstacles) { ob.d = side * Math.abs(ob.d); ob.r *= 0.9; }
    z.lateral = side * (z.hw - 1.0); z.b = 1.1;
    const hh = main.field.hazards[zi]; hh.lateral = z.lateral; hh.halfWidth = z.b;
  });
  addHaz(main, main.field);
  const softRocks = (f) => { for (const z of f.zones) if (z.kind === 'rock') { z.bump = 0.5; z.friction = 0.84; } };   // visible rubble, but not a speed trap
  softRocks(main.field); for (const z of main.field.zones) if (z.kind === 'rock') { z.bump = 0.3; z.friction = 0.88; z.drag = 0.02; }
  for (const b of branches) {
    const kind = b.road.kind;
    const opts = kind === 'market' ? { order: ['stall', 'puddle', 'stall', 'stall'], start: 92, startJit: 8, gap1: 14, gap2: 8, endGap: 24 }
      : kind === 'alley' ? { order: ['steps', 'puddle', 'rock'], start: 34, startJit: 8, gap1: 30, gap2: 22, endGap: 30 }
        : { order: ['puddle', 'puddle', 'rock'], start: 45, startJit: 15, gap1: 60, gap2: 30, endGap: 40 };
    b.road.field = createHazardField(b.road, seed + 31 + b.road.id, opts);
    softRocks(b.road.field);
    if (kind === 'alley') for (const z of b.road.field.zones) {   // gentle steps / rubble: a sloppy line must not stop the cart; the alley is the fast, direct route
      if (z.kind === 'steps') { z.a = 3.2; z.stairH = 0.045; z.bump = 0.3; z.drag = 0.0; z.friction = 0.84; }
      if (z.kind === 'rock') { z.bump = 0.35; z.friction = 0.86; z.drag = 0.02; }
    }
    addHaz(b.road, b.road.field);
  }

  // ---- terrain verge: vertical kerb (0.13 m) + a short pavement, then a steep wall (house plinths / garden walls / parapets) ----
  const WALL = 2.1, OUT = 9, LOW = 0.9, LOWR = 0.5;   // LOWR: river-side parapet (low enough to see the water from the cockpit)
  const lowEdge = (road, s, sg) => {   // 0..1: how far the street edge is a low parapet instead of a full wall (market square middle third, river side)
    if (!road.kind) return Math.max(1 - smoothstep(60, 80, s), smoothstep(LEN - 55, LEN - 35, s));   // start / finish straights: low wall, the crowd stands behind it
    if (road.kind === 'market') { const u = s / road.length; return smoothstep(0.2, 0.3, u) * (1 - smoothstep(0.7, 0.8, u)); }
    if (road.kind === 'river' && sg === road.riverSide) { const wr = road.waterRun; return wr ? smoothstep(wr[0] + 4, wr[0] + 28, s) * (1 - smoothstep(wr[1] - 28, wr[1] - 4, s)) : 0; }
    return 0;
  };
  const wallTop = (road, s, sg) => lerp(WALL, road.kind === 'river' ? LOWR : LOW, lowEdge(road, s, sg));
  const verge = (road, s, d, hw, c2 = 99) => {   // c2: clearance to the nearest OTHER road's edge (junction gores)
    const r = Math.abs(d) - (hw + 0.1);
    if (r < 0) return 0;
    const kerb = 0.13 * smoothstep(0, 0.06, r);
    // a wall only stands where a full wall + cap fits between this road and the next one (gap >= 3.5 m); the tip of a gore stays a flat paved pocket
    const amp = c2 > 40 ? 1 : smoothstep(3.5, 3.9, r + 0.1 + c2);
    const wall = wallTop(road, s, d < 0 ? -1 : 1) * smoothstep(0.55, 0.66, r) * (1 - smoothstep(2.5, 3.3, r)) * amp;
    return Math.max(kerb, wall);
  };
  const wallPart = (road, s, d, hw, c2) => {   // the wall component of verge(): subtracted from the drawn road strip (the visible walls are the brick strips / house fronts; the physics wall stays)
    const r = Math.abs(d) - (hw + 0.1);
    if (r < 0.5) return 0;
    const amp = c2 > 40 ? 1 : smoothstep(3.5, 3.9, r + 0.1 + c2);
    return wallTop(road, s, d < 0 ? -1 : 1) * smoothstep(0.55, 0.66, r) * (1 - smoothstep(2.5, 3.3, r)) * amp;
  };
  const roadColsFn = (hw) => {   // road-strip columns: uniform inside, then dense at the kerb / wall so the profile stays crisp
    const P = []; for (let i = 1; i <= 6; i++) P.push((hw * i) / 7);
    P.push(hw - 0.04, hw + 0.1, hw + 0.16, hw + 0.65, hw + 0.76, hw + 1.1, hw + 1.5);
    return [...P.map((v) => -v).reverse(), 0, ...P];
  };
  const terrainOpts = { hillAmp: 6, hillFar: 16, hillNear: 70, rutScale: 0, noiseScale: 0.4, crown: 0.07, sideSlope: 0.18, shoulderOut: OUT, verge, vergeNoFade: true };
  const theme = {
    roadMat: 'cobbles', chunk: 150, tile: 256, cell: 8, terrUV: 6, tileNear: { reach: 9, drop: 0.7 }, tileRadius: 0.5, roadColsFn,
    meshLift: (road, s, d) => {   // solid prop bases are drawn instead of the physics-only terrain pucks under them
      const mp = {}; road.atS(s, mp); const ad = Math.abs(d);
      let l = ad > mp.hw + 0.55 ? wallPart(road, s, d, mp.hw, registry.clear(mp.px + mp.rhx * d, mp.pz + mp.rhz * d, road.id)) : 0;
      if (!road.field) return l;
      for (const z of road.field.zones) { if (!z.obstacles || Math.abs(z.s - s) > 8) continue; for (const ob of z.obstacles) { const dd = Math.hypot(s - ob.s, d - ob.d); if (dd < ob.r) l += ob.h * (1 - smoothstep(0.82, 1, dd / ob.r)); } }
      return l;
    },
    roadUV: (road, s, d, hwe, o) => { o[0] = d / 2.6; o[1] = s / 2.6; },
    roadColor: (road, s, d, p, rnz, o) => {
      const ad = Math.abs(d), n = 0.88 + 0.22 * (rnz.n2(s * 0.7, d * 0.9) * 0.5 + 0.5);
      let wet = 0; if (road.field) wet = road.field.wet(s, d);
      const edge = smoothstep(p.hw - 0.3, p.hw + 0.1, ad);
      const k = n * (1 - 0.5 * wet) * (1 - 0.18 * edge);
      o[0] = k; o[1] = k; o[2] = k * (1 - 0.05 * edge);
      const pave = smoothstep(p.hw + 0.05, p.hw + 0.14, ad);   // kerb stone + pavement: lighter, warmer slabs
      if (pave > 0) { const pk = 1.18 + 0.1 * rnz.n2(s * 0.5, 3); o[0] = lerp(o[0], 0.98 * pk, pave); o[1] = lerp(o[1], 0.9 * pk, pave); o[2] = lerp(o[2], 0.78 * pk, pave); }
    },
    terrMat: 'grass', terrColor: (x, z, off, s, d, cnz, rnz, o) => {
      const k = 0.9 + 0.14 * cnz.n2(x / 15 + 7, z / 15), t = cnz.n2(x / 70 + 3, z / 70) * 0.5 + 0.5;
      if (off < 6.5) { const st = 0.72 + 0.18 * cnz.n2(x / 3, z / 3); o[0] = 1.0 * st; o[1] = 0.97 * st; o[2] = 0.9 * st; return; }
      o[0] = lerp(0.82, 1.1, t) * k; o[1] = k; o[2] = lerp(0.7, 0.62, t) * k;
    },
  };

  const surface = (info) => {
    const road = info.road, ad = Math.abs(info.d), hw = info.hw, base = road.surf || main.surf;
    if (ad > hw + 0.28) return { ...SURFACES.wall, type: 'wall' };
    let f = base.friction, d = base.drag, b = base.bump, type = base.type;
    const z0 = info.zone;
    if (z0 && info.w > 0.04) { const t = clamp(info.w * 1.25, 0, 1); f = lerp(f, z0.friction, t); d = lerp(d, z0.drag, t); b = lerp(b, z0.bump, t); if (info.w > 0.4) type = z0.type; }
    return { type, friction: clamp(f, 0.05, 1.2), drag: Math.max(0, d), bump: clamp(b, 0, 1) };
  };
  const startPos = (slot) => ({ s: 13.5 - 4.4 * (slot >> 1) - ((slot & 1) ? 2.0 : 0), d: (slot & 1) ? 1.15 : -1.15 });

  // =========================================================================================
  function decorate({ net: nw, terrain, lib, parent, seed: sd, plan }) {
    const rnd = mulberry32(sd * 71 + 5);
    const reg = plan.registry;
    const ROW = 0.64;   // house / wall front plane, metres beyond the road edge (corridor = edge + 0.3, doorsteps/awnings protrude <= 0.3); kerb + pavement sit in front of it; the terrain wall rises just behind this plane
    const items = [];
    const pp = {}, qq = {};
    const CH = 120;
    const batches = new Map();
    const batchOf = (progS) => { const k = Math.max(0, Math.floor(progS / CH)); if (!batches.has(k)) batches.set(k, new Batch()); return batches.get(k); };
    const winB = new Map();   // lit windows per chunk (night only)
    const winOf = (progS) => { const k = Math.max(0, Math.floor(progS / CH)); if (!winB.has(k)) winB.set(k, new Batch()); return winB.get(k); };
    const glow = new Batch();   // lamp lanterns: unlit warm material so they glow at dusk / night
    const placed = [];
    const spans = new Map();   // road -> {-1:[[s0,s1]], 1:[...]} house/garden extents, so the plain street-wall strip is only drawn where no building stands
    const addSpan = (road, sg, a, b) => { if (!spans.has(road)) spans.set(road, { '-1': [], '1': [] }); spans.get(road)[sg].push([a, b]); };
    const inSpan = (road, sg, s) => { const m = spans.get(road); if (!m) return false; for (const [a, b] of m[sg]) if (s > a - 0.35 && s < b + 0.35) return true; return false; };
    const clearOf = (x, z) => { nw.project2(x, z, qq); const rd = qq.road; rd.params(qq.idx, pp); return Math.abs(qq.d) - pp.hw; };
    const free = (x, z, r) => { for (const p of placed) if (Math.hypot(p.x - x, p.z - z) < (p.r + r) * 0.72) return false; return true; };
    const PAL = [[1.0, 0.92, 0.74], [0.98, 0.78, 0.66], [0.84, 0.92, 0.82], [0.92, 0.86, 0.66], [0.78, 0.84, 0.94], [1.0, 0.82, 0.5], [0.96, 0.7, 0.62], [0.9, 0.9, 0.86]];
    const SHUT = [[0.2, 0.45, 0.3], [0.65, 0.2, 0.18], [0.2, 0.32, 0.6], [0.85, 0.72, 0.25], [0.3, 0.5, 0.5]];
    const FLOW = [[0.9, 0.15, 0.2], [0.95, 0.7, 0.15], [0.9, 0.4, 0.7], [0.95, 0.95, 0.9]];

    // local frame at road position s, side sg: x along the street, z away from the street
    const mkBasis = (road, s, sg, extra = 0) => {
      road.atS(s, pp);
      const hw = pp.hw, T = new THREE.Vector3(pp.rhz, 0, -pp.rhx), R = new THREE.Vector3(pp.rhx, 0, pp.rhz);
      const Z = R.clone().multiplyScalar(sg), X = sg > 0 ? T : T.clone().negate(), Y = new THREE.Vector3(0, 1, 0);
      const base = new THREE.Vector3(pp.px + R.x * sg * (hw + ROW + extra), pp.py, pp.pz + R.z * sg * (hw + ROW + extra));
      return { M: new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(base), hw, base, X, Z };
    };
    function house(b, M, w, depth, floors, ground, big, wb) {
      const L = (m) => M.clone().multiply(m);
      const H = floors * 3.1 + 0.4, tint = PAL[Math.floor(rnd() * PAL.length)], brick = rnd() < 0.3;
      const key = brick ? 'brickwall' : 'plaster', c = brick ? [0.95 + rnd() * 0.25, 0.9 + rnd() * 0.2, 0.9 + rnd() * 0.2] : tint;
      b.add('concrete', boxG(w + 0.15, 1.2, depth + 0.15, 2), L(xf(0, -0.1, depth / 2)), [0.9, 0.86, 0.8]);
      b.add('concrete', boxG(w - 0.4, 3, depth - 0.4, 2), L(xf(0, -2.6, depth / 2)), [0.8, 0.8, 0.8]);
      b.add(key, boxG(w, H, depth, 2.5), L(xf(0, 0.5 + H / 2, depth / 2)), c);
      const gableFront = !big && rnd() < 0.4, th = 0.58;
      if (!gableFront) {
        const half = depth / 2 + 0.45, sl = half / Math.cos(th), rise = (depth / 2) * Math.tan(th), yb = 0.5 + H;
        for (const sg of [-1, 1]) b.add('roofTile', boxG(w + 0.7, 0.14, sl, 2), L(xf(0, yb + rise / 2 + 0.05, depth / 2 + sg * half / 2 - sg * 0.05, sg * th, 0, 0)), [1, 1, 1]);
        for (const sx of [-1, 1]) b.add(key, prismG([[-depth / 2, -0.06], [depth / 2, -0.06], [0, rise]], 0.2, 2), L(xf(sx * (w / 2 - 0.09), yb, depth / 2, 0, Math.PI / 2, 0)), c);
        b.add('roofTile', boxG(w + 0.8, 0.2, 0.3, 1), L(xf(0, yb + rise + 0.1, depth / 2)), [0.85, 0.85, 0.85]);
        if (rnd() < 0.6) b.add('brickwall', boxG(0.9, 2.6, 0.9, 1.5), L(xf((rnd() - 0.5) * w * 0.6, yb + rise * 0.7 + 1.0, depth * 0.62)), [0.9, 0.85, 0.8]);
      } else {
        const half = w / 2 + 0.45, sl = half / Math.cos(th), rise = (w / 2) * Math.tan(th), yb = 0.5 + H;
        for (const sg of [-1, 1]) b.add('roofTile', boxG(sl, 0.14, depth + 0.7, 2), L(xf(sg * half / 2 - sg * 0.05, yb + rise / 2 + 0.05, depth / 2, 0, 0, -sg * th)), [1, 1, 1]);
        b.add(key, prismG([[-w / 2, -0.06], [w / 2, -0.06], [0, rise]], 0.2, 2), L(xf(0, yb, 0.09)), c);
      }
      const bays = Math.max(2, Math.round(w / 2.9)), bw = w / bays;
      for (let f = 0; f < floors; f++) for (let i = 0; i < bays; i++) {
        const x = -w / 2 + bw * (i + 0.5), y = 0.5 + 1.9 + f * 3.1;
        if (f === 0 && i === Math.floor(bays / 2)) {
          b.add('woodWeathered', boxG(1.2, 2.3, 0.2, 1), L(xf(x, 1.65, -0.02)), [0.35 + rnd() * 0.3, 0.25 + rnd() * 0.2, 0.2]);
          b.add('concrete', boxG(1.6, 0.18, 0.5, 1), L(xf(x, 0.55, -0.05)), [1, 1, 1]);
          continue;
        }
        b.add('woodWeathered', boxG(1.15, 1.55, 0.1, 1), L(xf(x, y, -0.02)), [1.5, 1.45, 1.35]);
        b.add('dark', boxG(0.9, 1.3, 0.12, 1), L(xf(x, y, -0.05)), [0.08, 0.1, 0.12]);
        if (wb && hash1(M.elements[12] * 0.37 + M.elements[14] * 0.91 + f * 7.7 + i * 3.1) < 0.4) wb.add('dark', boxG(0.78, 1.18, 0.05, 1), L(xf(x, y, -0.118)), [1.0, 0.78 + 0.1 * hash1(i + f * 5 + M.elements[12]), 0.4]);   // lit window (visible at night only)
        if (rnd() < 0.3) { const sc = SHUT[Math.floor(rnd() * SHUT.length)]; for (const sx of [-1, 1]) b.add('woodWeathered', boxG(0.45, 1.45, 0.06, 1), L(xf(x + sx * 0.78, y, -0.06)), [sc[0] * 1.2, sc[1] * 1.2, sc[2] * 1.2]); }
        if (rnd() < 0.35) { b.add('woodWeathered', boxG(1.1, 0.26, 0.3, 1), L(xf(x, y - 0.95, 0.0)), [0.55, 0.4, 0.3]); const fc = FLOW[Math.floor(rnd() * 4)]; b.add('dark', boxG(1.0, 0.22, 0.26, 1), L(xf(x, y - 0.8, 0.0)), [fc[0] * 0.8, fc[1] * 0.8, fc[2] * 0.8]); }
      }
      if (ground && rnd() < 0.55) {
        const ac = rnd() < 0.5 ? [0.85, 0.2, 0.18] : [0.2, 0.4, 0.75];
        for (let i = 0; i < 6; i++) b.add('dark', boxG(w / 6 - 0.02, 0.06, 1.1, 1), L(xf(-w / 2 + (i + 0.5) * w / 6, 2.9, 0.15, 0.35, 0, 0)), i % 2 ? [1.7, 1.7, 1.6] : ac);
        const sc = [[0.9, 0.7, 0.2], [0.25, 0.5, 0.35], [0.8, 0.3, 0.25], [0.2, 0.3, 0.6]][Math.floor(rnd() * 4)];
        b.add('dark', boxG(Math.min(w * 0.7, 3.6), 0.6, 0.1, 1), L(xf(0, 3.7, -0.1)), sc);
        b.add('dark', boxG(0.35, 0.45, 0.35, 1), L(xf(w / 2 - 0.9, 0.9, 0.0)), [0.55, 0.35, 0.2]);
      }
    }
    function cheapHouse(b, M, w, depth, floors) {   // back-row house: body, roof, gables and a row of dark windows (no shutters / boxes)
      const L = (m) => M.clone().multiply(m), H = floors * 3.0 + 0.4, tint = PAL[Math.floor(rnd() * PAL.length)], th = 0.58;
      b.add('plaster', boxG(w, H + 4, depth, 2.5), L(xf(0, 0.5 + (H - 4) / 2, depth / 2)), tint);
      const half = depth / 2 + 0.4, sl = half / Math.cos(th), rise = (depth / 2) * Math.tan(th), yb = 0.5 + H;
      for (const sg of [-1, 1]) b.add('roofTile', boxG(w + 0.6, 0.14, sl, 2), L(xf(0, yb + rise / 2 + 0.05, depth / 2 + sg * half / 2 - sg * 0.05, sg * th, 0, 0)), [1, 1, 1]);
      for (const sx of [-1, 1]) b.add('plaster', prismG([[-depth / 2, -0.06], [depth / 2, -0.06], [0, rise]], 0.2, 2), L(xf(sx * (w / 2 - 0.09), yb, depth / 2, 0, Math.PI / 2, 0)), tint);
      const bays = Math.max(2, Math.round(w / 3.2));
      for (let f = 0; f < floors; f++) for (let i = 0; i < bays; i++) b.add('dark', boxG(0.9, 1.3, 0.1, 1), L(xf(-w / 2 + (w / bays) * (i + 0.5), 2.4 + f * 3.0, -0.03)), [0.1, 0.12, 0.16]);
    }
    // frontage along one road. setback(s, sg) -> extra metres between street edge and the house fronts (market square, far river bank)
    function frontage(road, sgs, sLo, sHi, big, setback, narrow) {
      for (const sg of sgs) {
        let s = sLo + rnd() * 3;
        while (s < sHi - 6) {
          const w = narrow ? 4.2 + rnd() * 2.2 : 6.2 + rnd() * 4.6, depth0 = (narrow ? 4.2 : 7) + rnd() * (narrow ? 1.4 : 3.5), floors = 2 + (rnd() < (narrow ? 0.7 : 0.45) ? 1 : 0), sc = s + w / 2;
          if (sc > sHi - 4) break;
          const extra = setback ? setback(sc, sg) : 0;
          const bs = mkBasis(road, sc, sg, extra);
          const gpt = [bs.base.x - bs.Z.x * 0.3, bs.base.z - bs.Z.z * 0.3];
          let depth = depth0, cx = 0, cz = 0, poly = null, ok = false;
          for (const dc of [depth0, 6, 4.8, 3.8]) {   // shallower houses fill the gore wedges between diverging streets
            if (dc > depth0 + 1e-6) continue;
            cx = bs.base.x + bs.Z.x * dc / 2; cz = bs.base.z + bs.Z.z * dc / 2;
            poly = reg.boxPoly(bs.M.clone(), 0, (dc - 0.3) / 2, w / 2 + 0.05, (dc + 0.3) / 2);
            if (free(cx, cz, Math.hypot(w, dc) / 2) && reg.fits(poly, 0.31, 0.5)) { ok = true; depth = dc; break; }
          }
          const prog = road.map ? road.map.fromS + (sc / road.map.len) * (road.map.toS - road.map.fromS) : sc;
          if (ok) {
            const M = bs.M.clone(); M.elements[13] = terrain.heightAt(gpt[0], gpt[1]) - 0.05;
            house(batchOf(prog), M, w, depth, floors, true, big, winOf(prog));
            placed.push({ x: cx, z: cz, r: Math.hypot(w, depth) / 2 }); if (!extra) addSpan(road, sg, sc - w / 2, sc + w / 2);
            reg.poly('house', poly, M.elements[13] - 4.1, gpt, { sunk: true });   // plinth boxes reach 4.1 m below the floor
            if (rnd() < 0.9) {   // second row behind (a step up the hill)
              const w2 = w * (0.8 + rnd() * 0.45), d2 = 6 + rnd() * 3, bs2 = mkBasis(road, sc + (rnd() - 0.5) * 2, sg, extra + depth + 1.4 + rnd() * 1.5);
              const c2x = bs2.base.x + bs2.Z.x * d2 / 2, c2z = bs2.base.z + bs2.Z.z * d2 / 2, p2 = reg.boxPoly(bs2.M, 0, (d2 - 0.3) / 2, w2 / 2 + 0.05, (d2 + 0.3) / 2);
              if (free(c2x, c2z, Math.hypot(w2, d2) / 2) && reg.fits(p2, 0.31, 0.8)) {
                const g2 = [bs2.base.x - bs2.Z.x * 0.3, bs2.base.z - bs2.Z.z * 0.3], M2 = bs2.M.clone(); M2.elements[13] = terrain.heightAt(g2[0], g2[1]) + 0.5;
                cheapHouse(batchOf(prog), M2, w2, d2, 2 + (rnd() < 0.4 ? 1 : 0));
                placed.push({ x: c2x, z: c2z, r: Math.hypot(w2, d2) / 2 });
                reg.poly('house', p2, M2.elements[13] - 4.1, g2, { sunk: true });
              }
            }
          } else if (!extra && !narrow && rnd() < 0.8) { // garden wall so the street edge stays closed (only where it stays out of every corridor)
            const gw = reg.boxPoly(bs.M, 0, 0.35, w / 2, 0.35);
            if (reg.fits(gw, 0.31, 0.5)) {
              const M = bs.M.clone(); M.elements[13] = terrain.heightAt(bs.base.x, bs.base.z) - 0.05;
              batchOf(prog).add('concrete', boxG(w, 3.1, 0.7, 2), M.clone().multiply(xf(0, 0.6, 0.35)), [0.95, 0.9, 0.82]);
              batchOf(prog).add('concrete', boxG(w + 0.1, 0.2, 0.9, 2), M.clone().multiply(xf(0, 2.2, 0.35)), [0.8, 0.78, 0.75]);
              reg.poly('gardenwall', gw, M.elements[13] - 0.95, [bs.base.x, bs.base.z], { sunk: true }); addSpan(road, sg, sc - w / 2, sc + w / 2);
            }
          }
          s += w + 0.1 + rnd() * 0.5;
        }
      }
    }

    const roads0 = [main, ...branches.map((x) => x.road)];
    const hash1 = (a) => { const x = Math.sin(a * 12.9898) * 43758.5453; return x - Math.floor(x); };
    // ---- set pieces first so houses leave room: church + fountain ----
    const churchS = 1090;
    {
      const sg = 1, bs = mkBasis(main, churchS, sg), b = batchOf(churchS), M = bs.M.clone(); M.elements[13] = terrain.heightAt(bs.base.x, bs.base.z) - 0.05;
      const L = (m) => M.clone().multiply(m), sb = 4.5;
      b.add('concrete', boxG(11, 1.4, 24, 2), L(xf(0, -0.2, sb + 12)), [0.9, 0.88, 0.82]);
      b.add('plaster', boxG(10, 9, 22, 3), L(xf(0, 5.0, sb + 12)), [1.0, 0.96, 0.86]);
      b.add('roofTile', boxG(5.8, 0.2, 22.6, 2), L(xf(-2.6, 11.0, sb + 12, 0, 0, 0.62)), [1, 1, 1]);
      b.add('roofTile', boxG(5.8, 0.2, 22.6, 2), L(xf(2.6, 11.0, sb + 12, 0, 0, -0.62)), [1, 1, 1]);
      b.add('plaster', prismG([[-5, 0], [5, 0], [0, 3.2]], 0.3, 2), L(xf(0, 9.5, sb + 0.2)), [1.0, 0.96, 0.86]);
      b.add('plaster', boxG(6, 21, 6, 3), L(xf(-3.5, 11, sb + 3.2)), [1.0, 0.94, 0.84]);
      b.add('roofTile', cylG(0.01, 4.6, 8, 4, 2), L(xf(-3.5, 25, sb + 3.2, 0, Math.PI / 4, 0)), [1, 1, 1]);
      b.add('dark', cylG(1.3, 1.3, 0.3, 14, 1), L(xf(-3.5, 17.5, sb + 0.15, Math.PI / 2, 0, 0)), [1.8, 1.75, 1.5]);
      b.add('dark', boxG(0.3, 2.2, 0.3, 1), L(xf(-3.5, 28.4, sb + 3.2)), [0.15, 0.15, 0.15]); b.add('dark', boxG(1.2, 0.3, 0.3, 1), L(xf(-3.5, 28.0, sb + 3.2)), [0.15, 0.15, 0.15]);
      for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) b.add('dark', boxG(0.12, 2.2, 0.9, 1), L(xf(sx * 5.02, 5.5, sb + 5.5 + i * 4.4)), [0.1, 0.12, 0.2]);
      b.add('dark', boxG(1.8, 3.4, 0.2, 1), L(xf(1.5, 2.2, sb + 0.05)), [0.3, 0.2, 0.12]);
      placed.push({ x: bs.base.x + bs.Z.x * 16, z: bs.base.z + bs.Z.z * 16, r: 18 });
      for (let i = 0; i < 6; i++) b.add('concrete', boxG(4, 0.9, 0.35, 2), L(xf(-10 + i * 4.2, 0.2, 0.8)), [0.9, 0.88, 0.84]);
    }
    const fountS = 1075;
    {
      const sg = -1, bs = mkBasis(main, fountS, sg), b = batchOf(fountS);
      const M = bs.M.clone(); M.elements[13] = terrain.heightAt(bs.base.x + bs.Z.x * 3.3, bs.base.z + bs.Z.z * 3.3) - 0.3; const L = (m) => M.clone().multiply(m);
      b.add('concrete', cylG(2.4, 2.5, 0.8, 14, 2), L(xf(0, 0.4, 4.2)), [0.95, 0.93, 0.88]);
      b.add('dark', cylG(2.1, 2.1, 0.06, 14, 1), L(xf(0, 0.82, 4.2)), [0.25, 0.5, 0.65]);
      b.add('concrete', cylG(0.4, 0.5, 2.0, 8, 2), L(xf(0, 1.6, 4.2)), [0.95, 0.93, 0.88]);
      b.add('concrete', cylG(1.2, 0.5, 0.4, 12, 2), L(xf(0, 2.5, 4.2)), [0.95, 0.93, 0.88]);
      b.add('dark', sphG(0.3, 6, 4, 1), L(xf(0, 3.0, 4.2)), [0.4, 0.6, 0.8]);
      placed.push({ x: bs.base.x + bs.Z.x * 6, z: bs.base.z + bs.Z.z * 6, r: 6 });
    }

    // ---- houses along every road ----
    // main street: start and finish zones are open (crowd on the wall tops), houses close the view behind the grid and beyond the line
    for (const bd of branches) {
      const rd = bd.road, k = rd.kind;
      if (k === 'market') frontage(rd, [-1, 1], 12, rd.length - 12, true, (s) => (lowEdge(rd, s, 1) > 0.9 ? 7.5 : 0));
      else if (k === 'river') {
        frontage(rd, [-rd.riverSide], 12, rd.length - 12, false);
        frontage(rd, [rd.riverSide], 12, rd.length - 12, false, (s) => (lowEdge(rd, s, rd.riverSide) > 0.9 ? 9.4 : 0));   // far bank, beyond the water
      } else frontage(rd, [-1, 1], 12, rd.length - 12, false, null, k === 'alley');
    }

    frontage(main, [-1, 1], -34, -4, false);
    frontage(main, [-1, 1], 75, LEN - 45, false);
    frontage(main, [-1, 1], LEN + 38, LEN + 66, false);

    // ---- street walls (visible face of the contain-walls) along every road, merged into the chunk batches ----
    // rows every ~2 m on each side; a row is dropped where a house stands (inSpan) or the wall would enter another road's corridor (junction mouths).
    // Runs shorter than 4 m are discarded and every run that ends at a junction gets a square end-post, so no sheared / floating wall pieces remain.
    const WALLKEY = { alley: 'plaster', market: 'brickwall', river: 'brickwall', main: 'brickwall' };
    for (const road of roads0) {
      const n = Math.max(2, Math.round(road.length / 2) + 1);
      for (const sg of [-1, 1]) {
        const rv = road.kind === 'river' && sg === road.riverSide, rowOK = [], rowR = [];
        for (let r = 0; r < n; r++) {
          const s = (road.length * r) / (n - 1); road.atS(s, pp); let reason = inSpan(road, sg, s) ? 1 : 0;
          if (!reason) {
            const tp = wallTop(road, s, sg), prof = rv ? [[ROW - 0.22, -0.95], [ROW - 0.2, tp], [ROW + 0.55, tp], [ROW + 0.57, -1.0]] : [[ROW - 0.22, -0.4], [ROW - 0.12, tp], [2.4, tp], [2.45, tp - 0.01]];
            prof.forEach(([dd], j) => { const d = sg * (pp.hw + dd), need = !rv && j >= 2 ? 0.8 : 0.31; if (reg.clear(pp.px + pp.rhx * d, pp.pz + pp.rhz * d) < need) reason = 2; });
          }
          rowOK.push(reason === 0); rowR.push(reason);
        }
        if (globalThis.__wallDbg) console.log(road.name, road.id, sg, rowR.join(''));
        for (let i0 = 0; i0 < n;) {
          if (!rowOK[i0]) { i0++; continue; }
          let i1 = i0; while (i1 + 1 < n && rowOK[i1 + 1]) i1++;
          const len = ((i1 - i0) * road.length) / (n - 1);
          if (len >= 4) {
            for (let a0 = i0; a0 < i1; a0 += 30) {   // pieces of <= 30 rows so each lands in its own chunk batch
              const a1 = Math.min(i1, a0 + 30), P = [], Na = [], Ua = [], Ia = [];
              for (let r = a0; r <= a1; r++) {
                const s = (road.length * r) / (n - 1); road.atS(s, pp); const tp = wallTop(road, s, sg);
                for (const [dd, hh] of (rv ? [[ROW - 0.22, -0.95], [ROW - 0.2, tp], [ROW + 0.55, tp], [ROW + 0.57, -1.0]] : [[ROW - 0.22, -0.4], [ROW - 0.12, tp], [2.4, tp], [2.45, tp - 0.01]])) { const d = sg * (pp.hw + dd); P.push(pp.px + pp.rhx * d, pp.py + hh, pp.pz + pp.rhz * d); Na.push(0, 1, 0); Ua.push(s / 2.2, hh / 2.2); }
              }
              for (let r = 0; r < a1 - a0; r++) for (let q = 0; q < 3; q++) { const a = r * 4 + q, b2 = a + 1, c2 = a + 4, d2 = c2 + 1; if (sg < 0) Ia.push(a, c2, b2, b2, c2, d2); else Ia.push(a, b2, c2, b2, d2, c2); }
              let g = new THREE.BufferGeometry();
              g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Na, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(Ua, 2));
              g.setIndex(Ia); g = g.toNonIndexed(); g.computeVertexNormals();
              const sm = (road.length * (a0 + a1)) / 2 / (n - 1), prog = road.map ? road.map.fromS + (sm / road.map.len) * (road.map.toS - road.map.fromS) : sm;
              batchOf(prog).add(WALLKEY[road.kind || 'main'] || 'brickwall', g, null, road.kind === 'alley' ? [1.0, 0.97, 0.9] : [1.05, 0.95, 0.88]);
            }
            for (const [ri, nb] of [[i0, i0 - 1], [i1, i1 + 1]]) {   // end-posts where the wall stops at a junction
              if (nb < 0 || nb >= n || rowR[nb] !== 2) continue;
              const s = (road.length * ri) / (n - 1); road.atS(s, pp); const tp = Math.min(wallTop(road, s, sg), 1.1), yaw = Math.atan2(-pp.rhz, pp.rhx), d = sg * (pp.hw + ROW + 0.95);   // gore-tip posts stay low (a bollard, not a slab standing in the street)
              const prog = road.map ? road.map.fromS + (s / road.map.len) * (road.map.toS - road.map.fromS) : s, bb = batchOf(prog), top = tp + 0.12;
              bb.add('concrete', boxG(1.7, top + 0.9, 0.85, 1.5), xf(pp.px + pp.rhx * d, pp.py + (top - 0.9) / 2, pp.pz + pp.rhz * d, 0, yaw, 0), [0.88, 0.84, 0.76]);
              bb.add('concrete', boxG(1.9, 0.14, 1.05, 1), xf(pp.px + pp.rhx * d, pp.py + top + 0.07, pp.pz + pp.rhz * d, 0, yaw, 0), [0.78, 0.75, 0.7]);
            }
          }
          i0 = i1 + 1;
        }
      }
    }

    // ---- lamp posts (main street) ----
    for (let s = 20; s < LEN + 40; s += 27) {
      const sg = (Math.floor(s / 27) % 2) ? 1 : -1, bs = mkBasis(main, s, sg), x = bs.base.x, z = bs.base.z, y = terrain.heightAt(x, z), b = batchOf(s), ry = Math.atan2(-bs.Z.z, bs.Z.x);
      if (reg.clear(x, z) < 0.45) continue;
      const ys = terrain.heightAt(pp.px + pp.rhx * sg * (bs.hw + 0.1), pp.pz + pp.rhz * sg * (bs.hw + 0.1)) - 0.6;   // post foot buried in the street wall
      reg.circle('lamp', x, z, 0.12, ys, { sunk: true }, 6);
      b.add('dark', cylG(0.07, 0.1, 5.0, 5, 1), xf(x, ys + 2.5, z), [0.3, 0.3, 0.32]);
      glow.add('dark', boxG(0.35, 0.5, 0.35, 1), xf(x - bs.Z.x * 0.4, y + 4.5, z - bs.Z.z * 0.4, 0, ry, 0), [1.0, 0.82, 0.45]);
      b.add('dark', boxG(0.9, 0.07, 0.07, 1), xf(x - bs.Z.x * 0.2, y + 4.3, z - bs.Z.z * 0.2, 0, ry, 0), [0.3, 0.3, 0.32]);
    }

    // ---- market stalls and carts on the obstacle spots ----
    for (const road of roads0) {
      if (!road.field) continue;
      for (const z of road.field.zones) {
        if (!z.obstacles) continue;
        for (const ob of z.obstacles) {
          road.atS(ob.s, pp);
          const x = pp.px + pp.rhx * ob.d, zz = pp.pz + pp.rhz * ob.d, y = terrain.heightAt(x, zz) - ob.h + 0.0;
          const prog = road.map ? road.map.fromS + (ob.s / road.map.len) * (road.map.toS - road.map.fromS) : ob.s, b = batchOf(prog);
          const ry = Math.atan2(-pp.rhz, pp.rhx), yaw = ry + (rnd() - 0.5) * 0.3, M = xf(x, y, zz, 0, yaw, 0), L = (m) => M.clone().multiply(m);
          const onMain = !road.map, pick = rnd(), r = ob.r, e = r * 1.04, hh = ob.h;   // the terrain puck under a prop has radius r and height h: the prop's solid base covers it exactly
          const wood = [0.62, 0.48, 0.34];
          b.add('woodWeathered', boxG(2 * e, hh, 2 * e, 1.5), L(xf(0, hh / 2, 0)), wood);
          if (onMain) {
            // main street: low, clearly-hazard props pushed to the kerb (hay wagon bed / crate stack), never a full stall
            if (pick < 0.5) {
              b.add('straw', boxG(1.7 * r, 0.42, 1.7 * r, 1.5), L(xf(0, hh + 0.21, 0)), [1.0, 0.88, 0.55]);
              b.add('dark', boxG(0.12, 0.5, 2 * e + 0.02, 1), L(xf(-r * 0.7, hh + 0.25, 0)), [0.3, 0.22, 0.15]); b.add('dark', boxG(0.12, 0.5, 2 * e + 0.02, 1), L(xf(r * 0.7, hh + 0.25, 0)), [0.3, 0.22, 0.15]);
            } else {
              for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) b.add('woodWeathered', boxG(r * 0.95, 0.5, r * 0.95, 1), L(xf((i - 0.5) * r, hh + 0.25, (j - 0.5) * r)), [0.72 - 0.05 * j, 0.54, 0.34]);
              b.add('woodWeathered', boxG(r * 0.95, 0.5, r * 0.95, 1), L(xf(0, hh + 0.75, 0)), [0.76, 0.58, 0.38]);
            }
          } else if (pick < 0.62) {
            const ac = [[0.85, 0.2, 0.18], [0.2, 0.45, 0.8], [0.9, 0.7, 0.15], [0.25, 0.6, 0.35]][Math.floor(rnd() * 4)];
            for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add('woodWeathered', boxG(0.08, 1.5, 0.08, 1), L(xf(px * (e - 0.1), hh + 0.75, pz * (e - 0.1))), [0.6, 0.45, 0.3]);
            for (let i = 0; i < 6; i++) b.add('dark', boxG(2 * e / 6 - 0.02, 0.06, 2 * e + 0.1, 1), L(xf(-e + (i + 0.5) * 2 * e / 6, hh + 1.55, 0, 0, 0, 0.1)), i % 2 ? [1.8, 1.8, 1.7] : ac);
            for (let i = 0; i < 7; i++) { const fc = [[0.9, 0.25, 0.15], [0.95, 0.75, 0.1], [0.4, 0.7, 0.2], [0.85, 0.5, 0.15]][i % 4]; b.add('dark', boxG(0.34, 0.24, 0.34, 1), L(xf(-0.8 * r + i * 0.27 * r, hh + 0.12, (i % 2) * 0.5 - 0.25)), fc); }
          } else {
            for (let i = 0; i < 4; i++) b.add('woodWeathered', cylG(0.34, 0.34, 0.8, 9, 1), L(xf((i % 2 - 0.5) * 0.8 * r, hh + 0.4, (Math.floor(i / 2) - 0.5) * 0.8 * r)), [0.55, 0.38, 0.24]);
            b.add('woodWeathered', cylG(0.34, 0.34, 0.8, 9, 1), L(xf(0, hh + 1.15, 0)), [0.5, 0.35, 0.22]);
          }
          reg.box('hazard', M, 0, 0, e, e, 0, { hazard: true, lift: ob.h });
        }
      }
      // loose cobbles / rubble scattered over bumpy "rock" and step zones
      for (const z of road.field.zones) {
        if (z.kind !== 'rock' && z.kind !== 'steps') continue;
        const n = z.kind === 'rock' ? 9 : 5;
        for (let i = 0; i < n; i++) {
          const ds = (rnd() - 0.5) * z.a * 1.4, dd = z.lateral + (rnd() - 0.5) * 2 * Math.min(z.b, road.atS(z.s, pp).hw) * 0.85;
          road.atS(z.s + ds, pp); const x = pp.px + pp.rhx * dd, zz = pp.pz + pp.rhz * dd, y = terrain.heightAt(x, zz);
          const prog = road.map ? road.map.fromS + ((z.s + ds) / road.map.len) * (road.map.toS - road.map.fromS) : z.s + ds, sc = (z.kind === 'rock' ? 0.3 + rnd() * 0.32 : 0.16 + rnd() * 0.2), g = 0.42 + rnd() * 0.3;
          batchOf(prog).add('concrete', z.kind === 'rock' ? sphG(sc * 0.62, 6, 4, 1) : boxG(sc, sc * 0.45, sc * 0.8, 1), z.kind === 'rock' ? xf(x, y + sc * 0.2, zz, rnd() * 0.6, rnd() * 3, rnd() * 0.6, 1, 0.75, 0.9) : xf(x, y + sc * 0.1, zz, rnd() * 0.5, rnd() * 3, rnd() * 0.5), [g, g * 0.97, g * 0.92]);
        }
      }
    }

    // ---- washing lines over alleys, bunting over the market squares / start / finish (with a visible rope) ----
    const clothP = [], clothC = [], clothN = [];
    const quad = (p0, p1, p2, p3, col) => { clothP.push(...p0, ...p1, ...p2, ...p3); for (let k = 0; k < 4; k++) { clothC.push(...col); clothN.push(0, 1, 0); } };
    function hang(a, c, sag, spawn, rx, rz) {   // a, c = [x,y,z] anchors; spawn(i, n) -> {col, wdt, hgt} or null; rope sampled every ~0.5 m
      const len = Math.hypot(c[0] - a[0], c[2] - a[2]), n = Math.max(2, Math.round(len / 0.55));
      const pt = (t) => [lerp(a[0], c[0], t), lerp(a[1], c[1], t) - sag * 4 * t * (1 - t), lerp(a[2], c[2], t)];
      for (let i = 0; i < n; i++) { const p0 = pt(i / n), p1 = pt((i + 1) / n); quad([p0[0], p0[1] + 0.02, p0[2]], [p1[0], p1[1] + 0.02, p1[2]], [p1[0], p1[1] - 0.02, p1[2]], [p0[0], p0[1] - 0.02, p0[2]], [0.16, 0.13, 0.1]); }
      for (let i = 0; i < n; i++) {
        const o = spawn(i, n); if (!o) continue; const t = (i + 0.5) / n, q = pt(t), dx = rx * o.wdt / 2, dz = rz * o.wdt / 2;
        quad([q[0] - dx, q[1], q[2] - dz], [q[0] + dx, q[1], q[2] + dz], [q[0] + dx, q[1] - o.hgt, q[2] + dz], [q[0] - dx, q[1] - o.hgt, q[2] - dz], o.col);
      }
    }
    const crossStreet = (road, s, h, sag, spawn, wide = 0.9) => {
      road.atS(s, pp); const hw = pp.hw + wide, rx = pp.rhx, rz = pp.rhz;
      const a = [pp.px - rx * hw, 0, pp.pz - rz * hw], c = [pp.px + rx * hw, 0, pp.pz + rz * hw];
      a[1] = pp.py + h; c[1] = pp.py + h + 0.2; hang(a, c, sag, spawn, rx, rz);
    };
    for (const bd of branches) {
      if (bd.road.kind !== 'market') continue;
      const road = bd.road, alley = false;
      for (let s = 20; s < road.length - 18; s += alley ? 15 : 26) {
        crossStreet(road, s, alley ? 5.2 : 6.5, alley ? 0.5 : 0.7, (i) => (alley
          ? { col: [[0.95, 0.95, 0.9], [0.9, 0.5, 0.5], [0.5, 0.65, 0.9], [0.95, 0.85, 0.5]][Math.floor(rnd() * 4)], wdt: 0.4, hgt: 0.8 }
          : { col: [[0.9, 0.2, 0.2], [0.95, 0.9, 0.7], [0.2, 0.4, 0.8], [0.95, 0.75, 0.2]][i % 4], wdt: 0.32, hgt: 0.5 }));
      }
    }
    const bunt = (i) => ({ col: [[0.9, 0.2, 0.2], [0.95, 0.95, 0.9], [0.2, 0.4, 0.8], [0.95, 0.75, 0.2]][i % 4], wdt: 0.3, hgt: 0.45 });
    const upv = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3();
    const SPECT = [[0.85, 0.25, 0.2], [0.2, 0.4, 0.75], [0.9, 0.75, 0.2], [0.3, 0.6, 0.35], [0.85, 0.5, 0.7], [0.95, 0.95, 0.9], [0.45, 0.3, 0.2]];
    let crowdSc = 0;
    function person(b, x, y, z, yaw, wave) {   // small static villager: legs/body, head, arms (one raised when waving)
      const c = SPECT[Math.floor(rnd() * SPECT.length)], sc = (crowdSc || 0.9) + rnd() * 0.2 * (crowdSc ? 0.5 : 1), M = xf(x, y, z, 0, yaw, 0, sc), L = (m) => M.clone().multiply(m);
      b.add('dark', cylG(0.2, 0.26, 0.85, 6, 1), L(xf(0, 0.42, 0)), [0.2, 0.2, 0.28]);
      b.add('dark', cylG(0.24, 0.2, 0.6, 6, 1), L(xf(0, 1.15, 0)), c);
      b.add('dark', sphG(0.16, 6, 5, 1), L(xf(0, 1.6, 0)), [0.95, 0.76, 0.6]);
      b.add('dark', boxG(0.09, 0.5, 0.09, 1), L(xf(-0.3, 1.1, 0)), c);
      if (wave) b.add('dark', boxG(0.09, 0.5, 0.09, 1), L(xf(0.33, 1.65, 0, 0, 0, -0.35)), c); else b.add('dark', boxG(0.09, 0.5, 0.09, 1), L(xf(0.3, 1.1, 0)), c);
    }
    const frameAt = (road, s) => { road.atS(s, pp); return { px: pp.px, py: pp.py, pz: pp.pz, hw: pp.hw, rx: pp.rhx, rz: pp.rhz, tx: pp.rhz, tz: -pp.rhx }; };
    function crowd(sA, sB, step) {
      crowdSc = 0.82;   // spectators on the wall tops behind the kerb, waving at the carts
      for (const sg of [-1, 1]) for (let s = sA + rnd(); s < sB; s += step * (0.7 + rnd() * 0.6)) {
        const f = frameAt(main, s), d = sg * (f.hw + 1.45 + rnd() * 0.5), x = f.px + f.rx * d, z = f.pz + f.rz * d;
        person(batchOf(s), x, f.py + wallTop(main, s, sg), z, Math.atan2(-sg * f.rx, -sg * f.rz) + (rnd() - 0.5) * 0.7, rnd() < 0.45);
      }
    }
    const crowdEnd = () => { crowdSc = 0; };
    function archAt(s, text, bg, fg) {
      const f = frameAt(main, s), b = batchOf(s), R = new THREE.Vector3(f.rx, 0, f.rz), T = new THREE.Vector3(f.tx, 0, f.tz);
      const M = new THREE.Matrix4().makeBasis(R, upv, T.clone().negate()).setPosition(f.px, f.py, f.pz), L = (m) => M.clone().multiply(m), half = f.hw + 0.75;
      for (const sx of [-1, 1]) { b.add('woodWeathered', boxG(0.35, 6.4, 0.35, 1.5), L(xf(sx * (half - 0.1), 2.8, 0)), [0.8, 0.28, 0.22]); b.add('dark', boxG(0.5, 0.3, 0.5, 1), L(xf(sx * (half - 0.1), 6.1, 0)), [0.95, 0.95, 0.9]); }
      b.add('woodWeathered', boxG(2 * half, 0.35, 0.4, 1.5), L(xf(0, 6.1, 0)), [0.8, 0.28, 0.22]);
      const mat = new THREE.MeshStandardMaterial({ map: bannerTexture(text, bg, fg), roughness: 0.9, side: THREE.DoubleSide });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * half - 0.5, 1.5), mat); m.applyMatrix4(L(xf(0, 5.1, 0.02))); m.name = 'banner_' + text; parent.add(m);
      items.push({ center: new THREE.Vector3(f.px, f.py, f.pz), radius: 12, groups: [{ obj: m, max: 330 }] });
      for (const o of [-9, 9]) crossStreet(main, s + o, 5.7, 0.5, bunt, 0.7);
      // chequered / white line painted on the cobbles
      const rows = 2, cols = 21, P = [], UV = [], idx = [];
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) { const d = (k / (cols - 1) * 2 - 1) * (f.hw), ss = s + (r ? 0.45 : -0.45), g = frameAt(main, ss), x = g.px + g.rx * d, z = g.pz + g.rz * d; P.push(x, terrain.heightAt(x, z) + 0.03, z); UV.push(k / (cols - 1), r); }
      for (let k = 0; k < cols - 1; k++) idx.push(k, k + cols, k + 1, k + 1, k + cols, k + cols + 1);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(idx); g.computeVertexNormals();
      if (typeof document === 'undefined') return;   // headless checks: no canvas
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 16; const cx = cv.getContext('2d');
      for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { cx.fillStyle = (i + j) % 2 ? '#111' : '#f4f1e6'; cx.fillRect(i * 8, j * 8, 8, 8); }
      const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.magFilter = THREE.NearestFilter;
      const ln = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tx, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); ln.name = 'line_' + text; parent.add(ln);
      items.push({ center: new THREE.Vector3(f.px, f.py, f.pz), radius: 10, groups: [{ obj: ln, max: 330 }] });
    }
    // start: gate beyond the front row, crowd on both walls, a house closing the view behind the grid
    archAt(32, 'START', '#f4f1e6', '#b3261e');
    crowd(-30, 70, 1.6); crowdEnd();
    // finish: arch + banner + bigger crowd, town hall closing the view past the end of the street
    archAt(LEN, 'FINISH', '#f4f1e6', '#111111');
    crowd(LEN - 45, LEN + 35, 1.3); crowdEnd();
    {
      const clo = (sEnd, dir, w, floors) => {   // building straddling the street axis just beyond the last road sample, front facing the street
        const f = frameAt(main, sEnd), T = new THREE.Vector3(f.tx, 0, f.tz).multiplyScalar(dir), R = new THREE.Vector3(f.rx, 0, f.rz).multiplyScalar(-dir);
        const base = new THREE.Vector3(f.px + T.x * 6.5, f.py, f.pz + T.z * 6.5), M = new THREE.Matrix4().makeBasis(R, upv, T).setPosition(base);
        M.elements[13] = terrain.heightAt(base.x, base.z) - 0.05;
        house(batchOf(sEnd), M, w, 10, floors, true, true, winOf(sEnd));
        const poly = reg.boxPoly(M, 0, 4.85, w / 2 + 0.05, 5.15); placed.push({ x: base.x + T.x * 5, z: base.z + T.z * 5, r: 9 });
        if (reg.fits(poly, 0.31, 0.8)) reg.poly('house', poly, M.elements[13] - 4.1, [base.x - T.x * 0.3, base.z - T.z * 0.3], { sunk: true });
      };
      clo(-PRE, -1, 17, 3); clo(LEN + POST, 1, 19, 3);
    }
    // signposts: a tall banner across Main Street 40 m before each split (one line per destination, arrow on the side it really lies), plus a fingerpost on the gore at the fork
    const fork = new Map();   // split id -> {x, z, yaw, y}: tip of the gore where the fingerpost stands
    for (const sp of SPLITS) {
      const s0 = sp.fromS - 40, f = frameAt(main, s0), rows = [{ name: 'Main Street', lat: 0 }];
      for (const bd of branches) if (bd.splitId === sp.id) {
        bd.road.atS(30, qq); const lat = (qq.px - f.px) * f.rx + (qq.pz - f.pz) * f.rz;   // true side of the branch ~30 m into it
        let tip = null;   // first point along the branch where the gap to Main Street exceeds 5 m: the gore pocket opens here
        for (let sx = 6; sx < 90; sx += 1) { bd.road.atS(sx, pp); const c = reg.clear(pp.px, pp.pz, bd.road.id) - pp.hw; if (c > 3.9) { tip = { sx, hw: pp.hw, px: pp.px, pz: pp.pz, rx: pp.rhx, rz: pp.rhz, py: pp.py }; break; } }
        rows.push({ name: bd.name, lat: Math.abs(lat) < 5 ? (lat >= 0 ? 6 : -6) : lat, tip, bd });
      }
      rows.sort((p1, p2) => p1.lat - p2.lat);
      const fp = rows.filter((r) => r.tip).sort((p1, p2) => p1.tip.sx - p2.tip.sx)[0];
      if (fp) {   // fingerpost between the two diverging roads at the tip of the gore, facing the approaching carts
        const mdir = frameAt(main, sp.fromS + 22), t = fp.tip, sgM = Math.sign((mdir.px - t.px) * t.rx + (mdir.pz - t.pz) * t.rz) || 1;
        fork.set(sp.id, { rows, tip: fp.tip, bd: fp.bd, sgM });
      }
      if (typeof document === 'undefined') continue;
      const cv = document.createElement('canvas'); cv.width = 1152; cv.height = 336; const g = cv.getContext('2d');
      g.fillStyle = '#efe3c6'; g.fillRect(0, 0, 1152, 336); g.strokeStyle = '#4a3320'; g.lineWidth = 10; g.strokeRect(7, 7, 1138, 322);
      g.fillStyle = '#2a1d10'; g.font = 'bold 84px Georgia, serif'; g.textBaseline = 'middle';
      rows.forEach((r, i) => {
        const y = 62 + i * 106, left = r.lat < -5, right = r.lat > 5;
        g.textAlign = left ? 'left' : right ? 'right' : 'center';
        g.fillText(left ? '\u25C0  ' + r.name : right ? r.name + '  \u25B6' : '\u25B2  ' + r.name, left ? 36 : right ? 1116 : 576, y);
        if (i < rows.length - 1) { g.fillRect(40, y + 52, 1072, 4); }
      });
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const R = new THREE.Vector3(f.rx, 0, f.rz), T = new THREE.Vector3(f.tx, 0, f.tz), M = new THREE.Matrix4().makeBasis(R, upv, T.clone().negate()).setPosition(f.px, f.py + 4.9, f.pz);
      const W = 2 * (f.hw + 0.7), m = new THREE.Mesh(new THREE.PlaneGeometry(W, W * 336 / 1152), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide })); m.applyMatrix4(M); m.name = 'signpost_' + sp.id; parent.add(m);
      const bb = batchOf(s0);
      for (const sx of [-1, 1]) bb.add('woodWeathered', boxG(0.3, 6.2, 0.3, 1.5), M.clone().multiply(xf(sx * (W / 2 + 0.1), -1.6, 0)), [0.5, 0.36, 0.24]);
      bb.add('woodWeathered', boxG(W + 0.5, 0.2, 0.3, 1), M.clone().multiply(xf(0, W * 336 / 1152 / 2 + 0.1, 0)), [0.45, 0.32, 0.2]);
      items.push({ center: new THREE.Vector3(f.px, f.py, f.pz), radius: 8, groups: [{ obj: m, max: 240 }] });
    }
    // fingerposts at the fork: a post on the gore tip with one board per street, pointing the way (painted on both faces so it reads from the cockpit)
    for (const sp of SPLITS) {
      const fk = fork.get(sp.id); if (!fk) continue;
      const t = fk.tip, sgM = fk.sgM, d0 = sgM * (t.hw + 2.2), x = t.px + t.rx * d0, z = t.pz + t.rz * d0, y = terrain.heightAt(x, z), fr = frameAt(main, sp.fromS + 30);
      const ryaw = Math.atan2(fr.tz, fr.tx);   // boards run across Main Street; the plank faces the approaching traffic
      const b = batchOf(sp.fromS + 24);
      b.add('woodWeathered', cylG(0.1, 0.13, 3.4, 6, 1), xf(x, y + 1.7, z), [0.45, 0.33, 0.22]);
      b.add('concrete', cylG(0.34, 0.4, 0.5, 8, 1), xf(x, y + 0.25, z), [0.85, 0.82, 0.75]);
      b.add('dark', sphG(0.14, 6, 5, 1), xf(x, y + 3.45, z), [0.25, 0.2, 0.15]);
      b.add('concrete', cylG(0.3, 0.3, 3.0, 8, 1), xf(x, y - 1.4, z), [0.8, 0.77, 0.7]);
      reg.circle('fingerpost', x, z, 0.4, y - 2.9, { sunk: true }, 8);
      if (typeof document === 'undefined') continue;
      fk.rows.forEach((r, i) => {
        const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const g = cv.getContext('2d');
        const left = r.lat < -5, right = r.lat > 5;
        g.fillStyle = '#efe3c6'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#4a3320'; g.lineWidth = 8; g.strokeRect(5, 5, 502, 118);
        g.fillStyle = '#2a1d10'; g.font = 'bold 54px Georgia, serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
        g.fillText(left ? '\u25C0 ' + r.name : right ? r.name + ' \u25B6' : '\u25B2 ' + r.name, 256, 66);
        const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.5), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.9, side: THREE.DoubleSide }));
        m.position.set(x + fr.rx * (left ? -0.8 : right ? 0.8 : 0), y + 3.05 - i * 0.58, z + fr.rz * (left ? -0.8 : right ? 0.8 : 0));
        m.rotation.y = Math.atan2(-fr.tx, -fr.tz); m.name = 'finger_' + sp.id + '_' + i; parent.add(m);
        items.push({ center: new THREE.Vector3(x, y, z), radius: 3, groups: [{ obj: m, max: 120 }] });
      });
    }
    const flushLines = () => {
      if (!clothP.length) return;
      const g = new THREE.BufferGeometry(), idx = [];
      for (let i = 0; i < clothP.length / 12; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
      g.setAttribute('position', new THREE.Float32BufferAttribute(clothP, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(clothC, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(clothN, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(clothP.length / 3 * 2), 2)); g.setIndex(idx); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, lib.get('dark', { vertexColors: true, side: THREE.DoubleSide })); m.name = 'cloth'; parent.add(m);
      items.push({ always: true, center: new THREE.Vector3(), radius: 0, groups: [{ obj: m, max: 1e12 }] });
    };
// ---- branch identities ----
    const waters = [];
    const progOf = (road, sx) => (road.map ? road.map.fromS + (sx / road.map.len) * (road.map.toS - road.map.fromS) : sx);
    const stripBatch = (road, key, col, sA, sB, step, ptsFn) => {   // swept strip along a road, rows of [x,y,z] points from ptsFn(s, pp)
      const P = [], Nn = [], U = [], I = []; let K = 0, rows = 0;
      for (let sx = sA; sx <= sB + 1e-6; sx += step) { road.atS(sx, pp); const pts = ptsFn(sx, pp); K = pts.length; for (const q of pts) { P.push(q[0], q[1], q[2]); Nn.push(0, 1, 0); U.push(sx / 3, q[1] / 3); } rows++; }
      for (let r = 0; r < rows - 1; r++) for (let k = 0; k < K - 1; k++) { const a = r * K + k; I.push(a, a + K, a + 1, a + 1, a + K, a + K + 1); }
      let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g = g.toNonIndexed(); g.computeVertexNormals();
      batchOf(progOf(road, (sA + sB) / 2)).add(key, g, null, col);
    };
    for (const bd of branches) {
      const road = bd.road, k = road.kind;
      if (k === 'river') {
        const rs = road.riverSide, WA = RIV_WA, WB = RIV_WB;   // water from 0.8 m beyond the street edge to the far-bank wall at 7.2 m
        if (!road.waterRun) continue;
        const [sA, sB] = road.waterRun;
        if (sB - sA < 12) continue;
        // water: flat ribbon just below the street level (the parapet is only 0.5 m high, so it shows from the cockpit)
        const P = [], I = [], U = []; let rows = 0;
        for (let sx = sA; sx <= sB + 1e-6; sx += 3) { road.atS(sx, pp); for (const dd of [WA, WB]) { const d = rs * (pp.hw + dd); P.push(pp.px + pp.rhx * d, pp.py + 0.02, pp.pz + pp.rhz * d); U.push(dd > 3 ? 1.6 : 0, sx / 3); } rows++; }
        for (let r = 0; r < rows - 1; r++) { const a = r * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals();
        const wm = lib.get('water', { polygonOffset: -3 }), wmesh = new THREE.Mesh(g, wm); wmesh.name = 'river_' + bd.splitId; wmesh.receiveShadow = true; parent.add(wmesh); waters.push(wm);
        road.atS(road.length / 2, pp); items.push({ center: new THREE.Vector3(pp.px, pp.py, pp.pz), radius: road.length / 2 + 20, groups: [{ obj: wmesh, max: 300 }] });
        // far-bank stone wall + end walls
        stripBatch(road, 'concrete', [0.85, 0.82, 0.76], sA, sB, 4, (sx, q) => { const f = (dd) => { const d = rs * (q.hw + dd); return [q.px + q.rhx * d, q.py, q.pz + q.rhz * d]; }; const a = f(WB - 0.02), b2 = f(WB - 0.02), c = f(WB + 0.45), e = f(WB + 0.45); a[1] -= 0.9; b2[1] -= 0.05; c[1] -= 0.05; e[1] -= 0.9; return [a, b2, c, e]; });
        for (const sx of [sA, sB]) { road.atS(sx, pp); const R = pp.rhx, Z = pp.rhz, d = rs * (pp.hw + (WA + WB) / 2); batchOf(progOf(road, sx)).add('concrete', boxG(WB - WA + 0.5, 1.2, 0.6, 1.5), xf(pp.px + R * d, pp.py - 0.3, pp.pz + Z * d, 0, Math.atan2(-Z, R), 0), [0.8, 0.78, 0.72]); }
        // footbridge across the water to the far bank (deck just above the parapet cap), at a spot without a house
        for (const f of [0.5, 0.42, 0.58, 0.35, 0.65]) {
          const sx = road.length * f; road.atS(sx, pp);
          const fx = pp.px + pp.rhx * rs * (pp.hw + WB + 1), fz = pp.pz + pp.rhz * rs * (pp.hw + WB + 1);
          if (inSpan(road, rs, sx) || reg.clear(fx, fz) < 0.5 || lowEdge(road, sx, rs) < 0.9) continue;
          const yaw = Math.atan2(-pp.rhz, pp.rhx), M = xf(pp.px, pp.py, pp.pz, 0, yaw, 0), L = (m) => M.clone().multiply(m), b = batchOf(progOf(road, sx)), c0 = rs * (pp.hw + (WA + WB) / 2 + 0.7), len = WB - WA + 3.0;
          b.add('woodWeathered', boxG(len, 0.18, 2.2, 1.2), L(xf(c0, 0.62, 0)), [0.66, 0.52, 0.36]);
          for (const sz of [-1, 1]) { b.add('woodWeathered', boxG(len, 0.14, 0.14, 1), L(xf(c0, 1.62, sz * 1.0)), [0.5, 0.38, 0.28]); b.add('woodWeathered', boxG(len, 0.1, 0.1, 1), L(xf(c0, 1.15, sz * 1.0)), [0.5, 0.38, 0.28]); }
          for (let i = 0; i < 8; i++) for (const sz of [-1, 1]) b.add('woodWeathered', boxG(0.12, 1.1, 0.12, 1), L(xf(c0 - len / 2 + 0.3 + i * (len - 0.6) / 7, 1.1, sz * 1.0)), [0.5, 0.38, 0.28]);
          for (const sz of [-1, 1]) for (const e of [-1, 1]) b.add('concrete', boxG(0.5, 1.4, 0.5, 1), L(xf(c0 + e * (len / 2 - 0.25), 0.0, sz * 0.9)), [0.8, 0.77, 0.7]);   // stone piers at both ends
          break;
        }
        // weeping willows on the far bank: trunk, a dome and drooping curtains of long leaves (dull olive green)
        for (let sx = 36; sx < road.length - 28; sx += 30 + rnd() * 12) {
          if (inSpan(road, rs, sx)) continue;
          road.atS(sx, pp); const d = rs * (pp.hw + WB + 2.2), x = pp.px + pp.rhx * d, z = pp.pz + pp.rhz * d, y = pp.py - 0.5, b = batchOf(progOf(road, sx)), cl = reg.clear(x, z);
          if (cl < 2.5) continue;
          b.add('woodWeathered', cylG(0.22, 0.42, 3.4, 6, 1), xf(x, y + 1.7, z, 0, 0, 0.08), [0.36, 0.3, 0.24]);
          b.add('dark', sphG(1.9, 7, 5, 1), xf(x, y + 4.3, z, 0, 0, 0, 1, 0.55, 1), [0.04, 0.08, 0.03]);
          for (let i = 0; i < 16; i++) { const a = i * 0.39 + sx, rr = 1.5 + 0.35 * ((i * 7) % 3); b.add('dark', sphG(1, 4, 4, 1), xf(x + Math.cos(a) * rr, y + 2.9, z + Math.sin(a) * rr, 0, 0, 0, 0.2, 1.9, 0.2), i % 2 ? [0.04, 0.08, 0.03] : [0.06, 0.11, 0.04]); }
        }
      } else if (k === 'market') {
        const apron = [], aI = []; let rows = 0;
        const rowsS = []; for (let sx = 4; sx <= road.length - 4; sx += 2) rowsS.push(sx);
        for (const sg of [-1, 1]) {
          const base = apron.length / 3;
          for (const sx of rowsS) {
            road.atS(sx, pp); const le = lowEdge(road, sx, sg), d0 = pp.hw + 0.8; let d1 = d0 + 0.05 + 7.4 * Math.min(1, le * 1.4);
            for (let d = d0; d <= d1; d += 0.5) { const x = pp.px + pp.rhx * sg * d, z = pp.pz + pp.rhz * sg * d; if (reg.clear(x, z) < 0.6 && d > d0 + 0.5) { d1 = d - 0.5; break; } }
            for (const dd of [d0, d1]) apron.push(pp.px + pp.rhx * sg * dd, pp.py + 0.03, pp.pz + pp.rhz * sg * dd);
          }
          for (let r = 0; r < rowsS.length - 1; r++) { const a = base / 2 + r * 2; aI.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        }
        const ag = new THREE.BufferGeometry(), AP = new Float32Array(apron), AU = new Float32Array(apron.length / 3 * 2), AC = new Float32Array(apron.length);
        for (let i = 0; i < apron.length / 3; i++) { AU[i * 2] = apron[i * 3] / 2.6; AU[i * 2 + 1] = apron[i * 3 + 2] / 2.6; AC[i * 3] = 1.2; AC[i * 3 + 1] = 1.08; AC[i * 3 + 2] = 0.88; }
        ag.setAttribute('position', new THREE.BufferAttribute(AP, 3)); ag.setAttribute('uv', new THREE.BufferAttribute(AU, 2)); ag.setAttribute('color', new THREE.BufferAttribute(AC, 3)); ag.setIndex(aI); ag.computeVertexNormals();
        const am = new THREE.Mesh(ag, lib.get('cobbles', { vertexColors: true, polygonOffset: -3 })); am.name = 'plaza_' + bd.splitId; am.receiveShadow = true; parent.add(am);
        road.atS(road.length / 2, pp); items.push({ center: new THREE.Vector3(pp.px, pp.py, pp.pz), radius: road.length / 2 + 20, groups: [{ obj: am, max: 300 }] });
        // plaza furniture: well, stalls with awnings, benches, barrels, villagers
        const midS = road.length * 0.5;
        for (const sg of [-1, 1]) for (let sx = road.length * 0.28; sx < road.length * 0.72; sx += 7 + rnd() * 4) {
          road.atS(sx, pp); if (lowEdge(road, sx, sg) < 0.95) continue;
          const yaw = Math.atan2(-pp.rhz, pp.rhx), dd = sg * (pp.hw + 2.0 + rnd() * 2.2), x = pp.px + pp.rhx * dd, z = pp.pz + pp.rhz * dd;
          if (reg.clear(x, z) < 1.2 || !free(x, z, 1.5)) continue;
          const M = xf(x, pp.py + 0.03, z, 0, yaw, 0), L = (m) => M.clone().multiply(m), b = batchOf(progOf(road, sx)), pick = rnd();
          if (Math.abs(sx - midS) < 6 && sg === 1) {   // well
            b.add('concrete', cylG(1.1, 1.2, 0.9, 10, 2), L(xf(0, 0.45, 0)), [0.82, 0.8, 0.74]); b.add('dark', cylG(0.85, 0.85, 0.05, 10, 1), L(xf(0, 0.9, 0)), [0.12, 0.2, 0.26]);
            for (const sx2 of [-1, 1]) b.add('woodWeathered', boxG(0.14, 2.3, 0.14, 1), L(xf(sx2 * 1.0, 1.6, 0)), [0.5, 0.38, 0.26]);
            for (const sl of [-1, 1]) b.add('roofTile', boxG(1.4, 0.1, 1.5, 1), L(xf(0, 2.9, sl * 0.4, sl * 0.5, 0, 0)), [1, 1, 1]); placed.push({ x, z, r: 2 }); continue;
          }
          if (pick < 0.55) {
            const ac = [[0.85, 0.2, 0.18], [0.2, 0.45, 0.8], [0.9, 0.7, 0.15], [0.25, 0.6, 0.35]][Math.floor(rnd() * 4)];
            b.add('woodWeathered', boxG(2.4, 0.9, 1.4, 1.5), L(xf(0, 0.45, 0)), [0.65, 0.5, 0.38]);
            for (const [px, pz] of [[-1.15, -0.65], [1.15, -0.65], [-1.15, 0.65], [1.15, 0.65]]) b.add('woodWeathered', boxG(0.08, 2.4, 0.08, 1), L(xf(px, 1.2, pz)), [0.6, 0.45, 0.3]);
            for (let i = 0; i < 6; i++) b.add('dark', boxG(2.6 / 6 - 0.02, 0.06, 1.8, 1), L(xf(-1.1 + (i + 0.5) * 2.6 / 6, 2.45, 0, 0, 0, 0.1)), i % 2 ? [1.8, 1.8, 1.7] : ac);
            for (let i = 0; i < 8; i++) { const fc = [[0.9, 0.25, 0.15], [0.95, 0.75, 0.1], [0.4, 0.7, 0.2], [0.85, 0.5, 0.15]][i % 4]; b.add('dark', boxG(0.3, 0.22, 0.3, 1), L(xf(-0.95 + i * 0.27, 0.99, (i % 2) * 0.4 - 0.2)), fc); }
            person(b, x + pp.rhx * -sg * 0.9 + pp.rhz * 0.5, pp.py + 0.03, z + pp.rhz * -sg * 0.9 - pp.rhx * 0.5, yaw + (sg > 0 ? Math.PI : 0), true);
          } else if (pick < 0.8) {
            b.add('woodWeathered', boxG(0.5, 0.45, 1.8, 1), L(xf(0, 0.22, 0)), [0.6, 0.45, 0.3]); b.add('woodWeathered', boxG(0.1, 0.5, 1.8, 1), L(xf(-sg * 0.25, 0.7, 0)), [0.55, 0.42, 0.28]);
          } else { for (let i = 0; i < 3; i++) b.add('woodWeathered', cylG(0.34, 0.34, 0.8, 9, 1), L(xf((i - 1) * 0.7, 0.43, 0)), [0.55, 0.38, 0.24]); }
          placed.push({ x, z, r: 1.6 });
        }
      } else if (k === 'alley') {
        // timber beams (with knee braces) over the lane every 12-17 m, posts where no house stands, a washing line between every pair of beams
        const post = (sx, sg, h) => {   // wooden post standing on the wall cap
          road.atS(sx, pp); const d = sg * (pp.hw + ROW + 0.4);
          batchOf(progOf(road, sx)).add('woodWeathered', boxG(0.22, h + 2.2, 0.22, 1), xf(pp.px + pp.rhx * d, pp.py + (h - 2.2) / 2, pp.pz + pp.rhz * d), [0.42, 0.3, 0.2]);
        };
        const beamFree = (sx) => { road.atS(sx, pp); for (const e of [-1, 1]) for (const dd of [pp.hw + 0.5, pp.hw + 1.6]) if (reg.clear(pp.px + pp.rhx * e * dd, pp.pz + pp.rhz * e * dd, road.id) < 2.5) return false; return true; };   // no beams / washing lines where Main Street or another lane runs close
        for (let sx = 13 + rnd() * 4, n = 0; sx < road.length - 13; sx += 12 + rnd() * 5, n++) {
          road.atS(sx, pp); const yaw = Math.atan2(-pp.rhz, pp.rhx), M = xf(pp.px, pp.py, pp.pz, 0, yaw, 0), L = (m) => M.clone().multiply(m), hw2 = pp.hw + ROW + 0.35, b = batchOf(progOf(road, sx));
          if (reg.clear(pp.px, pp.pz, road.id) < 1) continue;   // not in a junction mouth
          if (!beamFree(sx)) continue;
          const bh = 4.3 + 0.15 * (n % 2);
          b.add('woodWeathered', boxG(2 * hw2 + 0.9, 0.2, 0.24, 1), L(xf(0, bh, 0)), [0.4, 0.28, 0.18]);
          for (const e of [-1, 1]) { b.add('woodWeathered', boxG(1.3, 0.13, 0.16, 1), L(xf(e * (hw2 - 0.55), bh - 0.45, 0, 0, 0, -e * 0.7)), [0.38, 0.27, 0.18]); if (!inSpan(road, e, sx)) post(sx, e, bh + 0.1); }
          const sl = sx + 6;   // washing line between beams
          if (sl < road.length - 10 && beamFree(sl)) {
            for (const e of [-1, 1]) if (!inSpan(road, e, sl)) post(sl, e, 5.0);
            crossStreet(road, sl, 4.9, 0.55, () => ({ col: [[0.95, 0.95, 0.9], [0.9, 0.5, 0.5], [0.5, 0.65, 0.9], [0.95, 0.85, 0.5], [0.4, 0.7, 0.45]][Math.floor(rnd() * 5)], wdt: 0.42, hgt: 0.85 }), 0.4);
          }
        }
        for (const z of road.field.zones) {
          if (!z.stairs) continue;
          for (let sx = z.s - z.a * 0.5; sx < z.s + z.a * 0.5; sx += 0.3) {
            if (Math.sin(sx * 3.4) < 0.5 || Math.sin((sx - 0.3) * 3.4) >= 0.5) continue;   // one slab per ridge
            road.atS(sx, pp); const yaw = Math.atan2(-pp.rhz, pp.rhx), x = pp.px, z2 = pp.pz, y = terrain.heightAt(x, z2);
            batchOf(progOf(road, sx)).add('concrete', boxG(2 * pp.hw - 0.2, 0.16, 0.7, 1), xf(x, y - 0.08, z2, 0, yaw, 0), [0.88, 0.85, 0.78]);
          }
        }
        // bins and barrels in the corners
        for (let sx = 22; sx < road.length - 20; sx += 19 + rnd() * 8) {
          const sg = rnd() < 0.5 ? -1 : 1; if (!inSpan(road, sg, sx)) continue; road.atS(sx, pp);
          const d = sg * (pp.hw + 0.38), x = pp.px + pp.rhx * d, z = pp.pz + pp.rhz * d; if (reg.clear(x, z) < 0.3) continue;
          batchOf(progOf(road, sx)).add('woodWeathered', cylG(0.28, 0.28, 0.8, 8, 1), xf(x, terrain.heightAt(x, z) + 0.4, z), [0.45, 0.32, 0.22]);
        }
      }
    }
    flushLines();

    // ---- build batches into chunks ----
    for (const [k, b] of batches) {
      const grp = b.build(lib, { shadow: false, opts: { concrete: { side: THREE.DoubleSide }, plaster: { side: THREE.DoubleSide } } }); grp.name = 'village_' + k;
      main.atS(k * CH + CH / 2, pp); parent.add(grp);
      items.push({ center: new THREE.Vector3(pp.px, pp.py, pp.pz), radius: CH / 2 + 35, groups: [{ obj: grp, max: 85 }] });
    }
    const trees = scatterTrees({ net: nw, terrain, lib, parent, seed: sd, chunk: 125, perChunk: 70, minClear: 11, maxOff: 70, mix: [0.3, 0.2, 1.4, 1, 0.8, 1, 1, 1.2], salt: 9, exclude: (x, z) => !free(x, z, 3) });
    for (const t of trees) items.push({ center: t.center, radius: t.radius, groups: [{ obj: t.near, max: 80 }, { obj: t.far, min: 70, max: 380 }] });
    {
      const gm = glow.build(lib, { shadow: false }); gm.name = 'village_glow';
      gm.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ vertexColors: true }); });
      parent.add(gm); items.push({ always: true, center: new THREE.Vector3(), radius: 0, groups: [{ obj: gm, max: 1e12 }] });
    }
    const winMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
    const winGroups = [];
    for (const [k, b] of winB) {
      const grp = b.build(lib, { shadow: false }); grp.name = 'village_win_' + k;
      grp.traverse((o) => { if (o.isMesh) { o.material = winMat; o.renderOrder = 2; } });
      grp.visible = false; winGroups.push(grp);
      main.atS(k * CH + CH / 2, pp); parent.add(grp);
      items.push({ center: new THREE.Vector3(pp.px, pp.py, pp.pz), radius: CH / 2 + 35, groups: [{ obj: grp, max: 140 }], win: true });
    }
    return {
      items,
      update: (dt, camPos, time) => {
        for (const m of waters) if (m.map) m.map.offset.y = -time * 0.15;
        const n = G.gfxNight ? G.gfxNight.value : 0;
        winMat.opacity = 0.95 * Math.min(1, Math.max(0, n * 1.6));
        for (const it of items) if (it.win && winMat.opacity < 0.02) for (const g of it.groups) g.obj.visible = false;   // world.update ran first: keep the lit windows hidden by day
      },
    };
  }

  return {
    id: 'village', name: 'Hill Village', net, registry, pads: [], terrainOpts, theme, surface, flags: { closed: false, laps: 1, flat: false, noStuckRescue: false, wallSurface: true },
    splits, hazards: hz, startPos, landmarks: [{ type: 'market', s: 620, lateral: 0 }, { type: 'church', s: 1090, lateral: 20 }, { type: 'fountain', s: 1075, lateral: -8 }, { type: 'finish', s: LEN, lateral: 0 }],
    decorate, ranges: { ground: 330 },
  };
}
