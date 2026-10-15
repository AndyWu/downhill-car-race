// Instanced roadside scenery: grass, trees, bushes, boulders, fences, utility poles, signs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, Noise, clamp, smoothstep, lerp, ihash } from './util.js';
import { Batch, boxG, cylG, prep, xf } from './batch.js';
import { bannerTexture } from './materials.js';

export const SCENERY_CHUNK = 125;

// ---------- geometry builders ----------
function colorize(g, fn) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3), t = [0, 0, 0];
  for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), t); c[i * 3] = t[0]; c[i * 3 + 1] = t[1]; c[i * 3 + 2] = t[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function mergeParts(parts) {
  const list = parts.map(({ g, m, shade }) => {
    const x = prep(g); if (m) x.applyMatrix4(m);
    colorize(x, shade); return x;
  });
  const out = mergeGeometries(list, false); out.computeBoundingSphere(); return out;
}
function blob(r, detail, seed, squash = 0.8) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.2 * (ihash(Math.round(x * 50), Math.round(y * 50) + Math.round(z * 50), seed) - 0.5);
    p.setXYZ(i, x * k, y * k * squash, z * k);
  }
  g.computeVertexNormals();
  return g;
}
const lerp3 = (a, b, t, o) => { o[0] = lerp(a[0], b[0], t); o[1] = lerp(a[1], b[1], t); o[2] = lerp(a[2], b[2], t); };

