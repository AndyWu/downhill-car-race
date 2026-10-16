// Trucks 1-5: Barrel Bomber, Pallet Pounder, Rust Bucket, Wagon Wheel Willy, Bathtub Betty
import * as THREE from 'three';
import { DECAL } from './textures.js';
import { pallet, spareWheel } from './helpers.js';

const PI = Math.PI;

// ============================================================ 1. BARREL BOMBER
const barrelBomber = {
  id: 'barrel-bomber', name: 'Barrel Bomber', seed: 101,
  description: 'An oil drum for a nose and knobbly mower tyres that bite the dirt like a bulldog, but a weak paddle arm and a stiff ride on the rough stuff.',
  stats: { mass: 88, dragCoef: 0.58, frontalArea: 0.55, rollingResist: 0.024, gripMul: 1.2, steerLock: 0.5, steerRate: 3.2, paddleEfficiency: 0.8, brakeForce: 520, suspension: { stiffness: 8500, damping: 720, travel: 0.05 } },
  flagColor: 0xd8352a, number: 7,
  layout: {
    R: 0.21, Rf: 0.21, WB: 1.3, T: 0.78, eyeY: 0.69, eyeZ: 0.2, floorY: -0.1,
    wheel: { type: 'mower', W: 0.1, rim: 0xb8352c, tyre: 0x1c1c1c }, axleF: 'wood',
    steer: { type: 'car', r: 0.17, col: 0x141414, col2: 0x8a8a84 },
    seat: { kind: 'crate', color: 0x2c5ea8 }, paddleCol: 0xe0b020, gearCol: 0xd2352a, px: 0.3,
    hl: { p: [0, 0.43, -1.0], style: 'flash' }, flag: { p: [0.15, 0.335, -0.93], side: 1, h: 0.42 },
    driver: { shirt: 0xb8352c, helmet: 0xe0b020 },
  },
  body(k) {
    const rail = (x) => k.wood.bar([x, -0.07, -0.95], [x, -0.07, 1.0], 0.06, 0.09, { c: 0xb59c70 });
    rail(-0.2); rail(0.2);
    // floor slats
    for (let i = 0; i < 9; i++) {
      const z = -0.3 + i * 0.115;
      k.wood.box([0.7, 0.02, 0.1], [0, -0.01, z], { r: [0, (k.rand() - 0.5) * 0.03, 0], c: new THREE.Color(0xd6c29a).multiplyScalar(0.75 + k.rand() * 0.3) });
      for (const x of [-0.2, 0.2]) k.metal.nail([x, 0.003, z], 'y');
    }
    // the drum
    const cy = 0.12, cz = -0.73, r = 0.24;
    k.metal.cyl(r, 0.86, [0, cy, cz], { axis: 'z', seg: 22, c: 0xc2432f, v: 0.04, tile: 0.7 });
    for (const z of [-0.5, -0.73, -0.96]) k.metal.tor(r + 0.004, 0.011, [0, cy, z], { seg: 22, rseg: 4, c: 0xa8321f });
    for (const z of [-0.3, -1.16]) k.metal.tor(r - 0.003, 0.02, [0, cy, z], { seg: 22, rseg: 5, c: 0x8a8a84 });
    k.metal.cyl(r - 0.012, 0.012, [0, cy, -1.166], { axis: 'z', seg: 22, c: 0xa8321f });
    k.metal.cyl(0.032, 0.02, [0.1, cy + 0.08, -1.172], { axis: 'z', seg: 8, c: 0x555048 }); // bung
    k.metal.cyl(0.02, 0.012, [0.1, cy + 0.08, -1.184], { axis: 'z', seg: 6, c: 0x9a9a92 });
    k.metal.cyl(0.032, 0.02, [-0.1, cy - 0.06, -1.172], { axis: 'z', seg: 8, c: 0x555048 });
    k.paint.decal(DECAL.bomber, [r + 0.002, cy + 0.01, cz - 0.04], 0.5, 0.22, { r: [0, PI / 2, 0] });
    k.paint.decal(DECAL.bomber, [-r - 0.002, cy + 0.01, cz - 0.04], 0.5, 0.22, { r: [0, -PI / 2, 0] });
    k.paint.decal(DECAL['n' + this.number], [0, cy + r + 0.002, -0.5], 0.15, 0.15, { r: [-PI / 2, 0, 0] });
    // dents/rust patches
    k.paint.tape([0.2, 0.2, -0.9], [0.04, 0.003, 0.14], { r: [0, 0, -0.55] });
    k.paint.tape([-0.17, 0.25, -0.62], [0.12, 0.003, 0.03], { r: [0, 0.1, 0.8] });
    // rope lashings holding the drum to the rails
    for (const z of [-0.42, -1.04]) k.rope.lash([0, cy, z], 'z', r + 0.018, 0.05, 5, { r: 0.0085 });
    // bungee over the crate seat
    k.rope.tube([[-0.2, -0.04, 0.5], [-0.18, 0.2, 0.52], [0, 0.4, 0.5], [0.18, 0.2, 0.52], [0.2, -0.04, 0.5]], 0.007, { c: 0x181818, rseg: 4, uvScale: 1 });
    // backrest planks + stovepipe
    for (let i = 0; i < 3; i++) k.wood.box([0.52, 0.1, 0.02], [0, 0.18 + i * 0.12, 0.62 + i * 0.03], { r: [-0.25, 0, 0], c: 0xc6ab7e });
    for (const x of [-0.24, 0.24]) k.wood.bar([x, -0.04, 0.6], [x, 0.5, 0.74], 0.04, 0.03, { c: 0xa68c62 });
    k.metal.cyl(0.055, 0.5, [0.3, 0.2, 0.92], { seg: 10, open: true, c: 0xe8b820 });
    k.metal.cyl(0.055, 0.55, [0.3, 0.72, 0.92], { seg: 10, open: true, c: 0x3a3632 });
    k.metal.cyl(0.0, 0.1, [0.3, 1.04, 0.92], { seg: 10, r2: 0.09, c: 0x6a625a });
    k.metal.tor(0.058, 0.01, [0.3, 0.46, 0.92], { r: [PI / 2, 0, 0], seg: 10, rseg: 4, c: 0x8a8a84 });
    k.rope.lash([0.3, 0.75, 0.92], 'y', 0.06, 0.05, 3);
    k.rope.lash([0.3, 0.1, 0.92], 'y', 0.055, 0.05, 3);
    k.wood.box([0.1, 0.06, 0.1], [0.3, -0.02, 0.92], { c: 0xa68c62 });
    // rear board with number plate
    k.wood.box([0.74, 0.12, 0.025], [0, 0.0, 1.0], { c: 0xc0a77a });
    k.paint.decal(DECAL.plateA, [0, 0.0, 1.016], 0.3, 0.19);
    spareWheel(k, [0, 0.2, 1.1], 0.27, 'tyre', 0xc83a28);
    k.paint.decal(DECAL['n' + this.number], [r + 0.002, cy + 0.1, -0.2], 0.2, 0.2, { r: [0, PI / 2, 0] });
    // diagonal braces
    k.wood.bar([-0.2, -0.04, -0.3], [-0.22, 0.05, -0.55], 0.03, 0.03, { c: 0xa68c62 });
    k.wood.bar([0.2, -0.04, -0.3], [0.22, 0.05, -0.55], 0.03, 0.03, { c: 0xa68c62 });
    // mount block for torch on top of drum
    k.wood.box([0.12, 0.05, 0.3], [0, cy + r + 0.012, -0.98], { c: 0xa68c62, r: [0.06, 0, 0] });
    k.rope.lash([0, cy + r + 0.03, -0.9], 'x', 0.05, 0.12, 3);
  },
};

