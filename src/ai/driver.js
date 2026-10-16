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
 *  rubberBand  0..1 strength (default 1 = gentle +-5% paddle cadence; 0 = OFF)
 *  human       optional () => state of the human player to chase/ease off from
 *  headlight   boolean | () => boolean ; default reads world.timeOfDay / world.isDark
 */
export function createAIDriver(profile, { world, rng, spec, rubberBand = 1, human, headlight } = {}) {
  const P = profile;
  rng = rng || createRng(1);
  const plan = buildPlan(world, P, rng, spec);
  const WB = spec?.wheelBase ?? 1.7, LOCK = spec?.steerLock ?? 0.5;
  const L = plan.length;

  let t = 0, noise = 0, steerOut = 0, hbOut = 0, extra = 0;
  const queue = []; // delayed commands {t, steer, hb}
  // paddling state
  let side = rng() < 0.5, nextStroke = 0.2, stamina = 1;
  let attentive = false, nextToggle = 0;
  // stuck recovery
  let launch = null;
  let passSide = 0, passUntil = 0, passStart = 0, passCool = 0;
  let stuckT = 0, reverseUntil = 0, kickUntil = 0, revNext = 0, revSteer = 1, recoveries = 0, consec = 0, stuckTotal = 0;

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
    const outBy = Math.max(0, Math.abs(self.lateral) - plan.widthAt(s) / 2); // metres beyond the verge
    const Ld = Math.max(P.look.min, P.look.time * speed) + 2.5 * outBy; // look further to rejoin the road at a shallow angle
    const sT = clamp(s + Ld, 0, L);
    const eT = plan.offsetAt(sT);
    const hw = plan.widthAt(s) / 2;
    if (ahead) {
      const dl = ahead.lateral - self.lateral;
      const slower = (ahead.speed || 0) < speed - 0.1;
      if (P.pass && aheadDs < 16 && Math.abs(dl) < 2.4 && slower && t > passCool) {
        // overtake: pick a side with road to spare and go around instead of sitting behind
        if (!passSide || t > passUntil) { passSide = ahead.lateral > 0 ? -1 : 1; passStart = t; }
        let latPass = ahead.lateral + passSide * 1.9;
        if (Math.abs(latPass) > hw - 1.2) { passSide = -passSide; latPass = ahead.lateral + passSide * 1.9; }
        if (Math.abs(latPass) > hw - 1.2 || t - passStart > 6) { passSide = 0; passCool = t + 4; } // no room / not working: stay put
        else { passUntil = t + 1.5; goal = clamp(latPass - eT, -3.5, 3.5); }
      } else if (P.draft.range > 0 && aheadDs <= P.draft.range) {
        if (P.draft.overtake && aheadDs < 3.5 && speed > (ahead.speed || 0) + 0.2) {
          goal = (ahead.lateral > eT ? -1 : 1) * 1.8; // slingshot past
        } else {
          goal = clamp(ahead.lateral - eT, -2.5, 2.5) * P.draft.strength; // sit in the slipstream
        }
      } else if (P.aggression > 0.5 && aheadDs < 6 && (ahead.speed || 0) > speed - 0.3 && Math.abs(dl) < 1.2) {
        goal = clamp(ahead.lateral - eT, -1.5, 1.5) * 0.5; // nudge a rival that is not slower
      } else if (P.carAvoid > 0 && aheadDs < 12 && Math.abs(dl) < 1.8 && speed > (ahead.speed || 0) - 0.5) {
        goal = (dl >= 0 ? -1 : 1) * 2.0 * P.carAvoid;
      }
    }
    if (P.pass && passSide && t <= passUntil && alongside && !goal) goal = clamp(alongside.lateral + passSide * 1.9 - eT, -3.5, 3.5); // hold the line until clear
    if (P.pass && t > passUntil) passSide = 0;
    if (P.aggression > 0.5 && alongside) goal = clamp(alongside.lateral - eT, -2.5, 2.5) * 0.35; // shove
    else if (P.carAvoid > 0 && alongside && !goal) goal = (alongside.lateral > self.lateral ? -1 : 1) * 0.9 * P.carAvoid; // give room
    if (goal !== 0 && plan.costAt(sT, eT + goal) > plan.costAt(sT, eT) + 1) goal = 0; // don't drive into a hazard for it
    extra += (goal - extra) * (1 - Math.exp(-dt / 0.4));

    // ---- steering: pure pursuit toward planned point ----
    if (launch === null) { launch = { s0: s, off: clamp(self.lateral - plan.offsetAt(s), -3, 3) }; } // grid slot is rarely on the planned line
    const launchOff = launch.off * Math.max(0, 1 - (sT - launch.s0) / 90); // fade the grid offset into the plan over 90 m
    const [rxT, rzT] = plan.rightAt(sT);
    const tx = plan.xAt(sT) + (extra + launchOff) * rxT, tz = plan.zAt(sT) + (extra + launchOff) * rzT;
    const dx = tx - px, dz = tz - pz;
    const xl = dx * fx + dz * fz, yl = -dx * fz + dz * fx;
    const dist = Math.max(1, Math.hypot(dx, dz));
    const err = Math.atan2(yl, Math.max(xl, 0.01));
    const curv = (2 * Math.sin(clamp(err, -1.5, 1.5))) / dist;
    // yaw-rate damping (Y-up: +yaw = turning left, so a right-hand path wants negative yaw)
    const yaw = self.angularVelocity ? self.angularVelocity.y : 0;
    const yawDes = -speed * curv;
    const delta = Math.atan(WB * curv) + P.yawDamp * clamp(yaw - yawDes, -1.5, 1.5);
    noise += (-noise / P.steerNoiseTau) * dt + P.steerNoise * Math.sqrt((2 * dt) / P.steerNoiseTau) * normal(rng);
    const lockScale = 0.35 + 0.65 / (1 + 0.7 * (speed / 16) ** 2); // physics reduces effective lock with speed
    const rawSteer = clamp((P.steerGain * (1 + 0.5 * Math.min(1, outBy)) * delta) / (LOCK * lockScale) + noise, -1, 1);

    // ---- speed target / handbrake ----
    // soft rubber band (default ON, gentle): +-5% paddle cadence by gap to the human (opts.human() -> state) or, if
    // unknown, to the average of the other cars. Does not touch lines, braking or grip.
    let rb = 1;
    if (rubberBand > 0 && others.length) {
      let ref;
      const hs = typeof human === 'function' ? human() : null;
      if (hs && hs !== self) ref = hs.s;
      else { ref = 0; for (const o of others) ref += o.s; ref /= others.length; }
      rb = 1 + 0.05 * rubberBand * clamp((ref - s) / 60, -1, 1);
    }
    // leader ease: a car >35 m clear of the AI pack lifts off a little (profile-aware via P.leaderEase) so races stay close
    let easeK = 0;
    if (rubberBand > 0 && P.leaderEase > 0 && others.length) {
      const hs = typeof human === 'function' ? human() : null;
      let sum = 0, cnt = 0;
      for (const o of others) if (o !== hs) { sum += o.s; cnt++; }
      if (cnt) easeK = clamp((s - sum / cnt - 15) / 30, 0, 1) * P.leaderEase * rubberBand;
    }
    const vt = Math.min(plan.speedAt(s), plan.speedAt(clamp(s + speed * P.speed.lookTime, 0, L))) * P.speed.scale * (1 - 0.1 * easeK) * (outBy > 0 ? 0.65 : 1);
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
        want = need < 0.08 ? 0 : (0.85 + 0.15 * flat) * turning;
        break;
      }
    }
    const offRoad = Math.abs(self.lateral) > plan.widthAt(s) / 2 + 0.3;
    if (offRoad) want = 1; // always dig in when on the verge
    if (hbOut > 0.05) want = 0;
    const fat = PD.stamina.minFactor + (1 - PD.stamina.minFactor) * stamina;
    // physics gives dv ~ 1/(1+(v/5.5)^2) per stroke, so the pro bursts hardest when slowest
    const burst = PD.mode === 'optimal' ? Math.min(4.2 / PD.cadence, 1 + 0.4 * (1 - clamp(speed / 8, 0, 1))) : 1;
    const cadence = PD.cadence * fat * burst * rb * (1 - 0.2 * easeK) * (PD.mode === 'optimal' ? want : 1);
    // Physics treats paddleL/R as a one-frame impulse (like a swipe), so a stroke is a single-frame
    // pulse of height `strokeAmp`, alternating L/R at the profile cadence.
    let pv = 0;
    if (want > 0 && t >= nextStroke) {
      side = !side;
      pv = Math.min(1, PD.strength * (0.88 + 0.12 * rng()));
      stamina = Math.max(0, stamina - PD.stamina.drain * pv);
      nextStroke = t + (1 / Math.max(0.3, cadence)) * (1 + PD.jitter * (rng() * 2 - 1));
    } else {
      stamina = Math.min(1, stamina + PD.stamina.regen * dt);
    }

    // ---- stuck recovery: speed < 1.5 for 2 s beyond s>20 -> reverse 0.8 s with opposite steer, then kick forward ----
    let reverse = false;
    if (s > 20 && t > 3 && speed < 1.5) stuckTotal += dt; else if (speed > 3) stuckTotal = 0;
    const slowNow = speed < 1.5 || (speed < 2 && outBy > 0);
    if (s > 20 && t > 3 && slowNow && t > kickUntil) stuckT += dt; else if (!slowNow || t <= kickUntil) stuckT = 0;
    if (speed > 4) consec = 0;
    if (stuckT > 1) { const rd = 0.8 + 0.7 * Math.min(consec, 3); consec++; reverseUntil = t + rd; kickUntil = t + rd + 2.0; stuckT = 0; recoveries++; revSteer = err >= 0 ? -1 : 1; }
    let steer = steerOut;
    let rpv = pv, rhb = hbOut;
    if (t < reverseUntil) { // reversing is done with paddle strokes in the physics
      reverse = true; steer = revSteer; rhb = 0; // reversing: opposite wheel swings the nose toward the centre-line target
      rpv = 0;
      if (t >= revNext) { revNext = t + 0.2; side = !side; rpv = 1; }
    } else if (t < kickUntil) { // forward kick to get going again
      rhb = 0; rpv = 0;
      if (t >= revNext) { revNext = t + 0.22; side = !side; rpv = 1; }
    }
    pv = rpv;

    let hl = false;
    if (typeof headlight === 'function') hl = !!headlight();
    else if (typeof headlight === 'boolean') hl = headlight;
    else hl = !!(world.isDark || world.timeOfDay === 'dusk' || world.timeOfDay === 'night');

    return {
      steer: clamp(steer * STEER_SIGN, -1, 1),
      paddleL: side ? 0 : pv,
      paddleR: side ? pv : 0,
      handbrake: clamp(rhb, 0, 1),
      headlight: hl,
      reverse,
    };
  }
  return { think, profile: P, plan, get recoveries() { return recoveries; },
    /** seconds continuously below 1.5 m/s (recovery manoeuvres didn't free the car). Host should call body.recover(~8) when needsRescue. */
    get stuckFor() { return stuckTotal; }, get needsRescue() { return stuckTotal > 6; },
    clearStuck() { stuckTotal = 0; stuckT = 0; consec = 0; } };
}
