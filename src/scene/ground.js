// Road + terrain ribbon chunks (100 m), hazard decals, start ramp and finish structures.
import * as THREE from 'three';
import { Noise, clamp, smoothstep, lerp, mulberry32 } from './util.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SHOULDER_IN, RAMP } from './terrain.js';
import { Batch, boxG, cylG, sphG, xf } from './batch.js';
import { bannerTexture, textureOf } from './materials.js';

const CHUNK = 100, ROW = 2, COLS = 26;
const OFFS = [0, 0.7, 1.4, 2.1, 2.8, 3.5, 4.4, 5.6, 7, 9, 12, 16, 22, 31, 44, 64, 92, 130, 185, 250];
const TROW = 4;

export function terrainColor(nz, x, z, out) {
  const n1 = nz.n2(x / 80 + 3, z / 80), n2 = nz.n2(x / 17 + 7, z / 17), n3 = nz.n2(x / 41 - 5, z / 41 + 2);
  const t = smoothstep(-0.25, 0.6, n1);
  let r = lerp(0.82, 1.12, t), g = lerp(1.0, 1.02, t), b = lerp(0.7, 0.62, t);
  const k = 0.9 + 0.12 * n2;
  const e = smoothstep(0.5, 0.8, n3);
  r = lerp(r, 1.0, e); g = lerp(g, 0.82, e); b = lerp(b, 0.66, e);
  out[0] = r * k; out[1] = g * k; out[2] = b * k;
  return out;
}

function emitTri(idx, P, a, b, c) {
  const ny = (P[b * 3 + 2] - P[a * 3 + 2]) * (P[c * 3] - P[a * 3]) - (P[b * 3] - P[a * 3]) * (P[c * 3 + 2] - P[a * 3 + 2]);
  if (ny >= 0) idx.push(a, b, c); else idx.push(a, c, b);
}
function gridIndices(P, rows, cols, base, idx) {
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const a = base + r * cols + c, b = a + 1, d = a + cols, e = d + 1;
    emitTri(idx, P, a, b, d); emitTri(idx, P, b, e, d);
  }
}

const OFFS1 = [0, 2.8, 5.6, 9, 16, 31, 64, 130, 250];
const LOD1_SINK = 0.12;