// ============================================================ 2. PALLET POUNDER
const palletPounder = {
  id: 'pallet-pounder', name: 'Pallet Pounder', seed: 202,
  description: 'Built like a barn door and about as slippery as one: slowest down the hill and sluggish in the turns, but nothing stops quicker once you stand on the brakes.',
  stats: { mass: 138, dragCoef: 1.0, frontalArea: 0.95, rollingResist: 0.018, gripMul: 1.1, steerLock: 0.38, steerRate: 2.2, paddleEfficiency: 0.95, brakeForce: 950, suspension: { stiffness: 13000, damping: 1200, travel: 0.05 } },
  flagColor: 0x1f7a3f, number: 42,
  layout: {
    R: 0.25, Rf: 0.25, WB: 1.45, T: 0.86, eyeY: 0.65, eyeZ: 0.22, floorY: -0.07,
    wheel: { type: 'cart', W: 0.11, rim: 0x3f6aa3, tyre: 0x1a1a1a }, axleF: 'wood',
    steer: { type: 'disc', r: 0.18, col: 0xb89a6a, col2: 0x8a8a84 },
    seat: { kind: 'plank' }, paddleCol: 0x2f8f4f, paddleCol2: 0x2f8f4f, gearCol: 0xe8e0c8, px: 0.3,
    hl: { p: [0, 0.2, -0.98], style: 'lantern' }, flag: { p: [0.27, 0.285, -0.66], side: -1, h: 0.42 },
    driver: { shirt: 0x2f8f4f, helmet: 0xe8e0c8 },
  },
  body(k) {
    pallet(k, 0, -0.07, 0.12, 0.84, 1.25, { boards: 7 });
    // skids
    for (const x of [-0.3, 0.3]) k.wood.bar([x, -0.2, -0.6], [x, -0.2, 0.8], 0.06, 0.06, { c: 0xa88e62 });
    // sloped prow pallet (hood)
    const th = 0.576;
    pallet(k, 0, 0.145, -0.85, 0.7, 0.72, { rx: -th, boards: 6, tone: 0xcdb78c, missing: [2] });
    // steel brackets with rivets where prow meets deck
    for (const x of [-0.3, 0.3]) {
      k.metal.box([0.04, 0.2, 0.012], [x, 0.1, -0.5], { c: 0x6a625a, r: [-0.4, 0, 0] });
      k.metal.rivets([x, 0.03, -0.5], [x, 0.17, -0.52], 3, 0.007);
    }
    for (const x of [-0.25, 0.25]) k.wood.bar([x, -0.05, -0.55], [x, 0.18, -0.62], 0.04, 0.04, { c: 0xa88e62 });
    // front pipe bumper
    k.metal.cyl(0.026, 0.8, [0, -0.04, -1.22], { axis: 'x', seg: 8, c: 0x6a625a });
    for (const x of [-0.3, 0.3]) k.metal.rod([x, -0.04, -1.22], [x, -0.04, -0.9], 0.02, { seg: 6, c: 0x6a625a });
    // plate + painted number on the hood
    k.withXf([0, 0.147, -0.85], [-th, 0, 0], () => {
      k.paint.decal(DECAL['n' + this.number], [-0.17, 0.004, 0.0], 0.24, 0.24, { r: [-PI / 2, 0, 0] });
      k.paint.decal(DECAL.plateB, [0.18, 0.004, -0.04], 0.26, 0.17, { r: [-PI / 2, 0, 0] });
      k.paint.tape([0.0, 0.003, 0.2], [0.18, 0.003, 0.06], {});
    });
    // standing pallet backrest, reclined
    pallet(k, 0, 0.3, 0.7, 0.62, 0.56, { rx: -1.38, boards: 5 });
    // tall yellow race-number billboard on posts: readable from far behind
    for (const x of [-0.22, 0.22]) k.wood.bar([x, -0.07, 0.8], [x, 0.9, 0.84], 0.05, 0.05, { c: 0xb59c70 });
    k.paint.box([0.62, 0.5, 0.025], [0, 0.82, 0.84], { c: 0xf2c200, v: 0.04 });
    k.paint.decal(DECAL['n' + this.number], [0, 0.82, 0.8535], 0.44, 0.44);
    k.paint.decal(DECAL['n' + this.number], [0, 0.82, 0.8265], 0.44, 0.44, { r: [0, PI, 0] });
    k.paint.tape([0.2, 0.62, 0.857], [0.1, 0.05, 0.003], { r: [0, 0, 0.6] });
    // chain and padlock
    k.metal.tor(0.045, 0.006, [0.22, -0.02, 0.77], { r: [0, PI / 2, 0], seg: 10, rseg: 4, c: 0x3a3632 });
    k.rope.lash([0, 0.05, 0.7], 'x', 0.04, 0.3, 4);
    // rope-wrapped tow handle and rear bumper tyre
    k.wood.bar([-0.3, -0.07, 0.72], [-0.3, 0.15, 0.78], 0.04, 0.04, { c: 0xa88e62 });
    k.wood.bar([0.3, -0.07, 0.72], [0.3, 0.15, 0.78], 0.04, 0.04, { c: 0xa88e62 });
    k.rope.tube([[-0.3, 0.15, 0.8], [-0.15, 0.2, 0.9], [0.15, 0.2, 0.9], [0.3, 0.15, 0.8]], 0.014, {});
  },
};

