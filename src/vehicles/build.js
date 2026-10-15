// Assembles a truck: model body + shared cockpit rig + wheels + moving parts.
import * as THREE from 'three';
import { Kit } from './kit.js';
import { applyMudCoat } from '../graphics/mudcoat.js';
import {
  buildWheelGeometry, makeWheelObject, buildSteeringWheelMesh, buildPaddle, buildLever,
  addSeat, addHeadlight, addFlagPole, buildDriver,
} from './parts.js';

function addAxles(k, L) {
  const { WB, T, R, Rf } = L;
  const zf = -WB / 2, zr = WB / 2, yf = Rf - R;
  const half = T / 2 - 0.02;
  // front axle: pivoting wooden beam with a king bolt and steering ropes
  if ((L.axleF || 'wood') === 'wood') {
    k.wood.box([half * 2, 0.07, 0.08], [0, yf - 0.01, zf], { c: 0xa98c60 });
    k.metal.cyl(0.02, 0.2, [0, yf + 0.04, zf], { seg: 8, c: 0x6a625a }); // king bolt
    for (const sx of [-1, 1]) k.metal.cyl(0.018, 0.05, [sx * (half + 0.03), yf, zf], { axis: 'x', seg: 6, c: 0x555048 });
    for (const sx of [-1, 1]) k.rope.lash([sx * 0.12, yf - 0.01, zf], 'x', 0.05, 0.05, 3);
  } else {
    k.metal.cyl(0.022, half * 2, [0, yf, zf], { axis: 'x', seg: 8, c: 0x8a8a84 });
    k.metal.box([0.14, 0.05, 0.1], [0, yf + 0.03, zf], { c: 0x6a625a });
    k.metal.cyl(0.02, 0.2, [0, yf + 0.06, zf], { seg: 8, c: 0x6a625a });
  }
  // rear axle: steel pipe with u-bolts onto the frame
  k.metal.cyl(0.021, half * 2, [0, 0, zr], { axis: 'x', seg: 8, c: 0x7a7a74 });
  for (const sx of [-1, 1]) {
    k.metal.cyl(0.03, 0.05, [sx * (half + 0.03), 0, zr], { axis: 'x', seg: 8, c: 0x4a4640 });
    k.metal.box([0.03, 0.09, 0.07], [sx * 0.2, 0.025, zr], { c: 0x5a544c }); // u-bolt plates
  }
  // brake shoe on the rear axle, fed by the handbrake rod
  k.metal.box([0.12, 0.04, 0.05], [-0.1, -0.03, zr + 0.04], { c: 0x3a3430 });
}