export function buildGround({ track, terrain, field, lib, parent, L, seed }) {
  const cnz = new Noise(seed * 5 + 1), rnz = new Noise(seed * 17 + 2);
  const roadMat = lib.get('dirtRoad', { vertexColors: true });
  const grassMat = lib.get('grass', { vertexColors: true });
  const pp = {}, col = [0, 0, 0];
  const chunks = [];
  const nChunks = Math.ceil(L / CHUNK);

  const mkGeo = (P, N, UV, C, idx) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    geo.setIndex(idx); geo.computeBoundingSphere();
    return geo;
  };
  /** road strip geometry between sA..sB */
  function roadGeo(sA, sB, rowStep, cols, detail, sink) {
    const rows = Math.round((sB - sA) / rowStep) + 1, n = rows * cols;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = new Float32Array(n * 2), C = new Float32Array(n * 3);
    for (let r = 0; r < rows; r++) {
      const s = sA + r * rowStep;
      track.atS(s, pp);
      const hwe = pp.hw + SHOULDER_IN;
      for (let k = 0; k < cols; k++) {
        const u = (k / (cols - 1)) * 2 - 1, d = u * hwe;
        const x = pp.px + pp.rhx * d, z = pp.pz + pp.rhz * d, i = r * cols + k;
        P[i * 3] = x; P[i * 3 + 1] = terrain.heightAt(x, z) - sink; P[i * 3 + 2] = z;
        if (detail) { const nrm = terrain.normalAt(x, z, 0.3); N[i * 3] = nrm.x; N[i * 3 + 1] = nrm.y; N[i * 3 + 2] = nrm.z; } else { N[i * 3 + 1] = 1; }
        UV[i * 2] = d / 3.2; UV[i * 2 + 1] = s / 3.2;
        const ad = Math.abs(d);
        const edge = smoothstep(pp.hw - 0.4, pp.hw + 1.4, ad);
        const rut = Math.exp(-(((ad - 0.95) / 0.32) ** 2)) * 0.16;
        const nzv = 0.92 + 0.14 * (rnz.n2(s * 0.8, d * 1.1) * 0.5 + 0.5) + (rnz.n2(s * 0.12, d * 0.3) * 0.06);
        const grassy = 0.5 * (rnz.n2(s * 0.3 + 5, d * 0.5) * 0.5 + 0.5);
        const centerWear = 1.0 + 0.06 * (1 - smoothstep(0, 1.2, ad));
        const wetv = detail ? field.wet(s, d) : 0;
        const base = nzv * (1 - rut) * centerWear * (1 - 0.62 * wetv);
        C[i * 3] = lerp(base, 0.70 * base, edge * (0.6 + grassy)); C[i * 3 + 1] = lerp(base, 0.86 * base, edge * (0.6 + grassy)); C[i * 3 + 2] = lerp(base, 0.52 * base, edge * (0.6 + grassy));
      }
    }
    const idx = []; gridIndices(P, rows, cols, 0, idx);
    return mkGeo(P, N, UV, C, idx);
  }
  /** both-sides terrain ribbon geometry */
  function terrGeo(sA, sB, rowStep, offs, detail, sink) {
    const rowsT = Math.floor((sB - sA) / rowStep) + 1, S = offs.length, per = rowsT * S, n = per * 2;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = new Float32Array(n * 2), C = new Float32Array(n * 3);
    const idx = [];
    for (let side = 0; side < 2; side++) {
      const sg = side === 0 ? -1 : 1, base = side * per;
      for (let r = 0; r < rowsT; r++) {
        const s = sA + r * rowStep;
        track.atS(s, pp);
        const hwe = pp.hw + SHOULDER_IN;
        for (let j = 0; j < S; j++) {
          const d = sg * (hwe + offs[j]);
          const x = pp.px + pp.rhx * d, z = pp.pz + pp.rhz * d, i = base + r * S + j;
          P[i * 3] = x; P[i * 3 + 1] = terrain.heightAt(x, z) - sink; P[i * 3 + 2] = z;
          const nrm = detail ? terrain.normalAt(x, z, 0.8 + offs[j] * 0.04) : terrain.normalAt(x, z, 3 + offs[j] * 0.05);
          N[i * 3] = nrm.x; N[i * 3 + 1] = nrm.y; N[i * 3 + 2] = nrm.z;
          UV[i * 2] = x / 6; UV[i * 2 + 1] = z / 6;
          terrainColor(cnz, x, z, col);
          const f = 1 - smoothstep(0, 5, offs[j]);
          let cr = lerp(col[0], 0.78, f * 0.7), cg = lerp(col[1], 0.92, f * 0.7), cb = lerp(col[2], 0.62, f * 0.7);
          const bare = smoothstep(0.1, 0.5, rnz.n1(s / 11 + sg * 7)) * (1 - smoothstep(1.5, 4.6, offs[j]));
          cr = lerp(cr, 1.0, bare * 0.8); cg = lerp(cg, 0.72, bare * 0.8); cb = lerp(cb, 0.52, bare * 0.8);
          const wv = detail ? field.wet(s, d) * (1 - smoothstep(0, 9, offs[j])) : 0;
          const wk = 1 - 0.5 * wv;
          C[i * 3] = cr * wk; C[i * 3 + 1] = cg * wk; C[i * 3 + 2] = cb * wk * 0.95;
        }
      }
      for (let r = 0; r < rowsT - 1; r++) for (let j = 0; j < S - 1; j++) {
        const a = base + r * S + j, b = a + 1, d2 = a + S, e = d2 + 1;
        emitTri(idx, P, a, b, d2); emitTri(idx, P, b, e, d2);
      }
    }
    return mkGeo(P, N, UV, C, idx);
  }

  const far = new Map(); // super-chunk (4 chunks) -> { road: [], terr: [] }
  for (let c = 0; c < nChunks; c++) {
    const sA = c === 0 ? -20 : c * CHUNK;
    const sB = c === nChunks - 1 ? 3280 : (c + 1) * CHUNK;
    const road = new THREE.Mesh(roadGeo(sA, sB, ROW, COLS, true, 0), roadMat); road.receiveShadow = true; road.name = 'road_' + c;
    const terr = new THREE.Mesh(terrGeo(sA, sB, TROW, OFFS, true, 0), grassMat); terr.receiveShadow = true; terr.name = 'terrain_' + c;
    parent.add(road); parent.add(terr);
    const mid = track.atS((sA + sB) / 2, {});
    chunks.push({ lod0: [road, terr], center: new THREE.Vector3(mid.px, mid.py, mid.pz), radius: 62, kind: 'ground', c, sup: c >> 2 });
    // coarse LOD, merged per 400 m super-chunk
    const sup = c >> 2;
    if (!far.has(sup)) far.set(sup, { road: [], terr: [], pts: [] });
    const f = far.get(sup);
    const sB1 = sA + Math.ceil((sB - sA) / 10) * 10;
    f.road.push(roadGeo(sA, sB1, 10, 9, false, LOD1_SINK)); f.terr.push(terrGeo(sA, sB1, 10, OFFS1, false, LOD1_SINK)); f.pts.push(new THREE.Vector3(mid.px, mid.py, mid.pz));
  }
  const farItems = [];
  for (const [sup, f] of far) {
    const r = new THREE.Mesh(mergeGeometries(f.road, false), roadMat), t = new THREE.Mesh(mergeGeometries(f.terr, false), grassMat);
    r.receiveShadow = t.receiveShadow = false; r.name = 'road_far_' + sup; t.name = 'terrain_far_' + sup;
    parent.add(r); parent.add(t);
    const first = chunks.find((ch) => ch.sup === sup), cs = chunks.filter((ch) => ch.sup === sup);
    farItems.push({ meshes: [r, t], sup, chunks: cs });
  }

  // ---------- hazard decals (merged per type per 400 m) ----------
  const decalKey = { puddle: 'water', rutpool: 'water', stream: 'water', mud: 'mud', gravel: 'gravel', rock: 'rock', sand: 'sand' };
  const groups = new Map();
  const q = {};
  for (const z of field.zones) {
    const gk = decalKey[z.kind] + '|' + Math.floor(z.s / 400);
    if (!groups.has(gk)) groups.set(gk, { key: decalKey[z.kind], zones: [] });
    groups.get(gk).zones.push(z);
  }
  const decals = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (const g of groups.values()) {
    const Pa = [], Na = [], UVa = [], Ca = [], Ia = [];
    const tri = (p, q2, r2) => {
      const ny = (Pa[q2 * 3 + 2] - Pa[p * 3 + 2]) * (Pa[r2 * 3] - Pa[p * 3]) - (Pa[q2 * 3] - Pa[p * 3]) * (Pa[r2 * 3 + 2] - Pa[p * 3 + 2]);
      if (ny >= 0) Ia.push(p, q2, r2); else Ia.push(p, r2, q2);
    };
    for (const z of g.zones) {
      if (z.kind === 'puddle' || z.kind === 'rutpool') {
        // irregular soft-rimmed polar puddle (same construction as graphics makePuddleGeometry), draped flat at the water level
        const rings = 5, seg = z.kind === 'rutpool' ? 28 : 36, base = Pa.length / 3;
        const rx = z.a * 1.08, rz = z.kind === 'rutpool' ? z.b * 1.35 : z.b * 1.12;
        const ph = [z.seed * 1.7, z.seed * 3.1, z.seed * 5.3];
        const outline = (an) => 1 + 0.16 * Math.sin(an * 2 + ph[0]) + 0.09 * Math.sin(an * 3 + ph[1]) + 0.05 * Math.sin(an * 5 + ph[2]);
        track.atS(z.s, pp);
        const cx = pp.px + pp.rhx * z.lateral, cz = pp.pz + pp.rhz * z.lateral;
        const Tx = pp.rhz, Tz = -pp.rhx;
        const level = terrain.heightAt(cx, cz) + z.dip + 0.028;
        for (let k = 0; k <= rings; k++) for (let j = 0; j < (k ? seg : 1); j++) {
          const an = k ? (j / seg) * Math.PI * 2 : 0, rr = (k / rings) * (k ? outline(an) : 0);
          const lx = Math.cos(an) * rr * rx, lz = Math.sin(an) * rr * rz;
          Pa.push(cx + Tx * lx + pp.rhx * lz, level, cz + Tz * lx + pp.rhz * lz);
          Na.push(0, 1, 0); UVa.push(lx, lz);
          const t = k / rings, alpha = t < 0.6 ? 1 : 1 - ((t - 0.6) / 0.4) ** 1.2, dk = 0.55 + 0.45 * t;
          Ca.push(dk, dk, dk, Math.max(0, alpha));
        }
        const rs = (k) => (k === 0 ? 0 : 1 + (k - 1) * seg);
        for (let j = 0; j < seg; j++) tri(base, base + rs(1) + ((j + 1) % seg), base + rs(1) + j);
        for (let k = 1; k < rings; k++) for (let j = 0; j < seg; j++) {
          const a0 = base + rs(k) + j, b0 = base + rs(k) + ((j + 1) % seg), c0 = base + rs(k + 1) + j, d0 = base + rs(k + 1) + ((j + 1) % seg);
          tri(a0, b0, c0); tri(b0, d0, c0);
        }
        continue;
      }
      const ext = z.a * 1.15 + Math.abs(z.skew) * z.b + 0.6;
      const s0 = z.s - ext, s1 = z.s + ext;
      const nS = Math.max(2, Math.ceil((s1 - s0) / 0.9)) + 1;
      track.atS(z.s, pp);
      const hwe = pp.hw + SHOULDER_IN;
      const wide = z.kind === 'stream';
      const d0 = wide ? z.lateral - z.b * 0.95 : Math.max(z.lateral - z.b * 1.25, -hwe), d1 = wide ? z.lateral + z.b * 0.95 : Math.min(z.lateral + z.b * 1.25, hwe);
      const nD = Math.max(2, Math.ceil((d1 - d0) / 0.65)) + 1;
      const base = Pa.length / 3;
      for (let i = 0; i < nS; i++) {
        const s = s0 + (s1 - s0) * (i / (nS - 1));
        track.atS(s, pp);
        for (let j = 0; j < nD; j++) {
          const d = d0 + (d1 - d0) * (j / (nD - 1));
          const w = field.weight(z, s, d);
          const x = pp.px + pp.rhx * d, zz = pp.pz + pp.rhz * d;
          const h = terrain.heightAt(x, zz);
          const lift = z.kind === 'stream' ? 0.022 + z.dip * 0.55 * w : z.kind === 'mud' ? 0.018 + z.dip * 0.35 * w : 0.012 + z.bumpAmp * 0.4 * w;
          Pa.push(x, h + lift, zz);
          const nrm = terrain.normalAt(x, zz, 0.4);
          if (g.key === 'water') nrm.lerp(up, 0.85).normalize();
          Na.push(nrm.x, nrm.y, nrm.z);
          UVa.push(d / 2.4 + z.seed * 0.1, s / 2.4);
          let a = smoothstep(0.02, 0.45, w);
          if (z.bridge) a *= 1 - (1 - smoothstep(z.hw - 0.7, z.hw - 0.2, Math.abs(d)));
          const tint = g.key === 'rock' ? 0.8 : 1;
          Ca.push(tint, tint, tint, a);
        }
      }
      for (let i = 0; i < nS - 1; i++) for (let j = 0; j < nD - 1; j++) {
        const a = base + i * nD + j, b = a + 1, d = a + nD, e = d + 1;
        tri(a, b, d); tri(b, e, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(Pa, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(Na, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(UVa, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(Ca, 4));
    geo.setIndex(Ia); geo.computeBoundingSphere();
    const mat = g.key === 'water' ? lib.get('waterPuddle', { vertexColors: true, transparent: true, polygonOffset: -2, direct: true }) : lib.get(g.key, { vertexColors: true, transparent: true, polygonOffset: -2 });
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 2; mesh.receiveShadow = true; mesh.name = 'decal_' + g.key;
    parent.add(mesh);
    const bs = geo.boundingSphere;
    decals.push({ mesh, center: bs.center.clone(), radius: bs.radius, kind: 'decal' });
  }

  // ---------- rain-only puddles (hidden unless it is wet): extra pooled water in ruts and low spots ----------
  const rainItems = [];
  {
    const rr = mulberry32(seed * 313 + 5);
    const per = new Map();
    for (let sp = 40; sp < L - 20; sp += 22 + rr() * 26) {
      track.atS(sp, pp);
      const hw = pp.hw, rut = rr() < 0.6;
      const lat = rut ? (rr() < 0.5 ? -1 : 1) * (0.9 + 0.15 * rr()) : (rr() - 0.5) * 2 * (hw - 1.2);
      const a = rut ? 2 + rr() * 4 : 1.2 + rr() * 1.8, b = rut ? 0.35 + rr() * 0.25 : 0.8 + rr() * 0.9;
      const key = Math.floor(sp / 400);
      if (!per.has(key)) per.set(key, { Pa: [], Na: [], UVa: [], Ca: [], Ia: [] });
      const g = per.get(key), Pa = g.Pa, base = Pa.length / 3, rings = 4, seg = 20;
      const cx = pp.px + pp.rhx * lat, cz = pp.pz + pp.rhz * lat, Tx = pp.rhz, Tz = -pp.rhx;
      let level = -1e9;
      for (const [ox, oz] of [[0, 0], [a, 0], [-a, 0], [0, b], [0, -b]]) level = Math.max(level, terrain.heightAt(cx + Tx * ox + pp.rhx * oz, cz + Tz * ox + pp.rhz * oz));
      level += 0.02;
      const ph = rr() * 6;
      for (let k = 0; k <= rings; k++) for (let j = 0; j < (k ? seg : 1); j++) {
        const an = k ? (j / seg) * Math.PI * 2 : 0, o2 = 1 + 0.16 * Math.sin(an * 2 + ph) + 0.09 * Math.sin(an * 3 + ph * 2), r2 = (k / rings) * (k ? o2 : 0);
        const lx = Math.cos(an) * r2 * a, lz = Math.sin(an) * r2 * b;
        Pa.push(cx + Tx * lx + pp.rhx * lz, level, cz + Tz * lx + pp.rhz * lz); g.Na.push(0, 1, 0); g.UVa.push(lx, lz);
        const t = k / rings, al = t < 0.55 ? 1 : 1 - ((t - 0.55) / 0.45) ** 1.2, dk = 0.55 + 0.45 * t;
        g.Ca.push(dk, dk, dk, Math.max(0, al));
      }
      const rs = (k) => (k === 0 ? 0 : 1 + (k - 1) * seg);
      const tri = (p0, q2, r3) => { const ny = (Pa[q2 * 3 + 2] - Pa[p0 * 3 + 2]) * (Pa[r3 * 3] - Pa[p0 * 3]) - (Pa[q2 * 3] - Pa[p0 * 3]) * (Pa[r3 * 3 + 2] - Pa[p0 * 3 + 2]); if (ny >= 0) g.Ia.push(p0, q2, r3); else g.Ia.push(p0, r3, q2); };
      for (let j = 0; j < seg; j++) tri(base, base + rs(1) + ((j + 1) % seg), base + rs(1) + j);
      for (let k = 1; k < rings; k++) for (let j = 0; j < seg; j++) { const a0 = base + rs(k) + j, b0 = base + rs(k) + ((j + 1) % seg), c0 = base + rs(k + 1) + j, d0 = base + rs(k + 1) + ((j + 1) % seg); tri(a0, b0, c0); tri(b0, d0, c0); }
    }
    const wmat = lib.get('waterPuddle', { vertexColors: true, transparent: true, polygonOffset: -2, direct: true });
    for (const g of per.values()) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.Pa, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.Na, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.UVa, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(g.Ca, 4));
      geo.setIndex(g.Ia); geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, wmat); mesh.renderOrder = 2; mesh.visible = false; mesh.name = 'rain_puddles'; mesh.receiveShadow = true;
      parent.add(mesh);
      rainItems.push({ mesh, center: geo.boundingSphere.center.clone(), radius: geo.boundingSphere.radius });
    }
  }

  // ---------- far-field cap (24 m cells, sunk 1.6 m under the ribbons) ----------
  {
    const { GX, GZ, G, gx0, gz0 } = terrain.grid, st = 8;
    const nx = Math.floor((GX - 1) / st) + 1, nz2 = Math.floor((GZ - 1) / st) + 1;
    const P = new Float32Array(nx * nz2 * 3), UV = new Float32Array(nx * nz2 * 2), C = new Float32Array(nx * nz2 * 3);
    for (let j = 0; j < nz2; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = gx0 + i * st * G, z = gz0 + j * st * G;
      P[k * 3] = x; P[k * 3 + 1] = terrain.H[j * st * GX + i * st] - 1.6; P[k * 3 + 2] = z;
      UV[k * 2] = x / 6; UV[k * 2 + 1] = z / 6;
      terrainColor(cnz, x, z, col); C[k * 3] = col[0]; C[k * 3 + 1] = col[1]; C[k * 3 + 2] = col[2];
    }
    const idx = []; gridIndices(P, nz2, nx, 0, idx);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, grassMat); m.receiveShadow = true; m.name = 'farfield';
    parent.add(m);
  }

  const landmarks = buildLandmarks({ track, terrain, field, lib, parent, L });
  return { chunks, farItems, decals, rainItems, landmarks, items: landmarks.items, update: landmarks.update };
}

