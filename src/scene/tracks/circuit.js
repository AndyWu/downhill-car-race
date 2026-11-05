// Speedway: closed 1072.7 m loop (3 laps = 3218 m), nearly flat, asphalt, kerbs, tyre walls, grandstands, pit lane, gantry, floodlights.
// Layout (clockwise from above): pit straight, fast right-hander (R50), a short straight, a TIGHT HAIRPIN (R17), a left sweeper (R40),
// a sharp S-chicane (R22), a long straight and a medium right-hand return (R30) onto the start straight.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, clamp, smoothstep, lerp } from '../util.js';
import { makeRoad, buildNetwork } from '../roadnet.js';
import { Batch, boxG, cylG, sphG, xf } from '../batch.js';
import { figure, buntingMesh } from '../ground.js';
import { textureOf } from '../materials.js';
import { G } from '../../graphics/shared.js';
import { scatterTrees } from './scatter.js';
import { createRegistry } from './registry.js';

const LAP = 3218 / 3;
const WIDTH = 10;
const HW = WIDTH / 2;
const WALLH = 1.4;          // barrier height above the run-off
const OFF0 = 3.4;           // normal run-off width (edge of asphalt .. wall)
const NSL = Math.ceil(LAP); // 1 m tables around the lap

// ---- layout (turtle: heading a=0 is -z, right turns increase a) -------------------------------------------------------------------
function loopPoints() {
  const P = [[0, 0]];
  let x = 0, z = 0, a = 0;
  const push = () => P.push([x, z]);
  const straight = (L) => { const n = Math.max(1, Math.round(L / 6)); for (let i = 0; i < n; i++) { x += Math.sin(a) * L / n; z -= Math.cos(a) * L / n; push(); } };
  const arc = (R, deg) => {
    const tot = (deg * Math.PI) / 180, n = Math.max(2, Math.ceil((Math.abs(tot) * R) / 3)), da = tot / n;
    for (let i = 0; i < n; i++) { const am = a + da / 2; x += Math.sin(am) * R * Math.abs(da); z -= Math.cos(am) * R * Math.abs(da); a += da; push(); }
  };
  straight(240);          // pit straight (grandstands left, pit lane right)
  arc(50, 90);            // T1: fast right
  straight(110);
  arc(17, 180);           // T2: the hairpin (R17)
  straight(60);
  arc(40, -90);           // T3: left sweeper
  straight(120);
  arc(22, -40); arc(22, 80); arc(22, -40);   // T4: sharp chicane
  straight(120);
  arc(30, 180);           // T5: right-hand return
  straight(80.65);        // run to the line
  P.pop();                // last point == start
  return P;
}

