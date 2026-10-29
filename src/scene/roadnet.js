// Generic road + road-network builder used by the village / corn / circuit tracks.
// (The country road keeps its own track.js so it stays exactly as it was.)
import * as THREE from 'three';
import { clamp, smoothstep } from './util.js';

const SUB = 12;
function cr(p0, p1, p2, p3, t, out) {
  const t2 = t * t, t3 = t2 * t;
  for (let c = 0; c < 2; c++)
    out[c] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3);
}

/**
 * pts: [[x,z],...] control points of the centreline.
 * open roads: pre/post metres of extension before s=0 / after s=length (table covers [-pre, length+post]);
 * lengthTarget: race length (open) or loop length (closed) - the polyline is uniformly scaled to match.
 * yFn(s) -> height at local s;  widthFn(s, kap) -> width;  camberFn(s, kap) -> camber (rad) optional.
 */
export function makeRoad(spec) {
  const { closed = false, lengthTarget, pre = 0, post = 0, yFn, widthFn, camberFn, camberGain = 5, camberCap = 0.085, name = '', id = 0 } = spec;
  let P = spec.pts.map((p) => [p[0], p[1]]);
  const n = P.length, segs = closed ? n : n - 1;
  const at = (i) => (closed ? P[((i % n) + n) % n] : i < 0 ? (spec.phantomStart || P[0]) : i >= n ? (spec.phantomEnd || P[n - 1]) : P[i]);
  const buildDense = () => {
    const d = [], tmp = [0, 0];
    for (let k = 0; k < segs; k++) for (let m = 0; m < SUB; m++) { cr(at(k - 1), at(k), at(k + 1), at(k + 2), m / SUB, tmp); d.push([tmp[0], tmp[1]]); }
    d.push(closed ? d[0].slice() : P[n - 1].slice());
    const cum = new Float64Array(d.length);
    for (let i = 1; i < d.length; i++) cum[i] = cum[i - 1] + Math.hypot(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1]);
    return { d, cum };
  };
  let { d: dense, cum } = buildDense();
  const A = cum[cum.length - 1];
  const k = spec.noScale ? 1 : closed ? lengthTarget / A : (lengthTarget + pre + post) / A;
  P = P.map((p) => [p[0] * k, p[1] * k]);
  ({ d: dense, cum } = buildDense());
  const total = cum[cum.length - 1];
  const ox = dense[0][0], oz = dense[0][1];

  // ---- uniform table ----
  const ds = closed ? total / Math.round(total) : 1;
  const TN = closed ? Math.round(total) : Math.floor(total) + 1;
  const px = new Float32Array(TN), py = new Float32Array(TN), pz = new Float32Array(TN);
  let di = 0;
  for (let i = 0; i < TN; i++) {
    const arc = i * ds;
    while (di < dense.length - 2 && cum[di + 1] < arc) di++;
    const seg = cum[di + 1] - cum[di], f = seg > 0 ? clamp((arc - cum[di]) / seg, 0, 1) : 0;
    const a = dense[di], b = dense[di + 1];
    px[i] = a[0] + (b[0] - a[0]) * f; pz[i] = a[1] + (b[1] - a[1]) * f;
  }
  const sOf = (i) => i * ds - pre;
  for (let i = 0; i < TN; i++) py[i] = yFn(sOf(i), px[i], pz[i], total);
  const wrap = (i) => (closed ? ((i % TN) + TN) % TN : clamp(i, 0, TN - 1));
  const tx = new Float32Array(TN), ty = new Float32Array(TN), tz = new Float32Array(TN), head = new Float64Array(TN);
  for (let i = 0; i < TN; i++) {
    const a = wrap(i - 1), b = wrap(i + 1);
    const dx = px[b] - px[a], dy = py[b] - py[a], dz = pz[b] - pz[a], l = Math.hypot(dx, dy, dz) || 1;
    tx[i] = dx / l; ty[i] = dy / l; tz[i] = dz / l;
    head[i] = Math.atan2(tx[i], -tz[i]);
  }
  // unwrap headings (closed: also remove the total 2*pi so differences stay small)
  const dh = (a, b) => { let d = head[b] - head[a]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const kap = new Float64Array(TN), kapS = new Float64Array(TN);
  for (let i = 0; i < TN; i++) { const a = wrap(i - 4), b = wrap(i + 4); kap[i] = dh(a, b) / (8 * ds); }
  for (let i = 0; i < TN; i++) { let s = 0, c = 0; for (let j = -12; j <= 12; j++) { const w = wrap(i + j); if (!closed && (i + j < 0 || i + j >= TN)) continue; s += kap[w]; c++; } kapS[i] = s / c; }
  const camber = new Float32Array(TN), width = new Float32Array(TN);
  const rx = new Float32Array(TN), ry = new Float32Array(TN), rz = new Float32Array(TN), ux = new Float32Array(TN), uy = new Float32Array(TN), uz = new Float32Array(TN);
  const rhx = new Float32Array(TN), rhz = new Float32Array(TN), hl = new Float32Array(TN);
  for (let i = 0; i < TN; i++) {
    const s = sOf(i);
    const c = camberFn ? camberFn(s, kapS[i]) : clamp(kapS[i] * camberGain, -camberCap, camberCap) * smoothstep(-5, 15, s);
    camber[i] = c; width[i] = widthFn(s, kapS[i], total);
    const hlen = Math.hypot(tx[i], tz[i]) || 1, Rx = -tz[i] / hlen, Rz = tx[i] / hlen;
    rhx[i] = Rx; rhz[i] = Rz; hl[i] = hlen;
    const U0x = -Rz * ty[i], U0y = Rz * tx[i] - Rx * tz[i], U0z = Rx * ty[i];
    const cs = Math.cos(c), sn = Math.sin(c);
    rx[i] = Rx * cs - U0x * sn; ry[i] = -U0y * sn; rz[i] = Rz * cs - U0z * sn;
    ux[i] = U0x * cs + Rx * sn; uy[i] = U0y * cs; uz[i] = U0z * cs + Rz * sn;
  }
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < TN; i++) { minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]); minZ = Math.min(minZ, pz[i]); maxZ = Math.max(maxZ, pz[i]); }

  const road = {
    id, name, closed, TN, ds, pre, post, length: closed ? total : (spec.noScale ? total : lengthTarget), loop: closed ? total : 0,
    tables: { px, py, pz, tx, ty, tz, width, camber, rhx, rhz, hl, kap: kapS, TN },
    bounds: { minX, maxX, minZ, maxZ }, field: null, map: null,
  };
  /** interpolated per-index parameters into o (idx = float table index) */
  road.params = (idx, o) => {
    let i0 = Math.floor(idx); const f = idx - i0;
    i0 = wrap(i0); const i1 = wrap(i0 + 1);
    o.px = px[i0] + (px[i1] - px[i0]) * f; o.py = py[i0] + (py[i1] - py[i0]) * f; o.pz = pz[i0] + (pz[i1] - pz[i0]) * f;
    o.rhx = rhx[i0] + (rhx[i1] - rhx[i0]) * f; o.rhz = rhz[i0] + (rhz[i1] - rhz[i0]) * f;
    const rl = Math.hypot(o.rhx, o.rhz) || 1; o.rhx /= rl; o.rhz /= rl;
    o.hw = (width[i0] + (width[i1] - width[i0]) * f) * 0.5; o.camber = camber[i0] + (camber[i1] - camber[i0]) * f;
    o.kap = kapS[i0];
    return o;
  };
  road.idxOf = (s) => {
    if (closed) { const m = ((s % total) + total) % total; return (m + pre) / ds; }
    return clamp((s + pre) / ds, 0, TN - 1.0001);
  };
  road.atS = (s, o) => road.params(road.idxOf(s), o);
  road.sampleAt = (s) => {
    let idx = (s + pre) / ds, extra = 0;
    if (closed) idx = (((s % total) + total) % total + pre) / ds;
    else { const ci = clamp(idx, 0, TN - 1.0001); extra = (idx - ci) * ds; idx = ci; }
    let i0 = Math.floor(idx); const f = idx - i0; i0 = wrap(i0); const i1 = wrap(i0 + 1);
    const L = (a) => a[i0] + (a[i1] - a[i0]) * f;
    const T = new THREE.Vector3(L(tx), L(ty), L(tz)).normalize();
    const pos = new THREE.Vector3(L(px), L(py), L(pz));
    if (extra) pos.addScaledVector(T, extra);
    return { position: pos, tangent: T, right: new THREE.Vector3(L(rx), L(ry), L(rz)).normalize(), up: new THREE.Vector3(L(ux), L(uy), L(uz)).normalize(), width: L(width), camber: L(camber) };
  };
  return road;
}

