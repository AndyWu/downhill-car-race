// Soap Box Derby — boot, game loop, mode machine, solo + host/client multiplayer.
// Real modules are used end to end; fallbacks only kick in when a module genuinely fails.
import * as THREE from 'three';
import { createVehicleBody, collideBodies, placeOnGround, draftFactor } from './core/physics.js';
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
  timeUrl: params.has('time'),
  headlight: params.get('headlight') === '1',
  ai: params.has('ai') ? Math.max(0, Math.min(9, parseInt(params.get('ai'), 10) || 0)) : 9,
  weather: params.get('weather') || null,
  cam: params.get('cam') || 'cockpit',
  q: params.get('q') || 'default',
  scene: params.get('scene') || null,
  v: params.has('v') ? parseFloat(params.get('v')) : null,
  menu: params.get('menu') || null,
  norender: params.get('norender') === '1', // test hook: simulate without drawing (netcode tests)
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
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

function createLoading(root) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#1a120a;color:#f3e6c8;font:600 22px Georgia,serif;transition:opacity .5s';
  el.innerHTML = '<div style="font-size:34px;letter-spacing:.08em">SOAP BOX DERBY</div><div class="lbl" style="font-size:17px;opacity:.8">warming up</div><div style="width:min(60vw,360px);height:10px;border:2px solid #f3e6c8;border-radius:8px;overflow:hidden"><div class="bar" style="height:100%;width:0;background:#c63a24;transition:width .2s"></div></div>';
  document.body.appendChild(el);
  return {
    set(p, label) { el.querySelector('.bar').style.width = `${Math.round(Math.min(1, p) * 100)}%`; if (label) el.querySelector('.lbl').textContent = label; },
    done() { el.style.opacity = '0'; el.style.pointerEvents = 'none'; setTimeout(() => el.remove(), 600); },
  };
}

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

