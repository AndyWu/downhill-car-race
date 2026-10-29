// Corn & Pumpkins: very narrow dirt lanes between tall corn, pumpkin patches, hay, scarecrows, barns and flocks of crows.
import * as THREE from 'three';
import { mulberry32, clamp, smoothstep, lerp, Noise } from '../util.js';
import { makeRoad, buildNetwork } from '../roadnet.js';
import { createHazardField, SURFACES } from '../hazards.js';
import { Batch, boxG, cylG, sphG, xf } from '../batch.js';
import { buildFarm } from '../farms.js';
import { scatterTrees } from './scatter.js';

const PRE = 40, POST = 70, LEN = 3218;
const CORN_H = 2.7;

function lanePoints() {
  const rng = mulberry32(9917);
  const ph1 = rng() * 6.28, ph2 = rng() * 6.28;
  const bends = [];
  let s = 260, sg = rng() < 0.5 ? 1 : -1;
  while (s < LEN - 120) { bends.push({ s, k: sg / (30 + rng() * 14), sig: 13 + rng() * 5 }); sg = -sg; s += 260 + rng() * 260; }
  const N = Math.ceil((PRE + LEN + POST) / 20) + 1, pts = []; let x = 0, z = 0, th = 0;
  for (let i = 0; i < N; i++) {
    pts.push([x, z]);
    const s0 = i * 20 - PRE;
    for (let m = 0; m < 20; m++) {
      const ss = s0 + m;
      let k = 0.003 * Math.sin((ss / 330) * 6.283 + ph1) + 0.0022 * Math.sin((ss / 140) * 6.283 + ph2);
      for (const b of bends) { const u = (ss - b.s) / b.sig; if (Math.abs(u) < 4.5) k += b.k * Math.exp(-0.5 * u * u); }
      th += (k - 0.004 * th) * smoothstep(-30, 20, ss);
      x += Math.sin(th); z -= Math.cos(th);
    }
  }
  return pts;
}

