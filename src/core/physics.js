// Deterministic raycast-suspension vehicle model. Fixed step (60 Hz, 2 internal substeps).
// Forward is -Z in local space. Y up. Position == centre of mass == chassis origin (axle height).
import * as THREE from 'three';

const G = 9.81;
const RHO = 1.2;
export const STATE_FLOATS = 20;

const DEFAULT_SPEC = {
  mass: 95, dragCoef: 0.85, frontalArea: 0.6, rollingResist: 0.014, gripMul: 1,
  steerLock: 0.5, steerRate: 3.0, paddleEfficiency: 1, brakeForce: 400,
  suspension: { stiffness: 0, damping: 0, travel: 0.22 },
  wheelRadius: 0.28, wheelBase: 1.7, trackWidth: 0.95,
};

// ---- deterministic value noise (no Math.random anywhere in the sim) ----
function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}
function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

// scratch
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3();
const _anchor = new THREE.Vector3(), _cp = new THREE.Vector3(), _r = new THREE.Vector3();
const _vp = new THREE.Vector3(), _f = new THREE.Vector3(), _s = new THREE.Vector3();
const _F = new THREE.Vector3(), _T = new THREE.Vector3(), _tmp = new THREE.Vector3(), _tmp2 = new THREE.Vector3();
const _nSum = new THREE.Vector3(), _fw = new THREE.Vector3(), _fc = new THREE.Vector3();
const _q = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _wl = new THREE.Vector3();
const _qi = new THREE.Quaternion(), _ws = new THREE.Vector3();

