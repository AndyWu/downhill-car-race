// Farm planning (so terrain can be levelled) and procedural farm set pieces.
import * as THREE from 'three';
import { mulberry32, clamp, smoothstep } from './util.js';
import { Batch, boxG, cylG, sphG, prismG, xf } from './batch.js';

const FARM_OFFSET = 68;
export function planFarms(track, seed) {
  const rng = mulberry32(seed * 6131 + 7);
  const farms = [], q = {}, pp = {};
  const bases = [330, 800, 1290, 1760, 2230, 2700];
  bases.forEach((base, i) => {
    for (let att = 0; att < 14; att++) {
      const s = base + rng() * 90 + (att > 1 ? ((att % 2) ? 1 : -1) * (att >> 1) * 40 : 0);
      const side = (att % 2 === 0) === (i % 2 === 0) ? 1 : -1;
      track.atS(s, pp);
      const x = pp.px + pp.rhx * side * (pp.hw + FARM_OFFSET), z = pp.pz + pp.rhz * side * (pp.hw + FARM_OFFSET);
      track.project2(x, z, q);
      if (q.dist < 60) continue;
      let ok = true;
      for (const f of farms) if (Math.hypot(f.x - x, f.z - z) < 220) ok = false;
      if (!ok) continue;
      const fs = q.s, sgn = q.d >= 0 ? 1 : -1;
      track.atS(fs, pp);
      const rx = pp.px + pp.rhx * sgn * (pp.hw + 1.4), rz = pp.pz + pp.rhz * sgn * (pp.hw + 1.4);
      const yaw = Math.atan2(rx - x, rz - z);
      farms.push({
        i, s: fs, side: sgn, x, z, yaw, r: 30, y: 0, roadX: rx, roadZ: rz, hw: pp.hw,
        silo: rng() < 0.7, windmill: i === 1 || i === 4, tractor: i % 2 === 0, seed: Math.floor(rng() * 1e6),
        tint: Math.floor(rng() * 3),
      });
      break;
    }
  });
  return farms;
}

const _y = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1);
function between(a, b) {
  const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
  _q.setFromUnitVectors(_y, dir.normalize());
  return { m: new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), _q.clone(), _s), len };
}

