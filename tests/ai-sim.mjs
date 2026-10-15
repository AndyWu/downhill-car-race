// Headless AI race sim: mock world + simple vehicle model. Run: node tests/ai-sim.mjs [seeds=3]
import * as THREE from 'three';
import { AI_PROFILES, createAIDriver, createRng, forwardXZ } from '../src/ai/index.js';

const G = 9.81, L = 3218;
const mkRng = createRng;

// ---------------- mock world ----------------
function createMockWorld(seed) {
  const r = mkRng(seed * 7919 + 13);
  const ds = 0.5, N = Math.round(L / ds) + 1;
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28];
  const hairpins = [];
  for (let s = 150; s < L - 100; s += 180 + r() * 160) hairpins.push({ s, a: (r() < 0.5 ? -1 : 1) * (0.045 + r() * 0.03), w: 7 + r() * 5 });
  const xs = new Float64Array(N), zs = new Float64Array(N), ys = new Float64Array(N), th = new Float64Array(N);
  let x = 0, z = 0, y = 0, a = Math.PI / 2 * 0 - Math.PI / 2 * 0; // heading angle: forward=(cos a, sin a); start going -Z
  a = -Math.PI / 2;
  for (let i = 0; i < N; i++) {
    const s = i * ds;
    let k = 0.012 * Math.sin((2 * Math.PI * s) / 310 + ph[0]) + 0.01 * Math.sin((2 * Math.PI * s) / 137 + ph[1]) + 0.006 * Math.sin((2 * Math.PI * s) / 71 + ph[2]);
    for (const h of hairpins) k += h.a * Math.exp(-0.5 * ((s - h.s) / h.w) ** 2);
    xs[i] = x; zs[i] = z; ys[i] = y; th[i] = a;
    a += k * ds; // +k turns right (increasing a)
    x += Math.cos(a) * ds; z += Math.sin(a) * ds;
    y -= ds * (0.085 + 0.03 * Math.sin((2 * Math.PI * s) / 500 + ph[3]) + 0.02 * Math.sin((2 * Math.PI * s) / 190 + ph[0]));
  }
  const widthAt = (s) => 7 + 1.2 * Math.sin(s / 90 + ph[1]);
  const fi = (s) => Math.min(N - 1.001, Math.max(0, s / ds));
  function sampleAt(s) {
    const f = fi(s), i = Math.floor(f), t = f - i;
    const l = (A) => A[i] + (A[i + 1] - A[i]) * t;
    const position = new THREE.Vector3(l(xs), l(ys), l(zs));
    const aa = th[i] + (th[i + 1] - th[i]) * t;
    const dy = (ys[i + 1] - ys[i]) / ds;
    const tangent = new THREE.Vector3(Math.cos(aa), dy, Math.sin(aa)).normalize();
    const right = new THREE.Vector3(-Math.sin(aa), 0, Math.cos(aa)); // right of (cos,sin)
    return { position, tangent, right, up: new THREE.Vector3(0, 1, 0), width: widthAt(s), camber: 0 };
  }
  const cs = [];
  for (let i = 0; i < N; i += 4) cs.push(i);
  let lastHint = null; // mock track self-crosses: use a hint window to disambiguate (real project() is nearest-point)
  function project(pos, hint = lastHint) {
    let bi = 0, bd = Infinity;
    const list = hint == null ? cs : cs.filter((i) => Math.abs(i * ds - hint) < 60);
    for (const i of list) { const d = (xs[i] - pos.x) ** 2 + (zs[i] - pos.z) ** 2; if (d < bd) { bd = d; bi = i; } }
    let s = bi * ds;
    for (let k = 0; k < 3; k++) { const sp = sampleAt(s); s = Math.min(L, Math.max(0, s + (pos.x - sp.position.x) * Math.cos(thAt(s)) + (pos.z - sp.position.z) * Math.sin(thAt(s)))); }
    const sp = sampleAt(s);
    const res = { s, lateral: (pos.x - sp.position.x) * sp.right.x + (pos.z - sp.position.z) * sp.right.z };
    if (hint != null && Math.abs(res.lateral) > 14) return project(pos, null);
    lastHint = s;
    return res;
  }
  function thAt(s) { const f = fi(s), i = Math.floor(f); return th[i] + (th[i + 1] - th[i]) * (f - i); }
  // hazards
  const hazards = [];
  const add = (type, n, rmin, rmax) => { for (let i = 0; i < n; i++) hazards.push({ type, s: 40 + r() * (L - 80), lateral: (r() * 2 - 1) * 2.4, radius: rmin + r() * (rmax - rmin) }); };
  add('mud', 18, 1.3, 2.3); add('water', 9, 1.4, 2.4); add('rock', 45, 0.5, 1.6);
  hazards.sort((p, q) => p.s - q.s);
  const strips = [];
  for (let i = 0; i < 16; i++) { const s0 = 100 + r() * (L - 300); const right = r() < 0.5; strips.push({ s0, s1: s0 + 40 + r() * 80, l0: right ? -0.5 : -4.5, l1: right ? 4.5 : 0.5, type: r() < 0.5 ? 'sand' : 'gravel' }); }
  const SURF = {
    dirt: { friction: 1, drag: 0, bump: 0.1 }, mud: { friction: 0.5, drag: 3.2, bump: 0.3 }, water: { friction: 0.7, drag: 1.8, bump: 0.2 },
    rock: { friction: 0.9, drag: 0, bump: 1 }, sand: { friction: 0.7, drag: 0.5, bump: 0.2 }, gravel: { friction: 0.8, drag: 0.2, bump: 0.4 }, grass: { friction: 0.55, drag: 0.6, bump: 0.3 },
  };
  function surfAtSL(s, lat) {
    if (Math.abs(lat) > widthAt(s) / 2) return { type: 'grass', ...SURF.grass };
    for (const h of hazards) { if (h.type === 'rock') continue; if (Math.abs(h.s - s) < h.radius && Math.hypot(h.s - s, h.lateral - lat) < h.radius) return { type: h.type, ...SURF[h.type] }; }
    for (const q of strips) if (s >= q.s0 && s <= q.s1 && lat >= q.l0 && lat <= q.l1) return { type: q.type, ...SURF[q.type] };
    return { type: 'dirt', ...SURF.dirt };
  }
  const world = {
    track: { length: L, sampleAt, project }, hazards,
    surfaceAt(x, z) { const p = project({ x, z }); return surfAtSL(p.s, p.lateral); },
    _surfAtSL: surfAtSL, _widthAt: widthAt, _thAt: thAt,
  };
  return world;
}

