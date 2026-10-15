// Shared truck components: wheels, steering wheels, pedals/paddles, levers, headlight rig, flag pole, seats, driver.
import * as THREE from 'three';

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

// ------------------------------------------------------------------ steering wheels (rotate about local Z)
export function buildSteeringWheelMesh(kit, type, r, col = 0x1c1c1c, col2 = 0x9a9a92) {
  const c = kit.piece(false);
  const tube = type === 'bike' ? 0.01 : 0.016;
  if (type === 'car') {
    c.tor(r, tube + 0.003, [0, 0, 0], { c: col, seg: 24, rseg: 6 });
    c.cyl(0.04, 0.05, [0, 0, 0.012], { axis: 'z', seg: 10, c: col2 });
    for (const a of [Math.PI * 0.5 + 0.0, Math.PI * 1.17, Math.PI * -0.17]) {
      c.bar([0, 0, 0], [Math.cos(a) * r, Math.sin(a) * r, 0], 0.024, 0.014, { c: col2 });
    }
    c.sph(0.02, [0, 0, 0.04], { c: 0xc7352b, seg: 6 }); // horn button
  } else if (type === 'bike') {
    c.tor(r, 0.009, [0, 0, 0], { c: 0xc8c8c2, seg: 26, rseg: 4 });
    c.tor(r + 0.012, 0.011, [0, 0, 0], { c: 0x222222, seg: 26, rseg: 4 }); // old tyre left on
    c.cyl(0.03, 0.05, [0, 0, 0], { axis: 'z', seg: 8, c: col2 });
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      c.rod([Math.cos(a + 0.2) * 0.03, Math.sin(a + 0.2) * 0.03, i % 2 ? 0.012 : -0.012], [Math.cos(a) * r, Math.sin(a) * r, 0], 0.0028, { seg: 3, c: 0xd2d2ce });
    }
    for (const sx of [-1, 1]) c.cyl(0.018, 0.1, [sx * r, 0, 0.035], { axis: 'z', seg: 7, c: 0xc7352b }); // taped grips
  } else if (type === 'disc') {
    c.cyl(r, 0.022, [0, 0, 0], { axis: 'z', seg: 22, c: col, v: 0.08 });
    c.tor(r, 0.008, [0, 0, 0.011], { c: 0x8a6a3a, seg: 22, rseg: 4 });
    c.cyl(0.03, 0.04, [0, 0, 0.03], { axis: 'z', seg: 8, c: col2 });
    for (const sx of [-1, 1]) c.cyl(0.016, 0.1, [sx * r * 0.82, 0, 0.06], { axis: 'z', seg: 7, c: sx > 0 ? 0xd8352a : 0xe8c030 });
  } else if (type === 'helm') {
    c.tor(r * 0.75, 0.016, [0, 0, 0], { c: 0x6b4a2a, seg: 24, rseg: 6 });
    c.cyl(0.05, 0.06, [0, 0, 0], { axis: 'z', seg: 10, c: 0xb08a38 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      c.bar([0, 0, 0], [Math.cos(a) * r, Math.sin(a) * r, 0], 0.016, 0.016, { c: 0x6b4a2a });
      c.sph(0.02, [Math.cos(a) * r, Math.sin(a) * r, 0], { c: 0x8a6034, seg: 6 });
    }
  } else if (type === 'bars') {
    c.cyl(0.015, r * 2.1, [0, 0, 0.03], { axis: 'x', seg: 7, c: col2 });
    c.cyl(0.028, 0.045, [0, 0, 0.01], { axis: 'z', seg: 8, c: col2 });
    for (const sx of [-1, 1]) {
      c.cyl(0.02, r * 0.5, [sx * r * 0.82, 0, 0.03], { axis: 'x', seg: 7, c: col });
      c.rod([sx * r * 1.0, 0, 0.03], [sx * r * 1.05, 0.07, 0.1], 0.014, { seg: 6, c: col2 });
    }
  }
  const m = new THREE.Mesh(c.merged(), kit.mats.paint);
  m.castShadow = true; m.name = 'steeringWheelMesh';
  return m;
}