export function planCircuit(seed) {
  const yFn = (s) => 1.3 * Math.sin((2 * Math.PI * 2 * s) / LAP) + 0.6 * Math.sin((2 * Math.PI * 5 * s) / LAP + 1.0) + 0.0;
  const main = makeRoad({
    pts: loopPoints(), closed: true, lengthTarget: LAP, id: 0, name: 'Speedway',
    yFn, widthFn: () => WIDTH,
    camberFn: (s, kap) => clamp(kap * 11, -0.13, 0.13),
  });
  main.surf = { type: 'asphalt', friction: 1.0, drag: 0.0, bump: 0.02 };
  const net = buildNetwork({ main, length: 3218, lapLength: LAP });
  const registry = createRegistry(net);

  // ---- 1 m tables: curvature, run-off width and tyre-wall depth per side (index 0: d<0, 1: d>0) ----
  const kapT = new Float32Array(NSL), offT = [new Float32Array(NSL), new Float32Array(NSL)], teT = [new Float32Array(NSL), new Float32Array(NSL)];
  const tyreT = [new Uint8Array(NSL), new Uint8Array(NSL)];
  {
    const tmp = {};
    for (let i = 0; i < NSL; i++) { main.atS(i, tmp); kapT[i] = tmp.kap; }
    const wrap = (i) => ((i % NSL) + NSL) % NSL;
    const box = (src, rad) => { const o = new Float32Array(NSL); for (let i = 0; i < NSL; i++) { let s = 0; for (let j = -rad; j <= rad; j++) s += src[wrap(i + j)]; o[i] = s / (2 * rad + 1); } return o; };
    for (let si = 0; si < 2; si++) {
      const sg = si ? 1 : -1, wide = new Float32Array(NSL), need = new Float32Array(NSL);
      for (let i = 0; i < NSL; i++) {
        const k = kapT[i], outside = sg * k < 0, ak = Math.abs(k);
        wide[i] = outside ? smoothstep(0.011, 0.028, ak) : 0;
        need[i] = outside && ak > 0.012 ? 1 : 0;
      }
      const w = box(box(wide, 12), 12);
      let nd = new Float32Array(NSL);
      for (let i = 0; i < NSL; i++) if (need[i]) for (let j = -12; j <= 12; j++) nd[wrap(i + j)] = 1;
      nd = box(box(nd, 3), 3);
      for (let i = 0; i < NSL; i++) { offT[si][i] = OFF0 + 3.9 * w[i]; teT[si][i] = 0.8 * smoothstep(0.1, 0.9, nd[i]); tyreT[si][i] = nd[i] > 0.9 ? 1 : 0; }
    }
  }
  const tab = (T, s) => { const u = ((s % LAP) + LAP) % LAP, i = Math.floor(u), f = u - i; return T[i % NSL] * (1 - f) + T[(i + 1) % NSL] * f; };
  const offAt = (s, sg) => tab(offT[sg < 0 ? 0 : 1], s);
  const teAt = (s, sg) => tab(teT[sg < 0 ? 0 : 1], s);
  const wallD = (s, sg) => HW + offAt(s, sg) + teAt(s, sg);   // |d| of the concrete face
  const pitW = (sm) => Math.max(1 - smoothstep(230, 270, sm), smoothstep(LAP - 110, LAP - 70, sm));

  // verge: gentle slope back to the track over the grass, then a flat-topped wall (vertical face, no back-slope ramp), plateau behind
  const verge = (road, s, d) => {
    const si = d < 0 ? 0 : 1, ad = Math.abs(d), off = offAt(s, si), te = teAt(s, si);
    const r = ad - (HW + off + te), liftMax = 0.055 * Math.max(0, off - 1.5);
    if (r < 0) return 0.055 * clamp(ad - HW - 1.5, 0, Math.max(0, off - 1.5));
    const sm = ((s % LAP) + LAP) % LAP, hold = 4 + 18 * pitW(sm);
    return (liftMax + WALLH * smoothstep(0, 0.25, r)) * (1 - smoothstep(hold, hold + 14, r));
  };
  const terrainOpts = { hillAmp: 2.5, hillFar: 7, hillNear: 60, rutScale: 0, noiseScale: 0.15, crown: 0.05, sideSlope: 0.04, shoulderOut: 62, vergeReach: 62, verge };

  const theme = {
    roadMat: 'asphaltLines', rowStep: 2, terrRow: 4, tileRadius: 0.55, ribbonEnd: 35,
    roadUV: (road, s, d, hwe, o) => { o[0] = (d / hwe + 1) / 2; o[1] = s / 8; },
    roadColor: (road, s, d, p, rnz, o) => {
      const ad = Math.abs(d), n = 0.95 + 0.08 * (rnz.n2(s * 0.5, d * 0.7) * 0.5 + 0.5);
      if (ad > p.hw - 0.1) { o[0] = 0.92; o[1] = 0.92; o[2] = 0.9; return; }   // shoulder: plain asphalt (kerbs are separate strips)
      o[0] = n; o[1] = n; o[2] = n;
    },
    terrMat: 'grass', terrColor: (x, z, off, s, d, cnz, rnz, o) => {
      const k = 0.9 + 0.12 * cnz.n2(x / 17 + 7, z / 17), t = cnz.n2(x / 80 + 3, z / 80) * 0.5 + 0.5;
      o[0] = lerp(0.8, 1.0, t) * k; o[1] = 1.0 * k; o[2] = lerp(0.7, 0.6, t) * k;
    },
  };

  const surface = (info) => {
    const ad = Math.abs(info.d), hw = info.hw;
    if (ad <= hw + 0.05) return { type: 'asphalt', friction: 1.0, drag: 0, bump: 0.02 };
    if (ad <= hw + 1.5) return { type: 'asphalt', friction: 0.85, drag: 0.02, bump: 0.1 };      // kerbs
    if (ad < hw + offAt(info.s, info.d < 0 ? -1 : 1) - 0.05) return { type: 'grass', friction: 0.55, drag: 0.3, bump: 0.2 };   // run-off
    return { type: 'wall', friction: 0.3, drag: 1.4, bump: 0.5 };
  };
  const startPos = (slot) => ({ s: -(5.5 + 5.6 * (slot >> 1) + ((slot & 1) ? 2.4 : 0)), d: (slot & 1) ? 2.0 : -2.0 });

  // ---------------------------------------------------------------------------------------------------------------------------
  function decorate({ net: nw, terrain, lib, parent, seed: sd, plan }) {
    const reg = plan.registry;
    const items = [];
    const rnd = mulberry32(sd * 41 + 7);
    const pp = {};
    const P = (s, d, dy = 0) => { main.atS(s, pp); const x = pp.px + pp.rhx * d, z = pp.pz + pp.rhz * d; return { x, z, y: terrain.heightAt(x, z) + dy, ry: Math.atan2(-pp.rhz, pp.rhx), hw: pp.hw, kap: pp.kap, rhx: pp.rhx, rhz: pp.rhz }; };
    const addItem = (group, center, radius, max = 260, min = -1e9) => { parent.add(group); items.push({ center, radius, groups: [{ obj: group, max, min }] }); };
    const cOf = (s) => { main.atS(s, pp); return new THREE.Vector3(pp.px, pp.py, pp.pz); };
    const night = () => G.gfxNight.value;
    const kapAt = (s) => kapT[((Math.floor(((s % LAP) + LAP) % LAP)) % NSL)];
    const outsideSide = (s) => (kapAt(s) >= 0 ? -1 : 1);

    // ---- materials that glow at night (colour is animated in update) ----
    const warmMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.55, 0.42) });
    const redMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.12, 0.08) });
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.0, 0.86, 0.6), polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const merged = (list) => { const gs = list.map(([g, m]) => { const c = g.clone(); c.applyMatrix4(m); return c; }); const g = mergeGeometries(gs, false); g.computeBoundingSphere(); return g; };

    // ---- draped strip along the road: rows every `step` metres, d from dA to dB, uv = (u across 0..1, v = s / vLen) ----
    const drape = (sA, sB, dA, dB, { step = 1, dy = 0.035, vLen = 1, cols = 2 } = {}) => {
      const rows = Math.max(2, Math.round((sB - sA) / step) + 1), Pa = new Float32Array(rows * cols * 3), Na = new Float32Array(rows * cols * 3), Ua = new Float32Array(rows * cols * 2), idx = [];
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
        const s = sA + ((sB - sA) * r) / (rows - 1), t = k / (cols - 1), q = P(s, lerp(dA, dB, t)), i = r * cols + k;
        Pa[i * 3] = q.x; Pa[i * 3 + 1] = q.y + dy; Pa[i * 3 + 2] = q.z; Na[i * 3 + 1] = 1; Ua[i * 2] = t; Ua[i * 2 + 1] = (s - sA) / vLen;
      }
      for (let r = 0; r < rows - 1; r++) for (let k = 0; k < cols - 1; k++) { const a = r * cols + k, sgn = dB > dA ? 1 : -1; if (sgn > 0) idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1); else idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(Pa, 3)); g.setAttribute('normal', new THREE.BufferAttribute(Na, 3)); g.setAttribute('uv', new THREE.BufferAttribute(Ua, 2)); g.setIndex(idx); g.computeBoundingSphere();
      return g;
    };
    const decal = (map, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, ...extra });

    // ---- concrete barrier ribbons (per 120 m, both sides) with painted panels; face = wallD, flat top, solid ----
    const concrete = lib.get('concrete', { vertexColors: true });
    for (let c = 0; c * 120 < LAP; c++) {
      const s0 = c * 120, s1 = Math.min(LAP, s0 + 120), rows = Math.round((s1 - s0) / 3) + 1;
      const Pa = [], Na = [], Ua = [], Ca = [], Ia = [];
      const rowPts = (s, sg) => {
        main.atS(s, pp); const wd = wallD(s, sg), d0 = sg * (wd + 0.02), d1 = sg * (wd + 0.85), dm = sg * (wd - 0.3);
        const x0 = pp.px + pp.rhx * d0, z0 = pp.pz + pp.rhz * d0, x1 = pp.px + pp.rhx * d1, z1 = pp.pz + pp.rhz * d1, xm = pp.px + pp.rhx * dm, zm = pp.pz + pp.rhz * dm;
        const hm = terrain.heightAt(xm, zm), top = Math.max(hm + WALLH, terrain.heightAt(x1, z1) + 0.1);
        return [[x0, hm - 0.6, z0, 0], [x0, top, z0, 1.4], [x1, top, z1, 1.4], [x1, terrain.heightAt(x1, z1) - 0.1, z1, 0.4]];
      };
      for (const sg of [-1, 1]) {
        for (let r = 0; r < rows - 1; r++) {
          const sa = s0 + ((s1 - s0) * r) / (rows - 1), sb = s0 + ((s1 - s0) * (r + 1)) / (rows - 1);
          const paint = Math.floor((sa + 0.01) / 9) % 3, col = paint === 0 ? [1.9, 0.4, 0.35] : paint === 1 ? [1.8, 1.8, 1.75] : [1.0, 1.0, 1.0];
          const A = rowPts(sa, sg), B = rowPts(sb, sg), base = Pa.length / 3;
          for (const row of [A, B]) for (let k = 0; k < 4; k++) { const v = row[k]; Pa.push(v[0], v[1], v[2]); Na.push(0, 1, 0); Ua.push(sa / 3, v[3]); Ca.push(...(k === 3 ? [0.7, 0.7, 0.7] : col)); }
          reg.poly('barrier', [[A[0][0], A[0][2]], [A[2][0], A[2][2]], [B[2][0], B[2][2]], [B[0][0], B[0][2]]], A[0][1], [A[0][0], A[0][2]], { sunk: true });
          for (let q = 0; q < 3; q++) { const a = base + q, b2 = a + 1, c2 = a + 4, d2 = c2 + 1; Ia.push(a, c2, b2, b2, c2, d2); }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(Pa, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Na, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(Ua, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(Ca, 3));
      g.setIndex(Ia); g.computeVertexNormals(); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial().copy(concrete)); m.material.side = THREE.DoubleSide; m.material.vertexColors = true; m.name = 'barrier_' + c;
      const grp = new THREE.Group(); grp.add(m);
      addItem(grp, cOf((s0 + s1) / 2), 70, 300);
    }

    // ---- tyre walls: upright stacks of three black tyres (white / red painted every few stacks), per 120 m chunk ----
    {
      const prof = [new THREE.Vector2(0.12, 0), new THREE.Vector2(0.33, 0), new THREE.Vector2(0.355, 0.14), new THREE.Vector2(0.33, 0.28), new THREE.Vector2(0.15, 0.28)];
      const tyreGeo = new THREE.LatheGeometry(prof, 9);
      const chunks = new Map();
      for (const sg of [-1, 1]) {
        const si = sg < 0 ? 0 : 1;
        let s = 0, n = 0;
        while (s < LAP) {
          if (teAt(s, sg) > 0.6) {
            const off = offAt(s, sg), dd = HW + off + 0.36, k = Math.abs(kapAt(s));
            const q = P(s, sg * dd), y = q.y, c = Math.floor(s / 120), paint = n % 7 === 0 ? 1 : n % 7 === 4 ? 2 : 0;
            if (!chunks.has(c)) chunks.set(c, { m: [], col: [] });
            const ch = chunks.get(c), yaw = Math.atan2(-pp.rhz, pp.rhx);
            for (let h = 0; h < 3; h++) {
              ch.m.push(xf(q.x, y + h * 0.28, q.z, 0, yaw + h * 0.9 + n, 0));
              const b = 0.06 + 0.06 * rnd(), cl = paint === 1 ? [0.8, 0.8, 0.78] : paint === 2 ? [0.7, 0.08, 0.06] : [b, b, b * 1.05];
              ch.col.push(new THREE.Color(cl[0], cl[1], cl[2]));
            }
            if (n % 2 === 0) reg.circle('tyre', q.x, q.z, 0.34, y - 0.01, {}, 4);
            n++;
            s += 0.7 / (1 + k * dd);
          } else s += 1;
        }
      }
      for (const [c, ch] of chunks) {
        const im = new THREE.InstancedMesh(tyreGeo, lib.get('dark', {}), ch.m.length);
        ch.m.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, ch.col[i]); });
        im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = false; im.name = 'tyres_' + c;
        const grp = new THREE.Group(); grp.add(im);
        addItem(grp, cOf(c * 120 + 60), 95, 220);
      }
    }

    // ---- kerbs: crisp red/white blocks on both sides through every corner ----
    {
      const mat = decal(textureOf('kerb'));
      const ranges = []; let cur = null;
      for (let i = 0; i <= NSL; i++) {
        const on = Math.abs(kapT[i % NSL]) > 0.0055;
        if (on) { if (!cur) cur = [i, i]; else cur[1] = i; } else if (cur && i - cur[1] > 12) { ranges.push(cur); cur = null; }
      }
      if (cur) ranges.push(cur);
      for (const [a, b] of ranges) {
        const sA = a - 5, sB = b + 5, gs = [];
        for (const sg of [-1, 1]) gs.push(drape(sA, sB, sg * (HW - 0.1), sg * (HW + 1.45), { step: 1, vLen: 6.4, dy: 0.04 }));
        const m = new THREE.Mesh(mergeGeometries(gs, false), mat); m.name = 'kerb_' + a; m.receiveShadow = true;
        const grp = new THREE.Group(); grp.add(m);
        addItem(grp, cOf((sA + sB) / 2), (sB - sA) / 2 + 20, 260);
      }
    }

    // ---- sign textures ----
    const hasDoc = typeof document !== 'undefined';
    const SIGNS = [['PADDLE POWER', '#e8c21a', '#16130c'], ['SOAPBOX GP', '#c8261c', '#f8f4e8'], ["GRAN'S JAM", '#2b7d3f', '#fff6d8'], ['BOLTS & CO', '#1f4f9a', '#fdfdf4'], ['TURBO TEA', '#f4f1e6', '#a3191a'], ["KIDS' CUP", '#7a2d8c', '#ffe9a8']];
    function signAtlas() {
      if (!hasDoc) return null;
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128 * SIGNS.length;
      const g = cv.getContext('2d');
      SIGNS.forEach(([txt, bg, fg], i) => {
        const y0 = i * 128; g.fillStyle = bg; g.fillRect(0, y0, 512, 128);
        g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
        let px = 78; g.font = `900 ${px}px Impact, "Arial Black", sans-serif`;
        while (g.measureText(txt).width > 440 && px > 20) { px -= 4; g.font = `900 ${px}px Impact, "Arial Black", sans-serif`; }
        g.fillText(txt, 256, y0 + 68);
        g.strokeStyle = fg; g.lineWidth = 7; g.strokeRect(7, y0 + 7, 498, 114);
        g.fillStyle = fg; for (let k = 0; k < 8; k++) g.fillRect(24 + k * 62, y0 + 10, 30, 6);
      });
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
    }
    function wideSign(text, w, h) {
      if (!hasDoc) return null;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
      g.fillStyle = '#f6f3e8'; g.fillRect(0, 0, w, h);
      const sq = h / 3; for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (const ox of [0, w - 3 * sq]) { g.fillStyle = (x + y) % 2 ? '#f6f3e8' : '#111'; g.fillRect(ox + x * sq, y * sq, sq, sq); }
      g.fillStyle = '#c8261c'; g.textAlign = 'center'; g.textBaseline = 'middle';
      let px = h * 0.78; g.font = `900 ${px}px Impact, "Arial Black", sans-serif`;
      while (g.measureText(text).width > w - 6.5 * sq && px > 20) { px -= 4; g.font = `900 ${px}px Impact, "Arial Black", sans-serif`; }
      g.fillText(text, w / 2, h * 0.56);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
    }
    // a plane at (x,y,z) facing the horizontal direction (nx,nz), size w x h; uv rect [u0,v0,u1,v1]
    const planeGeo = (x, y, z, nx, nz, w, h, uv) => {
      const g = new THREE.PlaneGeometry(w, h);
      if (uv) { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1])); }
      g.applyMatrix4(xf(x, y, z, 0, Math.atan2(nx, nz), 0)); return g;
    };

    // ---- start / finish area: gantry, grandstands, pit lane + garages, paddock, control tower, flags, billboards, grid ----
    const glowGeos = [], redGeos = [], poolGeos = [], towers = [];
    {
      const b = new Batch(), grp = new THREE.Group(); grp.name = 'start_area';
      // Box axes: local x = ACROSS the road (right vector), local z = BACKWARDS along the road (toward the cars on the grid).
      const put = (key, wA, h, lA, q, dA, y0, color, type = null, sink = 0, dAlong = 0) => {
        const c = Math.cos(q.ry), sn = Math.sin(q.ry), ax = [c, -sn], az = [sn, c];
        const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [q.x + ax[0] * u * wA / 2 + az[0] * v * lA / 2, q.z + ax[1] * u * wA / 2 + az[1] * v * lA / 2]);
        if (sink) for (const p of pts) y0 = Math.min(y0, terrain.heightAt(p[0], p[1]));
        const cy = y0 + h / 2 - sink / 2;
        b.add(key, boxG(wA, h + sink, lA, 2), xf(q.x, cy, q.z, 0, q.ry, 0), color);
        if (type) reg.poly(type, pts, y0, [q.x, q.z], sink ? { sunk: true } : {});
      };
      const hw = HW;

      // ---- gantry at s = 0: steel legs, beam with a banner on both faces, start-light bar facing the grid ----
      for (const sg of [-1, 1]) {
        const q = P(0, sg * (hw + 2.4));
        put('metalRusted', 0.6, 10.2, 0.6, q, 0, q.y, [0.78, 0.8, 0.86], 'gantry', 0.5);
        put('concrete', 1.4, 0.6, 1.4, q, 0, q.y, [1, 1, 1], 'gantry', 0.3);
      }
      const c0 = P(0, 0), yb = c0.y + 9.7;
      b.add('metalRusted', boxG(WIDTH + 5.6, 1.2, 0.7, 2), xf(c0.x, yb, c0.z, 0, c0.ry, 0), [0.78, 0.8, 0.86]);
      b.add('checker', boxG(WIDTH + 5.6, 0.5, 0.12, 2.4), xf(c0.x, yb - 0.85, c0.z, 0, c0.ry, 0), [1, 1, 1]);
      const lightBar = (k) => xf(c0.x, c0.y + 8.45, c0.z, 0, c0.ry, 0).multiply(xf(0, 0, k));
      b.add('dark', boxG(WIDTH * 0.62, 1.15, 0.5, 1), lightBar(0), [0.05, 0.05, 0.06]);
      for (let i = 0; i < 5; i++) {
        const lx = (i - 2) * 2.5;
        redGeos.push([new THREE.CylinderGeometry(0.42, 0.42, 0.14, 14), lightBar(0).multiply(xf(lx, 0, 0.3, Math.PI / 2, 0, 0))]);
        b.add('dark', cylG(0.5, 0.5, 0.1, 14, 1), lightBar(0).multiply(xf(lx, 0, 0.26, Math.PI / 2, 0, 0)), [0.02, 0.02, 0.02]);
      }
      if (hasDoc) {
        const tex = wideSign('START / FINISH', 1536, 112), mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12 });
        const w = WIDTH + 5.2, h = 1.0;
        const mk = (k, flip) => { const g = new THREE.PlaneGeometry(w, h); g.applyMatrix4(xf(c0.x, yb, c0.z, 0, c0.ry + (flip ? Math.PI : 0), 0).multiply(xf(0, 0, k))); return g; };
        const bm = new THREE.Mesh(mergeGeometries([mk(0.38, false), mk(-0.38, true)], false), mat); bm.name = 'startfinish_banner'; grp.add(bm);
      }

      // ---- grandstands (left, outside), tiers rise away from the track; lit roof strip ----
      const stand = (sCenter, len, side, tiers = 6) => {
        const d0 = hw + 5.6;
        for (let t = 0; t < tiers; t++) {
          const h = 0.9 + t * 0.9, nSeg = Math.ceil(len / 10), sl = len / nSeg;
          for (let k = 0; k < nSeg; k++) { const q = P(sCenter - len / 2 + (k + 0.5) * sl, side * (d0 + t * 1.5)); put('concrete', 1.5, h, sl + 0.02, q, 0, q.y, [0.95, 0.95, 0.92], 'stand', 1.0); }
          const qs = P(sCenter, side * (d0 + t * 1.5 - 0.25));
          b.add('dark', boxG(0.5, 0.12, len - 0.4, 1), xf(qs.x, qs.y + h + 0.06, qs.z, 0, qs.ry, 0), t % 2 ? [0.85, 0.2, 0.15] : [0.2, 0.3, 0.7]);
        }
        const top = P(sCenter, side * (d0 + (tiers - 1) * 1.5 - 0.6)), roofY = top.y + tiers * 0.9 + 3.4;
        b.add('metalRusted', boxG(tiers * 1.5 + 2.6, 0.25, len + 1, 2), xf(top.x, roofY, top.z, 0, top.ry, 0), [0.95, 0.55, 0.45]);
        // lit strip under the front edge of the roof + lamp bar
        const fe = P(sCenter, side * (d0 - 1.6));
        glowGeos.push([new THREE.BoxGeometry(0.3, 0.14, len - 1), xf(fe.x, roofY - 0.22, fe.z, 0, fe.ry, 0)]);
        for (const e of [-1, 1]) for (const dd of [d0 - 0.4, d0 + tiers * 1.5 + 0.4]) { const pq = P(sCenter + e * (len / 2 - 0.3), side * dd); put('metalRusted', 0.25, tiers * 0.9 + 3.4, 0.25, pq, 0, pq.y, [0.8, 0.8, 0.85], 'standPost', 0.5); }
        for (let t = 0; t < tiers; t++) for (let i = 0; i < len / 1.4; i++) {
          if (rnd() < 0.42) continue;
          const sc = sCenter - len / 2 + 0.6 + i * 1.15 + (rnd() - 0.5) * 0.5, q = P(sc, side * (d0 + 0.5 + t * 1.5));
          figure(b, rnd, q.x, q.y + 0.9 + t * 0.9, q.z, q.ry - side * Math.PI / 2 + (rnd() - 0.5) * 0.5, 0.75 + rnd() * 0.25, true);
        }
      };
      stand(70, 60, -1, 5); stand(160, 70, -1, 6);

      // ---- pit lane (behind the pit wall) + 12 individual garage bays with doors and team signs ----
      const pitA = hw + 4.7, pitB = hw + 9.7;
      {
        const pit = new THREE.Mesh(drape(-6, 128, pitA, pitB, { step: 2, dy: 0.04, vLen: 6 }), decal(textureOf('asphalt'), { color: new THREE.Color(0.8, 0.8, 0.82) }));
        pit.name = 'pitlane'; grp.add(pit);
        const lines = new THREE.Mesh(mergeGeometries([drape(-6, 128, pitB - 0.5, pitB - 0.35, { step: 4, dy: 0.06 }), drape(-6, 128, pitA + 0.35, pitA + 0.5, { step: 4, dy: 0.06 })], false), new THREE.MeshStandardMaterial({ color: 0xf2f2ea, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
        lines.name = 'pitlines'; grp.add(lines);
      }
      const TEAM = [[0.9, 0.2, 0.15], [0.2, 0.4, 0.8], [0.95, 0.75, 0.2], [0.2, 0.6, 0.3], [0.85, 0.4, 0.1], [0.55, 0.25, 0.7]];
      const dFront = hw + 10.4, depth = 6.2, bayL = 8.8;
      for (let i = 0; i < 12; i++) {
        const s = 8 + i * bayL + bayL / 2, col = TEAM[i % TEAM.length];
        const back = P(s, dFront + depth), wall = P(s - bayL / 2, dFront + depth / 2);
        put('concrete', 0.3, 4.2, bayL, back, 0, back.y, [0.98, 0.98, 0.94], 'garage', 1.0);                 // back wall
        put('concrete', depth, 4.2, 0.3, wall, 0, wall.y, [0.95, 0.95, 0.92], 'garage', 1.0);                // divider
        const mid = P(s, dFront + depth / 2), fr = P(s, dFront), roof = P(s, dFront + depth / 2);
        b.add('concrete', boxG(depth + 0.6, 0.35, bayL + 0.1, 2), xf(roof.x, mid.y + 4.4, roof.z, 0, roof.ry, 0), [0.7, 0.7, 0.72]);
        b.add('dark', boxG(depth * 0.9, 0.05, bayL - 0.6, 1), xf(mid.x, mid.y + 0.04, mid.z, 0, mid.ry, 0), [0.16, 0.16, 0.18]);   // oily floor
        const door = P(s, dFront + 0.15);
        b.add('dark', boxG(0.1, 1.25, bayL - 1.2, 1), xf(door.x, door.y + 3.35, door.z, 0, door.ry, 0), [0.62, 0.64, 0.68]);          // roller door, rolled up
        for (let k = 0; k < 3; k++) b.add('dark', boxG(0.12, 0.05, bayL - 1.2, 1), xf(door.x, door.y + 2.9 + k * 0.4, door.z, 0, door.ry, 0), [0.4, 0.42, 0.46]);
        b.add('dark', boxG(0.5, 0.95, bayL - 0.4, 1), xf(fr.x, fr.y + 4.1, fr.z, 0, fr.ry, 0), col);                                  // team sign band
        b.add('dark', boxG(0.52, 0.12, bayL - 0.4, 1), xf(fr.x, fr.y + 3.58, fr.z, 0, fr.ry, 0), [1.6, 1.6, 1.5]);
        const car = P(s, dFront + 2.6);   // a parked cart inside the bay
        b.add('dark', boxG(1.1, 0.45, 2.3, 1), xf(car.x, car.y + 0.45, car.z, 0, car.ry + 1.57, 0), col);
        b.add('dark', boxG(0.9, 0.2, 0.25, 1), xf(car.x, car.y + 0.8, car.z, 0, car.ry + 1.57, 0), [0.1, 0.1, 0.1]);
        for (const e of [-1, 1]) for (const f of [-0.8, 0.8]) b.add('dark', cylG(0.2, 0.2, 0.12, 8, 1), xf(car.x + car.rhx * e * 0.58 + -car.rhz * f, car.y + 0.24, car.z + car.rhz * e * 0.58 + car.rhx * f, 0, 0, Math.PI / 2), [0.04, 0.04, 0.04]);
        // pit-side marker box on the lane + a garage light
        const pl = P(s, pitB - 1.6); b.add('dark', boxG(2.6, 0.04, 4.0, 1), xf(pl.x, pl.y + 0.06, pl.z, 0, pl.ry, 0), [0.88, 0.88, 0.2]);
        glowGeos.push([new THREE.BoxGeometry(0.2, 0.12, bayL - 2), xf(fr.x - fr.rhx * 0.9, fr.y + 3.1, fr.z - fr.rhz * 0.9, 0, fr.ry, 0)]);
      }
      // end walls of the garage block
      { const e1 = P(8, dFront + depth / 2), e2 = P(8 + 12 * bayL, dFront + depth / 2); put('concrete', depth, 4.2, 0.3, e1, 0, e1.y, [0.95, 0.95, 0.92], 'garage', 1.0); put('concrete', depth, 4.2, 0.3, e2, 0, e2.y, [0.95, 0.95, 0.92], 'garage', 1.0); }

      // ---- paddock behind the garages: team tents, vans, race-control tower, infield car park ----
      {
        const tent = (s, d, col) => {
          const q = P(s, d); put('plaster', 5, 2.2, 5, q, 0, q.y, [1.1, 1.1, 1.05], 'tent', 0.6);
          b.add('dark', cylG(0.05, 3.9, 1.5, 4, 1), xf(q.x, q.y + 2.95, q.z, 0, q.ry + Math.PI / 4, 0), col);
        };
        [[18, 0], [42, 1], [66, 2], [90, 3]].forEach(([s, k]) => tent(s, hw + 24, TEAM[k]));
        const van = (s, d, col, yaw) => {
          const q = P(s, d); const c = Math.cos(q.ry), sn = Math.sin(q.ry);
          const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [q.x + c * u * 1.1 - sn * 0 + sn * v * 2.6, q.z - sn * u * 1.1 + c * v * 2.6]);
          reg.poly('van', pts, q.y, [q.x, q.z], { sunk: true });
          b.add('dark', boxG(2.2, 1.9, 4.2, 1), xf(q.x, q.y + 1.15, q.z, 0, q.ry, 0), col);
          b.add('dark', boxG(2.2, 1.1, 1.5, 1), xf(q.x + Math.sin(q.ry) * 2.2, q.y + 0.8, q.z + Math.cos(q.ry) * 2.2, 0, q.ry, 0), col);
          b.add('dark', boxG(2.0, 0.5, 0.06, 1), xf(q.x + Math.sin(q.ry) * 2.95, q.y + 1.2, q.z + Math.cos(q.ry) * 2.95, 0, q.ry, 0), [0.1, 0.14, 0.18]);
        };
        [[30, 0], [54, 1], [78, 2], [102, 3]].forEach(([s, k]) => van(s, hw + 24, [0.9, 0.9, 0.88], 0));
        // race-control tower (infield, opposite the line)
        const tw = P(14, hw + 34);
        put('concrete', 7, 2.6, 12, tw, 0, tw.y, [0.9, 0.9, 0.86], 'tower', 1.0);
        const c2 = tw.y + 2.6;
        b.add('concrete', boxG(6, 2.8, 11, 2), xf(tw.x, c2 + 1.4, tw.z, 0, tw.ry, 0), [0.92, 0.9, 0.85]);
        b.add('glass', boxG(0.1, 1.5, 10.6, 1), xf(tw.x - tw.rhx * 3.0, c2 + 1.5, tw.z - tw.rhz * 3.0, 0, tw.ry, 0), [1, 1, 1]);
        b.add('metalRusted', boxG(7.2, 0.3, 12.2, 2), xf(tw.x, c2 + 3.0, tw.z, 0, tw.ry, 0), [0.4, 0.4, 0.45]);
        b.add('metalRusted', boxG(0.15, 5.5, 0.15, 1), xf(tw.x, c2 + 5.9, tw.z, 0, tw.ry, 0), [0.8, 0.8, 0.85]);
        glowGeos.push([new THREE.BoxGeometry(0.12, 0.9, 10.4), xf(tw.x - tw.rhx * 3.05, c2 + 1.5, tw.z - tw.rhz * 3.05, 0, tw.ry, 0)]);
        // car park rows with painted bays
        for (let r = 0; r < 3; r++) for (let k = 0; k < 9; k++) {
          if (rnd() < 0.25) continue;
          const q = P(135 + k * 3.6, hw + 38 + r * 7), cc = [[0.8, 0.8, 0.82], [0.15, 0.2, 0.45], [0.7, 0.12, 0.1], [0.12, 0.35, 0.2], [0.85, 0.7, 0.2]][Math.floor(rnd() * 5)];
          const c = Math.cos(q.ry), sn = Math.sin(q.ry), pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [q.x + c * u * 0.95 - sn * 0 + sn * v * 2.1, q.z - sn * u * 0.95 + c * v * 2.1]);
          reg.poly('parkedcar', pts, q.y, [q.x, q.z], { sunk: true });
          b.add('dark', boxG(1.8, 0.9, 4.0, 1), xf(q.x, q.y + 0.75, q.z, 0, q.ry, 0), cc);
          b.add('dark', boxG(1.6, 0.6, 2.0, 1), xf(q.x, q.y + 1.5, q.z, 0, q.ry, 0), [0.1, 0.13, 0.17]);
        }
      }

      // ---- flag poles along the start straight (left, between barrier and stands) ----
      for (let s = -20; s < 230; s += 24) {
        const q = P(s, -(hw + 4.6));
        put('metalRusted', 0.12, 7, 0.12, q, 0, q.y, [0.85, 0.85, 0.9], 'flagpole', 0.3);
        const col = [[1.0, 0.2, 0.15], [0.9, 0.9, 0.85], [0.15, 0.3, 0.9], [1.0, 0.8, 0.2]][Math.floor(rnd() * 4)];
        b.add('dark', boxG(0.04, 0.9, 1.5, 1), xf(q.x, q.y + 6.4, q.z, 0, q.ry, 0).multiply(xf(0, 0, 0.8)), col);
      }

      // ---- marshal posts with flags at the outside of every corner ----
      {
        const spots = [];
        for (let s = 0; s < LAP; s += 1) { const k = Math.abs(kapAt(s)); if (k > 0.012 && (!spots.length || s - spots[spots.length - 1].s > 70)) spots.push({ s: s + 22, sg: outsideSide(s + 22) }); }
        for (const sp of spots) {
          const dd = wallD(sp.s, sp.sg) + 2.2, q = P(sp.s, sp.sg * dd);
          if (!reg.fits([[q.x - 1.2, q.z - 1.2], [q.x + 1.2, q.z - 1.2], [q.x + 1.2, q.z + 1.2], [q.x - 1.2, q.z + 1.2]], 3, 1)) continue;
          put('plaster', 2.0, 2.3, 1.6, q, 0, q.y, [1.0, 0.95, 0.85], 'marshal', 0.5);
          b.add('dark', boxG(2.4, 0.2, 2.0, 1), xf(q.x, q.y + 2.4, q.z, 0, q.ry, 0), [0.8, 0.25, 0.15]);
          b.add('dark', boxG(1.2, 0.8, 0.06, 1), xf(q.x - Math.sin(q.ry) * 0.85, q.y + 1.5, q.z - Math.cos(q.ry) * 0.85, 0, q.ry, 0), [0.1, 0.14, 0.18]);
          const fp = P(sp.s + 2.6, sp.sg * dd); put('metalRusted', 0.1, 5, 0.1, fp, 0, fp.y, [0.85, 0.85, 0.9], 'flagpole', 0.3);
          b.add('dark', boxG(0.04, 0.7, 1.2, 1), xf(fp.x, fp.y + 4.55, fp.z, 0, fp.ry, 0).multiply(xf(0, 0, 0.65)), [[1.0, 0.85, 0.1], [0.1, 0.8, 0.2]][spots.indexOf(sp) % 2]);
        }
      }

      // ---- floodlight towers ----
      {
        const spots = [];
        [20, 110, 205].forEach((s) => spots.push([s, -1, 24]));
        [30, 105].forEach((s) => spots.push([s, 1, 46]));
        [285, 452, 575, 705, 790, 880, 960, 1030].forEach((s) => spots.push([s, outsideSide(s), 7]));
        [650, 760].forEach((s) => spots.push([s, -outsideSide(s), 7]));
        for (const [s, sg, extra] of spots) {
          const dd = extra > 20 ? hw + extra : wallD(s, sg) + extra, q = P(s, sg * dd);
          if (!reg.fits([[q.x - 0.5, q.z - 0.5], [q.x + 0.5, q.z - 0.5], [q.x + 0.5, q.z + 0.5], [q.x - 0.5, q.z + 0.5]], 2.5, 0.5)) continue;
          const H = 15;
          reg.circle('floodlight', q.x, q.z, 0.3, q.y, { sunk: true }, 6);
          b.add('metalRusted', cylG(0.16, 0.3, H, 8, 2), xf(q.x, q.y + H / 2 - 0.3, q.z), [0.7, 0.72, 0.76]);
          const toTrack = sg * (dd > 0 ? -1 : 1); const cx = pp.rhx, cz = pp.rhz;   // not used for orientation; head faces the road
          b.add('dark', boxG(3.6, 0.5, 0.9, 1), xf(q.x, q.y + H + 0.1, q.z, 0, q.ry, 0), [0.12, 0.12, 0.13]);
          // lamp panel faces the track: shift the panel towards the road
          const lx = q.x - q.rhx * sg * 0.55, lz = q.z - q.rhz * sg * 0.55;
          glowGeos.push([new THREE.BoxGeometry(3.4, 0.38, 0.1), xf(lx, q.y + H + 0.1, lz, 0, q.ry, 0)]);
          // pool of light on the ground between tower and road
          const gx = q.x - q.rhx * sg * 12, gz = q.z - q.rhz * sg * 12, gy = terrain.heightAt(gx, gz);
          const pg = new THREE.PlaneGeometry(30, 30); pg.rotateX(-Math.PI / 2); pg.applyMatrix4(xf(gx, gy + 0.08, gz, 0, 0, 0)); poolGeos.push(pg);
          towers.push(new THREE.Vector3(lx, q.y + H - 0.5, lz));
        }
      }

      // ---- grid: painted boxes at every start slot ----
      for (let slot = 0; slot < 10; slot++) {
        const sp = plan.startPos(slot), sc = sp.s + 0.2;
        const white = [1.7, 1.7, 1.65];
        const lineBox = (ds, dd, w, l) => { const q = P(sc + ds, sp.d + dd); b.add('dark', boxG(w, 0.05, l, 1), xf(q.x, q.y + 0.03, q.z, 0, q.ry, 0), white); };
        lineBox(2.0, 0, 2.4, 0.14);            // front bar
        lineBox(0.2, -1.2, 0.14, 4.0);         // left
        lineBox(0.2, 1.2, 0.14, 4.0);          // right
        lineBox(-1.8, -0.9, 0.5, 0.14); lineBox(-1.8, 0.9, 0.5, 0.14);
      }

      // ---- bunting across the start straight ----
      const lines = [];
      for (const s of [20, 60, 100, 140]) { const l = P(s, -(hw + 4.6)), r = P(s, hw + 4.6); lines.push({ a: [l.x, l.y + 7, l.z], b: [r.x, r.y + 7, r.z], sag: 1.4 }); }
      grp.add(buntingMesh(lines, lib));
      // chequered line (draped)
      const chk = textureOf('checker').clone(); chk.needsUpdate = true;
      const cm = new THREE.Mesh(drape(-0.6, 0.6, -hw, hw, { step: 0.4, cols: 20, dy: 0.035, vLen: 2.4 }), decal(chk, { polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));
      { const uv = cm.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 0.5 * 2.4 / 1.2 * 0.5); }
      grp.add(cm);
      grp.add(b.build(lib, { shadow: false }));
      addItem(grp, cOf(100), 175, 380);
    }

    // ---- sponsor billboards behind the wall (single atlas -> one draw call) ----
    {
      const b = new Batch(), grp = new THREE.Group(); grp.name = 'billboards';
      const atlas = signAtlas(), planes = [];
      let n = 0;
      for (let s = 262; s < LAP - 40; s += 46) {
        for (const sg of [-1, 1]) {
          if (Math.abs(kapAt(s)) > 0.006 || rnd() < 0.3) continue;
          if (sg < 0 && s < 240) continue;
          const dd = wallD(s, sg) + 2.4, q = P(s, sg * dd), pts = [[-0.15, -4], [0.15, -4], [0.15, 4], [-0.15, 4]].map(([u, v]) => { const c = Math.cos(q.ry), sn = Math.sin(q.ry); return [q.x + c * u + sn * v, q.z - sn * u + c * v]; });
          if (!reg.fits(pts, 3.2, 1.0)) continue;
          const idx = n++ % SIGNS.length, y0 = q.y + 0.9;
          b.add('dark', boxG(0.2, 2.1, 8.4, 1), xf(q.x, y0 + 1.05, q.z, 0, q.ry, 0), [0.1, 0.1, 0.12]);
          reg.poly('billboard', pts, y0, [q.x, q.z], { supported: true });
          reg.items[reg.items.length - 1].supported = true;
          for (const e of [-3.4, 0, 3.4]) { const qp = P(s + e, sg * dd); const pp2 = [[qp.x - 0.15, qp.z - 0.15], [qp.x + 0.15, qp.z - 0.15], [qp.x + 0.15, qp.z + 0.15], [qp.x - 0.15, qp.z + 0.15]]; reg.poly('billboardPost', pp2, qp.y, [qp.x, qp.z], { sunk: true }); b.add('metalRusted', boxG(0.25, 1.4, 0.25, 1), xf(qp.x, qp.y + 0.55, qp.z, 0, qp.ry, 0), [0.7, 0.7, 0.75]); }
          if (atlas) { const nx = -sg * pp.rhx, nz = -sg * pp.rhz; main.atS(s, pp); planes.push(planeGeo(q.x - sg * pp.rhx * 0.11, y0 + 1.05, q.z - sg * pp.rhz * 0.11, -sg * pp.rhx, -sg * pp.rhz, 8.0, 1.9, [0, 1 - (idx + 1) / SIGNS.length, 1, 1 - idx / SIGNS.length])); }
        }
      }
      grp.add(b.build(lib, { shadow: false }));
      if (atlas && planes.length) {
        const mat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.8, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: 0.0 });
        const m = new THREE.Mesh(mergeGeometries(planes, false), mat); m.name = 'billboard_faces'; grp.add(m); grp.userData.signMat = mat;
      }
      addItem(grp, cOf(LAP / 2), 700, 420);
      var signMat = grp.userData.signMat;
    }

    // ---- glowing parts (floodlight heads, roof strips, start lamps) + ground light pools ----
    {
      const gl = new THREE.Group(); gl.name = 'glow';
      if (glowGeos.length) { const m = new THREE.Mesh(merged(glowGeos), warmMat); m.name = 'glow_warm'; gl.add(m); }
      if (redGeos.length) { const m = new THREE.Mesh(merged(redGeos), redMat); m.name = 'glow_start'; gl.add(m); }
      if (poolGeos.length) { const m = new THREE.Mesh(mergeGeometries(poolGeos, false), poolMat); m.name = 'light_pools'; m.renderOrder = 3; gl.add(m); }
      addItem(gl, cOf(LAP / 2), 700, 420);
    }
    // real light from the 3 nearest towers at night
    const lights = [];
    for (let i = 0; i < 3 && towers.length; i++) { const L = new THREE.PointLight(0xffe2b0, 0, 70, 1.6); L.visible = false; L.name = 'flood' + i; parent.add(L); lights.push(L); }
    let lightT = 0, lightsOn = false;
    function update(dt, camPos) {
      const n = night();
      warmMat.color.setRGB(0.55 + n * 3.0, 0.5 + n * 2.7, 0.38 + n * 2.0);
      poolMat.opacity = n * 0.5;
      if (signMat) signMat.emissiveIntensity = n * 0.75;
      const want = n > 0.05 && lights.length > 0;
      if (want !== lightsOn) { lightsOn = want; for (const L of lights) L.visible = want; }
      if (want) {
        lightT -= dt;
        if (lightT <= 0 && camPos) {
          lightT = 0.4;
          const order = towers.map((t, i) => [t.distanceToSquared(camPos), i]).sort((a, b2) => a[0] - b2[0]);
          lights.forEach((L, i) => { if (order[i]) L.position.copy(towers[order[i][1]]); });
        }
        for (const L of lights) L.intensity = n * 900;
      }
    }

    // ---- trees outside the barriers, kept out of the built-up zones ----
    const exclude = (x, z) => {
      nw.project2(x, z, { }); // (cheap guard, result unused)
      return false;
    };
    const qq = {};
    const keepOut = (x, z) => { nw.project2(x, z, qq); const sm = ((qq.s % LAP) + LAP) % LAP; return (sm < 270 || sm > LAP - 60) && qq.dist < 62; };
    const trees = scatterTrees({ net: nw, terrain, lib, parent, seed: sd, chunk: 125, perChunk: 60, minClear: 14, maxOff: 90, mix: [1.4, 1.2, 0.6, 0.6, 0.2, 1, 1.2, 1], salt: 5, exclude: keepOut });
    for (const t of trees) items.push({ center: t.center, radius: t.radius, groups: [{ obj: t.near, max: 80 }, { obj: t.far, min: 70, max: 380 }] });
    return { items, update };
  }

  return {
    id: 'circuit', name: 'Speedway', net, registry, pads: [], terrainOpts, theme, surface,
    // wallSurface: 'wall' (|d| >= hw + runoff) is a vertical concrete / tyre barrier. gridSlots: startPos(slot).
    flags: { closed: true, laps: 3, flat: true, noStuckRescue: true, wallSurface: true },
    splits: [], hazards: [], startPos, landmarks: [{ type: 'finish', s: 3218, lateral: 0 }, { type: 'grandstand', s: 15, lateral: -14 }],
    decorate, ranges: { ground: 460 },
    // exported for the gameplay side: lateral distance (from the centre line) of the first 'wall' surface at lap position s on each side
    wallStart: (s, sg) => HW + offAt(s, sg) - 0.05,
  };
}

function poolTexture() {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