function makePine(seed, narrow = 1) {
  const r = mulberry32(seed * 91 + 3);
  const bark = (x, y, z, o) => { o[0] = 0.55; o[1] = 0.45; o[2] = 0.38; };
  const trunk = mergeParts([{ g: cylG(0.12, 0.28, 9, 6, 2), m: xf(0, 4.5, 0), shade: bark }]);
  const cones = [], tiers = 4 + Math.floor(r() * 3);
  for (let i = 0; i < tiers; i++) {
    const k = i / (tiers - 1), rad = (2.6 - k * 2.0) * narrow * (0.9 + r() * 0.25), h = 2.6 + r() * 0.8 - k * 0.5, y = 2.0 + k * 7 * (0.9 + r() * 0.1) - 0.7;
    cones.push({
      g: new THREE.ConeGeometry(rad, h, 7 + Math.floor(r() * 3), 1), m: xf((r() - 0.5) * 0.25, y + h / 2, (r() - 0.5) * 0.25, 0, r() * 6, 0),
      shade: (x, yy, z, o) => { const t = clamp((yy - y) / h, 0, 1); lerp3([0.12, 0.25, 0.14], [0.24, 0.4, 0.2], t, o); },
    });
  }
  return { trunk, canopy: mergeParts(cones), h: 10 };
}
function makeOak(seed, maple = false) {
  const r = mulberry32(seed * 57 + 11);
  const barkc = (x, y, z, o) => { o[0] = 0.5; o[1] = 0.42; o[2] = 0.36; };
  const lean = (r() - 0.5) * 0.3;
  const trunk = mergeParts([
    { g: cylG(0.32, 0.55, 3.4, 7, 2), m: xf(0, 1.7, 0, lean, 0, lean), shade: barkc },
    { g: cylG(0.14, 0.24, 2.4, 5, 2), m: xf(0.9, 3.6, 0, 0, 0, -0.7 - r() * 0.3), shade: barkc },
    { g: cylG(0.12, 0.2, 2.2, 5, 2), m: xf(-0.8, 3.7, 0.3, 0.2, 0, 0.5 + r() * 0.3), shade: barkc },
  ]);
  const blobs = [], nb = 4 + Math.floor(r() * 3);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * 6.28 + r(), rr = i === 0 ? 0 : 1.8 + r() * 0.9, y = (i === 0 ? 6.9 : 5.3 + r() * 1.6), rad = (i === 0 ? 2.7 : 1.9 + r() * 0.6) * (maple ? 0.85 : 1);
    const cx = Math.cos(a) * rr, cz = Math.sin(a) * rr;
    blobs.push({
      g: blob(rad, 1, seed * 7 + i, 0.7 + r() * 0.25), m: xf(cx, y, cz, 0, i, 0),
      shade: (x, yy, z, o) => { const t = clamp((yy - (y - rad)) / (rad * 1.6), 0, 1); lerp3([0.2, 0.34, 0.14], [0.42, 0.58, 0.22], t, o); },
    });
  }
  return { trunk, canopy: mergeParts(blobs), h: 9.2 };
}
function makePoplar(seed) {
  const trunk = mergeParts([{ g: cylG(0.1, 0.22, 5, 6, 2), m: xf(0, 2.5, 0), shade: (x, y, z, o) => { o[0] = 0.58; o[1] = 0.52; o[2] = 0.45; } }]);
  const blobs = [[0, 4.2, 1.1, 1.7], [0.1, 6.2, 0.95, 1.9], [-0.1, 8.2, 0.75, 1.9], [0, 10, 0.5, 1.6]].map((q, i) => ({
    g: blob(q[2], 1, seed + i, q[3]), m: xf(q[0], q[1], 0, 0, i, 0),
    shade: (x, y, z, o) => { const t = clamp((y - (q[1] - 2)) / 4, 0, 1); lerp3([0.2, 0.36, 0.14], [0.4, 0.56, 0.2], t, o); },
  }));
  return { trunk, canopy: mergeParts(blobs), h: 11.5 };
}
function makeBirch(seed) {
  const trunk = mergeParts([{ g: cylG(0.1, 0.17, 8, 6, 2), m: xf(0, 4, 0), shade: (x, y, z, o) => { const m = ihash(Math.round(y * 3), 0, seed) > 0.7 ? 0.3 : 1.35; o[0] = m; o[1] = m; o[2] = m * 0.95; } }]);
  const blobs = [];
  [[0, 7.8, 0, 1.3, 1.6], [0.4, 6.0, 0.3, 1.2, 1.3], [-0.4, 8.9, -0.2, 0.8, 1.1]].forEach((q, i) => blobs.push({
    g: blob(q[3], 1, seed + i, q[4]), m: xf(q[0], q[1], q[2], 0, i, 0),
    shade: (x, y, z, o) => { const t = clamp((y - (q[1] - 1)) / 3, 0, 1); lerp3([0.42, 0.55, 0.18], [0.66, 0.74, 0.28], t, o); },
  }));
  return { trunk, canopy: mergeParts(blobs), h: 10 };
}
function makeDead(seed) {
  const col = (x, y, z, o) => { o[0] = 0.62; o[1] = 0.58; o[2] = 0.52; };
  const parts = [{ g: cylG(0.1, 0.3, 6, 6, 2), m: xf(0, 3, 0), shade: col }];
  [[0.9, 4.4, 0, -0.9], [-0.8, 3.6, 0.2, 0.8], [0.2, 5.2, 0.7, -0.5], [-0.3, 5.6, -0.8, 0.5], [0.7, 2.8, -0.5, -1.1]].forEach((q) => parts.push({ g: cylG(0.03, 0.12, 2.2, 4, 2), m: xf(q[0], q[1], q[2], q[2] * 0.6, 0, q[3]), shade: col }));
  return { trunk: mergeParts(parts), canopy: null, h: 6.5 };
}
function makeBush(seed) {
  const blobs = [];
  [[0, 0.5, 0, 0.8], [0.7, 0.4, 0.3, 0.6], [-0.6, 0.4, -0.3, 0.65], [0.1, 0.9, -0.2, 0.55]].forEach((q, i) => blobs.push({
    g: blob(q[3], 0, seed + i, 0.85), m: xf(q[0], q[1], q[2]),
    shade: (x, y, z, o) => { const t = clamp(y / 1.4, 0, 1); lerp3([0.16, 0.28, 0.12], [0.36, 0.5, 0.2], t, o); },
  }));
  return { trunk: null, canopy: mergeParts(blobs), h: 1.6 };
}
function makeRock(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.75 + 0.5 * ihash(Math.round(x * 20), Math.round(y * 20), Math.round(z * 20) + seed);
    p.setXYZ(i, x * k, y * k * 0.7, z * k);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
function makeGrass() {
  const rng = mulberry32(5);
  const P = [], C = [], N = [];
  const blade = (ang, lean, h, w, r) => {
    const cx = Math.cos(ang) * r, cz = Math.sin(ang) * r, px = -Math.sin(ang) * w, pz = Math.cos(ang) * w;
    const lx = Math.cos(ang + 0.3) * lean, lz = Math.sin(ang + 0.3) * lean;
    const vs = [[cx - px, 0, cz - pz], [cx + px, 0, cz + pz], [cx + lx, h, cz + lz]];
    const cols = [[0.16, 0.24, 0.08], [0.16, 0.24, 0.08], [0.34, 0.48, 0.15]];
    for (let i = 0; i < 3; i++) { P.push(...vs[i]); C.push(...cols[i]); N.push(0, 1, 0); }
  };
  for (let i = 0; i < 8; i++) blade(rng() * 6.28, rng() * 0.2 + 0.04, 0.25 + rng() * 0.38, 0.02 + rng() * 0.02, rng() * 0.2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(P.length / 3 * 2), 2));
  g.computeBoundingSphere();
  return g;
}
function makePole() {
  const col = (x, y, z, o) => { if (y > 7.3 && y < 7.9) { o[0] = 0.4; o[1] = 0.5; o[2] = 0.5; } else { o[0] = 0.62; o[1] = 0.55; o[2] = 0.48; } };
  return mergeParts([
    { g: cylG(0.11, 0.17, 9, 6, 2), m: xf(0, 4.5, 0), shade: col },
    { g: boxG(2.2, 0.12, 0.12, 2), m: xf(0, 8.3, 0), shade: col },
    { g: boxG(1.8, 0.1, 0.1, 2), m: xf(0, 7.4, 0), shade: col },
    ...[-0.9, 0, 0.9].map((x) => ({ g: cylG(0.04, 0.05, 0.18, 5, 1), m: xf(x, 8.45, 0), shade: (a, b, c, o) => { o[0] = 0.2; o[1] = 0.45; o[2] = 0.4; } })),
  ]);
}


