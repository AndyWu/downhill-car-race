// Speedway: closed 1072.7 m loop (3 laps = 3218 m), nearly flat, asphalt, kerbs, tyre walls, grandstands, gantry.
import * as THREE from 'three';
import { mulberry32, clamp, smoothstep, lerp } from '../util.js';
import { makeRoad, buildNetwork } from '../roadnet.js';
import { Batch, boxG, cylG, xf } from '../batch.js';
import { figure, buntingMesh } from '../ground.js';
import { bannerTexture, textureOf } from '../materials.js';
import { scatterTrees } from './scatter.js';

const LAP = 3218 / 3;
const WIDTH = 10;

function loopPoints() {
  const P = [[0, 0], [0, -80], [0, -160], [0, -240], [0, -290]];
  for (let k = 1; k < 6; k++) { const t = (k * Math.PI) / 6; P.push([72 - 72 * Math.cos(t), -290 - 72 * Math.sin(t)]); }
  P.push([144, -290], [144, -245], [133, -208], [155, -172], [144, -135], [144, -90], [144, -35], [144, 20]);
  for (let k = 1; k < 6; k++) { const t = (k * Math.PI) / 6; P.push([72 + 72 * Math.cos(t), 20 + 72 * Math.sin(t)]); }
  P.push([0, 20]);
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
  const pp = {};

  // verge: run-off grass, then a steep barrier / tyre wall that stops fast cars, back slope behind
  const verge = (road, s, d, hw) => {
    const ad = Math.abs(d), r = ad - (hw + 3.4);
    if (r < -0.4) return 0;
    const wall = 1.4 * smoothstep(0, 0.55, r) * (1 - smoothstep(1.4, 5.0, r));
    return wall;
  };
  const terrainOpts = { hillAmp: 2.5, hillFar: 7, hillNear: 60, rutScale: 0, noiseScale: 0.15, crown: 0.05, sideSlope: 0.04, shoulderOut: 10, verge };

  const hash = (a) => { const x = Math.sin(a * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const theme = {
    roadMat: 'asphaltLines', rowStep: 2, terrRow: 6,
    roadUV: (road, s, d, hwe, o) => { o[0] = (d / hwe + 1) / 2; o[1] = s / 8; },
    roadColor: (road, s, d, p, rnz, o) => {
      const ad = Math.abs(d), n = 0.93 + 0.1 * (rnz.n2(s * 0.5, d * 0.7) * 0.5 + 0.5);
      if (ad > p.hw - 0.1) {
        if (Math.abs(p.kap) > 0.0055 || (s > 330 && s < 380)) { const w = Math.floor(s / 1.7) % 2 === 0; if (w) { o[0] = 2.3; o[1] = 2.3; o[2] = 2.2; } else { o[0] = 2.2; o[1] = 0.32; o[2] = 0.28; } }
        else { o[0] = 0.85; o[1] = 1.0; o[2] = 0.75; }
        return;
      }
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
    if (ad < hw + 3.35) return { type: 'grass', friction: 0.6, drag: 0.55, bump: 0.3 };         // run-off
    return { type: 'wall', friction: 0.3, drag: 1.4, bump: 0.5 };
  };
  const startPos = (slot) => ({ s: -(5.5 + 5.6 * (slot >> 1) + ((slot & 1) ? 2.4 : 0)), d: (slot & 1) ? 2.0 : -2.0 });

  function decorate({ net: nw, terrain, lib, parent, seed: sd }) {
    const items = [];
    const rnd = mulberry32(sd * 41 + 7);
    const P = (s, d, dy = 0) => { main.atS(s, pp); const x = pp.px + pp.rhx * d, z = pp.pz + pp.rhz * d; return { x, z, y: terrain.heightAt(x, z) + dy, ry: Math.atan2(-pp.rhz, pp.rhx), hw: pp.hw, kap: pp.kap, rhx: pp.rhx, rhz: pp.rhz }; };
    const addItem = (group, center, radius, max = 260, min = -1e9) => { parent.add(group); items.push({ center, radius, groups: [{ obj: group, max, min }] }); };
    const cOf = (s) => { main.atS(s, pp); return new THREE.Vector3(pp.px, pp.py, pp.pz); };

    // ---- concrete barrier ribbons (per 120 m, both sides) with painted panels ----
    const concrete = lib.get('concrete', { vertexColors: true });
    for (let c = 0; c * 120 < LAP; c++) {
      const s0 = c * 120, s1 = Math.min(LAP, s0 + 120), rows = Math.round((s1 - s0) / 3) + 1;
      const Pa = [], Na = [], Ua = [], Ca = [], Ia = [];
      for (const sg of [-1, 1]) {
        const base = Pa.length / 3;
        for (let r = 0; r < rows; r++) {
          const s = s0 + ((s1 - s0) * r) / (rows - 1);
          main.atS(s, pp);
          const paint = Math.floor(s / 9) % 3, col = paint === 0 ? [2.0, 0.4, 0.35] : paint === 1 ? [1.9, 1.9, 1.85] : [1.1, 1.1, 1.1];
          for (const [dd, hh] of [[hw3(pp) , 0], [hw3(pp), 1.4], [hw3(pp) + 0.35, 1.4]]) {
            const d = sg * dd, x = pp.px + pp.rhx * d, z = pp.pz + pp.rhz * d, yb = terrain.heightAt(x, z);
            Pa.push(x, yb + hh - (hh === 0 ? 0.3 : 0.05), z); Na.push(0, 1, 0); Ua.push(s / 3, hh); Ca.push(...col);
          }
        }
        for (let r = 0; r < rows - 1; r++) for (let q = 0; q < 2; q++) {
          const a = base + r * 3 + q, b = a + 1, c2 = a + 3, d2 = c2 + 1;
          Ia.push(a, c2, b, b, c2, d2);
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
    function hw3(p) { return p.hw + 3.45; }

    // ---- tyre walls (instanced) at the hairpin outside, chicane and pit exit ----
    const zones = [{ a: 300, b: 620, side: 'out' }, { a: 640, b: 780, side: 'both' }, { a: 880, b: 1060, side: 'out' }];
    zones.forEach((z, zi) => {
      const ms = [], cols = [];
      for (let s = z.a; s < z.b; s += 0.62) {
        main.atS(s, pp);
        const sides = z.side === 'both' ? [-1, 1] : [pp.kap > 0 || (pp.kap === 0 && false) ? -1 : 1];
        const k = pp.kap;
        for (const sg of (z.side === 'both' ? [-1, 1] : [k >= 0 ? -1 : 1])) {
          for (let row = 0; row < 2; row++) {
            const d = sg * (pp.hw + 3.15 - 0.0), x = pp.px + pp.rhx * d, zz = pp.pz + pp.rhz * d, y = terrain.heightAt(x, zz);
            const m = xf(x, y + 0.2 + row * 0.42, zz, Math.PI / 2, Math.atan2(-pp.rhz, pp.rhx), 0, 1, 1, 1);
            ms.push(m);
            const shade = 0.25 + 0.2 * hash(s * 3 + row); cols.push(new THREE.Color(shade * ((Math.floor(s / 3.1) % 5 === 0) ? 6 : 1), shade * ((Math.floor(s / 3.1) % 5 === 0) ? 6 : 1), shade * ((Math.floor(s / 3.1) % 5 === 0) ? 6 : 1)));
          }
        }
      }
      if (!ms.length) return;
      const geo = new THREE.CylinderGeometry(0.34, 0.34, 0.42, 7, 1); geo.rotateX(0);
      const im = new THREE.InstancedMesh(geo, lib.get('dark', {}), ms.length);
      ms.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, cols[i]); });
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = false; im.name = 'tyres_' + zi;
      const grp = new THREE.Group(); grp.add(im);
      addItem(grp, cOf((z.a + z.b) / 2), (z.b - z.a) / 2 + 20, 230);
    });

    // ---- start / finish area: gantry, grandstands, pit garages, flags, billboards ----
    {
      const b = new Batch(), grp = new THREE.Group(); grp.name = 'start_area';
      const hw = WIDTH / 2;
      // gantry at s = 0
      for (const sg of [-1, 1]) {
        const q = P(0, sg * (hw + 2.4));
        b.add('metalRusted', boxG(0.6, 9.5, 0.6, 2), xf(q.x, q.y + 4.5, q.z, 0, q.ry, 0), [0.9, 0.9, 0.95]);
        b.add('concrete', boxG(1.4, 0.6, 1.4, 2), xf(q.x, q.y + 0.2, q.z, 0, q.ry, 0), [1, 1, 1]);
      }
      const c0 = P(0, 0);
      b.add('metalRusted', boxG(WIDTH + 5.6, 1.5, 0.7, 2), xf(c0.x, c0.y + 9.2, c0.z, 0, c0.ry, 0), [0.9, 0.9, 0.95]);
      b.add('checker', boxG(WIDTH + 5.6, 0.7, 0.12, 2.4), xf(c0.x, c0.y + 7.9, c0.z, 0, c0.ry, 0), [1, 1, 1]);
      for (let i = 0; i < 5; i++) b.add('dark', boxG(0.5, 0.35, 0.3, 1), xf(c0.x + c0.rhx * (i - 2) * 2.6, c0.y + 8.5, c0.z + c0.rhz * (i - 2) * 2.6, 0, c0.ry, 0), [2.2, 0.3, 0.2]);
      const bm = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH + 4.5, 1.9), new THREE.MeshStandardMaterial({ map: bannerTexture('START / FINISH', '#f4f1e6', '#111111'), roughness: 0.9, side: THREE.DoubleSide }));
      bm.position.set(c0.x, c0.y + 9.0, c0.z); bm.rotation.y = c0.ry; grp.add(bm);
      // grandstands (left = outside of the straight) and a second one on the back straight
      const stand = (sCenter, len, side, tiers = 6) => {
        for (let t = 0; t < tiers; t++) {
          const q = P(sCenter, side * (hw + 6.3 + t * 1.5));
          const yaw = q.ry;
          b.add('concrete', boxG(len, 0.9 + t * 0.9, 1.5, 2), xf(q.x, q.y + (0.9 + t * 0.9) / 2 + 1.2, q.z, 0, yaw, 0), [0.95, 0.95, 0.92]);
          b.add('dark', boxG(len - 0.4, 0.12, 0.5, 1), xf(q.x - q.rhx * side * 0.2, q.y + 1.2 + 0.9 + t * 0.9 + 0.06, q.z - q.rhz * side * 0.2, 0, yaw, 0), t % 2 ? [0.85, 0.2, 0.15] : [0.2, 0.3, 0.7]);
        }
        const top = P(sCenter, side * (hw + 6.3 + (tiers - 1) * 1.5 - 0.6));
        b.add('metalRusted', boxG(len + 1, 0.25, tiers * 1.5 + 2.6, 2), xf(top.x, top.y + 1.2 + tiers * 0.9 + 3.4, top.z, 0, top.ry, 0), [0.95, 0.55, 0.45]);
        for (const e of [-1, 1]) for (const dd of [hw + 6.0, hw + 6.3 + tiers * 1.5]) { const pq = P(sCenter + e * (len / 2 - 0.3), side * dd); b.add('metalRusted', boxG(0.25, tiers * 0.9 + 3.4, 0.25, 1), xf(pq.x, pq.y + 1.2 + (tiers * 0.9 + 3.4) / 2, pq.z, 0, pq.ry, 0), [0.8, 0.8, 0.85]); }
        // crowd
        for (let t = 0; t < tiers; t++) for (let i = 0; i < len / 1.15; i++) {
          if (rnd() < 0.18) continue;
          const sc = sCenter - len / 2 + 0.6 + i * 1.15 + (rnd() - 0.5) * 0.5, q = P(sc, side * (hw + 6.7 + t * 1.5 + 0.1));
          figure(b, rnd, q.x, q.y + 1.2 + 0.9 + t * 0.9 + 0.0, q.z, q.ry - side * Math.PI / 2 + (rnd() - 0.5) * 0.5, 0.75 + rnd() * 0.25, true);
        }
      };
      stand(-40, 60, -1, 5); stand(55, 70, -1, 6);
      // pit garages on the right
      for (let i = 0; i < 9; i++) {
        const s = -30 + i * 13, q = P(s, hw + 5.0), col = [[0.9, 0.2, 0.15], [0.2, 0.4, 0.8], [0.95, 0.75, 0.2], [0.2, 0.6, 0.3]][i % 4];
        b.add('concrete', boxG(11.5, 3.6, 5, 2), xf(q.x + q.rhx * 2.5, q.y + 1.8, q.z + q.rhz * 2.5, 0, q.ry, 0), [1, 1, 0.97]);
        const f = P(s, hw + 2.55);
        b.add('dark', boxG(6.5, 2.6, 0.2, 1), xf(f.x, f.y + 1.5, f.z, 0, f.ry, 0), [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8]);
        b.add('dark', boxG(11.5, 0.5, 0.4, 1), xf(f.x, f.y + 3.6, f.z, 0, f.ry, 0), col);
      }
      // pit wall
      for (let s = -34; s < 90; s += 4) { const q = P(s, hw + 2.1); b.add('concrete', boxG(4, 1.0, 0.4, 2), xf(q.x, q.y + 0.5, q.z, 0, q.ry, 0), s % 8 ? [1, 1, 1] : [1.9, 1.9, 1.85]); }
      // flag poles with flags along the start straight (right side)
      for (let s = -60; s < 230; s += 24) {
        const q = P(s, -(hw + 4.6));
        b.add('metalRusted', cylG(0.06, 0.06, 7, 5, 1), xf(q.x, q.y + 3.5, q.z), [0.85, 0.85, 0.9]);
        const col = [[1.0, 0.2, 0.15], [0.9, 0.9, 0.85], [0.15, 0.3, 0.9], [1.0, 0.8, 0.2]][Math.floor(rnd() * 4)];
        b.add('dark', boxG(1.5, 0.9, 0.04, 1), xf(q.x + q.rhx * 0.75, q.y + 6.4, q.z + q.rhz * 0.75, 0, q.ry, 0), col);
      }
      // sponsor billboards behind the barrier
      for (let s = 130; s < LAP - 60; s += 52) {
        for (const sg of [-1, 1]) {
          if (rnd() < 0.35) continue; const q = P(s, sg * (hw + 5.0)), col = [[0.9, 0.2, 0.15], [0.2, 0.45, 0.85], [0.95, 0.8, 0.2], [0.2, 0.65, 0.35], [0.9, 0.9, 0.85]][Math.floor(rnd() * 5)];
          b.add('dark', boxG(8, 1.8, 0.2, 1), xf(q.x, q.y + 1.6, q.z, 0, q.ry, 0), col);
          b.add('metalRusted', boxG(0.2, 2.2, 0.2, 1), xf(q.x - q.rhx * 3.2 * 0, q.y + 1.0, q.z, 0, q.ry, 0), [0.7, 0.7, 0.75]);
        }
      }
      grp.add(b.build(lib, { shadow: false }));
      // bunting across the start straight
      const lines = [];
      for (const s of [-60, -20, 40, 80]) { const l = P(s, -(hw + 4.6)), r = P(s, hw + 4.6); lines.push({ a: [l.x, l.y + 7, l.z], b: [r.x, r.y + 7, r.z], sag: 1.4 }); }
      grp.add(buntingMesh(lines, lib));
      // painted lines on the grid + chequered line (draped)
      const strip = (s0, s1, tex, rep) => {
        const rows = 4, cols = 20, Pa = new Float32Array(rows * cols * 3), Na = new Float32Array(rows * cols * 3), Ua = new Float32Array(rows * cols * 2), idx = [];
        for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
          const s = s0 + ((s1 - s0) * r) / (rows - 1), q = P(s, (k / (cols - 1) * 2 - 1) * hw), i = r * cols + k;
          Pa[i * 3] = q.x; Pa[i * 3 + 1] = q.y + 0.035; Pa[i * 3 + 2] = q.z; Na[i * 3 + 1] = 1; Ua[i * 2] = (k / (cols - 1)) * rep; Ua[i * 2 + 1] = (r / (rows - 1)) * 0.5;
        }
        for (let r = 0; r < rows - 1; r++) for (let k = 0; k < cols - 1; k++) { const a = r * cols + k; idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(Pa, 3)); g.setAttribute('normal', new THREE.BufferAttribute(Na, 3)); g.setAttribute('uv', new THREE.BufferAttribute(Ua, 2)); g.setIndex(idx);
        const t = textureOf('checker').clone(); t.needsUpdate = true;
        return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      };
      grp.add(strip(-0.6, 0.6, 'checker', 6));
      addItem(grp, cOf(10), 150, 380);
    }

    // ---- trees outside the barriers ----
    const trees = scatterTrees({ net: nw, terrain, lib, parent, seed: sd, chunk: 125, perChunk: 60, minClear: 12, maxOff: 90, mix: [1.4, 1.2, 0.6, 0.6, 0.2, 1, 1.2, 1], salt: 5 });
    for (const t of trees) items.push({ center: t.center, radius: t.radius, groups: [{ obj: t.near, max: 80 }, { obj: t.far, min: 70, max: 380 }] });
    return { items, update: null };
  }

  return {
    id: 'circuit', name: 'Speedway', net, pads: [], terrainOpts, theme, surface, flags: { closed: true, laps: 3, flat: true, noStuckRescue: true },
    splits: [], hazards: [], startPos, landmarks: [{ type: 'finish', s: 3218, lateral: 0 }, { type: 'grandstand', s: 15, lateral: -14 }],
    decorate, ranges: { ground: 460 },
  };
}
