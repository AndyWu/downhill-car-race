// Trucks 6-10: Door Dasher, Crate Comet, Tin Lizzie, Ladder Larry, Sled Dog
import * as THREE from 'three';
import { DECAL } from './textures.js';
import { slatCrate } from './helpers.js';

const PI = Math.PI;

// ---- old screen door, local origin = centre of top surface, lying flat in XZ (rotate with rx etc.)
function screenDoor(k, cx, cy, cz, w, d, o = {}) {
  const tone = o.tone ?? 0xc9d6c0;
  const fw = 0.075, th = 0.035;
  k.withXf([cx, cy, cz], [o.rx || 0, o.ry || 0, o.rz || 0], () => {
    const col = (m) => new THREE.Color(tone).multiplyScalar(m * (0.85 + k.rand() * 0.2));
    for (const sx of [-1, 1]) k.wood.box([fw, th, d], [sx * (w / 2 - fw / 2), -th / 2, 0], { c: col(1) });
    k.wood.box([w - fw * 2, th, 0.1], [0, -th / 2, -d / 2 + 0.05], { c: col(0.95) });
    k.wood.box([w - fw * 2, th, 0.2], [0, -th / 2, d / 2 - 0.1], { c: col(0.9) }); // kick plate rail
    k.wood.box([w - fw * 2, th, 0.08], [0, -th / 2, 0.0], { c: col(1) });
    // screen mesh
    const sw = w - fw * 2, z0 = -d / 2 + 0.1, z1 = -0.04, z2 = 0.04, z3 = d / 2 - 0.2;
    for (const [za, zb] of [[z0, z1], [z2, z3]]) {
      const len = zb - za;
      for (let x = -sw / 2 + 0.02; x < sw / 2; x += 0.04) k.paint.box([0.0025, 0.0025, len], [x, -0.012, (za + zb) / 2], { c: 0x465a40, grime: 0.3, v: 0.2 });
      for (let z = za + 0.02; z < zb; z += 0.04) k.paint.box([sw, 0.0025, 0.0025], [0, -0.012, z], { c: 0x465a40, grime: 0.3, v: 0.2 });
    }
    // torn patch + hardware
    k.paint.tape([0.1, 0.0, -d / 2 + 0.3], [0.14, 0.003, 0.12], { r: [0, 0.3, 0] });
    k.metal.box([0.03, 0.012, 0.11], [w / 2 - fw / 2, 0.006, 0.0], { c: 0x8a8274 }); // handle plate
    k.metal.cyl(0.014, 0.03, [w / 2 - fw / 2, 0.02, 0.0], { seg: 6, c: 0x9a9284 });
    for (const z of [-d / 2 + 0.12, 0, d / 2 - 0.12]) k.metal.box([0.05, 0.006, 0.03], [-w / 2 + fw / 2, 0.003, z], { c: 0x4a443e }); // hinges
    k.metal.rivets([-w / 2 + 0.03, 0.005, d / 2 - 0.16], [w / 2 - 0.03, 0.005, d / 2 - 0.16], 6, 0.006);
  });
}

