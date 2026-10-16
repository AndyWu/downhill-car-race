// Run: node src/scene/containment.mjs  -- drives a no-input truck off the road at 20 deg / 12 m/s with the REAL physics.
import * as THREE from 'three';
import { createWorld } from './index.js';
import { createVehicleBody, placeOnGround } from '../core/physics.js';
import { TRUCKS } from '../vehicles/index.js';

const world = await createWorld(new THREE.Scene(), { seed: 1 });
const spec = TRUCKS[Number(process.env.TRUCK || 0)];
let worst = 0; const bad = [];
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
  let maxBeyond = 0, tEnd = 0, left = false, tLeft = -1, tBack = -1, vBack = 0, minV = 99;
  for (let t = 0; t < 25; t += 1 / 60) {
    body.step(1 / 60, { steer: 0, paddleL: 0, paddleR: 0, handbrake: 0, headlight: false, reverse: false });
    const st = body.state, hw = world.track.sampleAt(Math.max(0, st.s)).width / 2;
    const bey = Math.abs(st.lateral) - hw;
    if (bey > 1.0 && !left) { left = true; tLeft = t; }
    if (left && tBack < 0 && bey < 0.5) { tBack = t; vBack = st.speed; }
    if (tBack >= 0) { minV = Math.min(minV, st.speed); if (t - tBack > 5) break; }
    if (tBack < 0) maxBeyond = Math.max(maxBeyond, bey);
    if (st.s > 3200) break;
    tEnd = t;
  }
  worst = Math.max(worst, maxBeyond);
  const backT = left ? (tBack < 0 ? Infinity : tBack - tLeft) : 0;
  if (left && (backT > 6 || minV < 2)) bad.push(`s=${s0} side=${side}: back after ${backT.toFixed(1)} s, min speed ${minV.toFixed(1)}`);
  rows.push(`s=${s0} side=${side}: max beyond edge ${maxBeyond.toFixed(1)} m, end lat ${body.state.lateral.toFixed(1)} s=${body.state.s.toFixed(0)} v=${body.state.speed.toFixed(1)}`);
}
// slow pinned-car scenario: crawling at 1.5 m/s on the foot ramp / against the lip, no input
const clear = (v) => world.hazards.every((h) => Math.abs(h.s - v) > 70);
const slowS = []; for (let v = 250; v < 3000 && slowS.length < 5; v += 130) if (clear(v)) slowS.push(v);
for (const s0 of slowS) for (const side of [-1, 1]) for (const off of [0.9, 1.8, 2.4]) {
  const f = world.track.sampleAt(s0), body = createVehicleBody(spec, world);
  const x = f.position.x + f.right.x * side * (f.width / 2 + off), z = f.position.z + f.right.z * side * (f.width / 2 + off);
  const T = f.tangent.clone(); T.y = 0; T.normalize();
  placeOnGround(body, world, x, z, T, T.clone().multiplyScalar(1.5));
  let tBack = -1, minV = 99;
  for (let t = 0; t < 14; t += 1 / 60) {
    body.step(1 / 60, { steer: 0, paddleL: 0, paddleR: 0, handbrake: 0, headlight: false, reverse: false });
    const st = body.state, hw = world.track.sampleAt(Math.max(0, st.s)).width / 2, bey = Math.abs(st.lateral) - hw;
    if (tBack < 0 && bey < 0.5) tBack = t;
    if (tBack >= 0 && t - tBack > 2) minV = Math.min(minV, st.speed);
    if (tBack >= 0 && t - tBack > 5) break;
  }
  if (tBack < 0 || tBack > 6 || minV < 2) bad.push(`slow start s=${s0} side=${side} off=${off}: back ${tBack < 0 ? 'never' : tBack.toFixed(1) + ' s'}, min speed ${minV.toFixed(1)}`);
}
// full-course coasting check: no input from the start ramp must reach the finish and never stall
if (process.env.COAST !== '0') {
  const body = createVehicleBody(spec, world), st0 = world.startTransform(0);
  body.reset(st0.position, st0.quaternion);
  let t = 0, stall = 0, worstStall = 0, stallAt = 0;
  const idle = { steer: 0, paddleL: 0, paddleR: 0, handbrake: 0, headlight: false, reverse: false };
  for (; t < 900 && body.state.s < 3200; t += 1 / 60) {
    body.step(1 / 60, idle);
    const st = body.state;
    if (st.s > 40 && st.speed < 1.0) { stall += 1 / 60; if (stall > worstStall) { worstStall = stall; stallAt = st.s; } } else stall = 0;
  }
  console.log(`coast: reached s=${body.state.s.toFixed(0)} in ${t.toFixed(0)} s, longest stall ${worstStall.toFixed(1)} s at s=${stallAt.toFixed(0)}`);
  if (body.state.s < 3200 || worstStall > 10) bad.push(`coast: stalled (s=${body.state.s.toFixed(0)}, longest stall ${worstStall.toFixed(1)} s at s=${stallAt.toFixed(0)})`);
}
console.log(rows.join('\n'));
console.log(`WORST ${worst.toFixed(1)} m beyond edge (target <= 6)`);
console.log(bad.length ? 'RECOVERY FAILURES:\n' + bad.join('\n') : 'recovery ok (back on road <= 6 s, >= 2 m/s)');
process.exitCode = worst <= 6 && !bad.length ? 0 : 1;
