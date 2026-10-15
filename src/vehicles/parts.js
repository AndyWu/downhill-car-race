// Shared truck components: wheels, steering wheels, pedals/paddles, levers, headlight rig, flag pole, seats, driver.
import * as THREE from 'three';
import { vnoise } from './kit.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ wheels
// Wheel local frame: axle along X, rolling about X, centre at origin.
function tyre(c, R, t, W, col, knobs) {
  c.tor(R - t, t, [0, 0, 0], { s: [1, 1, W / (2 * t)], r: [0, Math.PI / 2, 0], c: col, seg: 24, rseg: 7, v: 0.08 });
  if (!knobs) return;
  const n = knobs.n || 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    for (const sx of [-1, 1]) {
      c.box([W * 0.42, t * 0.55, knobs.d || 0.03], [sx * W * 0.24, Math.cos(a) * (R - t * 0.1), Math.sin(a) * (R - t * 0.1)],
        { r: [a, 0, sx * 0.25 * (i % 2 ? 1 : -1)], c: col, v: 0.12 });
    }
  }
}

function bolts(c, n, rad, x, col, size = 0.012) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.3;
    c.cyl(size, size * 1.2, [x, Math.cos(a) * rad, Math.sin(a) * rad], { axis: 'x', seg: 6, c: col });
  }
}

