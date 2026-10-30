// Generic ground meshes for road networks: road strips for every road, terrain ribbons along the main road, far-field cap.
import * as THREE from 'three';
import { Noise, clamp, smoothstep, lerp } from '../util.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const SHOULDER_IN = 1.5;
export const OFFS2 = [0, 0.6, 1.4, 2.4, 3.6, 5, 7, 9.5, 13, 18, 26, 38, 58, 90, 140, 220];

function emitTri(idx, P, a, b, c) {
  const ny = (P[b * 3 + 2] - P[a * 3 + 2]) * (P[c * 3] - P[a * 3]) - (P[b * 3] - P[a * 3]) * (P[c * 3 + 2] - P[a * 3 + 2]);
  if (ny >= 0) idx.push(a, b, c); else idx.push(a, c, b);
}
function gridIdx(P, rows, cols, base, idx) {
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const a = base + r * cols + c, b = a + 1, d = a + cols, e = d + 1;
    emitTri(idx, P, a, b, d); emitTri(idx, P, b, e, d);
  }
}
const mkGeo = (P, N, UV, C, idx) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.setIndex(idx); g.computeBoundingSphere(); return g;
};

export function buildGroundNet({ net, terrain, lib, parent, theme, seed }) {
  const rnz = new Noise(seed * 17 + 2), cnz = new Noise(seed * 5 + 1);
  const T = { rowStep: 2, colSpacing: 0.55, terrRow: 4, offs: OFFS2, chunk: 100, ...theme };
  const roadMat = lib.get(T.roadMat, { vertexColors: true, polygonOffset: -2 });
  const grassMat = lib.get(T.terrMat || 'grass', { vertexColors: true });
  const innerMat = T.innerMat ? lib.get(T.innerMat, { vertexColors: true }) : null;
  const pp = {}, col = [0, 0, 0], uvo = [0, 0];
  const chunks = [];

  function roadGeo(road, sA, sB, rowStep, cols0, detail) {
    const rows = Math.max(2, Math.round((sB - sA) / rowStep) + 1), cols = cols0 + 2, n = rows * cols;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = new Float32Array(n * 2), C = new Float32Array(n * 3);
    for (let r = 0; r < rows; r++) {
      const s = sA + (sB - sA) * (r / (rows - 1));
      road.atS(s, pp);
      const hwe = pp.hw + SHOULDER_IN;
      for (let k = 0; k < cols; k++) {
        const skirt = k === 0 ? -1 : k === cols - 1 ? 1 : 0;
        const kk = clamp(k - 1, 0, cols0 - 1), u = (kk / (cols0 - 1)) * 2 - 1, d = skirt ? skirt * (hwe + 0.9) : u * hwe, x = pp.px + pp.rhx * d, z = pp.pz + pp.rhz * d, i = r * cols + k;
        const dh = skirt ? skirt * hwe : d;
        const xe = pp.px + pp.rhx * dh, ze = pp.pz + pp.rhz * dh;
        P[i * 3] = x; P[i * 3 + 1] = terrain.heightAt(skirt ? xe : x, skirt ? ze : z) - (skirt ? 0.55 : 0); P[i * 3 + 2] = z;
        if (detail && !skirt) { const nrm = terrain.normalAt(x, z, 0.3); N[i * 3] = nrm.x; N[i * 3 + 1] = nrm.y; N[i * 3 + 2] = nrm.z; } else N[i * 3 + 1] = 1;
        T.roadUV(road, s, skirt ? skirt * hwe : d, hwe, uvo); UV[i * 2] = uvo[0]; UV[i * 2 + 1] = uvo[1];
        T.roadColor(road, s, skirt ? skirt * hwe : d, pp, rnz, col); C[i * 3] = col[0]; C[i * 3 + 1] = col[1]; C[i * 3 + 2] = col[2];
      }
    }
    const idx = []; gridIdx(P, rows, cols, 0, idx);
    return mkGeo(P, N, UV, C, idx);
  }
  function terrGeo(road, sA, sB, rowStep, offsAll, lo, hi) {
    const offs = offsAll.slice(lo, hi), rowsT = Math.ceil((sB - sA) / rowStep - 1e-6) + 1, S = offs.length, per = rowsT * S, n = per * 2;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = new Float32Array(n * 2), C = new Float32Array(n * 3), idx = [];
    for (let side = 0; side < 2; side++) {
      const sg = side === 0 ? -1 : 1, base = side * per;
      for (let r = 0; r < rowsT; r++) {
        const s = sA + ((sB - sA) * r) / (rowsT - 1); road.atS(s, pp);
        const hwe = pp.hw + SHOULDER_IN;
        for (let j = 0; j < S; j++) {
          const d = sg * (hwe + offs[j]), x = pp.px + pp.rhx * d, z = pp.pz + pp.rhz * d, i = base + r * S + j;
          P[i * 3] = x; P[i * 3 + 1] = terrain.heightAt(x, z); P[i * 3 + 2] = z;
          const nrm = terrain.normalAt(x, z, 0.8 + offs[j] * 0.04); N[i * 3] = nrm.x; N[i * 3 + 1] = nrm.y; N[i * 3 + 2] = nrm.z;
          UV[i * 2] = x / (T.terrUV || 6); UV[i * 2 + 1] = z / (T.terrUV || 6);
          T.terrColor(x, z, offs[j], s, d, cnz, rnz, col); C[i * 3] = col[0]; C[i * 3 + 1] = col[1]; C[i * 3 + 2] = col[2];
        }
      }
      for (let r = 0; r < rowsT - 1; r++) for (let j = 0; j < S - 1; j++) { const a = base + r * S + j, b = a + 1, d2 = a + S, e = d2 + 1; emitTri(idx, P, a, b, d2); emitTri(idx, P, b, e, d2); }
    }
    return mkGeo(P, N, UV, C, idx);
  }

  const centerOf = (road, s) => { const o = road.atS(s, {}); return new THREE.Vector3(o.px, o.py, o.pz); };
  // ---- main road chunks (road strip) ----
  const main = net.main, lo = main.closed ? 0 : -main.pre, hi = main.closed ? main.length : main.length + main.post;
  const nCh = Math.ceil((hi - lo) / T.chunk);
  for (let c = 0; c < nCh; c++) {
    const sA = lo + c * T.chunk, sB = Math.min(hi, sA + T.chunk);
    const hwA = main.atS((sA + sB) / 2, {}).hw, cols = Math.max(9, 2 * Math.round((hwA + SHOULDER_IN) / T.colSpacing / 2) + 1);
    const road = new THREE.Mesh(roadGeo(main, sA, sB, T.rowStep, cols, true), roadMat); road.receiveShadow = true; road.name = 'road_' + c; parent.add(road);
    chunks.push({ meshes: [road], center: centerOf(main, (sA + sB) / 2), radius: 60, kind: 'ground' });
  }
  // ---- near-field terrain ribbons that follow heightAt exactly (single-road tracks; tiles are sunk under them) ----
  if (T.ribbonEnd) {
    const offs = [0, 0.5, 1, 1.5, 2.2, 3, 4, 5.5, 7.5, 10, 14, 19, 26, 35].filter((o) => o <= T.ribbonEnd);
    for (let c = 0; c < nCh; c++) {
      const sA = lo + c * T.chunk, sB = Math.min(hi, sA + T.chunk);
      const m = new THREE.Mesh(terrGeo(main, sA, sB, T.terrRow, offs, 0, offs.length), grassMat); m.receiveShadow = true; m.name = 'ribbon_' + c; parent.add(m);
      chunks.push({ meshes: [m], center: centerOf(main, (sA + sB) / 2), radius: T.chunk / 2 + 45, kind: 'ground' });
    }
  }
  // ---- world-aligned terrain tiles (192 m, 6 m cells), sunk under the roads ----
  {
    const TS = T.tile || 192, CELL = T.cell || 6, NC = Math.round(TS / CELL), NV = NC + 1;
    const { minX, maxX, minZ, maxZ } = net.bounds, reach = 300;
    const tx0 = Math.floor((minX - reach) / TS), tx1 = Math.floor((maxX + reach) / TS), tz0 = Math.floor((minZ - reach) / TS), tz1 = Math.floor((maxZ + reach) / TS);
    const q = {}, pq = {};
    const innerReach = T.innerReach || 7;
    for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
      const cx = (tx + 0.5) * TS, cz = (tz + 0.5) * TS;
      if (terrain.gridBil(terrain.D, cx, cz) > reach + TS * 0.7) continue;
      const P = new Float32Array(NV * NV * 3), Nn = new Float32Array(NV * NV * 3), UV = new Float32Array(NV * NV * 2), C = new Float32Array(NV * NV * 3), OFF = new Float32Array(NV * NV);
      let any = false;
      for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
        const x = tx * TS + i * CELL, z = tz * TS + j * CELL, k = j * NV + i;
        net.project2(x, z, q); q.road.params(q.idx, pq);
        const off = Math.max(0, Math.abs(q.d) - pq.hw); OFF[k] = off;
        const sink = (T.tileSink ?? 0.45) * (1 - smoothstep(1.0, 4.5, off));
        let hy = terrain.heightAt(x, z) - sink;
        if (T.ribbonEnd) { const e0 = SHOULDER_IN + T.ribbonEnd, w = smoothstep(e0 - 9, e0 - 1, off); hy = (Math.min(terrain.heightAt(x, z), pq.py) - 2.4) * (1 - w) + (terrain.heightAt(x, z) - 0.05) * w; }
        if (T.tileNear) { const w = smoothstep(T.tileNear.reach - 3, T.tileNear.reach, off); hy = (pq.py - T.tileNear.drop) * (1 - w) + (terrain.heightAt(x, z) - sink) * w; }
        P[k * 3] = x; P[k * 3 + 1] = hy; P[k * 3 + 2] = z;
        const nrm = terrain.normalAt(x, z, 2.2); Nn[k * 3] = nrm.x; Nn[k * 3 + 1] = nrm.y; Nn[k * 3 + 2] = nrm.z;
        UV[k * 2] = x / (T.terrUV || 6); UV[k * 2 + 1] = z / (T.terrUV || 6);
        T.terrColor(x, z, off, q.s, q.d, cnz, rnz, col); C[k * 3] = col[0]; C[k * 3 + 1] = col[1]; C[k * 3 + 2] = col[2];
        if (q.dist < reach + 20) any = true;
      }
      if (!any) continue;
      const idxIn = [], idxOut = [];
      for (let j = 0; j < NC; j++) for (let i = 0; i < NC; i++) {
        const a = j * NV + i, b = a + 1, d = a + NV, e = d + 1;
        const inner = innerMat && Math.min(OFF[a], OFF[b], OFF[d], OFF[e]) < innerReach;
        const L = inner ? idxIn : idxOut;
        emitTri(L, P, a, b, d); emitTri(L, P, b, e, d);
      }
      const meshes = [];
      const mk = (idx, mat, nm) => {
        if (!idx.length) return;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
        g.setIndex(idx); g.computeBoundingSphere();
        const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.name = nm + '_' + tx + '_' + tz; parent.add(m); meshes.push(m);
      };
      mk(idxOut, grassMat, 'tile'); mk(idxIn, innerMat, 'tile_in');
      chunks.push({ meshes, center: new THREE.Vector3(cx, terrain.gridBil(terrain.H, cx, cz), cz), radius: TS * (T.tileRadius || 0.72), kind: 'ground' });
    }
  }
  // ---- branch roads ----
  for (const b of net.branches) {
    const rd = b.road, nb = Math.max(1, Math.round(rd.length / 110));
    for (let c = 0; c < nb; c++) {
      const sA = (rd.length * c) / nb, sB = (rd.length * (c + 1)) / nb;
      const hwA = rd.atS((sA + sB) / 2, {}).hw, cols = Math.max(7, 2 * Math.round((hwA + SHOULDER_IN) / T.colSpacing / 2) + 1);
      const m = new THREE.Mesh(roadGeo(rd, sA, sB, T.rowStep, cols, true), roadMat); m.receiveShadow = true; m.name = 'branch_' + b.splitId + '_' + b.pathIndex + '_' + c; m.renderOrder = 1; parent.add(m);
      chunks.push({ meshes: [m], center: centerOf(rd, (sA + sB) / 2), radius: 60, kind: 'ground' });
    }
  }
  // ---- far-field cap (coarse, sunk under the ribbons) ----
  {
    const { GX, GZ, G, gx0, gz0 } = terrain.grid, st = 8;
    const nx = Math.floor((GX - 1) / st) + 1, nz2 = Math.floor((GZ - 1) / st) + 1;
    const P = new Float32Array(nx * nz2 * 3), UV = new Float32Array(nx * nz2 * 2), C = new Float32Array(nx * nz2 * 3);
    for (let j = 0; j < nz2; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = gx0 + i * st * G, z = gz0 + j * st * G;
      P[k * 3] = x; P[k * 3 + 1] = terrain.H[j * st * GX + i * st] - 1.6; P[k * 3 + 2] = z; UV[k * 2] = x / 6; UV[k * 2 + 1] = z / 6;
      T.terrColor(x, z, 80, 0, 0, cnz, rnz, col); C[k * 3] = col[0]; C[k * 3 + 1] = col[1]; C[k * 3 + 2] = col[2];
    }
    const idx = []; gridIdx(P, nz2, nx, 0, idx);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, grassMat); m.name = 'farfield'; m.receiveShadow = true; parent.add(m);
  }
  return { chunks };
}