// ======================================================================================
const SKIN = [[1.0, 0.8, 0.65], [0.85, 0.62, 0.48], [0.62, 0.43, 0.32], [0.45, 0.3, 0.22], [0.95, 0.74, 0.6]];
const SHIRT = [[0.7, 0.2, 0.15], [0.2, 0.35, 0.6], [0.85, 0.8, 0.6], [0.25, 0.45, 0.25], [0.85, 0.6, 0.2], [0.55, 0.5, 0.7], [0.9, 0.9, 0.88], [0.75, 0.35, 0.45]];
const PANTS = [[0.15, 0.17, 0.3], [0.28, 0.22, 0.15], [0.2, 0.2, 0.2], [0.35, 0.4, 0.5]];
const FLAGC = [[0.85, 0.2, 0.15], [0.95, 0.9, 0.75], [0.2, 0.4, 0.7], [0.95, 0.75, 0.2], [0.3, 0.6, 0.3]];

function figure(b, rnd, x, y, z, yaw, sc, cheer) {
  const shirt = SHIRT[Math.floor(rnd() * SHIRT.length)], skin = SKIN[Math.floor(rnd() * SKIN.length)], pants = PANTS[Math.floor(rnd() * PANTS.length)];
  b.add('dark', cylG(0.15, 0.15, 0.55, 5, 1), xf(x, y + 0.27 * sc, z, 0, yaw, 0, sc), pants);
  b.add('dark', cylG(0.2, 0.24, 0.62, 6, 1), xf(x, y + 0.85 * sc, z, 0, yaw, 0, sc), shirt);
  b.add('dark', sphG(0.13, 5, 3, 1), xf(x, y + 1.37 * sc, z, 0, yaw, 0, sc), skin);
  const hat = rnd();
  if (hat < 0.4) { b.add('dark', cylG(0.2, 0.2, 0.03, 8, 1), xf(x, y + 1.5 * sc, z, 0, yaw, 0, sc), [0.55, 0.45, 0.28]); b.add('dark', cylG(0.11, 0.12, 0.1, 6, 1), xf(x, y + 1.56 * sc, z, 0, yaw, 0, sc), [0.5, 0.4, 0.25]); }
  const ca = Math.cos(yaw), sa = Math.sin(yaw);
  for (const sg of [-1, 1]) {
    const up = cheer && rnd() < 0.6;
    const ox = x + ca * sg * 0.26 * sc, oz = z - sa * sg * 0.26 * sc;
    b.add('dark', boxG(0.07, 0.5 * sc, 0.07, 1), xf(ox, y + (up ? 1.35 : 0.85) * sc, oz, 0, yaw, up ? sg * 0.45 : sg * 0.08, sc), up ? skin : shirt);
  }
}
function buntingMesh(lines, lib) {
  // lines: [{a:[x,y,z], b:[x,y,z], sag}] -> triangular pennants
  const P = [], C = [], N = [];
  let ci = 0;
  for (const ln of lines) {
    const len = Math.hypot(ln.b[0] - ln.a[0], ln.b[2] - ln.a[2]), n = Math.max(3, Math.round(len / 0.55));
    const pt = (t) => [ln.a[0] + (ln.b[0] - ln.a[0]) * t, ln.a[1] + (ln.b[1] - ln.a[1]) * t - ln.sag * 4 * t * (1 - t), ln.a[2] + (ln.b[2] - ln.a[2]) * t];
    for (let i = 0; i < n; i++) {
      const p0 = pt(i / n + 0.04 / n), p1 = pt((i + 1) / n - 0.04 / n), pm = pt((i + 0.5) / n), c = FLAGC[ci++ % FLAGC.length];
      P.push(...p0, ...p1, pm[0], pm[1] - 0.42, pm[2]);
      for (let k = 0; k < 3; k++) { C.push(...c); N.push(0, 1, 0); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(P.length / 3 * 2), 2));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, lib.get('dark', { vertexColors: true, side: THREE.DoubleSide })); m.name = 'bunting'; m.castShadow = false;
  return m;
}