export function buildWheelGeometry(kit, o) {
  const { type, R, W } = o;
  const c = kit.piece(false);
  c.mud = 'radial'; c.mudR = R;
  const tyreCol = o.tyre ?? 0x1e1e1e, rim = o.rim ?? 0x4a78a8, metal = 0xa3a39c;
  if (type === 'mower') {
    const t = Math.min(W * 0.5, R * 0.34);
    tyre(c, R, t, W, tyreCol, { n: 16, d: 0.028 });
    c.cyl(R - t * 1.6, W * 0.55, [0, 0, 0], { axis: 'x', seg: 20, c: rim });
    c.cyl(R - t * 1.6, W * 0.15, [W * 0.3, 0, 0], { axis: 'x', seg: 20, c: rim, r2: R - t * 1.9 });
    for (let i = 0; i < 5; i++) { // stamped ribs between hub and rim
      const a = (i / 5) * TAU;
      c.bar([W * 0.3, Math.cos(a) * R * 0.18, Math.sin(a) * R * 0.18], [W * 0.3, Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62], 0.02, 0.012, { c: rim, v: 0.1 });
    }
    c.cyl(R * 0.2, W * 0.9, [0, 0, 0], { axis: 'x', seg: 10, c: 0x8a8a84 });
    c.cyl(R * 0.1, W * 0.5, [W * 0.4, 0, 0], { axis: 'x', seg: 6, c: 0x6a6a64 });
  } else if (type === 'cart') {
    const t = Math.min(W * 0.5, R * 0.4);
    tyre(c, R, t, W, tyreCol, o.knobs ? { n: 20, d: 0.03 } : null);
    c.cyl(R - t * 1.5, W * 0.7, [0, 0, 0], { axis: 'x', seg: 22, c: rim });
    c.tor(R - t * 1.6, 0.012, [W * 0.35, 0, 0], { r: [0, Math.PI / 2, 0], c: metal, seg: 22 });
    c.cyl(R * 0.3, W * 0.95, [0, 0, 0], { axis: 'x', seg: 14, c: 0x9a9a92, r2: R * 0.26 });
    bolts(c, 6, R * 0.5, W * 0.36, 0x555048, 0.014);
    bolts(c, 5, R * 0.17, W * 0.5, 0x333, 0.011);
  } else if (type === 'bike') {
    const t = Math.min(W * 0.5, 0.022);
    tyre(c, R, t, W, tyreCol, o.knobs ? { n: 36, d: 0.012 } : null);
    const rr = R - t * 2 - 0.004;
    c.tor(rr, 0.007, [0, 0, 0], { r: [0, Math.PI / 2, 0], c: 0xc4c4be, seg: 36, rseg: 4 });
    c.cyl(0.026, W * 1.3, [0, 0, 0], { axis: 'x', seg: 8, c: 0xb8b8b0 });
    for (const sx of [-1, 1]) c.cyl(0.04, 0.008, [sx * W * 0.5, 0, 0], { axis: 'x', seg: 8, c: 0xb8b8b0 });
    const n = o.spokes || 24;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, side = i % 2 ? 1 : -1;
      c.rod([side * 0.016, Math.cos(a + (i % 4 < 2 ? 0.1 : -0.1)) * 0.03, Math.sin(a + (i % 4 < 2 ? 0.1 : -0.1)) * 0.03],
        [0, Math.cos(a) * rr, Math.sin(a) * rr], 0.0028, { seg: 3, c: 0xd0d0cc, v: 0.1 });
    }
  } else if (type === 'wood') {
    const iron = 0x3a3733;
    const rim = R - 0.016, rf = R - 0.045; // felloe ring centre
    const n = 10, chord = 2 * rf * Math.tan(Math.PI / n) * 1.03;
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * TAU;
      c.box([W * 0.92, 0.05, chord], [0, Math.cos(a) * rf, Math.sin(a) * rf], { r: [a, 0, 0], c: 0xb89a6a, v: 0.12 });
    }
    c.cyl(R, W + 0.008, [0, 0, 0], { axis: 'x', seg: 28, open: true, c: iron });
    c.cyl(R - 0.004, W + 0.01, [0, 0, 0], { axis: 'x', seg: 28, open: true, c: iron, r2: R - 0.004 });
    const ns = o.spokes || 12;
    for (let i = 0; i < ns; i++) {
      const a = (i / ns) * TAU;
      c.bar([0, Math.cos(a) * 0.06, Math.sin(a) * 0.06], [0, Math.cos(a) * (rf - 0.02), Math.sin(a) * (rf - 0.02)], W * 0.5, 0.032, { c: 0xa98a5a, v: 0.12, r: [0, 0, 0] });
    }
    c.cyl(0.07, W * 1.5, [0, 0, 0], { axis: 'x', seg: 12, c: 0x8a6a40, r2: 0.055 });
    for (const sx of [-1, 1]) c.cyl(0.075, 0.016, [sx * W * 0.5, 0, 0], { axis: 'x', seg: 12, c: iron });
    c.cyl(0.03, W * 1.9, [0, 0, 0], { axis: 'x', seg: 8, c: iron });
    void rim;
  } else if (type === 'tractor') {
    const t = Math.min(W * 0.5, R * 0.4);
    tyre(c, R, t, W, tyreCol, { n: 14, d: 0.045 });
    c.cyl(R - t * 1.4, W * 0.6, [0, 0, 0], { axis: 'x', seg: 20, c: rim });
    c.cyl(R * 0.22, W * 1.0, [0, 0, 0], { axis: 'x', seg: 10, c: 0x7a7a72 });
    bolts(c, 8, R * 0.55, W * 0.32, 0x444038, 0.015);
  }
  return c.merged();
}

export function makeWheelObject(kit, geo, R, side) {
  const g = new THREE.Group();
  g.name = 'wheel' + side;
  g.rotation.order = 'YXZ'; // steer (Y) applied outside spin (X)
  const m = new THREE.Mesh(geo, kit.mats.paint);
  m.castShadow = m.receiveShadow = true;
  m.name = 'wheelMesh';
  g.add(m);
  g.userData = { radius: R, spinMesh: m };
  return g;
}

// ------------------------------------------------------------------ shared helpers for hand-worn cockpit parts
const WOOD_BARE = 0xc9b48a, WOOD_DARK = 0x8e7a58;
const C = (h) => new THREE.Color(h);

