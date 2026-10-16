// Height field: analytic road surface (spline lookup) blended into a precomputed terrain grid.
import * as THREE from 'three';
import { Noise, clamp, smoothstep } from './util.js';

export const RAMP = { s0: -12, s1: 24, height: 1.6, halfWidth: 3.3 };
export const SHOULDER_IN = 1.5;   // road mesh extends this far beyond the nominal half width
export const SHOULDER_OUT = 12;  // fully blended into terrain at hw + this

const CROWN = 0.12;

export function buildTerrain(track, field, pads, seed = 1, gaps = []) {
  const nz = new Noise(seed * 77 + 3);
  const nzr = new Noise(seed * 91 + 17);
  const G = 6, margin = 300;
  const { minX, maxX, minZ, maxZ } = track.bounds;
  const gx0 = minX - margin, gz0 = minZ - margin;
  const GX = Math.ceil((maxX - minX + 2 * margin) / G) + 1, GZ = Math.ceil((maxZ - minZ + 2 * margin) / G) + 1;
  let H = new Float32Array(GX * GZ), D = new Float32Array(GX * GZ);
  const q = {}, pp = {}, zq = {};

  // ---- road surface ----
  function rampLift(s, ad) {
    if (s < RAMP.s0 - 6 || s > RAMP.s1) return 0;
    const l = s < RAMP.s0 ? RAMP.height * smoothstep(RAMP.s0 - 5, RAMP.s0, s) : RAMP.height * clamp((RAMP.s1 - s) / (RAMP.s1 - RAMP.s0), 0, 1);
    return l * (1 - smoothstep(RAMP.halfWidth - 0.2, RAMP.halfWidth + 0.6, ad));
  }
  function roadY(s, d, p) {
    const hw = p.hw, ad = Math.abs(d);
    const u = clamp(d, -hw, hw) / hw;
    let y = p.py - d * Math.tan(p.camber) - CROWN * u * u;
    const ramp = rampLift(s, ad);
    const rm = ramp > 0 ? 1 - clamp(ramp / 0.4, 0, 1) : 1;
    if (ad < hw - 0.2 && rm > 0) {
      const rc = 0.95 + 0.18 * nzr.n1(s * 0.03);
      const depth = 0.03 + 0.022 * (nzr.n1(s * 0.05 + 9) + 1);
      const fe = 1 - smoothstep(hw - 1.4, hw - 0.2, ad);
      const t = (ad - rc) / 0.25;
      y -= depth * Math.exp(-t * t) * fe * rm;
    }
    if (rm > 0) y += rm * (0.009 * nzr.n2(s * 1.9, d * 2.4) + 0.016 * nzr.n2(s * 0.4 + 5, d * 0.6));
    y += ramp;
    if (ad <= hw + SHOULDER_IN) { field.query(s, d, zq); y += zq.lift * (1 - smoothstep(hw, hw + 0.6, ad)) - zq.cut; }
    return y;
  }

  // verge ditch + berm: continuous lip beyond the shoulder, with openings at driveways
  function bermAmp(s, d) {
    let a = 0.94 + 0.06 * nzr.n1(s / 37 + 5);
    const sd = d < 0 ? -1 : 1;
    for (const g of gaps) if (g.side === sd) { const r = g.r === undefined ? 5 : g.r; a *= smoothstep(r, r + (r > 5 ? 5 : 2.2), Math.abs(s - g.s)); }
    return a;
  }
  // verge: ~17 deg foot ramp (gravity rolls a car back to the road) ending in a short steep lip (stops fast cars), gentle back slope
  function verge(s, d, hw) {
    const ad = Math.abs(d), a = bermAmp(s, d);
    const ki = clamp(Math.round(s + 40), 0, track.tables.TN - 1);
    const lip = 1.5 + 0.7 * Math.min(1, Math.abs(track.tables.kap[ki]) / 0.014);
    const r = ad - (hw + 0.1);
    const foot = 0.4 * (Math.sqrt(r * r + 0.02) + r) * 0.5;                // rises 0.4 m/m (22 deg) from just outside the road edge
    const rFoot = 1.4, hFoot = 0.56;
    let y = Math.min(foot, hFoot);
    y += lip * smoothstep(rFoot, rFoot + 0.55, r);                        // steep step
    const fall = 1 - smoothstep(rFoot + 2.0, rFoot + 7.0, r);
    return a * y * fall;
  }

  // ---- terrain grid ----
  const side = (s, d, hw) => 0.24 * nz.n1(s / 130 + 3) * clamp(d, -22, 22) * smoothstep(hw + 3, hw + 12, Math.abs(d));
  for (let iz = 0; iz < GZ; iz++) {
    for (let ix = 0; ix < GX; ix++) {
      const x = gx0 + ix * G, z = gz0 + iz * G;
      track.project2(x, z, q); track.params(q.idx, pp);
      H[iz * GX + ix] = pp.py + side(q.s, q.d, pp.hw);
      D[iz * GX + ix] = q.dist;
    }
  }
  // blur datum (2 passes separable box, radius 2) to remove medial-axis cusps
  const tmp = new Float32Array(H.length);
  const blur = (src, dst, horiz) => {
    const R = 2;
    for (let iz = 0; iz < GZ; iz++) for (let ix = 0; ix < GX; ix++) {
      let s = 0, n = 0;
      for (let k = -R; k <= R; k++) {
        const jx = horiz ? ix + k : ix, jz = horiz ? iz : iz + k;
        if (jx < 0 || jz < 0 || jx >= GX || jz >= GZ) continue;
        s += src[jz * GX + jx]; n++;
      }
      dst[iz * GX + ix] = s / n;
    }
  };
  for (let p = 0; p < 2; p++) { blur(H, tmp, true); blur(tmp, H, false); }
  // hills
  for (let iz = 0; iz < GZ; iz++) {
    for (let ix = 0; ix < GX; ix++) {
      const x = gx0 + ix * G, z = gz0 + iz * G, dist = D[iz * GX + ix];
      const w = smoothstep(9, 75, dist);
      const amp = 15 + 18 * smoothstep(50, 260, dist);
      const hill = amp * nz.fbm2(x / 190, z / 190, 3) + 4.5 * nz.n2(x / 55 + 40, z / 55) + 0.7 * nz.n2(x / 20, z / 20 + 9);
      const roll = 0.6 * nz.n2(x / 17 + 3, z / 17) * smoothstep(3, 14, dist) * (1 - w);
      H[iz * GX + ix] += hill * w + roll;
    }
  }
  const gridBil = (arr, x, z) => {
    let fx = (x - gx0) / G, fz = (z - gz0) / G;
    fx = clamp(fx, 0, GX - 1.001); fz = clamp(fz, 0, GZ - 1.001);
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const i = iz * GX + ix;
    return (arr[i] * (1 - tx) + arr[i + 1] * tx) * (1 - tz) + (arr[i + GX] * (1 - tx) + arr[i + GX + 1] * tx) * tz;
  };
  // pads (flat farm sites)
  for (const pad of pads) {
    pad.y = gridBil(H, pad.x, pad.z);
    const R2 = pad.r * 1.7;
    const i0 = Math.floor((pad.x - R2 - gx0) / G), i1 = Math.ceil((pad.x + R2 - gx0) / G);
    const j0 = Math.floor((pad.z - R2 - gz0) / G), j1 = Math.ceil((pad.z + R2 - gz0) / G);
    for (let iz = Math.max(j0, 0); iz <= Math.min(j1, GZ - 1); iz++) for (let ix = Math.max(i0, 0); ix <= Math.min(i1, GX - 1); ix++) {
      const d = Math.hypot(gx0 + ix * G - pad.x, gz0 + iz * G - pad.z);
      const t = 1 - smoothstep(pad.r, R2, d);
      if (t > 0) { const k = iz * GX + ix; H[k] += (pad.y - H[k]) * t; }
    }
  }

  // ---- queries ----
  function heightAt(x, z) {
    const g = gridBil(H, x, z);
    if (gridBil(D, x, z) > 26) return g;
    track.project2(x, z, q);
    track.params(q.idx, pp);
    const hw = pp.hw, ad = Math.abs(q.d);
    if (ad > hw + SHOULDER_OUT) return g;
    if (ad <= hw + SHOULDER_IN) return roadY(q.s, q.d, pp) + verge(q.s, q.d, hw);
    let y0 = roadY(q.s, q.d < 0 ? -(hw + SHOULDER_IN) : hw + SHOULDER_IN, pp);
    y0 += zq.cut; // roadY subtracted the edge cut; re-applied below at the true position
    field.query(q.s, q.d, zq);
    return y0 + (g - y0) * smoothstep(hw + SHOULDER_IN, hw + SHOULDER_OUT, ad) + verge(q.s, q.d, hw) - zq.cut;
  }
  const E = 0.35;
  function normalAt(x, z, e = E) {
    const hl = heightAt(x - e, z), hr = heightAt(x + e, z), hd = heightAt(x, z - e), hu = heightAt(x, z + e);
    return new THREE.Vector3(hl - hr, 2 * e, hd - hu).normalize();
  }
  /** Returns road-relative info for a world point (fills + returns shared scratch). */
  const info = {};
  function roadInfo(x, z) {
    track.project2(x, z, q); track.params(q.idx, pp);
    info.s = q.s; info.d = q.d; info.hw = pp.hw; info.dist = q.dist;
    info.zone = null; info.w = 0;
    if (Math.abs(q.d) < pp.hw + 0.8) { field.query(q.s, q.d, zq); info.zone = zq.zone; info.w = zq.w; }
    info.ramp = q.s > RAMP.s0 - 1 && q.s < RAMP.s1 && Math.abs(q.d) < RAMP.halfWidth;
    return info;
  }
  return { heightAt, normalAt, roadInfo, roadY, gridBil, H, D, grid: { GX, GZ, G, gx0, gz0 } };
}
