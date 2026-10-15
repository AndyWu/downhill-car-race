// Deterministic stand-in for the scene world (track.sampleAt / heightAt) + analytic car
// trajectories + a toy physics body, shared by tests/net-unit.mjs (Node) and the browser
// harness (tests/net-harness.html). Not shipped.

const v3 = (x, y, z) => ({ x, y, z });

export function createFakeWorld() {
  const length = 3218;
  const cx = (s) => 80 * Math.sin(s / 160) + 25 * Math.sin(s / 47);
  const dcx = (s) => (80 / 160) * Math.cos(s / 160) + (25 / 47) * Math.cos(s / 47);
  const heightAt = (x, z) => 0.11 * z + 0.35 * Math.sin(x / 7) + 0.25 * Math.cos(z / 11) + 0.05 * Math.sin(x * 1.3 + z * 0.7);
  return {
    heightAt,
    track: {
      length,
      sampleAt(s) {
        const x = cx(s), z = -s;
        const tl = Math.hypot(dcx(s), 1);
        const t = v3(dcx(s) / tl, 0, -1 / tl);
        return { position: v3(x, heightAt(x, z), z), tangent: t, right: v3(-t.z, 0, t.x), up: v3(0, 1, 0), width: 8, camber: 0 };
      },
    },
  };
}

function quatFromEuler(yaw, pitch, roll) { // YXZ
  const c1 = Math.cos(pitch / 2), c2 = Math.cos(yaw / 2), c3 = Math.cos(roll / 2);
  const s1 = Math.sin(pitch / 2), s2 = Math.sin(yaw / 2), s3 = Math.sin(roll / 2);
  return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3];
}

/** Analytic car state at time t (seconds): weaving down the track at ~14-20 m/s. Returns 13 floats id..events. */
export function carAt(world, id, t, { lateral } = {}) {
  const pos = (tt) => {
    const s = 30 + id * 25 + (14 + id) * tt + 2 * Math.sin(tt * 0.9 + id);
    const smp = world.track.sampleAt(s);
    const lat = lateral ?? 3.2 * Math.sin(tt * 0.7 + id * 1.3);
    const x = smp.position.x + smp.right.x * lat, z = smp.position.z + smp.right.z * lat;
    return { s, x, z, y: world.heightAt(x, z) + 0.45 + 0.15 * Math.max(0, Math.sin(tt * 3 + id)), smp };
  };
  const a = pos(t), b = pos(t + 1e-3);
  const vx = (b.x - a.x) / 1e-3, vy = (b.y - a.y) / 1e-3, vz = (b.z - a.z) / 1e-3;
  const trackYaw = Math.atan2(-a.smp.tangent.x, -a.smp.tangent.z);
  const q = quatFromEuler(trackYaw + 0.15 * Math.sin(t * 0.8 + id), 0.06 * Math.sin(t * 2 + id), 0.05 * Math.sin(t * 1.7 + id));
  return [id, a.x, a.y, a.z, ...q, vx, vy, vz, a.s, 0];
}

/** Kinematic toy body following the core physics contract (state/step/serialize/deserialize). */
export function createToyBody(world = null, s0 = 0) {
  const st = {
    position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    quaternion: { x: 0, y: 0, z: 0, w: 1, set(x, y, z, w) { Object.assign(this, { x, y, z, w }); } },
    velocity: { x: 0, y: 0, z: -12, set(x, y, z) { Object.assign(this, { x, y, z }); } },
    s: s0, yaw: 0,
  };
  if (world) {
    const smp = world.track.sampleAt(s0);
    st.yaw = Math.atan2(-smp.tangent.x, -smp.tangent.z);
    st.position.set(smp.position.x, world.heightAt(smp.position.x, smp.position.z) + 0.45, smp.position.z);
    st.velocity.set(-Math.sin(st.yaw) * 12, 0, -Math.cos(st.yaw) * 12);
    st.quaternion.set(0, Math.sin(st.yaw / 2), 0, Math.cos(st.yaw / 2));
  }
  return {
    state: st,
    step(dt, inp) {
      st.yaw += (inp.steer || 0) * 0.9 * dt;
      const sp = Math.min(30, Math.hypot(st.velocity.x, st.velocity.z) + (inp.paddleL || 0) * 0.6 - (inp.handbrake || 0) * 4 * dt);
      st.velocity.x = -Math.sin(st.yaw) * sp; st.velocity.z = -Math.cos(st.yaw) * sp;
      st.position.x += st.velocity.x * dt; st.position.z += st.velocity.z * dt;
      st.s += sp * dt;
      if (world) {
        st.position.y = world.heightAt(st.position.x, st.position.z) + 0.45;
        let best = st.s, bd = Infinity; // keep s = projection onto the centreline
        for (let d = -3; d <= 3; d += 0.25) { const p = world.track.sampleAt(st.s + d).position; const dd = (p.x - st.position.x) ** 2 + (p.z - st.position.z) ** 2; if (dd < bd) { bd = dd; best = st.s + d; } }
        st.s = best;
      }
      st.quaternion.set(0, Math.sin(st.yaw / 2), 0, Math.cos(st.yaw / 2));
    },
    serialize(a, o = 0) { a[o] = st.position.x; a[o + 1] = st.position.y; a[o + 2] = st.position.z; a[o + 3] = st.quaternion.x; a[o + 4] = st.quaternion.y; a[o + 5] = st.quaternion.z; a[o + 6] = st.quaternion.w; a[o + 7] = st.velocity.x; a[o + 8] = st.velocity.y; a[o + 9] = st.velocity.z; a[o + 13] = st.s; return o + 20; },
    deserialize(a, o = 0) { st.position.set(a[o], a[o + 1], a[o + 2]); st.quaternion.set(a[o + 3], a[o + 4], a[o + 5], a[o + 6]); st.yaw = 2 * Math.atan2(a[o + 4], a[o + 6]); st.velocity.set(a[o + 7], a[o + 8], a[o + 9]); st.s = a[o + 13]; return o + 20; },
  };
}

/** Steering controller that keeps a toy body near the centreline of the fake track. */
export function followTrack(world, body, wobble = 0) {
  const st = body.state;
  // nearest s: search around current s
  let best = st.s, bd = Infinity;
  for (let d = -6; d <= 6; d += 0.5) { const p = world.track.sampleAt(st.s + d).position; const dd = (p.x - st.position.x) ** 2 + (p.z - st.position.z) ** 2; if (dd < bd) { bd = dd; best = st.s + d; } }
  const smp = world.track.sampleAt(best);
  const lat = (st.position.x - smp.position.x) * smp.right.x + (st.position.z - smp.position.z) * smp.right.z;
  let he = st.yaw - Math.atan2(-smp.tangent.x, -smp.tangent.z); he = Math.atan2(Math.sin(he), Math.cos(he));
  return Math.max(-1, Math.min(1, -he * 3 + lat * 0.15 + wobble));
}