// ============================================================ 3. RUST BUCKET
const rustBucket = {
  id: 'rust-bucket', name: 'Rust Bucket', seed: 303,
  description: 'Corrugated tin tub that rattles like a hailstorm: plenty of travel in the springs and good brakes, but she is a porky, wide-turning old bucket.',
  stats: { mass: 112, dragCoef: 0.82, frontalArea: 0.72, rollingResist: 0.02, gripMul: 1.0, steerLock: 0.42, steerRate: 2.4, paddleEfficiency: 0.9, brakeForce: 780, suspension: { stiffness: 11000, damping: 950, travel: 0.13 } },
  flagColor: 0xe8872a, number: 9,
  layout: {
    R: 0.24, Rf: 0.24, WB: 1.4, T: 0.82, eyeY: 0.66, eyeZ: 0.2, floorY: -0.07,
    wheel: { type: 'cart', W: 0.11, rim: 0xb04a22, tyre: 0x222222, knobs: true }, axleF: 'metal',
    steer: { type: 'car', r: 0.18, col: 0x2a2018, col2: 0xc0b090 },
    seat: { kind: 'bucket' }, paddleCol: 0x8a8a84, paddleCol2: 0x8a8a84, gearCol: 0xc7a23a, px: 0.31,
    hl: { p: [0, 0.2, -1.04], style: 'can' }, flag: { p: [0.23, 0.275, -0.58], side: 1, h: 0.42 },
    driver: { shirt: 0x6a7a3a, helmet: 0xb04a22 },
  },
  body(k) {
    // tin floor on wooden rails
    k.metal.corr(0.62, 1.4, [0, -0.07, 0.1], { c: 0xffffff });
    for (const x of [-0.25, 0.25]) k.wood.bar([x, -0.115, -0.7], [x, -0.115, 0.85], 0.05, 0.05, { c: 0xa88e62 });
    // side panels (ridges along z, standing)
    for (const sx of [-1, 1]) {
      k.metal.corr(0.26, 1.15, [sx * 0.32, 0.06, 0.18], { r: [0, 0, PI / 2], c: 0xa8c4de });
      k.metal.cyl(0.013, 1.15, [sx * 0.32, 0.19, 0.18], { axis: 'z', seg: 8, c: 0x7a6a5e }); // rolled hem
      k.metal.rivets([sx * 0.325, 0.12, -0.3], [sx * 0.325, 0.12, 0.7], 11, 0.008);
      k.metal.rivets([sx * 0.325, -0.03, -0.3], [sx * 0.325, -0.03, 0.7], 11, 0.008);
      // hood skirt triangles
      k.metal.add(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.5, 0.33), new THREE.Vector2(-1.17, 0.0), new THREE.Vector2(-0.5, 0.0)])).rotateY(-PI / 2), { p: [sx * 0.295, -0.03, 0], c: 0xe0d0c8 });
    }
    // sloped corrugated hood
    const th = 0.457;
    k.metal.corr(0.6, 0.72, [0, 0.15, -0.825], { r: [-th, 0, 0] });
    k.metal.cyl(0.014, 0.6, [0, 0.0, -1.165], { axis: 'x', seg: 8, c: 0x7a6a5e });
    for (const sx of [-1, 1]) k.metal.rivets([sx * 0.27, 0.03, -1.1], [sx * 0.27, 0.3, -0.52], 9, 0.008);
    // cowl / dash: vertical panel, ridges vertical
    k.metal.corr(0.44, 0.62, [0, 0.11, -0.47], { r: [PI / 2, 0, 0], c: 0xe8d0c0 });
    k.metal.cyl(0.015, 0.62, [0, 0.33, -0.475], { axis: 'x', seg: 8, c: 0x6a5a50 });
    // patches: new galvanised sheet with rivets, duct tape
    k.paint.box([0.2, 0.003, 0.16], [-0.12, 0.2, -0.7], { c: 0xc0c4c2, r: [-th, 0.15, 0] });
    k.paint.box([0.16, 0.003, 0.2], [0.12, 0.04, -1.0], { c: 0xb4b8b6, r: [-th, -0.1, 0] });
    k.paint.tape([0.02, 0.27, -0.55], [0.2, 0.003, 0.06], { r: [-th, 0.4, 0] });
    k.paint.decal(DECAL['n' + this.number], [0.0, 0.185, -0.74], 0.26, 0.26, { r: [-PI / 2 - th, 0, 0] });
    k.paint.decal(DECAL.plateA, [0.315 + 0.012, 0.06, 0.62], 0.3, 0.19, { r: [0, PI / 2, 0] });
    // curved tin backrest
    k.metal.corr(0.56, 0.5, [0, 0.3, 0.65], { r: [PI / 2 - 0.18, 0, 0], c: 0xa8c4de });
    k.metal.cyl(0.014, 0.56, [0, 0.53, 0.69], { axis: 'x', seg: 8, c: 0x6a5a50 });
    // exhaust pipe made from stove-pipe along the right side
    k.metal.cyl(0.04, 0.9, [0.37, 0.01, 0.35], { axis: 'z', seg: 10, open: true, c: 0xb0a090 });
    k.metal.cyl(0.04, 0.012, [0.37, 0.01, 0.8], { axis: 'z', seg: 10, c: 0x2a2622 });
    for (const z of [0.0, 0.5, 0.75]) k.rope.lash([0.37, 0.01, z], 'z', 0.048, 0.03, 3, { r: 0.006 });
    k.wood.bar([0.34, -0.03, 0.0], [0.37, -0.03, 0.75], 0.03, 0.03, { c: 0xa88e62 });
    // orange jerry cans and a rope coil stacked on the tail: distinct rear profile
    for (const [x, y, z] of [[0.14, 0.14, 0.97], [-0.08, 0.14, 0.97], [0.03, 0.37, 0.97]]) {
      k.paint.box([0.2, 0.26, 0.1], [x, y, z], { c: 0xe8780f, v: 0.08 });
      k.paint.box([0.12, 0.04, 0.05], [x, y + 0.15, z], { c: 0xc8620a });
      k.paint.cyl(0.03, 0.04, [x + 0.05, y + 0.16, z + 0.03], { seg: 8, c: 0x2a2622 });
      k.paint.box([0.06, 0.1, 0.004], [x, y, z + 0.052], { c: 0xf0e8d0 });
    }
    k.rope.tor(0.1, 0.022, [0.22, 0.28, 1.04], { seg: 14, rseg: 5, uvScale: 1 });
    // tall tin chimney with a rain cap (bold silhouette)
    k.metal.cyl(0.06, 1.0, [-0.3, 0.45, 0.62], { seg: 12, open: true, c: 0xa8c4de });
    k.metal.cyl(0.0, 0.12, [-0.3, 1.01, 0.62], { seg: 12, r2: 0.11, c: 0xd8c8c0 });
    k.metal.tor(0.064, 0.01, [-0.3, 0.5, 0.62], { r: [PI / 2, 0, 0], seg: 12, rseg: 4, c: 0x7a6a5e });
    k.metal.tor(0.064, 0.01, [-0.3, 0.8, 0.62], { r: [PI / 2, 0, 0], seg: 12, rseg: 4, c: 0x7a6a5e });
    k.rope.lash([-0.3, 0.2, 0.62], 'y', 0.07, 0.06, 3);
    k.wood.bar([-0.3, -0.03, 0.55], [-0.3, 0.3, 0.62], 0.03, 0.03, { c: 0xa88e62 });
    // wood block to mount the can lamp
    k.wood.box([0.1, 0.06, 0.2], [0, 0.09, -1.0], { c: 0xa68c62, r: [-th, 0, 0] });
  },
};