// ============================================================ 6. DOOR DASHER
const doorDasher = {
  id: 'door-dasher', name: 'Door Dasher', seed: 606,
  description: 'Two old screen doors and a prayer: light as a feather and plenty quick, but she flexes like a diving board and the little wheels skate on loose ground.',
  stats: { mass: 72, dragCoef: 0.6, frontalArea: 0.55, rollingResist: 0.02, gripMul: 0.9, steerLock: 0.55, steerRate: 3.6, paddleEfficiency: 1.05, brakeForce: 420, suspension: { stiffness: 7500, damping: 650, travel: 0.07 } },
  layout: {
    R: 0.18, Rf: 0.18, WB: 1.7, T: 0.7, eyeY: 0.72, eyeZ: 0.3, floorY: -0.04,
    wheel: { type: 'cart', W: 0.08, rim: 0x5a8a5a, tyre: 0x1a1a1a }, axleF: 'wood',
    steer: { type: 'disc', r: 0.17, col: 0x2a2a2a, col2: 0xa0a09a },
    seat: { kind: 'seatback', color: 0x6a3a2a }, paddleCol: 0xe8e0c8, gearCol: 0xe0b020, px: 0.27, lx: 0.26,
    hl: { p: [0, 0.18, -1.15], style: 'bike' }, flag: { p: [0.2, 0.225, -0.72], h: 0.5 },
    driver: { shirt: 0x8a3a2a, helmet: 0x5a8a5a },
  },
  body(k) {
    const slope = 0.43;
    screenDoor(k, 0, -0.04, 0.3, 0.7, 1.7, { tone: 0xc9d6c0 });
    // hood door: slopes up to the cowl
    screenDoor(k, 0, 0.0 + 0.012, -0.9, 0.56, 0.78, { rx: -slope, tone: 0xb8c8b0 });
    // rails under the deck door and hood support
    for (const x of [-0.24, 0.24]) k.wood.bar([x, -0.09, -0.8], [x, -0.09, 1.1], 0.045, 0.045, { c: 0xa88e62 });
    for (const x of [-0.24, 0.24]) k.wood.bar([x, -0.08, -0.55], [x, 0.17, -0.7], 0.035, 0.035, { c: 0xa88e62 });
    // tail fin: a door stood on end and braced
    screenDoor(k, 0, 0.42, 1.14, 0.5, 0.74, { rx: -PI / 2 + 0.12, tone: 0xd6d0b8 });
    for (const x of [-0.18, 0.18]) k.wood.bar([x, -0.04, 0.9], [x, 0.3, 1.1], 0.03, 0.03, { c: 0xa88e62 });
    k.paint.decal(DECAL.n13, [0, 0.45, 1.158], 0.28, 0.28, { r: [0, 0, 0] });
    k.paint.decal(DECAL.n13, [0, 0.45, 1.11], 0.28, 0.28, { r: [0, PI, 0] });
    // rope lashings joining the doors, bungee across the seat
    k.rope.lash([0, -0.06, -0.58], 'x', 0.04, 0.6, 12, { r: 0.007 });
    for (const x of [-0.3, 0.3]) k.rope.lash([x, -0.06, 0.0], 'z', 0.04, 0.1, 4);
    k.rope.tube([[-0.34, -0.04, 0.55], [-0.2, 0.18, 0.52], [0.2, 0.18, 0.52], [0.34, -0.04, 0.55]], 0.007, { c: 0x181818, uvScale: 1 });
    k.paint.decal(DECAL.plateA, [0.355, -0.06, 0.6], 0.3, 0.19, { r: [0, PI / 2, 0] });
    // mount block for headlight
    k.wood.box([0.1, 0.05, 0.22], [0, 0.065, -1.07], { c: 0xa68c62, r: [-slope, 0, 0] });
    k.wood.bar([0, -0.06, -1.15], [0, 0.07, -1.0], 0.03, 0.03, { c: 0xa68c62 });
  },
};