async function boot() {
  const canvas = document.getElementById('game');
  const uiRoot = document.getElementById('ui');
  const loading = createLoading(uiRoot);
  loading.set(0.01, 'loading modules');
  const [gfx, sceneMod, vehMod, audioMod, uiMod, netMod, aiMod] = await Promise.all(['graphics', 'scene', 'vehicles', 'audio', 'ui', 'net', 'ai'].map(tryImport));
  if (netMod) { safe(() => netMod.injectPWAHead(), 'injectPWAHead'); safe(() => netMod.registerServiceWorker(), 'registerServiceWorker'); }

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
  loading.set(0.04, 'mixing paints');
  await nextFrame();
  const materials = gfx ? safe(() => gfx.createMaterials(renderer, { quality: P.q }), 'createMaterials') : null;
  loading.set(0.14, 'painting the sky');
  await nextFrame();
  let lighting = gfx ? safe(() => gfx.setupLighting(scene, renderer), 'setupLighting') : null;
  if (lighting && lighting.setTime) safe(() => lighting.setTime(P.time, true), 'setTime');
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
  let isDark = P.time === 'night' || P.time === 'dusk';

  // ---- world ----
  loading.set(0.18, 'building the hill');
  let world = null;
  if (sceneMod) {
    world = await (async () => {
      try { return await sceneMod.createWorld(scene, { seed: 1, renderer, materials, onProgress: (p, l) => loading.set(0.18 + p * 0.78, l || 'building the hill') }); }
      catch (e) { console.warn('[main] createWorld failed:', e && e.message); return null; }
    })();
  }
  if (!world) world = createFallbackWorld(scene);
  const TRACK_LENGTH = (sceneMod && sceneMod.TRACK_LENGTH) || world.track.length || 3218;
  // alpha-tested foliage needs the cut-out depth material for shadows
  const foliageDepth = materials && materials.foliage && materials.foliage.userData && materials.foliage.userData.depthMaterial;
  if (foliageDepth && world.group) world.group.traverse((o) => { if (o.isMesh && o.material && o.material.alphaTest > 0 && !o.customDepthMaterial) o.customDepthMaterial = foliageDepth; });

  if (gfx && gfx.freezeStatic && world.group) safe(() => gfx.freezeStatic(world.group), 'freezeStatic');
  const TRUCKS = (vehMod && vehMod.TRUCKS && vehMod.TRUCKS.length) ? vehMod.TRUCKS : FALLBACK_TRUCKS;
  const input = createInput(canvas);
  const audio = audioMod ? safe(() => audioMod.createAudio(), 'createAudio') : null;
  const AI_PROFILES = (aiMod && (aiMod.AI_ROSTER || aiMod.AI_PROFILES)) || [];
  const ROSTER = AI_PROFILES.length ? AI_PROFILES : Array.from({ length: 9 }, (_, i) => ({ name: `Driver ${i + 1}` }));
  const rosterName = (i) => (ROSTER[i % ROSTER.length] && ROSTER[i % ROSTER.length].name) || `Car ${i + 2}`;

  function resize() {
    const w = innerWidth, h = innerHeight;
    if (post && post.setSize) post.setSize(w, h); else renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  // water hazards for planar reflection
  const waterSpots = [];
  for (const h of world.hazards || []) {
    if (h.type !== 'water') continue;
    const smp = world.track.sampleAt(h.s);
    const x = smp.position.x + smp.right.x * h.lateral, z = smp.position.z + smp.right.z * h.lateral;
    waterSpots.push({ s: h.s, y: world.heightAt(x, z) });
  }

  // ---- game state ----
  const game = {
    state: { mode: 'title', raceTime: 0, countdown: 0, finished: false, finishTime: 0, place: 0, speed: 0, s: 0, truck: P.truck % TRUCKS.length, role: 'solo', paused: false, trial: true, quality: P.q },
    world, vehicles: [], input, scene, camera, renderer, ui: null, lobby: null, sync: null,
    setDebugInput: (i) => input.setDebugInput(i),
    teleport: (s, speed = 0) => teleport(s, speed),
    advance: (sec) => advance(sec),
    startRace: (o) => startRace(o),
  };
  if (netMod && netMod.onOfflineReady) safe(() => netMod.onOfflineReady(() => { game.state.offlineReady = true; if (game.ui) { if (game.ui.setOfflineReady) game.ui.setOfflineReady(true); else if (game.ui.toast && game.state.mode === 'title') game.ui.toast('Ready to play offline', 2600); } }), 'onOfflineReady');
  let resolveReady; game.screenshotReady = new Promise((r) => { resolveReady = r; });
  window.__game = game;
  let readyFrames = 0;

  let cockpit = null, playerV = null, ui = null, chaseT = null, lastRespawns = 0, mudTimer = 0;
  let cfg = { role: 'solo', truck: 0, ai: 5 };   // last race config (for rematch)
  const mp = { predictor: null, sync: null, interp: null, localSlot: 0, players: [], trucks: [], inputs: new Map(), tick: 0, goAtLocal: 0, picks: new Map(), info: null, results: [] };

  // ---- weather / time of day ----
  const WX_OK = ['clear', 'fog', 'snow', 'rain', 'storm'], TIME_OK = ['day', 'dusk', 'night', 'golden'];
  const normWx = (w) => { w = String(w || '').toLowerCase().replace(/[^a-z]/g, ''); return { foggy: 'fog', heavyrain: 'rain', stormy: 'storm', snowy: 'snow' }[w] || (WX_OK.includes(w) ? w : 'clear'); };
  function resolveConditions() {
    const sel = ui && ui.getWeather ? safe(() => ui.getWeather(), 'getWeather', null) : null;
    const weather = normWx(P.weather || (sel && sel.weather) || 'clear');
    const t = (P.timeUrl ? P.time : (sel && sel.time)) || 'day';
    return { weather, time: TIME_OK.includes(t) ? t : 'day' };
  }
  let curCond = null;
  function applyConditions(c, instant = true) {
    if (!c) return;
    const wx = normWx(c.weather), tm = TIME_OK.includes(c.time) ? c.time : 'day';
    curCond = { weather: wx, time: tm };
    isDark = tm === 'night' || tm === 'dusk';
    if (world && world.setWeather) safe(() => world.setWeather(wx), 'world.setWeather');
    if (lighting && lighting.setTime) safe(() => lighting.setTime(tm, instant), 'setTime');
    if (lighting && lighting.setWeather) safe(() => lighting.setWeather(wx, instant), 'lighting.setWeather');
    if (audio && audio.setWeather) safe(() => audio.setWeather(wx), 'audio.setWeather');
    if (materials && materials.setWind && world && world.weather && world.weather.wind != null) safe(() => materials.setWind(world.weather.wind), 'setWind');
  }
  if (lighting && lighting.onLightning) safe(() => lighting.onLightning((e) => { if (audio && audio.thunder) safe(() => audio.thunder(e.delay, e.intensity), 'thunder'); }), 'onLightning');

  // ---- vehicles ----
  // each AI profile has a signature truck (profile.truckId); fall back to the caller's index when absent
  function aiTruckIndex(i, fallback) {
    const pr = AI_PROFILES.length ? AI_PROFILES[i % AI_PROFILES.length] : null;
    const k = pr && pr.truckId ? TRUCKS.findIndex((t) => t.id === pr.truckId) : -1;
    return k >= 0 ? k : fallback;
  }
  function makeVehicle(specIdx, slot, kind, aiIdx = 0, name = '') {
    const spec = TRUCKS[specIdx % TRUCKS.length];
    let built = null;
    if (vehMod && vehMod.buildTruck) built = safe(() => vehMod.buildTruck(spec, { materials }), 'buildTruck');
    if (!built || !built.group || !built.parts) built = buildFallbackTruck({ ...FALLBACK_TRUCKS[0], ...spec });
    scene.add(built.group);
    const local = kind === 'local';
    if (local && built.parts.driver) built.parts.driver.visible = false;
    const body = createVehicleBody(spec, world);
    const st = world.startTransform(slot);
    body.reset(st.position, st.quaternion);
    const flag = safe(() => createFlag({ index: specIdx % TRUCKS.length, number: spec.flagNumber, color: spec.flagColor != null ? (typeof spec.flagColor === 'number' ? '#' + spec.flagColor.toString(16).padStart(6, '0') : spec.flagColor) : undefined }), 'createFlag');
    if (flag) (built.parts.flagMount || built.group).add(flag.mesh);
    let ai = null;
    if (kind === 'ai') {
      if (aiMod && aiMod.createAIDriver && AI_PROFILES.length) ai = safe(() => aiMod.createAIDriver(AI_PROFILES[aiIdx % AI_PROFILES.length], { world, rng: aiMod.createRng(1000 + aiIdx), spec, human: () => (playerV ? playerV.body.state : null) }), 'createAIDriver');
      if (!ai) ai = simpleDriver(aiIdx);
    }
    let headlight = null;
    if (gfx && gfx.attachHeadlight && built.parts.headlight && (local || kind === 'proxy' || isDark)) {
      headlight = safe(() => gfx.attachHeadlight(built.parts.headlight, local ? {} : { castShadow: false, intensity: 1500 }), 'attachHeadlight');
    }
    return { spec, body, group: built.group, parts: built.parts, flag, ai, kind, slot, name, headlight, lightOn: false,
      setLOD: built.setLOD || (built.group.userData && built.group.userData.setLOD) || null, lod: 'near', setMudCoat: built.setMudCoat || (built.group.userData && built.group.userData.setMudCoat) || null, isPlayer: local, prevPos: body.state.position.clone(), prevQuat: body.state.quaternion.clone(), spin: 0,
      finished: false, finishTime: 0, lastInp: null, wheelLoad: 0 };
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
    for (const v of game.vehicles) {
      scene.remove(v.group);
      if (v.headlight && v.headlight.dispose) safe(() => v.headlight.dispose(), 'headlight.dispose');
    }
    game.vehicles.length = 0; playerV = null;
    if (cockpit) cockpit.dispose();
    cockpit = null;
  }

  const _t = new THREE.Vector3();
  function teleportVehicle(v, s, lateral = 0, speed = 0) {
    s = Math.max(0, Math.min(TRACK_LENGTH - 5, s));
    const smp = world.track.sampleAt(s);
    const p = _t.copy(smp.position).addScaledVector(smp.right, lateral);
    placeOnGround(v.body, world, p.x, p.z, smp.tangent, smp.tangent.clone().multiplyScalar(speed));
    v.prevPos.copy(v.body.state.position); v.prevQuat.copy(v.body.state.quaternion);
  }
  function teleport(s, speed = 0) {
    if (!playerV) return;
    teleportVehicle(playerV, s, 0, speed);
    input.setReverse(false);                         // a stale reverse latch would make paddling drive the car backwards
    safe(() => post && post.clearSplatter && post.clearSplatter(), 'clearSplatter');
    const st = playerV.body.state; st.mudHit = st.wetHit = 0;
  }

  // ---- start a race ----
  // o: { truck, ai, s, countdown, headlight, role:'solo'|'host'|'client', players, trucks, localSlot, goAtLocal }
  function startRace(o = {}) {
    clearRace();
    applyConditions(o.conditions || resolveConditions(), true);
    const role = o.role || 'solo';
    const truckIdx = (o.truck ?? game.state.truck) % TRUCKS.length;
    cfg = { role, truck: truckIdx, ai: o.ai ?? P.ai };
    game.state.truck = truckIdx; game.state.role = role;
    const vs = game.vehicles;
    if (role === 'solo') {
      playerV = makeVehicle(truckIdx, 0, 'local', 0, 'You'); vs.push(playerV);
      // AI_ROSTER is ordered worst -> best; with fewer than 9 AI an evenly spaced subset is used. The best AI start in the front rows.
      const nAI = Math.min(cfg.ai, 9);
      for (let i = 0; i < nAI; i++) {
        const ri = nAI <= 1 ? 4 : Math.round(i * (ROSTER.length - 1) / (nAI - 1));
        vs.push(makeVehicle(aiTruckIndex(ri, truckIdx + 1 + i), nAI - i, 'ai', ri, rosterName(ri)));
      }
    } else {
      // multiplayer: 10 cars; humans from players[] first, then AI backfill in roster order (slot k >= humans gets AI_ROSTER[k - humans])
      const humans = new Map(o.players.map((p) => [p.slot, p]));
      const nHum = o.players.length;
      for (let slot = 0; slot < 10; slot++) {
        const h = humans.get(slot);
        const tIdx = (o.trucks && o.trucks[slot] != null ? o.trucks[slot] : slot) % TRUCKS.length;
        let kind;
        if (slot === o.localSlot) kind = 'local';
        else if (role === 'client') kind = 'proxy';
        else kind = h ? 'remote' : 'ai';
        if (!h && kind === 'proxy') kind = 'proxy';
        const ri = Math.max(0, Math.min(ROSTER.length - 1, slot - nHum));
        const v = makeVehicle(h ? tIdx : aiTruckIndex(ri, tIdx), slot, kind, ri, h ? h.name : rosterName(ri));
        if (kind === 'proxy' && h) v.human = true;
        vs.push(v);
        if (kind === 'local') playerV = v;
      }
    }
    chaseT = null; lastRespawns = 0;
    cockpit = createCockpitCamera(camera, { group: playerV.group, parts: playerV.parts }, { mode: P.cam });
    const cd = o.countdown ?? 3;
    Object.assign(game.state, { mode: 'race', raceTime: 0, finished: false, finishTime: 0, place: 0, countdown: cd, paused: false });
    mp.goAtLocal = o.goAtLocal || 0; mp.results = []; playerFinishT = null; lastFinishedCount = 0; finishRefresh = 0;
    if (role === 'client') for (const v of vs) v.body.noRecover = true; // only the host decides rescues
    mp.predictor = role === 'client' && netMod && netMod.createPredictor ? safe(() => netMod.createPredictor({ body: playerV.body, slot: o.localSlot }), 'createPredictor') : null;
    safe(() => post && post.clearSplatter && post.clearSplatter(), 'clearSplatter');
    input.setReverse(false);
    input.setEnabled(true); input.calibrate();
    if (o.headlight ?? P.headlight) input.setHeadlight(true);
    const sOverride = o.s ?? null;
    if (sOverride != null && role !== 'client') vs.forEach((v, i) => teleportVehicle(v, sOverride - Math.floor(i / 2) * 5, (i % 2 ? 1 : -1) * (i === 0 ? 0 : 1.6), o.v ?? 10));
    if (ui && ui.show) safe(() => ui.show('race'), 'ui.show(race)');
    audioOnce('go0');
    for (const v of vs) { v.prevPos.copy(v.body.state.position); v.prevQuat.copy(v.body.state.quaternion); }
    readyFrames = 0;
    lastCountdownTick = 4;
  }
  let lastCountdownTick = 4;
  function audioOnce(name) { if (name === 'go0') return; if (audio && audio.oneShot) safe(() => audio.oneShot(name), 'oneShot'); }

  // ---- UI wiring ----
  function gestureStart() {
    safe(() => input.requestPermissions().catch(() => {}), 'permissions');
    if (audio && audio.unlock) safe(() => audio.unlock(), 'audio.unlock');
  }
  window.addEventListener('pointerdown', () => { if (audio && audio.unlock && !audio.ready) safe(() => audio.unlock(), 'audio.unlock'); }, { capture: true, passive: true });
  window.addEventListener('keydown', () => { if (audio && audio.unlock && !audio.ready) safe(() => audio.unlock(), 'audio.unlock'); }, { passive: true });

  function goTitle() {
    if (mp.sync) { safe(() => mp.sync.close(), 'sync.close'); mp.sync = null; }
    if (game.lobby) { safe(() => game.lobby.close({ keepPeers: false }), 'lobby.close'); game.lobby = null; }
    mp.info = null; mp.interp = null;
    game.state.mode = 'title'; game.state.role = 'solo'; game.state.paused = false;
    clearRace(); input.setEnabled(false);
    if (ui && ui.show) safe(() => ui.show('title'), 'ui.show');
    else showFallbackTitle();
    if (pendingSW) { const r = pendingSW; pendingSW = null; safe(() => netMod.applyUpdate(r), 'applyUpdate'); }
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
  let pendingSW = null;
  addEventListener('sbd:sw-update', (e) => {
    const reg = e.detail && e.detail.registration;
    if (game.state.mode === 'title') safe(() => netMod.applyUpdate(reg), 'applyUpdate'); else pendingSW = reg;
  });

  // garage preview (own small renderer, only drawn while the garage screen is up)
  const preview = { r: null, scene: null, cam: null, truck: null, idx: -1, t: 0 };
  function ensurePreview() {
    if (preview.r || !ui || !ui.getPreviewSlot) return;
    const slot = ui.getPreviewSlot(); if (!slot) return;
    const r = safe(() => new THREE.WebGLRenderer({ antialias: true, alpha: true }), 'preview renderer');
    if (!r) return;
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    r.domElement.style.cssText = 'width:100%;height:100%;display:block';
    slot.appendChild(r.domElement);
    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xdfe9ff, 0x6a4a2a, 1.6));
    const d = new THREE.DirectionalLight(0xfff0d8, 3); d.position.set(3, 5, 4); s.add(d);
    const f = new THREE.DirectionalLight(0x9ab8ff, 1); f.position.set(-4, 2, -3); s.add(f);
    preview.r = r; preview.scene = s; preview.cam = new THREE.PerspectiveCamera(35, 1.6, 0.1, 50);
  }
  function previewShow(i) {
    ensurePreview(); if (!preview.r) return;
    if (preview.truck) { preview.scene.remove(preview.truck); preview.truck = null; }
    preview.idx = i;
    const spec = TRUCKS[((i % TRUCKS.length) + TRUCKS.length) % TRUCKS.length];
    let built = vehMod && vehMod.buildTruck ? safe(() => vehMod.buildTruck(spec, { materials }), 'preview buildTruck') : null;
    if (!built) built = buildFallbackTruck({ ...FALLBACK_TRUCKS[0], ...spec });
    preview.truck = built.group; preview.scene.add(built.group);
  }
  function previewTick(dt) {
    if (!preview.r || !preview.truck) return;
    const slot = preview.r.domElement.parentElement; const w = slot.clientWidth, h = slot.clientHeight;
    if (!w || !h) return;
    if (preview.r.domElement.width !== Math.round(w * preview.r.getPixelRatio())) { preview.r.setSize(w, h, false); preview.cam.aspect = w / h; preview.cam.updateProjectionMatrix(); }
    preview.t += dt;
    preview.truck.rotation.y = preview.t * 0.6 + 0.6;
    preview.cam.position.set(0, 1.5, 4.8); preview.cam.lookAt(0, 0.35, 0);
    preview.r.render(preview.scene, preview.cam);
  }

  // multiplayer lobby plumbing
  function openLobby(role) {
    if (!netMod) { ui && ui.toast && ui.toast('Multiplayer unavailable'); return; }
    if (game.lobby) safe(() => game.lobby.close({ keepPeers: false }), 'lobby.close');
    ui.show('lobby');
    const lobby = netMod.createLobby({ role, ui, name: role === 'host' ? 'Host' : 'Racer' });
    game.lobby = lobby; game.state.mode = 'lobby';
    lobby.onReady((info) => { mp.info = info; if (role === 'host') hostReady(info); else clientReady(info); });
    lobby.start();
  }
  function hostReady(info) {
    mp.sync = createHostSync(info);
    mp.players = info.players;
    mp.localSlot = 0;
    hostLaunch();
  }
  function createHostSync(info) {
    const sync = netMod.createSync({ role: 'host', peers: info.peers, world });
    game.sync = sync;
    sync.onInput((slot, f) => {
      const d = netMod.decodeInputFrame ? netMod.decodeInputFrame(f) : null; if (!d) return;
      const cur = mp.inputs.get(slot) || { steer: 0, paddleL: 0, paddleR: 0, handbrake: 0, headlight: false, reverse: false };
      cur.steer = d.steer; cur.handbrake = d.handbrake; cur.headlight = d.headlight; cur.reverse = d.reverse;
      cur.paddleL = Math.max(cur.paddleL, d.paddleL); cur.paddleR = Math.max(cur.paddleR, d.paddleR); // pulses held until consumed
      mp.inputs.set(slot, cur);
    });
    sync.onControl((slot, m) => { if (m && m.t === 'pick') mp.picks.set(slot, m.truck); });
    return sync;
  }
  function hostLaunch() {
    const trucks = [];
    for (const p of mp.players) trucks[p.slot] = p.slot === 0 ? game.state.truck : (mp.picks.get(p.slot) ?? p.slot);
    const nHum = mp.players.length;
    for (let i = 0; i < 10; i++) if (trucks[i] == null) trucks[i] = aiTruckIndex(Math.max(0, i - nHum), i + 1);
    const cond = resolveConditions();
    safe(() => mp.sync.setRaceConditions && mp.sync.setRaceConditions(cond), 'setRaceConditions');
    const goAt = mp.sync.startCountdown(3, { players: mp.players, trucks, seed: 1, weather: cond.weather, time: cond.time });
    startRace({ role: 'host', players: mp.players, trucks, localSlot: 0, countdown: 0, goAtLocal: goAt, conditions: cond });
    game.state.countdown = Math.max(0, (goAt - performance.now()) / 1000);
  }
  function clientReady(info) {
    const sync = netMod.createSync({ role: 'client', peers: info.peers, world });
    mp.sync = sync; game.sync = sync; mp.localSlot = info.localSlot;
    mp.interp = netMod.createInterpolator();
    sync.onSnapshot((data) => { mp.interp.push(data); if (mp.predictor) mp.predictor.onSnapshot(data); });
    sync.sendControl({ t: 'pick', truck: game.state.truck });
    sync.onControl((id, m) => {
      if (!m) return;
      if (m.t === 'countdown') {
        const goAt = sync.clock.synced ? sync.clock.toLocal(m.goAtHostMs) : performance.now() + m.seconds * 1000;
        mp.players = m.players || [];
        mp.interp.clear();
        mp.predictor = null;
        startRace({ role: 'client', players: mp.players, trucks: m.trucks, localSlot: mp.localSlot, countdown: 0, goAtLocal: goAt, conditions: m.weather || m.time ? { weather: m.weather || 'clear', time: m.time || 'day' } : null });
        game.state.countdown = Math.max(0, (goAt - performance.now()) / 1000);
      } else if (m.t === 'result') {
        mp.results[m.place - 1] = m;
        if (m.slot === mp.localSlot) finishPlayer(m.time, m.place);
      }
    });
    ui.setLobbyStatus && ui.setLobbyStatus('Connected — waiting for the host to start');
  }

  // Standings: finished cars show their real time; cars still racing show an *estimated* finish (est: true) that is refreshed
  // while the finish card is up; DNF (time null) only after DNF_AFTER s of racing past the player's finish.
  const DNF_AFTER = 120;
  let playerFinishT = null, finishRefresh = 0, lastFinishedCount = 0;
  function standings() {
    const now = game.state.raceTime;
    const rows = game.vehicles.map((v) => {
      const st = v.body.state;
      let time = null, status = 'running', eta;
      if (v.finished) { time = v.finishTime; status = 'finished'; }
      else if (playerFinishT != null && now >= playerFinishT + DNF_AFTER) status = 'dnf';
      else {
        const remaining = Math.max(0, TRACK_LENGTH - 3 - st.s);
        const avg = now > 1 ? st.s / now : 0;
        eta = remaining / Math.max(2.5, 0.5 * avg + 0.5 * st.speed);
      }
      return { name: v.isPlayer ? (v.name || 'You') : v.name || `Car ${v.slot + 1}`, time, status, eta, you: v.isPlayer, s: st.s, speed: st.speed, trackLength: TRACK_LENGTH };
    });
    const key = (r) => (r.status === 'finished' ? r.time : r.status === 'running' ? now + r.eta : 1e9);
    rows.sort((a, b) => key(a) - key(b) || b.s - a.s);
    return rows;
  }
  function refreshFinish(force) {
    if (game.state.mode !== 'finish' || !ui || !ui.showFinish) return;
    const fc = game.vehicles.filter((v) => v.finished).length;
    if (!force && fc === lastFinishedCount && ++finishRefresh < 120) return;
    finishRefresh = 0; lastFinishedCount = fc;
    if (!force && ui.updateFinish) safe(() => ui.updateFinish(standings()), 'updateFinish');
    else safe(() => ui.showFinish({ place: game.state.place, total: game.vehicles.length, time: game.state.finishTime, standings: standings() }), 'showFinish');
  }
  function finishPlayer(time, place) {
    if (game.state.finished) return;
    game.state.finished = true; game.state.finishTime = time; game.state.place = place; game.state.mode = 'finish';
    playerFinishT = time;
    if (playerV) playerV.finished = true;
    audioOnce('finish');
    refreshFinish(true);
  }

  async function onFamilyPass() {
    if (!netMod) return;
    try {
      await netMod.licensing.init();
      const st = netMod.licensing.status();
      game.state.trial = !st.ok;
      const text = st.ok ? `Family Pass active — ${st.seats.length}/${st.maxSeats} iPads${st.isOwner ? ' (owner)' : ''}.` : 'No Family Pass on this iPad: trial mode (full game, nag-free for now). Ask the owner iPad to add you.';
      ui.setFamilyPass && ui.setFamilyPass(text);
    } catch (e) { ui.setFamilyPass && ui.setFamilyPass('Could not read the pass: ' + e.message); }
  }

  if (uiMod && uiMod.createUI) {
    ui = safe(() => uiMod.createUI(uiRoot, {
      trucks: TRUCKS,
      onStartSolo: () => { gestureStart(); startRace({ truck: game.state.truck, role: 'solo' }); },
      onHost: () => { gestureStart(); openLobby('host'); },
      onJoin: () => { gestureStart(); openLobby('client'); },
      onStartRace: () => { if (game.lobby && game.lobby.role === 'host') game.lobby.startRace(); },
      onLobbyBack: () => { if (game.lobby) { safe(() => game.lobby.close({ keepPeers: false }), 'lobby.close'); game.lobby = null; } game.state.mode = 'title'; },
      onSelectTruck: (t, i) => { game.state.truck = typeof i === 'number' ? i : Math.max(0, TRUCKS.indexOf(t)); },
      onPreviewTruck: (t, i) => previewShow(i),
      onGyro: async () => { const r = await input.requestPermissions(); return r.motion !== false; },
      onFamilyPass: onFamilyPass,
      onFamilyPassAction: onFamilyPass,
      onHonk: () => { if (input && input.honk) input.honk(); },
      onPause: () => { if (game.state.role === 'solo') game.state.paused = true; },
      onResume: () => { game.state.paused = false; },
      onQuit: () => goTitle(),
      onRematch: () => {
        if (cfg.role === 'solo') startRace({ truck: game.state.truck, role: 'solo' });
        else if (cfg.role === 'host' && mp.sync) hostLaunch();
        else if (cfg.role === 'client') { ui.toast && ui.toast('Waiting for the host to restart…'); }
      },
      onWeather: (c) => { if (game.state.mode !== 'race') applyConditions({ weather: P.weather || c.weather, time: P.timeUrl ? P.time : c.time }, false); },
      onScreen: (name) => {
        if (name === 'garage') { ensurePreview(); previewShow(game.state.truck); ui.selectTruck && ui.selectTruck(game.state.truck); }
        if (name === 'title' && game.state.mode !== 'race') { game.state.mode = 'title'; input.setEnabled(false); }
      },
    }), 'createUI');
    game.ui = ui;
    if (ui && ui.setAINames) safe(() => ui.setAINames(ROSTER), 'setAINames');
    if (ui && ui.setWeather && (P.weather || P.timeUrl)) safe(() => ui.setWeather({ weather: normWx(P.weather || (ui.getWeather() || {}).weather), time: P.timeUrl ? P.time : (ui.getWeather() || {}).time }), 'ui.setWeather');
    if (ui && game.state.offlineReady && ui.setOfflineReady) ui.setOfflineReady(true);
    if (ui && !input.isTouch && ui.showGyroButton) safe(() => ui.showGyroButton(false), 'showGyroButton');
  }
  input.onOrientationChange((landscape) => {
    if (!input.isTouch) return;
    if (ui && ui.setOrientationBlocked) safe(() => ui.setOrientationBlocked(!landscape), 'orient');
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && game.state.mode === 'race' && ui && ui.show) { ui.show('pause'); if (game.state.role === 'solo') game.state.paused = true; } });
  input.setEnabled(false);

  // ---- simulation ----
  const idle = { steer: 0, paddleL: 0, paddleR: 0, handbrake: 0, headlight: false, reverse: false };
  const others = [];
  const bodies = [];
  let netSeq = 0;
  const frameImpulse = { l: 0, r: 0 };
  const remoteLast = new Map();
  function remoteInput(slot) {
    if (mp.sync && mp.sync.takeInput && netMod.decodeInputFrame) {
      // jitter-buffered: exactly one client frame per host tick; paddles cleared when the buffer repeats a frame
      const r = mp.sync.takeInput(slot);
      if (r && r.frame) { const d = netMod.decodeInputFrame(r.frame); remoteLast.set(slot, d); return d; }
      return remoteLast.get(slot) ? { ...remoteLast.get(slot), paddleL: 0, paddleR: 0, honk: false } : idle;
    }
    const cur = mp.inputs.get(slot);
    if (!cur) return idle;
    const out = { ...cur }; cur.paddleL = 0; cur.paddleR = 0; return out;
  }

  // horns: audio.honk(truckId, null) for the player's own car, (truckId, group) for everyone else (spatialised)
  const HONK_BIT = (netMod && netMod.SNAP_EVENTS && netMod.SNAP_EVENTS.HONK) || 0;
  function honkCar(v) {
    v.honkTick = true;
    if (audio && audio.honk) safe(() => audio.honk(v.spec.id, v.isPlayer ? null : v.group), 'audio.honk');
  }
  function fixedUpdate() {
    const mode = game.state.mode;
    if (mode !== 'race' && mode !== 'finish') return;
    if (game.state.paused) return;
    const vs = game.vehicles;
    const role = game.state.role;
    // countdown
    if (mp.goAtLocal) game.state.countdown = Math.max(0, (mp.goAtLocal - performance.now()) / 1000);
    else if (game.state.countdown > 0) game.state.countdown = Math.max(0, game.state.countdown - STEP);
    const cd = game.state.countdown;
    const ct = Math.ceil(cd);
    if (cd > 0 && ct < lastCountdownTick) { lastCountdownTick = ct; audioOnce('countdown'); }
    else if (cd === 0 && lastCountdownTick > 0) { lastCountdownTick = 0; audioOnce('go'); input.calibrate(); if (ui && ui.raceStarted) safe(() => ui.raceStarted(), 'ui.raceStarted'); }
    if (cd === 0 && mode === 'race') game.state.raceTime += STEP;
    else if (cd === 0 && mode === 'finish') game.state.raceTime += STEP;

    if (role === 'client') {
      const inp = input.read(STEP);
      if (cd > 0) { inp.paddleL = inp.paddleR = 0; }
      if (inp.honk) honkCar(playerV);
      frameImpulse.l = Math.max(frameImpulse.l, inp.paddleL); frameImpulse.r = Math.max(frameImpulse.r, inp.paddleR);
      playerV.lastInp = inp;
      inp.draft = 0;
      const seq = netSeq++;
      if (mp.sync) mp.sync.sendInput(netMod.encodeInputFrame(inp, seq));
      if (mp.predictor) mp.predictor.step(STEP, inp, seq);
      else if (playerV) { playerV.prevPos.copy(playerV.body.state.position); playerV.prevQuat.copy(playerV.body.state.quaternion); playerV.body.step(STEP, inp); }
      if (game.state.mode === 'finish') refreshFinish(false);
      return;
    }

    for (const v of vs) { v.prevPos.copy(v.body.state.position); v.prevQuat.copy(v.body.state.quaternion); }
    bodies.length = 0; for (const v of vs) bodies.push(v.body);
    for (const v of vs) {
      let inp;
      if (v.kind === 'local') {
        inp = input.read(STEP);
        if (cd > 0) { inp.handbrake = 1; inp.paddleL = inp.paddleR = 0; }
        if (v.finished) { inp = { ...inp, handbrake: 0.7, paddleL: 0, paddleR: 0 }; }
        if (inp.honk) honkCar(v);
        frameImpulse.l = Math.max(frameImpulse.l, inp.paddleL); frameImpulse.r = Math.max(frameImpulse.r, inp.paddleR);
      } else if (v.kind === 'remote') {
        inp = remoteInput(v.slot);
        if (cd > 0) inp = { ...idle, steer: inp.steer, handbrake: 1 };
        if (inp.honk) honkCar(v);
        if (v.finished) inp = { ...idle, handbrake: 0.7 };
      } else if (cd > 0) { inp = { ...idle, handbrake: 1 }; }
      else {
        others.length = 0; for (const o of vs) if (o !== v) others.push(o.body.state);
        inp = safe(() => v.ai.think(STEP, v.body.state, others), 'ai.think') || idle;
        if (inp.honk) honkCar(v);
        if (v.ai.needsRescue) { v.body.recover(8); if (v.ai.clearStuck) v.ai.clearStuck(); }
        if (v.finished) inp = { ...idle, handbrake: 0.7 };
      }
      inp.draft = draftFactor(v.body, bodies);
      v.lastInp = inp;
      v.body.step(STEP, inp);
    }
    for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) collideBodies(vs[i].body, vs[j].body);
    // finish
    for (const v of vs) {
      if (!v.finished && v.body.state.s >= TRACK_LENGTH - 3) {
        v.finished = true; v.finishTime = game.state.raceTime;
        const place = vs.filter((o) => o.finished).length;
        if (role === 'host' && mp.sync) mp.sync.sendControl({ t: 'result', slot: v.slot, place, time: v.finishTime });
        if (v.kind === 'local') finishPlayer(v.finishTime, place);
      }
    }
    if (playerV) { game.state.s = playerV.body.state.s; game.state.speed = playerV.body.state.speed; }
    if (game.state.mode === 'finish') refreshFinish(false);
    // host: broadcast snapshot
    if (role === 'host' && mp.sync) {
      const n = vs.length, H = netMod.SNAP_HEADER, S = netMod.SNAP_STRIDE;
      const snap = new Float32Array(H + n * S);
      snap[0] = ++mp.tick; snap[1] = n;
      vs.forEach((v, i) => {
        const b = H + i * S, st = v.body.state;
        snap[b] = v.slot; snap[b + 1] = st.position.x; snap[b + 2] = st.position.y; snap[b + 3] = st.position.z;
        snap[b + 4] = st.quaternion.x; snap[b + 5] = st.quaternion.y; snap[b + 6] = st.quaternion.z; snap[b + 7] = st.quaternion.w;
        snap[b + 8] = st.velocity.x; snap[b + 9] = st.velocity.y; snap[b + 10] = st.velocity.z; snap[b + 11] = st.s; snap[b + 12] = v.honkTick ? HONK_BIT : 0; v.honkTick = false;
      });
      mp.sync.broadcastSnapshot(snap);
    }
  }

  // client: pull interpolated remote states into the bodies
  const _qv = new THREE.Vector3();
  function applyProxies(dt) {
    if (!mp.interp) return;
    const m = mp.interp.sample(performance.now());
    for (const v of game.vehicles) {
      const st = v.body.state;
      const c = v.isPlayer && mp.predictor ? null : m.get(v.slot);
      const ce = m.get(v.slot);
      if (ce && HONK_BIT && (ce.events & HONK_BIT) && v.slot !== mp.localSlot) honkCar(v);
      if (c) {
        st.position.set(c.position[0], c.position[1], c.position[2]);
        st.quaternion.set(c.quaternion[0], c.quaternion[1], c.quaternion[2], c.quaternion[3]);
        st.velocity.set(c.velocity[0], c.velocity[1], c.velocity[2]);
        st.speed = st.velocity.length(); st.s = c.s;
        st.forwardSpeed = st.velocity.dot(_qv.set(0, 0, -1).applyQuaternion(st.quaternion));
        const sf = world.surfaceAt(st.position.x, st.position.z); st.surface = sf.type;
        for (const wc of st.wheelContacts) { wc.contact = true; wc.compression = 0.5; }
      }
      if (v.isPlayer) {
        if (!mp.predictor) { const inp = v.lastInp || idle; st.steerNorm += ((inp.steer || 0) - st.steerNorm) * Math.min(1, dt * 12); st.steerAngle = st.steerNorm * (v.spec.steerLock || 0.5); st.handbrake = inp.handbrake || 0; st.reverse = !!inp.reverse; }
        game.state.s = st.s; game.state.speed = st.speed;
        if (!game.state.finished && st.s >= TRACK_LENGTH - 3 && game.state.countdown === 0) finishPlayer(game.state.raceTime, game.vehicles.filter((o) => o.body.state.s > st.s).length + 1);
        if (mp.predictor) continue;
      }
      v.prevPos.copy(st.position); v.prevQuat.copy(st.quaternion);
    }
  }

  const _pv = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _fr = new THREE.Frustum(), _sph = new THREE.Sphere();
  const contactsArr = [false, false, false, false];
  let reflOn = false, reflY = null, reflTimer = 0;
  function updateReflection(dt) {
    if (!post || !post.setPlanarReflection || !materials || !playerV) return;
    reflTimer -= dt; if (reflTimer > 0) return; reflTimer = 0.25;
    const s = playerV.body.state.s;
    let best = null;
    for (const w of waterSpots) { const d = w.s - s; if (d > -6 && d < 40 && (!best || d < best.s - s)) best = w; }
    if (best) {
      if (!reflOn || Math.abs(best.y - reflY) > 0.01) safe(() => post.setPlanarReflection({ enabled: true, y: best.y + 0.01, materials: materials.waterMaterials || [] }), 'planarReflection');
      reflOn = true; reflY = best.y;
    } else if (reflOn) { safe(() => post.setPlanarReflection({ enabled: false }), 'planarReflection'); reflOn = false; }
  }

  // live place: finished cars by finish time first, then by distance along the road
  let rankTimer = 0;
  function livePlace() {
    if (!playerV) return 0;
    const me = playerV; let place = 1;
    for (const v of game.vehicles) {
      if (v === me) continue;
      if (me.finished) { if (v.finished && v.finishTime < me.finishTime) place++; }
      else if (v.finished || v.body.state.s > me.body.state.s) place++;
    }
    return place;
  }
  function updateRank(dt) {
    rankTimer += dt; if (rankTimer < 0.25) return; rankTimer = 0;
    const m = game.state.mode;
    if (ui && ui.setRank && (m === 'race' || m === 'finish')) safe(() => ui.setRank(livePlace(), game.vehicles.length), 'ui.setRank');
  }

  function render(alpha, dt) {
    updateRank(dt);
    const ap = game.state.paused ? 1 : alpha;
    for (const v of game.vehicles) {
      const s = v.body.state;
      if (v.isPlayer && game.state.role === 'client' && mp.predictor) mp.predictor.applyTo(v.group, ap);
      else {
        v.group.position.lerpVectors(v.prevPos, s.position, ap);
        v.group.quaternion.slerpQuaternions(v.prevQuat, s.quaternion, ap);
      }
      v.group.updateMatrixWorld(true);
      const ws = v.parts.wheels;
      if (ws && ws.length === 4) {
        const rF = v.spec.wheelRadiusFront || v.spec.wheelRadius || 0.28, rR = v.spec.wheelRadius || 0.28;
        v.spin += (s.forwardSpeed / rR) * dt;
        for (let i = 0; i < 4; i++) {
          const w = ws[i];
          w.rotation.order = 'YXZ';
          w.rotation.y = i < 2 ? -s.steerAngle : 0;
          w.rotation.x = -v.spin * (i < 2 ? rR / rF : 1);
        }
      }
      if (v.flag) v.flag.update(dt, s.speed, null);
      if (v.headlight && v.headlight.setOn) {
        const on = v.isPlayer ? !!(v.lastInp ? v.lastInp.headlight : P.headlight) : (v.lastInp && v.lastInp.headlight) || isDark;
        if (on !== v.lightOn) { v.lightOn = on; v.headlight.setOn(on); if (v.isPlayer) audioOnce('headlight'); }
      }
    }
    if (playerV && cockpit) {
      const s = playerV.body.state;
      if (cockpit.mode === 'chase') {
        // debug chase view: follow the player; while the player sits still and the pack is well ahead, follow the leader instead
        let lead = null;
        for (const v of game.vehicles) if (!lead || v.body.state.s > lead.body.state.s) lead = v;
        const far = lead && lead !== playerV && lead.body.state.s - s.s > 40 && s.speed < 1.5;
        const want = far ? lead.group : playerV.group;
        if (want !== chaseT) { chaseT = want; cockpit.setChaseTarget(want); }
      }
      cockpit.update(dt, s, null);
      if (audio && audio.update && audio.ready) {
        let load = 0; for (let i = 0; i < 4; i++) { contactsArr[i] = !!s.wheelContacts[i].contact; load += s.wheelContacts[i].compression; }
        const oth = []; for (const v of game.vehicles) if (v !== playerV) oth.push({ position: v.body.state.position, speed: v.body.state.speed });
        safe(() => audio.update(dt, { speed: s.speed, surface: s.surface, wheelContacts: contactsArr, paddleL: frameImpulse.l, paddleR: frameImpulse.r, handbrake: s.handbrake, bumps: s.bump, suspensionLoad: Math.min(1, load / 4), flagRipple: 2 + s.speed * 0.6, dusk: isDark ? 1 : 0, others: oth, listener: camera }), 'audio.update');
      }
      frameImpulse.l = frameImpulse.r = 0;
      updateReflection(dt);
    }
    const ps0 = playerV ? playerV.body.state : null;
    safe(() => world.update(dt, camera), 'world.update');
    if (lighting && lighting.update) safe(() => lighting.update(dt, camera, ps0 ? ps0.speed : 0), 'lighting.update');
    const ps = playerV ? playerV.body.state : null;
    const sp = ps ? ps.speed : 0;
    if (ps) {
      // consume the wet/mud hits latched by the fixed update
      // intensity while in contact (not an accumulated amount); water needs >= 2 consecutive physics steps of real water contact
      const mh = ps.mudHit || 0, wh = ps.wetHit || 0, inten = Math.min(1, sp / 12);
      if (ps.respawns !== lastRespawns) { lastRespawns = ps.respawns; safe(() => post && post.clearSplatter && post.clearSplatter(), 'clearSplatter'); }
      else if (post && post.addSplatter) {
        if (mh > 0.05) safe(() => post.addSplatter('mud', inten), 'splatter');
        else if (wh > 0.05 && (ps.wetPeak || 0) >= 2) safe(() => post.addSplatter('water', inten, ps.wetPeak), 'splatter');
      }
      ps.mudHit = 0; ps.wetHit = 0; ps.wetPeak = ps.wetSteps || 0; // consume every render
    }
    mudTimer += dt; const mudTick = mudTimer >= 1; if (mudTick) mudTimer = 0;
    camera.updateMatrixWorld(); _pv.multiplyMatrices(camera.projectionMatrix, _mi.copy(camera.matrixWorld).invert()); _fr.setFromProjectionMatrix(_pv);
    const countdown = game.state.countdown > 0;
    let sh1 = null, sh2 = null;   // the two nearest AI/remote trucks within 12 m keep their shadows
    for (const v of game.vehicles) {
      v.mudCoat = Math.round((v.body.state.mudCoat || 0) * 50) / 50;   // 0.02 steps: each real change rewrites vertex colours
      v.group.userData.mudCoat = v.mudCoat; if (v.setMudCoat) v.setMudCoat(v.mudCoat);
      if (mudTick && v.mudCoat > 0 && v.group.userData.updateMud) safe(() => v.group.userData.updateMud(), 'updateMud');
      if (v.isPlayer) continue;
      const d = camera.position.distanceTo(v.group.position); v.camDist = d;
      if (d < 12) { if (!sh1 || d < sh1.camDist) { sh2 = sh1; sh1 = v; } else if (!sh2 || d < sh2.camDist) sh2 = v; }
      if (v.setLOD) {
        _sph.center.copy(v.group.position); _sph.radius = 2.5;
        const visible = _fr.intersectsSphere(_sph);
        const nearD = countdown ? 18 : 27, farD = countdown ? 20 : 33;
        const want = v.lod === 'far' ? (d < nearD && visible ? 'near' : 'far') : ((d > farD || (!visible && d > 5)) ? 'far' : 'near');
        if (want !== v.lod) { v.lod = want; v.setLOD(want); }
      }
    }
    for (const v of game.vehicles) {
      if (v.isPlayer) continue;
      if (!v.shadowMeshes) { v.shadowMeshes = []; v.group.traverse((o) => { if (o.isMesh && o.castShadow && o.name !== 'farLOD') v.shadowMeshes.push(o); }); v.shadowOn = true; }
      const want = v === sh1 || v === sh2;
      if (want !== v.shadowOn) { v.shadowOn = want; for (const o of v.shadowMeshes) o.castShadow = want; }
    }
    if (post && post.render) {
      try { post.render(dt, { speed: sp }); }
      catch (e) { console.warn('[main] post.render failed, falling back', e && e.message); post = null; renderer.render(scene, camera); }
    } else renderer.render(scene, camera);
  }

  // title-mode camera: slow orbit over the start line
  function titleCamera(t) {
    const smp = world.track.sampleAt(30);
    const a = t * 0.12;
    camera.position.copy(smp.position).add(new THREE.Vector3(Math.sin(a) * 9, 3.2 + Math.sin(a * 0.7), 6 + Math.cos(a) * 3));
    camera.lookAt(smp.position.x, smp.position.y + 1, smp.position.z - 10);
  }

  let acc = 0, last = performance.now(), simT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const rawDt = (now - last) / 1000; input.noteFrame(rawDt);
    const dt = Math.min(rawDt, 0.25); last = now;   // catch up after stalls up to 250 ms instead of dropping sim time
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 15) { fixedUpdate(); acc -= STEP; n++; }
    if (n === 15) acc = 0;
    simT += dt;
    const m = game.state.mode;
    if (m === 'title' || m === 'lobby' || m === 'garage') titleCamera(simT);
    if (game.state.role === 'client') applyProxies(dt);
    if (!P.norender) render(acc / STEP, dt);
    if (ui && ui.screen === 'garage') previewTick(dt);
    if (++readyFrames === 3) resolveReady();
    input.noteFrameEnd(performance.now() - now);
  }
  function advance(sec) {
    const n = Math.round(sec / STEP);
    for (let i = 0; i < n; i++) fixedUpdate();
    render(1, Math.min(Math.max(STEP, sec), 1)); // one render for the whole step: give camera springs / flags the elapsed time
  }

  // ---- ?scene= shortcuts for screenshots ----
  function sceneShortcutS(kind) {
    const wanted = {
      puddle: (h) => h.kind === 'puddle', water: (h) => h.type === 'water', stream: (h) => h.kind === 'stream',
      mud: (h) => h.type === 'mud', rock: (h) => h.type === 'rock', sand: (h) => h.type === 'sand', gravel: (h) => h.type === 'gravel',
    }[kind];
    // world.landmarks (array of {kind|type|name, s} or an object keyed by name): barn | finish | bridge
    const lm = world.landmarks;
    if (lm && (kind === 'barn' || kind === 'finish' || kind === 'bridge' || kind === 'farm')) {
      const list = Array.isArray(lm) ? lm : Object.entries(lm).map(([k, v]) => (v && typeof v === 'object' ? { name: k, ...v } : { name: k, s: v }));
      const want = kind === 'farm' ? 'barn' : kind;
      const hit = list.find((l) => [l.kind, l.type, l.name].some((x) => typeof x === 'string' && x.toLowerCase().includes(want)));
      if (hit && Number.isFinite(hit.s)) return Math.max(0, hit.s - (want === 'finish' ? 30 : 25));
    }
    if (kind === 'finish') return TRACK_LENGTH - 40;
    if (kind === 'barn' || kind === 'farm') { const f = world.info && world.info.farms && world.info.farms[0]; return f ? f.s - 25 : 400; }
    if (wanted) { const h = (world.hazards || []).find(wanted); return h ? h.s - 28 : 300; }
    return null;
  }

  // ---- go ----
  applyConditions(resolveConditions(), true);
  loading.set(1, 'ready');
  await nextFrame();
  loading.done();
  requestAnimationFrame((t) => { last = t; frame(t); });
  const sc = P.scene;
  if (sc === 'lobby' && ui) { game.state.mode = 'lobby'; openLobby('host'); return; }
  if (sc === 'garage' && ui) { ui.show('garage'); game.state.mode = 'garage'; return; }
  if (P.menu === 'host' && ui) { openLobby('host'); return; }
  if (P.menu === 'join' && ui) { openLobby('client'); return; }
  if (P.autostart || sc) {
    const sShort = sc ? sceneShortcutS(sc) : null;
    startRace({ truck: P.truck % TRUCKS.length, ai: P.ai, s: P.s ?? sShort, v: P.v ?? (sShort != null ? 9 : 10), countdown: 0, headlight: P.headlight });
  } else if (!ui) {
    game.state.mode = 'title'; showFallbackTitle();
  }
}

boot().catch((e) => { console.warn('[main] boot failed', e); throw e; });
