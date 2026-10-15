// Soap Box Derby — boot, game loop, mode machine. Every other module is optional (dynamic, with fallbacks).
import * as THREE from 'three';
import { createVehicleBody, collideBodies, placeOnGround } from './core/physics.js';
import { createInput } from './core/input.js';
import { createFlag } from './core/flag.js';
import { createCockpitCamera } from './core/camera.js';
import { FALLBACK_TRUCKS, createFallbackWorld, buildFallbackTruck } from './core/fallback.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const P = {
  autostart: params.get('autostart') === '1',
  truck: Math.max(0, parseInt(params.get('truck') ?? '0', 10) || 0),
  s: params.has('s') ? parseFloat(params.get('s')) : null,
  time: params.get('time') || 'day',
  headlight: params.get('headlight') === '1',
  ai: params.has('ai') ? Math.max(0, Math.min(5, parseInt(params.get('ai'), 10) || 0)) : 5,
  cam: params.get('cam') || 'cockpit',
};

const loaders = import.meta.glob('./{scene,vehicles,graphics,audio,ui,net,ai}/index.js');
async function tryImport(dir) {
  const key = `./${dir}/index.js`;
  if (!loaders[key]) return null;
  try { return await loaders[key](); } catch (e) { console.warn(`[main] module ${dir} failed to load:`, e && e.message); return null; }
}
function safe(fn, label, fallback = null) {
  try { return fn(); } catch (e) { console.warn(`[main] ${label} failed:`, e && e.message); return fallback; }
}
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