function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
/** bevelled board: width w (x), length h (y), thickness t (z), centred */
function board(w, h, t, r = 0.01) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w, h, r), { depth: t, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -t / 2);
  return g;
}
// spiral cloth/tape wrap colouring: u,v from the primitive's own UVs
function tapeFn(a, b, bare, freq = 46, twist = 1.5, wornAmt = 0.16) {
  const ca = C(a), cb = C(b), cw = C(bare), out = new THREE.Color();
  return (i, x, y, z, u, v) => {
    const ph = (u * freq + v * twist) % 1;
    out.copy(ph < 0.82 ? ca : cb);
    const n = vnoise(x * 55, y * 55, z * 55);
    if (n > 1 - wornAmt) out.lerp(cw, 0.8); // frayed / worn through
    else out.multiplyScalar(0.85 + n * 0.3);
    return out;
  };
}

// ------------------------------------------------------------------ steering wheels (rotate about local Z)
export function buildSteeringWheelMesh(kit, type, r, col = 0x1c1c1c, col2 = 0x9a9a92) {
  const c = kit.pieceOf('wood');
  c.tileDefault = 0.3;
  const wear = (paint, amt = 0.6) => ({ wear: { paint, bare: WOOD_BARE, amt }, tess: 0.03 });
  const spoke = (a, b, r0, r1, colr) => c.rod(a, b, r0, { r2: r1, seg: 6, c: colr, v: 0.08 });
  if (type === 'car') {
    // cloth-taped rim, tapered spokes, domed hub
    c.add(new THREE.TorusGeometry(r, 0.017, 8, 40), { colorFn: tapeFn(col, 0x2a2a28, WOOD_BARE, 42, 2) });
    for (const a of [Math.PI * 0.5, Math.PI * 1.17, Math.PI * -0.17]) {
      spoke([Math.cos(a) * 0.03, Math.sin(a) * 0.03, 0.004], [Math.cos(a) * (r - 0.01), Math.sin(a) * (r - 0.01), 0], 0.014, 0.007, col2);
    }
    // leather-wrapped hub boss with a stitched seam and a worn horn button
    c.lathe([[0.001, 0.0], [0.03, 0.0], [0.034, 0.01], [0.03, 0.022], [0.018, 0.03], [0.001, 0.032]], [0, 0, 0], { r: [PI2, 0, 0], seg: 14, c: 0x4a2c1a, v: 0.12, tile: 1.6 });
    c.tor(0.031, 0.003, [0, 0, 0.012], { seg: 14, rseg: 3, c: 0xc8b48a, tile: 1.6 });
    c.cyl(0.009, 0.01, [0, 0, 0.034], { axis: 'z', seg: 8, c: 0xb8362b, tile: 1.6 }); // worn horn button
    c.box([0.05, 0.008, 0.006], [r * 0.5, 0.012, 0.03], { c: 0x9a9a98, r: [0, 0, 0.5] }); // repair tape on a spoke
  } else if (type === 'bike') {
    c.add(new THREE.TorusGeometry(r, 0.0095, 6, 40), { c: 0xb9b9b2, v: 0.08 });
    c.add(new THREE.TorusGeometry(r + 0.013, 0.012, 6, 40, Math.PI * 1.3), { colorFn: tapeFn(0x1e1e1c, 0x3a3a38, WOOD_DARK, 70, 1), r: [0, 0, 0.9] }); // wrapped half rim
    c.cyl(0.028, 0.045, [0, 0, 0.005], { axis: 'z', seg: 8, c: col2 });
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      c.rod([Math.cos(a + 0.2) * 0.03, Math.sin(a + 0.2) * 0.03, i % 2 ? 0.012 : -0.012], [Math.cos(a) * r, Math.sin(a) * r, 0], 0.0028, { seg: 3, c: 0xd2d2ce });
    }
    for (const sx of [-1, 1]) c.add(new THREE.CylinderGeometry(0.019, 0.017, 0.1, 8).rotateX(PI2), { p: [sx * r, 0, 0.04], colorFn: tapeFn(0xb8362b, 0x8a2a22, WOOD_DARK, 2, 9) });
  } else if (type === 'disc') {
    const sh = new THREE.Shape(); sh.absarc(0, 0, r, 0, TAU, false);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + Math.PI / 2, h = new THREE.Path();
      h.absarc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.3, 0, TAU, true); sh.holes.push(h);
    }
    c.add(new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.004, bevelSegments: 1, curveSegments: 16 }).translate(0, 0, -0.01), { ...wear(col, 0.7) });
    c.add(new THREE.TorusGeometry(r, 0.008, 5, 36), { p: [0, 0, 0.011], colorFn: tapeFn(0x2a2a28, 0x44443e, WOOD_BARE, 90, 1, 0.3) }); // taped edge
    c.cyl(0.026, 0.04, [0, 0, 0.025], { axis: 'z', seg: 8, c: col2 });
    for (const sx of [-1, 1]) c.add(new THREE.CylinderGeometry(0.015, 0.013, 0.09, 8).rotateX(PI2), { p: [sx * r * 0.88, 0, 0.05], ...wear(sx > 0 ? 0xc8352a : 0xd8b030, 0.65) });
  } else if (type === 'helm') {
    c.add(new THREE.TorusGeometry(r * 0.75, 0.016, 8, 36), { colorFn: tapeFn(0x6b4a2a, 0x5a3c22, WOOD_BARE, 24, 0.5, 0.25) });
    c.lathe([[0.001, 0], [0.03, 0], [0.036, 0.015], [0.02, 0.03], [0.001, 0.034]], [0, 0, 0], { r: [PI2, 0, 0], seg: 10, c: 0xb08a38 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      spoke([0, 0, 0], [Math.cos(a) * r, Math.sin(a) * r, 0], 0.014, 0.01, 0x6b4a2a);
      c.sph(0.02, [Math.cos(a) * r, Math.sin(a) * r, 0], { ...wear(0x8a6034, 0.5), s: [1, 1, 1.4], seg: 8 });
    }
  } else if (type === 'bars') {
    c.add(new THREE.CylinderGeometry(0.015, 0.015, r * 2.1, 8).rotateZ(PI2), { p: [0, 0, 0.03], c: col2 });
    c.cyl(0.026, 0.045, [0, 0, 0.01], { axis: 'z', seg: 8, c: col2 });
    for (const sx of [-1, 1]) {
      c.add(new THREE.CylinderGeometry(0.021, 0.019, r * 0.5, 8).rotateZ(PI2), { p: [sx * r * 0.82, 0, 0.03], colorFn: tapeFn(col, 0x2a2a28, WOOD_BARE, 2, 14) });
      spoke([sx * r * 1.0, 0, 0.03], [sx * r * 1.07, 0.07, 0.11], 0.014, 0.011, col2);
    }
  }
  const m = new THREE.Mesh(c.merged(), kit.mats.wood);
  m.castShadow = true; m.name = 'steeringWheelMesh';
  return m;
}
const PI2 = Math.PI / 2;