export function planCorn(seed) {
  const nz = new Noise(seed * 3 + 41);
  const ytab = [];
  { let y = 0; for (let s = -PRE; s <= LEN + POST + 2; s++) { ytab.push(y); y -= Math.max(0.03, 0.046 + 0.012 * Math.sin((s / 600) * 6.283 + 2) + 0.006 * Math.sin((s / 190) * 6.283)); } }
  const yAt = (s) => { const f = clamp(s + PRE, 0, ytab.length - 1.001), i = Math.floor(f); return ytab[i] + (ytab[i + 1] - ytab[i]) * (f - i); };
  const main = makeRoad({
    pts: lanePoints(), closed: false, lengthTarget: LEN, pre: PRE, post: POST, id: 0, name: 'Lane',
    yFn: (s) => yAt(s), widthFn: (s, kap) => clamp(3.45 + 0.35 * nz.n1(s / 60) - 0.4 * Math.min(1, Math.abs(kap) / 0.03), 3.0, 3.8),
    camberFn: (s, kap) => clamp(kap * 4, -0.05, 0.05) * smoothstep(-5, 15, s),
  });
  main.surf = { ...SURFACES.dirt };
  const net = buildNetwork({ main, length: LEN, lapLength: LEN });
  main.field = createHazardField(main, seed + 5, { order: ['puddle', 'mud', 'rutpool', 'gravel', 'rock', 'sand', 'puddle', 'rutpool', 'mud', 'gravel'], start: 100, startJit: 30, gap1: 42, gap2: 55, endGap: 100 });
  const hazards = main.field.hazards.map((h) => ({ ...h }));

  // ---- clearings (no corn): pumpkin patches, hay yards and two barn yards ----
  const clearings = [
    { s0: 330, s1: 405, side: 1, kind: 'pumpkin' }, { s0: 720, s1: 840, side: -1, kind: 'farm' }, { s0: 1180, s1: 1250, side: 1, kind: 'pumpkin' },
    { s0: 1620, s1: 1700, side: -1, kind: 'hay' }, { s0: 1960, s1: 2080, side: 1, kind: 'farm' }, { s0: 2430, s1: 2505, side: -1, kind: 'pumpkin' }, { s0: 2820, s1: 2890, side: 1, kind: 'hay' },
  ];
  const inClearing = (s, side) => clearings.find((c) => c.side === side && s > c.s0 && s < c.s1);

  const pads = [], farms = [], pp = {};
  for (const c of clearings.filter((c) => c.kind === 'farm')) {
    const sm = (c.s0 + c.s1) / 2; main.atS(sm, pp);
    const off = 21, side = c.side, hw = pp.hw;
    const bx = pp.px + pp.rhx * side * (hw + off), bz = pp.pz + pp.rhz * side * (hw + off);
    const dx = -side * pp.rhx, dz = -side * pp.rhz, yaw = Math.atan2(dx, dz), cs = Math.cos(yaw), sn = Math.sin(yaw);
    const x = bx - (-24 * cs + -6 * sn), z = bz - (24 * sn + -6 * cs);
    const farm = { i: farms.length, s: sm, side, x, z, yaw, r: 30, y: 0, roadX: pp.px + pp.rhx * side * (hw + 1.4), roadZ: pp.pz + pp.rhz * side * (hw + 1.4), hw, silo: true, windmill: farms.length === 0, tractor: farms.length === 1, seed: 777 + farms.length * 31, tint: farms.length % 3 };
    farms.push(farm); pads.push(farm);
  }

  // verge like the country road: foot ramp + lip, slippery sticky ground so cars slide back and are held in
  const verge = (road, s, d, hw) => {
    const ad = Math.abs(d), r = ad - (hw + 0.1);
    if (r <= -0.1) return 0;
    const ki = clamp(Math.round(s + PRE), 0, road.TN - 1), lip = 1.35 + 0.7 * Math.min(1, Math.abs(road.tables.kap[ki]) / 0.02);
    const foot = 0.4 * (Math.sqrt(r * r + 0.02) + r) * 0.5, rFoot = 1.4, hFoot = 0.56;
    const y = Math.min(foot, hFoot) + lip * smoothstep(rFoot, rFoot + 0.55, r);
    return y * (1 - smoothstep(rFoot + 2.0, rFoot + 7.0, r));
  };
  const terrainOpts = { hillAmp: 3.5, hillFar: 8, hillNear: 70, rutScale: 1, noiseScale: 1, crown: 0.1, sideSlope: 0.08, shoulderOut: 12, verge };
  const theme = {
    roadMat: 'dirtRoad',
    roadUV: (road, s, d, hwe, o) => { o[0] = d / 3.2; o[1] = s / 3.2; },
    roadColor: (road, s, d, p, rnz, o) => {
      const ad = Math.abs(d), edge = smoothstep(p.hw - 0.4, p.hw + 1.4, ad), rut = Math.exp(-(((ad - 0.95) / 0.32) ** 2)) * 0.16;
      const nzv = 0.92 + 0.14 * (rnz.n2(s * 0.8, d * 1.1) * 0.5 + 0.5), wet = road.field ? road.field.wet(s, d) : 0;
      const base = nzv * (1 - rut) * (1 - 0.62 * wet);
      o[0] = lerp(base, 0.8 * base, edge * 0.7); o[1] = lerp(base, 0.9 * base, edge * 0.7); o[2] = lerp(base, 0.55 * base, edge * 0.7);
    },
    terrMat: 'grass', terrColor: (x, z, off, s, d, cnz, rnz, o) => {
      const k = 0.9 + 0.12 * cnz.n2(x / 17 + 7, z / 17), t = smoothstep(-0.2, 0.6, cnz.n2(x / 80 + 3, z / 80));
      o[0] = lerp(0.9, 1.15, t) * k; o[1] = lerp(0.95, 1.0, t) * k; o[2] = lerp(0.62, 0.55, t) * k;
      if (off < 30) { const e = 1 - smoothstep(4, 30, off); o[0] = lerp(o[0], 0.85 * k, e); o[1] = lerp(o[1], 0.7 * k, e); o[2] = lerp(o[2], 0.5 * k, e); }
    },
  };
  const surface = (info) => {
    const ad = Math.abs(info.d), hw = info.hw;
    if (ad > hw + 0.5) {
      const slick = 1 - Math.min(1, Math.max(0, (ad - (hw + 4.2)) / 2));
      return { type: 'corn', friction: lerp(0.5, 0.06, slick), drag: 0.65, bump: 0.5 };
    }
    let f = SURFACES.dirt.friction, d = SURFACES.dirt.drag, b = SURFACES.dirt.bump, type = 'dirt';
    const edge = ad > hw ? ad - hw : 0;
    if (edge > 0) { f = lerp(f, 0.5, edge); d = lerp(d, 0.6, edge); b = lerp(b, 0.4, edge); if (edge > 0.5) type = 'grass'; }
    const z0 = info.zone;
    if (z0 && info.w > 0.04) { const t = clamp(info.w * 1.25, 0, 1); f = lerp(f, z0.friction, t); d = lerp(d, z0.drag, t); b = lerp(b, z0.bump, t); if (info.w > 0.4) type = z0.type; }
    return { type, friction: clamp(f, 0.05, 1.2), drag: Math.max(0, d), bump: clamp(b, 0, 1) };
  };
  const startPos = (slot) => ({ s: 13.5 - 4.4 * (slot >> 1) - ((slot & 1) ? 2.0 : 0), d: (slot & 1) ? 0.8 : -0.8 });

  // ====================================================================================
  function decorate({ net: nw, terrain, lib, parent, seed: sd }) {
    const rnd = mulberry32(sd * 53 + 3), items = [], P = {};
    const hwOf = (s) => main.atS(s, P).hw;
    const cardGeo = (() => {
      const pos = [], uv = [], nrm = [], idx = [];
      for (let q = 0; q < 2; q++) {
        const a = q * Math.PI / 2, cx = Math.cos(a) * 0.75, cz = Math.sin(a) * 0.75, b = pos.length / 3;
        pos.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz);
        uv.push(0, 1, 1, 1, 1, 0, 0, 0); nrm.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setIndex(idx); g.computeBoundingSphere(); return g;
    })();
    const cardMat = lib.get('cornCard', { sway: { amp: 0.16, freq: 1.7, hpow: 1.4, hscale: 0.37 } });
    const wallMat = lib.get('cornwall', { vertexColors: true });
    const q4 = new THREE.Quaternion(), e4 = new THREE.Euler();
    const CH = 100;
    for (let c = 0; c * CH < LEN + 40; c++) {
      const s0 = c * CH, s1 = Math.min(LEN + 40, s0 + CH), ms = [], cols = [];
      for (const side of [-1, 1]) for (const off of [1.35, 2.15, 3.0]) {
        for (let s = s0 + rnd() * 0.8; s < s1; s += 0.82 + rnd() * 0.2) {
          if (inClearing(s, side)) continue;
          const hw = hwOf(s), o = hw + off + (rnd() - 0.5) * 0.35, x = P.px + P.rhx * side * o, z = P.pz + P.rhz * side * o, y = terrain.heightAt(x, z) - 0.15;
          e4.set((rnd() - 0.5) * 0.08, rnd() * 6.28, (rnd() - 0.5) * 0.08, 'YXZ'); q4.setFromEuler(e4);
          const sc = 0.95 + rnd() * 0.3;
          ms.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q4.clone(), new THREE.Vector3(sc, CORN_H * (0.9 + rnd() * 0.25), sc)));
          const t = rnd(); cols.push(new THREE.Color(0.75 + t * 0.35, 0.85 + t * 0.2, 0.55 + rnd() * 0.3));
        }
      }
      if (!ms.length) continue;
      const im = new THREE.InstancedMesh(cardGeo, cardMat, ms.length);
      ms.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, cols[i]); }); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.name = 'corn_cards';
      const grp = new THREE.Group(); grp.add(im); parent.add(grp);
      main.atS((s0 + s1) / 2, P);
      items.push({ center: new THREE.Vector3(P.px, P.py, P.pz), radius: 62, groups: [{ obj: grp, max: 120 }] });
    }
    // wall + canopy strips, 300 m each
    for (let c = 0; c * 300 < LEN + 40; c++) {
      const s0 = c * 300, s1 = Math.min(LEN + 40, s0 + 300), Pa = [], Na = [], Ua = [], Ca = [], Ia = [];
      const cols = [5, 12, 22, 34], K = cols.length + 2, rows = Math.round((s1 - s0) / 4) + 1;
      for (const side of [-1, 1]) {
        const base = Pa.length / 3, rowOK = [];
        for (let r = 0; r < rows; r++) {
          const s = s0 + ((s1 - s0) * r) / (rows - 1); rowOK.push(!inClearing(s, side));
          main.atS(s, P); const hw = P.hw;
          const lat = [hw + 1.3, hw + 1.3, ...cols.map((v) => hw + v)], hh = [-0.4, CORN_H, ...cols.map(() => CORN_H)];
          lat.forEach((l, k) => {
            const x = P.px + P.rhx * side * l, z = P.pz + P.rhz * side * l, y = terrain.heightAt(x, z) + hh[k];
            Pa.push(x, y, z); Na.push(0, 1, 0); Ua.push(s / 3, k * 0.35); const sh = 0.8 + 0.3 * nz.n2(s / 7 + k, side * 3 + k * 5); Ca.push(0.9 * sh, 1.0 * sh, 0.75 * sh);
          });
        }
        for (let r = 0; r < rows - 1; r++) { if (!rowOK[r] || !rowOK[r + 1]) continue; for (let k = 0; k < K - 1; k++) { const a = base + r * K + k, b = a + 1, d = a + K, e = d + 1; Ia.push(a, d, b, b, d, e); } }
      }
      if (!Ia.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(Pa, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Na, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(Ua, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(Ca, 3));
      g.setIndex(Ia); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, wallMat); m.name = 'corn_canopy'; parent.add(m);
      const bs = g.boundingSphere;
      items.push({ center: bs.center.clone(), radius: bs.radius, groups: [{ obj: m, max: 520 }] });
    }

    // ---- pumpkin patches, hay, scarecrows in the clearings ----
    const pumpGeo = new THREE.IcosahedronGeometry(1, 1);
    for (const cl of clearings) {
      const grp = new THREE.Group(), b = new Batch();
      const sm = (cl.s0 + cl.s1) / 2, len = cl.s1 - cl.s0;
      const cx = (s, d) => { main.atS(s, P); return { x: P.px + P.rhx * cl.side * d, z: P.pz + P.rhz * cl.side * d, hw: P.hw, ry: Math.atan2(-P.rhz, P.rhx) }; };
      if (cl.kind === 'pumpkin') {
        const ms = [], cs = [], n = 190;
        for (let i = 0; i < n; i++) {
          const s = cl.s0 + 4 + rnd() * (len - 8), d = hwOf(s) + 3 + rnd() * 20, p = cx(s, d), y = terrain.heightAt(p.x, p.z), r = 0.28 + Math.pow(rnd(), 2) * 0.4;
          e4.set(0, rnd() * 6.28, 0); q4.setFromEuler(e4);
          ms.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, y + r * 0.62, p.z), q4.clone(), new THREE.Vector3(r, r * 0.78, r)));
          const t = rnd(); cs.push(t < 0.12 ? new THREE.Color(0.9, 0.78, 0.15) : t < 0.2 ? new THREE.Color(0.55, 0.62, 0.25) : new THREE.Color(1.0, 0.42 + rnd() * 0.2, 0.08));
        }
        const im = new THREE.InstancedMesh(pumpGeo, lib.get('dark', {}), ms.length);
        ms.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, cs[i]); }); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = false; grp.add(im);
        for (let i = 0; i < 70; i++) { const s = cl.s0 + 4 + rnd() * (len - 8), p = cx(s, hwOf(s) + 3 + rnd() * 20), y = terrain.heightAt(p.x, p.z); b.add('dark', boxG(0.9, 0.05, 0.7, 1), xf(p.x, y + 0.12, p.z, (rnd() - 0.5) * 0.2, rnd() * 6, 0), [0.25, 0.5, 0.15]); }
        const q = cx(cl.s0 + 3, hwOf(cl.s0) + 1.9), y = terrain.heightAt(q.x, q.z);
        b.add('woodWeathered', boxG(0.12, 1.8, 0.12, 1), xf(q.x, y + 0.9, q.z), [0.6, 0.5, 0.4]); b.add('dark', boxG(1.4, 0.7, 0.08, 1), xf(q.x, y + 1.7, q.z, 0, q.ry, 0), [1.0, 0.55, 0.1]);
        for (let s = cl.s0; s <= cl.s1; s += 4) { const q2 = cx(s, hwOf(s) + 2.6), y2 = terrain.heightAt(q2.x, q2.z); b.add('woodWeathered', boxG(0.12, 1.1, 0.12, 1), xf(q2.x, y2 + 0.5, q2.z), [0.6, 0.5, 0.4]); b.add('woodWeathered', boxG(4, 0.08, 0.1, 1), xf(q2.x, y2 + 0.85, q2.z, 0, q2.ry, 0), [0.62, 0.52, 0.42]); }
      }
      if (cl.kind === 'pumpkin' || cl.kind === 'hay') {
        for (let i = 0; i < (cl.kind === 'hay' ? 16 : 6); i++) {
          const s = cl.s0 + 3 + rnd() * (len - 6), p = cx(s, hwOf(s) + 4 + rnd() * (cl.kind === 'hay' ? 22 : 12)), y = terrain.heightAt(p.x, p.z), up = rnd() < 0.3;
          b.add('straw', cylG(0.72, 0.72, 1.3, 10, 2), xf(p.x, y + (up ? 0.65 : 0.72), p.z, up ? 0 : Math.PI / 2, rnd() * 6, 0), [0.95 + rnd() * 0.1, 0.9, 0.7]);
          if (cl.kind === 'hay' && rnd() < 0.45) b.add('straw', cylG(0.72, 0.72, 1.3, 10, 2), xf(p.x + 0.4, y + 1.9, p.z + 0.2, Math.PI / 2, rnd() * 6, 0), [1, 0.92, 0.72]);
        }
      }
      for (let i = 0; i < (cl.kind === 'farm' ? 1 : 2); i++) {
        const s = cl.s0 + 8 + rnd() * (len - 16), p = cx(s, hwOf(s) + 4.5 + rnd() * 9), y = terrain.heightAt(p.x, p.z), ry = rnd() * 6;
        const M = xf(p.x, y, p.z, 0, ry, 0), L = (m) => M.clone().multiply(m);
        b.add('woodWeathered', boxG(0.1, 2.3, 0.1, 1), L(xf(0, 1.15, 0)), [0.55, 0.45, 0.35]); b.add('woodWeathered', boxG(1.7, 0.1, 0.1, 1), L(xf(0, 1.75, 0)), [0.55, 0.45, 0.35]);
        b.add('dark', boxG(0.5, 0.85, 0.3, 1), L(xf(0, 1.55, 0)), [0.35 + rnd() * 0.3, 0.3, 0.55]); b.add('straw', sphG(0.22, 6, 4, 1), L(xf(0, 2.2, 0)), [1, 0.9, 0.6]);
        b.add('dark', cylG(0.34, 0.34, 0.05, 8, 1), L(xf(0, 2.38, 0)), [0.45, 0.32, 0.18]); b.add('dark', cylG(0.18, 0.18, 0.22, 8, 1), L(xf(0, 2.5, 0)), [0.45, 0.32, 0.18]);
        for (const sx of [-1, 1]) b.add('straw', boxG(0.07, 0.4, 0.07, 1), L(xf(sx * 0.82, 1.55, 0)), [1, 0.9, 0.6]);
      }
      if (b.parts.size) grp.add(b.build(lib, { shadow: false }));
      if (grp.children.length) { grp.updateMatrixWorld(true); parent.add(grp); main.atS(sm, P); items.push({ center: new THREE.Vector3(P.px, P.py, P.pz), radius: len / 2 + 40, groups: [{ obj: grp, max: 260 }] }); }
    }
    // ---- barn yards ----
    for (const f of farms) {
      const fo = buildFarm(f, { terrain, lib });
      fo.group.name = 'corn_farm'; parent.add(fo.group);
      items.push({ center: new THREE.Vector3(f.x, f.y, f.z), radius: 90, groups: [{ obj: fo.group, max: 330 }], farm: fo });
    }
    // ---- background trees ----
    const trees = scatterTrees({ net: nw, terrain, lib, parent, seed: sd, chunk: 125, perChunk: 34, minClear: 42, maxOff: 70, mix: [0.4, 0.3, 1.2, 1, 1, 1, 0.8, 0.8], salt: 14 });
    for (const t of trees) items.push({ center: t.center, radius: t.radius, groups: [{ obj: t.near, max: 80 }, { obj: t.far, min: 70, max: 400 }] });
    const birds = createBirds({ lib, parent, terrain, main, rnd });
    return {
      items,
      update(dt, camPos, time, actors) {
        birds.update(dt, camPos, time, actors);
        for (const it of items) if (it.farm && it.groups[0].obj.visible) it.farm.update(time, dt);
      },
    };
  }

  return {
    id: 'corn', name: 'Corn & Pumpkins', net, pads, terrainOpts, theme, surface, flags: { closed: false, laps: 1, flat: false, noStuckRescue: false },
    splits: [], hazards, startPos, landmarks: [{ type: 'barn', s: 780, lateral: -24 }, { type: 'barn', s: 2020, lateral: 24 }, { type: 'pumpkins', s: 365, lateral: 10 }, { type: 'finish', s: LEN, lateral: 0 }],
    decorate, ranges: { ground: 440 },
  };
}