// ============================================================ 4. WAGON WHEEL WILLY
const wagonWheelWilly = {
  id: 'wagon-wheel-willy', name: 'Wagon Wheel Willy', seed: 404,
  description: 'Big spoked wagon wheels roll forever and she is the easiest to paddle, but the iron tyres skate on loose ground and the brakes are mostly prayer.',
  stats: { mass: 96, dragCoef: 0.85, frontalArea: 0.8, rollingResist: 0.012, gripMul: 0.72, steerLock: 0.5, steerRate: 3.0, paddleEfficiency: 1.2, brakeForce: 300, suspension: { stiffness: 6200, damping: 520, travel: 0.09 } },
  flagColor: 0xf2c200, number: 5,
  layout: {
    R: 0.33, Rf: 0.29, WB: 1.5, T: 0.84, eyeY: 0.57, eyeZ: 0.22, floorY: -0.15,
    wheel: { type: 'wood', W: 0.07, spokes: 12 }, axleF: 'wood',
    steer: { type: 'helm', r: 0.2, col: 0x6b4a2a, col2: 0xb08a38 },
    seat: { kind: 'plank' }, paddleCol: 0x3a6a8a, gearCol: 0xb08a38, px: 0.28, pdz: -0.62,
    hl: { p: [0, 0.22, -1.46], style: 'lantern' }, flag: { p: [0.2, 0.12, -0.9], side: -1, h: 0.42 },
    driver: { shirt: 0x8a3a2a, helmet: 0x6a4a2a },
  },
  body(k) {
    const wd = (c) => new THREE.Color(0xd2bb90).multiplyScalar(c);
    // reach and bed floor
    k.wood.bar([0, -0.12, -0.75], [0, -0.12, 0.75], 0.06, 0.07, { c: 0xa88e62 });
    for (let i = 0; i < 10; i++) {
      const z = -0.5 + i * 0.145;
      k.wood.box([0.64, 0.025, 0.13], [0, -0.14, z], { c: wd(0.75 + k.rand() * 0.3), r: [0, (k.rand() - 0.5) * 0.02, 0] });
    }
    // wagon box sides: two planks each
    for (const sx of [-1, 1]) {
      for (const [y, c] of [[-0.09, 0.9], [-0.0, 1.0]]) k.wood.box([0.025, 0.085, 1.45], [sx * 0.325, y, 0.2], { c: wd(c) });
      for (const z of [-0.5, 0.2, 0.9]) k.wood.box([0.045, 0.2, 0.05], [sx * 0.34, -0.03, z], { c: wd(0.7) });
      k.metal.rivets([sx * 0.352, -0.09, -0.5], [sx * 0.352, -0.09, 0.9], 8, 0.007);
    }
    k.wood.box([0.64, 0.18, 0.025], [0, -0.04, 0.93], { c: wd(0.85) }); // tailgate
    k.paint.box([0.62, 0.17, 0.004], [0, -0.04, 0.945], { c: 0xf2c200, v: 0.05 });
    k.paint.decal(DECAL['n' + this.number], [0.0, -0.04, 0.9485], 0.16, 0.16);
    k.paint.decal(DECAL.plateA, [0.2, -0.04, 0.9485], 0.18, 0.11);
    // toolbox hood with sloped lid
    k.wood.box([0.52, 0.28, 0.5], [0, 0.0, -0.74], { c: wd(0.8) }); // body (hidden mostly)
    for (const sx of [-1, 1]) k.wood.box([0.02, 0.3, 0.52], [sx * 0.27, 0.0, -0.74], { c: wd(0.85) });
    for (let i = 0; i < 5; i++) {
      const x = -0.2 + i * 0.1;
      k.wood.box([0.09, 0.02, 0.58], [x, 0.17, -0.75], { r: [-0.12, 0, 0], c: wd(0.85 + k.rand() * 0.25) });
    }
    k.wood.box([0.54, 0.26, 0.022], [0, 0.0, -1.0], { c: wd(0.9) });
    for (const z of [-0.95, -0.7, -0.55]) { // iron straps over the lid
      k.metal.box([0.5, 0.012, 0.035], [0, 0.185 - (z + 0.75) * 0.12 + 0.02, z], { c: 0x4a443e, r: [-0.12, 0, 0] });
    }
    k.metal.box([0.04, 0.05, 0.02], [0, 0.07, -1.015], { c: 0x6a625a }); // hasp
    k.metal.box([0.035, 0.05, 0.025], [0, 0.03, -1.03], { c: 0xb09a3a }); // padlock
    k.paint.decal(DECAL.willy, [0.282, 0.04, -0.78], 0.42, 0.18, { r: [0, PI / 2, 0] });
    k.paint.decal(DECAL.willy, [-0.282, 0.04, -0.78], 0.42, 0.18, { r: [0, -PI / 2, 0] });
    // wagon tongue, hounds and doubletree
    k.wood.bar([0, -0.07, -0.45], [0, -0.04, -1.7], 0.07, 0.09, { c: 0xa88e62 });
    for (const sx of [-1, 1]) k.wood.bar([sx * 0.32, -0.08, -0.75], [sx * 0.03, -0.06, -1.25], 0.05, 0.05, { c: 0xa88e62 });
    k.wood.box([0.7, 0.05, 0.06], [0, -0.0, -1.62], { c: wd(0.75) });
    for (const sx of [-1, 1]) k.metal.tor(0.03, 0.006, [sx * 0.34, 0.0, -1.62], { r: [0, PI / 2, 0], seg: 10, rseg: 4, c: 0x3a3632 });
    k.metal.box([0.1, 0.012, 0.16], [0, 0.0, -1.62], { c: 0x4a443e });
    k.metal.rivets([-0.03, 0.01, -1.67], [0.03, 0.01, -1.57], 3, 0.006);
    k.rope.lash([0, -0.04, -1.5], 'z', 0.05, 0.1, 5);
    // lamp post
    k.wood.bar([0, -0.04, -1.36], [0, 0.17, -1.36], 0.045, 0.045, { c: 0xa88e62 });
    k.rope.lash([0, 0.12, -1.36], 'y', 0.036, 0.07, 4);
    k.wood.bar([0, 0.1, -1.36], [0, 0.17, -1.4], 0.03, 0.03, { c: 0xa88e62 });
    // seat rails
    for (const sx of [-1, 1]) k.wood.bar([sx * 0.3, -0.1, 0.1], [sx * 0.3, 0.07, 0.4], 0.04, 0.04, { c: 0xa88e62 });
    // canvas wagon bonnet over the back half: white dome visible from afar
    for (const z of [0.58, 0.8, 1.0]) k.wood.tube(Array.from({ length: 9 }, (_, i) => { const t = (i / 8) * PI; return [Math.cos(t) * 0.36, Math.sin(t) * 0.46 - 0.02, z]; }), 0.013, { c: 0xb59c70, uvScale: 1, rseg: 5 });
    k.paint.add(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 18, 1, true, -PI / 2, PI).scale(0.95, 1, 1.25).rotateX(-PI / 2), { p: [0, -0.02, 0.8], c: 0xf0e8d0, v: 0.04, grime: 0.5 });
    // canvas rear flap with the race number: closes the dome so it reads from behind
    k.paint.add(new THREE.CircleGeometry(0.4, 20, 0, PI).scale(0.95, 1.15, 1), { p: [0, -0.02, 1.06], c: 0xf0e8d0, v: 0.04, grime: 0.5 });
    k.paint.decal(DECAL['n' + this.number], [0, 0.2, 1.064], 0.3, 0.3);
    // bucket hung from tailgate
    k.metal.cyl(0.07, 0.14, [0.17, 0.0, 1.0], { r2: 0.055, seg: 12, open: true, c: 0xbab6aa });
    k.rope.tube([[0.1, 0.07, 0.99], [0.17, 0.14, 0.99], [0.24, 0.07, 0.99]], 0.005, {});
    k.metal.cyl(0.015, 0.1, [0.11, -0.12, 0.7], { axis: 'x', seg: 6, c: 0x555048 });
  },
};

