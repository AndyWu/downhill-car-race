// First-person cockpit camera + cockpit part animation (no HUD). Also an optional chase camera for debugging.
import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _eye = new THREE.Vector3(), _gq = new THREE.Quaternion(), _off = new THREE.Vector3(), _e = new THREE.Euler(), _lq = new THREE.Quaternion();

export function createCockpitCamera(camera, { group, parts }, { mode = 'cockpit' } = {}) {
  const base = {};
  for (const k of ['steeringWheel', 'paddleL', 'paddleR', 'handbrakeLever', 'gearLever']) {
    if (parts && parts[k]) base[k] = parts[k].rotation.clone();
  }
  let bobY = 0, bobVY = 0, bobX = 0, bobVX = 0, bobZ = 0, bobVZ = 0;
  let yaw = 0, pitch = 0, roll = 0;
  let lastVy = 0, lastVx = 0, lastVz = 0, shakeT = 0, gear = 0, steerVis = 0;
  let m = mode;
  const chasePos = new THREE.Vector3(), chaseInit = { v: false };
  const vel = new THREE.Vector3(), accL = new THREE.Vector3();
  let camMode = m;

  function update(dt, state, input) {
    dt = clamp(dt, 1e-4, 0.1);
    group.updateMatrixWorld(true);
    // ---- cockpit part animation ----
    const target = state.steerNorm ?? 0;
    steerVis += (target - steerVis) * Math.min(1, dt * 18);
    if (parts.steeringWheel) parts.steeringWheel.rotation.z = base.steeringWheel.z - steerVis * 2.09; // ±120°
    if (parts.paddleL) parts.paddleL.rotation.x = base.paddleL.x - state.paddleL * 0.6;
    if (parts.paddleR) parts.paddleR.rotation.x = base.paddleR.x - state.paddleR * 0.6;
    if (parts.handbrakeLever) parts.handbrakeLever.rotation.x = base.handbrakeLever.x + state.handbrake * 0.7;
    gear += ((state.reverse ? 1 : 0) - gear) * Math.min(1, dt * 12);
    if (parts.gearLever) parts.gearLever.rotation.x = base.gearLever.x + gear * 0.55 - 0.15;

    if (camMode === 'chase') return chase(dt, state);

    // ---- head motion: spring driven by vertical / lateral accelerations ----
    vel.copy(state.velocity);
    accL.set((vel.x - lastVx) / dt, (vel.y - lastVy) / dt, (vel.z - lastVz) / dt);
    lastVx = vel.x; lastVy = vel.y; lastVz = vel.z;
    _gq.copy(group.quaternion).invert();
    accL.applyQuaternion(_gq); accL.set(clamp(accL.x, -20, 20), clamp(accL.y, -40, 40), clamp(accL.z, -20, 20));
    const kk = 140, cc = 14;
    bobVY += (-kk * bobY - cc * bobVY - accL.y * 0.012) * dt; bobY = clamp(bobY + bobVY * dt, -0.07, 0.07);
    bobVX += (-kk * bobX - cc * bobVX - accL.x * 0.008) * dt; bobX = clamp(bobX + bobVX * dt, -0.06, 0.06);
    bobVZ += (-kk * bobZ - cc * bobVZ - accL.z * 0.006) * dt; bobZ = clamp(bobZ + bobVZ * dt, -0.05, 0.05);
    shakeT += dt * (18 + state.speed * 1.2);
    const rough = clamp(state.bump * 1.2 + (state.slip > 1.5 ? 0.15 : 0) + state.speed * 0.0025, 0, 1.2);
    const jud = state.judder || 0, jt = state.jt || 0; // handbrake judder: 12 Hz buzz in the seat
    const sx = Math.sin(shakeT * 1.31) * 0.0035 * rough + Math.sin(jt * 0.93) * 0.003 * jud, sy = Math.sin(shakeT * 1.77 + 1.3) * 0.0045 * rough + Math.sin(jt) * 0.006 * jud;
    // look ahead into turns
    const latAcc = clamp(accL.x, -10, 10);
    const yawT = -steerVis * 0.2 + clamp(-latAcc * 0.004, -0.05, 0.05);
    yaw += (yawT - yaw) * Math.min(1, dt * 3);
    pitch += ((bobVY * 0.05) - pitch) * Math.min(1, dt * 8);
    const rollT = -steerVis * 0.035 - clamp(accL.x * 0.0012, -0.03, 0.03);
    roll += (rollT - roll) * Math.min(1, dt * 4);

    parts.driverEye.getWorldPosition(_eye);
    parts.driverEye.getWorldQuaternion(_gq);
    _off.set(bobX + sx, bobY + sy, bobZ).applyQuaternion(_gq);
    camera.position.copy(_eye).add(_off);
    _e.set(pitch, yaw, roll, 'YXZ'); _lq.setFromEuler(_e);
    camera.quaternion.copy(_gq).multiply(_lq);
  }

  function chase(dt, state) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(group.quaternion); fwd.y = 0; fwd.normalize();
    const want = group.position.clone().addScaledVector(fwd, -5.2); want.y += 2.3;
    if (!chaseInit.v) { chasePos.copy(want); chaseInit.v = true; }
    chasePos.lerp(want, Math.min(1, dt * 5));
    camera.position.copy(chasePos);
    camera.lookAt(group.position.x, group.position.y + 0.7, group.position.z);
  }

  return {
    update,
    setMode(mm) { camMode = mm; chaseInit.v = false; },
    get mode() { return camMode; },
    dispose() {
      for (const k in base) if (parts[k]) parts[k].rotation.copy(base[k]);
    },
  };
}