// ---------- baking helpers (merge many placed copies into one static geometry) ----------
function bakeStatic(geo, ms, cols) {
  const base = prep(geo), list = [];
  for (let i = 0; i < ms.length; i++) {
    const g = base.clone(); g.applyMatrix4(ms[i]);
    const n = g.attributes.position.count, c = cols ? cols[i] : null;
    const arr = new Float32Array(n * 3);
    const src = base.attributes.color;
    for (let k = 0; k < n; k++) {
      const m = src ? src.getX(k) : 1, m2 = src ? src.getY(k) : 1, m3 = src ? src.getZ(k) : 1;
      arr[k * 3] = m * (c ? c.r : 1); arr[k * 3 + 1] = m2 * (c ? c.g : 1); arr[k * 3 + 2] = m3 * (c ? c.b : 1);
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    list.push(g);
  }
  const out = mergeGeometries(list, false); out.computeBoundingSphere();
  return out;
}
/** merge placed trees; adds swayH (height factor incl. species amplitude) and swayO (tree origin xz) for the vertex shader */
function bakeTrees(items, part) {
  const list = [];
  for (const it of items) {
    const g0 = it.sp[part]; if (!g0) continue;
    const g = g0.clone(); const p = g.attributes.position, n = p.count;
    const sh = new Float32Array(n), so = new Float32Array(n * 2), col = new Float32Array(n * 3), c0 = g.attributes.color;
    const pos = new THREE.Vector3(); it.m.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
    const k = (it.sp.amp / 0.14) / it.sp.h;
    for (let i = 0; i < n; i++) {
      sh[i] = Math.max(0, p.getY(i)) * k; so[i * 2] = pos.x; so[i * 2 + 1] = pos.z;
      col[i * 3] = c0.getX(i) * it.col.r; col[i * 3 + 1] = c0.getY(i) * it.col.g; col[i * 3 + 2] = c0.getZ(i) * it.col.b;
    }
    g.applyMatrix4(it.m);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('swayH', new THREE.BufferAttribute(sh, 1)); g.setAttribute('swayO', new THREE.BufferAttribute(so, 2));
    for (const nme of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'swayH', 'swayO'].includes(nme)) g.deleteAttribute(nme);
    list.push(g);
  }
  if (!list.length) return null;
  const out = mergeGeometries(list, false); out.computeBoundingSphere(); return out;
}
function makeFarConifer() {
  return mergeParts([
    { g: cylG(0.22, 0.3, 3, 4, 2), m: xf(0, 1.5, 0), shade: (x, y, z, o) => { o[0] = 0.4; o[1] = 0.32; o[2] = 0.25; } },
    { g: new THREE.ConeGeometry(2.2, 8, 6, 1), m: xf(0, 6.0, 0), shade: (x, y, z, o) => { const t = clamp((y - 2) / 8, 0, 1); lerp3([0.12, 0.24, 0.13], [0.22, 0.36, 0.18], t, o); } },
  ]);
}
function makeFarBroad() {
  return mergeParts([
    { g: cylG(0.3, 0.45, 4, 4, 2), m: xf(0, 2, 0), shade: (x, y, z, o) => { o[0] = 0.4; o[1] = 0.32; o[2] = 0.25; } },
    { g: blob(2.9, 0, 3, 0.8), m: xf(0, 6.2, 0), shade: (x, y, z, o) => { const t = clamp((y - 4) / 5, 0, 1); lerp3([0.2, 0.33, 0.14], [0.4, 0.55, 0.22], t, o); } },
  ]);
}