// ============================================================ 5. BATHTUB BETTY
function tubProfile() {
  return [[0.0, 0.0], [0.45, 0.0], [0.82, 0.07], [0.97, 0.22], [1.0, 0.45], [0.995, 0.8], [1.03, 0.95], [1.06, 1.0], [1.03, 1.04], [0.98, 1.03], [0.95, 0.96], [0.93, 0.8], [0.92, 0.5], [0.85, 0.27], [0.5, 0.1], [0.0, 0.08]];
}
const bathtubBetty = {
  id: 'bathtub-betty', name: 'Bathtub Betty', seed: 505,
  description: 'A cast-iron clawfoot tub on wheels: the softest ride on the hill, but she steers like a cow and takes a heap of paddling to get moving.',
  stats: { mass: 150, dragCoef: 0.8, frontalArea: 0.75, rollingResist: 0.02, gripMul: 0.95, steerLock: 0.35, steerRate: 2.0, paddleEfficiency: 0.7, brakeForce: 480, suspension: { stiffness: 7200, damping: 1500, travel: 0.15 } },
  flagColor: 0xe7508a, number: 3,
  layout: {
    R: 0.24, Rf: 0.24, WB: 1.45, T: 0.88, eyeY: 0.66, eyeZ: 0.25, floorY: -0.045,
    wheel: { type: 'cart', W: 0.1, rim: 0xd6d4ca, tyre: 0x151515 }, axleF: 'wood',
    steer: { type: 'car', r: 0.17, col: 0xe6a0b8, col2: 0xd6d4ca },
    seat: { kind: 'plank' }, paddleCol: 0xe7508a, gearCol: 0xe7508a, px: 0.21, lx: 0.27, ldz: -0.3,
    hl: { p: [0, 0.4, -0.9], style: 'bike' }, flag: { p: [0.17, 0.335, -0.755], side: 1, h: 0.42, col: 0xd6d4ca },
    driver: { shirt: 0xe7508a, helmet: 0xf0e8d8 },
  },
  body(k) {
    const z0 = -0.05, y0 = -0.09, sx = 0.34, sy = 0.4, sz = 0.8;
    k.paint.lathe(tubProfile(), [0, y0, z0], { seg: 28, s: [sx, sy, sz], c: 0xe8e4d6, v: 0.02, grime: 1 });
    // chips of enamel showing rust
    for (const [x, z, y] of [[0.3, -0.5, 0.15], [-0.33, 0.1, 0.2], [0.28, 0.45, 0.18], [-0.2, -0.68, 0.3]]) k.paint.box([0.05, 0.012, 0.035], [x, y, z], { c: 0x8a5028, r: [0, 0.5, 0.9] });
    // frame rails and claw feet
    for (const x of [-0.23, 0.23]) k.wood.bar([x, -0.2, -0.95], [x, -0.2, 1.0], 0.06, 0.07, { c: 0xa88e62 });
    for (const [x, z] of [[-0.23, -0.55], [0.23, -0.55], [-0.23, 0.5], [0.23, 0.5]]) {
      k.paint.sph(0.045, [x, -0.14, z], { c: 0xc9a850, seg: 8 });
      for (let t = 0; t < 3; t++) {
        const a = (t / 3) * PI * 2 + 0.5;
        k.paint.cyl(0.0, 0.07, [x + Math.cos(a) * 0.035, -0.17, z + Math.sin(a) * 0.035], { seg: 5, c: 0xc9a850, r2: 0.012, r: [0.0, 0, 0] });
      }
      k.paint.cyl(0.04, 0.05, [x, -0.1, z], { seg: 8, c: 0xc9a850, r2: 0.03 });
    }
    // planks wedged across the tub for the seat and levers
    k.wood.box([0.62, 0.03, 0.12], [0, 0.075, z0 + 0.25], { c: 0xb59c70 });
    k.wood.box([0.66, 0.025, 0.1], [0, 0.08, 0.41], { c: 0xb59c70, r: [0, 0.06, 0] });
    // faucet and taps at the front end of the tub
    const fz = z0 - sz * 0.93, fy = y0 + sy * 1.04;
    const fx = -0.16;
    k.paint.cyl(0.025, 0.1, [fx, fy + 0.04, fz], { seg: 8, c: 0xd0d4d6, v: 0.05 });
    k.paint.tube([[fx, fy + 0.08, fz], [fx, fy + 0.15, fz - 0.0], [fx, fy + 0.17, fz + 0.06], [fx, fy + 0.12, fz + 0.12]], 0.014, { rseg: 5, c: 0xd0d4d6, uvScale: 1 });
    for (const dx of [-0.07, 0.07]) {
      k.paint.cyl(0.012, 0.07, [fx + dx, fy + 0.07, fz], { seg: 6, c: 0xd0d4d6 });
      k.paint.cyl(0.026, 0.025, [fx + dx, fy + 0.11, fz], { seg: 6, c: dx < 0 ? 0xc02a2a : 0x2a4ac0 });
    }
    // wire coat-hanger bracket + tape for headlamp
    k.wood.box([0.08, 0.05, 0.1], [0, fy - 0.01, fz + 0.06], { c: 0xa68c62 });
    k.rope.lash([0, fy + 0.0, fz + 0.06], 'x', 0.04, 0.1, 3);
    k.paint.decal(DECAL.betty, [sx * 0.99 + 0.0, y0 + 0.2, z0 + 0.12], 0.4, 0.2, { r: [0, PI / 2, 0], grime: 0 });
    k.paint.decal(DECAL.betty, [-sx * 0.99, y0 + 0.2, z0 + 0.12], 0.4, 0.2, { r: [0, -PI / 2, 0] });
    k.paint.decal(DECAL['n' + this.number], [sx * 0.97, y0 + 0.23, z0 - 0.3], 0.18, 0.18, { r: [0, PI / 2, 0] });
    // drain chain and plug
    k.metal.tube([[0.1, 0.0, 0.3], [0.14, -0.04, 0.34], [0.2, -0.05, 0.4], [0.24, -0.02, 0.45]], 0.005, { c: 0xc0c0b8, uvScale: 1, rseg: 3 });
    k.rope.lash([-0.2, 0.0, 0.57], 'x', 0.02, 0.12, 2);
    // pink and white parasol on a pole behind the driver: unmistakable at distance
    k.metal.rod([0, 0.0, 0.62], [0, 1.0, 0.7], 0.012, { seg: 6, c: 0xd0d0c8 });
    k.paint.lathe([[0.001, 0.2], [0.18, 0.17], [0.4, 0.09], [0.62, -0.02], [0.6, -0.05]], [0, 0.9, 0.7], { seg: 16, colorFn: (i, x, y, z, u) => ((Math.floor(u * 8) % 2) ? new THREE.Color(0xe7508a) : new THREE.Color(0xf2ece0)), grime: 0 });
    k.paint.sph(0.02, [0, 1.12, 0.7], { c: 0xe7508a, seg: 6 });
    // back rest: a headboard of planks
    k.wood.box([0.5, 0.35, 0.03], [0, 0.27, 0.62], { c: 0xb59c70, r: [-0.2, 0, 0] });
  },
};

export const MODELS_A = [barrelBomber, palletPounder, rustBucket, wagonWheelWilly, bathtubBetty];