/**
 * main + branches. Each branch = { road, splitId, pathIndex, fromS, toS, name, note }; its race progress
 * is mapped linearly onto [fromS,toS] of the main road, so every route rejoins at the same s.
 */
export function buildNetwork({ main, branches = [], length, lapLength }) {
  const roads = [main];
  for (const b of branches) { b.road.map = { fromS: b.fromS, toS: b.toS, len: b.road.length, splitId: b.splitId, pathIndex: b.pathIndex }; roads.push(b.road); }
  const closed = main.closed;
  lapLength = lapLength || length;

  // ---- shared spatial hash over every other sample of every road ----
  const HC = 16;
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const r of roads) { minX = Math.min(minX, r.bounds.minX); maxX = Math.max(maxX, r.bounds.maxX); minZ = Math.min(minZ, r.bounds.minZ); maxZ = Math.max(maxZ, r.bounds.maxZ); }
  const hx0 = minX - 8, hz0 = minZ - 8, hcx = Math.ceil((maxX - hx0 + 8) / HC) + 1, hcz = Math.ceil((maxZ - hz0 + 8) / HC) + 1;
  const counts = new Int32Array(hcx * hcz + 1);
  const cellOf = (r, i) => Math.floor((r.tables.pz[i] - hz0) / HC) * hcx + Math.floor((r.tables.px[i] - hx0) / HC);
  roads.forEach((r) => { for (let i = 0; i < r.TN; i += 2) counts[cellOf(r, i) + 1]++; });
  for (let i = 0; i < counts.length - 1; i++) counts[i + 1] += counts[i];
  const total = counts[counts.length - 1];
  const entRoad = new Int32Array(total), entIdx = new Int32Array(total), fillp = counts.slice();
  roads.forEach((r, ri) => { for (let i = 0; i < r.TN; i += 2) { const c = cellOf(r, i), e = fillp[c]++; entRoad[e] = ri; entIdx[e] = i; } });
  const RMAX = 26;

  function project2(x, z, o) {
    const cx = Math.floor((x - hx0) / HC), cz = Math.floor((z - hz0) / HC);
    let best = -1, bestRoad = 0, bs = 1e18, bdist = 1e18;
    const scan = (gx, gz) => {
      if (gx < 0 || gz < 0 || gx >= hcx || gz >= hcz) return;
      const c = gz * hcx + gx;
      for (let e = counts[c]; e < counts[c + 1]; e++) {
        const r = roads[entRoad[e]], i = entIdx[e], dx = r.tables.px[i] - x, dz = r.tables.pz[i] - z, dist = Math.sqrt(dx * dx + dz * dz);
        const hwS = r.tables.width[i] * 0.5, sc = dist < hwS ? dist - 100 : dist - hwS;   // inside a road surface: closest centreline wins; else nearest edge
        if (sc < bs - 1e-6 || (Math.abs(sc - bs) <= 1e-6 && dist < bdist)) { bs = sc; bdist = dist; best = i; bestRoad = entRoad[e]; }
      }
    };
    for (let r = 0; r <= RMAX; r++) {
      if (r === 0) scan(cx, cz);
      else {
        for (let g = -r; g <= r; g++) { scan(cx + g, cz - r); scan(cx + g, cz + r); }
        for (let g = -r + 1; g <= r - 1; g++) { scan(cx - r, cz + g); scan(cx + r, cz + g); }
      }
      if (best >= 0 && bdist <= r * HC && bs <= r * HC - 8) break;
    }
    if (best < 0) {
      roads.forEach((rd, ri) => { for (let i = 0; i < rd.TN; i += 2) { const dx = rd.tables.px[i] - x, dz = rd.tables.pz[i] - z, dist = Math.hypot(dx, dz); if (dist < bdist) { bdist = dist; best = i; bestRoad = ri; } } });
    }
    const rd = roads[bestRoad], T = rd.tables, TN = rd.TN, closedR = rd.closed;
    const w = (i) => (closedR ? ((i % TN) + TN) % TN : clamp(i, 0, TN - 1));
    let j = best, jd = 1e18;
    for (let i = best - 2; i <= best + 2; i++) { const ii = w(i), dx = T.px[ii] - x, dz = T.pz[ii] - z, d2 = dx * dx + dz * dz; if (d2 < jd) { jd = d2; j = ii; } }
    const dx = x - T.px[j], dz = z - T.pz[j], ux = T.tx[j] / T.hl[j], uz = T.tz[j] / T.hl[j];
    const along = dx * ux + dz * uz, shift = clamp(along / T.hl[j], -1, 1) / 1;
    let idx = j + shift;
    if (!closedR) idx = clamp(idx, 0, TN - 1.0001);
    o.road = rd; o.roadIndex = bestRoad; o.idx = closedR ? ((idx % TN) + TN) % TN : idx;
    o.s = o.idx * rd.ds - rd.pre;
    o.d = dx * T.rhx[j] + dz * T.rhz[j];
    o.dist = Math.sqrt(jd);
    return o;
  }
  const mainParams = (idx, o, road) => (road || main).params(idx, o);
  const atS = (s, o) => main.atS(s, o);

  function sampleAt(s, choice) {
    if (closed) return main.sampleAt(s);
    if (choice) for (const b of branches) {
      const k = choice[b.splitId];
      if (k !== undefined && k === b.pathIndex && s >= b.fromS && s <= b.toS) {
        const u = (s - b.fromS) / (b.toS - b.fromS);
        return b.road.sampleAt(u * b.road.length);
      }
    }
    return main.sampleAt(s);
  }
  const _o = {};
  function project(pos, hintS) {
    project2(pos.x, pos.z, _o);
    const rd = _o.road;
    if (rd.map) {
      const u = clamp(_o.s / rd.map.len, 0, 1);
      return { s: rd.map.fromS + u * (rd.map.toS - rd.map.fromS), lateral: _o.d, splitId: rd.map.splitId, pathIndex: rd.map.pathIndex };
    }
    let s = _o.s;
    if (closed) {
      const lap = main.loop;
      if (hintS === undefined) s = s > lap * 0.9 ? s - lap : s;
      else s += Math.round((hintS - s) / lap) * lap;
    }
    const out = { s, lateral: _o.d };
    for (const b of branches) if (s >= b.fromS && s <= b.toS) { out.splitId = b.splitId; out.pathIndex = 0; break; }
    return out;
  }
  return {
    roads, main, branches, closed, length, lapLength, project2, params: mainParams, atS, sampleAt, project,
    tables: main.tables, bounds: { minX, maxX, minZ, maxZ }, bends: [], drop: main.tables.py[0] - main.tables.py[main.TN - 1],
  };
}