// =========================================================================================
// Flocks of crows: idle = perched / circling over a field; scatter upward and away when a cart (or the camera) comes within 25 m.
function createBirds({ lib, parent, terrain, main, rnd }) {
  const geo = (() => {
    const P = [], N = [];
    const tri = (a, b, c) => { P.push(...a, ...b, ...c); const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1; for (let i = 0; i < 3; i++) N.push(nx / l, ny / l, nz / l); };
    const body = [[0, 0.02, -0.28], [-0.07, 0, 0.12], [0.07, 0, 0.12], [0, 0.09, 0.0]];
    tri(body[0], body[1], body[3]); tri(body[0], body[3], body[2]); tri(body[1], body[2], body[3]); tri(body[0], body[2], body[1]);
    for (const sg of [-1, 1]) { const w = [[0.04 * sg, 0.05, -0.06], [0.04 * sg, 0.05, 0.1], [0.5 * sg, 0.1, 0.02]]; tri(w[0], w[1], w[2]); tri(w[0], w[2], w[1]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(P.length / 3 * 2), 2)); g.computeBoundingSphere(); return g;
  })();
  const flocks = [], pp = {}, N_PER = 13;
  [180, 520, 910, 1300, 1640, 2000, 2350, 2700, 3010].forEach((s, fi) => {
    const side = fi % 2 ? 1 : -1; main.atS(s, pp);
    const off = pp.hw + 9 + rnd() * 14, cx = pp.px + pp.rhx * side * off, cz = pp.pz + pp.rhz * side * off;
    flocks.push({ cx, cz, gy: terrain.heightAt(cx, cz) + CORN_H, r: 7 + rnd() * 6, hgt: 5 + rnd() * 4, state: 0, t: 0, w: (0.35 + rnd() * 0.3) * (fi % 2 ? 1 : -1), birds: [] });
  });
  const total = flocks.length * N_PER;
  for (const f of flocks) for (let i = 0; i < N_PER; i++) f.birds.push({ a: rnd() * 6.28, perched: i % 3 === 0, ph: rnd() * 6.28, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rr: 0.7 + rnd() * 0.6, hh: rnd() * 2.5 });
  const mesh = new THREE.InstancedMesh(geo, lib.get('dark', {}), total); mesh.name = 'crows'; mesh.frustumCulled = false;
  for (let i = 0; i < total; i++) { const t = 0.05 + 0.04 * ((i * 7) % 5); mesh.setColorAt(i, new THREE.Color(t, t, t * 1.1)); }
  mesh.instanceColor.needsUpdate = true; mesh.castShadow = false; parent.add(mesh);
  const q = new THREE.Quaternion(), e = new THREE.Euler(), m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  const FLEE = 25 * 25;
  function update(dt, camPos, time, actors) {
    const pts = [camPos, ...(actors || [])];
    let idx = 0;
    for (const f of flocks) {
      let who = null;
      for (const p of pts) { const dx = p.x - f.cx, dz = p.z - f.cz; if (dx * dx + dz * dz < FLEE) { who = p; break; } }
      if (f.state === 0 && who) {
        f.state = 1; f.t = 0;
        for (const b of f.birds) {
          const away = Math.atan2(f.cz - who.z, f.cx - who.x) + (rnd() - 0.5) * 2.0, sp = 4 + rnd() * 5;
          b.vx = Math.cos(away) * sp; b.vz = Math.sin(away) * sp; b.vy = 5 + rnd() * 5;
          b.x = f.cx + Math.cos(b.a) * f.r * b.rr; b.z = f.cz + Math.sin(b.a) * f.r * b.rr; b.y = b.perched ? f.gy + 0.1 : f.gy + f.hgt + b.hh;
        }
      }
      if (f.state === 1) { f.t += dt; if (f.t > 14) { f.state = 0; f.t = 0; } }
      for (const b of f.birds) {
        let x, y, z, yaw, flap;
        if (f.state === 1) {
          b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt; b.vy += (2.2 - b.vy) * dt * 0.6; if (f.t > 9) b.vy -= 3 * dt;
          x = b.x; y = Math.max(b.y, f.gy + 0.4); z = b.z; yaw = Math.atan2(-b.vx, -b.vz); flap = 0.45 + 0.55 * Math.abs(Math.sin(time * 15 + b.ph));
        } else if (b.perched) {
          const a = b.a + b.ph; x = f.cx + Math.cos(a) * f.r * 0.6 * b.rr; z = f.cz + Math.sin(a) * f.r * 0.6 * b.rr; y = f.gy + 0.05 + 0.04 * Math.max(0, Math.sin(time * 3 + b.ph * 5)); yaw = b.ph; flap = 0.25;
        } else {
          b.a += f.w * dt; const a = b.a, dir = Math.sign(f.w); x = f.cx + Math.cos(a) * f.r * b.rr; z = f.cz + Math.sin(a) * f.r * b.rr; y = f.gy + f.hgt + b.hh + Math.sin(time * 0.8 + b.ph) * 0.8;
          yaw = Math.atan2(Math.sin(a) * dir, Math.cos(a) * dir); flap = 0.45 + 0.55 * Math.abs(Math.sin(time * 9 + b.ph));
        }
        e.set(0, yaw, 0, 'YXZ'); q.setFromEuler(e); pos.set(x, y, z); sc.set(flap + 0.2, 1, 1);
        m4.compose(pos, q, sc); mesh.setMatrixAt(idx++, m4);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(0, new THREE.Vector3(1e6, 0, 1e6), 0, []);
  return { mesh, update };
}