// ============================================================ 7. CRATE COMET
const crateComet = {
  id: 'crate-comet', name: 'Crate Comet', seed: 707,
  description: 'Apple crates nailed to a rocket-nose and ten-dollar wheels: light and quick off the line, but those little wheels hate every bump on the hill.',
  stats: { mass: 80, dragCoef: 0.58, frontalArea: 0.5, rollingResist: 0.03, gripMul: 0.95, steerLock: 0.6, steerRate: 3.8, paddleEfficiency: 1.1, brakeForce: 380, suspension: { stiffness: 5500, damping: 420, travel: 0.05 } },
  layout: {
    R: 0.17, Rf: 0.17, WB: 1.25, T: 0.68, eyeY: 0.73, eyeZ: 0.18, floorY: -0.07,
    wheel: { type: 'cart', W: 0.08, rim: 0xc1272d, tyre: 0x1a1a1a }, axleF: 'wood',
    steer: { type: 'car', r: 0.15, col: 0x1a1a1a, col2: 0xc8c8c0 },
    seat: { kind: 'crate', color: 0xd83a2a }, paddleCol: 0x2f6fb5, gearCol: 0x2f6fb5, px: 0.22, lx: 0.25,
    hl: { p: [-0.17, 0.2, -0.92], style: 'can' }, flag: { p: [0.18, 0.1, -0.88], h: 0.5 },
    driver: { shirt: 0xf0ebe0, helmet: 0xc1272d },
  },
  body(k) {
    slatCrate(k, [0, -0.03, 0.2], [0.58, 0.22, 1.0], { slats: 3 });
    slatCrate(k, [0, 0.0, -0.66], [0.5, 0.2, 0.7], { slats: 3, tone: 0xc8b084 });
    // painted side planks carry the lettering
    for (const sx of [-1, 1]) {
      k.paint.box([0.012, 0.17, 0.78], [sx * 0.296, -0.02, 0.2], { c: 0xf0ebe0, v: 0.02 });
      k.paint.decal(DECAL.comet, [sx * 0.303, 0.0, 0.24], 0.5, 0.25, { r: [0, sx * PI / 2, 0] });
      k.paint.decal(DECAL.n13, [sx * 0.303, -0.02, -0.08], 0.14, 0.14, { r: [0, sx * PI / 2, 0] });
      k.paint.box([0.012, 0.15, 0.5], [sx * 0.256, 0.0, -0.66], { c: 0xc1272d });
      k.paint.decal(DECAL.flames, [sx * 0.263, 0.0, -0.66], 0.4, 0.17, { r: [0, sx * PI / 2, 0] });
    }
    // rocket nose cone: red body, white tip
    const prof = (t0, t1) => { const p = []; for (let i = 0; i <= 6; i++) { const t = t0 + (t1 - t0) * (i / 6); p.push([0.148 * Math.pow(1 - Math.pow(t, 1.5), 0.6), 0.9 * t]); } return p; };
    k.paint.lathe(prof(0, 0.62), [0, 0.19, -0.5], { r: [-PI / 2, 0, 0], seg: 18, c: 0xd02a28, v: 0.03 });
    k.paint.lathe(prof(0.62, 1.0), [0, 0.19, -0.5], { r: [-PI / 2, 0, 0], seg: 18, c: 0xf0ebe0, v: 0.03 });
    k.metal.tor(0.133, 0.008, [0, 0.19, -0.5 - 0.9 * 0.62], { seg: 18, rseg: 4, c: 0x8a8a84 }); // join band
    k.metal.rivets([-0.12, 0.19, -0.6], [0.12, 0.19, -0.6], 1, 0.0);
    k.wood.bar([0, 0.0, -0.45], [0, 0.17, -0.7], 0.035, 0.035, { c: 0xa68c62 }); // strut under the cone
    k.rope.lash([0, 0.19, -0.72], 'z', 0.145, 0.05, 5, { r: 0.008 });
    // fins and rocket cans at the tail
    const fin = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.4, 0), new THREE.Vector2(0.4, 0.38), new THREE.Vector2(0.22, 0.42)]);
    for (const sx of [-1, 1]) {
      k.paint.add(new THREE.ExtrudeGeometry(fin, { depth: 0.015, bevelEnabled: false }).rotateY(-PI / 2).translate(0, 0, 0), { p: [sx * 0.24, 0.07, 0.62], c: 0xc1272d, r: [0, 0, sx * 0.0] });
    }
    for (const [x, y] of [[0, 0.04], [-0.1, -0.03], [0.1, -0.03]]) {
      k.metal.cyl(0.055, 0.22, [x, y, 0.82], { axis: 'z', seg: 12, open: true, c: 0xe0d8c0 });
      k.paint.decal(DECAL.flames, [x, y + 0.0, 0.94], 0.12, 0.12, { r: [0, 0, 0] });
      k.paint.cyl(0.05, 0.006, [x, y, 0.72], { axis: 'z', seg: 12, c: 0x2a2622 });
    }
    k.rope.lash([0, 0.0, 0.76], 'z', 0.19, 0.04, 4);
    // backrest crate lid
    k.wood.box([0.5, 0.3, 0.02], [0, 0.25, 0.63], { c: 0xc8b084, r: [-0.15, 0, 0] });
    // headlight mount board
    k.wood.box([0.14, 0.03, 0.22], [-0.17, 0.11, -0.86], { c: 0xa68c62 });
    k.paint.tape([-0.17, 0.126, -0.9], [0.1, 0.003, 0.05]);
    k.paint.decal(DECAL.fragile, [0.0, 0.02, -1.019], 0.3, 0.2, { r: [0, 0, 0] });
  },
};