// ---------------- real scene track + hazard field (no renderer needed) ----------------
async function createRealWorld(seed) {
  const { buildTrack } = await import('../src/scene/track.js');
  const { createHazardField, SURFACES } = await import('../src/scene/hazards.js');
  const track = buildTrack(seed);
  const field = createHazardField(track, seed);
  const o = {};
  const surfAtSL = (s, lat) => {
    const w = track.sampleAt(Math.min(L, Math.max(0, s))).width;
    if (Math.abs(lat) > w / 2) return { type: 'grass', ...SURFACES.grass };
    field.query(s, lat, o);
    if (o.zone && o.w > 0.5) return { type: o.zone.type, ...SURFACES[o.zone.type] };
    return { type: 'dirt', ...SURFACES.dirt };
  };
  const world = {
    track: { length: L, sampleAt: (s) => track.sampleAt(s), project: (p) => track.project(p) },
    hazards: field.hazards,
    surfaceAt(x, z) { const p = track.project({ x, z }); return surfAtSL(p.s, p.lateral); },
    _surfAtSL: surfAtSL, _widthAt: (s) => track.sampleAt(Math.min(L, Math.max(0, s))).width,
    _thAt: (s) => { const t = track.sampleAt(Math.min(L, Math.max(0, s))).tangent; return Math.atan2(t.z, t.x); },
    _field: field,
  };
  return world;
}

