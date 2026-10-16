// Anti-flip checks (headless, real world + physics): carts may jump and spin in the air,
// but must never end up on their roof.
//   node tests/core-flip.mjs
import * as THREE from 'three';
import { createWorld } from '../src/scene/index.js';
import { createVehicleBody } from '../src/core/physics.js';
import { TRUCKS } from '../src/vehicles/index.js';

const world = await createWorld(new THREE.Scene(), { seed: 1 });
let fail = 0;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const up = new THREE.Vector3();
const upY = (b) => up.set(0, 1, 0).applyQuaternion(b.state.quaternion).y;
// tilt relative to the ground under the cart (the roadside lip is steep, so world-up alone misleads)
const upN = (b) => { const p = b.state.position, n = world.normalAt(p.x, p.z); return up.set(0, 1, 0).applyQuaternion(b.state.quaternion).dot(new THREE.Vector3(n.x, n.y, n.z).normalize()); };

function place(body, s, lift, speed) {
  const smp = world.track.sampleAt(s);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), smp.tangent.clone().setY(0).normalize());
  const pos = smp.position.clone(); pos.y = world.heightAt(pos.x, pos.z) + 0.5 + lift;
  body.reset(pos, q, smp.tangent.clone().multiplyScalar(speed));
  body.noRecover = true; // prove the physics itself keeps it upright, not the respawn
}

// 1. big airborne tumble: launched 6 m up with a hard roll + pitch spin -> rotates in the air, lands on its wheels
for (let t = 0; t < TRUCKS.length; t++) {
  const b = createVehicleBody(TRUCKS[t], world);
  place(b, 700, 6, 12);
  b.state.angularVelocity.set(6, 2, 7).applyQuaternion(b.state.quaternion);
  let minUpAir = 1, spunAir = 0, worstGrounded = 1;
  for (let i = 0; i < 60 * 6; i++) {
    b.step(1 / 60, {});
    const u = upY(b);
    if (b.state.airborne) { minUpAir = Math.min(minUpAir, u); spunAir += b.state.angularVelocity.length() / 60; }
    else worstGrounded = Math.min(worstGrounded, upN(b));
  }
  check(spunAir > 1.5 && worstGrounded > 0.4 && upY(b) > 0.85,
    `truck ${t} airborne tumble: air rotation ${spunAir.toFixed(1)} rad (min up ${minUpAir.toFixed(2)}), grounded min up ${worstGrounded.toFixed(2)}, final up ${upY(b).toFixed(2)}`);
}

// 2. violent side hits on the ground (collision-like impulses) never roll a cart over
for (let t = 0; t < TRUCKS.length; t++) {
  const b = createVehicleBody(TRUCKS[t], world);
  place(b, 1200, 0, 10);
  let worst = 1;
  for (let i = 0; i < 60 * 8; i++) {
    if (i % 90 === 30) {
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(b.state.quaternion).multiplyScalar((i % 180 < 90 ? 1 : -1) * b.mass * 6);
      const at = b.state.position.clone().add(new THREE.Vector3(0, 0.5, 0));
      b.applyImpulseAt(side, at);
    }
    b.step(1 / 60, { steer: Math.sin(i / 40) });
    if (!b.state.airborne) worst = Math.min(worst, upN(b));
  }
  check(worst > 0.4, `truck ${t} side impacts: worst grounded up ${worst.toFixed(2)}`);
}

// 3. full-lock swerves at speed into the verge never roll it
for (let t = 0; t < TRUCKS.length; t++) {
  const b = createVehicleBody(TRUCKS[t], world);
  place(b, 400, 0, 15);
  let worst = 1;
  for (let i = 0; i < 60 * 8; i++) {
    b.step(1 / 60, { steer: i % 120 < 60 ? 1 : -1 });
    if (!b.state.airborne) worst = Math.min(worst, upN(b));
  }
  check(worst > 0.4, `truck ${t} full-lock swerves: worst grounded up ${worst.toFixed(2)}`);
}

console.log(fail ? `\n${fail} FAILED` : '\nall flip checks passed');
process.exit(fail ? 1 : 0);
