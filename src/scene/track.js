// Deterministic downhill road: curvature-integrated polyline -> Catmull-Rom control points ->
// dense arc-length table (1 m) with banked frames, plus a spatial hash for fast projection.
import * as THREE from 'three';
import { mulberry32, Noise, clamp, smoothstep } from './util.js';

export const TRACK_LENGTH = 3218;
export const MIN_GRADE = 0.022; // never flatter than this anywhere on the centreline (coasting cars must keep rolling)
export const T_PRE = 40;   // table starts at s = -T_PRE
export const T_POST = 80;  // table ends at s = L + T_POST

export function buildTrack(seed = 1, L = TRACK_LENGTH) {
  const rng = mulberry32(seed * 7919 + 13);
  const nz = new Noise(seed * 31 + 7);
  const PRE = 60, POST = 102;
  const N = PRE + L + POST; // 3380 -> divisible by 20

  // ---- curvature profile (positive = right turn) ----
  const bends = [];
  const pairBase = [430, 1330, 2250];
  pairBase.forEach((b, i) => {
    const s0 = b + rng() * 160;
    const sign = rng() < 0.5 ? -1 : 1;
    bends.push({ s: s0, k: sign / (40 + rng() * 14), sig: 19 + rng() * 6 });
    bends.push({ s: s0 + 115 + rng() * 80, k: -sign / (42 + rng() * 14), sig: 20 + rng() * 6 });
  });
  bends.push({ s: 1850 + rng() * 120, k: (rng() < 0.5 ? -1 : 1) / 70, sig: 40 });
  bends.push({ s: 2800 + rng() * 100, k: (rng() < 0.5 ? -1 : 1) / 85, sig: 45 });
  const ph1 = rng() * 6.28, ph2 = rng() * 6.28, l1 = 640 + rng() * 140, l2 = 310 + rng() * 80;
  const A1 = 1 / 420, A2 = 1 / 700;
  const kappaS = (s, theta) => {
    let k = A1 * Math.sin((s / l1) * 6.2832 + ph1) + A2 * Math.sin((s / l2) * 6.2832 + ph2);
    for (const b of bends) { const u = (s - b.s) / b.sig; if (Math.abs(u) < 4.5) k += b.k * Math.exp(-0.5 * u * u); }
    return (k - 0.0042 * theta) * smoothstep(0, 70, s) * (1 - smoothstep(L - 20, L + 20, s));
  };

  // ---- grade profile ----
  const flats = [];
  for (let i = 0; i < 5; i++) flats.push({ s: 380 + i * 560 + rng() * 260, len: 80 + rng() * 120 });
  const steeps = [{ s: 700 + rng() * 300, len: 150 }, { s: 2000 + rng() * 400, len: 180 }];
  const bump = (s, c, len) => smoothstep(c - len / 2 - 25, c - len / 2 + 15, s) * (1 - smoothstep(c + len / 2 - 15, c + len / 2 + 25, s));
  const gradeRaw = (s) => {
    if (s < 0) return 0.05;
    if (s > L) return 0.028;
    let g = 0.076 + 0.02 * nz.n1(s / 420) + 0.008 * nz.n1(s / 90 + 40);
    for (const f of flats) g += (0.026 - g) * bump(s, f.s, f.len);
    for (const f of steeps) g += 0.032 * bump(s, f.s, f.len);
    return g;
  };
  let gsum = 0;
  for (let s = 0; s < L; s++) gsum += gradeRaw(s + 0.5);
  const gScale = 0.073 / (gsum / L);

  // ---- integrate at 1 m ----
  const X = new Float64Array(N + 1), Y = new Float64Array(N + 1), Z = new Float64Array(N + 1);
  let th = 0;
  for (let i = 0; i < N; i++) {
    const s = i - PRE;
    th += kappaS(s + 0.5, th);
    X[i + 1] = X[i] + Math.sin(th);
    Z[i + 1] = Z[i] - Math.cos(th);
    const g = Math.max(MIN_GRADE, s >= 0 && s <= L ? gradeRaw(s + 0.5) * gScale : gradeRaw(s + 0.5));
    Y[i + 1] = Y[i] - g;
  }
  // control points every 20 m
  const KP = N / 20 + 1; // 170
  const P = [];
  for (let k = 0; k < KP; k++) P.push([X[k * 20], Y[k * 20], Z[k * 20]]);

  // ---- Catmull-Rom dense polyline (10 subdivisions per segment) ----
  const SUB = 10;
  const cr = (p0, p1, p2, p3, t, out) => {
    const t2 = t * t, t3 = t2 * t;
    for (let c = 0; c < 3; c++)
      out[c] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3);
  };
  const dense = [];
  const tmp = [0, 0, 0];
  for (let k = 0; k < KP - 1; k++) {
    const p0 = P[Math.max(k - 1, 0)], p1 = P[k], p2 = P[k + 1], p3 = P[Math.min(k + 2, KP - 1)];
    for (let m = 0; m < SUB; m++) { cr(p0, p1, p2, p3, m / SUB, tmp); dense.push([tmp[0], tmp[1], tmp[2]]); }
  }
  dense.push(P[KP - 1].slice());
  const cum = new Float64Array(dense.length);
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1], b = dense[i];
    cum[i] = cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  const jS = (PRE / 20) * SUB;               // s = 0
  const jE = jS + (L / 20) * SUB;            // s = L (L/20*10 = 1609)
  const Lmain = cum[Math.round(jE)] - cum[jS];
  const K = L / Lmain; // uniform 3D scale so arc length is exactly L
  for (let i = 0; i < dense.length; i++) { dense[i][0] *= K; dense[i][1] *= K; dense[i][2] *= K; cum[i] *= K; }
  const a0 = cum[jS];
  // anchor so s=0 is near the origin
  const ox = dense[jS][0], oy = dense[jS][1], oz = dense[jS][2];

  // ---- uniform 1 m table ----
  const TN = Math.floor(L + T_PRE + T_POST) + 1;
  const px = new Float32Array(TN), py = new Float32Array(TN), pz = new Float32Array(TN);
  let di = 0;
  for (let i = 0; i < TN; i++) {
    const arc = a0 + (i - T_PRE);
    while (di < dense.length - 2 && cum[di + 1] < arc) di++;
    const seg = cum[di + 1] - cum[di];
    const f = seg > 0 ? clamp((arc - cum[di]) / seg, 0, 1) : 0;
    const A = dense[di], B = dense[di + 1];
    px[i] = A[0] + (B[0] - A[0]) * f - ox;
    py[i] = A[1] + (B[1] - A[1]) * f - oy;
    pz[i] = A[2] + (B[2] - A[2]) * f - oz;
  }
  // tangents / headings
  const tx = new Float32Array(TN), ty = new Float32Array(TN), tz = new Float32Array(TN);
  const head = new Float64Array(TN);
  for (let i = 0; i < TN; i++) {
    const a = Math.max(i - 1, 0), b = Math.min(i + 1, TN - 1);
    let dx = px[b] - px[a], dy = py[b] - py[a], dz = pz[b] - pz[a];
    const l = Math.hypot(dx, dy, dz) || 1;
    tx[i] = dx / l; ty[i] = dy / l; tz[i] = dz / l;
    head[i] = Math.atan2(tx[i], -tz[i]);
  }
  for (let i = 1; i < TN; i++) { // unwrap
    while (head[i] - head[i - 1] > Math.PI) head[i] -= 2 * Math.PI;
    while (head[i] - head[i - 1] < -Math.PI) head[i] += 2 * Math.PI;
  }
  // signed curvature (+ right), smoothed
  const kap = new Float64Array(TN);
  for (let i = 0; i < TN; i++) { const a = Math.max(i - 4, 0), b = Math.min(i + 4, TN - 1); kap[i] = (head[b] - head[a]) / (b - a); }
  const kapS = new Float64Array(TN);
  for (let i = 0; i < TN; i++) { let s = 0, n = 0; for (let j = Math.max(0, i - 12); j <= Math.min(TN - 1, i + 12); j++) { s += kap[j]; n++; } kapS[i] = s / n; }
  const camber = new Float32Array(TN), width = new Float32Array(TN);
  const rx = new Float32Array(TN), ry = new Float32Array(TN), rz = new Float32Array(TN);
  const ux = new Float32Array(TN), uy = new Float32Array(TN), uz = new Float32Array(TN);
  const rhx = new Float32Array(TN), rhz = new Float32Array(TN), hl = new Float32Array(TN);
  for (let i = 0; i < TN; i++) {
    const s = i - T_PRE;
    const c = clamp(kapS[i] * 5.0, -0.085, 0.085) * smoothstep(-5, 15, s);
    camber[i] = c;
    width[i] = clamp(6.8 + 0.55 * nz.n1(s / 70 + 11) + 0.9 * Math.min(1, Math.abs(kapS[i]) / 0.018), 6.2, 8.0);
    // horizontal right and banked frame
    const hlen = Math.hypot(tx[i], tz[i]) || 1;
    const Rx = -tz[i] / hlen, Rz = tx[i] / hlen; // R0 = T x Y normalised
    rhx[i] = Rx; rhz[i] = Rz; hl[i] = hlen;
    // U0 = R0 x T
    const U0x = 0 * tz[i] - Rz * ty[i], U0y = Rz * tx[i] - Rx * tz[i], U0z = Rx * ty[i] - 0 * tx[i];
    const cs = Math.cos(c), sn = Math.sin(c);
    rx[i] = Rx * cs - U0x * sn; ry[i] = -U0y * sn; rz[i] = Rz * cs - U0z * sn;
    ux[i] = U0x * cs + Rx * sn; uy[i] = U0y * cs; uz[i] = U0z * cs + Rz * sn;
  }

  // ---- spatial hash over even samples ----
  const HC = 16;
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < TN; i++) { minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]); minZ = Math.min(minZ, pz[i]); maxZ = Math.max(maxZ, pz[i]); }
  const hx0 = minX - 8, hz0 = minZ - 8;
  const hcx = Math.ceil((maxX - hx0 + 8) / HC) + 1, hcz = Math.ceil((maxZ - hz0 + 8) / HC) + 1;
  const counts = new Int32Array(hcx * hcz + 1);
  const cellOf = (i) => Math.floor((pz[i] - hz0) / HC) * hcx + Math.floor((px[i] - hx0) / HC);
  for (let i = 0; i < TN; i += 2) counts[cellOf(i) + 1]++;
  for (let i = 0; i < counts.length - 1; i++) counts[i + 1] += counts[i];
  const entries = new Int32Array(Math.ceil(TN / 2));
  const fillp = counts.slice();
  for (let i = 0; i < TN; i += 2) entries[fillp[cellOf(i)]++] = i;

  const RMAX = 26;
  /** Fills o with {s,d,dist,idx(float table idx)}; horizontal-plane projection. */
  function project2(x, z, o) {
    const cx = Math.floor((x - hx0) / HC), cz = Math.floor((z - hz0) / HC);
    let best = -1, bd = 1e18;
    const scanCell = (gx, gz) => {
      if (gx < 0 || gz < 0 || gx >= hcx || gz >= hcz) return;
      const c = gz * hcx + gx;
      for (let e = counts[c]; e < counts[c + 1]; e++) {
        const i = entries[e], dx = px[i] - x, dz = pz[i] - z, d2 = dx * dx + dz * dz;
        if (d2 < bd) { bd = d2; best = i; }
      }
    };
    for (let r = 0; r <= RMAX; r++) {
      if (r === 0) scanCell(cx, cz);
      else {
        for (let g = -r; g <= r; g++) { scanCell(cx + g, cz - r); scanCell(cx + g, cz + r); }
        for (let g = -r + 1; g <= r - 1; g++) { scanCell(cx - r, cz + g); scanCell(cx + r, cz + g); }
      }
      if (best >= 0 && bd <= r * HC * (r * HC)) break;
    }
    if (best < 0) { for (let i = 0; i < TN; i += 2) { const dx = px[i] - x, dz = pz[i] - z, d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = i; } } }
    let j = best, jd = 1e18;
    for (let i = Math.max(0, best - 2); i <= Math.min(TN - 1, best + 2); i++) {
      const dx = px[i] - x, dz = pz[i] - z, d2 = dx * dx + dz * dz;
      if (d2 < jd) { jd = d2; j = i; }
    }
    const dx = x - px[j], dz = z - pz[j];
    const ux_ = tx[j] / hl[j], uz_ = tz[j] / hl[j];
    const along = dx * ux_ + dz * uz_;
    const shift = clamp(along / hl[j], -1, 1);
    o.idx = clamp(j + shift, 0, TN - 1.0001);
    o.s = o.idx - T_PRE;
    o.d = dx * rhx[j] + dz * rhz[j];
    o.dist = Math.sqrt(jd);
    return o;
  }

  /** Interpolated per-s parameters into o. */
  function params(idx, o) {
    const i0 = Math.floor(idx), f = idx - i0, i1 = Math.min(i0 + 1, TN - 1);
    o.px = px[i0] + (px[i1] - px[i0]) * f;
    o.py = py[i0] + (py[i1] - py[i0]) * f;
    o.pz = pz[i0] + (pz[i1] - pz[i0]) * f;
    o.rhx = rhx[i0] + (rhx[i1] - rhx[i0]) * f;
    o.rhz = rhz[i0] + (rhz[i1] - rhz[i0]) * f;
    const rl = Math.hypot(o.rhx, o.rhz) || 1; o.rhx /= rl; o.rhz /= rl;
    o.hw = (width[i0] + (width[i1] - width[i0]) * f) * 0.5;
    o.camber = camber[i0] + (camber[i1] - camber[i0]) * f;
    return o;
  }
  const atS = (s, o) => params(clamp(s + T_PRE, 0, TN - 1.0001), o);

  function sampleAt(s) {
    // extrapolate straight beyond the table
    const idx = s + T_PRE;
    const ci = clamp(idx, 0, TN - 1.0001);
    const i0 = Math.floor(ci), f = ci - i0, i1 = i0 + 1;
    const lerpA = (a) => a[i0] + (a[i1] - a[i0]) * f;
    const T = new THREE.Vector3(lerpA(tx), lerpA(ty), lerpA(tz)).normalize();
    const R = new THREE.Vector3(lerpA(rx), lerpA(ry), lerpA(rz)).normalize();
    const U = new THREE.Vector3(lerpA(ux), lerpA(uy), lerpA(uz)).normalize();
    const pos = new THREE.Vector3(lerpA(px), lerpA(py), lerpA(pz));
    if (idx !== ci) pos.addScaledVector(T, idx - ci);
    return { position: pos, tangent: T, right: R, up: U, width: lerpA(width), camber: lerpA(camber) };
  }
  function project(pos) {
    const o = project2(pos.x, pos.z, {});
    return { s: o.s, lateral: o.d };
  }

  let drop = py[T_PRE] - py[T_PRE + L];
  return {
    length: L, sampleAt, project, project2, params, atS, drop,
    tables: { px, py, pz, tx, ty, tz, width, camber, rhx, rhz, kap: kapS, TN },
    bounds: { minX, maxX, minZ, maxZ },
    bends,
  };
}