// ---------------- vehicle model ----------------
const M = 95, CDA_K = 0.0032, CRR = 0.014, LOCK = 0.5, WB = 1.7, HB_DECEL = 4.2;
function createCar(world, slot, lateral) {
  const sp = world.track.sampleAt(0);
  const c = {
    slot, x: sp.position.x + sp.right.x * lateral, z: sp.position.z + sp.right.z * lateral, a: world._thAt(0), v: 0, steer: 0,
    s: 0, lateral, t: 0, finished: null, offroad: 0, hits: { mud: 0, water: 0, rock: 0 }, inHaz: new Set(), rockCool: 0,
    paddleImp: 0, state: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), velocity: new THREE.Vector3(), speed: 0, s: 0, lateral },
  };
  return c;
}
function syncState(c, world) {
  const st = c.state;
  const sp = world.track.sampleAt(c.s);
  st.position.set(c.x, sp.position.y, c.z);
  const phi = Math.atan2(-Math.cos(c.a), -Math.sin(c.a));
  st.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), phi);
  st.velocity.set(Math.cos(c.a) * c.v, 0, Math.sin(c.a) * c.v);
  st.speed = c.v; st.s = c.s; st.lateral = c.lateral;
}
function stepCar(c, inp, dt, world, cars) {
  const proj = world.track.project({ x: c.x, z: c.z }, c.s);
  c.s = proj.s; c.lateral = proj.lateral;
  const sp = world.track.sampleAt(c.s);
  const surf = world._surfAtSL(c.s, c.lateral);
  const w = world._widthAt(c.s);
  if (Math.abs(c.lateral) > w / 2) c.offroad += dt;
  // steering actuator
  const target = Math.max(-1, Math.min(1, inp.steer));
  c.steer += Math.max(-3 * dt, Math.min(3 * dt, target - c.steer));
  const kapCmd = Math.tan(c.steer * LOCK * (0.35 + 0.65 / (1 + 0.7 * (c.v / 16) ** 2))) / WB;
  const mu = surf.friction * 0.95;
  const kapMax = (mu * G) / Math.max(1, c.v * c.v);
  const kap = Math.max(-kapMax, Math.min(kapMax, kapCmd));
  const excess = Math.min(1, Math.max(0, Math.abs(kapCmd) / kapMax - 1));
  // longitudinal
  let drag = CDA_K * c.v * c.v;
  for (const o of cars) if (o !== c && o.s > c.s && o.s - c.s < 8 && Math.abs(o.lateral - c.lateral) < 1.6) { drag *= 0.65; break; }
  let acc = -G * sp.tangent.y - CRR * G * (surf.friction > 0.9 ? 1 : 1.5) - drag - surf.drag * 0.5 * c.v - (c.v > 0 ? 1.5 * excess * c.v * 0.3 : 0);
  const pv = inp.paddleL + inp.paddleR; // mirrors src/core/physics.js: one-frame impulse, weak at speed
  c.v += (0.34 * pv) / (1 + (c.v / 5.5) ** 2);
  if (c.v > 0.05) acc -= HB_DECEL * inp.handbrake;
  c.v = Math.max(0, c.v + acc * dt);
  c.a += c.v * kap * dt;
  c.x += Math.cos(c.a) * c.v * dt; c.z += Math.sin(c.a) * c.v * dt;
  // hazards
  c.rockCool -= dt;
  for (const h of world.hazards) {
    if (Math.abs(h.s - c.s) > 24) continue;
    const key = h;
    const ra = (h.halfLength ?? h.radius) + 0.45, rb = (h.halfWidth ?? h.radius) + 0.45;
    const hit = ((h.s - c.s) / ra) ** 2 + ((h.lateral - c.lateral) / rb) ** 2 < 1;
    if (hit && !c.inHaz.has(key)) {
      c.inHaz.add(key); c.hits[h.type]++;
      if (h.type === 'rock') { c.v *= 0.75; c.a += (c.lateral > h.lateral ? 1 : -1) * 0.15; }
    } else if (!hit && c.inHaz.has(key)) c.inHaz.delete(key);
  }
  if (c.s >= L - 1 && c.finished == null) c.finished = c.t;
  c.t += dt;
}

async function race(seed, { rubberBand = 0, profiles = AI_PROFILES, maxT = 900, real = false } = {}) {
  const world = real ? await createRealWorld(seed) : createMockWorld(seed);
  const dt = 1 / 60;
  const order = [0, 1, 2, 3, 4].map((i) => (i + seed) % 5); // vary grid slot per seed
  const cars = profiles.map((p, i) => createCar(world, i, (order[i] - 2) * 1.2));
  const drivers = profiles.map((p, i) => createAIDriver(p, { world, rng: mkRng(1000 + seed * 31 + i), rubberBand }));
  for (const c of cars) syncState(c, world);
  let t = 0;
  while (t < maxT && cars.some((c) => c.finished == null)) {
    const inputs = cars.map((c, i) => c.finished == null ? drivers[i].think(dt, c.state, cars.filter((o) => o !== c).map((o) => o.state)) : { steer: 0, paddleL: 0, paddleR: 0, handbrake: 0.5 });
    cars.forEach((c, i) => { if (c.finished == null) stepCar(c, inputs[i], dt, world, cars); syncState(c, world); });
    t += dt;
  }
  return cars.map((c, i) => ({ name: profiles[i].name, time: c.finished ?? Infinity, hits: c.hits, offroad: c.offroad, s: c.s }));
}