// ============================================================ 8. TIN LIZZIE
const LZ = { cy: 0.04, R0: 0.26 };
const noseR = (z) => { const t = Math.min(1, Math.max(0, (-z - 0.4) / 1.1)); return LZ.R0 * Math.pow(1 - Math.pow(t, 1.7), 0.62); };
const tailR = (z) => { const t = Math.min(1, Math.max(0, (z - 0.7) / 1.0)); return LZ.R0 * Math.pow(1 - Math.pow(t, 1.5), 0.7); };
function hullSection(k, bucket, rfun, za, zb, c, o = {}) {
  // za > zb: from the rear end to the front end so lathe-y increases forward
  const pts = [];
  const n = o.n || 6;
  for (let i = 0; i <= n; i++) { const z = za + (zb - za) * (i / n); pts.push([Math.max(0.004, rfun(z)), -z]); }
  k[bucket].lathe(pts, [0, LZ.cy, 0], { r: [-PI / 2, 0, 0], seg: 24, c, v: 0.03, tile: 0.8, ...o.opts });
}
function ringRivets(k, z, r, n = 20) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    k.metal.sph(0.0085, [Math.sin(a) * (r + 0.003), LZ.cy + Math.cos(a) * (r + 0.003), z], { seg: 4, c: 0x70675c, v: 0.15 });
  }
}
const tinLizzie = {
  id: 'tin-lizzie', name: 'Tin Lizzie', seed: 808,
  description: 'A riveted sheet-metal torpedo on skinny bicycle wheels: slipperiest thing on the hill and light as a feather, but she washes out when the road turns loose.',
  stats: { mass: 74, dragCoef: 0.45, frontalArea: 0.5, rollingResist: 0.011, gripMul: 0.8, steerLock: 0.38, steerRate: 2.4, paddleEfficiency: 1.0, brakeForce: 300, suspension: { stiffness: 5200, damping: 380, travel: 0.06 } },
  layout: {
    R: 0.3, Rf: 0.3, WB: 1.4, T: 0.68, eyeY: 0.6, eyeZ: 0.32, floorY: -0.2, noRopes: true,
    wheel: { type: 'bike', W: 0.045, spokes: 32, tyre: 0x161616 }, axleF: 'metal',
    steer: { type: 'car', r: 0.15, col: 0x2a1c12, col2: 0xb09a58 },
    seat: { kind: 'seatback', color: 0x6a3a22 }, paddleCol: 0xb09a58, gearCol: 0x2a1c12, px: 0.19, lx: 0.2, ldz: -0.3,
    hl: { p: [0, 0.37, -0.6], style: 'can' }, flag: { p: [0, 0.245, -0.95], h: 0.5, col: 0xb09a58 },
    driver: { shirt: 0xe0d8c0, helmet: 0x5a8a96 },
  },
  body(k) {
    const teal = 0x6a9aa4, silver = 0xd6dad6;
    // nose in three tin sections
    hullSection(k, 'metal', noseR, -0.4, -0.7, 0xffffff);
    hullSection(k, 'metal', noseR, -0.7, -1.0, teal);
    hullSection(k, 'metal', noseR, -1.0, -1.5, silver, { n: 8 });
    for (const z of [-0.4, -0.7, -1.0]) ringRivets(k, z, noseR(z));
    for (let i = 0; i < 9; i++) { const z = -0.45 - i * 0.1; k.metal.sph(0.007, [0, LZ.cy + noseR(z) + 0.003, z], { seg: 4, c: 0x70675c }); }
    // open cockpit tub (double-sided paint) and the rolled coaming
    const th0 = 1.15;
    const tub = new THREE.LatheGeometry([new THREE.Vector2(LZ.R0, -0.7), new THREE.Vector2(LZ.R0, 0.4)], 22, th0, PI * 2 - th0 * 2);
    k.paint.add(tub, { p: [0, LZ.cy, 0], r: [-PI / 2, 0, 0], c: teal, v: 0.03 });
    for (const sx of [-1, 1]) {
      const px = sx * LZ.R0 * Math.sin(th0), py = LZ.cy + LZ.R0 * Math.cos(th0);
      k.metal.cyl(0.013, 1.1, [px, py, 0.15], { axis: 'z', seg: 8, c: 0xc8b878 });
    }
    k.paint.decal(DECAL.n88, [LZ.R0 + 0.003, LZ.cy - 0.0, 0.1], 0.24, 0.24, { r: [0, PI / 2, 0] });
    k.paint.decal(DECAL.n88, [-LZ.R0 - 0.003, LZ.cy - 0.0, 0.1], 0.24, 0.24, { r: [0, -PI / 2, 0] });
    k.paint.decal(DECAL.plateB, [LZ.R0 + 0.003, LZ.cy - 0.08, 0.5], 0.2, 0.13, { r: [0, PI / 2, 0] });
    // tail
    hullSection(k, 'metal', tailR, 1.7, 1.2, silver, { n: 6 });
    hullSection(k, 'metal', tailR, 1.2, 0.7, 0xffffff, { n: 6 });
    for (const z of [0.7, 1.2]) ringRivets(k, z, tailR(z));
    // fin
    const fin = new THREE.Shape([new THREE.Vector2(0.9, 0), new THREE.Vector2(1.7, 0.0), new THREE.Vector2(1.72, 0.2), new THREE.Vector2(1.42, 0.5), new THREE.Vector2(1.1, 0.52)]);
    k.metal.add(new THREE.ExtrudeGeometry(fin, { depth: 0.014, bevelEnabled: false }).translate(0, 0, -0.007).rotateY(-PI / 2), { p: [0, LZ.cy + 0.19, 0], c: 0xe8d8c8 });
    k.metal.rivets([0, LZ.cy + 0.26, 1.15], [0, LZ.cy + 0.52, 1.45], 5, 0.008);
    // tub interior: floor boards and seat box
    k.wood.box([0.34, 0.025, 1.0], [0, -0.2, 0.1], { c: 0xb59c70 });
    k.wood.box([0.34, 0.3, 0.3], [0, -0.06, 0.44], { c: 0xa68c62 });
    k.wood.box([0.3, 0.1, 0.02], [0, 0.0, 0.62], { c: 0xb59c70, r: [-0.3, 0, 0] });
    // lamp bracket
    k.metal.rod([0, 0.28, -0.6], [0, 0.32, -0.6], 0.012, { seg: 5, c: 0x8a8a84 });
    k.rope.lash([0, LZ.cy + noseR(-0.6) - 0.01, -0.6], 'z', noseR(-0.6) + 0.01, 0.05, 4);
  },
};

