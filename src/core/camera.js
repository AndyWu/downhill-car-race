// First-person cockpit camera + cockpit part animation (no HUD). Plus outside views: hood, chase, far chase and side (cycled with V / the camera button).
import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _eye = new THREE.Vector3(), _gq = new THREE.Quaternion(), _off = new THREE.Vector3(), _e = new THREE.Euler(), _lq = new THREE.Quaternion();

export function createCockpitCamera(camera, { group, parts }, { mode = 'cockpit', heightAt = null } = {}) {
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

    if (camMode !== 'cockpit') return outside(dt, state);

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

  // outside views. back/up = offset behind/above the cart, side = offset to the right, look = point looked at
  // (metres ahead of the cart / above it), stiff = follow stiffness. 'hood' sits on the nose, low and fast.
  const VIEWS = {
    hood:  { back: -1.25, up: 0.62, side: 0, aheadLook: 12, lookUp: 0.3, stiff: 40 },
    chase: { back: 5.2, up: 2.3, side: 0, aheadLook: 0, lookUp: 0.7, stiff: 6 },
    far:   { back: 10.5, up: 4.6, side: 0, aheadLook: 4, lookUp: 0.5, stiff: 4 },
    side:  { back: 1.2, up: 1.1, side: 4.2, aheadLook: 1.5, lookUp: 0.5, stiff: 5 },
  };
  // chase target: the player's group by default; main may point it at the pack leader while the player sits still
  let chaseTarget = group, sideFlip = false;
  const _cf = new THREE.Vector3(), _cr = new THREE.Vector3(), _cw = new THREE.Vector3(), _lookP = new THREE.Vector3();
  const _o = new THREE.Vector3(), _alt = new THREE.Vector3(), _lookS = new THREE.Vector3(), lookInit = { v: false };
  function outside(dt, state) {
    const V = VIEWS[camMode] || VIEWS.chase;
    const tg = chaseTarget || group;
    tg.updateMatrixWorld(true);
    _cf.set(0, 0, -1).applyQuaternion(tg.quaternion); _cf.y = 0;
    if (_cf.lengthSq() < 1e-4) _cf.set(0, 0, -1); else _cf.normalize();
    _cr.set(-_cf.z, 0, _cf.x); // right of travel
    _cw.copy(tg.position).addScaledVector(_cf, -V.back).addScaledVector(_cr, V.side); _cw.y += V.up;
    _lookP.copy(tg.position).addScaledVector(_cf, V.aheadLook); _lookP.y += V.lookUp;
    // occlusion: walls / houses are heightfield bumps. March from the cart to the wanted camera spot; if terrain rises above the
    // line, pull the camera in to the last clear point, then keep it above the ground (smoothed by the follow below)
    const hf = typeof heightAt === 'function' ? heightAt() : heightAt;
    if (hf && camMode !== 'hood') {
      _o.copy(tg.position); _o.y += 0.9;
      const clearT = (c) => {
        for (let i = 1; i <= 16; i++) {
          const t = i / 16, h = hf(_o.x + (c.x - _o.x) * t, _o.z + (c.z - _o.z) * t);
          if (Number.isFinite(h) && _o.y + (c.y - _o.y) * t < h + 0.55) return (i - 1) / 16;
        }
        return 1;
      };
      let tClear = clearT(_cw);
      if (V.side) {   // side view blocked by a wall: try the other side of the cart (sticky, flips only when clearly better)
        _alt.copy(tg.position).addScaledVector(_cf, -V.back).addScaledVector(_cr, -V.side); _alt.y += V.up;
        const tAlt = clearT(_alt);
        if (!sideFlip ? tAlt > tClear + 0.3 : tClear > tAlt + 0.3) sideFlip = !sideFlip;
        if (sideFlip) { _cw.copy(_alt); tClear = tAlt; }
      }
      if (V.side && tClear < 0.5) {   // boxed in on both sides (narrow street): fall back to a chase-style spot behind the cart
        _cw.copy(tg.position).addScaledVector(_cf, -5.2); _cw.y += 2.3; tClear = clearT(_cw);
      }
      if (tClear < 1) { const t = Math.max(0.05, tClear); _cw.set(_o.x + (_cw.x - _o.x) * t, _o.y + (_cw.y - _o.y) * t, _o.z + (_cw.z - _o.z) * t); }
      const hc = hf(_cw.x, _cw.z); if (Number.isFinite(hc) && _cw.y < hc + 0.6) _cw.y = hc + 0.6;
    }
    if (!chaseInit.v) { chasePos.copy(_cw); _lookS.copy(_lookP); chaseInit.v = true; }
    // exponential follow; a big jump (teleport / target switch / long advance() step) snaps instead of crawling
    if (chasePos.distanceToSquared(_cw) > 400 || dt >= 0.09) { chasePos.copy(_cw); _lookS.copy(_lookP); }
    else { const a = 1 - Math.exp(-dt * V.stiff); chasePos.lerp(_cw, a); _lookS.lerp(_lookP, Math.min(1, a * 2)); }
    camera.position.copy(chasePos);
    camera.lookAt(_lookS);
  }

  return {
    update,
    setMode(mm) { camMode = mm === 'cockpit' || VIEWS[mm] ? mm : 'cockpit'; chaseInit.v = false; },
    views: ['cockpit', 'hood', 'chase', 'far', 'side'],
    setChaseTarget(g) { chaseTarget = g || group; },
    get mode() { return camMode; },
    dispose() {
      for (const k in base) if (parts[k]) parts[k].rotation.copy(base[k]);
    },
  };
}