// ------------------------------------------------------------------ paddles & levers (pivot at origin, rotate about X)
export function buildPaddle(kit, col, L = 0.46, lean = 0.22) {
  const c = kit.pieceOf('wood');
  c.tileDefault = 0.35;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, 0, 0));
  const at = (d) => [0, Math.cos(lean) * d, Math.sin(lean) * d];
  c.cyl(0.014, 0.1, [0, 0, 0], { axis: 'x', seg: 8, c: 0x8a8a82, v: 0.1 }); // hinge pin
  // shaft: bevelled weathered board, mostly bare
  c.add(board(0.034, L, 0.02, 0.006), { q, p: at(L / 2), tess: 0.035, wear: { paint: col, bare: WOOD_BARE, amt: 0.8 } });
  // painted blade with a contrasting stripe, wear mask on edges + chips
  c.add(board(0.115, 0.165, 0.016, 0.012), { q, p: at(L - 0.06), tess: 0.022, wear: { paint: col, bare: WOOD_BARE, amt: 0.3 } });
  const stripe = new THREE.Color(col).offsetHSL(0.5, 0, -0.05);
  c.add(board(0.11, 0.018, 0.019, 0.003), { q, p: at(L - 0.085), tess: 0.03, wear: { paint: stripe, bare: WOOD_BARE, amt: 0.5 } });
  c.add(board(0.1, 0.02, 0.022, 0.004), { q, p: at(L - 0.135), c: 0x1c1c1a, v: 0.1 }); // rubber tread strip
  for (const dy of [0.02, -0.12]) c.sph(0.006, [0.05, Math.cos(lean) * (L - 0.06 + dy), Math.sin(lean) * (L - 0.06 + dy) + 0.01], { seg: 4, c: 0x6a6a64 }); // screw heads
  // gaffer-tape grip band on the shaft with frayed end
  c.add(new THREE.BoxGeometry(0.046, 0.1, 0.03), { q, p: at(L * 0.45), colorFn: tapeFn(0x3a3a38, 0x222220, WOOD_DARK, 1, 8, 0.12) });
  c.add(new THREE.BoxGeometry(0.048, 0.012, 0.032), { q, p: at(L * 0.45 + 0.058), c: 0xa4a39e, v: 0.15 });
  c.add(new THREE.BoxGeometry(0.014, 0.025, 0.031), { q, p: [0.03, Math.cos(lean) * (L * 0.45 - 0.065), Math.sin(lean) * (L * 0.45 - 0.065)], c: 0x3a3a38 }); // loose tape tail
  const g = new THREE.Group();
  const m = new THREE.Mesh(c.merged(), kit.mats.wood);
  m.castShadow = true; g.add(m);
  return g;
}

