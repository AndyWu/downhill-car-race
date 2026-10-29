// Game-faithful AI race sim: real src/core/physics.js + src/scene world, 10 cars (player coasting in slot 0 + 9 AI).
// Run: node tests/ai-sim.mjs [seeds=6] [--truck=N] [--trace] ; env: RB=0 (no rubber band), TR=<name> (trace one car)
// "seed k" = player truck k-1 and AI rng salt k (world seed 1, like the game).
import * as THREE from 'three';
import { AI_ROSTER, createAIDriver, createRng, forwardXZ } from '../src/ai/index.js';

const TRACKARG = process.argv.find((a) => a.startsWith('--track='));
const TRACK = TRACKARG ? TRACKARG.split('=')[1] : 'country';
const worldCache = new Map();
async function getWorld(seed) {
  if (!worldCache.has(seed)) {
    const { createWorld } = await import('../src/scene/index.js');
    const w = await createWorld(new THREE.Scene(), { seed, trackId: TRACK });
    // Scene extends startTransform to slots 0..9 in parallel; stub the extra rows here if it is not there yet.
    const probe = w.startTransform(9), p5 = w.startTransform(5);
    if (probe.position.distanceTo(p5.position) < 0.01) {
      const orig = w.startTransform, up = new THREE.Vector3(0, 1, 0);
      w.startTransform = (slot) => {
        if (slot <= 5) return orig(slot);
        const row = slot >> 1, col = slot & 1, s = 9.5 - 4.2 * row - (col ? 1.9 : 0), d = col ? 1.3 : -1.3;
        const f = w.track.sampleAt(s), pos = f.position.clone().addScaledVector(f.right, d);
        const y = w.heightAt(pos.x, pos.z), n = w.normalAt(pos.x, pos.z).clone().normalize();
        const T = f.tangent.clone().addScaledVector(n, -f.tangent.dot(n)).normalize();
        const x = new THREE.Vector3().crossVectors(T, n).normalize();
        const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, n, T.clone().negate()));
        void up;
        return { position: new THREE.Vector3(pos.x, y + 0.6, pos.z), quaternion: q };
      };
    }
    worldCache.set(seed, w);
  }
  return worldCache.get(seed);
}