// ============================================================ 9. LADDER LARRY
const ladderLarry = {
  id: 'ladder-larry', name: 'Ladder Larry', seed: 909,
  description: 'An old aluminium ladder on two bicycle wheels and a stepladder nose: those wheels roll forever, but she flexes like a diving board and catches wind like a barn door.',
  stats: { mass: 78, dragCoef: 1.05, frontalArea: 0.95, rollingResist: 0.01, gripMul: 0.78, steerLock: 0.5, steerRate: 3.0, paddleEfficiency: 1.0, brakeForce: 280, suspension: { stiffness: 4200, damping: 260, travel: 0.1 } },
  layout: {
    R: 0.33, Rf: 0.28, WB: 1.55, T: 0.86, eyeY: 0.57, eyeZ: 0.25, floorY: -0.04,
    wheel: { type: 'bike', W: 0.04, spokes: 32, tyre: 0x1a1a1a }, axleF: 'wood',
    steer: { type: 'bike', r: 0.2, col: 0x222222, col2: 0xa0a09a },
    seat: { kind: 'bucket' }, paddleCol: 0xe0b020, gearCol: 0xd2352a, px: 0.2, lx: 0.24,
    hl: { p: [0, 0.38, -1.04], style: 'flash' }, flag: { p: [0.2, 0.285, -0.96], h: 0.5 },
    driver: { shirt: 0xe0b020, helmet: 0xe0b020 },
  },
  body(k) {
    const al = 0xb4b9bd;
    for (const sx of [-1, 1]) {
      k.paint.box([0.04, 0.075, 2.35], [sx * 0.27, -0.075, 0.2], { c: al, v: 0.05 });
      k.paint.box([0.012, 0.05, 2.3], [sx * 0.292, -0.075, 0.2], { c: 0x8a9094 }); // channel lip
      k.metal.rivets([sx * 0.292, -0.075, -0.8], [sx * 0.292, -0.075, 1.3], 9, 0.007, { c: 0xb0b0a8 });
    }
    for (let i = 0; i < 9; i++) { // rungs
      const z = -0.9 + i * 0.275;
      k.paint.cyl(0.013, 0.56, [0, -0.07, z], { axis: 'x', seg: 8, c: 0xc8ccd0 });
    }
    // planks across the rungs for the driver
    for (let i = 0; i < 3; i++) k.wood.box([0.5, 0.02, 0.12], [0, -0.04, 0.0 + i * 0.275 - 0.05], { c: new THREE.Color(0xd2bb90).multiplyScalar(0.8 + k.rand() * 0.25) });
    // rope cross-bracing under the rungs
    k.rope.tube([[-0.27, -0.1, -0.6], [0, -0.12, -0.2], [0.27, -0.1, 0.1]], 0.007, {});
    k.rope.tube([[0.27, -0.1, -0.6], [0, -0.12, -0.2], [-0.27, -0.1, 0.1]], 0.007, {});
    // step-ladder A-frame nose with paint tray
    k.paint.box([0.56, 0.03, 0.56], [0, 0.27, -0.78], { c: 0xc8ccd0, v: 0.04 });
    k.paint.box([0.56, 0.03, 0.02], [0, 0.295, -1.05], { c: 0xc8ccd0 });
    k.paint.box([0.02, 0.03, 0.56], [-0.28, 0.295, -0.78], { c: 0xc8ccd0 });
    k.paint.box([0.02, 0.03, 0.56], [0.28, 0.295, -0.78], { c: 0xc8ccd0 });
    for (const sx of [-1, 1]) {
      k.paint.bar([sx * 0.26, 0.26, -1.0], [sx * 0.3, -0.08, -1.28], 0.04, 0.03, { c: al }); // front legs
      k.paint.bar([sx * 0.26, 0.26, -0.58], [sx * 0.29, -0.08, -0.42], 0.04, 0.03, { c: al }); // back legs
      for (const t of [0.4, 0.75]) {
        const y = 0.26 - t * 0.34;
        k.paint.cyl(0.011, 0.58, [0, y, -1.0 - t * 0.28 + 0.0], { axis: 'x', seg: 6, c: 0xc8ccd0 });
      }
    }
    k.metal.rivets([-0.24, 0.288, -0.55], [0.24, 0.288, -0.55], 5, 0.008);
    // stuff on the tray: paint cans, a pail, a brush, bungee
    k.paint.cyl(0.065, 0.11, [-0.17, 0.34, -0.74], { seg: 12, c: 0xc83a2a });
    k.paint.cyl(0.067, 0.012, [-0.17, 0.399, -0.74], { seg: 12, c: 0xa8aaa6 });
    k.paint.cyl(0.065, 0.11, [0.12, 0.34, -0.7], { seg: 12, c: 0x2a5ea8 });
    k.paint.cyl(0.067, 0.012, [0.12, 0.399, -0.7], { seg: 12, c: 0xa8aaa6 });
    k.paint.box([0.1, 0.004, 0.1], [-0.17, 0.288, -0.84], { c: 0xc83a2a, r: [0, 0.4, 0] }); // spilled paint
    k.paint.box([0.12, 0.004, 0.06], [0.12, 0.288, -0.8], { c: 0x2a5ea8, r: [0, -0.3, 0] });
    k.wood.bar([0.0, 0.31, -0.93], [0.05, 0.31, -0.76], 0.02, 0.012, { c: 0xb09468 }); // brush handle
    k.paint.box([0.045, 0.02, 0.05], [-0.0, 0.31, -0.96], { c: 0x5a4a3a });
    k.rope.tube([[-0.26, 0.28, -0.6], [0.0, 0.42, -0.62], [0.26, 0.28, -0.6]], 0.007, { c: 0x181818, uvScale: 1 });
    k.paint.decal(DECAL.n3, [0.0, 0.287, -0.85], 0.001, 0.001);
    k.paint.decal(DECAL.plateA, [0.282, 0.2, -0.78], 0.2, 0.13, { r: [0, PI / 2, 0] });
    // seat: paint bucket rides on the rungs; tail with a red rag and reflector tape
    k.rope.lash([0, -0.04, 0.37], 'z', 0.19, 0.06, 5);
    k.paint.box([0.04, 0.003, 0.2], [0.0, -0.1, 1.38], { c: 0xc83a2a });
    k.wood.bar([0, -0.07, 1.3], [0, 0.35, 1.3], 0.02, 0.02, { c: 0xb09468 });
    k.paint.box([0.2, 0.12, 0.004], [0.1, 0.3, 1.3], { c: 0xd8352a, r: [0, 0.2, 0.1] });
    k.paint.decal(DECAL.checker, [0.0, -0.1, 1.5], 0.0001, 0.0001);
    // paddle/lever mount planks
    k.wood.box([0.6, 0.03, 0.12], [0, -0.065, -0.4], { c: 0xb59c70 });
  },
};

