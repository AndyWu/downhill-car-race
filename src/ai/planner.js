// Planner: lateral-offset line vs s (hazard/surface-aware DP + optional minimum-curvature relaxation)
// and a target speed profile vs s (grip-limited, backward/forward passes).
const G = 9.81;
const SLOT = 0.5;      // lateral grid spacing (m)
const DS = 2;          // sample spacing along s (m)
const CAR_HALF = 0.5;  // clearance assumed for car half-width
const BIG = 1e4;

export function buildPlan(world, P, rng) {
  const track = world.track;
  const L = track.length || 3218;
  const n = Math.floor(L / DS) + 1;
  const cx = new Float64Array(n), cz = new Float64Array(n), rx = new Float64Array(n), rz = new Float64Array(n);
  const wd = new Float64Array(n), slope = new Float64Array(n);
  let maxW = 0;
  for (let i = 0; i < n; i++) {
    const sp = track.sampleAt(Math.min(i * DS, L));
    cx[i] = sp.position.x; cz[i] = sp.position.z; rx[i] = sp.right.x; rz[i] = sp.right.z;
    wd[i] = sp.width; slope[i] = sp.tangent.y;
    if (sp.width > maxW) maxW = sp.width;
  }
  const J = Math.min(16, Math.ceil(maxW / 2 / SLOT));
  const K = 2 * J + 1;

  // --- perception: which hazards does this driver know about, and how much does he care ---
  const hz = [];
  for (const h of world.hazards || []) {
    const u = rng(); // always consumed -> deterministic stream
    const pd = P.perception.detect[h.type] ?? P.perception.detect.default ?? 1;
    let seen = u < pd;
    if (h.type === 'rock' && (h.halfWidth ?? h.radius) < (P.perception.minRockRadius || 0)) seen = false;
    const W = P.hazardWeight[h.type] ?? P.hazardWeight.default ?? 0;
    if (!seen || W <= 0) continue;
    // real hazards are ellipses (halfLength along s, halfWidth across); mock/simple ones are circles
    const ra = (h.halfLength ?? h.radius) + CAR_HALF, rb = (h.halfWidth ?? h.radius) + CAR_HALF;
    hz.push({ s: h.s, lat: h.lateral, ra, rb, rm: Math.min(ra, rb), W });
  }
  const stretch = P.hazardStretch, margin = P.hazardMargin;
  const surfW = P.surfaceWeight;
  const useSurf = Object.keys(surfW).length > 0;

  // --- cost grid (hazard + surface + road-edge constraint) ---
  const hc = new Float32Array(n * K);
  const surfFric = new Float32Array(n * K).fill(1);
  const edge = P.line.edge;
  for (let i = 0; i < n; i++) {
    const s = i * DS;
    const near = hz.filter((h) => Math.abs(h.s - s) < (h.ra + margin) * stretch);
    for (let j = 0; j < K; j++) {
      const lat = (j - J) * SLOT;
      if (Math.abs(lat) > wd[i] / 2 - edge && j !== J) { hc[i * K + j] = BIG; continue; }
      let c = 0;
      for (const h of near) {
        const ds_ = (s - h.s) / stretch, dl = lat - h.lat;
        const ra = h.ra, rb = h.rb;
        const e2 = (ds_ / ra) ** 2 + (dl / rb) ** 2, ee = Math.sqrt(e2);
        if (ee < 1) c += h.W * (3 + (1 - ee) * h.rm);
        else {
          const g = Math.hypot(ds_ / (ra * ra), dl / (rb * rb));
          const d = ((ee - 1) * ee) / Math.max(1e-6, g); // first-order distance to the ellipse edge
          if (d < margin) { const t = 1 - d / margin; c += h.W * t * t; }
        }
      }
      if (useSurf || P.speed.useSurface) {
        const su = world.surfaceAt(cx[i] + lat * rx[i], cz[i] + lat * rz[i]);
        if (useSurf) c += surfW[su.type] ?? 0;
        surfFric[i * K + j] = su.friction ?? 1;
      }
      hc[i * K + j] = c;
    }
  }

  // --- DP over lateral slots ---
  const pull = P.line.pull, stepCost = 0.15, m = P.line.maxStep;
  const dp = new Float64Array(n * K), bk = new Int16Array(n * K);
  for (let j = 0; j < K; j++) dp[j] = hc[j] + pull * Math.abs(j - J) * SLOT;
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < K; j++) {
      let best = Infinity, bj = j;
      for (let jj = Math.max(0, j - m); jj <= Math.min(K - 1, j + m); jj++) {
        const c = dp[(i - 1) * K + jj] + stepCost * Math.abs(j - jj);
        if (c < best) { best = c; bj = jj; }
      }
      dp[i * K + j] = best + hc[i * K + j] + pull * Math.abs(j - J) * SLOT;
      bk[i * K + j] = bj;
    }
  }
  let bj = 0, bc = Infinity;
  for (let j = 0; j < K; j++) if (dp[(n - 1) * K + j] < bc) { bc = dp[(n - 1) * K + j]; bj = j; }
  const slot = new Int16Array(n);
  for (let i = n - 1; i >= 0; i--) { slot[i] = bj; bj = bk[i * K + bj]; }
  const e = new Float64Array(n);
  for (let i = 0; i < n; i++) e[i] = (slot[i] - J) * SLOT;

  // --- de-quantise the DP path (non-racing drivers: a few smoothing passes, bounded by the road edge) ---
  if (P.line.mode !== 'racing') {
    const tmp = new Float64Array(n);
    for (let pass = 0; pass < (P.line.smooth ?? 6); pass++) {
      for (let i = 1; i < n - 1; i++) tmp[i] = 0.25 * e[i - 1] + 0.5 * e[i] + 0.25 * e[i + 1];
      for (let i = 1; i < n - 1; i++) e[i] = tmp[i];
    }
  }
  // --- minimum-curvature relaxation inside the free corridor ---
  const px = new Float64Array(n), pz = new Float64Array(n);
  for (let i = 0; i < n; i++) { px[i] = cx[i] + e[i] * rx[i]; pz[i] = cz[i] + e[i] * rz[i]; }
  if (P.line.mode === 'racing' && P.line.relaxIters > 0) {
    const lo = new Float64Array(n), hi = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const base = hc[i * K + slot[i]] + P.line.corridorTol;
      let a = slot[i], b = slot[i];
      while (a > 0 && hc[i * K + a - 1] <= base) a--;
      while (b < K - 1 && hc[i * K + b + 1] <= base) b++;
      lo[i] = (a - J) * SLOT; hi[i] = (b - J) * SLOT;
    }
    for (let it = 0; it < P.line.relaxIters; it++) {
      for (let i = 1; i < n - 1; i++) {
        const mx = 0.5 * (px[i - 1] + px[i + 1]), mz = 0.5 * (pz[i - 1] + pz[i + 1]);
        const t = (mx - cx[i]) * rx[i] + (mz - cz[i]) * rz[i];
        e[i] = Math.min(hi[i], Math.max(lo[i], e[i] + 0.9 * (t - e[i])));
        px[i] = cx[i] + e[i] * rx[i]; pz[i] = cz[i] + e[i] * rz[i];
      }
    }
  }

  // --- curvature of the planned path & speed profile ---
  const kap = new Float64Array(n);
  for (let i = 0; i < n; i++) { px[i] = cx[i] + e[i] * rx[i]; pz[i] = cz[i] + e[i] * rz[i]; }
  for (let i = 2; i < n - 2; i++) { // 4 m baseline: robust against sample noise
    const ax = px[i] - px[i - 2], az = pz[i] - pz[i - 2], bx = px[i + 2] - px[i], bz = pz[i + 2] - pz[i];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), lc = Math.hypot(ax + bx, az + bz);
    kap[i] = (2 * Math.abs(ax * bz - az * bx)) / Math.max(1e-6, la * lb * lc);
  }
  const kS = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let mx = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) mx = Math.max(mx, kap[k]);
    kS[i] = mx;
  }
  const S = P.speed;
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const fr = S.useSurface ? surfFric[i * K + slot[i]] : 1;
    v[i] = Math.min(S.cap, Math.sqrt((S.mu * Math.min(1, fr) * G) / Math.max(1e-5, kS[i])) * S.cornerFactor);
  }
  for (let i = n - 2; i >= 0; i--) { // backward: be able to brake in time
    const d = Math.hypot(px[i + 1] - px[i], pz[i + 1] - pz[i]);
    v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * S.brakeDecel * d));
  }
  if (S.forward) { // forward: cannot exceed what gravity+paddling can reach
    for (let i = 1; i < n; i++) {
      const d = Math.hypot(px[i] - px[i - 1], pz[i] - pz[i - 1]);
      v[i] = Math.min(v[i], Math.sqrt(v[i - 1] * v[i - 1] + 2 * (2.5 + G * Math.max(0, -slope[i])) * d));
    }
    v[0] = Math.max(v[0], 4);
  }

  const idx = (s) => {
    const f = Math.min(n - 1.001, Math.max(0, s / DS));
    const i = Math.floor(f);
    return [i, f - i];
  };
  const lerpA = (a, s) => { const [i, t] = idx(s); return a[i] + (a[i + 1] - a[i]) * t; };
  return {
    n, ds: DS, length: L, K, J, slot: SLOT, e, px, pz, rx, rz, v, slope, hazards: hz,
    offsetAt: (s) => lerpA(e, s),
    xAt: (s) => lerpA(px, s), zAt: (s) => lerpA(pz, s),
    rightAt: (s) => [lerpA(rx, s), lerpA(rz, s)],
    speedAt: (s) => lerpA(v, s),
    slopeAt: (s) => lerpA(slope, s),
    widthAt: (s) => lerpA(wd, s),
    costAt: (s, lat) => {
      const i = Math.min(n - 1, Math.max(0, Math.round(s / DS)));
      const j = Math.min(K - 1, Math.max(0, Math.round(lat / SLOT) + J));
      return hc[i * K + j];
    },
  };
}
