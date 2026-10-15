import { buildPlan } from './planner.js';
import { createRng, normal } from './rng.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const STEER_SIGN = 1; // +steer = turn right (+X when facing -Z). Flip here if physics disagrees.

/** Forward unit vector projected on XZ from a THREE-style quaternion (local forward = -Z). */
export function forwardXZ(q) {
  const fx = -2 * (q.x * q.z + q.w * q.y);
  const fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
  const l = Math.hypot(fx, fz) || 1;
  return [fx / l, fz / l];
}

/**
 * createAIDriver(profile, { world, rng, spec?, rubberBand?, headlight? })
 *  spec        optional truck spec ({wheelBase, steerLock}) for pure-pursuit -> steer conversion
 *  rubberBand  0..1 strength (default 0 = OFF)
 *  headlight   boolean | () => boolean ; default reads world.timeOfDay / world.isDark
 */
export function createAIDriver(profile, { world, rng, spec, rubberBand = 0, headlight } = {}) {
  const P = profile;
  rng = rng || createRng(1);
  const plan = buildPlan(world, P, rng);
  const WB = spec?.wheelBase ?? 1.4, LOCK = spec?.steerLock ?? 0.45;
  const L = plan.length;

  let t = 0, noise = 0, steerOut = 0, hbOut = 0, extra = 0;
  const queue = []; // delayed commands {t, steer, hb}
  // paddling state
  let side = rng() < 0.5, strokeStart = -1, strokeAmp = 0, nextStroke = 0.2, stamina = 1;
  let attentive = false, nextToggle = 0;
  // stuck recovery
  let stuckT = 0, reverseUntil = 0;

  function think(dt, self, others = []) {
    t += dt;
    const s = self.s, speed = Math.max(0, self.speed || 0);
    const px = self.position.x, pz = self.position.z;
    const [fx, fz] = forwardXZ(self.quaternion);

    // ---- other cars: drafting / bumping / avoidance -> lateral offset on top of the plan ----
    let goal = 0;
    let ahead = null, aheadDs = Infinity, alongside = null;
    for (const o of others) {
      if (!o || o === self) continue;
      const dsO = o.s - s, dl = o.lateral - self.lateral;
      if (dsO === 0 && dl === 0) continue;
      if (dsO > 0.5 && dsO < aheadDs && Math.abs(dl) < 3) { ahead = o; aheadDs = dsO; }
      if (Math.abs(dsO) < 4 && Math.abs(dl) > 0.3 && Math.abs(dl) < 2.6) alongside = o;
    }
    const Ld = Math.max(P.look.min, P.look.time * speed);
    const sT = clamp(s + Ld, 0, L);
    const eT = plan.offsetAt(sT);
    if (ahead) {
      const dl = ahead.lateral - self.lateral;
      if (P.draft.range > 0 && aheadDs <= P.draft.range) {
        if (P.draft.overtake && aheadDs < 3.5 && speed > (ahead.speed || 0) + 0.2) {
          goal = (ahead.lateral > eT ? -1 : 1) * 1.8; // slingshot past
        } else {
          goal = clamp(ahead.lateral - eT, -2.5, 2.5) * P.draft.strength; // sit in the slipstream
        }
      } else if (P.aggression > 0.5 && aheadDs < 14) {
        goal = clamp(ahead.lateral - eT, -3, 3); // line up for a bump
      } else if (P.carAvoid > 0 && aheadDs < 12 && Math.abs(dl) < 1.8 && speed > (ahead.speed || 0) - 0.5) {
        goal = (dl >= 0 ? -1 : 1) * 2.0 * P.carAvoid;
      }
    }
    if (P.aggression > 0.5 && alongside) goal = clamp(alongside.lateral - eT, -2.5, 2.5) * 0.8; // shove
    if (goal !== 0 && plan.costAt(sT, eT + goal) > plan.costAt(sT, eT) + 1) goal = 0; // don't drive into a hazard for it
    extra += (goal - extra) * (1 - Math.exp(-dt / 0.4));

    // ---- steering: pure pursuit toward planned point ----
    const [rxT, rzT] = plan.rightAt(sT);
    const tx = plan.xAt(sT) + extra * rxT, tz = plan.zAt(sT) + extra * rzT;
    const dx = tx - px, dz = tz - pz;
    const xl = dx * fx + dz * fz, yl = -dx * fz + dz * fx;
    const dist = Math.max(1, Math.hypot(dx, dz));
    const err = Math.atan2(yl, Math.max(xl, 0.01));
    const curv = (2 * Math.sin(clamp(err, -1.5, 1.5))) / dist;
    const delta = Math.atan(WB * curv);
    noise += (-noise / P.steerNoiseTau) * dt + P.steerNoise * Math.sqrt((2 * dt) / P.steerNoiseTau) * normal(rng);
    const rawSteer = clamp((P.steerGain * delta) / LOCK + noise, -1, 1);

    // ---- speed target / handbrake ----
    let rb = 1;
    if (rubberBand > 0 && others.length) {
      let mx = -Infinity;
      for (const o of others) if (o && o.s > mx) mx = o.s;
      const gap = mx - s; // >0: behind the leader, <0: we lead
      rb = gap > 0 ? 1 + 0.12 * rubberBand * Math.min(1, gap / 80) : 1 - 0.1 * rubberBand * Math.min(1, -gap / 80);
    }
    const vt = Math.min(plan.speedAt(s), plan.speedAt(clamp(s + speed * P.speed.lookTime, 0, L))) * P.speed.scale * rb;
    const over = speed - vt - P.brake.dead;
    let hbRaw = over > 0 ? Math.min(P.brake.max, over * P.brake.gain) : 0;
    if (P.brake.tap && hbRaw > 0 && over < 1.2) hbRaw = ((t * 6) % 1) < 0.5 ? Math.min(0.4, hbRaw * 2) : 0; // light taps
    queue.push({ t, steer: rawSteer, hb: hbRaw });
    let cmd = queue[0];
    while (queue.length > 1 && queue[1].t <= t - P.reactionTime) { queue.shift(); cmd = queue[0]; }
    if (t < P.reactionTime) cmd = { steer: 0, hb: 0 };
    steerOut += (cmd.steer - steerOut) * (1 - Math.exp(-dt / Math.max(1e-3, P.steerTau)));
    hbOut = cmd.hb > hbOut ? hbOut + (cmd.hb - hbOut) * (1 - Math.exp(-dt / 0.06)) : cmd.hb;

    // ---- paddling: rhythmic alternating strokes ----
    const PD = P.paddle;
    const slope = plan.slopeAt(s);
    let want = 0; // 0..1 how much we want to paddle -> scales cadence
    const slow = speed < vt - PD.speedMargin;
    switch (PD.mode) {
      case 'forgetful':
        if (t >= nextToggle) { attentive = rng() < PD.attentive; nextToggle = t + 2 + rng() * 4; }
        want = s < PD.startDist || speed < 2.5 || attentive ? 1 : 0;
        break;
      case 'slow': want = slow ? 1 : 0; break;
      case 'furious': want = 1; break;
      case 'rhythm': want = slow && -slope < PD.slopeMax ? 1 : 0; break;
      case 'optimal': {
        const need = clamp((vt - speed) / 3, 0, 1);
        const flat = 1 - clamp(-slope / PD.slopeMax, 0, 1); // 1 = flat (best leverage), 0 = steep
        const turning = Math.abs(steerOut) > 0.7 ? 0.5 : 1;
        want = need < 0.08 ? 0 : (0.6 + 0.4 * flat) * turning;
        break;
      }
    }
    if (hbOut > 0.05) want = 0;
    const fat = PD.stamina.minFactor + (1 - PD.stamina.minFactor) * stamina;
    const cadence = PD.cadence * fat * (rb > 1 ? 1 + (rb - 1) : 1) * (PD.mode === 'optimal' ? want : 1);
    if (strokeStart < 0 && want > 0 && t >= nextStroke) {
      side = !side; strokeStart = t;
      strokeAmp = Math.min(1, PD.strength * (0.88 + 0.12 * rng()));
      stamina = Math.max(0, stamina - PD.stamina.drain * strokeAmp);
      nextStroke = t + (1 / Math.max(0.3, cadence)) * (1 + PD.jitter * (rng() * 2 - 1));
    } else if (strokeStart < 0) {
      stamina = Math.min(1, stamina + PD.stamina.regen * dt);
    }
    let pv = 0;
    if (strokeStart >= 0) {
      const ph = (t - strokeStart) / PD.strokeDur;
      if (ph >= 1) strokeStart = -1; else pv = strokeAmp * Math.sin(Math.PI * ph);
    }

    // ---- stuck recovery ----
    let reverse = false;
    if (t > 4 && speed < 0.4 && t > reverseUntil) stuckT += dt; else if (speed >= 0.4) stuckT = 0;
    if (stuckT > 2.5) { reverseUntil = t + 1.2; stuckT = 0; }
    let steer = steerOut;
    if (t < reverseUntil) { reverse = true; steer = -steerOut; }

    let hl = false;
    if (typeof headlight === 'function') hl = !!headlight();
    else if (typeof headlight === 'boolean') hl = headlight;
    else hl = !!(world.isDark || world.timeOfDay === 'dusk' || world.timeOfDay === 'night');

    return {
      steer: clamp(steer * STEER_SIGN, -1, 1),
      paddleL: side ? 0 : pv,
      paddleR: side ? pv : 0,
      handbrake: clamp(hbOut, 0, 1),
      headlight: hl,
      reverse,
    };
  }
  return { think, profile: P, plan };
}
