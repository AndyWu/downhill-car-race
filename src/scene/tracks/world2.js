// Assembles a World (see ARCHITECTURE.md / tracks-brief.md) for the network tracks: village, corn, circuit.
import * as THREE from 'three';
import { createMaterialLibrary } from '../materials.js';
import { buildTerrainNet } from '../terrainnet.js';
import { buildGroundNet } from './ground2.js';
import { clamp } from '../util.js';
import { planVillage } from './village.js';
import { planCorn } from './corn.js';
import { planCircuit } from './circuit.js';

const PLANS = { village: planVillage, corn: planCorn, circuit: planCircuit };
const tick = () => new Promise((r) => setTimeout(r, 0));

export async function createTrackWorld(scene, { trackId, seed = 1, materials, onProgress } = {}) {
  const progress = (p, l) => { try { onProgress && onProgress(p, l); } catch (e) { /* ignore */ } };
  progress(0.02, 'surveying');
  const plan = PLANS[trackId](seed);
  const net = plan.net;
  await tick();
  progress(0.15, 'shaping the ground');
  const terrain = buildTerrainNet(net, plan.pads || [], seed, plan.terrainOpts);
  const lib = createMaterialLibrary(materials);
  const root = new THREE.Group(); root.name = 'world'; scene.add(root);
  await tick();
  progress(0.4, 'paving');
  const groundGroup = new THREE.Group(); groundGroup.name = 'ground'; root.add(groundGroup);
  const ground = buildGroundNet({ net, terrain, lib, parent: groundGroup, theme: plan.theme, seed });
  await tick();
  progress(0.65, 'dressing the scene');
  const decorGroup = new THREE.Group(); decorGroup.name = 'scenery'; root.add(decorGroup);
  const decor = plan.decorate({ net, terrain, lib, parent: decorGroup, seed, plan });
  progress(1, 'ready');

  // ---- weather (same model as the country road) ----
  const WEATHER = {
    clear: { snow: 0, wet: 0, grip: 1, drag: 0, wind: 0.35, gust: 0 }, fog: { snow: 0, wet: 0.25, grip: 0.95, drag: 0, wind: 0.2, gust: 0 },
    snow: { snow: 1, wet: 0.15, grip: 0.65, drag: 0.05, wind: 0.3, gust: 0 }, rain: { snow: 0, wet: 1, grip: 0.8, drag: 0, wind: 0.6, gust: 0.15 }, storm: { snow: 0, wet: 1, grip: 0.8, drag: 0, wind: 1.0, gust: 0.7 },
  };
  const ALIAS = { foggy: 'fog', heavyrain: 'rain', 'heavy rain': 'rain', stormy: 'storm', snowy: 'snow', sunny: 'clear' };
  const weather = { name: 'clear', gripMul: 1, dragAdd: 0, snow: 0, wet: 0, wind: 0.35, gust: 0 };
  let windBase = 1;
  function setWeather(name = 'clear') {
    const k = String(name).toLowerCase(), key = ALIAS[k] || (WEATHER[k] ? k : 'clear'), w = WEATHER[key];
    Object.assign(weather, { name: key, gripMul: w.grip, dragAdd: w.drag, snow: w.snow, wet: w.wet, wind: w.wind, gust: w.gust });
    lib.wx.uSnow.value = w.snow; lib.wx.uWet.value = w.wet; windBase = 0.55 + w.wind * 1.6; lib.wind.uAmp.value = windBase;
    return { gripMul: weather.gripMul, dragAdd: weather.dragAdd };
  }
  function surfaceAt(x, z) {
    const r = plan.surface(terrain.roadInfo(x, z));
    if (weather.gripMul !== 1 && r.type !== 'grass' && r.type !== 'wall' && r.type !== 'corn') r.friction = clamp(r.friction * weather.gripMul, 0.05, 1.2);
    if (weather.dragAdd) r.drag += weather.dragAdd;
    return r;
  }

  // ---- start grid ----
  const _f = new THREE.Vector3(), _x = new THREE.Vector3(), _m = new THREE.Matrix4(), _pp = {};
  function startTransform(slot) {
    slot = clamp(Math.floor(slot), 0, 9);
    const { s, d } = plan.startPos(slot);
    net.atS(s, _pp);
    const x = _pp.px + _pp.rhx * d, z = _pp.pz + _pp.rhz * d, y = terrain.heightAt(x, z), n = terrain.normalAt(x, z, 0.5);
    const T = net.sampleAt(s).tangent;
    _f.copy(T).addScaledVector(n, -T.dot(n)).normalize(); _x.crossVectors(_f, n).normalize(); _m.makeBasis(_x, n, _f.clone().negate());
    return { position: new THREE.Vector3(x, y + 0.6, z), quaternion: new THREE.Quaternion().setFromRotationMatrix(_m) };
  }

  // ---- visibility ----
  const camPos = new THREE.Vector3();
  const setVis = (o, v) => { if (o.visible !== v) o.visible = v; };
  const gd = (it) => camPos.distanceTo(it.center) - it.radius;
  const R = plan.ranges || { ground: 420 };
  let time = 0;
  function update(dt, camera, actors) {
    time += dt;
    lib.wind.uTime.value = time;
    if (weather.gust) lib.wind.uAmp.value = windBase * (1 + weather.gust * (0.5 + 0.5 * Math.sin(time * 0.9) * Math.sin(time * 0.37 + 1.3)));
    if (!camera) return;
    camera.getWorldPosition(camPos);
    for (const ch of ground.chunks) { const v = gd(ch) < R.ground; for (const m of ch.meshes) setVis(m, v); }
    for (const it of decor.items) {
      const d = it.always ? 0 : gd(it);
      for (const g of it.groups) setVis(g.obj, d >= (g.min ?? -1e9) && d < (g.max ?? 250));
    }
    if (decor.update) decor.update(dt, camPos, time, actors);
  }

  function mapPaths() {
    const out = [], main = net.main, pp = {};
    const pts = [];
    if (main.closed) { for (let s = 0; s < main.length; s += 8) { main.atS(s, pp); pts.push([pp.px, pp.pz]); } pts.push(pts[0].slice()); }
    else for (let s = 0; s <= net.length; s += 10) { main.atS(s, pp); pts.push([pp.px, pp.pz]); }
    out.push({ pts, main: true });
    for (const b of net.branches) { const p2 = []; for (let s = 0; s <= b.road.length; s += 6) { b.road.atS(s, pp); p2.push([pp.px, pp.pz]); } out.push({ pts: p2, main: false, splitId: b.splitId, pathIndex: b.pathIndex }); }
    return out;
  }

  const tracks = net.length;
  return {
    trackId, name: plan.name, flags: plan.flags, splits: plan.splits || [],
    landmarks: plan.landmarks, hazards: plan.hazards,
    track: { length: net.length, lapLength: net.lapLength, sampleAt: net.sampleAt, project: net.project },
    heightAt: terrain.heightAt, normalAt: (x, z) => terrain.normalAt(x, z), surfaceAt, startTransform, setWeather, weather, update, mapPaths,
    group: root, seed, info: { drop: net.drop, farms: [] },
    dispose() { scene.remove(root); root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); },
  };
}
