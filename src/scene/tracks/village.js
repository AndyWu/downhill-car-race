// Hill Village: gentle cobbled main street with 3 splits (market square / riverside lane / back alley), buildings, church, fountain.
import * as THREE from 'three';
import { mulberry32, clamp, smoothstep, lerp } from '../util.js';
import { makeRoad, buildNetwork } from '../roadnet.js';
import { createHazardField, SURFACES } from '../hazards.js';
import { Batch, boxG, cylG, sphG, prismG, xf } from '../batch.js';
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
      road.surf = pd.kind === 'alley' ? { type: 'cobble', friction: 0.74, drag: 0.04, bump: 0.45 } : pd.kind === 'river' ? { type: 'cobble', friction: 0.86, drag: 0.0, bump: 0.1 } : { type: 'cobble', friction: 0.8, drag: 0.02, bump: 0.22 };
      road.kind = pd.kind;
      branches.push({ road, splitId: sp.id, pathIndex, fromS, toS, name: pd.name, note: pd.note });
      for (let k = 0.3; k <= 0.7; k += 0.2) { road.atS(road.length * k, mq); builtMid.push([mq.px, mq.pz]); }
      paths.push({ index: pathIndex, name: pd.name, length: Math.round(road.length * 10) / 10, width: w0, note: pd.note });
    });
    let ml = 0, prev = null; for (let s = sp.fromS; s <= sp.toS; s += 2) { main.atS(s, mp); if (prev) ml += Math.hypot(mp.px - prev[0], mp.pz - prev[1]); prev = [mp.px, mp.pz]; }
    entry.length = Math.round(ml * 10) / 10;
    splits.push({ id: sp.id, fromS: sp.fromS, toS: sp.toS, paths });
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
  main.field = createHazardField(main, seed + 11, { order: ['puddle', 'rock', 'puddle', 'stall', 'rock', 'puddle'], start: 120, startJit: 30, gap1: 55, gap2: 60, endGap: 110, stallEdge: true, noStall: SPLITS.flatMap((sp) => [[sp.fromS - 20, sp.fromS + 70], [sp.toS - 70, sp.toS + 20]]) });
  addHaz(main, main.field);
  for (const b of branches) {
    const kind = b.road.kind;
    const opts = kind === 'market' ? { order: ['stall', 'puddle', 'stall', 'stall'], start: 62, startJit: 8, gap1: 18, gap2: 10, endGap: 30 }
      : kind === 'alley' ? { order: ['steps', 'rock', 'steps', 'puddle'], start: 28, startJit: 8, gap1: 16, gap2: 10, endGap: 28 }
        : { order: ['puddle', 'puddle', 'rock'], start: 45, startJit: 15, gap1: 60, gap2: 30, endGap: 40 };
    b.road.field = createHazardField(b.road, seed + 31 + b.road.id, opts);
    addHaz(b.road, b.road.field);
  }

  // ---- terrain verge: kerb then a 1.5 m wall (house plinths / garden walls) ----
  const WALL = 2.1, OUT = 9;
  const verge = (road, s, d, hw) => {
    const r = Math.abs(d) - (hw + 0.1);
    if (r < 0) return 0;
    const kerb = 0.1 * smoothstep(0, 0.08, r) * (1 - smoothstep(0.2, 0.3, r));
    const wall = WALL * smoothstep(0.3, 1.1, r) * (1 - smoothstep(OUT - 3.5, OUT - 0.4, r));
    return Math.max(kerb, wall);
  };
  const terrainOpts = { hillAmp: 6, hillFar: 16, hillNear: 70, rutScale: 0, noiseScale: 0.4, crown: 0.07, sideSlope: 0.18, shoulderOut: OUT, verge };
  const theme = {
    roadMat: 'cobbles', chunk: 150, tile: 256, cell: 8, terrUV: 6, tileNear: { reach: 9, drop: 0.7 }, tileRadius: 0.5,
    roadUV: (road, s, d, hwe, o) => { o[0] = d / 2.6; o[1] = s / 2.6; },
    roadColor: (road, s, d, p, rnz, o) => {
      const ad = Math.abs(d), n = 0.88 + 0.22 * (rnz.n2(s * 0.7, d * 0.9) * 0.5 + 0.5);
      let wet = 0; if (road.field) wet = road.field.wet(s, d);
      const edge = smoothstep(p.hw - 0.2, p.hw + 0.4, ad);
      const k = n * (1 - 0.5 * wet) * (1 - 0.25 * edge);
      o[0] = k; o[1] = k; o[2] = k * (1 - 0.05 * edge);
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
    const ROW = 0.66;   // house / wall front plane, metres beyond the road edge (corridor = edge + 0.3, doorsteps/awnings protrude <= 0.3)
    const items = [];
    const pp = {}, qq = {};
    const CH = 120;
    const batches = new Map();
    const batchOf = (progS) => { const k = Math.max(0, Math.floor(progS / CH)); if (!batches.has(k)) batches.set(k, new Batch()); return batches.get(k); };
    const placed = [];
    const clearOf = (x, z) => { nw.project2(x, z, qq); const rd = qq.road; rd.params(qq.idx, pp); return Math.abs(qq.d) - pp.hw; };
    const free = (x, z, r) => { for (const p of placed) if (Math.hypot(p.x - x, p.z - z) < (p.r + r) * 0.72) return false; return true; };
    const PAL = [[1.0, 0.92, 0.74], [0.98, 0.78, 0.66], [0.84, 0.92, 0.82], [0.92, 0.86, 0.66], [0.78, 0.84, 0.94], [1.0, 0.82, 0.5], [0.96, 0.7, 0.62], [0.9, 0.9, 0.86]];
    const SHUT = [[0.2, 0.45, 0.3], [0.65, 0.2, 0.18], [0.2, 0.32, 0.6], [0.85, 0.72, 0.25], [0.3, 0.5, 0.5]];
    const FLOW = [[0.9, 0.15, 0.2], [0.95, 0.7, 0.15], [0.9, 0.4, 0.7], [0.95, 0.95, 0.9]];

    // local frame at road position s, side sg: x along the street, z away from the street
    const mkBasis = (road, s, sg) => {
      road.atS(s, pp);
      const hw = pp.hw, T = new THREE.Vector3(pp.rhz, 0, -pp.rhx), R = new THREE.Vector3(pp.rhx, 0, pp.rhz);
      const Z = R.clone().multiplyScalar(sg), X = sg > 0 ? T : T.clone().negate(), Y = new THREE.Vector3(0, 1, 0);
      const base = new THREE.Vector3(pp.px + R.x * sg * (hw + ROW), pp.py, pp.pz + R.z * sg * (hw + ROW));
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
        for (const sx of [-1, 1]) b.add(key, prismG([[-depth / 2, 0], [depth / 2, 0], [0, rise]], 0.2, 2), L(xf(sx * (w / 2 - 0.05), yb, depth / 2, 0, Math.PI / 2, 0)), c);
        b.add('roofTile', boxG(w + 0.8, 0.2, 0.3, 1), L(xf(0, yb + rise + 0.1, depth / 2)), [0.85, 0.85, 0.85]);
        if (rnd() < 0.6) b.add('brickwall', boxG(0.9, 2.6, 0.9, 1.5), L(xf((rnd() - 0.5) * w * 0.6, yb + rise * 0.7 + 1.0, depth * 0.62)), [0.9, 0.85, 0.8]);
      } else {
        const half = w / 2 + 0.45, sl = half / Math.cos(th), rise = (w / 2) * Math.tan(th), yb = 0.5 + H;
        for (const sg of [-1, 1]) b.add('roofTile', boxG(sl, 0.14, depth + 0.7, 2), L(xf(sg * half / 2 - sg * 0.05, yb + rise / 2 + 0.05, depth / 2, 0, 0, -sg * th)), [1, 1, 1]);
        b.add(key, prismG([[-w / 2, 0], [w / 2, 0], [0, rise]], 0.2, 2), L(xf(0, yb, 0.05)), c);
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
    function frontage(road, sgs, sLo, sHi, big) {
      for (const sg of sgs) {
        let s = sLo + rnd() * 3;
        while (s < sHi - 6) {
          const w = 6.2 + rnd() * 4.6, depth = 7 + rnd() * 3.5, floors = 2 + (rnd() < 0.45 ? 1 : 0), sc = s + w / 2;
          if (sc > sHi - 4) break;
          const bs = mkBasis(road, sc, sg);
          const cx = bs.base.x + bs.Z.x * depth / 2, cz = bs.base.z + bs.Z.z * depth / 2;
          const Mq = bs.M.clone(), poly = reg.boxPoly(Mq, 0, (depth - 0.3) / 2, w / 2 + 0.05, (depth + 0.3) / 2), gpt = [bs.base.x - bs.Z.x * 0.3, bs.base.z - bs.Z.z * 0.3];
          let ok = free(cx, cz, Math.hypot(w, depth) / 2) && reg.fits(poly, 0.31, 0.5);
          if (ok) {
            const prog = road.map ? road.map.fromS + (sc / road.map.len) * (road.map.toS - road.map.fromS) : sc;
            const M = bs.M.clone(); M.elements[13] = terrain.heightAt(gpt[0], gpt[1]) - 0.05;
            house(batchOf(prog), M, w, depth, floors, true, big);
            placed.push({ x: cx, z: cz, r: Math.hypot(w, depth) / 2 });
            reg.poly('house', poly, M.elements[13] - 4.1, gpt, { sunk: true });   // plinth boxes reach 4.1 m below the floor
          } else if (rnd() < 0.8) { // garden wall so the street edge stays closed (only where it stays out of every corridor)
            const gw = reg.boxPoly(bs.M, 0, 0.35, w / 2, 0.35);
            if (reg.fits(gw, 0.31, 0.5)) {
              const prog = road.map ? road.map.fromS + (sc / road.map.len) * (road.map.toS - road.map.fromS) : sc;
              const M = bs.M.clone(); M.elements[13] = terrain.heightAt(bs.base.x, bs.base.z) - 0.05;
              batchOf(prog).add('concrete', boxG(w, 3.1, 0.7, 2), M.clone().multiply(xf(0, 0.6, 0.35)), [0.95, 0.9, 0.82]);
              batchOf(prog).add('concrete', boxG(w + 0.1, 0.2, 0.9, 2), M.clone().multiply(xf(0, 2.2, 0.35)), [0.8, 0.78, 0.75]);
              reg.poly('gardenwall', gw, M.elements[13] - 0.95, [bs.base.x, bs.base.z], { sunk: true });
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

    // ---- street walls (visible face of the contain-walls) along every road, merged into the chunk batches ----
    for (const road of roads0) {
      const nCh = Math.max(1, Math.round(road.length / 60));
      for (let c = 0; c < nCh; c++) {
        const sa = (road.length * c) / nCh, sb = (road.length * (c + 1)) / nCh, rows = Math.round((sb - sa) / 2) + 1, Pa = [], Na = [], Ua = [], Ia = [];
        for (const sg of [-1, 1]) {
          const base = Pa.length / 3, rowOK = [];
          for (let r = 0; r < rows; r++) {
            const s = sa + ((sb - sa) * r) / (rows - 1); road.atS(s, pp); let ok = true;
            for (const [dd, hh] of [[ROW - 0.07, -0.4], [ROW + 0.13, WALL], [2.4, WALL]]) { const d = sg * (pp.hw + dd), x = pp.px + pp.rhx * d, z = pp.pz + pp.rhz * d; if (reg.clear(x, z) < 0.31) ok = false; Pa.push(x, pp.py + hh, z); Na.push(0, 1, 0); Ua.push(s / 3, hh / 3); }
            rowOK.push(ok);
          }
          for (let r = 0; r < rows - 1; r++) { if (!rowOK[r] || !rowOK[r + 1]) continue; for (let q = 0; q < 2; q++) { const a = base + r * 3 + q, b2 = a + 1, c2 = a + 3, d2 = c2 + 1; Ia.push(a, c2, b2, b2, c2, d2); } }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(Pa, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Na, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(Ua, 2));
        g.setIndex(Ia); g.computeVertexNormals();
        const prog = road.map ? road.map.fromS + ((sa + sb) / 2 / road.map.len) * (road.map.toS - road.map.fromS) : (sa + sb) / 2;
        batchOf(prog).add('concrete', g, null, [0.9, 0.85, 0.78]);
      }
    }

    // ---- houses along every road ----
    frontage(main, [-1, 1], 8, LEN + 20, false);
    for (const bd of branches) frontage(bd.road, [-1, 1], 12, bd.road.length - 12, bd.road.kind === 'market');

    // ---- lamp posts (main street) ----
    for (let s = 20; s < LEN + 40; s += 27) {
      const sg = (Math.floor(s / 27) % 2) ? 1 : -1, bs = mkBasis(main, s, sg), x = bs.base.x, z = bs.base.z, y = terrain.heightAt(x, z), b = batchOf(s), ry = Math.atan2(-bs.Z.z, bs.Z.x);
      if (reg.clear(x, z) < 0.45) continue;
      const ys = terrain.heightAt(pp.px + pp.rhx * sg * (bs.hw + 0.1), pp.pz + pp.rhz * sg * (bs.hw + 0.1)) - 0.6;   // post foot buried in the street wall
      reg.circle('lamp', x, z, 0.12, ys, { sunk: true }, 6);
      b.add('dark', cylG(0.07, 0.1, 5.0, 5, 1), xf(x, ys + 2.5, z), [0.3, 0.3, 0.32]);
      b.add('dark', boxG(0.35, 0.5, 0.35, 1), xf(x - bs.Z.x * 0.4, y + 4.5, z - bs.Z.z * 0.4, 0, ry, 0), [2.0, 1.8, 1.1]);
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
          const onMain = !road.map, pick = rnd();
          if (onMain) {
            // main street: only low, clearly-hazard props pushed to the kerb (hay cart / crate stack), never a full stall
            if (pick < 0.5) {
              b.add('woodWeathered', boxG(1.7, 0.55, 1.5, 1.5), L(xf(0, 0.28, 0)), [0.6, 0.48, 0.34]);
              for (const sz of [-1, 1]) b.add('dark', cylG(0.42, 0.42, 0.1, 10, 1), L(xf(0, 0.42, sz * 0.8, Math.PI / 2, 0, 0)), [0.25, 0.2, 0.15]);
              b.add('straw', boxG(1.5, 0.4, 1.3, 1.5), L(xf(0, 0.75, 0)), [1.0, 0.88, 0.55]);
            } else {
              for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) b.add('woodWeathered', boxG(0.7, 0.55, 0.7, 1), L(xf(-0.7 + i * 0.75, 0.28 + ((i + j) % 2) * 0.01, -0.4 + j * 0.75)), [0.7 - 0.05 * j, 0.52, 0.34]);
              b.add('woodWeathered', boxG(0.7, 0.5, 0.7, 1), L(xf(-0.35, 0.82, 0.0)), [0.75, 0.56, 0.36]); b.add('woodWeathered', boxG(0.7, 0.5, 0.7, 1), L(xf(0.4, 0.82, 0.3)), [0.66, 0.5, 0.32]);
            }
            reg.box('hazard', M, 0, 0, 1.0, 0.9, 0, { hazard: true, lift: ob.h });
            continue;
          }
          if (pick < 0.62) {
            const ac = [[0.85, 0.2, 0.18], [0.2, 0.45, 0.8], [0.9, 0.7, 0.15], [0.25, 0.6, 0.35]][Math.floor(rnd() * 4)];
            b.add('woodWeathered', boxG(2.3, 1.15, 2.1, 1.5), L(xf(0, 0.575, 0)), [0.65, 0.5, 0.38]);
            for (const [px, pz] of [[-1.1, -1.0], [1.1, -1.0], [-1.1, 1.0], [1.1, 1.0]]) b.add('woodWeathered', boxG(0.08, 2.5, 0.08, 1), L(xf(px, 1.25, pz)), [0.6, 0.45, 0.3]);
            for (let i = 0; i < 6; i++) b.add('dark', boxG(2.5 / 6 - 0.02, 0.06, 2.3, 1), L(xf(-1.05 + (i + 0.5) * 2.5 / 6 - 0.2, 2.5, 0, 0, 0, 0.1)), i % 2 ? [1.8, 1.8, 1.7] : ac);
            for (let i = 0; i < 7; i++) { const fc = [[0.9, 0.25, 0.15], [0.95, 0.75, 0.1], [0.4, 0.7, 0.2], [0.85, 0.5, 0.15]][i % 4]; b.add('dark', boxG(0.34, 0.24, 0.34, 1), L(xf(-0.8 + i * 0.27, 1.27, (i % 2) * 0.5 - 0.25)), fc); }
          } else {
            b.add('woodWeathered', boxG(2.2, 1.15, 1.9, 1.5), L(xf(0, 0.6, 0)), [0.6, 0.48, 0.34]);
            for (const sz of [-1, 1]) b.add('dark', cylG(0.5, 0.5, 0.1, 10, 1), L(xf(0, 0.5, sz * 1.0, Math.PI / 2, 0, 0)), [0.25, 0.2, 0.15]);
            b.add('woodWeathered', boxG(1.8, 0.07, 0.07, 1), L(xf(-1.9, 0.9, 0.5, 0, 0, 0.12)), [0.55, 0.42, 0.3]); b.add('woodWeathered', boxG(1.8, 0.07, 0.07, 1), L(xf(-1.9, 0.9, -0.5, 0, 0, 0.12)), [0.55, 0.42, 0.3]);
            for (let i = 0; i < 6; i++) b.add('dark', boxG(0.4, 0.4, 0.4, 1), L(xf(-0.7 + i * 0.3, 1.35, (i % 2) * 0.4 - 0.2)), [0.85, 0.72, 0.45]);
          }
          reg.box('hazard', M, 0, 0, 1.15, 1.05, 0, { hazard: true, lift: ob.h });
        }
      }
    }

    // ---- washing lines over alleys, bunting over the market squares ----
    const clothP = [], clothC = [], clothN = [];
    for (const bd of branches) {
      if (bd.road.kind !== 'alley' && bd.road.kind !== 'market') continue;
      const road = bd.road, step = bd.road.kind === 'alley' ? 17 : 26;
      for (let s = 20; s < road.length - 18; s += step) {
        road.atS(s, pp); const hw = pp.hw + 0.9, h = bd.road.kind === 'alley' ? 5.4 : 6.5;
        const a = [pp.px - pp.rhx * hw, 0, pp.pz - pp.rhz * hw], c = [pp.px + pp.rhx * hw, 0, pp.pz + pp.rhz * hw], rx = pp.rhx, rz = pp.rhz;
        a[1] = terrain.heightAt(a[0], a[2]) + h; c[1] = terrain.heightAt(c[0], c[2]) + h + 0.25;
        const n = Math.round((hw * 2) / 0.55);
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n, x = lerp(a[0], c[0], t), z = lerp(a[2], c[2], t), y = lerp(a[1], c[1], t) - 0.5 * 4 * t * (1 - t);
          const col = bd.road.kind === 'alley' ? [[0.95, 0.95, 0.9], [0.9, 0.5, 0.5], [0.5, 0.65, 0.9], [0.95, 0.85, 0.5]][Math.floor(rnd() * 4)] : [[0.9, 0.2, 0.2], [0.95, 0.9, 0.7], [0.2, 0.4, 0.8], [0.95, 0.75, 0.2]][i % 4];
          const wdt = bd.road.kind === 'alley' ? 0.4 : 0.32, hgt = bd.road.kind === 'alley' ? 0.8 : 0.5, dx = rx * wdt / 2, dz = rz * wdt / 2;
          clothP.push(x - dx, y, z - dz, x + dx, y, z + dz, x + dx, y - hgt, z + dz, x - dx, y - hgt, z - dz); for (let k = 0; k < 4; k++) { clothC.push(...col); clothN.push(0, 1, 0); }
        }
      }
    }
    if (clothP.length) {
      const g = new THREE.BufferGeometry(), idx = [];
      for (let i = 0; i < clothP.length / 12; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
      g.setAttribute('position', new THREE.Float32BufferAttribute(clothP, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(clothC, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(clothN, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(clothP.length / 3 * 2), 2)); g.setIndex(idx); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, lib.get('dark', { vertexColors: true, side: THREE.DoubleSide })); m.name = 'cloth'; parent.add(m);
      items.push({ always: true, center: new THREE.Vector3(), radius: 0, groups: [{ obj: m, max: 1e12 }] });
    }

    // ---- build batches into chunks ----
    for (const [k, b] of batches) {
      const grp = b.build(lib, { shadow: false, opts: { concrete: { side: THREE.DoubleSide } } }); grp.name = 'village_' + k;
      main.atS(k * CH + CH / 2, pp); parent.add(grp);
      items.push({ center: new THREE.Vector3(pp.px, pp.py, pp.pz), radius: CH / 2 + 35, groups: [{ obj: grp, max: 85 }] });
    }
    const trees = scatterTrees({ net: nw, terrain, lib, parent, seed: sd, chunk: 125, perChunk: 70, minClear: 11, maxOff: 70, mix: [0.3, 0.2, 1.4, 1, 0.8, 1, 1, 1.2], salt: 9, exclude: (x, z) => !free(x, z, 3) });
    for (const t of trees) items.push({ center: t.center, radius: t.radius, groups: [{ obj: t.near, max: 80 }, { obj: t.far, min: 70, max: 380 }] });
    return { items, update: null };
  }

  return {
    id: 'village', name: 'Hill Village', net, registry, pads: [], terrainOpts, theme, surface, flags: { closed: false, laps: 1, flat: false, noStuckRescue: false },
    splits, hazards: hz, startPos, landmarks: [{ type: 'market', s: 620, lateral: 0 }, { type: 'church', s: 1090, lateral: 20 }, { type: 'fountain', s: 1075, lateral: -8 }, { type: 'finish', s: LEN, lateral: 0 }],
    decorate, ranges: { ground: 330 },
  };
}
