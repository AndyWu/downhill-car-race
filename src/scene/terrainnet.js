// Height field for road NETWORKS (village / corn / circuit): same idea as terrain.js, but every road (main + branches)
// is treated as road, with a per-track verge profile (walls, kerbs, corn berm, tyre walls).
import * as THREE from 'three';
import { Noise, clamp, smoothstep } from './util.js';
import { makeClear } from './tracks/registry.js';

export const SHOULDER_IN = 1.5;

export function buildTerrainNet(net, pads, seed, opts = {}) {
  const O = { shoulderOut: 8, hillAmp: 14, hillFar: 14, hillScale: 190, hillNear: 75, rutScale: 1, noiseScale: 1, crown: 0.12, sideSlope: 0.24, verge: null, ...opts };
  const nz = new Noise(seed * 77 + 3), nzr = new Noise(seed * 91 + 17);
  const G = 6, margin = 300;
  const { minX, maxX, minZ, maxZ } = net.bounds;
  const gx0 = minX - margin, gz0 = minZ - margin;
  const GX = Math.ceil((maxX - minX + 2 * margin) / G) + 1, GZ = Math.ceil((maxZ - minZ + 2 * margin) / G) + 1;
  const H = new Float32Array(GX * GZ), D = new Float32Array(GX * GZ);
  const q = {}, pp = {}, zq = {};
  const SHOULDER_OUT = O.shoulderOut;

  function roadY(road, s, d, p) {
    const hw = p.hw, ad = Math.abs(d);
    const u = clamp(d, -hw, hw) / hw;
    let y = p.py - d * Math.tan(p.camber) - O.crown * u * u;
    if (O.rutScale > 0 && ad < hw - 0.2) {
      const rc = 0.95 + 0.18 * nzr.n1(s * 0.03);
      const depth = (0.03 + 0.022 * (nzr.n1(s * 0.05 + 9) + 1)) * O.rutScale;
      const fe = 1 - smoothstep(hw - 1.4, hw - 0.2, ad), t = (ad - rc) / 0.25;
      if (hw > 2.2) y -= depth * Math.exp(-t * t) * fe;
    }
    y += O.noiseScale * (0.009 * nzr.n2(s * 1.9, d * 2.4) + 0.016 * nzr.n2(s * 0.4 + 5, d * 0.6));
    if (road.field && ad <= hw + SHOULDER_IN) { road.field.query(s, d, zq); y += zq.lift * (1 - smoothstep(hw, hw + 0.6, ad)) - zq.cut; } else { zq.lift = 0; zq.cut = 0; }
    return y;
  }
  const clearOf = net.roads.length > 1 ? makeClear(net) : null;
  // verge of the winning road, faded out wherever the point lies inside (or hugging) ANOTHER road's corridor: walls never rise inside a junction mouth
  const verge = (road, s, d, hw, x, z, ri) => {
    if (!O.verge) return 0;
    const v = O.verge(road, s, d, hw);
    if (!clearOf || v < 0.005) return v;
    return v * smoothstep(0.25, 0.8, clearOf(x, z, ri));
  };

  const side = (s, d, hw) => O.sideSlope * nz.n1(s / 130 + 3) * clamp(d, -22, 22) * smoothstep(hw + 3, hw + 12, Math.abs(d));
  for (let iz = 0; iz < GZ; iz++) for (let ix = 0; ix < GX; ix++) {
    const x = gx0 + ix * G, z = gz0 + iz * G;
    net.project2(x, z, q); q.road.params(q.idx, pp);
    H[iz * GX + ix] = pp.py + side(q.s, q.d, pp.hw);
    D[iz * GX + ix] = Math.max(0, q.dist - pp.hw * 0.5);
  }
  const tmp = new Float32Array(H.length);
  const blur = (src, dst, horiz) => {
    for (let iz = 0; iz < GZ; iz++) for (let ix = 0; ix < GX; ix++) {
      let s = 0, n = 0;
      for (let k = -2; k <= 2; k++) { const jx = horiz ? ix + k : ix, jz = horiz ? iz : iz + k; if (jx < 0 || jz < 0 || jx >= GX || jz >= GZ) continue; s += src[jz * GX + jx]; n++; }
      dst[iz * GX + ix] = s / n;
    }
  };
  for (let p = 0; p < 2; p++) { blur(H, tmp, true); blur(tmp, H, false); }
  for (let iz = 0; iz < GZ; iz++) for (let ix = 0; ix < GX; ix++) {
    const x = gx0 + ix * G, z = gz0 + iz * G, dist = D[iz * GX + ix];
    const w = smoothstep(9, O.hillNear, dist), amp = O.hillAmp + O.hillFar * smoothstep(50, 260, dist);
    const hill = amp * nz.fbm2(x / O.hillScale, z / O.hillScale, 3) + 0.3 * amp * nz.n2(x / 55 + 40, z / 55) + 0.7 * nz.n2(x / 20, z / 20 + 9);
    const roll = 0.5 * nz.n2(x / 17 + 3, z / 17) * smoothstep(3, 14, dist) * (1 - w);
    H[iz * GX + ix] += hill * w + roll;
  }
  const gridBil = (arr, x, z) => {
    let fx = (x - gx0) / G, fz = (z - gz0) / G;
    fx = clamp(fx, 0, GX - 1.001); fz = clamp(fz, 0, GZ - 1.001);
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, i = iz * GX + ix;
    return (arr[i] * (1 - tx) + arr[i + 1] * tx) * (1 - tz) + (arr[i + GX] * (1 - tx) + arr[i + GX + 1] * tx) * tz;
  };
  for (const pad of pads || []) {
    pad.y = gridBil(H, pad.x, pad.z);
    const R2 = pad.r * 1.7;
    const i0 = Math.floor((pad.x - R2 - gx0) / G), i1 = Math.ceil((pad.x + R2 - gx0) / G), j0 = Math.floor((pad.z - R2 - gz0) / G), j1 = Math.ceil((pad.z + R2 - gz0) / G);
    for (let iz = Math.max(j0, 0); iz <= Math.min(j1, GZ - 1); iz++) for (let ix = Math.max(i0, 0); ix <= Math.min(i1, GX - 1); ix++) {
      const t = 1 - smoothstep(pad.r, R2, Math.hypot(gx0 + ix * G - pad.x, gz0 + iz * G - pad.z));
      if (t > 0) { const k = iz * GX + ix; H[k] += (pad.y - H[k]) * t; }
    }
  }

  function heightAt(x, z) {
    const g = gridBil(H, x, z);
    if (gridBil(D, x, z) > 26) return g;
    net.project2(x, z, q);
    const road = q.road; road.params(q.idx, pp);
    const hw = pp.hw, ad = Math.abs(q.d);
    if (ad > hw + SHOULDER_OUT) return g;
    if (ad <= hw + SHOULDER_IN) return roadY(road, q.s, q.d, pp) + verge(road, q.s, q.d, hw, x, z, q.roadIndex);
    let y0 = roadY(road, q.s, q.d < 0 ? -(hw + SHOULDER_IN) : hw + SHOULDER_IN, pp);
    y0 += zq.cut;
    if (road.field) road.field.query(q.s, q.d, zq); else { zq.cut = 0; }
    return y0 + (g - y0) * smoothstep(hw + SHOULDER_IN, hw + SHOULDER_OUT, ad) + verge(road, q.s, q.d, hw, x, z, q.roadIndex) - zq.cut;
  }
  function normalAt(x, z, e = 0.35) {
    return new THREE.Vector3(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
  }
  const info = {};
  function roadInfo(x, z) {
    net.project2(x, z, q); const road = q.road; road.params(q.idx, pp);
    info.road = road; info.s = q.s; info.d = q.d; info.hw = pp.hw; info.dist = q.dist; info.zone = null; info.w = 0; info.ramp = false;
    if (road.field && Math.abs(q.d) < pp.hw + 0.8) { road.field.query(q.s, q.d, zq); info.zone = zq.zone; info.w = zq.w; }
    return info;
  }
  return { heightAt, normalAt, roadInfo, roadY, gridBil, H, D, grid: { GX, GZ, G, gx0, gz0 }, opts: O };
}