// ------------------------------------------------------------------ paddles & levers (pivot at origin, rotate about X)
export function buildPaddle(kit, col, L = 0.44, lean = 0.22) {
  const c = kit.piece(false);
  c.cyl(0.014, 0.1, [0, 0, 0], { axis: 'x', seg: 8, c: 0x888880 });
  const dir = [0, Math.cos(lean), Math.sin(lean)];
  c.bar([0, 0, 0], [0, dir[1] * L, dir[2] * L], 0.03, 0.018, { c: 0x9a7a4a, v: 0.1 });
  // blade
  const bc = [0, dir[1] * (L - 0.07), dir[2] * (L - 0.07)];
  c.box([0.13, 0.19, 0.016], bc, { r: [lean, 0, 0], c: col, v: 0.08 });
  c.box([0.13, 0.02, 0.022], [0, dir[1] * (L - 0.16), dir[2] * (L - 0.16)], { r: [lean, 0, 0], c: 0x1a1a1a }); // rubber tread strip
  c.tape([0, dir[1] * (L * 0.5), dir[2] * (L * 0.5)], [0.036, 0.05, 0.026], { r: [lean, 0, 0] });
  const g = new THREE.Group();
  const m = new THREE.Mesh(c.merged(), kit.mats.paint);
  m.castShadow = true; g.add(m);
  return g;
}

export function buildLever(kit, kind, col) {
  const c = kit.piece(false);
  const lean = kind === 'hand' ? 0.2 : 0.12, L = kind === 'hand' ? 0.34 : 0.3;
  const dir = [0, Math.cos(lean), Math.sin(lean)];
  c.cyl(0.02, 0.07, [0, 0, 0], { axis: 'x', seg: 8, c: 0x777770 });
  c.rod([0, 0, 0], [0, dir[1] * L, dir[2] * L], kind === 'hand' ? 0.011 : 0.008, { seg: 6, c: 0xb4b4ae });
  if (kind === 'hand') {
    c.cyl(0.019, 0.15, [0, dir[1] * (L - 0.04), dir[2] * (L - 0.04)], { r: [lean, 0, 0], seg: 8, c: 0x141414 }); // grip
    c.tape([0, dir[1] * (L - 0.09), dir[2] * (L - 0.09)], [0.04, 0.02, 0.04], { r: [lean, 0, 0] });
    c.sph(0.016, [0, dir[1] * (L + 0.04), dir[2] * (L + 0.04)], { c: 0xd2352a, seg: 6 }); // release button
  } else {
    c.sph(0.032, [0, dir[1] * L, dir[2] * L], { c: col || 0xe8e0c8, seg: 8 }); // shifter knob
    c.cyl(0.02, 0.05, [0, dir[1] * 0.06, dir[2] * 0.06], { r: [lean, 0, 0], seg: 8, c: 0x222222, r2: 0.014 }); // boot
  }
  const g = new THREE.Group();
  const m = new THREE.Mesh(c.merged(), kit.mats.paint);
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
    k.tape([x, y + 0.115, z + 0.075], [0.135, 0.03, 0.135]);
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
    k.tape([x, y, z + 0.05], [0.15, 0.03, 0.03]);
    k.rope.lash([x, y - 0.1, z + 0.28], 'z', 0.06, 0.08, 2, { r: 0.006 });
    wires([x, y - 0.12, z + 0.36], [x + 0.04, y - 0.18, z + 0.6], 0xb82a22);
    wires([x + 0.025, y - 0.12, z + 0.36], [x + 0.06, y - 0.18, z + 0.6], 0x111111);
    wires([x, y, z + 0.2], [x, y - 0.1, z + 0.3], 0x111111);
  } else if (style === 'bike') {
    lensR = 0.04;
    k.paint.cyl(0.045, 0.1, [x, y, z + 0.05], { axis: 'z', seg: 12, c: 0x1c1c1c, r2: 0.035 });
    k.metal.cyl(0.012, 0.1, [x, y - 0.07, z + 0.06], { seg: 6, c: 0x888880 });
    k.paint.box([0.06, 0.04, 0.12], [x + 0.08, y - 0.02, z + 0.2], { c: 0x242428 }); // pack of AAs
    k.tape([x + 0.08, y - 0.02, z + 0.2], [0.065, 0.045, 0.02]);
    k.tape([x, y, z + 0.06], [0.06, 0.06, 0.02]);
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
  k.rod([x, y, z], [x, y + h, z], 0.0085, { seg: 6, c: col, v: 0.1, grime: 0 }); // dowel
  k.rope.lash([x, y + 0.05, z], 'y', 0.014, 0.08, 4, { r: 0.0055 });
  k.tape([x, y + 0.12, z], [0.026, 0.03, 0.026], { r: [0, 0.5, 0] });
  k.paint.sph(0.015, [x, y + h + 0.012, z], { c: 0xe8c030, seg: 6, grime: 0 });
  k.paint.cyl(0.004, 0.14, [x, y + h - 0.05, z - 0.0], { axis: 'x', seg: 4, c: 0x888 });
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
