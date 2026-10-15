// Run: node src/scene/containment.mjs  -- drives a no-input truck off the road at 20 deg / 12 m/s with the REAL physics.
import * as THREE from 'three';
import { createWorld } from './index.js';
import { createVehicleBody, placeOnGround } from '../core/physics.js';
import { TRUCKS } from '../vehicles/index.js';

const world = await createWorld(new THREE.Scene(), { seed: 1 });
const spec = TRUCKS[Number(process.env.TRUCK || 0)];
let worst = 0;
const rows = [];
for (const s0 of [120, 260, 700, 1000, 1350, 1700, 2050, 2500, 2900]) for (const side of [-1, 1]) {
  const f = world.track.sampleAt(s0);
  const body = createVehicleBody(spec, world);
  const x = f.position.x + f.right.x * side * (f.width / 2 - 0.4), z = f.position.z + f.right.z * side * (f.width / 2 - 0.4);
  const a = side * 20 * Math.PI / 180;
  const T = f.tangent.clone(); T.y = 0; T.normalize();
  const dir = T.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -a); // toward +side
  const v = dir.clone().multiplyScalar(12);
  placeOnGround(body, world, x, z, dir, v);
  let maxBeyond = 0, tEnd = 0, left = false;
  for (let t = 0; t < 25; t += 1 / 60) {
    body.step(1 / 60, { steer: 0, paddleL: 0, paddleR: 0, handbrake: 0, headlight: false, reverse: false });
    const st = body.state, hw = world.track.sampleAt(Math.max(0, st.s)).width / 2;
    const bey = Math.abs(st.lateral) - hw;
    if (bey > 0.3) left = true;
    if (left && bey < -0.3) break; // back on the road: first excursion is over
    maxBeyond = Math.max(maxBeyond, bey);
    if (st.s > 3200) break;
    tEnd = t;
  }
  worst = Math.max(worst, maxBeyond);
  rows.push(`s=${s0} side=${side}: max beyond edge ${maxBeyond.toFixed(1)} m, end lat ${body.state.lateral.toFixed(1)} s=${body.state.s.toFixed(0)} v=${body.state.speed.toFixed(1)}`);
}
console.log(rows.join('\n'));
console.log(`WORST ${worst.toFixed(1)} m beyond edge (target <= 6)`);
process.exitCode = worst <= 6 ? 0 : 1;