export function buildLever(kit, kind, col) {
  const c = kit.pieceOf('wood');
  c.tileDefault = 0.3;
  const lean = kind === 'hand' ? 0.2 : 0.12, L = kind === 'hand' ? 0.38 : 0.34;
  const dir = new THREE.Vector3(0, Math.cos(lean), Math.sin(lean));
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, 0, 0));
  const at = (d) => [dir.x * d, dir.y * d, dir.z * d];
  c.cyl(0.02, 0.07, [0, 0, 0], { axis: 'x', seg: 8, c: 0x6e6e68 });
  c.rod([0, 0, 0], at(L), kind === 'hand' ? 0.011 : 0.008, { seg: 6, c: 0x9a988e, v: 0.1 });
  if (kind === 'hand') {
    // ribbed black rubber grip on a steel lever, taped at the base, with a small brass-capped button
    const prof = [[0.001, -0.055], [0.012, -0.055], [0.013, -0.045], [0.011, -0.04], [0.013, -0.03], [0.011, -0.025], [0.013, -0.015], [0.011, -0.01], [0.013, 0.0], [0.011, 0.005], [0.013, 0.015], [0.011, 0.02], [0.013, 0.03], [0.011, 0.035], [0.012, 0.05], [0.001, 0.055]];
    c.lathe(prof, at(L - 0.03), { q, seg: 10, c: 0x1c1b19, v: 0.1, tile: 1.4 });
    c.add(new THREE.BoxGeometry(0.03, 0.012, 0.03), { q, p: at(L - 0.1), colorFn: tapeFn(0x8a8984, 0x6a6964, WOOD_DARK, 1, 6, 0.1) }); // tape wrap
    c.cyl(0.008, 0.012, at(L + 0.03), { q, seg: 8, c: 0xc8a030, tile: 1.4 }); // brass cap
  } else {
    // gear lever: lathe-turned wooden knob (bulb with a collar ring), varnished dark, rubbed bare on top
    const prof = [[0.001, -0.022], [0.007, -0.022], [0.0085, -0.012], [0.012, -0.008], [0.0105, -0.002], [0.014, 0.008], [0.0165, 0.02], [0.014, 0.033], [0.008, 0.042], [0.001, 0.045]];
    c.lathe(prof, at(L + 0.01), { q, seg: 14, tess: 0.015, tile: 1.4, wear: { paint: col || 0x6a3a22, bare: WOOD_BARE, amt: 0.55 } });
    c.add(new THREE.CylinderGeometry(0.011, 0.016, 0.05, 8), { q, p: at(0.06), c: 0x1e1d1b, tile: 1.4 }); // rubber boot
  }
  const g = new THREE.Group();
  const m = new THREE.Mesh(c.merged(), kit.mats.wood);
  m.castShadow = true; g.add(m);
  return g;
}