// ---------------- real physics mode (src/core/physics.js + src/scene world) ----------------
const worldCache = new Map();
async function getRealPhysicsWorld(seed) {
  if (!worldCache.has(seed)) {
    const { createWorld } = await import('../src/scene/index.js');
    worldCache.set(seed, await createWorld(new THREE.Scene(), { seed }));
  }
  return worldCache.get(seed);
}
async function racePhysics(seed, { profiles = AI_PROFILES, maxT = 700, truck = 0, trucks = null, rubberBand = 0, trace = false } = {}) {
  const { createVehicleBody, collideBodies, draftFactor } = await import('../src/core/physics.js');
  const { TRUCKS } = await import('../src/vehicles/index.js');
  const world = await getRealPhysicsWorld(seed);
  const order = profiles.map((_, i) => (i + seed) % 6); // rotate grid slots per seed
  const cars = profiles.map((p, i) => {
    const spec = TRUCKS[(trucks ? trucks[i] : truck) % TRUCKS.length];
    const body = createVehicleBody(spec, world);
    const st = world.startTransform(order[i]);
    body.reset(st.position, st.quaternion);
    const driver = createAIDriver(p, { world, rng: createRng(1000 + seed * 31 + i), spec, rubberBand });
    return { body, driver, finished: null, offroad: 0, hits: { mud: 0, water: 0, rock: 0 }, inHaz: new Set(), stall: 0, maxStall: 0, stallS: 0, resets: 0, name: p.name, log: [] };
  });
  const bodies = cars.map((c) => c.body);
  const dt = 1 / 60, CD = 3;
  let t = 0;
  const idle = { steer: 0, paddleL: 0, paddleR: 0, handbrake: 1, headlight: false, reverse: false };
  while (t < maxT + CD && cars.some((c) => c.finished == null)) {
    const racing = t >= CD;
    const states = cars.map((c) => c.body.state);
    for (const c of cars) {
      let inp;
      if (!racing) inp = idle;
      else if (c.finished != null) inp = { ...idle, handbrake: 0.7 };
      else inp = c.driver.think(dt, c.body.state, states.filter((o) => o !== c.body.state));
      inp.draft = draftFactor(c.body, bodies);
      c.body.step(dt, inp);
      if (racing && c.finished == null) {
        const st = c.body.state, w = world.track.sampleAt(Math.max(0, st.s)).width;
        if (Math.abs(st.lateral) > w / 2) c.offroad += dt;
        for (const h of world.hazards) {
          if (Math.abs(h.s - st.s) > 20 || !(h.type === 'mud' || h.type === 'water' || h.type === 'rock')) continue;
          const ra = (h.halfLength ?? h.radius) + 0.4, rb = (h.halfWidth ?? h.radius) + 0.4;
          const hit = ((h.s - st.s) / ra) ** 2 + ((h.lateral - st.lateral) / rb) ** 2 < 1;
          if (hit && !c.inHaz.has(h)) { c.inHaz.add(h); c.hits[h.type]++; } else if (!hit) c.inHaz.delete(h);
        }
        if (st.s > 20 && st.speed < 1.5) { c.stall += dt; if (process.env.DBG && c.stall > 3 && Math.abs(c.stall % 4) < dt) console.log('STALL', c.name, 's', st.s.toFixed(0), 'lat', st.lateral.toFixed(2), 'v', st.speed.toFixed(2), 'surf', st.surface, 'up', st.upsideDown, 'air', st.airborne, 'contacts', st.wheelContacts.map((w) => w.contact ? 1 : 0).join(''), 'hb', st.handbrake.toFixed(2), 'steer', st.steerNorm.toFixed(2), 'inp', JSON.stringify({ ...inp, headlight: 0 }), 'pos y', st.position.y.toFixed(2), 'ground', world.heightAt(st.position.x, st.position.z).toFixed(2)); if (c.stall > c.maxStall) { c.maxStall = c.stall; c.stallS = st.s; } } else c.stall = 0;
        if (st.s >= world.track.length - 3) c.finished = t - CD;
      }
    }
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) collideBodies(cars[i].body, cars[j].body);
    if (trace && Math.abs((t % 10) - 0) < dt / 2) console.log(t.toFixed(0), cars.map((c) => `${c.name[0]}:${c.body.state.s.toFixed(0)}@${c.body.state.speed.toFixed(1)}`).join(' '));
    t += dt;
  }
  return cars.map((c) => ({ name: c.name, time: c.finished ?? Infinity, hits: c.hits, offroad: c.offroad, s: c.body.state.s, maxStall: c.maxStall, stallS: c.stallS }));
}