export function assemble(def, materials) {
  const L = def.layout;
  const k = new Kit(def.seed, materials);
  k.groundY = -L.R;
  const group = new THREE.Group();
  group.name = def.id;

  // ---- model body
  def.body(k, L);
  addAxles(k, L);

  // ---- cockpit rig (static bits)
  const eyeY = L.eyeY, eyeZ = L.eyeZ;
  const st = { type: 'car', r: 0.17, col: 0x1c1c1c, col2: 0x9a9a92, tilt: 0.9, dz: -0.48, dy: -0.285, ...L.steer };
  st.r *= 0.58;
  const wc = [0, eyeY + st.dy, eyeZ + st.dz];
  const Lc = 0.34;
  const base = [0, wc[1] - Math.sin(st.tilt) * Lc, wc[2] - Math.cos(st.tilt) * Lc];
  k.metal.rod(base, [0, wc[1] - Math.sin(st.tilt) * 0.03, wc[2] - Math.cos(st.tilt) * 0.03], 0.017, { seg: 8, c: 0x9a9a92, v: 0.06 });
  k.metal.cyl(0.04, 0.03, [0, base[1], base[2]], { seg: 8, c: 0x5a544c });
  k.wood.bar([0, L.floorY, base[2] + 0.02], [0, base[1] - 0.02, base[2]], 0.06, 0.05, { c: 0xa88e62 }); // column post
  k.wood.bar([0, L.floorY + 0.02, base[2] + 0.2], [0, base[1] - 0.02, base[2]], 0.04, 0.04, { c: 0xa88e62 }); // rear brace
  k.rope.lash([0, (base[1] + L.floorY) / 2, base[2] + 0.01], 'y', 0.035, 0.1, 4);
  k.rope.lash([0, base[1] - 0.005, base[2]], 'y', 0.027, 0.04, 3, { r: 0.007 });
  // steering ropes down to the axle ends (crossing pulleys)
  const zf = -L.WB / 2, yf = L.Rf - L.R;
  for (const sx of (L.noRopes ? [] : [-1, 1])) {
    k.rope.tube([[0.0, base[1] - 0.04, base[2] - 0.01], [sx * 0.07, base[1] - 0.12, base[2] - 0.12], [sx * (L.T / 2 - 0.12), yf + 0.05, zf + 0.04]], 0.0075, { rseg: 4, segs: 14 });
  }

  // seat + driver
  const seatY = eyeY - 0.46;
  addSeat(k, L.seat?.kind || 'crate', 0, seatY, eyeZ + 0.12, L.seat?.color);

  // paddles
  const px = L.px ?? 0.3, pz = eyeZ + (L.pdz ?? -0.7), py = L.floorY + 0.03;
  const paddleL = buildPaddle(k, L.paddleCol ?? 0xc2342c); paddleL.position.set(-px, py, pz); paddleL.name = 'paddleL';
  const paddleR = buildPaddle(k, L.paddleCol2 ?? L.paddleCol ?? 0xc2342c); paddleR.position.set(px, py, pz); paddleR.name = 'paddleR';
  for (const sx of [-1, 1]) { // hinge brackets
    k.metal.box([0.13, 0.03, 0.07], [sx * px, py - 0.02, pz], { c: 0x6a625a });
    k.metal.box([0.012, 0.05, 0.07], [sx * px - 0.065, py + 0.01, pz], { c: 0x6a625a });
    k.metal.box([0.012, 0.05, 0.07], [sx * px + 0.065, py + 0.01, pz], { c: 0x6a625a });
  }
  k.wood.box([2 * px + 0.2, 0.025, 0.12], [0, py - 0.045, pz], { c: 0xa88e62 }); // hinge board

  // levers
  const lx = L.lx ?? 0.25, ly = eyeY - 0.52, lz = eyeZ + (L.ldz ?? -0.36);
  const handbrakeLever = buildLever(k, 'hand'); handbrakeLever.position.set(-lx, ly, lz); handbrakeLever.name = 'handbrakeLever';
  const gearLever = buildLever(k, 'gear', L.gearCol); gearLever.position.set(lx, ly, lz); gearLever.name = 'gearLever';
  for (const sx of [-1, 1]) {
    k.metal.box([0.05, 0.05, 0.1], [sx * lx, ly - 0.03, lz + 0.01], { c: 0x6a625a });
    k.wood.box([0.07, 0.06, 0.16], [sx * lx, ly - 0.075, lz], { c: 0xa88e62 });
  }
  // handbrake ratchet quadrant + rod to the rear brake
  for (let i = 0; i < 5; i++) k.metal.box([0.006, 0.014, 0.008], [-lx - 0.028, ly + 0.1 + i * 0.03, lz - 0.02 - i * 0.003], { c: 0x2a2622 });
  k.metal.rod([-lx, ly - 0.02, lz + 0.03], [-0.1, -0.03, L.WB / 2 + 0.04], 0.006, { seg: 4, c: 0x7a7a74, grime: 0.4 });
  // gear gate plate
  k.metal.box([0.06, 0.006, 0.1], [lx, ly + 0.004, lz + 0.0], { c: 0x3a3632 });
  k.paint.decal(0, [lx, ly + 0.009, lz], 0.01, 0.01, { r: [-Math.PI / 2, 0, 0] });

  // headlight + flag pole
  const headlight = addHeadlight(k, L.hl.p, L.hl.style);
  // flag pole sits on an outrigger ~0.3 m to one side of the nose so it is not dead centre in the sightline
  const fs = L.flag.side ?? 1, fy = L.flag.p[1] - 0.02, fz = L.flag.p[2];
  k.wood.bar([fs * 0.02, fy - 0.03, fz], [fs * 0.3, fy - 0.03, fz], 0.035, 0.03, { c: 0xa68c62 });
  k.wood.bar([fs * 0.16, fy - 0.16, fz], [fs * 0.3, fy - 0.03, fz], 0.025, 0.025, { c: 0xa68c62 });
  k.rope.lash([fs * 0.22, fy - 0.03, fz], 'x', 0.025, 0.05, 3);
  const flagMount = addFlagPole(k, [fs * 0.3, fy, fz], L.flag.h ?? 0.4, L.flag.col);

  // ---- meshes
  for (const m of k.staticMeshes()) group.add(m);

  // wheels (shared geometry per axle)
  const wspec = L.wheel;
  const gF = buildWheelGeometry(k, { ...wspec, R: L.Rf, W: wspec.Wf ?? wspec.W, rim: wspec.rimF ?? wspec.rim });
  const gR = buildWheelGeometry(k, { ...wspec, R: L.R, W: wspec.W });
  const wheels = [
    makeWheelObject(k, gF, L.Rf, 'FL'), makeWheelObject(k, gF, L.Rf, 'FR'),
    makeWheelObject(k, gR, L.R, 'RL'), makeWheelObject(k, gR, L.R, 'RR'),
  ];
  const xo = L.T / 2;
  wheels[0].position.set(-xo, yf, zf); wheels[1].position.set(xo, yf, zf);
  wheels[2].position.set(-xo, 0, L.WB / 2); wheels[3].position.set(xo, 0, L.WB / 2);
  wheels.forEach((w) => group.add(w));

  // steering wheel
  const steeringWheel = new THREE.Group();
  steeringWheel.name = 'steeringWheel';
  steeringWheel.position.set(...wc);
  steeringWheel.rotation.x = -st.tilt;
  steeringWheel.add(buildSteeringWheelMesh(k, st.type, st.r, st.col, st.col2));
  group.add(steeringWheel, paddleL, paddleR, handbrakeLever, gearLever, headlight, flagMount);

  const driver = buildDriver(k, eyeY, eyeZ, L.driver?.shirt, L.driver?.helmet);
  group.add(driver);

  const driverEye = new THREE.Object3D();
  driverEye.name = 'driverEye';
  driverEye.position.set(0, eyeY, eyeZ);
  group.add(driverEye);

  // ---- mud coat: vertex-colour blend rising from the ground / tyres (setMudCoat 0..1)
  const mudGeos = new Set();
  group.traverse((o) => { if (o.isMesh && o.geometry.attributes.mud && o.geometry.attributes.color) mudGeos.add(o.geometry); });
  const mudBase = new Map();
  mudGeos.forEach((g) => mudBase.set(g, g.attributes.color.array.slice()));
  const MUD = new THREE.Color(0x2c1d10);
  let mudNow = 0, handles = null;
  const setMudCoat = (t) => {
    t = Math.min(1, Math.max(0, t));
    if (Math.abs(t - mudNow) < 0.005) return;
    mudNow = t;
    // preferred: the graphics agent's shader mud coat (per-truck material clones, patched once)
    if (!handles && t > 0.01) {
      handles = [];
      try {
        const cache = new Map();
        group.traverse((o) => {
          if (!o.isMesh || o.material === k.mats.lens) return;
          if (!cache.has(o.material)) { const m = o.material.clone(); cache.set(o.material, { m, h: applyMudCoat(m) }); }
          const e = cache.get(o.material);
          o.material = e.m;
        });
        cache.forEach((e) => handles.push(e.h));
      } catch (err) { handles = null; }
    }
    if (handles && handles.length) handles.forEach((h) => h.set(t));
    // vertex-colour splatter always runs too, so cockpit-visible parts (hood, paddles, wheel) darken even where the shader mask sits low
    mudGeos.forEach((g) => {
      const c0 = mudBase.get(g), col = g.attributes.color, w = g.attributes.mud;
      for (let i = 0; i < w.count; i++) {
        const a = Math.min(1, w.getX(i) * t * 1.7) * 0.92;
        col.array[i * 3] = c0[i * 3] + (MUD.r - c0[i * 3]) * a;
        col.array[i * 3 + 1] = c0[i * 3 + 1] + (MUD.g - c0[i * 3 + 1]) * a;
        col.array[i * 3 + 2] = c0[i * 3 + 2] + (MUD.b - c0[i * 3 + 2]) * a;
      }
      col.needsUpdate = true;
    });
  };
  const parts = { steeringWheel, paddleL, paddleR, handbrakeLever, gearLever, headlight, flagMount, wheels, driverEye, driver };
  group.userData = { id: def.id, parts, setMudCoat, wheelRadii: [L.Rf, L.Rf, L.R, L.R] };
  let calls = 0;
  group.traverse((o) => { if (o.isMesh) calls++; });
  group.userData.drawCalls = calls;
  return { group, parts, setMudCoat };
}