// ---------- chunk builder ----------
export function buildScenery({ track, terrain, field, lib, parent, L, seed, farms }) {
  const nz = new Noise(seed * 211 + 9);
  const pp = {};
  // palettes: instance tints multiply the canopy vertex colours (lo/hi per channel)
  const GREEN = [[0.7, 1.15], [0.8, 1.15], [0.6, 1.1]], YEL = [[0.95, 1.35], [0.9, 1.15], [0.5, 0.8]], AUTUMN = [[1.5, 2.2], [0.55, 1.1], [0.25, 0.5]], BLUEG = [[0.65, 0.95], [0.8, 1.1], [0.75, 1.1]];
  const species = [
    { name: 'pineA', ...makePine(1, 1.0), sc: [0.8, 1.5], amp: 0.14, pal: BLUEG },
    { name: 'pineB', ...makePine(2, 0.7), sc: [1.0, 1.7], amp: 0.14, pal: GREEN },
    { name: 'oakA', ...makeOak(2), sc: [0.8, 1.35], amp: 0.1, pal: GREEN },
    { name: 'oakB', ...makeOak(6), sc: [0.7, 1.5], amp: 0.1, pal: YEL },
    { name: 'maple', ...makeOak(9, true), sc: [0.7, 1.2], amp: 0.1, pal: AUTUMN },
    { name: 'birch', ...makeBirch(3), sc: [0.8, 1.2], amp: 0.14, pal: YEL },
    { name: 'poplar', ...makePoplar(8), sc: [0.8, 1.4], amp: 0.1, pal: GREEN },
    { name: 'dead', ...makeDead(4), sc: [0.7, 1.2], amp: 0.0, pal: GREEN },
    { name: 'bush', ...makeBush(5), sc: [0.7, 1.7], amp: 0.06, pal: YEL },
  ];
  const SP = Object.fromEntries(species.map((sp, i) => [sp.name, i]));
  const pickSpecies = (v, r) => {
    if (r < 0.05) return SP.dead;
    if (r < 0.26) return SP.bush;
    const q = (r - 0.26) / 0.74;
    if (v < -0.25) return q < 0.38 ? SP.pineA : q < 0.72 ? SP.pineB : q < 0.88 ? SP.oakA : q < 0.95 ? SP.birch : SP.maple;
    if (v < 0.25) return q < 0.28 ? SP.oakA : q < 0.5 ? SP.oakB : q < 0.62 ? SP.maple : q < 0.78 ? SP.birch : q < 0.88 ? SP.poplar : SP.pineA;
    return q < 0.3 ? SP.birch : q < 0.55 ? SP.poplar : q < 0.75 ? SP.oakB : q < 0.88 ? SP.maple : SP.oakA;
  };
  const grassGeo = makeGrass(), rockGeo = makeRock(7), poleGeo = makePole();
  const grassMat = lib.get('blade', { vertexColors: true, side: THREE.DoubleSide, sway: { amp: 0.16, freq: 1.7, hpow: 1.6, hscale: 1.1 } });
  const rockMat = lib.get('rock');
  const postMat = lib.get('woodWeathered');
  const poleMat = lib.get('woodWeathered', { vertexColors: true });
  const trunkMats = {}, canopyMats = {};
  for (const sp of species) {
    if (sp.trunk) trunkMats[sp.name] = lib.get('woodWeathered', { vertexColors: true, sway: { amp: sp.amp * 0.5, freq: 1.2, hpow: 2, hscale: 1 / sp.h } });
    if (sp.canopy) canopyMats[sp.name] = lib.get('foliage', { vertexColors: true, side: THREE.DoubleSide, sway: { amp: sp.amp * 1.6, freq: 1.35, hpow: 2, hscale: 1 / sp.h } });
  }
  const trunkMatNear = lib.get('woodWeathered', { vertexColors: true, sway: { amp: 0.07, freq: 1.2, hpow: 2, hscale: 1, attr: true } });
  const canopyMatNear = lib.get('foliage', { vertexColors: true, side: THREE.DoubleSide, sway: { amp: 0.22, freq: 1.35, hpow: 2, hscale: 1, attr: true } });
  const farConiferGeo = makeFarConifer(), farBroadGeo = makeFarBroad();
  const farMat = lib.get('blade', { vertexColors: true, side: THREE.DoubleSide, sway: { amp: 0.2, freq: 1.3, hpow: 2, hscale: 0.1 } });
  const fenceMat = lib.get('woodWeathered', { vertexColors: true });
  const railGeo = boxG(1, 0.08, 0.11, 2), postGeo = boxG(0.14, 1.3, 0.14, 2);
  const wireMat = new THREE.LineBasicMaterial({ color: 0x15181a });
  const signMat = new THREE.MeshStandardMaterial({ map: bannerTexture('SLOW - KIDS RACING', '#e8dcb8', '#9c1d14'), roughness: 0.9, side: THREE.DoubleSide });
  const terrainY = (x, z) => terrain.heightAt(x, z);

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
  const mats = (arr) => arr;
  function mkInst(geo, mat, ms, cols, cast = true, recv = false) {
    const m = new THREE.InstancedMesh(geo, mat, ms.length);
    for (let i = 0; i < ms.length; i++) { m.setMatrixAt(i, ms[i]); if (cols) m.setColorAt(i, cols[i]); }
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere(); m.castShadow = cast; m.receiveShadow = recv;
    return m;
  }
  const compose = (x, y, z, yaw, sx, sy = sx, sz = sx, tiltX = 0, tiltZ = 0) => {
    _e.set(tiltX, yaw, tiltZ, 'YXZ'); _q.setFromEuler(_e);
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), new THREE.Vector3(sx, sy, sz));
  };
  const farmBlocked = (x, z, r) => {
    for (const f of farms) {
      if (Math.hypot(f.x - x, f.z - z) < r) return true;
      // driveway corridor
      const ax = f.roadX, az = f.roadZ, bx = f.x, bz = f.z, dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      if (Math.hypot(ax + dx * t - x, az + dz * t - z) < 7) return true;
    }
    return false;
  };
  const place = (s, d, o) => { track.atS(s, pp); o.x = pp.px + pp.rhx * d; o.z = pp.pz + pp.rhz * d; o.hw = pp.hw; o.y = terrain.heightAt(o.x, o.z); return o; };

  const chunks = [];
  const nC = Math.ceil((L + 60) / SCENERY_CHUNK);
  const polesRanges = [{ a: 120, b: 1250, side: -1 }, { a: 1500, b: 3100, side: 1 }];
  const poleList = [];
  for (const r of polesRanges) for (let s = r.a; s < r.b; s += 46) poleList.push({ s, side: r.side });

  for (let c = 0; c < nC; c++) {
    const s0 = c * SCENERY_CHUNK, s1 = Math.min(L + 40, (c + 1) * SCENERY_CHUNK);
    const group = new THREE.Group(); group.name = 'scenery_near_' + c;
    const mid = new THREE.Group(); mid.name = 'scenery_mid_' + c;
    const farG = new THREE.Group(); farG.name = 'scenery_far_' + c;
    const rng = mulberry32(seed * 1000 + c * 31 + 7);
    const o = {};

    // ---- trees, bushes ----
    {
      const items = [];
      for (let i = 0; i < 125; i++) {
        const s = s0 + rng() * (s1 - s0), side = rng() < 0.5 ? -1 : 1;
        track.atS(s, pp);
        const off = pp.hw + 6.5 + Math.pow(rng(), 1.8) * 85;
        const dens = 0.18 + 0.82 * smoothstep(-0.25, 0.45, nz.n1(s / 120 + side * 5.3 + off / 60));
        if (rng() > dens) continue;
        place(s, side * off, o);
        if (farmBlocked(o.x, o.z, 52)) continue;
        const si = pickSpecies(nz.n1(s / 170 + side * 17 + 3 + off / 150), rng());
        const sp = species[si], sc = lerp(sp.sc[0], sp.sc[1], rng());
        const wv = lerp(0.8, 1.28, rng()), hv = lerp(0.78, 1.35, rng());
        const mt = compose(o.x, o.y - 0.15, o.z, rng() * 6.28, sc * wv, sc * hv, sc * lerp(0.8, 1.28, rng()), (rng() - 0.5) * 0.09, (rng() - 0.5) * 0.09);
        const br = 0.82 + rng() * 0.3, t = rng();
        items.push({ sp, si, m: mt, col: new THREE.Color(br * lerp(sp.pal[0][0], sp.pal[0][1], t), br * lerp(sp.pal[1][0], sp.pal[1][1], rng() * 0.6 + t * 0.4), br * lerp(sp.pal[2][0], sp.pal[2][1], rng())) });
      }
      const tg = bakeTrees(items, 'trunk'), cg = bakeTrees(items, 'canopy');
      if (tg) { const m = new THREE.Mesh(tg, trunkMatNear); m.castShadow = true; m.name = 'trees_trunk'; group.add(m); }
      if (cg) { const m = new THREE.Mesh(cg, canopyMatNear); m.castShadow = true; m.name = 'trees_canopy'; group.add(m); }
      // far LOD: cheap instanced silhouettes
      const con = items.filter((it) => it.sp.name.startsWith('pine')), brd = items.filter((it) => !it.sp.name.startsWith('pine') && it.sp.name !== 'dead' && it.sp.name !== 'bush');
      if (con.length) { const m = mkInst(farConiferGeo, farMat, con.map((i) => i.m), con.map((i) => i.col), false); m.name = 'far_conifers'; farG.add(m); }
      if (brd.length) { const m = mkInst(farBroadGeo, farMat, brd.map((i) => i.m), brd.map((i) => i.col), false); m.name = 'far_broadleaf'; farG.add(m); }
    }

    // ---- boulders + rock fields ----
    {
      const ms = [], cols = [];
      for (let i = 0; i < 8; i++) {
        const s = s0 + rng() * (s1 - s0), side = rng() < 0.5 ? -1 : 1;
        track.atS(s, pp);
        place(s, side * (pp.hw + 1.8 + Math.pow(rng(), 2) * 40), o);
        if (farmBlocked(o.x, o.z, 40)) continue;
        const k = 0.35 + Math.pow(rng(), 2.5) * 2.2;
        ms.push(compose(o.x, o.y + k * 0.1, o.z, rng() * 6.28, k * (0.9 + rng() * 0.6), k * (0.7 + rng() * 0.5), k * (0.9 + rng() * 0.6), 0, 0));
        const t = 0.75 + rng() * 0.4; cols.push(new THREE.Color(t, t * 0.98, t * 0.94));
      }
      for (const z of field.zones) {
        if (z.kind !== 'rock' || z.s < s0 || z.s >= s1) continue;
        const n = 26;
        for (let i = 0; i < n; i++) {
          const a = rng() * 6.283, rr = Math.sqrt(rng());
          const s = z.s + Math.cos(a) * rr * z.a * 0.9, d = z.lateral + Math.sin(a) * rr * z.b * 0.9;
          place(s, d, o);
          const k = 0.06 + Math.pow(rng(), 2) * 0.2;
          ms.push(compose(o.x, o.y + k * 0.25, o.z, rng() * 6.28, k * (0.9 + rng() * 0.6), k * (0.7 + rng() * 0.5), k * (0.9 + rng() * 0.6)));
          const t = 0.7 + rng() * 0.5; cols.push(new THREE.Color(t, t, t * 0.95));
        }
      }
      if (ms.length) { const m = mkInst(rockGeo, rockMat, ms, cols, false, true); m.name = 'rocks'; mid.add(m); }
    }

    // ---- fences ----
    {
      const posts = [], rails = [], pcols = [], rcols = [];
      const fencePt = (side, s) => {
        if (s < 30) return null;
        if (nz.n1(s / 230 + side * 13 + 2) <= -0.38) return null;
        for (const f of farms) if (f.side === side && Math.abs(s - f.s) < 7) return null;
        const hw = track.atS(s, pp).hw;
        return place(s, side * (hw + 4.7 + 0.3 * nz.n1(s / 17 + side * 3)), {});
      };
      for (const side of [-1, 1]) {
        for (let k = Math.ceil(s0 / 3); k * 3 < s1; k++) {
          const s = k * 3, cur = fencePt(side, s);
          if (!cur) continue;
          const hsh = ihash(k, side * 7 + 3, seed), broken = hsh < 0.1, missing = hsh > 0.965;
          const lean = broken ? (hsh < 0.05 ? 0.6 : -0.55) : (rng() - 0.5) * 0.12;
          if (!missing) { posts.push(compose(cur.x, cur.y + 0.55, cur.z, rng() * 6.28, 1, 1, 1, lean, lean * 0.7)); const t = 0.65 + rng() * 0.35; pcols.push(new THREE.Color(t, t * 0.96, t * 0.92)); }
          const prev = fencePt(side, s - 3);
          if (prev) {
            for (const hh of [0.42, 0.92]) {
              if (rng() < (broken ? 0.45 : 0.05)) continue;
              const a = new THREE.Vector3(prev.x, prev.y + hh + 0.05, prev.z), b = new THREE.Vector3(cur.x, broken ? cur.y + 0.1 + hh * 0.15 : cur.y + hh + (rng() - 0.5) * 0.06, cur.z);
              const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
              _q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
              rails.push(new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), _q.clone(), new THREE.Vector3(len, 1, 1)));
              const tt = 0.7 + rng() * 0.3; rcols.push(new THREE.Color(tt, tt * 0.96, tt * 0.9));
            }
          }
          if (broken) { rails.push(compose(cur.x + (rng() - 0.5) * 1.5, cur.y + 0.08, cur.z + (rng() - 0.5) * 1.5, rng() * 6.28, 2.8, 1, 1, 0, (rng() - 0.5) * 0.2)); rcols.push(new THREE.Color(0.6, 0.55, 0.5)); }
        }
      }
      const fg = [];
      if (posts.length) fg.push(bakeStatic(postGeo, posts, pcols));
      if (rails.length) fg.push(bakeStatic(railGeo, rails, rcols));
      if (fg.length) { const geo = mergeGeometries(fg.map((g) => prep(g)), false); geo.computeBoundingSphere(); const m = new THREE.Mesh(geo, fenceMat); m.name = 'fence'; mid.add(m); }
    }

    // ---- utility poles + wires ----
    {
      const ms = [], pts = [];
      const polePos = (p) => { const hw = track.atS(p.s, pp).hw; const q = place(p.s, p.side * (hw + 5.2), {}); q.rx = pp.rhx; q.rz = pp.rhz; return q; };
      for (const p of poleList.filter((p) => p.s >= s0 && p.s < s1)) {
        const a = polePos(p);
        ms.push(compose(a.x, a.y - 0.2, a.z, Math.atan2(-a.rz, a.rx), 1, 1, 1, 0, (rng() - 0.5) * 0.05));
        const nxt = poleList.find((q) => q.side === p.side && Math.abs(q.s - (p.s + 46)) < 0.1);
        if (!nxt) continue;
        const b2 = polePos(nxt);
        for (const off of [-0.9, 0, 0.9]) {
          const hgt = off === 0 ? 7.4 : 8.3;
          let prevP = null;
          for (let k = 0; k <= 10; k++) {
            const t = k / 10;
            const q = [lerp(a.x, b2.x, t) + a.rx * off, lerp(a.y, b2.y, t) - 0.2 + hgt - 0.9 * 4 * t * (1 - t) + 0.12, lerp(a.z, b2.z, t) + a.rz * off];
            if (prevP) pts.push(...prevP, ...q);
            prevP = q;
          }
        }
      }
      if (ms.length) { const m = new THREE.Mesh(bakeStatic(poleGeo, ms, null), poleMat); m.name = 'poles'; mid.add(m); }
      if (pts.length) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.computeBoundingSphere();
        const ln = new THREE.LineSegments(g, wireMat); ln.name = 'wires'; mid.add(ln);
      }
    }

    // ---- roadside story props + signs ----
    {
      const b = new Batch();
      const at = (s, side, off) => { const hw = track.atS(s, pp).hw; const q = place(s, side * (hw + off), {}); q.T = track.sampleAt(s).tangent; q.side = side; q.ry = Math.atan2(-pp.rhz, pp.rhx); return q; };
      for (const z of field.zones) {
        if ((z.kind !== 'mud' && z.kind !== 'stream') || z.s - 32 < s0 || z.s - 32 >= s1) continue;
        const side = rng() < 0.5 ? -1 : 1, q = at(z.s - 32, side, 5.4);
        const yaw = q.ry + Math.PI / 2 + side * 0.15;
        b.add('woodWeathered', boxG(0.1, 1.9, 0.1, 1), xf(q.x, q.y + 0.9, q.z, 0, yaw, (rng() - 0.5) * 0.1), [0.7, 0.62, 0.55]);
        b.add('metalRusted', boxG(0.75, 0.75, 0.03, 1), xf(q.x, q.y + 1.9, q.z, 0, yaw, Math.PI / 4), [1.4, 1.1, 0.5]);
        b.add('dark', boxG(0.07, 0.38, 0.04, 1), xf(q.x, q.y + 1.95, q.z, 0, yaw, 0), [0.05, 0.05, 0.05]);
      }
      const inR = (v) => v >= s0 && v < s1;
      // hand-painted "SLOW - KIDS RACING" signs
      [60, 800, 1700, 2600, 3100].forEach((ss, i) => {
        if (!inR(ss)) return;
        const side = i % 2 ? 1 : -1, q = at(ss, side, 5.6), T = q.T;
        const yaw = Math.atan2(-T.x, -T.z) + side * 0.12;
        b.add('woodWeathered', boxG(0.12, 2.3, 0.12, 1), xf(q.x - Math.cos(yaw) * 0.9, q.y + 1.0, q.z + Math.sin(yaw) * 0.9, 0, yaw, 0.03), [0.6, 0.52, 0.45]);
        b.add('woodWeathered', boxG(0.12, 2.3, 0.12, 1), xf(q.x + Math.cos(yaw) * 0.9, q.y + 1.0, q.z - Math.sin(yaw) * 0.9, 0, yaw, -0.02), [0.6, 0.52, 0.45]);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.6), signMat);
        m.position.set(q.x, q.y + 1.9, q.z); m.rotation.set(0.05, yaw, (rng() - 0.5) * 0.06); m.castShadow = true; m.name = 'kids_sign'; group.add(m);
      });
      // broken cart wheels leaning on the fence line
      [350, 1520, 2400, 2990].forEach((ss, i) => {
        if (!inR(ss)) return;
        const q = at(ss, i % 2 ? 1 : -1, 5.0), base = xf(q.x, q.y + 0.48, q.z, -0.28, q.ry + 0.5, 0.0);
        b.add('woodWeathered', new THREE.TorusGeometry(0.5, 0.05, 5, 14), base, [0.55, 0.48, 0.4]);
        for (let k = 0; k < 6; k++) if (k !== 2) b.add('woodWeathered', boxG(1.0, 0.045, 0.045, 1), base.clone().multiply(xf(0, 0, 0, 0, 0, k * Math.PI / 6)), [0.6, 0.52, 0.44]);
        b.add('metalRusted', cylG(0.08, 0.08, 0.12, 6, 1), base.clone().multiply(xf(0, 0, 0, Math.PI / 2, 0, 0)), [1.0, 0.55, 0.4]);
      });
      // hay wagons parked in the field
      [{ s: 1010, side: -1 }, { s: 2030, side: 1 }].forEach((w) => {
        if (!inR(w.s)) return;
        const q = at(w.s, w.side, 12.5), base = xf(q.x, q.y, q.z, 0, q.ry + 0.6, 0.04);
        const L = (m) => base.clone().multiply(m);
        b.add('woodWeathered', boxG(3.4, 0.14, 1.7, 2), L(xf(0, 0.8, 0)), [0.7, 0.62, 0.55]);
        for (const sx of [-1, 1]) { b.add('woodWeathered', boxG(3.4, 0.5, 0.06, 2), L(xf(0, 1.15, sx * 0.84)), [0.65, 0.58, 0.5]); b.add('dark', cylG(0.5, 0.5, 0.1, 10, 1), L(xf(sx * 0.0 - 0.9, 0.5, sx * 0.95, Math.PI / 2, 0, 0)), [0.25, 0.2, 0.15]); b.add('dark', cylG(0.5, 0.5, 0.1, 10, 1), L(xf(0.9, 0.5, sx * 0.95, Math.PI / 2, 0, 0)), [0.25, 0.2, 0.15]); }
        b.add('woodWeathered', boxG(0.1, 0.1, 2.6, 2), L(xf(2.5, 0.45, 0, 0, Math.PI / 2, 0.28)), [0.55, 0.5, 0.45]);
        b.add('straw', boxG(3.0, 0.8, 1.55, 2), L(xf(-0.1, 1.3, 0)), [0.95, 0.9, 0.7]);
        b.add('straw', boxG(2.0, 0.5, 1.3, 2), L(xf(-0.4, 1.9, 0)), [1, 0.95, 0.75]);
      });
      // rusted oil drums
      [610, 1250, 1900, 2850].forEach((ss, i) => {
        if (!inR(ss)) return;
        const side = i % 2 ? -1 : 1, q = at(ss, side, 7.2);
        for (let k = 0; k < 3; k++) {
          const x = q.x + (rng() - 0.5) * 1.8, z = q.z + (rng() - 0.5) * 1.8, y = terrainY(x, z), tipped = k === 2;
          const base = tipped ? xf(x, y + 0.3, z, 0, rng() * 6, Math.PI / 2) : xf(x, y + 0.45, z, 0, rng() * 6, 0);
          b.add('metalRusted', cylG(0.3, 0.3, 0.9, 10, 1), base, [1.0, 0.5 + rng() * 0.2, 0.35]);
          for (const hh of [-0.28, 0, 0.28]) b.add('metalRusted', cylG(0.315, 0.315, 0.05, 10, 1), base.clone().multiply(xf(0, hh, 0)), [0.7, 0.4, 0.3]);
          b.add('dark', cylG(0.28, 0.28, 0.03, 10, 1), base.clone().multiply(xf(0, 0.46, 0)), [0.15, 0.1, 0.08]);
        }
      });
      if (b.parts.size) group.add(b.build(lib, { shadow: false }));
    }

    track.atS((s0 + s1) / 2, pp);
    const ctr = new THREE.Vector3(pp.px, pp.py, pp.pz);
    for (const g of [group, mid, farG]) if (g.children.length) parent.add(g);
    chunks.push({ near: group, mid, far: farG, center: ctr, radius: (s1 - s0) / 2 + 40, kind: 'scenery' });
  }

  // ---- grass patches (125 m, shorter view range) ----
  const grass = [];
  const GP = 60, nG = Math.ceil((L + 60) / GP);
  for (let c = 0; c < nG; c++) {
    const s0 = c * GP, s1 = Math.min(L + 40, s0 + GP);
    const rng = mulberry32(seed * 777 + c * 13 + 3), o = {};
    const ms = [], cols = [], count = 1200;
    for (let i = 0; i < count; i++) {
      const s = s0 + rng() * (s1 - s0), side = rng() < 0.5 ? -1 : 1;
      track.atS(s, pp);
      const off = pp.hw + 0.7 + -Math.log(1 - rng() * 0.98) * 4.2;
      if (off > pp.hw + 22) continue;
      place(s, side * off, o);
      if (s < 26 && off < pp.hw + 3) continue;
      const patch = nz.n2(o.x / 30, o.z / 30) * 0.5 + 0.5;
      if (rng() > 0.45 + patch * 0.55) continue;
      const k = 0.65 + rng() * 0.9;
      ms.push(compose(o.x, o.y - 0.02, o.z, rng() * 6.28, k * (0.8 + rng() * 0.5), k * (0.7 + rng() * 0.8), k * (0.8 + rng() * 0.5)));
      const t = rng();
      cols.push(new THREE.Color(0.7 + t * 0.35, 0.8 + t * 0.15 - rng() * 0.1, 0.5 + rng() * 0.3));
    }
    if (!ms.length) continue;
    const m = mkInst(grassGeo, grassMat, ms, cols, false, false); m.name = 'grass';
    track.atS((s0 + s1) / 2, pp);
    parent.add(m);
    grass.push({ mesh: m, center: new THREE.Vector3(pp.px, pp.py, pp.pz), radius: (s1 - s0) / 2 + 24 });
  }
  return { chunks, grass };
}