export function createVehicleBody(specIn, world, opts = {}) {
  const spec = { ...DEFAULT_SPEC, ...(specIn || {}) };
  spec.suspension = { ...DEFAULT_SPEC.suspension, ...((specIn && specIn.suspension) || {}) };
  const m = clamp(fin(spec.mass, 95), 20, 2000);
  const r = clamp(fin(spec.wheelRadius, 0.28), 0.1, 1);
  const travel = clamp(fin(spec.suspension.travel, 0.22), 0.05, 0.6);
  const hx = spec.trackWidth / 2, hz = spec.wheelBase / 2, ay = travel * 0.5;
  const anchors = [
    new THREE.Vector3(-hx, ay, -hz), new THREE.Vector3(hx, ay, -hz),
    new THREE.Vector3(-hx, ay, hz), new THREE.Vector3(hx, ay, hz),
  ];
  // spring: static compression = half travel
  const kAuto = (m * G / 4) / (travel * 0.5);
  const kS = spec.suspension.stiffness >= 1500 && spec.suspension.stiffness < 2e6 ? spec.suspension.stiffness : kAuto;
  const cAuto = 2 * 0.45 * Math.sqrt(kS * m / 4);
  const cS = spec.suspension.damping >= 20 && spec.suspension.damping < 2e5 ? spec.suspension.damping : cAuto;
  const bw = spec.trackWidth + 0.3, bl = spec.wheelBase + 1.0, bh = 0.9;
  const I = new THREE.Vector3(m / 12 * (bh * bh + bl * bl), m / 12 * (bw * bw + bl * bl), m / 12 * (bw * bw + bh * bh)); // x,y,z
  const Iinv = new THREE.Vector3(1 / I.x, 1 / I.y, 1 / I.z);
  const grip = clamp(fin(spec.gripMul, 1), 0.3, 2);
  const crr = clamp(fin(spec.rollingResist, 0.014), 0.001, 0.2);
  const cdA = 0.5 * RHO * clamp(fin(spec.dragCoef, 0.85), 0.05, 3) * clamp(fin(spec.frontalArea, 0.6), 0.05, 5);
  const lock = clamp(fin(spec.steerLock, 0.5), 0.1, 1.0);
  const sRate = clamp(fin(spec.steerRate, 3), 0.5, 12);
  const brakeMax = clamp(fin(spec.brakeForce, 400), 50, 5000);
  const paddleEff = clamp(fin(spec.paddleEfficiency, 1), 0.1, 3);

  const state = {
    position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), velocity: new THREE.Vector3(),
    angularVelocity: new THREE.Vector3(), speed: 0, forwardSpeed: 0, s: 0, lateral: 0,
    steerAngle: 0, steerNorm: 0, paddleL: 0, paddleR: 0, handbrake: 0, reverse: false,
    bump: 0, slip: 0, airborne: false, upsideDown: 0, surface: 'dirt',
    wheelContacts: [0, 1, 2, 3].map(() => ({ contact: false, compression: 0, load: 0, surface: 'dirt', slip: 0, steer: 0 })),
  };
  state.quaternion.identity();
  const lastLen = [travel * 0.5, travel * 0.5, travel * 0.5, travel * 0.5];
  const lastHad = [false, false, false, false];
  const good = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
  let paddleCooldownL = 0, paddleCooldownR = 0;
  const hasWorld = !!world;

  function ground(x, z) {
    const surf = world.surfaceAt(x, z) || {};
    const bump = clamp(fin(surf.bump), 0, 1);
    let h = world.heightAt(x, z);
    if (bump > 0) {
      const a = noise2(x * 2.3, z * 2.3) * 2 - 1, b = noise2(x * 6.1 + 17, z * 6.1) * 2 - 1;
      h += bump * 0.075 * (a * Math.abs(a) + 0.5 * b);
    }
    return { h: fin(h), surf, bump };
  }

  function applyForce(F, point) {
    _F.add(F);
    _tmp2.copy(point).sub(state.position).cross(F);
    _T.add(_tmp2);
  }

  function substep(h, inp) {
    const p = state.position, v = state.velocity, w = state.angularVelocity, q = state.quaternion;
    _fwd.set(0, 0, -1).applyQuaternion(q); _right.set(1, 0, 0).applyQuaternion(q); _up.set(0, 1, 0).applyQuaternion(q);
    _F.set(0, -m * G, 0); _T.set(0, 0, 0);
    const speed = v.length();
    const hb = state.handbrake;
    let contacts = 0; _nSum.set(0, 0, 0);
    let slipMax = 0, bumpMax = 0;

    for (let i = 0; i < 4; i++) {
      const wc = state.wheelContacts[i];
      _anchor.copy(anchors[i]).applyQuaternion(q).add(p);
      const g = hasWorld ? ground(_anchor.x, _anchor.z) : { h: -1e4, surf: {}, bump: 0 };
      const n = hasWorld ? world.normalAt(_anchor.x, _anchor.z) : _tmp.set(0, 1, 0);
      const nx = fin(n.x), ny = fin(n.y, 1), nz = fin(n.z);
      const nl = Math.hypot(nx, ny, nz) || 1;
      _ws.set(nx / nl, ny / nl, nz / nl); // ground normal
      const d = _anchor.y - g.h;
      const un = Math.max(_up.dot(_ws), 0.3);
      const t = (d * _ws.y) / un;
      const len = t - r;
      wc.contact = false; wc.load = 0; wc.slip = 0;
      if (len > travel || d < -2) { wc.compression = 0; lastHad[i] = false; lastLen[i] = travel; continue; }
      const comp = travel - len;
      let rate = 0;
      if (lastHad[i]) rate = clamp((lastLen[i] - len) / h, -12, 12);
      lastLen[i] = len; lastHad[i] = true;
      let N = kS * comp + cS * rate;
      if (comp > travel) N += kS * 8 * (comp - travel);
      N = clamp(N, 0, 20 * m * G);
      if (N <= 0) { wc.compression = clamp(comp / travel, 0, 1.5); continue; }
      wc.contact = true; wc.compression = clamp(comp / travel, 0, 1.5); wc.load = N; wc.surface = g.surf.type || 'dirt';
      contacts++; _nSum.add(_ws);
      bumpMax = Math.max(bumpMax, Math.abs(rate) * (0.3 + g.bump));
      // contact point & velocity
      _cp.copy(_anchor).addScaledVector(_up, -t);
      _r.copy(_cp).sub(p);
      _vp.copy(w).cross(_r).add(v);
      // tangent basis
      _f.copy(_fwd).addScaledVector(_ws, -_fwd.dot(_ws));
      if (_f.lengthSq() < 1e-6) _f.copy(_up).cross(_ws).cross(_ws).negate();
      _f.normalize();
      if (i < 2) {
        const a = state.steerAngle, ca = Math.cos(a), sa = Math.sin(a);
        _tmp.copy(_ws).cross(_f); // left
        _f.multiplyScalar(ca).addScaledVector(_tmp, -sa).normalize();
      }
      _s.copy(_f).cross(_ws).normalize(); // right
      const vf = _vp.dot(_f), vs = _vp.dot(_s);
      const surf = g.surf;
      const mu = clamp(fin(surf.friction, 0.8), 0.05, 1.3) * grip;
      const rear = i >= 2;
      const muLat = rear ? mu * (1 - 0.65 * hb) : mu;
      const maxF = mu * N, maxFlat = muLat * N;
      const mEff = m / 4;
      // longitudinal
      let Fx = -crr * N * Math.tanh(vf * 4);
      if (rear && hb > 0.01) {
        const lockF = clamp(-vf * mEff / h * 0.5, -brakeMax * 0.5 * hb, brakeMax * 0.5 * hb);
        Fx += clamp(lockF, -maxF * 0.85 * hb, maxF * 0.85 * hb);
      }
      // lateral
      let Fs = clamp(-vs * mEff / h * 0.5, -maxFlat, maxFlat);
      // friction circle
      const tot = Math.hypot(Fx, Fs), lim = Math.max(maxF, 1e-3);
      if (tot > lim) { Fx *= lim / tot; Fs *= lim / tot; }
      wc.slip = Math.abs(vs);
      slipMax = Math.max(slipMax, Math.abs(vs));
      _tmp.copy(_f).multiplyScalar(Fx).addScaledVector(_s, Fs);
      // surface drag (mud etc.)
      const sd = clamp(fin(surf.drag), 0, 80);
      if (sd > 0) { _tmp.addScaledVector(_vp, -sd * 0.0 ); _tmp.addScaledVector(_f, -sd * vf).addScaledVector(_s, -sd * vs * 0.5); }
      _tmp.addScaledVector(_ws, N);
      applyForce(_tmp, _cp);
    }

    // aero drag
    if (speed > 1e-3) _F.addScaledVector(v, -cdA * speed);

    // paddles: impulse along ground heading
    const pL = clamp(fin(inp.paddleL), 0, 1), pR = clamp(fin(inp.paddleR), 0, 1);
    if ((pL > 0 || pR > 0)) {
      if (contacts >= 2 && hb < 0.5) {
        _fc.copy(_fwd).addScaledVector(_nSum, -_fwd.dot(_nSum) / Math.max(_nSum.lengthSq(), 1e-6)).normalize();
        const dir = state.reverse ? -1 : 1;
        const vf0 = v.dot(_fc) * dir;
        const dv = 0.34 * paddleEff * (pL + pR) / (1 + Math.pow(Math.max(vf0, 0) / 5.5, 2));
        v.addScaledVector(_fc, dv * dir);
      }
    }
    state.paddleL = Math.max(pL, state.paddleL - h * 4.5);
    state.paddleR = Math.max(pR, state.paddleR - h * 4.5);

    // integrate linear
    v.addScaledVector(_F, h / m);
    if (v.length() > 70) v.setLength(70);
    p.addScaledVector(v, h);
    // angular (local-frame inertia)
    _qi.copy(q).invert();
    _wl.copy(_T).applyQuaternion(_qi);
    _wl.set(_wl.x * Iinv.x, _wl.y * Iinv.y, _wl.z * Iinv.z).applyQuaternion(q);
    w.addScaledVector(_wl, h);
    w.multiplyScalar(1 - Math.min(0.25 * h, 0.5));
    if (w.length() > 14) w.setLength(14);
    _dq.set(w.x, w.y, w.z, 0).multiply(q);
    q.set(q.x + 0.5 * h * _dq.x, q.y + 0.5 * h * _dq.y, q.z + 0.5 * h * _dq.z, q.w + 0.5 * h * _dq.w).normalize();

    // hard floor safety
    if (hasWorld) {
      const gh = fin(world.heightAt(p.x, p.z), p.y);
      if (p.y < gh + 0.08) { p.y = gh + 0.08; if (v.y < 0) v.y *= -0.1; }
    }
    state.airborne = contacts === 0;
    state.bump = Math.max(state.bump * (1 - 6 * h), clamp(bumpMax * 0.12, 0, 1));
    state.slip = slipMax;
  }

  function sanitize() {
    const p = state.position, v = state.velocity, w = state.angularVelocity, q = state.quaternion;
    if (![p.x, p.y, p.z, v.x, v.y, v.z, w.x, w.y, w.z, q.x, q.y, q.z, q.w].every(Number.isFinite) || Math.abs(p.y) > 1e5) {
      p.copy(good.p); q.copy(good.q); v.set(0, 0, 0); w.set(0, 0, 0);
      return false;
    }
    good.p.copy(p); good.q.copy(q);
    return true;
  }

  const body = {
    spec, state,
    reset(position, quaternion, velocity) {
      state.position.copy(position);
      state.quaternion.copy(quaternion || _q.identity());
      state.velocity.copy(velocity || _tmp.set(0, 0, 0));
      state.angularVelocity.set(0, 0, 0);
      state.steerAngle = 0; state.paddleL = state.paddleR = 0;
      lastHad.fill(false);
      good.p.copy(state.position); good.q.copy(state.quaternion);
      this.updateTrack();
    },
    updateTrack() {
      if (world && world.track && world.track.project) {
        const pr = world.track.project(state.position);
        if (pr) { state.s = fin(pr.s, state.s); state.lateral = fin(pr.lateral, state.lateral); }
      }
    },
    step(dt, input = {}) {
      dt = clamp(fin(dt, 1 / 60), 0, 0.05);
      if (dt <= 0) return;
      const inp = input || {};
      state.reverse = !!inp.reverse;
      const hbT = clamp(fin(inp.handbrake), 0, 1);
      state.handbrake += (hbT - state.handbrake) * Math.min(1, dt * 14);
      // steering
      const sp = state.velocity.length();
      const steerScale = 1 / (1 + Math.pow(sp / 16, 2) * 0.7);
      const tgt = clamp(fin(inp.steer), -1, 1) * lock * (0.35 + 0.65 * steerScale);
      const dA = sRate * dt;
      state.steerAngle += clamp(tgt - state.steerAngle, -dA, dA);
      state.steerNorm = state.steerAngle / lock;
      const sub = 2, h = dt / sub;
      for (let k = 0; k < sub; k++) {
        substep(h, k === 0 ? inp : { paddleL: 0, paddleR: 0 });
      }
      if (!sanitize()) { lastHad.fill(false); }
      const fw = _fwd.set(0, 0, -1).applyQuaternion(state.quaternion);
      state.forwardSpeed = state.velocity.dot(fw);
      state.speed = state.velocity.length();
      // upside-down detection / auto-recover
      _up.set(0, 1, 0).applyQuaternion(state.quaternion);
      state.upsideDown = _up.y < 0.25 && state.speed < 3 ? state.upsideDown + dt : 0;
      if (state.upsideDown > 2.0) this.recover();
      this.updateTrack();
      const wc0 = state.wheelContacts.find((c) => c.contact);
      if (wc0) state.surface = wc0.surface;
    },
    recover() {
      const tr = world && world.track;
      state.upsideDown = 0;
      if (!tr) { state.quaternion.identity(); state.position.y += 1; return; }
      this.updateTrack();
      const smp = tr.sampleAt(Math.max(0, state.s));
      const x = smp.position.x, z = smp.position.z;
      placeOnGround(this, world, x, z, smp.tangent, new THREE.Vector3(0, 0, 0));
    },
    applyImpulseAt(J, point) {
      state.velocity.addScaledVector(J, 1 / m);
      _tmp.copy(point).sub(state.position).cross(J);
      _qi.copy(state.quaternion).invert();
      _tmp.applyQuaternion(_qi).set(_tmp.x * Iinv.x, _tmp.y * Iinv.y, _tmp.z * Iinv.z).applyQuaternion(state.quaternion);
      state.angularVelocity.add(_tmp);
    },
    mass: m,
    serialize(arr, o = 0) {
      const p = state.position, q = state.quaternion, v = state.velocity, w = state.angularVelocity;
      arr[o] = p.x; arr[o + 1] = p.y; arr[o + 2] = p.z;
      arr[o + 3] = q.x; arr[o + 4] = q.y; arr[o + 5] = q.z; arr[o + 6] = q.w;
      arr[o + 7] = v.x; arr[o + 8] = v.y; arr[o + 9] = v.z;
      arr[o + 10] = w.x; arr[o + 11] = w.y; arr[o + 12] = w.z;
      arr[o + 13] = state.s; arr[o + 14] = state.lateral; arr[o + 15] = state.steerNorm;
      arr[o + 16] = state.paddleL; arr[o + 17] = state.paddleR; arr[o + 18] = state.handbrake;
      arr[o + 19] = state.reverse ? 1 : 0;
      return o + STATE_FLOATS;
    },
    deserialize(arr, o = 0) {
      state.position.set(arr[o], arr[o + 1], arr[o + 2]);
      state.quaternion.set(arr[o + 3], arr[o + 4], arr[o + 5], arr[o + 6]).normalize();
      state.velocity.set(arr[o + 7], arr[o + 8], arr[o + 9]);
      state.angularVelocity.set(arr[o + 10], arr[o + 11], arr[o + 12]);
      state.s = arr[o + 13]; state.lateral = arr[o + 14]; state.steerNorm = arr[o + 15];
      state.steerAngle = state.steerNorm * lock;
      state.paddleL = arr[o + 16]; state.paddleR = arr[o + 17]; state.handbrake = arr[o + 18];
      state.reverse = arr[o + 19] > 0.5;
      state.speed = state.velocity.length();
      sanitize();
      return o + STATE_FLOATS;
    },
  };
  void paddleCooldownL; void paddleCooldownR;
  return body;
}