// ---------------- run ----------------
const forwardCheck = (() => { // AI's forwardXZ must agree with THREE
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 1.234, 0.05));
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q); const [fx, fz] = forwardXZ(q); const l = Math.hypot(f.x, f.z);
  return Math.abs(fx - f.x / l) < 1e-9 && Math.abs(fz - f.z / l) < 1e-9;
})();
const REAL = process.argv.includes('--real');
const MOCK = process.argv.includes('--mock') || REAL;
const PHYS = !MOCK; // default: real physics + real world
const TRACE = process.argv.includes('--trace');
const TRUCK = Number((process.argv.find((a) => a.startsWith('--truck=')) || '--truck=0').split('=')[1]);
const runRace = (sd, o = {}) => (PHYS ? racePhysics(sd, { truck: TRUCK, trace: TRACE, ...o }) : race(sd, { real: REAL, ...o }));
const seeds = Array.from({ length: Number(process.argv.find((a) => /^\d+$/.test(a)) || 3) }, (_, i) => i + 1);
const agg = AI_PROFILES.map((p) => ({ name: p.name, time: 0, mud: 0, water: 0, rock: 0, off: 0, dnf: 0 }));
const t0 = Date.now();
for (const sd of seeds) {
  const res = await runRace(sd);
  console.log(`seed ${sd}: ` + res.map((r) => `${r.name} ${r.time === Infinity ? 'DNF@' + r.s.toFixed(0) : r.time.toFixed(1) + 's'} (m${r.hits.mud} w${r.hits.water} r${r.hits.rock} off${r.offroad.toFixed(1)}s${r.maxStall > 2 ? ' STALL' + r.maxStall.toFixed(0) + 's@' + r.stallS.toFixed(0) : ''})`).join(' | '));
  res.forEach((r, i) => { const a = agg[i]; if (r.time === Infinity) a.dnf++; a.time += Math.min(r.time, 900); a.mud += r.hits.mud; a.water += r.hits.water; a.rock += r.hits.rock; a.off += r.offroad; });
}
const n = seeds.length;
console.log('\nAverages over ' + n + ' seeds (' + ((Date.now() - t0) / 1000).toFixed(1) + 's wall):');
console.log('name        time    mud  water  rock  total  off-road(s)');
for (const a of agg) console.log(`${a.name.padEnd(10)} ${(a.time / n).toFixed(1).padStart(6)}  ${(a.mud / n).toFixed(1).padStart(5)} ${(a.water / n).toFixed(1).padStart(5)} ${(a.rock / n).toFixed(1).padStart(5)} ${((a.mud + a.water + a.rock) / n).toFixed(1).padStart(6)}  ${(a.off / n).toFixed(1).padStart(6)}`);

// ---------------- assertions ----------------
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const T = agg.map((a) => a.time / n), tot = agg.map((a) => (a.mud + a.water + a.rock) / n);
ok(forwardCheck, 'forwardXZ disagrees with THREE');
ok(T[0] === Math.max(...T), 'Barnaby should be slowest');
ok(T[4] === Math.min(...T), 'Ace should be fastest');
let inv = 0; for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) if (T[i] < T[j]) inv++;
ok(inv <= 2, `tier ordering has ${inv} inversions (>2)`);
ok(tot[1] === Math.min(...tot), 'Clementine should have fewest hazard hits');
const mw = agg.map((a) => (a.mud + a.water) / n);
ok(mw[2] === Math.max(...mw), 'Buster should have most mud/water hits');
ok(agg.every((a) => a.dnf === 0), 'all should finish');
// determinism
const r1 = await runRace(1, { profiles: [AI_PROFILES[4], AI_PROFILES[0]] }), r2 = await runRace(1, { profiles: [AI_PROFILES[4], AI_PROFILES[0]] });
ok(r1[0].time === r2[0].time && r1[1].time === r2[1].time, 'not deterministic');
console.log(fails.length ? '\nFAIL:\n - ' + fails.join('\n - ') : '\nALL ASSERTIONS PASSED');
process.exit(fails.length ? 1 : 0);
