// Road + terrain ribbon chunks (100 m), hazard decals, start ramp and finish structures.
import * as THREE from 'three';
import { Noise, clamp, smoothstep, lerp } from './util.js';
import { SHOULDER_IN, RAMP } from './terrain.js';
import { Batch, boxG, cylG, xf } from './batch.js';
import { bannerTexture, textureOf } from './materials.js';

const CHUNK = 100, ROW = 2, COLS = 26;
const OFFS = [0, 2, 5, 9, 15, 24, 38, 58, 86, 125, 180, 250];

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

export function buildGround({ track, terrain, field, lib, parent, L, seed }) {
  const cnz = new Noise(seed * 5 + 1), rnz = new Noise(seed * 17 + 2);
  const roadMat = lib.get('dirtRoad', { vertexColors: true });
  const grassMat = lib.get('grass', { vertexColors: true });
  const pp = {}, col = [0, 0, 0];
  const chunks = [];
  const nChunks = Math.ceil(L / CHUNK);

  for (let c = 0; c < nChunks; c++) {
    const sA = c === 0 ? -20 : c * CHUNK;
    const sB = c === nChunks - 1 ? Math.ceil(L / ROW) * ROW + 60 : (c + 1) * CHUNK;
    const rows = Math.round((sB - sA) / ROW) + 1;
    // ---------- road ----------
    {
      const n = rows * COLS;
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = new Float32Array(n * 2), C = new Float32Array(n * 3);
      for (let r = 0; r < rows; r++) {
        const s = sA + r * ROW;
        track.atS(s, pp);
        const hwe = pp.hw + SHOULDER_IN;
        for (let k = 0; k < COLS; k++) {
          const u = (k / (COLS - 1)) * 2 - 1, d = u * hwe;
          const x = pp.px + pp.rhx * d, z = pp.pz + pp.rhz * d, i = r * COLS + k;
          const y = terrain.heightAt(x, z);
          P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
          const nrm = terrain.normalAt(x, z, 0.3);
          N[i * 3] = nrm.x; N[i * 3 + 1] = nrm.y; N[i * 3 + 2] = nrm.z;
          UV[i * 2] = d / 3.2; UV[i * 2 + 1] = s / 3.2;
          const ad = Math.abs(d);
          const edge = smoothstep(pp.hw - 0.4, pp.hw + 1.4, ad);
          const rut = Math.exp(-(((ad - 0.95) / 0.32) ** 2)) * 0.16;
          const nzv = 0.92 + 0.14 * (rnz.n2(s * 0.8, d * 1.1) * 0.5 + 0.5) + (rnz.n2(s * 0.12, d * 0.3) * 0.06);
          const grassy = 0.5 * (rnz.n2(s * 0.3 + 5, d * 0.5) * 0.5 + 0.5);
          const centerWear = 1.0 + 0.06 * (1 - smoothstep(0, 1.2, ad));
          const base = nzv * (1 - rut) * centerWear;
          C[i * 3] = lerp(base, 0.70 * base, edge * (0.6 + grassy)); C[i * 3 + 1] = lerp(base, 0.86 * base, edge * (0.6 + grassy)); C[i * 3 + 2] = lerp(base, 0.52 * base, edge * (0.6 + grassy));
        }
      }
      const idx = []; gridIndices(P, rows, COLS, 0, idx);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
      geo.setIndex(idx); geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, roadMat); mesh.receiveShadow = true; mesh.name = 'road_' + c;
      parent.add(mesh);
      chunks.push({ mesh, kind: 'road', c });
    }
    // ---------- terrain ribbons (both sides) ----------
    {
      const S = OFFS.length, per = rows * S, n = per * 2;
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = new Float32Array(n * 2), C = new Float32Array(n * 3);
      const idx = [];
      for (let side = 0; side < 2; side++) {
        const sg = side === 0 ? -1 : 1, base = side * per;
        for (let r = 0; r < rows; r++) {
          const s = sA + r * ROW;
          track.atS(s, pp);
          const hwe = pp.hw + SHOULDER_IN;
          for (let j = 0; j < S; j++) {
            const d = sg * (hwe + OFFS[j]);
            const x = pp.px + pp.rhx * d, z = pp.pz + pp.rhz * d, i = base + r * S + j;
            const y = terrain.heightAt(x, z);
            P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
            const nrm = terrain.normalAt(x, z, 0.8 + OFFS[j] * 0.04);
            N[i * 3] = nrm.x; N[i * 3 + 1] = nrm.y; N[i * 3 + 2] = nrm.z;
            UV[i * 2] = x / 6; UV[i * 2 + 1] = z / 6;
            terrainColor(cnz, x, z, col);
            const f = 1 - smoothstep(0, 5, OFFS[j]);
            C[i * 3] = lerp(col[0], 0.78, f * 0.7); C[i * 3 + 1] = lerp(col[1], 0.92, f * 0.7); C[i * 3 + 2] = lerp(col[2], 0.62, f * 0.7);
          }
        }
        // grid is rows x S with 'cols' = S
        for (let r = 0; r < rows - 1; r++) for (let j = 0; j < S - 1; j++) {
          const a = base + r * S + j, b = a + 1, d2 = a + S, e = d2 + 1;
          emitTri(idx, P, a, b, d2); emitTri(idx, P, b, e, d2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
      geo.setIndex(idx); geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, grassMat); mesh.receiveShadow = true; mesh.name = 'terrain_' + c;
      parent.add(mesh);
      chunks.push({ mesh, kind: 'terrain', c });
    }
  }
  for (const ch of chunks) { const bs = ch.mesh.geometry.boundingSphere; ch.center = bs.center.clone(); ch.radius = bs.radius; }

  // ---------- hazard decals (merged per type per 400 m) ----------
  const decalKey = { puddle: 'water', stream: 'water', mud: 'mud', gravel: 'gravel', rock: 'rock', sand: 'sand' };
  const groups = new Map();
  const q = {};
  for (const z of field.zones) {
    const gk = decalKey[z.kind] + '|' + Math.floor(z.s / 400);
    if (!groups.has(gk)) groups.set(gk, { key: decalKey[z.kind], zones: [] });
    groups.get(gk).zones.push(z);
  }
  const decals = [];
  for (const g of groups.values()) {
    const Pa = [], Na = [], UVa = [], Ca = [], Ia = [];
    for (const z of g.zones) {
      const ext = z.a * 1.25 + Math.abs(z.skew) * z.b + 0.6;
      const s0 = z.s - ext, s1 = z.s + ext;
      const nS = Math.max(2, Math.ceil((s1 - s0) / 0.6)) + 1;
      track.atS(z.s, pp);
      const hwe = pp.hw + SHOULDER_IN;
      const d0 = Math.max(z.lateral - z.b * 1.25, -hwe), d1 = Math.min(z.lateral + z.b * 1.25, hwe);
      const nD = Math.max(2, Math.ceil((d1 - d0) / 0.45)) + 1;
      const base = Pa.length / 3;
      for (let i = 0; i < nS; i++) {
        const s = s0 + (s1 - s0) * (i / (nS - 1));
        track.atS(s, pp);
        for (let j = 0; j < nD; j++) {
          const d = d0 + (d1 - d0) * (j / (nD - 1));
          const w = field.weight(z, s, d);
          const x = pp.px + pp.rhx * d, zz = pp.pz + pp.rhz * d;
          const h = terrain.heightAt(x, zz);
          const lift = (z.kind === 'puddle' || z.kind === 'stream') ? 0.022 + z.dip * 0.55 * w : z.kind === 'mud' ? 0.018 + z.dip * 0.35 * w : 0.012 + z.bumpAmp * 0.4 * w;
          Pa.push(x, h + lift, zz);
          const nrm = terrain.normalAt(x, zz, 0.4);
          if (g.key === 'water') { nrm.lerp(new THREE.Vector3(0, 1, 0), 0.85).normalize(); }
          Na.push(nrm.x, nrm.y, nrm.z);
          UVa.push(d / 2.4 + z.seed * 0.1, s / 2.4);
          const a = smoothstep(0.02, 0.45, w);
          const tint = g.key === 'rock' ? 0.8 : 1;
          Ca.push(tint, tint, tint, a);
        }
      }
      for (let i = 0; i < nS - 1; i++) for (let j = 0; j < nD - 1; j++) {
        const a = base + i * nD + j, b = a + 1, d = a + nD, e = d + 1;
        const P3 = Pa; // winding check via positions
        const tri = (p, q2, r2) => {
          const ny = (P3[q2 * 3 + 2] - P3[p * 3 + 2]) * (P3[r2 * 3] - P3[p * 3]) - (P3[q2 * 3] - P3[p * 3]) * (P3[r2 * 3 + 2] - P3[p * 3 + 2]);
          if (ny >= 0) Ia.push(p, q2, r2); else Ia.push(p, r2, q2);
        };
        tri(a, b, d); tri(b, e, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(Pa, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(Na, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(UVa, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(Ca, 4));
    geo.setIndex(Ia); geo.computeBoundingSphere();
    const mat = lib.get(g.key, { vertexColors: true, transparent: true, polygonOffset: -2 });
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 2; mesh.receiveShadow = true; mesh.name = 'decal_' + g.key;
    parent.add(mesh);
    const bs = geo.boundingSphere;
    decals.push({ mesh, center: bs.center.clone(), radius: bs.radius, kind: 'decal' });
  }

  // ---------- start ramp deck, gate; finish arch ----------
  const landmarks = buildLandmarks({ track, terrain, lib, parent, L });

  return { chunks, decals, landmarks };
}

function buildLandmarks({ track, terrain, lib, parent, L }) {
  const pp = {};
  const items = [];
  const woodDeck = lib.get('woodWeathered', { vertexColors: true, polygonOffset: -2 });
  // ---- ramp deck ----
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
  // ---- ramp rails, backboard, start gate ----
  const b = new Batch();
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
  {
    const a = track.atS(RAMP.s0 + 0.5, {}), ry = Math.atan2(-a.rhz, a.rhx), y = terrain.heightAt(a.px, a.pz);
    b.add('woodWeathered', boxG(RAMP.halfWidth * 2 + 0.5, 1.2, 0.2, 2), xf(a.px, y + 0.6, a.pz, 0, ry, 0), [0.8, 0.75, 0.7]);
  }
  // gate arch at s = 20 (cars pass beneath)
  const gateS = 17;
  {
    const a = track.atS(gateS, {});
    const ry = Math.atan2(-a.rhz, a.rhx);
    for (const sg of [-1, 1]) {
      const d = sg * (a.hw + 0.9), x = a.px + a.rhx * d, z = a.pz + a.rhz * d, y = terrain.heightAt(x, z);
      b.add('woodWeathered', boxG(0.28, 5.6, 0.28, 2), xf(x, y + 2.7, z, 0, ry, 0), [0.75, 0.7, 0.62]);
      b.add('woodWeathered', boxG(0.2, 2.4, 0.16, 2), xf(x - a.rhx * sg * 0.35, y + 0.8, z - a.rhz * sg * 0.35, 0, ry, sg * 0.5), [0.7, 0.65, 0.6]);
    }
    const y = terrain.heightAt(a.px, a.pz);
    b.add('woodWeathered', boxG((a.hw + 0.9) * 2 + 0.6, 0.3, 0.3, 2), xf(a.px, y + 5.4, a.pz, 0, ry, 0), [0.85, 0.8, 0.72]);
    // banner
    const bt = bannerTexture('SOAP BOX DERBY');
    const bm = new THREE.Mesh(new THREE.PlaneGeometry((a.hw + 0.9) * 2, 1.1), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.9, side: THREE.DoubleSide }));
    bm.position.set(a.px, y + 4.75, a.pz); bm.rotation.y = ry; bm.castShadow = true; bm.name = 'start_banner';
    parent.add(bm);
  }
  // ---- finish arch + line ----
  {
    const a = track.atS(L, {}); const ry = Math.atan2(-a.rhz, a.rhx);
    for (const sg of [-1, 1]) {
      const d = sg * (a.hw + 1.6), x = a.px + a.rhx * d, z = a.pz + a.rhz * d, y = terrain.heightAt(x, z);
      b.add('woodWeathered', boxG(0.4, 6.6, 0.4, 2), xf(x, y + 3.1, z, 0, ry, 0), [0.8, 0.76, 0.7]);
      b.add('dark', cylG(0.3, 0.3, 0.2, 8), xf(x, y + 6.5, z), [0.5, 0.5, 0.5]);
    }
    const y = terrain.heightAt(a.px, a.pz);
    b.add('woodWeathered', boxG((a.hw + 1.6) * 2 + 0.8, 0.4, 0.4, 2), xf(a.px, y + 6.2, a.pz, 0, ry, 0), [0.85, 0.8, 0.72]);
    const ft = bannerTexture('FINISH', '#f3efe2', '#151515');
    const fm = new THREE.Mesh(new THREE.PlaneGeometry((a.hw + 1.6) * 2, 1.5), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.9, side: THREE.DoubleSide }));
    fm.position.set(a.px, y + 5.2, a.pz); fm.rotation.y = ry; fm.name = 'finish_banner'; parent.add(fm);
    // checkered line draped on the road
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
    lm.name = 'finish_line'; lm.receiveShadow = true; parent.add(lm);
    // straw bales + barrels at the finish
    for (let i = 0; i < 6; i++) {
      const sg = i % 2 ? 1 : -1, d = sg * (a.hw + 2.6 + (i >> 1) * 0.9), s = L - 4 + (i >> 1) * 2.4;
      const p = track.atS(s, {}), x = p.px + p.rhx * d, z = p.pz + p.rhz * d;
      b.add('straw', cylG(0.62, 0.62, 1.2, 10), xf(x, terrain.heightAt(x, z) + 0.62, z, Math.PI / 2, i, 0), [1, 0.95, 0.85]);
    }
  }
  const grp = b.build(lib); grp.name = 'start_finish'; parent.add(grp);
  return { group: grp };
}