// ------------------------------------------------------------------ seats
export function addSeat(k, kind, x, y, z, color = 0x2f6fb5) {
  if (kind === 'crate') { // milk crate: plastic grid, upside-down against the backrest
    const w = 0.34, h = 0.27, d = 0.34, th = 0.016;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.paint.box([th * 1.4, h, th * 1.4], [x + sx * w / 2, y - h / 2, z + sz * d / 2], { c: color, v: 0.05 });
    for (const yy of [0.04, h * 0.5, h - 0.03]) {
      for (const sz of [-1, 1]) k.paint.box([w, th, th], [x, y - yy, z + sz * d / 2], { c: color });
      for (const sx of [-1, 1]) k.paint.box([th, th, d], [x + sx * w / 2, y - yy, z], { c: color });
    }
    for (let i = -2; i <= 2; i++) k.paint.box([th, th, d], [x + i * 0.065, y - 0.012, z], { c: color });
    for (let i = -2; i <= 2; i++) k.paint.box([w, th, th], [x, y - 0.012, z + i * 0.065], { c: color });
    for (let i = -2; i <= 2; i++) { k.paint.box([th, h * 0.9, th], [x + i * 0.065, y - h * 0.5, z - d / 2], { c: color }); }
    k.paint.box([w * 0.95, 0.03, d * 0.9], [x, y + 0.015, z], { c: 0x8a3a2a, v: 0.1 }); // folded blanket cushion
  } else if (kind === 'plank') {
    k.wood.box([0.38, 0.03, 0.34], [x, y, z], { c: 0xc8b088 });
    k.wood.box([0.38, 0.3, 0.028], [x, y + 0.16, z + 0.17], { r: [-0.2, 0, 0], c: 0xb89a70 });
    k.paint.box([0.34, 0.03, 0.3], [x, y + 0.03, z], { c: 0x7a2a22, v: 0.1 }); // cushion
  } else if (kind === 'bucket') {
    k.metal.cyl(0.17, 0.22, [x, y - 0.1, z], { r2: 0.14, seg: 14, open: true, c: 0xd4d0c0 });
    k.paint.cyl(0.16, 0.05, [x, y + 0.02, z], { seg: 14, c: 0x3c5c88 });
  } else if (kind === 'seatback') { // car-seat remnant
    k.paint.box([0.4, 0.1, 0.4], [x, y, z], { c: color });
    k.paint.box([0.4, 0.45, 0.1], [x, y + 0.27, z + 0.2], { r: [-0.15, 0, 0], c: color });
  }
}