async function boot() {
  const canvas = document.getElementById('game');
  const uiRoot = document.getElementById('ui');
  const [gfx, sceneMod, vehMod, audioMod, uiMod, netMod, aiMod] = await Promise.all(['graphics', 'scene', 'vehicles', 'audio', 'ui', 'net', 'ai'].map(tryImport));

  // ---- renderer / scene ----
  let renderer = gfx && safe(() => gfx.createRenderer(canvas), 'createRenderer');
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 4000);
  scene.add(camera);
  const materials = gfx ? safe(() => gfx.createMaterials(renderer), 'createMaterials') : null;
  let lighting = gfx ? safe(() => gfx.setupLighting(scene, renderer, { time: P.time }), 'setupLighting') : null;
  if (lighting && lighting.setTime) safe(() => lighting.setTime(P.time), 'setTime');
  if (!lighting) {
    const sky = { day: 0x9ec9ee, dusk: 0xd9845a, night: 0x05080f }[P.time] ?? 0x9ec9ee;
    const k = { day: 1, dusk: 0.45, night: 0.06 }[P.time] ?? 1;
    scene.background = new THREE.Color(sky);
    scene.fog = new THREE.Fog(sky, 60, 700);
    scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x4a3a2a, 1.1 * k + 0.05));
    const sun = new THREE.DirectionalLight(P.time === 'dusk' ? 0xffa060 : 0xfff2dd, 2.4 * k);
    sun.position.set(-40, P.time === 'dusk' ? 25 : 80, 30); scene.add(sun);
    lighting = { sun, update() {} };
  }
  let post = gfx ? safe(() => gfx.createPostFX(renderer, scene, camera), 'createPostFX') : null;

  // ---- world ----
  let world = null;
  if (sceneMod) world = await (async () => { try { return await sceneMod.createWorld(scene, { seed: 1, renderer, materials }); } catch (e) { console.warn('[main] createWorld failed:', e && e.message); return null; } })();
  if (!world) world = createFallbackWorld(scene);
  const TRACK_LENGTH = (sceneMod && sceneMod.TRACK_LENGTH) || world.track.length || 3218;

  const TRUCKS = (vehMod && vehMod.TRUCKS && vehMod.TRUCKS.length) ? vehMod.TRUCKS : FALLBACK_TRUCKS;
  const input = createInput(canvas);
  const audio = audioMod ? safe(() => audioMod.createAudio(), 'createAudio') : null;

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
    if (post && post.setSize) post.setSize(w, h);
  }
  addEventListener('resize', resize); resize();

  // ---- game state ----
  const game = {
    state: { mode: 'title', raceTime: 0, countdown: 0, finished: false, finishTime: 0, place: 0, speed: 0, s: 0, truck: P.truck % TRUCKS.length },
    world, vehicles: [], input, scene, camera, renderer,
    setDebugInput: (i) => input.setDebugInput(i),
    teleport: (s, speed = 0) => teleport(s, speed),
    advance: (sec) => advance(sec),
    startRace: (o) => startRace(o),
  };
  let resolveReady; game.screenshotReady = new Promise((r) => { resolveReady = r; });
  window.__game = game;
  let readyFrames = 0;

  let cockpit = null, headlightCtl = null, playerV = null, ui = null;
  const rngWorld = mulberry32(12345);

  // ---- vehicles ----
  function makeVehicle(specIdx, slot, isPlayer, aiIdx) {
    const spec = TRUCKS[specIdx % TRUCKS.length];
    let built = null;
    if (vehMod && vehMod.buildTruck) built = safe(() => vehMod.buildTruck(spec, { materials }), 'buildTruck');
    if (!built || !built.group || !built.parts) built = buildFallbackTruck({ ...FALLBACK_TRUCKS[0], ...spec });
    scene.add(built.group);
    const body = createVehicleBody(spec, world);
    const st = world.startTransform(slot);
    body.reset(st.position, st.quaternion);
    const flag = safe(() => createFlag({}), 'createFlag');
    if (flag) (built.parts.flagMount || built.group).add(flag.mesh);
    let ai = null;
    if (!isPlayer) {
      if (aiMod && aiMod.createAIDriver) ai = safe(() => aiMod.createAIDriver((aiMod.AI_PROFILES || [])[aiIdx % ((aiMod.AI_PROFILES || [1]).length)], { world, rng: mulberry32(1000 + aiIdx) }), 'createAIDriver');
      if (!ai) ai = simpleDriver(aiIdx);
    }
    const v = { spec, body, group: built.group, parts: built.parts, flag, ai, isPlayer, slot,
      prevPos: body.state.position.clone(), prevQuat: body.state.quaternion.clone(), spin: 0, wheelBase: built.parts.wheels ? built.parts.wheels.map((w) => w.rotation.clone()) : [],
      finished: false, finishTime: 0, headlight: null };
    if (gfx && gfx.attachHeadlight && built.parts.headlight) v.headlight = safe(() => gfx.attachHeadlight(built.parts.headlight), 'attachHeadlight');
    return v;
  }

  function simpleDriver(idx) {
    const lane = (idx % 2 ? 1 : -1) * (0.8 + 0.4 * (idx % 3));
    let tt = idx * 0.17;
    const out = { steer: 0, paddleL: 0, paddleR: 0, handbrake: 0, headlight: false, reverse: false };
    const f = new THREE.Vector3(), r = new THREE.Vector3(), d = new THREE.Vector3();
    return {
      think(dt, st) {
        const smp = world.track.sampleAt(Math.min(TRACK_LENGTH, st.s + 8 + st.speed * 0.8));
        d.copy(smp.position).addScaledVector(smp.right, lane).sub(st.position);
        f.set(0, 0, -1).applyQuaternion(st.quaternion); r.set(1, 0, 0).applyQuaternion(st.quaternion);
        const err = Math.atan2(d.dot(r), d.dot(f));
        out.steer = Math.max(-1, Math.min(1, err * 0.9 - st.angularVelocity.y * 0.25));
        tt -= dt; out.paddleL = out.paddleR = 0;
        if (tt <= 0 && st.speed < 9) { out.paddleL = 0.7; out.paddleR = 0.7; tt = 0.5 + 0.1 * idx; }
        return out;
      },
    };
  }

  function clearRace() {
    for (const v of game.vehicles) { scene.remove(v.group); }
    game.vehicles.length = 0; playerV = null;
    if (cockpit) cockpit.dispose();
    cockpit = null;
  }

  function startRace(o = {}) {
    clearRace();
    const truckIdx = o.truck ?? game.state.truck;
    const nAI = o.ai ?? P.ai;
    game.state.truck = truckIdx;
    playerV = makeVehicle(truckIdx, 0, true, 0);
    game.vehicles.push(playerV);
    for (let i = 0; i < nAI; i++) game.vehicles.push(makeVehicle(truckIdx + 1 + i, i + 1, false, i));
    cockpit = createCockpitCamera(camera, { group: playerV.group, parts: playerV.parts }, { mode: P.cam });
    Object.assign(game.state, { mode: 'race', raceTime: 0, finished: false, finishTime: 0, place: 0, countdown: o.countdown ?? 3 });
    input.setEnabled(true); input.calibrate();
    if (o.headlight ?? P.headlight) input.setHeadlight(true);
    if (o.s != null) { game.vehicles.forEach((v, i) => teleportVehicle(v, o.s - Math.floor(i / 2) * 5, (i % 2 ? 1 : -1) * (i === 0 ? 0 : 1.6), 10)); }
    if (audio && audio.oneShot) safe(() => audio.oneShot('start'), 'oneShot');
    if (ui && ui.hide) safe(() => ui.hide(), 'ui.hide');
    for (const v of game.vehicles) { v.prevPos.copy(v.body.state.position); v.prevQuat.copy(v.body.state.quaternion); }
    readyFrames = 0;
  }

  const _t = new THREE.Vector3();
  function teleportVehicle(v, s, lateral = 0, speed = 0) {
    s = Math.max(0, Math.min(TRACK_LENGTH - 5, s));
    const smp = world.track.sampleAt(s);
    const p = _t.copy(smp.position).addScaledVector(smp.right, lateral);
    placeOnGround(v.body, world, p.x, p.z, smp.tangent, smp.tangent.clone().multiplyScalar(speed));
    v.prevPos.copy(v.body.state.position); v.prevQuat.copy(v.body.state.quaternion);
  }
  function teleport(s, speed = 0) { if (playerV) { teleportVehicle(playerV, s, 0, speed); } }

  // ---- finish overlay (only after the race; no HUD during it) ----
  let finishEl = null;
  function showFinish() {
    finishEl = document.createElement('div');
    finishEl.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(10,6,2,0.55);color:#f3e6c8;font:600 28px Georgia,serif;text-align:center;z-index:50;gap:12px;';
    const t = game.state.finishTime, mm = Math.floor(t / 60), ss = (t % 60).toFixed(1).padStart(4, '0');
    finishEl.innerHTML = `<div>${['', '1st place!', '2nd place', '3rd place'][game.state.place] || game.state.place + 'th place'}</div><div style="font-size:22px">${mm}:${ss}</div><button style="font:inherit;font-size:20px;padding:10px 26px;border-radius:10px;border:2px solid #f3e6c8;background:#5a3a1a;color:#f3e6c8">Race again</button>`;
    finishEl.querySelector('button').onclick = () => { finishEl.remove(); finishEl = null; goTitle(); };
    uiRoot.appendChild(finishEl);
  }

  function goTitle() {
    game.state.mode = 'title'; clearRace();
    if (ui && ui.show) safe(() => ui.show('title'), 'ui.show');
    else showFallbackTitle();
  }
  let fbTitle = null;
  function showFallbackTitle() {
    if (fbTitle) fbTitle.remove();
    fbTitle = document.createElement('div');
    fbTitle.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#1a120a;color:#f3e6c8;font:700 40px Georgia,serif;gap:20px;z-index:40;';
    fbTitle.innerHTML = '<div>Soap Box Derby</div><button style="font:inherit;font-size:24px;padding:12px 34px;border-radius:12px;border:2px solid #f3e6c8;background:#5a3a1a;color:#f3e6c8">Race</button>';
    fbTitle.querySelector('button').onclick = () => { fbTitle.remove(); fbTitle = null; gestureStart(); startRace({}); };
    uiRoot.appendChild(fbTitle);
  }
  function gestureStart() {
    input.requestPermissions().catch(() => {});
    if (audio && audio.unlock) safe(() => audio.unlock(), 'audio.unlock');
  }
  game.gestureStart = gestureStart;

  if (uiMod && uiMod.createUI) {
    ui = safe(() => uiMod.createUI(uiRoot, {
      trucks: TRUCKS,
      onStartSolo: (a) => { gestureStart(); const t = typeof a === 'number' ? a : (a && (a.truck ?? a.truckIndex ?? a.index)); startRace(t != null ? { truck: t } : {}); },
      onHost: () => { gestureStart(); game.state.mode = 'lobby'; safe(() => netMod && netMod.createLobby({ role: 'host', ui }), 'host lobby'); },
      onJoin: () => { gestureStart(); game.state.mode = 'lobby'; safe(() => netMod && netMod.createLobby({ role: 'client', ui }), 'join lobby'); },
      onSelectTruck: (i) => { game.state.truck = typeof i === 'number' ? i : (i && i.index) || 0; },
    }), 'createUI');
  }
  input.onOrientationChange((landscape) => {
    if (!input.isTouch) return;
    if (ui && ui.setOrientationBlocked) safe(() => ui.setOrientationBlocked(!landscape), 'orient');
  });
  if (input.isTouch && !input.isLandscape() && ui && ui.setOrientationBlocked) safe(() => ui.setOrientationBlocked(true), 'orient');
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && game.state.mode === 'race') { goTitle(); } });

  // ---- simulation ----
  const idle = { steer: 0, paddleL: 0, paddleR: 0, handbrake: 0, headlight: false, reverse: false };
  const others = [];
  function fixedUpdate() {
    if (game.state.mode !== 'race' && game.state.mode !== 'finish') return;
    const vs = game.vehicles;
    for (const v of vs) { v.prevPos.copy(v.body.state.position); v.prevQuat.copy(v.body.state.quaternion); }
    const cd = game.state.countdown;
    if (cd > 0) game.state.countdown = Math.max(0, cd - STEP); else game.state.raceTime += game.state.mode === 'race' ? STEP : 0;
    for (const v of vs) {
      let inp;
      if (v.isPlayer) {
        inp = input.read();
        if (cd > 0) { inp.handbrake = 1; inp.paddleL = inp.paddleR = 0; }
        if (v.finished) { inp = { ...inp, handbrake: 0.7, paddleL: 0, paddleR: 0 }; }
      } else if (cd > 0) { inp = { ...idle, handbrake: 1 }; }
      else {
        others.length = 0; for (const o of vs) if (o !== v) others.push(o.body.state);
        inp = safe(() => v.ai.think(STEP, v.body.state, others), 'ai.think') || idle;
        if (v.finished) inp = { ...idle, handbrake: 0.7 };
      }
      v.body.step(STEP, inp);
    }
    for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) collideBodies(vs[i].body, vs[j].body);
    // finish
    for (const v of vs) {
      if (!v.finished && v.body.state.s >= TRACK_LENGTH - 3) {
        v.finished = true; v.finishTime = game.state.raceTime;
        if (v.isPlayer) {
          game.state.finished = true; game.state.finishTime = v.finishTime;
          game.state.place = vs.filter((o) => o.finished).length;
          game.state.mode = 'finish';
          showFinish();
        }
      }
    }
    if (playerV) { game.state.s = playerV.body.state.s; game.state.speed = playerV.body.state.speed; }
  }

  let splatAcc = 0;
  function render(alpha, dt) {
    for (const v of game.vehicles) {
      const s = v.body.state;
      v.group.position.lerpVectors(v.prevPos, s.position, alpha);
      v.group.quaternion.slerpQuaternions(v.prevQuat, s.quaternion, alpha);
      v.group.updateMatrixWorld(true);
      // wheels: steer + spin
      const ws = v.parts.wheels;
      if (ws && ws.length === 4) {
        v.spin += (s.forwardSpeed / (v.spec.wheelRadius || 0.28)) * dt;
        for (let i = 0; i < 4; i++) {
          const w = ws[i];
          w.rotation.order = 'YXZ';
          w.rotation.y = i < 2 ? -s.steerAngle : 0;
          w.rotation.x = -v.spin;
        }
      }
      if (v.flag) v.flag.update(dt, s.speed, null);
      if (v.headlight && v.headlight.setOn) { const on = v.isPlayer ? headlightState() : P.time === 'night'; v.headlight.setOn(!!on); }
    }
    if (playerV && cockpit) {
      const s = playerV.body.state;
      cockpit.update(dt, s, null);
      if (post && post.addSplatter && s.speed > 3) {
        const sf = s.surface;
        if (sf === 'mud' || sf === 'water') { splatAcc += dt * s.speed; if (splatAcc > 6) { splatAcc = 0; safe(() => post.addSplatter(sf, Math.min(1, s.speed / 12)), 'splatter'); } }
      }
      if (audio && audio.update) {
        safe(() => audio.update(dt, { speed: s.speed, surface: s.surface, wheelContacts: s.wheelContacts, paddleL: s.paddleL, paddleR: s.paddleR, handbrake: s.handbrake, bumps: s.bump, listener: camera }), 'audio.update');
      }
    }
    safe(() => world.update(dt, camera), 'world.update');
    if (lighting && lighting.update) safe(() => lighting.update(dt, camera), 'lighting.update');
    const sp = playerV ? playerV.body.state.speed : 0;
    if (post && post.render) safe(() => post.render(dt, { speed: sp, splatter: 0 }), 'post.render');
    else renderer.render(scene, camera);
  }

  // title-mode camera: slow flyover of the start
  function titleCamera(t) {
    const smp = world.track.sampleAt(30);
    camera.position.copy(smp.position).add(new THREE.Vector3(Math.sin(t * 0.1) * 6, 3.5, 8));
    camera.lookAt(smp.position.x, smp.position.y + 1, smp.position.z - 12);
  }

  let acc = 0, last = performance.now(), simT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 6) { fixedUpdate(); acc -= STEP; n++; }
    if (n === 6) acc = 0;
    simT += dt;
    if (game.state.mode === 'title' || game.state.mode === 'lobby' || game.state.mode === 'garage') titleCamera(simT);
    render(acc / STEP, dt);
    if (++readyFrames === 3) resolveReady();
  }
  let lastInp = null;
  function headlightState() { return lastInp ? lastInp.headlight : P.headlight; }
  // capture headlight from the last read inside the fixed step
  const origRead = input.read.bind(input);
  input.read = () => { lastInp = origRead(); return lastInp; };

  function advance(sec) {
    const n = Math.round(sec / STEP);
    for (let i = 0; i < n; i++) fixedUpdate();
    render(1, STEP);
  }

  // ---- go ----
  if (P.autostart) {
    startRace({ truck: P.truck % TRUCKS.length, ai: P.ai, s: P.s, countdown: 0, headlight: P.headlight });
  } else if (ui && ui.show) {
    game.state.mode = 'title'; safe(() => ui.show('title'), 'ui.show');
  } else {
    game.state.mode = 'title'; showFallbackTitle();
  }
  requestAnimationFrame((t) => { last = t; frame(t); });
}

boot().catch((e) => { console.warn('[main] boot failed', e); throw e; });