// ============================================================ 10. SLED DOG
const bedY = (z) => (z > -0.5 ? -0.02 : -0.02 + 0.36 * Math.pow((-z - 0.5) / 0.75, 2));
const bedSlope = (z) => (z > -0.5 ? 0 : -(2 * 0.36 / 0.75) * ((-z - 0.5) / 0.75));
const sledDog = {
  id: 'sled-dog', name: 'Sled Dog', seed: 1010,
  description: 'A toboggan on fat knobby tractor tyres: grips like a bulldog on rough ground and shrugs off bumps, but she\'s a heavy hauler and slow to get her paws moving.',
  stats: { mass: 108, dragCoef: 0.7, frontalArea: 0.6, rollingResist: 0.028, gripMul: 1.3, steerLock: 0.5, steerRate: 3.2, paddleEfficiency: 0.9, brakeForce: 640, suspension: { stiffness: 9500, damping: 850, travel: 0.1 } },
  layout: {
    R: 0.22, Rf: 0.22, WB: 1.5, T: 0.86, eyeY: 0.68, eyeZ: 0.22, floorY: -0.04,
    wheel: { type: 'tractor', W: 0.13, rim: 0x8a3a2a, tyre: 0x1c1c1c }, axleF: 'wood',
    steer: { type: 'bars', r: 0.2, col: 0x141414, col2: 0xa0a09a },
    seat: { kind: 'plank' }, paddleCol: 0x3a6a8a, gearCol: 0xe8e0c8, px: 0.3, lx: 0.26, pdz: -0.6,
    hl: { p: [0, 0.4, -1.22], style: 'lantern' }, flag: { p: [0.2, 0.28, -1.0], h: 0.5 },
    driver: { shirt: 0x3a6a8a, helmet: 0xe8e0c8 },
  },
  body(k) {
    const wd = (m) => new THREE.Color(0xd2bb90).multiplyScalar(m * (0.85 + k.rand() * 0.2));
    // main runners (straight) and curled nose runners
    for (const sx of [-1, 1]) {
      k.wood.bar([sx * 0.24, -0.11, -0.5], [sx * 0.24, -0.11, 1.05], 0.055, 0.09, { c: 0xa88e62 });
      k.metal.cyl(0.011, 1.55, [sx * 0.24, -0.165, 0.275], { axis: 'z', seg: 6, c: 0x8a8a84 });
      let prev = null;
      for (let i = 0; i <= 8; i++) {
        const z = -0.5 - i * (0.78 / 8), p = [sx * 0.24, bedY(z) - 0.09, z];
        if (prev) { k.wood.bar(prev, p, 0.055, 0.075, { c: 0xa88e62 }); k.metal.rod([prev[0], prev[1] - 0.04, prev[2]], [p[0], p[1] - 0.04, p[2]], 0.011, { seg: 6, c: 0x8a8a84 }); }
        prev = p;
      }
      k.wood.bar([sx * 0.24, bedY(-1.28) - 0.09, -1.28], [sx * 0.24, bedY(-1.28) + 0.03, -1.25], 0.05, 0.05, { c: 0xa88e62 });
    }
    // slatted bed following the curl
    for (let i = 0; i < 18; i++) {
      const zc = Math.max(-1.3, 0.95 - i * 0.13);
      k.wood.box([0.58, 0.02, 0.1], [0, bedY(zc), zc], { r: [Math.atan(-bedSlope(zc)), 0, 0], c: wd(0.9) });
      for (const x of [-0.24, 0.24]) k.metal.nail([x, bedY(zc) + 0.011, zc], 'y');
    }
    // side rails following the curl
    for (const sx of [-1, 1]) {
      let prev = [sx * 0.31, 0.12, 0.95];
      k.wood.bar([sx * 0.31, 0.12, 0.95], [sx * 0.31, 0.12, -0.45], 0.035, 0.035, { c: 0xa88e62 });
      prev = [sx * 0.31, 0.12, -0.45];
      for (let i = 1; i <= 7; i++) {
        const z = -0.45 - i * 0.12, p = [sx * 0.31, bedY(z) + 0.13, z];
        k.wood.bar(prev, p, 0.035, 0.035, { c: 0xa88e62 });
        prev = p;
      }
      for (const z of [0.9, 0.5, 0.1]) k.wood.bar([sx * 0.31, -0.03, z], [sx * 0.31, 0.12, z], 0.035, 0.035, { c: 0xa88e62 });
      for (const z of [-0.6, -0.85, -1.1]) k.wood.bar([sx * 0.31, bedY(z) + 0.0, z], [sx * 0.31, bedY(z) + 0.13, z], 0.03, 0.03, { c: 0xa88e62 });
    }
    // front board, rope pull-loop, fur trim and lashings
    k.wood.box([0.64, 0.1, 0.03], [0, bedY(-1.25) + 0.07, -1.3], { c: wd(0.8), r: [0.5, 0, 0] });
    k.rope.tube([[-0.26, 0.38, -1.3], [-0.14, 0.28, -1.65], [0.14, 0.28, -1.65], [0.26, 0.38, -1.3]], 0.013, {});
    k.rope.lash([0.26, 0.38, -1.3], 'y', 0.03, 0.06, 4);
    k.rope.lash([-0.26, 0.38, -1.3], 'y', 0.03, 0.06, 4);
    for (let i = 0; i < 16; i++) {
      const a = -1.2 + i * 0.16; // fur tufts along the nose edge
      k.paint.sph(0.035, [Math.sin(a) * 0.3, bedY(-1.25) + 0.16, -1.31 + Math.cos(a) * 0.04], { seg: 5, c: i % 3 ? 0xe8e4dc : 0xb8b4aa, s: [1, 1, 0.8] });
    }
    k.paint.decal(DECAL.n13, [0, bedY(-0.95) + 0.012, -0.95], 0.26, 0.26, { r: [-PI / 2 + Math.atan(-bedSlope(-0.95)) * 0, 0, 0] });
    k.paint.decal(DECAL.plateB, [0.322, 0.04, 0.5], 0.3, 0.19, { r: [0, PI / 2, 0] });
    // sheepskin seat pad and backrest sack
    k.paint.box([0.42, 0.04, 0.36], [0, 0.05, 0.36], { c: 0xe4dccc, v: 0.04 });
    k.wood.box([0.5, 0.32, 0.03], [0, 0.26, 0.74], { c: wd(0.9), r: [-0.25, 0, 0] });
    k.rope.lash([0, 0.1, 0.72], 'x', 0.03, 0.5, 6, { r: 0.007 });
    // lamp mount
    k.wood.box([0.14, 0.06, 0.26], [0, bedY(-1.15) + 0.1, -1.13], { c: 0xa68c62, r: [Math.atan(-bedSlope(-1.15)), 0, 0] });
    k.rope.lash([0, bedY(-1.15) + 0.08, -1.1], 'x', 0.05, 0.14, 3);
  },
};

export const MODELS_B = [doorDasher, crateComet, tinLizzie, ladderLarry, sledDog];