function buildLandmarks({ track, terrain, field, lib, parent, L }) {
  const pp = {};
  const items = [], animated = [];
  const rnd = mulberry32(4242);
  const addItem = (group, s) => { const p = track.atS(s, {}); group.name = group.name || 'landmark'; parent.add(group); const bs = new THREE.Box3().setFromObject(group).getBoundingSphere(new THREE.Sphere()); items.push({ group, center: bs.center.clone(), radius: bs.radius }); };
  const P3 = (s, d, dy = 0) => { const p = track.atS(s, {}); const x = p.px + p.rhx * d, z = p.pz + p.rhz * d; return { x, z, y: terrain.heightAt(x, z) + dy, p, ry: Math.atan2(-p.rhz, p.rhx) }; };

  // ---- ramp deck ----
  const woodDeck = lib.get('woodWeathered', { vertexColors: true, polygonOffset: -2 });
  {
    const s0 = RAMP.s0, s1 = RAMP.s1, RW = RAMP.halfWidth;
    const rows = Math.round((s1 - s0) / 1) + 1, cols = 14;
    const P = new Float32Array(rows * cols * 3), N = new Float32Array(rows * cols * 3), UV = new Float32Array(rows * cols * 2), C = new Float32Array(rows * cols * 3);
    for (let r = 0; r < rows; r++) {
      const s = s0 + r; track.atS(s, pp);
      for (let k = 0; k < cols; k++) {
        const d = (k / (cols - 1) * 2 - 1) * RW, x = pp.px + pp.rhx * d, z = pp.pz + pp.rhz * d, i = r * cols + k;
        P[i * 3] = x; P[i * 3 + 1] = terrain.heightAt(x, z) + 0.03; P[i * 3 + 2] = z;
        const nrm = terrain.normalAt(x, z, 0.4); N[i * 3] = nrm.x; N[i * 3 + 1] = nrm.y; N[i * 3 + 2] = nrm.z;
        UV[i * 2] = d / 1.5; UV[i * 2 + 1] = s / 2;
        const sh = 0.85 + 0.15 * (((Math.floor(r / 2) * 7 + k) % 5) / 4);
        C[i * 3] = sh; C[i * 3 + 1] = sh; C[i * 3 + 2] = sh;
      }
    }
    const idx = []; gridIndices(P, rows, cols, 0, idx);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    geo.setIndex(idx); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, woodDeck); m.receiveShadow = true; m.name = 'ramp_deck';
    parent.add(m);
  }

  // ================= START area =================
  {
    const b = new Batch(), grp = new THREE.Group(); grp.name = 'start_area';
    const hWood = [0.95, 0.9, 0.85];
    for (let s = RAMP.s0; s < RAMP.s1 - 1; s += 3) {
      const a = track.atS(s, {}), c2 = track.atS(s + 3, {});
      for (const sg of [-1, 1]) {
        const d = sg * (RAMP.halfWidth + 0.12);
        const x0 = a.px + a.rhx * d, z0 = a.pz + a.rhz * d, x1 = c2.px + c2.rhx * d, z1 = c2.pz + c2.rhz * d;
        const y0 = terrain.heightAt(x0, z0), y1 = terrain.heightAt(x1, z1);
        const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
        const ang = Math.atan2(x1 - x0, z1 - z0), pitch = -Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0));
        b.add('woodWeathered', boxG(0.14, 0.32, len, 2), xf((x0 + x1) / 2, (y0 + y1) / 2 + 0.18, (z0 + z1) / 2, pitch, ang, 0), hWood);
        b.add('woodWeathered', boxG(0.14, 0.9, 0.14, 2), xf(x0, y0 + 0.25, z0, 0, ang, 0), [0.7, 0.66, 0.6]);
      }
    }
    { const q = P3(RAMP.s0 + 0.5, 0); b.add('woodWeathered', boxG(RAMP.halfWidth * 2 + 0.5, 1.2, 0.2, 2), xf(q.x, q.y + 0.6, q.z, 0, q.ry, 0), [0.8, 0.75, 0.7]); }
    // gate arch
    const gateS = 17;
    {
      const a = track.atS(gateS, {}), ry = Math.atan2(-a.rhz, a.rhx);
      for (const sg of [-1, 1]) {
        const q = P3(gateS, sg * (a.hw + 0.9));
        b.add('woodWeathered', boxG(0.28, 5.6, 0.28, 2), xf(q.x, q.y + 2.7, q.z, 0, ry, 0), [0.75, 0.7, 0.62]);
        b.add('woodWeathered', boxG(0.2, 2.4, 0.16, 2), xf(q.x - a.rhx * sg * 0.35, q.y + 0.8, q.z - a.rhz * sg * 0.35, 0, ry, sg * 0.5), [0.7, 0.65, 0.6]);
      }
      const c = P3(gateS, 0);
      b.add('woodWeathered', boxG((a.hw + 0.9) * 2 + 0.6, 0.3, 0.3, 2), xf(c.x, c.y + 5.4, c.z, 0, ry, 0), [0.85, 0.8, 0.72]);
      const bm = new THREE.Mesh(new THREE.PlaneGeometry((a.hw + 0.9) * 2, 1.1), new THREE.MeshStandardMaterial({ map: bannerTexture('SOAP BOX DERBY'), roughness: 0.9, side: THREE.DoubleSide }));
      bm.position.set(c.x, c.y + 4.75, c.z); bm.rotation.y = ry; bm.castShadow = true; bm.name = 'start_banner';
      grp.add(bm);
    }
    // spectator hay-bale chicane + crowd behind the bales
    for (let s = 24, i = 0; s < 58; s += 6.5, i++) {
      for (const sg of [-1, 1]) {
        const inner = ((i + (sg > 0 ? 1 : 0)) % 2) ? 1.6 : 2.7;
        const q = P3(s, sg * (track.atS(s, pp).hw + inner));
        const yaw = q.ry + Math.PI / 2 + rnd() * 0.3;
        b.add('straw', cylG(0.62, 0.62, 1.2, 8), xf(q.x, q.y + 0.6, q.z, Math.PI / 2, yaw, 0), [1, 0.95, 0.85]);
        b.add('straw', cylG(0.62, 0.62, 1.2, 8), xf(q.x, q.y + 1.5, q.z, Math.PI / 2, yaw + 0.2, 0), [0.95, 0.9, 0.8]);
        if (rnd() < 0.85) { const w = P3(s + rnd() * 3 - 1.5, sg * (track.atS(s, pp).hw + inner + 1.4 + rnd() * 1.8)); figure(b, rnd, w.x, w.y, w.z, w.ry + sg * Math.PI / 2 + (rnd() - 0.5) * 0.8, 0.75 + rnd() * 0.3, true); }
      }
    }

    // bunting: poles + pennant strings
    const lines = [];
    for (const sg of [-1, 1]) {
      let prev = null;
      for (let s = -6; s <= 62; s += 17) {
        const hw = track.atS(s, pp).hw, q = P3(s, sg * (hw + 3.3));
        b.add('woodWeathered', cylG(0.07, 0.1, 6.4, 5, 2), xf(q.x, q.y + 3.1, q.z), [0.7, 0.62, 0.55]);
        const top = [q.x, q.y + 6.2, q.z];
        if (prev) lines.push({ a: prev, b: top, sag: 0.7 });
        prev = top;
      }
    }
    for (const s of [-6, 28, 62]) { const hw = track.atS(s, pp).hw, l = P3(s, -(hw + 3.3)), r = P3(s, hw + 3.3); lines.push({ a: [l.x, l.y + 6.2, l.z], b: [r.x, r.y + 6.2, r.z], sag: 1.0 }); }
    grp.add(b.build(lib, { shadow: false })); grp.add(buntingMesh(lines, lib));
    addItem(grp, 40);
  }

  // ================= bridges + ford stones =================
  {
    const b = new Batch(), grp = new THREE.Group(); grp.name = 'crossings';
    const stones = [];
    for (const z of field.zones) {
      if (z.kind !== 'stream') continue;
      if (z.bridge) {
        const n = Math.floor(2 * z.a * 0.9 / 0.3);
        for (let i = 0; i < n; i++) {
          const s = z.s - z.a * 0.9 + (i + 0.5) * 0.3;
          const q = P3(s, 0);
          const T = track.sampleAt(s).tangent;
          b.add('woodWeathered', boxG((z.hw - 0.35) * 2, 0.05, 0.25, 1.2), xf(q.x, q.y - 0.02, q.z, -Math.asin(clamp(T.y, -1, 1)), q.ry, 0), [0.6 + rnd() * 0.4, 0.55 + rnd() * 0.35, 0.5 + rnd() * 0.3]);
        }
        for (const sg of [-1, 1]) {
          const d = sg * (z.hw - 0.12), s0 = z.s - z.a * 0.95, s1 = z.s + z.a * 0.95;
          const A = P3(s0, d), B = P3(s1, d);
          const len = Math.hypot(B.x - A.x, B.z - A.z), mid = [(A.x + B.x) / 2, (A.z + B.z) / 2], ang = Math.atan2(B.x - A.x, B.z - A.z), pit = -Math.atan2(B.y - A.y, len);
          b.add('woodWeathered', boxG(0.16, 0.22, len, 2), xf(mid[0], (A.y + B.y) / 2 - 0.05, mid[1], pit, ang, 0), [0.55, 0.5, 0.45]);
          b.add('woodWeathered', boxG(0.09, 0.09, len, 2), xf(mid[0], (A.y + B.y) / 2 + 0.95, mid[1], pit, ang, 0), [0.7, 0.62, 0.55]);
          for (let k = 0; k <= 4; k++) { const q = P3(s0 + (s1 - s0) * k / 4, d); if (rnd() < 0.85) b.add('woodWeathered', boxG(0.12, 1.0, 0.12, 2), xf(q.x, q.y + 0.4, q.z, 0, q.ry, (rnd() - 0.5) * 0.15), [0.6, 0.55, 0.5]); }
        }
      } else if (z.stones) {
        for (const st of z.stones) { const q = P3(st.s, st.d); stones.push({ x: q.x, z: q.z, y: q.y - st.h, r: st.r, h: st.h }); }
      }
    }
    if (b.parts.size) grp.add(b.build(lib, { shadow: false }));
    if (stones.length) {
      const geo = new THREE.IcosahedronGeometry(1, 1); geo.computeBoundingSphere();
      const im = new THREE.InstancedMesh(geo, lib.get('rock'), stones.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      stones.forEach((st, i) => { e.set(0, rnd() * 6, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(st.x, st.y - 0.2 * st.h + st.h * 0.0, st.z), q, new THREE.Vector3(st.r * 1.1, st.h * 1.2, st.r * 1.1)); im.setMatrixAt(i, m4); im.setColorAt(i, new THREE.Color(0.55 + rnd() * 0.2, 0.55 + rnd() * 0.18, 0.5 + rnd() * 0.18)); });
      im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true; im.name = 'ford_stones'; grp.add(im);
    }
    if (grp.children.length) { grp.updateMatrixWorld(true); parent.add(grp); items.push({ group: grp, center: new THREE.Vector3(0, 0, 0), radius: 1e9, always: true }); }
  }

  // ================= FINISH =================
  {
    const b = new Batch(), grp = new THREE.Group(); grp.name = 'finish_area';
    const a = track.atS(L, {}), ry = Math.atan2(-a.rhz, a.rhx), hw = a.hw, half = hw + 2.0;
    for (const sg of [-1, 1]) {
      const q = P3(L, sg * half);
      b.add('woodWeathered', boxG(0.5, 9.4, 0.5, 2), xf(q.x, q.y + 4.5, q.z, 0, ry, 0), [0.8, 0.74, 0.66]);
      b.add('woodWeathered', boxG(0.9, 0.5, 0.9, 2), xf(q.x, q.y + 0.2, q.z, 0, ry, 0), [0.6, 0.55, 0.5]);
      b.add('dark', cylG(0.04, 0.04, 2.2, 5, 1), xf(q.x, q.y + 10.5, q.z), [0.2, 0.2, 0.2]);
    }
    const c = P3(L, 0);
    b.add('woodWeathered', boxG(half * 2 + 1.2, 0.5, 0.5, 2), xf(c.x, c.y + 9.0, c.z, 0, ry, 0), [0.85, 0.8, 0.72]);
    b.add('checker', boxG(half * 2, 0.55, 0.12, 2.4), xf(c.x, c.y + 8.45, c.z, 0, ry, 0), [1, 1, 1]);
    b.add('checker', boxG(half * 2, 0.55, 0.12, 2.4), xf(c.x, c.y + 5.55, c.z, 0, ry, 0), [1, 1, 1]);
    const fm = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 2.5), new THREE.MeshStandardMaterial({ map: bannerTexture('FINISH', '#f3efe2', '#151515'), roughness: 0.9, side: THREE.DoubleSide }));
    fm.position.set(c.x, c.y + 7.0, c.z); fm.rotation.y = ry; fm.name = 'finish_banner'; fm.castShadow = true; grp.add(fm);
    // pennants atop posts
    const lines = [];
    for (const sg of [-1, 1]) {
      let prev = null;
      for (let s = L - 62; s <= L + 40; s += 17) {
        const h2 = track.atS(s, pp).hw, q = P3(s, sg * (h2 + 3.3));
        b.add('woodWeathered', cylG(0.07, 0.1, 6.4, 6, 2), xf(q.x, q.y + 3.1, q.z), [0.7, 0.62, 0.55]);
        const top = [q.x, q.y + 6.2, q.z];
        if (prev) lines.push({ a: prev, b: top, sag: 0.7 });
        prev = top;
      }
    }
    for (const s of [L - 51, L - 34, L - 17]) { const h2 = track.atS(s, pp).hw, l = P3(s, -(h2 + 3.3)), r = P3(s, h2 + 3.3); lines.push({ a: [l.x, l.y + 6.2, l.z], b: [r.x, r.y + 6.2, r.z], sag: 1.1 }); }
    {
      const l = P3(L, -half), r = P3(L, half);
      lines.push({ a: [l.x, l.y + 9, l.z], b: [r.x, r.y + 9, r.z], sag: 0.5 }); lines.push({ a: [l.x, l.y + 4.7, l.z], b: [r.x, r.y + 4.7, r.z], sag: 0.9 });
    }
    grp.add(buntingMesh(lines, lib));
    // hay-bale bleachers with cheering crowd on both sides, spanning before and after the line
    for (let s = L - 30; s < L + 40; s += 3.4) {
      for (const sg of [-1, 1]) {
        const inner = 2.0 + (rnd() < 0.3 ? 0.4 : 0);
        const q = P3(s, sg * (track.atS(s, pp).hw + inner));
        const yaw = q.ry + Math.PI / 2 + (rnd() - 0.5) * 0.2;
        b.add('straw', cylG(0.62, 0.62, 1.2, 8), xf(q.x, q.y + 0.6, q.z, Math.PI / 2, yaw, 0), [1, 0.95, 0.85]);
        if (rnd() < 0.6) b.add('straw', cylG(0.62, 0.62, 1.2, 8), xf(q.x, q.y + 1.75, q.z, Math.PI / 2, yaw, 0), [0.95, 0.9, 0.8]);
        for (let r = 0; r < 2; r++) {
          const w = P3(s + rnd() * 2.6 - 1.3, sg * (track.atS(s, pp).hw + inner + 1.1 + r * 1.0 + rnd() * 0.6));
          if (rnd() < 0.9) figure(b, rnd, w.x, w.y + (r ? 0.45 : 0.0), w.z, w.ry + sg * Math.PI / 2 + (rnd() - 0.5) * 0.9, 0.7 + rnd() * 0.35, true);
        }
      }
    }
    // flagman on a crate at the left of the line, waving a checkered flag
    {
      const q = P3(L - 4, -(hw + 1.6));
      b.add('woodWeathered', boxG(0.9, 0.5, 0.9, 1), xf(q.x, q.y + 0.2, q.z, 0, q.ry, 0), [0.6, 0.5, 0.4]);
      figure(b, rnd, q.x, q.y + 0.45, q.z, q.ry + Math.PI / 2 - 0.3, 1.1, false);
      const pole = new THREE.Group();
      pole.position.set(q.x + q.p.rhx * 0.45, q.y + 1.5, q.z + q.p.rhz * 0.45);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8, 5), new THREE.MeshStandardMaterial({ color: 0x6b4a2b })); stick.position.y = 0.6; pole.add(stick);
      const ft = textureOf('checker').clone(); ft.needsUpdate = true;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0, 6, 1), new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.9 }));
      flag.position.set(0.75, 1.2, 0); pole.add(flag);
      pole.rotation.y = q.ry; grp.add(pole);
      animated.push((t) => { pole.rotation.z = Math.sin(t * 5) * 0.5 - 0.3; const pos = flag.geometry.attributes.position; flag.rotation.y = Math.sin(t * 8) * 0.25; });
    }
    grp.add(b.build(lib, { shadow: false }));
    // checkered line draped on the road
    {
      const rows = 6, cols = 24, P = new Float32Array(rows * cols * 3), N = new Float32Array(rows * cols * 3), UV = new Float32Array(rows * cols * 2);
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
        const s = L - 1.2 + (r / (rows - 1)) * 2.4; const p = track.atS(s, {}); const d = (k / (cols - 1) * 2 - 1) * p.hw;
        const x = p.px + p.rhx * d, z = p.pz + p.rhz * d, i = r * cols + k;
        P[i * 3] = x; P[i * 3 + 1] = terrain.heightAt(x, z) + 0.035; P[i * 3 + 2] = z; N[i * 3 + 1] = 1;
        UV[i * 2] = (k / (cols - 1)) * (p.hw * 2 / 0.6) / 8; UV[i * 2 + 1] = (r / (rows - 1)) * 4 / 8;
      }
      const idx = []; gridIndices(P, rows, cols, 0, idx);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
      geo.setIndex(idx);
      const ft2 = textureOf('checker').clone(); ft2.needsUpdate = true;
      const lm = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: ft2, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      lm.name = 'finish_line'; lm.receiveShadow = true; grp.add(lm);
    }
    addItem(grp, L);
  }
  return { items, update(t) { for (const f of animated) f(t); } };
}
