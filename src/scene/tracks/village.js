// Hill Village: gentle cobbled main street with 3 splits (market square / riverside lane / back alley), buildings, church, fountain.
import * as THREE from 'three';
import { mulberry32, clamp, smoothstep, lerp } from '../util.js';
import { makeRoad, buildNetwork } from '../roadnet.js';
import { createHazardField, SURFACES } from '../hazards.js';
import { Batch, boxG, cylG, sphG, prismG, xf } from '../batch.js';
import { bannerTexture } from '../materials.js';
import { scatterTrees } from './scatter.js';
import { createRegistry } from './registry.js';

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
      road.surf = pd.kind === 'alley' ? { type: 'cobble', friction: 0.78, drag: 0.03, bump: 0.38 } : pd.kind === 'river' ? { type: 'cobble', friction: 0.86, drag: 0.0, bump: 0.1 } : { type: 'cobble', friction: 0.8, drag: 0.02, bump: 0.22 };
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
  main.field = createHazardField(main, seed + 11, { order: ['puddle', 'rock', 'puddle', 'stall', 'rock', 'puddle'], start: 190, startJit: 25, gap1: 55, gap2: 60, endGap: 110, stallEdge: true, noStall: SPLITS.flatMap((sp) => [[sp.fromS - 30, sp.fromS + 115], [sp.toS - 115, sp.toS + 30]]) });
  addHaz(main, main.field);
  for (const b of branches) {
    const kind = b.road.kind;
    const opts = kind === 'market' ? { order: ['stall', 'puddle', 'stall', 'stall'], start: 92, startJit: 8, gap1: 14, gap2: 8, endGap: 24 }
      : kind === 'alley' ? { order: ['steps', 'rock', 'steps', 'puddle'], start: 28, startJit: 8, gap1: 16, gap2: 10, endGap: 28 }
        : { order: ['puddle', 'puddle', 'rock'], start: 45, startJit: 15, gap1: 60, gap2: 30, endGap: 40 };
    b.road.field = createHazardField(b.road, seed + 31 + b.road.id, opts);
    addHaz(b.road, b.road.field);
  }

  // ---- terrain verge: vertical kerb (0.13 m) + a short pavement, then a steep wall (house plinths / garden walls / parapets) ----
  const WALL = 2.1, OUT = 9, LOW = 0.9;
  const lowEdge = (road, s, sg) => {   // 0..1: how far the street edge is a low parapet instead of a full wall (market square middle third, river side)
    if (road.kind === 'market') { const u = s / road.length; return smoothstep(0.2, 0.3, u) * (1 - smoothstep(0.7, 0.8, u)); }
    if (road.kind === 'river' && sg === road.riverSide) return smoothstep(20, 44, s) * smoothstep(20, 44, road.length - s);
    return 0;
  };
  const wallTop = (road, s, sg) => lerp(WALL, LOW, lowEdge(road, s, sg));
  const verge = (road, s, d, hw) => {
    const r = Math.abs(d) - (hw + 0.1);
    if (r < 0) return 0;
    const kerb = 0.13 * smoothstep(0, 0.06, r);
    const wall = wallTop(road, s, d < 0 ? -1 : 1) * smoothstep(0.55, 0.66, r) * (1 - smoothstep(OUT - 3.5, OUT - 0.4, r));
    return Math.max(kerb, wall);
  };
  const roadColsFn = (hw) => {   // road-strip columns: uniform inside, then dense at the kerb / wall so the profile stays crisp
    const P = []; for (let i = 1; i <= 6; i++) P.push((hw * i) / 7);
    P.push(hw - 0.04, hw + 0.1, hw + 0.16, hw + 0.65, hw + 0.76, hw + 1.1, hw + 1.5);
    return [...P.map((v) => -v).reverse(), 0, ...P];
  };
  const terrainOpts = { hillAmp: 6, hillFar: 16, hillNear: 70, rutScale: 0, noiseScale: 0.4, crown: 0.07, sideSlope: 0.18, shoulderOut: OUT, verge };
  const theme = {
    roadMat: 'cobbles', chunk: 150, tile: 256, cell: 8, terrUV: 6, tileNear: { reach: 9, drop: 0.7 }, tileRadius: 0.5, roadColsFn,
    meshLift: (road, s, d) => {   // solid prop bases are drawn instead of the physics-only terrain pucks under them
      if (!road.field) return 0; let l = 0;
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
    function house(b, M, w, depth, floors, ground, big) {
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
          const w = narrow ? 4.4 + rnd() * 2.6 : 6.2 + rnd() * 4.6, depth = (narrow ? 6 : 7) + rnd() * 3.5, floors = 2 + (rnd() < (narrow ? 0.7 : 0.45) ? 1 : 0), sc = s + w / 2;
          if (sc > sHi - 4) break;
          const extra = setback ? setback(sc, sg) : 0;
          const bs = mkBasis(road, sc, sg, extra);
          const cx = bs.base.x + bs.Z.x * depth / 2, cz = bs.base.z + bs.Z.z * depth / 2;
          const Mq = bs.M.clone(), poly = reg.boxPoly(Mq, 0, (depth - 0.3) / 2, w / 2 + 0.05, (depth + 0.3) / 2), gpt = [bs.base.x - bs.Z.x * 0.3, bs.base.z - bs.Z.z * 0.3];
          let ok = free(cx, cz, Math.hypot(w, depth) / 2) && reg.fits(poly, 0.31, 0.5);
          const prog = road.map ? road.map.fromS + (sc / road.map.len) * (road.map.toS - road.map.fromS) : sc;
          if (ok) {
            const M = bs.M.clone(); M.elements[13] = terrain.heightAt(gpt[0], gpt[1]) - 0.05;
            house(batchOf(prog), M, w, depth, floors, true, big);
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
        frontage(rd, [rd.riverSide], 12, rd.length - 12, false, (s) => (lowEdge(rd, s, rd.riverSide) > 0.9 ? 8.2 : 0));   // far bank, beyond the water
      } else frontage(rd, [-1, 1], 12, rd.length - 12, false, null, k === 'alley');
    }

    frontage(main, [-1, 1], -34, -4, false);
    frontage(main, [-1, 1], 75, LEN - 45, false);
    frontage(main, [-1, 1], LEN + 38, LEN + 66, false);

    // ---- street walls (visible face of the contain-walls) along every road, merged into the chunk batches ----
    for (const road of roads0) {
      const nCh = Math.max(1, Math.round(road.length / 60));
      for (let c = 0; c < nCh; c++) {
        const sa = (road.length * c) / nCh, sb = (road.length * (c + 1)) / nCh, rows = Math.round((sb - sa) / 2) + 1, Pa = [], Na = [], Ua = [], Ia = [];
        for (const sg of [-1, 1]) {
          const base = Pa.length / 3, rowOK = [];
          for (let r = 0; r < rows; r++) {
            const s = sa + ((sb - sa) * r) / (rows - 1); road.atS(s, pp); let ok = !inSpan(road, sg, s);
            const rv = road.kind === 'river' && sg === road.riverSide, tp = wallTop(road, s, sg);
            for (const [dd, hh] of (rv ? [[ROW - 0.04, -0.95], [ROW - 0.02, tp], [ROW + 0.55, tp], [ROW + 0.57, -1.0]] : [[ROW - 0.04, -0.4], [ROW + 0.1, tp], [2.4, tp], [2.45, tp - 0.01]])) { const d = sg * (pp.hw + dd), x = pp.px + pp.rhx * d, z = pp.pz + pp.rhz * d; if (reg.clear(x, z) < 0.31) ok = false; Pa.push(x, pp.py + hh, z); Na.push(0, 1, 0); Ua.push(s / 2.2, hh / 2.2); }
            rowOK.push(ok);
          }
          for (let r = 0; r < rows - 1; r++) { if (!rowOK[r] || !rowOK[r + 1]) continue; for (let q = 0; q < 3; q++) { const a = base + r * 4 + q, b2 = a + 1, c2 = a + 4, d2 = c2 + 1; Ia.push(a, c2, b2, b2, c2, d2); } }
        }
        let g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(Pa, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Na, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(Ua, 2));
        g.setIndex(Ia); g = g.toNonIndexed(); g.computeVertexNormals();
        const prog = road.map ? road.map.fromS + ((sa + sb) / 2 / road.map.len) * (road.map.toS - road.map.fromS) : (sa + sb) / 2;
        batchOf(prog).add('brickwall', g, null, [1.05, 0.95, 0.88]);
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
          const prog = road.map ? road.map.fromS + ((z.s + ds) / road.map.len) * (road.map.toS - road.map.fromS) : z.s + ds, sc = 0.16 + rnd() * 0.2, g = 0.55 + rnd() * 0.3;
          batchOf(prog).add('concrete', boxG(sc, sc * 0.45, sc * 0.8, 1), xf(x, y + sc * 0.1, zz, 0, rnd() * 3, 0), [g, g * 0.97, g * 0.92]);
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
      if (bd.road.kind !== 'alley' && bd.road.kind !== 'market') continue;
      const road = bd.road, alley = road.kind === 'alley';
      for (let s = 20; s < road.length - 18; s += alley ? 15 : 26) {
        if (alley && !(inSpan(road, 1, s) && inSpan(road, -1, s))) continue;   // a line needs a house wall at both ends
        crossStreet(road, s, alley ? 5.2 : 6.5, alley ? 0.5 : 0.7, (i) => (alley
          ? { col: [[0.95, 0.95, 0.9], [0.9, 0.5, 0.5], [0.5, 0.65, 0.9], [0.95, 0.85, 0.5]][Math.floor(rnd() * 4)], wdt: 0.4, hgt: 0.8 }
          : { col: [[0.9, 0.2, 0.2], [0.95, 0.9, 0.7], [0.2, 0.4, 0.8], [0.95, 0.75, 0.2]][i % 4], wdt: 0.32, hgt: 0.5 }));
      }
    }
    const bunt = (i) => ({ col: [[0.9, 0.2, 0.2], [0.95, 0.95, 0.9], [0.2, 0.4, 0.8], [0.95, 0.75, 0.2]][i % 4], wdt: 0.3, hgt: 0.45 });
    const upv = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3();
    const SPECT = [[0.85, 0.25, 0.2], [0.2, 0.4, 0.75], [0.9, 0.75, 0.2], [0.3, 0.6, 0.35], [0.85, 0.5, 0.7], [0.95, 0.95, 0.9], [0.45, 0.3, 0.2]];
    function person(b, x, y, z, yaw, wave) {   // small static villager: legs/body, head, arms (one raised when waving)
      const c = SPECT[Math.floor(rnd() * SPECT.length)], sc = 0.9 + rnd() * 0.2, M = xf(x, y, z, 0, yaw, 0, sc), L = (m) => M.clone().multiply(m);
      b.add('dark', cylG(0.2, 0.26, 0.85, 6, 1), L(xf(0, 0.42, 0)), [0.2, 0.2, 0.28]);
      b.add('dark', cylG(0.24, 0.2, 0.6, 6, 1), L(xf(0, 1.15, 0)), c);
      b.add('dark', sphG(0.16, 6, 5, 1), L(xf(0, 1.6, 0)), [0.95, 0.76, 0.6]);
      b.add('dark', boxG(0.09, 0.5, 0.09, 1), L(xf(-0.3, 1.1, 0)), c);
      if (wave) b.add('dark', boxG(0.09, 0.5, 0.09, 1), L(xf(0.33, 1.65, 0, 0, 0, -0.35)), c); else b.add('dark', boxG(0.09, 0.5, 0.09, 1), L(xf(0.3, 1.1, 0)), c);
    }
    const frameAt = (road, s) => { road.atS(s, pp); return { px: pp.px, py: pp.py, pz: pp.pz, hw: pp.hw, rx: pp.rhx, rz: pp.rhz, tx: pp.rhz, tz: -pp.rhx }; };
    function crowd(sA, sB, step) {   // spectators on the wall tops behind the kerb, waving at the carts
      for (const sg of [-1, 1]) for (let s = sA + rnd(); s < sB; s += step * (0.7 + rnd() * 0.6)) {
        const f = frameAt(main, s), d = sg * (f.hw + 1.45 + rnd() * 0.5), x = f.px + f.rx * d, z = f.pz + f.rz * d;
        person(batchOf(s), x, f.py + WALL, z, Math.atan2(-sg * f.rx, -sg * f.rz) + (rnd() - 0.5) * 0.7, rnd() < 0.45);
      }
    }
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
    crowd(-30, 70, 1.6);
    // finish: arch + banner + bigger crowd, town hall closing the view past the end of the street
    archAt(LEN, 'FINISH', '#f4f1e6', '#111111');
    crowd(LEN - 45, LEN + 35, 1.3);
    {
      const clo = (sEnd, dir, w, floors) => {   // building straddling the street axis just beyond the last road sample, front facing the street
        const f = frameAt(main, sEnd), T = new THREE.Vector3(f.tx, 0, f.tz).multiplyScalar(dir), R = new THREE.Vector3(f.rx, 0, f.rz).multiplyScalar(-dir);
        const base = new THREE.Vector3(f.px + T.x * 6.5, f.py, f.pz + T.z * 6.5), M = new THREE.Matrix4().makeBasis(R, upv, T).setPosition(base);
        M.elements[13] = terrain.heightAt(base.x, base.z) - 0.05;
        house(batchOf(sEnd), M, w, 10, floors, true, true);
        const poly = reg.boxPoly(M, 0, 4.85, w / 2 + 0.05, 5.15); placed.push({ x: base.x + T.x * 5, z: base.z + T.z * 5, r: 9 });
        if (reg.fits(poly, 0.31, 0.8)) reg.poly('house', poly, M.elements[13] - 4.1, [base.x - T.x * 0.3, base.z - T.z * 0.3], { sunk: true });
      };
      clo(-PRE, -1, 17, 3); clo(LEN + POST, 1, 19, 3);
    }
    // signposts: a banner across Main Street 34 m before each split naming the streets and which way they lie
    for (const sp of SPLITS) {
      const s0 = sp.fromS - 34, f = frameAt(main, s0), items3 = [{ name: 'Main Street', lat: 0 }];
      for (const bd of branches) if (bd.splitId === sp.id) { bd.road.atS(bd.road.length * 0.5, qq); items3.push({ name: bd.name, lat: (qq.px - f.px) * f.rx + (qq.pz - f.pz) * f.rz, alley: bd.road.kind === 'alley' }); }
      if (typeof document === 'undefined') continue;
      const L = items3.filter((i) => i.lat < -6), Rr = items3.filter((i) => i.lat > 6), C = items3.filter((i) => i.lat >= -6 && i.lat <= 6);
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 160; const g = cv.getContext('2d');
      g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, 1024, 160); g.strokeStyle = '#4a3320'; g.lineWidth = 8; g.strokeRect(6, 6, 1012, 148);
      g.fillStyle = '#2a1d10'; g.font = 'bold 62px Georgia, serif'; g.textBaseline = 'middle';
      const col = (arr, x, al, fmt) => { g.textAlign = al; arr.forEach((it, i) => g.fillText(fmt(it), x, 80 - (arr.length - 1) * 33 + i * 66)); };
      col(L, 28, 'left', (i) => '\u25C0 ' + i.name); col(Rr, 996, 'right', (i) => i.name + ' \u25B6'); col(C, 512, 'center', (i) => '\u25B2 ' + i.name);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const R = new THREE.Vector3(f.rx, 0, f.rz), T = new THREE.Vector3(f.tx, 0, f.tz), M = new THREE.Matrix4().makeBasis(R, upv, T.clone().negate()).setPosition(f.px, f.py + 4.6, f.pz);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * (f.hw + 0.6) - 0.2, 1.4), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide })); m.applyMatrix4(M); m.name = 'signpost_' + sp.id; parent.add(m);
      items.push({ center: new THREE.Vector3(f.px, f.py, f.pz), radius: 8, groups: [{ obj: m, max: 220 }] });
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
        const rs = road.riverSide, sA = 16, sB = road.length - 16;
        // water: flat ribbon just above the sunk near-field ground, between the parapet and the far-bank wall
        const P = [], I = [], U = []; let rows = 0;
        for (let sx = sA; sx <= sB + 1e-6; sx += 3) { road.atS(sx, pp); for (const dd of [0.95, 5.9]) { const d = rs * (pp.hw + dd); P.push(pp.px + pp.rhx * d, pp.py - 0.3, pp.pz + pp.rhz * d); U.push(dd > 3 ? 1.4 : 0, sx / 3); } rows++; }
        for (let r = 0; r < rows - 1; r++) { const a = r * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals();
        const wm = lib.get('water', { polygonOffset: -3 }), wmesh = new THREE.Mesh(g, wm); wmesh.name = 'river_' + bd.splitId; wmesh.receiveShadow = true; parent.add(wmesh); waters.push(wm);
        road.atS(road.length / 2, pp); items.push({ center: new THREE.Vector3(pp.px, pp.py, pp.pz), radius: road.length / 2 + 20, groups: [{ obj: wmesh, max: 300 }] });
        // far-bank stone wall + end walls
        stripBatch(road, 'concrete', [0.85, 0.82, 0.76], sA, sB, 4, (sx, q) => { const f = (dd) => { const d = rs * (q.hw + dd); return [q.px + q.rhx * d, q.py, q.pz + q.rhz * d]; }; const a = f(5.88), b2 = f(5.88), c = f(6.35), e = f(6.35); a[1] -= 0.9; b2[1] -= 0.05; c[1] -= 0.05; e[1] -= 0.9; return [a, b2, c, e]; });
        for (const sx of [sA, sB]) { road.atS(sx, pp); const R = pp.rhx, Z = pp.rhz, d = rs * (pp.hw + 3.4); batchOf(progOf(road, sx)).add('concrete', boxG(5.4, 1.2, 0.6, 1.5), xf(pp.px + R * d, pp.py - 0.3, pp.pz + Z * d, 0, Math.atan2(-Z, R), 0), [0.8, 0.78, 0.72]); }
        // footbridge to the far bank, at a spot without a house
        for (const f of [0.5, 0.42, 0.58, 0.35, 0.65]) {
          const sx = road.length * f; if (inSpan(road, rs, sx) || reg.clear(0, 0) < -1) continue;
          road.atS(sx, pp); const yaw = Math.atan2(-pp.rhz, pp.rhx), M = xf(pp.px, pp.py, pp.pz, 0, yaw, 0), L = (m) => M.clone().multiply(m), b = batchOf(progOf(road, sx)), c0 = rs * (pp.hw + 3.6);
          b.add('woodWeathered', boxG(7.6, 0.16, 1.9, 1.2), L(xf(c0, 0.9, 0)), [0.62, 0.5, 0.36]);
          for (let i = 0; i < 6; i++) for (const sz of [-1, 1]) b.add('woodWeathered', boxG(0.1, 1.0, 0.1, 1), L(xf(c0 - 3.5 + i * 1.4, 1.4, sz * 0.9)), [0.5, 0.4, 0.3]);
          for (const sz of [-1, 1]) b.add('woodWeathered', boxG(7.6, 0.08, 0.08, 1), L(xf(c0, 1.85, sz * 0.9)), [0.5, 0.4, 0.3]);
          for (let i = 0; i < 3; i++) b.add('concrete', boxG(0.5, 0.3, 1.9, 1), L(xf(rs * (pp.hw + 7.6 + i * 0.5), 0.7 - i * 0.28, 0)), [0.85, 0.82, 0.76]);
          break;
        }
        // willows on the far bank
        for (let sx = 40; sx < road.length - 30; sx += 38 + rnd() * 14) {
          if (inSpan(road, rs, sx)) continue;
          road.atS(sx, pp); const d = rs * (pp.hw + 6.9), x = pp.px + pp.rhx * d, z = pp.pz + pp.rhz * d, y = pp.py - 0.4, b = batchOf(progOf(road, sx)), cl = reg.clear(x, z);
          if (cl < 3) continue; b.add('woodWeathered', cylG(0.25, 0.4, 3.2, 6, 1), xf(x, y + 1.6, z), [0.4, 0.34, 0.28]);
          for (let i = 0; i < 5; i++) { const a = i * 1.26; b.add('dark', sphG(1.5, 6, 4, 1), xf(x + Math.cos(a) * 1.5, y + 3.4 - (i % 2) * 0.5, z + Math.sin(a) * 1.5, 0, 0, 0, 1, 1.5, 1), [0.2, 0.38, 0.14]); }
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
        // arches linking the houses over the alley, and stone treads on the step hazards
        for (const sx of [24, road.length * 0.5, road.length - 24]) {
          if (!(inSpan(road, 1, sx) && inSpan(road, -1, sx))) continue;
          road.atS(sx, pp); const yaw = Math.atan2(-pp.rhz, pp.rhx), M = xf(pp.px, pp.py, pp.pz, 0, yaw, 0), L = (m) => M.clone().multiply(m), hw2 = pp.hw + ROW + 0.5, b = batchOf(progOf(road, sx));
          b.add('plaster', boxG(2 * hw2 + 1.2, 0.8, 1.6, 2), L(xf(0, 3.9, 0)), [0.95, 0.88, 0.76]); b.add('roofTile', boxG(2 * hw2 + 1.6, 0.16, 2.0, 2), L(xf(0, 4.4, 0)), [1, 1, 1]);
          b.add('woodWeathered', boxG(0.14, 0.14, 1.6, 1), L(xf(0, 3.35, 0)), [0.5, 0.38, 0.26]);
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
    return { items, update: (dt, camPos, time) => { for (const m of waters) if (m.map) m.map.offset.y = -time * 0.15; } };
  }

  return {
    id: 'village', name: 'Hill Village', net, registry, pads: [], terrainOpts, theme, surface, flags: { closed: false, laps: 1, flat: false, noStuckRescue: false },
    splits, hazards: hz, startPos, landmarks: [{ type: 'market', s: 620, lateral: 0 }, { type: 'church', s: 1090, lateral: 20 }, { type: 'fountain', s: 1075, lateral: -8 }, { type: 'finish', s: LEN, lateral: 0 }],
    decorate, ranges: { ground: 330 },
  };
}