// Align body to ground at (x,z) facing `forwardHint` (world dir), with initial velocity.
export function placeOnGround(body, world, x, z, forwardHint, velocity) {
  const y = world.heightAt(x, z);
  const up = world.normalAt(x, z).clone().normalize();
  const f = forwardHint.clone().addScaledVector(up, -forwardHint.dot(up)).normalize();
  const right = new THREE.Vector3().crossVectors(f, up).normalize();
  const m4 = new THREE.Matrix4().makeBasis(right, up, f.clone().negate());
  const q = new THREE.Quaternion().setFromRotationMatrix(m4);
  const hh = (body.spec.wheelRadius || 0.28) + 0.02;
  body.reset(new THREE.Vector3(x, y + hh, z).addScaledVector(up, 0.0), q, velocity || new THREE.Vector3());
}

// Car-car collisions: two spheres per car.
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _nn = new THREE.Vector3(), _rv = new THREE.Vector3();
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _J = new THREE.Vector3(), _cpt = new THREE.Vector3();
function spherePos(b, k, out) {
  const off = (k === 0 ? -1 : 1) * (b.spec.wheelBase * 0.5 + 0.05);
  return out.set(0, 0.05, off).applyQuaternion(b.state.quaternion).add(b.state.position);
}
export function collideBodies(a, b) {
  const R = 0.62;
  let hit = false;
  if (a.state.position.distanceToSquared(b.state.position) > 16) return false;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    spherePos(a, i, _pa); spherePos(b, j, _pb);
    _nn.copy(_pb).sub(_pa);
    const d = _nn.length();
    if (d >= 2 * R || d < 1e-5) continue;
    _nn.multiplyScalar(1 / d);
    const pen = 2 * R - d;
    const ma = a.mass, mb = b.mass, tm = ma + mb;
    a.state.position.addScaledVector(_nn, -pen * mb / tm);
    b.state.position.addScaledVector(_nn, pen * ma / tm);
    _cpt.copy(_pa).addScaledVector(_nn, R);
    _va.copy(a.state.angularVelocity).cross(_tmp.copy(_cpt).sub(a.state.position)).add(a.state.velocity);
    _vb.copy(b.state.angularVelocity).cross(_tmp.copy(_cpt).sub(b.state.position)).add(b.state.velocity);
    _rv.copy(_vb).sub(_va);
    const vn = _rv.dot(_nn);
    if (vn < 0) {
      const jn = -(1 + 0.25) * vn / (1 / ma + 1 / mb);
      _J.copy(_nn).multiplyScalar(jn);
      b.applyImpulseAt(_J, _cpt);
      a.applyImpulseAt(_J.negate(), _cpt);
    }
    hit = true;
  }
  return hit;
}