export function buildFarm(farm, { terrain, lib }) {
  const rng = mulberry32(farm.seed);
  const R = (a, b) => a + (b - a) * rng();
  const g = new THREE.Group();
  g.position.set(farm.x, farm.y, farm.z); g.rotation.y = farm.yaw;
  g.name = 'farm_' + farm.i;
  const b = new Batch();
  let base = new THREE.Matrix4();
  const add = (key, geom, local, color) => b.add(key, geom, base.clone().multiply(local || new THREE.Matrix4()), color);
  const withBase = (m, fn) => { const old = base; base = old.clone().multiply(m); fn(); base = old; };
  const WOOD_TINTS = [[1.35, 1.3, 1.18], [0.95, 1.1, 0.95], [1.05, 0.98, 0.9]];
  const wt = WOOD_TINTS[farm.tint];
  const cosY = Math.cos(farm.yaw), sinY = Math.sin(farm.yaw);
  const toWorld = (lx, lz) => [farm.x + lx * cosY + lz * sinY, farm.z - lx * sinY + lz * cosY];
  const toLocal = (wx, wz) => { const dx = wx - farm.x, dz = wz - farm.z; return [dx * cosY - dz * sinY, dx * sinY + dz * cosY]; };
  const groundLocal = (lx, lz) => { const [wx, wz] = toWorld(lx, lz); return terrain.heightAt(wx, wz) - farm.y; };

  // ============ HOUSE ============
  withBase(xf(0, 0, 0, 0, 0, 0), () => {
    add('rock', boxG(9.4, 0.7, 7.4, 2), xf(0, 0.25, 0), [0.8, 0.78, 0.74]);
    add('woodWeathered', boxG(9, 3.2, 7, 2), xf(0, 2.2, 0), wt);
    // gable ends
    for (const sx of [-1, 1]) add('woodWeathered', prismG([[-3.5, 0], [3.5, 0], [0, 2.7]], 0.2, 2), xf(sx * 4.5, 3.8, 0, 0, Math.PI / 2, 0), wt);
    // roof
    const th = 0.61, sl = 4.95;
    add('metalRusted', boxG(10, 0.12, sl, 2), xf(0, 5.25, 1.97, th, 0, 0), [1.0, 0.75, 0.65]);
    add('metalRusted', boxG(10, 0.12, sl, 2), xf(0, 5.25, -1.97, -th, 0, 0), [0.9, 0.7, 0.62]);
    add('metalRusted', boxG(10.1, 0.14, 0.3, 2), xf(0, 6.55, 0), [0.8, 0.6, 0.5]);
    // chimney
    add('rock', boxG(0.9, 3.0, 0.9, 2), xf(-2.5, 6.0, -1.0), [1.25, 0.6, 0.45]);
    add('rock', boxG(1.1, 0.15, 1.1, 2), xf(-2.5, 7.5, -1.0), [0.8, 0.78, 0.74]);
    // porch
    add('woodWeathered', boxG(9, 0.18, 2.9, 1.5), xf(0, 0.62, 4.95), [wt[0] * 0.8, wt[1] * 0.78, wt[2] * 0.75]);
    for (const px of [-4.2, -1.4, 1.4, 4.2]) add('woodWeathered', boxG(0.16, 2.9, 0.16, 2), xf(px, 2.1, 6.2), wt);
    add('woodWeathered', boxG(9.6, 0.1, 3.5, 2), xf(0, 3.55, 5.0, 0.14, 0, 0), [0.8, 0.75, 0.7]);
    add('woodWeathered', boxG(8.8, 0.08, 0.1, 2), xf(0, 1.6, 6.2), wt);
    add('woodWeathered', boxG(8.8, 0.08, 0.1, 2), xf(0, 1.15, 6.2), wt);
    for (let i = 0; i < 17; i++) { if (i === 8) continue; add('woodWeathered', boxG(0.05, 0.8, 0.05, 1), xf(-4.2 + i * 0.52, 1.25, 6.2), wt); }
    for (let i = 0; i < 3; i++) add('woodWeathered', boxG(1.6, 0.14, 0.4, 2), xf(0, 0.12 + i * 0.16, 6.75 - i * 0.35), [0.8, 0.75, 0.7]);
    // door + windows
    add('dark', boxG(1.2, 2.2, 0.1, 1), xf(0, 1.9, 3.52), [0.28, 0.2, 0.15]);
    for (const wx of [-2.9, 2.9]) {
      add('woodWeathered', boxG(1.25, 1.55, 0.06, 1), xf(wx, 2.6, 3.52), [1.4, 1.38, 1.3]);
      add('dark', boxG(1.0, 1.3, 0.08, 1), xf(wx, 2.6, 3.54), [0.07, 0.09, 0.1]);
      add('woodWeathered', boxG(0.05, 1.3, 0.1, 1), xf(wx, 2.6, 3.56), [1.4, 1.38, 1.3]);
    }
    for (const wz of [-1.5, 1.5]) for (const sx of [-1, 1]) {
      add('woodWeathered', boxG(0.06, 1.55, 1.25, 1), xf(sx * 4.52, 2.6, wz), [1.4, 1.38, 1.3]);
      add('dark', boxG(0.08, 1.3, 1.0, 1), xf(sx * 4.54, 2.6, wz), [0.07, 0.09, 0.1]);
    }
    // shutter hanging crooked
    add('woodWeathered', boxG(0.5, 1.5, 0.05, 1), xf(-3.9, 2.6, 3.55, 0, 0, 0.12), [0.45, 0.6, 0.5]);
    // rain barrel and woodpile
    add('woodWeathered', cylG(0.42, 0.45, 0.95, 10, 1), xf(-4.9, 0.85, 3.0), [0.7, 0.62, 0.55]);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 6 - r; k++) add('woodWeathered', cylG(0.11, 0.11, 1.5, 6, 1), xf(4.9 + 0.3 * r + 0.0, 0.2 + r * 0.19, -2.4 + k * 0.23 + r * 0.12, Math.PI / 2, 0, 0), [0.7, 0.55, 0.42]);
    // rocking chair
    withBase(xf(2.2, 0.72, 5.6, 0, 0.3, 0), () => {
      add('woodWeathered', boxG(0.55, 0.06, 0.5, 1), xf(0, 0.4, 0), [0.7, 0.55, 0.4]);
      add('woodWeathered', boxG(0.55, 0.6, 0.05, 1), xf(0, 0.72, -0.23, -0.15, 0, 0), [0.7, 0.55, 0.4]);
      add('woodWeathered', boxG(0.05, 0.05, 0.7, 1), xf(-0.25, 0.05, 0), [0.7, 0.55, 0.4]);
      add('woodWeathered', boxG(0.05, 0.05, 0.7, 1), xf(0.25, 0.05, 0), [0.7, 0.55, 0.4]);
    });
  });

  // ============ BARN ============
  withBase(xf(-24, 0, -6, 0, 0.18, 0), () => {
    const tintBarn = [R(0.95, 1.2), R(0.8, 1.0), R(0.75, 0.95)];
    add('rock', boxG(11.4, 0.6, 16.4, 2), xf(0, 0.2, 0), [0.7, 0.68, 0.64]);
    add('barnPaint', boxG(11, 5, 16, 2), xf(0, 2.8, 0), tintBarn);
    const prof = [[-5.5, 5], [5.5, 5], [4.1, 7.4], [0, 9.2], [-4.1, 7.4]];
    for (const sz of [-1, 1]) add('barnPaint', prismG(prof, 0.25, 2), xf(0, 0.3, sz * 8), tintBarn);
    const slab = (ax, ay, bx, by, key, col) => {
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
      const nx = -dy / len * 0.08, ny = dx / len * 0.08;
      add(key, boxG(len + 0.15, 0.14, 16.9, 2), xf((ax + bx) / 2 + nx, (ay + by) / 2 + ny + 0.3, 0, 0, 0, ang), col);
    };
    const rc = [R(0.85, 1.05), R(0.6, 0.75), R(0.5, 0.65)];
    slab(5.5, 5, 4.1, 7.4, 'metalRusted', rc); slab(4.1, 7.4, 0, 9.2, 'metalRusted', rc);
    slab(-5.5, 5, -4.1, 7.4, 'metalRusted', rc); slab(-4.1, 7.4, 0, 9.2, 'metalRusted', [rc[0] * 0.9, rc[1] * 0.9, rc[2] * 0.9]);
    // doors and trim
    const trim = [1.5, 1.45, 1.35];
    add('barnPaint', boxG(4.4, 4.0, 0.14, 2), xf(0, 2.3, 8.08), [0.7, 0.6, 0.55]);
    for (const [x, y, w, h] of [[-2.2, 2.3, 0.2, 4.1], [2.2, 2.3, 0.2, 4.1], [0, 4.4, 4.6, 0.2], [0, 0.3, 4.6, 0.12], [0, 2.3, 0.14, 4.0]]) add('woodWeathered', boxG(w, h, 0.1, 1), xf(x, y, 8.14), trim);
    const dl = Math.hypot(4.4, 4.0), da = Math.atan2(4.0, 4.4);
    add('woodWeathered', boxG(dl, 0.16, 0.08, 1), xf(-1.1, 2.3, 8.17, 0, 0, da - 0), trim);
    add('woodWeathered', boxG(dl, 0.16, 0.08, 1), xf(1.1, 2.3, 8.17, 0, 0, -da), trim);
    add('dark', boxG(1.7, 1.7, 0.1, 1), xf(0, 6.6, 8.1), [0.1, 0.08, 0.07]);
    add('woodWeathered', boxG(2.0, 0.15, 0.12, 1), xf(0, 7.5, 8.17), trim);
    add('woodWeathered', boxG(2.0, 0.15, 0.12, 1), xf(0, 5.7, 8.17), trim);
    for (const wz of [-4, 0, 4]) for (const sx of [-1, 1]) add('dark', boxG(0.1, 0.9, 1.2, 1), xf(sx * 5.52, 3.4, wz), [0.08, 0.07, 0.07]);
    // cupola + vane
    add('barnPaint', boxG(1.3, 1.1, 1.3, 2), xf(0, 9.6, 0), [0.9, 0.9, 0.9]);
    add('metalRusted', cylG(0.01, 1.2, 0.8, 4, 2), xf(0, 10.5, 0, 0, Math.PI / 4, 0), [0.8, 0.7, 0.65]);
    add('metalRusted', cylG(0.03, 0.03, 1.2, 5, 1), xf(0, 11.4, 0), [0.4, 0.4, 0.4]);
    add('dark', boxG(0.9, 0.25, 0.04, 1), xf(0, 11.9, 0, 0, 0.6, 0), [0.1, 0.1, 0.1]);
    // lean-to with hay stack
    add('woodWeathered', boxG(0.3, 2.6, 0.3, 1), xf(5.6 + 3.5, 1.3, 6.5), [0.8, 0.75, 0.7]);
    add('metalRusted', boxG(3.9, 0.1, 4.8, 2), xf(5.5 + 1.9, 2.9, 4.5, 0, 0, -0.12), [0.9, 0.62, 0.5]);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3 - r; k++) add('straw', boxG(1.0, 0.5, 0.5, 1), xf(7 + k * 1.02 + r * 0.5, 0.3 + r * 0.5, 3.4 + (k % 2) * 0.1, 0, R(-0.05, 0.05), 0), [R(0.9, 1.1), R(0.9, 1.05), R(0.8, 1.0)]);
  });

  // ============ SILO ============
  if (farm.silo) {
    withBase(xf(-24 + 9.4, 0, -6 - 5.2, 0, 0, 0), () => {
      const sc = [0.95, 0.95, 0.9];
      add('rock', cylG(2.5, 2.6, 0.5, 14, 2), xf(0, 0.1, 0), [0.8, 0.78, 0.74]);
      add('metalRusted', cylG(2.2, 2.2, 11, 14, 2), xf(0, 5.8, 0), sc);
      for (let i = 0; i < 9; i++) add('metalRusted', cylG(2.26, 2.26, 0.12, 14, 2), xf(0, 1.0 + i * 1.2, 0), [0.7, 0.6, 0.55]);
      add('metalRusted', sphG(2.25, 14, 6, 2, Math.PI * 2, Math.PI / 2), xf(0, 11.3, 0, 0, 0, 0, 1, 0.75, 1), [0.9, 0.7, 0.62]);
      add('metalRusted', cylG(0.1, 0.1, 0.6, 6, 1), xf(0, 12.4, 0), [0.5, 0.5, 0.5]);
      add('metalRusted', boxG(0.5, 9, 0.08, 1), xf(0, 5.3, 2.25), [0.6, 0.55, 0.5]);
      add('dark', boxG(0.9, 1.2, 0.1, 1), xf(0, 1.2, 2.2), [0.12, 0.1, 0.1]);
    });
  }

  // ============ HAY ============
  for (let i = 0; i < 4; i++) {
    const lx = R(-10, 8), lz = R(-18, -12);
    add('straw', cylG(0.72, 0.72, 1.3, 12, 2), xf(lx, groundLocal(lx, lz) + 0.72, lz, Math.PI / 2, R(0, 6), 0), [R(0.9, 1.1), R(0.9, 1.05), R(0.8, 1.0)]);
  }

  // ============ FENCED YARD ============
  {
    const pts = [[-13, 10], [-2.2, 10], null, [2.2, 10], [13, 10], [13, -10], [-13, -10], [-13, 10]];
    let prev = null;
    for (const p of pts) {
      if (!p) { prev = null; continue; }
      if (prev) {
        const len = Math.hypot(p[0] - prev[0], p[1] - prev[1]), n = Math.max(1, Math.round(len / 3));
        for (let i = 0; i <= n; i++) {
          const x = prev[0] + (p[0] - prev[0]) * i / n, z = prev[1] + (p[1] - prev[1]) * i / n, y = groundLocal(x, z);
          if (rng() > 0.05) add('woodWeathered', boxG(0.13, 1.2, 0.13, 2), xf(x, y + 0.55, z, R(-0.05, 0.05), 0, R(-0.05, 0.05)), [R(0.7, 0.9), R(0.65, 0.85), R(0.6, 0.8)]);
          if (i < n) {
            const x2 = prev[0] + (p[0] - prev[0]) * (i + 1) / n, z2 = prev[1] + (p[1] - prev[1]) * (i + 1) / n, y2 = groundLocal(x2, z2);
            for (const hh of [0.45, 0.95]) {
              if (rng() < 0.06) continue;
              const bt = between(new THREE.Vector3(x, y + hh, z), new THREE.Vector3(x2, y2 + hh + R(-0.04, 0.04), z2));
              // box along Y, so rotate: use cylinder instead
              add('woodWeathered', cylG(0.045, 0.045, bt.len, 5, 1), bt.m, [R(0.75, 0.95), R(0.7, 0.9), R(0.65, 0.85)]);
            }
          }
        }
      }
      prev = p;
    }
  }

  // ============ TRACTOR (abandoned) ============
  if (farm.tractor) {
    const tx = R(16, 24), tz = R(-18, -10), ty = groundLocal(tx, tz);
    withBase(xf(tx, ty - 0.1, tz, 0, R(0, 6.28), R(-0.08, 0.08)), () => {
      const body = farm.i % 4 === 0 ? [1.2, 0.5, 0.38] : [0.55, 0.85, 0.5];
      for (const sx of [-1, 1]) {
        add('dark', cylG(0.82, 0.82, 0.5, 14, 2), xf(sx * 0.95, 0.82, -0.8, 0, 0, Math.PI / 2), [0.1, 0.1, 0.09]);
        add('metalRusted', cylG(0.36, 0.36, 0.56, 8, 1), xf(sx * 0.95, 0.82, -0.8, 0, 0, Math.PI / 2), body);
        add('dark', cylG(0.42, 0.42, 0.3, 10, 1), xf(sx * 0.65, 0.42, 1.5, 0, 0, Math.PI / 2), [0.1, 0.1, 0.09]);
        add('metalRusted', boxG(0.5, 0.08, 1.4, 1), xf(sx * 0.95, 1.75, -0.8), body);
      }
      add('metalRusted', boxG(0.7, 0.55, 2.9, 1), xf(0, 0.95, 0.3), [0.8, 0.7, 0.6]);
      add('metalRusted', boxG(0.9, 0.85, 1.7, 1), xf(0, 1.35, 1.1), body);
      add('metalRusted', cylG(0.05, 0.05, 1.0, 6, 1), xf(0.25, 2.1, 1.5), [0.5, 0.35, 0.3]);
      add('dark', boxG(0.6, 0.12, 0.5, 1), xf(0, 1.6, -0.7), [0.15, 0.1, 0.08]);
      add('dark', boxG(0.6, 0.5, 0.1, 1), xf(0, 1.85, -0.95, -0.2, 0, 0), [0.15, 0.1, 0.08]);
      add('metalRusted', cylG(0.02, 0.02, 0.9, 5, 1), xf(0, 1.9, 0.0, 0.5, 0, 0), [0.4, 0.4, 0.4]);
    });
  }

  // ============ MAILBOX at road ============
  {
    const side = farm.side;
    const mx = farm.roadX + (farm.roadX - farm.x) * 0, mz = farm.roadZ;
    // shift sideways along the road a little and out a touch
    const [lx, lz] = toLocal(mx, mz);
    const sx = lx + 3.0, sz = lz - 0.6;
    const y = groundLocal(sx, sz);
    withBase(xf(sx, y, sz, 0, R(-0.4, 0.4), R(-0.04, 0.04)), () => {
      add('woodWeathered', boxG(0.12, 1.25, 0.12, 1), xf(0, 0.6, 0), [0.7, 0.62, 0.55]);
      add('metalRusted', boxG(0.28, 0.24, 0.56, 1), xf(0, 1.35, 0.05), [1.0, 0.6, 0.45]);
      add('metalRusted', cylG(0.14, 0.14, 0.56, 8, 1), xf(0, 1.47, 0.05, Math.PI / 2, 0, 0), [1.0, 0.6, 0.45]);
      add('dark', boxG(0.03, 0.22, 0.05, 1), xf(0.17, 1.5, 0.15), [0.7, 0.1, 0.08]);
    });
  }

  // ============ FIELDS (draped over terrain) ============
  const fieldMat = lib.get('field', { vertexColors: true, polygonOffset: -1 });
  const mkField = (cx, cz, w, d, rot, col) => {
    const nx = 14, nz = 8, P = [], UV = [], C = [], I = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const u = (i / nx - 0.5) * w, v = (j / nz - 0.5) * d;
      const lx = cx + u * Math.cos(rot) - v * Math.sin(rot), lz = cz + u * Math.sin(rot) + v * Math.cos(rot);
      P.push(lx, groundLocal(lx, lz) + 0.07, lz);
      UV.push(u / 14, v / 14);
      const k = 0.9 + 0.2 * rng();
      C.push(col[0] * k, col[1] * k, col[2] * k);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, bb = a + 1, c = a + nx + 1, d2 = c + 1;
      const tri = (p, q, r) => {
        const ny = (P[q * 3 + 2] - P[p * 3 + 2]) * (P[r * 3] - P[p * 3]) - (P[q * 3] - P[p * 3]) * (P[r * 3 + 2] - P[p * 3 + 2]);
        if (ny >= 0) I.push(p, q, r); else I.push(p, r, q);
      };
      tri(a, bb, c); tri(bb, d2, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    geo.setIndex(I); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, fieldMat); m.receiveShadow = true; m.name = 'field';
    g.add(m);
  };
  const cropCols = [[0.95, 0.72, 0.3], [0.3, 0.6, 0.25], [0.6, 0.42, 0.3], [0.5, 0.62, 0.28]];
  mkField(-8, -50, 54, 32, R(-0.2, 0.2), cropCols[Math.floor(R(0, 4))]);
  mkField(40, -34, 40, 28, R(-0.3, 0.3), cropCols[Math.floor(R(0, 4))]);
  for (let i = 0; i < 6; i++) { const lx = R(-30, 10), lz = R(-60, -42); add('straw', cylG(0.72, 0.72, 1.3, 12, 2), xf(lx, groundLocal(lx, lz) + 0.74, lz, Math.PI / 2, R(0, 6), 0), [R(0.9, 1.1), R(0.9, 1.05), R(0.8, 1.0)]); }

  // ============ OAK + TIRE SWING ============
  const ox = 15, oz = 9, oy = groundLocal(ox, oz);
  withBase(xf(ox, oy, oz), () => {
    add('woodWeathered', cylG(0.45, 0.75, 6, 8, 2), xf(0, 3, 0), [0.55, 0.45, 0.38]);
    const bt = between(new THREE.Vector3(0, 4.4, 0), new THREE.Vector3(2.8, 5.0, 0));
    add('woodWeathered', cylG(0.18, 0.28, bt.len, 6, 2), bt.m, [0.55, 0.45, 0.38]);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * 6.28 + 0.4, rr = i === 0 ? 0 : 2.4;
      add('foliage', sphG(R(2.4, 3.3), 8, 6, 3), xf(Math.cos(a) * rr + 0.5, 7.2 + R(-0.7, 1.0) + (i === 0 ? 1.2 : 0), Math.sin(a) * rr, 0, 0, 0, 1, 0.8, 1), [R(0.7, 0.95), R(0.85, 1.05), R(0.6, 0.8)]);
    }
  });
  const swing = new THREE.Group();
  {
    const sb = new Batch();
    sb.add('dark', cylG(0.02, 0.02, 2.6, 4, 1), xf(0, -1.3, 0), [0.35, 0.28, 0.2]);
    const tire = new THREE.TorusGeometry(0.4, 0.15, 6, 12);
    sb.add('dark', tire, xf(0, -2.7, 0, Math.PI / 2 - 0.2, 0, 0), [0.08, 0.08, 0.08]);
    swing.add(sb.build(lib));
    swing.position.set(ox + 2.6, oy + 4.95, oz);
  }
  g.add(swing);

  // ============ WINDMILL ============
  let wheel = null;
  if (farm.windmill) {
    const wx = 12, wz = -12, wy = groundLocal(wx, wz);
    withBase(xf(wx, wy, wz), () => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const bt = between(new THREE.Vector3(sx * 1.6, 0, sz * 1.6), new THREE.Vector3(sx * 0.35, 11, sz * 0.35));
        add('metalRusted', cylG(0.06, 0.06, bt.len, 5, 1), bt.m, [0.7, 0.55, 0.5]);
      }
      for (const y of [3, 6, 9]) { const k = 1.6 - 1.25 * (y / 11); add('metalRusted', boxG(k * 2, 0.05, 0.05, 1), xf(0, y, k), [0.7, 0.55, 0.5]); add('metalRusted', boxG(k * 2, 0.05, 0.05, 1), xf(0, y, -k), [0.7, 0.55, 0.5]); }
      add('metalRusted', boxG(0.5, 0.5, 1.0, 1), xf(0, 11.3, 0), [0.8, 0.7, 0.6]);
      add('metalRusted', boxG(0.04, 0.8, 1.8, 1), xf(0, 11.5, -1.6), [0.9, 0.5, 0.4]);
    });
    wheel = new THREE.Group();
    const wb = new Batch();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.283; wb.add('metalRusted', boxG(0.2, 1.4, 0.03, 1), xf(Math.cos(a) * 1.15, Math.sin(a) * 1.15, 0, 0, 0, a - Math.PI / 2), [1.0, 0.7, 0.6]); }
    wb.add('metalRusted', cylG(0.18, 0.18, 0.2, 8, 1), xf(0, 0, 0, Math.PI / 2, 0, 0), [0.6, 0.5, 0.45]);
    wheel.add(wb.build(lib));
    wheel.position.set(wx, wy + 11.3, wz + 0.7);
    g.add(wheel);
  }

  const built = b.build(lib);
  g.add(built);

  // ============ DRIVEWAY (world-space ribbon, parented in farm local) ============
  {
    const [sx, sz] = toLocal(farm.roadX, farm.roadZ);
    const ex = 0, ez = 12;
    const n = 26, W = 3.4, P = [], UV = [], C = [], I = [];
    const dx = ex - sx, dz = ez - sz, L = Math.hypot(dx, dz), nxv = -dz / L, nzv = dx / L;
    for (let i = 0; i <= n; i++) {
      const t = i / n, cx = sx + dx * t + Math.sin(t * 7 + farm.i) * 1.2 * Math.sin(t * Math.PI), cz = sz + dz * t;
      for (let j = 0; j < 4; j++) {
        const u = (j / 3) * 2 - 1, wv = W * (1 - 0.3 * t) * u * 0.5 * (j === 0 || j === 3 ? 1.5 : 1);
        const px = cx + nxv * wv, pz = cz + nzv * wv;
        P.push(px, groundLocal(px, pz) + 0.06, pz); UV.push(u * 0.6, t * L / 3);
        const edge = (j === 0 || j === 3) ? 0 : 1;
        C.push(0.95, 0.9, 0.8, edge);
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) {
      const a = i * 4 + j, bb = a + 1, c = a + 4, d2 = c + 1;
      const tri = (p, q, r) => {
        const ny = (P[q * 3 + 2] - P[p * 3 + 2]) * (P[r * 3] - P[p * 3]) - (P[q * 3] - P[p * 3]) * (P[r * 3 + 2] - P[p * 3 + 2]);
        if (ny >= 0) I.push(p, q, r); else I.push(p, r, q);
      };
      tri(a, bb, c); tri(bb, d2, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 4));
    geo.setIndex(I); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, lib.get('dirtRoad', { vertexColors: true, transparent: true, polygonOffset: -2 })); m.receiveShadow = true; m.renderOrder = 1; m.name = 'driveway';
    g.add(m);
  }

  g.updateMatrixWorld(true);
  // bounding sphere for range testing (in world)
  const center = new THREE.Vector3(farm.x, farm.y, farm.z);
  return {
    group: g, center, radius: 130, swing, wheel,
    update(t, dt) {
      swing.rotation.z = Math.sin(t * 1.1 + farm.i) * 0.14; swing.rotation.x = Math.sin(t * 0.8) * 0.06;
      if (wheel) wheel.rotation.z -= dt * (1.5 + 0.8 * Math.sin(t * 0.3));
    },
  };
}
