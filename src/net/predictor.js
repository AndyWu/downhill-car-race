// Client-side prediction + reconciliation for the LOCAL car.
//
// The client runs its own physics body every fixed step with its own input, so steering
// responds immediately (no 100 ms interpolation lag). When an authoritative snapshot arrives,
// it carries `ack` = (last input seq the host applied for this slot) & 255. We:
//   1. drop acknowledged inputs from the history,
//   2. reset the body to the authoritative pose (position, quaternion, velocity, s),
//   3. replay the not-yet-acknowledged inputs,
//   4. turn the visual jump (old predicted pose → new predicted pose) into an error offset
//      that decays smoothly (half-life ~120 ms). Errors > snapDistance snap instantly.
// Without an ack (old host) it falls back to a gentle positional blend toward the snapshot.
//
// The body must follow the core physics contract:
//   { state:{position,quaternion,velocity,s}, step(dt,input), serialize(arr,o), deserialize(arr,o) }

import { SNAP_HEADER, SNAP_STRIDE } from './protocol.js';

const STATE_FLOATS = 20; // src/core/physics.js layout: p(0-2) q(3-6) v(7-9) w(10-12) s(13) …

function qMul(a, b, out) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  out[0] = aw * bx + ax * bw + ay * bz - az * by;
  out[1] = aw * by - ax * bz + ay * bw + az * bx;
  out[2] = aw * bz + ax * by - ay * bx + az * bw;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}
function qNorm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l; return q; }

/**
 * @param {{ body, slot:number, maxHistory?:number, smoothHalfLifeMs?:number, snapDistance?:number, softGain?:number }} o
 */
export function createPredictor({ body, slot, maxHistory = 240, smoothHalfLifeMs = 120, snapDistance = 6, softGain = 0.15 } = {}) {
  const history = []; // { seq, dt, input }
  const errPos = [0, 0, 0];
  const errQ = [0, 0, 0, 1];
  const arr = new Float32Array(STATE_FLOATS);
  let autoSeq = 0;
  const stats = { reconciles: 0, replayed: 0, lastError: 0, snaps: 0 };
  const pose = { position: [0, 0, 0], quaternion: [0, 0, 0, 1] };

  const curPos = () => { const p = body.state.position; return [p.x, p.y, p.z]; };
  const curQuat = () => { const q = body.state.quaternion; return [q.x, q.y, q.z, q.w]; };

  function decay(dt) {
    const k = Math.pow(0.5, (dt * 1000) / smoothHalfLifeMs);
    errPos[0] *= k; errPos[1] *= k; errPos[2] *= k;
    // nlerp errQ toward identity
    const sgn = errQ[3] < 0 ? -1 : 1;
    errQ[0] *= k; errQ[1] *= k; errQ[2] *= k; errQ[3] = errQ[3] * k + sgn * (1 - k);
    qNorm(errQ);
  }

  function renderPose() {
    const p = curPos(), q = curQuat();
    pose.position[0] = p[0] + errPos[0]; pose.position[1] = p[1] + errPos[1]; pose.position[2] = p[2] + errPos[2];
    qNorm(qMul(errQ, q, pose.quaternion));
    return pose;
  }

  function findCar(data) {
    const n = data[1] | 0;
    for (let i = 0; i < n; i++) { const b = SNAP_HEADER + i * SNAP_STRIDE; if (data[b] === slot) return b; }
    return -1;
  }

  return {
    stats,
    get pending() { return history.length; },
    /** Run one local fixed step with the player's input. `seq` = the seq sent with this input frame. */
    step(dt, input, seq = autoSeq++) {
      history.push({ seq, dt, input: { ...input } });
      if (history.length > maxHistory) history.shift();
      body.step(dt, input);
      decay(dt);
    },
    /** Feed every authoritative snapshot (decoded Float32Array from sync.onSnapshot). */
    onSnapshot(data) {
      const b = findCar(data);
      if (b < 0) return false;
      const ack = data[b + 13];
      const before = renderPose();
      const bp = before.position.slice(), bq = before.quaternion.slice();
      if (ack >= 0) {
        // newest history entry with matching low byte
        let idx = -1;
        for (let i = history.length - 1; i >= 0; i--) if ((history[i].seq & 255) === ack) { idx = i; break; }
        if (idx < 0) return false; // ack older than our history, or not yet seen
        history.splice(0, idx + 1);
        body.serialize(arr, 0);
        arr[0] = data[b + 1]; arr[1] = data[b + 2]; arr[2] = data[b + 3];
        arr[3] = data[b + 4]; arr[4] = data[b + 5]; arr[5] = data[b + 6]; arr[6] = data[b + 7];
        arr[7] = data[b + 8]; arr[8] = data[b + 9]; arr[9] = data[b + 10];
        arr[13] = data[b + 11];
        body.deserialize(arr, 0);
        for (const h of history) body.step(h.dt, h.input);
        stats.replayed += history.length;
      } else {
        // soft correction (no ack available): pull the simulated body part-way toward the host.
        body.serialize(arr, 0);
        for (let k = 0; k < 3; k++) { arr[k] += (data[b + 1 + k] - arr[k]) * softGain; arr[7 + k] += (data[b + 8 + k] - arr[7 + k]) * softGain; }
        body.deserialize(arr, 0);
      }
      stats.reconciles++;
      // convert the jump into a decaying visual offset
      const p = curPos(), q = curQuat();
      const e = [bp[0] - p[0], bp[1] - p[1], bp[2] - p[2]];
      stats.lastError = Math.hypot(e[0], e[1], e[2]);
      if (stats.lastError > snapDistance) { errPos.fill(0); errQ[0] = errQ[1] = errQ[2] = 0; errQ[3] = 1; stats.snaps++; }
      else {
        errPos[0] = e[0]; errPos[1] = e[1]; errPos[2] = e[2];
        // errQ = bq * inverse(q)
        qNorm(qMul(bq, [-q[0], -q[1], -q[2], q[3]], errQ));
      }
      return true;
    },
    /** Smoothed pose to render the local car with ({position:[x,y,z], quaternion:[x,y,z,w]}). */
    renderPose,
    /** Convenience: write the smoothed pose into a THREE.Object3D. */
    applyTo(obj) { const r = renderPose(); obj.position.set(r.position[0], r.position[1], r.position[2]); obj.quaternion.set(r.quaternion[0], r.quaternion[1], r.quaternion[2], r.quaternion[3]); return obj; },
    reset() { history.length = 0; errPos.fill(0); errQ[0] = errQ[1] = errQ[2] = 0; errQ[3] = 1; },
  };
}