// ------------------------------------------------------------------ headlight jury-rig
// p = lens centre in truck space, faces -Z. Returns the headlight Object3D (lens mesh child).
export function addHeadlight(k, p, style = 'flash', mount = 'wood') {
  const [x, y, z] = p;
  const wires = (from, to, col) => k.rope.tube([from, [(from[0] + to[0]) / 2 + 0.02, Math.min(from[1], to[1]) - 0.03, (from[2] + to[2]) / 2], to], 0.0045, { c: col, rseg: 3, grime: 0.2, uvScale: 1 });
  let lensR = 0.05;
  if (style === 'flash') { // big old torch with the battery pack strapped on
    lensR = 0.052;
    k.paint.cyl(0.04, 0.05, [x, y, z + 0.026], { axis: 'z', seg: 14, r2: 0.062, c: 0xc2342c }); // flared reflector head (wide end faces -z)
    k.paint.cyl(0.04, 0.2, [x, y, z + 0.15], { axis: 'z', seg: 12, c: 0xc2342c });
    k.paint.tape([x, y, z + 0.1], [0.095, 0.095, 0.03], { grime: 0.3 });
    k.paint.tape([x, y, z + 0.2], [0.09, 0.09, 0.03], { grime: 0.3 });
    k.paint.box([0.07, 0.05, 0.14], [x, y - 0.075, z + 0.2], { c: 0x242424 }); // battery pack
    k.paint.box([0.074, 0.054, 0.02], [x, y - 0.075, z + 0.2], { c: 0xc8a020 });
    k.rope.lash([x, y - 0.045, z + 0.2], 'z', 0.07, 0.07, 2, { r: 0.006 });
    wires([x, y - 0.075, z + 0.28], [x + 0.03, y - 0.14, z + 0.5], 0xb82a22);
    wires([x + 0.012, y - 0.07, z + 0.28], [x + 0.045, y - 0.14, z + 0.5], 0x111111);
    k.wood.box([0.07, 0.04, 0.25], [x, y - 0.115, z + 0.15], { c: 0xb09468 });
  } else if (style === 'lantern') {
    lensR = 0.055;
    k.metal.box([0.13, 0.16, 0.13], [x, y, z + 0.075], { c: 0x4a5a4a, v: 0.1 });
    k.metal.tor(0.04, 0.005, [x, y + 0.115, z + 0.075], { arc: Math.PI, r: [0, 0, 0], seg: 10, rseg: 3, c: 0x8a8a84 });
    for (const sx of [-1, 1]) k.metal.box([0.012, 0.16, 0.012], [x + sx * 0.06, y, z - 0.002], { c: 0x3a4a3a });
    k.paint.box([0.07, 0.07, 0.1], [x, y + 0.14, z + 0.075], { c: 0x226a3a }); // 6V lantern battery on top
    for (const sx of [-1, 1]) k.metal.cyl(0.008, 0.03, [x + sx * 0.02, y + 0.19, z + 0.075], { seg: 5, c: 0xb8b0a0 });
    k.paint.tape([x, y + 0.115, z + 0.075], [0.135, 0.03, 0.135]);
    k.rope.lash([x, y + 0.095, z + 0.075], 'y', 0.09, 0.05, 2, { r: 0.007 });
    wires([x + 0.02, y + 0.19, z + 0.075], [x + 0.02, y - 0.05, z + 0.55], 0xb82a22);
    wires([x - 0.02, y + 0.19, z + 0.075], [x - 0.02, y - 0.05, z + 0.55], 0x111111);
  } else if (style === 'can') { // coffee-can reflector on a motorbike battery
    lensR = 0.058;
    k.metal.cyl(0.07, 0.14, [x, y, z + 0.07], { axis: 'z', seg: 14, open: true, c: 0xc8c4b8 });
    k.paint.cyl(0.07, 0.01, [x, y, z + 0.14], { axis: 'z', seg: 14, c: 0xd4c8a0 });
    k.paint.box([0.1, 0.1, 0.07], [x, y, z + 0.17], { c: 0x2a2a2a });
    k.paint.box([0.1, 0.07, 0.15], [x + 0.0, y - 0.1, z + 0.28], { c: 0x2c3a5a }); // moto battery
    for (const sx of [-1, 1]) k.metal.cyl(0.008, 0.02, [x + sx * 0.03, y - 0.055, z + 0.28], { seg: 5, c: 0xc8b890 });
    k.paint.tape([x, y, z + 0.05], [0.15, 0.03, 0.03]);
    k.rope.lash([x, y - 0.1, z + 0.28], 'z', 0.06, 0.08, 2, { r: 0.006 });
    wires([x, y - 0.12, z + 0.36], [x + 0.04, y - 0.18, z + 0.6], 0xb82a22);
    wires([x + 0.025, y - 0.12, z + 0.36], [x + 0.06, y - 0.18, z + 0.6], 0x111111);
    wires([x, y, z + 0.2], [x, y - 0.1, z + 0.3], 0x111111);
  } else if (style === 'bike') {
    lensR = 0.04;
    k.paint.cyl(0.045, 0.1, [x, y, z + 0.05], { axis: 'z', seg: 12, c: 0x1c1c1c, r2: 0.035 });
    k.metal.cyl(0.012, 0.1, [x, y - 0.07, z + 0.06], { seg: 6, c: 0x888880 });
    k.paint.box([0.06, 0.04, 0.12], [x + 0.08, y - 0.02, z + 0.2], { c: 0x242428 }); // pack of AAs
    k.paint.tape([x + 0.08, y - 0.02, z + 0.2], [0.065, 0.045, 0.02]);
    k.paint.tape([x, y, z + 0.06], [0.06, 0.06, 0.02]);
    wires([x + 0.07, y - 0.02, z + 0.26], [x + 0.05, y - 0.08, z + 0.5], 0xb82a22);
    wires([x + 0.01, y, z + 0.1], [x + 0.065, y - 0.02, z + 0.2], 0x111111);
  }
  const hl = new THREE.Object3D();
  hl.name = 'headlight';
  hl.position.set(x, y, z);
  const geo = new THREE.CircleGeometry(lensR, 16);
  geo.rotateY(Math.PI);
  const lens = new THREE.Mesh(geo, k.mats.lens);
  lens.position.z = -0.004;
  hl.add(lens);
  hl.userData.lens = lens;
  hl.userData.setOn = (on) => { k.mats.lens.emissiveIntensity = on ? 3 : 0.15; };
  void mount;
  return hl;
}