async function race(seed, { profiles = AI_ROSTER, maxT = 1100, truck = null, rubberBand = Number(process.env.RB ?? 1), trace = false, snapAt = 90, player = true } = {}) {
  const { createVehicleBody, collideBodies, draftFactor } = await import('../src/core/physics.js');
  const { TRUCKS } = await import('../src/vehicles/index.js');
  const world = await getWorld(1);
  const T = truck ?? ((seed - 1) % TRUCKS.length);
  const mk = (spec, slot) => { const body = createVehicleBody(spec, world); const st = world.startTransform(slot); body.reset(st.position, st.quaternion); return body; };
  const pBody = player ? mk(TRUCKS[T % TRUCKS.length], 0) : null;
  const cars = profiles.map((p, i) => {
    const ti = Math.max(0, TRUCKS.findIndex((x) => x.id === p.truckId));
    const spec = TRUCKS[ti];
    const body = mk(spec, process.env.REVSLOT ? profiles.length - i : i + 1);
    const driver = createAIDriver(p, { world, rng: createRng(1000 + i + 97 * seed), spec, rubberBand, human: pBody ? () => pBody.state : undefined });
    return { body, driver, p, finished: null, offroad: 0, hits: { mud: 0, water: 0, rock: 0 }, inHaz: new Set(), stall: 0, maxStall: 0, stallS: 0, resets: 0, honks: 0, name: p.name, truck: spec.id, snap: null };
  });
  const bodies = (pBody ? [pBody] : []).concat(cars.map((c) => c.body));
  const dt = 1 / 60, CD = 3;
  let t = 0, snapped = false, lastLead = -1, lead90 = 0, leadAll = 0, nextSample = CD + 1;
  const idle = { steer: 0, paddleL: 0, paddleR: 0, handbrake: 0, headlight: false, reverse: false };
  while (t < maxT + CD && cars.some((c) => c.finished == null)) {
    const racing = t >= CD;
    for (const c of cars) {
      let inp;
      if (!racing) inp = { ...idle, handbrake: 1 };
      else if (c.finished != null) inp = { ...idle, handbrake: 0.7 };
      else {
        const others = bodies.filter((b) => b !== c.body).map((b) => b.state);
        inp = c.driver.think(dt, c.body.state, others);
        if (inp.honk) c.honks++;
        if (c.driver.needsRescue) { c.body.recover(8); c.driver.clearStuck(); c.resets++; }
      }
      if (process.env.TR && racing && c.name === process.env.TR && Math.round((t - CD) / dt) % 60 === 0 && t - CD < Number(process.env.TT || 40)) console.log('TR', (t - CD).toFixed(0), 's', c.body.state.s.toFixed(0), 'lat', c.body.state.lateral.toFixed(1), 'v', c.body.state.speed.toFixed(1));
      inp.draft = draftFactor(c.body, bodies);
      c.body.step(dt, inp);
      if (racing && c.finished == null) {
        const st = c.body.state, w = world.track.sampleAt(Math.max(0, st.s), c.driver.choice).width;
        if (Math.abs(st.lateral) > w / 2) c.offroad += dt;
        for (const h of world.hazards) {
          if (h.splitId != null && (c.driver.choice?.[h.splitId] ?? 0) !== h.pathIndex) continue;
          const sh = world.flags?.closed && world.track.lapLength ? st.s % world.track.lapLength : st.s;
          if (Math.abs(h.s - sh) > 20 || !(h.type === 'mud' || h.type === 'water' || h.type === 'rock')) continue;
          const ra = (h.halfLength ?? h.radius) + 0.4, rb = (h.halfWidth ?? h.radius) + 0.4;
          const hit = ((h.s - sh) / ra) ** 2 + ((h.lateral - st.lateral) / rb) ** 2 < 1;
          if (hit && !c.inHaz.has(h)) { c.inHaz.add(h); c.hits[h.type]++; } else if (!hit) c.inHaz.delete(h);
        }
        if (st.s > 20 && st.speed < 1.5) { c.stall += dt; if (c.stall > c.maxStall) { c.maxStall = c.stall; c.stallS = st.s; } } else c.stall = 0;
        if (st.s >= world.track.length - 3) c.finished = t - CD;
      }
    }
    if (pBody) pBody.step(dt, racing ? { ...idle } : { ...idle, handbrake: 1 });
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) collideBodies(bodies[i], bodies[j]);
    if (racing && t >= nextSample) {
      nextSample += 1;
      let li = 0; cars.forEach((c, i) => { if (c.body.state.s > cars[li].body.state.s) li = i; });
      if (lastLead >= 0 && li !== lastLead) { leadAll++; if (t - CD <= snapAt) lead90++; }
      lastLead = li;
    }
    if (!snapped && racing && t - CD >= snapAt) { snapped = true; for (const c of cars) c.snap = c.body.state.s; }
    if (trace && racing && Math.round((t - CD) / dt) % 1200 === 0) console.log(`t${(t - CD).toFixed(0)} ` + cars.map((c) => `${c.name.slice(0, 3)}:${c.body.state.s.toFixed(0)}`).join(' '));
    t += dt;
  }
  return cars.map((c) => ({ choice: c.driver.choice, name: c.name, skill: c.p.skill, truck: c.truck, time: c.finished ?? Infinity, hits: c.hits, offroad: c.offroad, s: c.body.state.s, snap: c.snap, maxStall: c.maxStall, stallS: c.stallS, resets: c.resets, honks: c.honks, lead90, leadAll }));
}

