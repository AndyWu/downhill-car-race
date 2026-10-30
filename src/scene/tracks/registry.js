// Placement registry for the network tracks: every static prop footprint is recorded here so that
// (a) decorators can reject a placement that would enter ANY road corridor (union of main + branches), and
// (b) src/scene/tracks-clearance.mjs can verify clearance + grounding independently.
import * as THREE from 'three';

const CELL = 12;

/** spatial hash over every road sample; returns clear(x, z, exclude) = min over roads (except index `exclude`) of dist-to-centreline - half width */
export function makeClear(net) {
  const grid = new Map();
  net.roads.forEach((r, ri) => {
    const T = r.tables;
    for (let i = 0; i < r.TN; i++) {
      const cx = Math.floor(T.px[i] / CELL), cz = Math.floor(T.pz[i] / CELL), k = cx * 73856093 ^ cz * 19349663;
      let a = grid.get(k); if (!a) grid.set(k, a = []);
      a.push(ri, i);
    }
  });
  return (x, z, exclude = -1) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = 99;
    for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) {
      const a = grid.get((cx + gx) * 73856093 ^ (cz + gz) * 19349663); if (!a) continue;
      for (let k = 0; k < a.length; k += 2) {
        if (a[k] === exclude) continue;
        const T = net.roads[a[k]].tables, i = a[k + 1], dx = T.px[i] - x, dz = T.pz[i] - z;
        const d = Math.sqrt(dx * dx + dz * dz) - T.width[i] * 0.5;
        if (d < best) best = d;
      }
    }
    return best;
  };
}

export function createRegistry(net) {
  const clear = makeClear(net);
  const items = [];
  const inPoly = (pts, x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  /** min corridor clearance over the polygon boundary + interior grid (step metres) */
  function polyClear(pts, step = 0.6) {
    let best = 99, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let k = 0; k < n; k++) best = Math.min(best, clear(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n));
      x0 = Math.min(x0, a[0]); x1 = Math.max(x1, a[0]); z0 = Math.min(z0, a[1]); z1 = Math.max(z1, a[1]);
    }
    if (pts.length >= 3) for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) if (inPoly(pts, x, z)) best = Math.min(best, clear(x, z));
    return best;
  }
  const v = new THREE.Vector3();
  /** polygon footprint of a local box (centre lx,lz, half sizes hx,hz) under matrix M */
  function boxPoly(M, lx, lz, hx, hz) {
    return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([a, b]) => { v.set(lx + a, 0, lz + b).applyMatrix4(M); return [v.x, v.z]; });
  }
  const api = {
    items, clear, polyClear, boxPoly,
    /** add a footprint polygon [[x,z]...] whose lowest visible point is baseY; gp = [x,z] ground sample point (default centroid) */
    poly(type, pts, baseY, gp, extra = {}) {
      const g = gp || [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
      items.push({ type, pts, baseY, gp: g, ...extra });
    },
    /** local box under M; baseLocalY is the box bottom in M's local frame */
    box(type, M, lx, lz, hx, hz, baseLocalY = 0, extra = {}) {
      v.set(lx, baseLocalY, lz).applyMatrix4(M); const by = v.y, gp = [v.x, v.z];
      this.poly(type, boxPoly(M, lx, lz, hx, hz), by, gp, extra);
    },
    circle(type, x, z, r, baseY, extra = {}, n = 8) {
      const pts = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
      items.push({ type, pts, baseY, gp: [x, z], ...extra });
    },
    /** true when a candidate polygon keeps `margin` m away from every road corridor */
    fits(pts, margin = 0.35, step = 0.9) { return polyClear(pts, step) >= margin; },
  };
  return api;
}