// ------------------------------------------------------------------ flag pole
export function addFlagPole(k, p, h = 0.55, col = 0xc8b48a) {
  const [x, y, z] = p;
  k.metal.cyl(0.03, 0.08, [x, y + 0.03, z], { seg: 8, c: 0x6a625a, r2: 0.024 }); // pipe socket
  k.wood.rod([x, y, z], [x, y + h, z], 0.0085, { seg: 6, c: col, v: 0.1, grime: 0 }); // dowel
  k.rope.lash([x, y + 0.05, z], 'y', 0.014, 0.08, 4, { r: 0.0055 });
  k.paint.tape([x, y + 0.12, z], [0.026, 0.03, 0.026], { r: [0, 0.5, 0] });
  k.paint.sph(0.015, [x, y + h + 0.012, z], { c: 0xe8c030, seg: 6, grime: 0 });
  const fm = new THREE.Object3D();
  fm.name = 'flagMount';
  fm.position.set(x, y + h - 0.03, z);
  return fm;
}

// ------------------------------------------------------------------ driver (child), optional visual
export function buildDriver(k, eyeY, eyeZ, shirt = 0x2f6f9a, helmet = 0xd8a020) {
  const c = k.piece(false);
  const sy = eyeY - 0.5;
  c.box([0.3, 0.36, 0.17], [0, sy + 0.2, eyeZ + 0.1], { c: shirt, v: 0.06 });
  c.box([0.3, 0.12, 0.2], [0, sy + 0.03, eyeZ + 0.0], { c: 0x3a4a62 });
  for (const sx of [-1, 1]) {
    c.bar([sx * 0.08, sy + 0.04, eyeZ - 0.05], [sx * 0.1, sy + 0.0, eyeZ - 0.4], 0.09, 0.08, { c: 0x3a4a62 }); // thighs/shins
    c.box([0.09, 0.07, 0.17], [sx * 0.1, sy - 0.04, eyeZ - 0.48], { c: 0xc8c0b0 }); // sneakers
    c.bar([sx * 0.16, sy + 0.34, eyeZ + 0.06], [sx * 0.12, eyeY - 0.3, eyeZ - 0.3], 0.06, 0.06, { c: shirt }); // arms
    c.sph(0.032, [sx * 0.12, eyeY - 0.3, eyeZ - 0.32], { c: 0xd8a888, seg: 6 });
  }
  c.sph(0.12, [0, eyeY - 0.02, eyeZ + 0.1], { c: 0xd8a888, seg: 10 });
  c.sph(0.145, [0, eyeY + 0.025, eyeZ + 0.105], { c: helmet, seg: 10, s: [1, 0.85, 1.05] });
  c.box([0.2, 0.015, 0.1], [0, eyeY + 0.03, eyeZ - 0.02], { c: 0x222222 }); // visor lip
  const m = new THREE.Mesh(c.merged(), k.mats.paint);
  m.name = 'driver'; m.castShadow = true;
  return m;
}

export { lerp };