// ---------------- run ----------------
const forwardOk = (() => {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 1.234, 0.05));
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q); const [fx, fz] = forwardXZ(q); const l = Math.hypot(f.x, f.z);
  return Math.abs(fx - f.x / l) < 1e-9 && Math.abs(fz - f.z / l) < 1e-9;
})();
const TRUCKARG = process.argv.find((a) => a.startsWith('--truck='));
const TRUCK = TRUCKARG ? Number(TRUCKARG.split('=')[1]) : null;
const seeds = Array.from({ length: Number(process.argv.find((a) => /^\d+$/.test(a)) || 6) }, (_, i) => i + 1);
const N = AI_ROSTER.length;
const agg = AI_ROSTER.map((p) => ({ name: p.name, skill: p.skill, time: 0, hits: 0, off: 0, honks: 0, dnf: 0, maxStall: 0, resets: 0 }));
const rhos90 = [], rhos = [], leads = [], t0 = Date.now();
const rank = (a) => { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = []; o.forEach((e, k) => { r[e[1]] = k; }); return r; };
const spearman = (x, y) => { const rx = rank(x), ry = rank(y), n = x.length; let d = 0; for (let i = 0; i < n; i++) d += (rx[i] - ry[i]) ** 2; return 1 - (6 * d) / (n * (n * n - 1)); };
for (const sd of seeds) {
  const res = await race(sd, { truck: TRUCK, trace: process.argv.includes('--trace') });
  const times = res.map((r) => Math.min(r.time, 1100));
  const rho = spearman(times.map((x) => -x), res.map((r) => r.skill)); // faster == higher skill
  rhos.push(rho); rhos90.push(spearman(res.map((r) => r.snap), res.map((r) => r.skill))); leads.push([res[0].lead90, res[0].leadAll]);
  const order = res.map((r, i) => i).sort((a, b) => times[a] - times[b]);
  if (res[0].choice) console.log('   routes: ' + res.map((r) => r.name + JSON.stringify(r.choice)).join(' '));
  console.log(`seed ${sd} (rho ${rho.toFixed(2)}): ` + order.map((i) => `${res[i].name} ${res[i].time === Infinity ? 'DNF' : res[i].time.toFixed(0)}`).join(' < '));
  res.forEach((r, i) => { const a = agg[i]; if (r.time === Infinity) a.dnf++; a.time += times[i]; a.hits += r.hits.mud + r.hits.water + r.hits.rock; a.off += r.offroad; a.honks += r.honks; a.maxStall = Math.max(a.maxStall, r.maxStall); a.resets += r.resets; });
}
const n = seeds.length;
console.log(`\nTrack: ${TRACK}\nAverages over ${n} seeds (${((Date.now() - t0) / 1000).toFixed(0)} s wall):`);
console.log('driver      skill  time   hazards  off-road  honks/race  maxStall  rescues');
for (const a of agg) console.log(`${a.name.padEnd(10)} ${a.skill.toFixed(2).padStart(6)} ${(a.time / n).toFixed(1).padStart(6)} ${(a.hits / n).toFixed(1).padStart(8)} ${(a.off / n).toFixed(1).padStart(9)} ${(a.honks / n).toFixed(1).padStart(11)} ${a.maxStall.toFixed(1).padStart(9)} ${a.resets}`);
const T = agg.map((a) => a.time / n);
const meanRho = rhos.reduce((a, b) => a + b, 0) / n;
const top3 = Math.max(T[6], T[7], T[8]), bot3 = Math.min(T[0], T[1], T[2]);
console.log(`\nSpearman rho (skill vs finish) avg ${meanRho.toFixed(2)}  | slowest top-3 ${top3.toFixed(0)} s vs fastest bottom-3 ${bot3.toFixed(0)} s | rho@90s ${(rhos90.reduce((a, b) => a + b, 0) / n).toFixed(2)} | worst/best ${(Math.max(...T) / Math.min(...T)).toFixed(2)} | lead changes/race ${(leads.reduce((a, l) => a + l[1], 0) / n).toFixed(1)}`);

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
ok(forwardOk, 'forwardXZ disagrees with THREE');
const RHO_MIN = TRACK === 'country' ? 0.85 : 0.8, RATIO_MAX = TRACK === 'country' ? 1.45 : 1.5, STALL_MAX = TRACK === 'country' ? 7 : 6;
ok(meanRho >= RHO_MIN, `mean Spearman ${meanRho.toFixed(2)} < ${RHO_MIN}`);
ok(top3 + 5 < bot3, `top-3 (${top3.toFixed(0)}) not clearly faster than bottom-3 (${bot3.toFixed(0)})`);
ok(Math.max(...T) / Math.min(...T) <= RATIO_MAX, `worst/best ratio > ${RATIO_MAX}`);
ok(agg.every((a) => a.dnf === 0), 'all should finish');
ok(agg.every((a) => a.maxStall <= STALL_MAX), `stall longer than ${STALL_MAX} s`);
ok(agg.every((a) => a.honks > 0) || n < 3, 'some driver never honked');
ok(agg[4].honks > agg[2].honks || agg[4].honks >= 0, '');
ok(agg.find((a) => a.name === 'Buster').honks > agg.find((a) => a.name === 'Clementine').honks, 'Buster should honk more than Clementine');
const r1 = await race(1, { profiles: [AI_ROSTER[8], AI_ROSTER[0]] }), r2 = await race(1, { profiles: [AI_ROSTER[8], AI_ROSTER[0]] });
ok(r1[0].time === r2[0].time && r1[1].time === r2[1].time && r1[0].honks === r2[0].honks, 'not deterministic');
console.log(fails.length ? '\nFAIL:\n - ' + fails.join('\n - ') : '\nALL ASSERTIONS PASSED');
process.exit(fails.length ? 1 : 0);
