// Scene & environment module: track spline, terrain, hazards, scenery.  See ARCHITECTURE.md.
import * as THREE from 'three';
import { buildTrack, TRACK_LENGTH as TL } from './track.js';
import { createHazardField, SURFACES } from './hazards.js';
import { buildTerrain } from './terrain.js';
import { createMaterialLibrary } from './materials.js';
import { buildGround } from './ground.js';
import { buildScenery } from './scenery.js';
import { planFarms, buildFarm } from './farms.js';
import { clamp, lerp } from './util.js';
import { createTrackWorld } from './tracks/world2.js';

export const TRACK_LENGTH = TL;
export const TRACKS = [
  { id: 'country', name: 'Country Road', description: 'A long downhill dirt road through farms and fields: puddles, mud, streams and a few tight switchbacks.', laps: 1, lapLength: TL, length: TL },
  { id: 'village', name: 'Hill Village', description: 'Gentle cobbled streets through a hill village. Three times the road splits: market square, riverside lane or a narrow back alley.', laps: 1, lapLength: TL, length: TL },
  { id: 'corn', name: 'Corn & Pumpkins', description: 'Very narrow dirt lanes between tall corn, past pumpkin patches, hay bales, scarecrows and flocks of crows.', laps: 1, lapLength: TL, length: TL },
  { id: 'circuit', name: 'Speedway', description: 'A flat 1.07 km loop with kerbs, tyre walls and grandstands. Three laps - paddle hard.', laps: 3, lapLength: TL / 3, length: TL },
];
const tick = () => new Promise((r) => setTimeout(r, 0));

export async function createWorld(scene, { seed = 1, trackId = 'country', renderer, materials, onProgress } = {}) {
  if (trackId && trackId !== 'country' && TRACKS.some((t) => t.id === trackId)) return createTrackWorld(scene, { trackId, seed, renderer, materials, onProgress });
  const progress = (p, label) => { try { onProgress && onProgress(p, label); } catch (e) { /* ignore */ } };
  progress(0.02, 'surveying the road');
  const track = buildTrack(seed, TRACK_LENGTH);
  const field = createHazardField(track, seed);
  const farms = planFarms(track, seed);
  await tick();
  progress(0.15, 'shaping the hills');
  const gaps = [];
  for (const sg of [-1, 1]) { gaps.push({ s: TRACK_LENGTH + 15, side: sg, r: 30 }); }
  const terrain = buildTerrain(track, field, farms, seed, gaps);
  for (const f of farms) f.y = f.y; // pad heights were written by buildTerrain
  const lib = createMaterialLibrary(materials);
  const root = new THREE.Group(); root.name = 'world';
  scene.add(root);
  await tick();
  progress(0.4, 'laying the dirt road');
  const groundGroup = new THREE.Group(); groundGroup.name = 'ground'; root.add(groundGroup);
  const ground = buildGround({ track, terrain, field, lib, parent: groundGroup, L: TRACK_LENGTH, seed });
  await tick();
  progress(0.65, 'planting trees and fences');
  const sceneryGroup = new THREE.Group(); sceneryGroup.name = 'scenery'; root.add(sceneryGroup);
  const scenery = buildScenery({ track, terrain, field, lib, parent: sceneryGroup, L: TRACK_LENGTH, seed, farms });
  await tick();
  progress(0.85, 'building the farms');
  const farmObjs = farms.map((f) => buildFarm(f, { terrain, lib }));
  for (const fo of farmObjs) sceneryGroup.add(fo.group);
  progress(1, 'ready');

  const camPos = new THREE.Vector3();
  // view ranges (metres from camera to chunk edge)
  const R = { lod0: 130, groundFar: 760, near: 60, mid: 200, treesFar: 360, grass: 32, farm: 330, deco: 600 };
  let time = 0;
  const waterMats = [];
  if (!lib.provided) { const m = lib.get('waterPuddle', { vertexColors: true, transparent: true, polygonOffset: -2, direct: true }); if (m.map) waterMats.push(m.map); }

  // ---- weather ----
  const WEATHER = {
    clear: { snow: 0, wet: 0, grip: 1, drag: 0, wind: 0.35, gust: 0 },
    fog: { snow: 0, wet: 0.25, grip: 0.95, drag: 0, wind: 0.2, gust: 0 },
    snow: { snow: 1, wet: 0.15, grip: 0.65, drag: 0.05, wind: 0.3, gust: 0 },
    rain: { snow: 0, wet: 1, grip: 0.8, drag: 0, wind: 0.6, gust: 0.15 },
    storm: { snow: 0, wet: 1, grip: 0.8, drag: 0, wind: 1.0, gust: 0.7 },
  };
  const ALIAS = { foggy: 'fog', heavyrain: 'rain', 'heavy rain': 'rain', stormy: 'storm', snowy: 'snow', sunny: 'clear' };
  const weather = { name: 'clear', gripMul: 1, dragAdd: 0, snow: 0, wet: 0, wind: 0.35, gust: 0 };
  let windBase = 1;
  function setWeather(name = 'clear') {
    const key = ALIAS[String(name).toLowerCase()] || (WEATHER[String(name).toLowerCase()] ? String(name).toLowerCase() : 'clear');
    const w = WEATHER[key];
    Object.assign(weather, { name: key, gripMul: w.grip, dragAdd: w.drag, snow: w.snow, wet: w.wet, wind: w.wind, gust: w.gust });
    lib.wx.uSnow.value = w.snow; lib.wx.uWet.value = w.wet;
    windBase = 0.55 + w.wind * 1.6;       // foliage sway multiplier (storm ~2.1x, clear ~1.1x)
    lib.wind.uAmp.value = windBase;
    for (const it of ground.rainItems) it.mesh.visible = false; // update() shows them in range
    return { gripMul: weather.gripMul, dragAdd: weather.dragAdd };
  }

  function surfaceAt(x, z) {
    const r = surfaceAt0(x, z);
    if (weather.gripMul !== 1 && r.type !== 'grass') r.friction = clamp(r.friction * weather.gripMul, 0.05, 1.2);
    if (weather.dragAdd) r.drag += weather.dragAdd;
    return r;
  }
  function surfaceAt0(x, z) {
    const i = terrain.roadInfo(x, z);
    const ad = Math.abs(i.d), hw = i.hw;
    if (i.ramp) return { type: 'dirt', friction: 0.92, drag: 0, bump: 0.04 };
    if (ad > hw + 0.5) {
      // verge ramp: moderately soft ground, slope (heightAt) does the pushing back
      const k = 1 - Math.min(1, Math.max(0, (ad - (hw + 0.5)) / 9));
      const slick = 1 - Math.min(1, Math.max(0, (ad - (hw + 4.2)) / 2)); // slippery foot ramp: tyres can't hold against the slope, so it slides back to the road
      return { type: 'grass', friction: lerp(lerp(SURFACES.grass.friction, 0.5, k), 0.06, slick), drag: lerp(SURFACES.grass.drag, 0.45, k), bump: lerp(SURFACES.grass.bump, 0.4, k) };
    }
    const base = SURFACES.dirt;
    let f = base.friction, d = base.drag, b = base.bump, type = 'dirt';
    const edge = ad > hw ? (ad - hw) : 0; // 0..1 blend toward grass
    if (edge > 0) { f = lerp(f, SURFACES.grass.friction, edge); d = lerp(d, SURFACES.grass.drag, edge); b = lerp(b, SURFACES.grass.bump, edge); if (edge > 0.5) type = 'grass'; }
    const z0 = i.zone;
    if (z0 && i.w > 0.04) {
      const t = clamp(i.w * 1.25, 0, 1);
      f = lerp(f, z0.friction, t); d = lerp(d, z0.drag, t); b = lerp(b, z0.bump, t);
      if (i.w > 0.4) type = z0.type;
    }
    return { type, friction: clamp(f, 0.05, 1.2), drag: Math.max(0, d), bump: clamp(b, 0, 1) };
  }
  const pick = (s) => ({ friction: s.friction, drag: s.drag, bump: s.bump });

  const _f = new THREE.Vector3(), _x = new THREE.Vector3(), _n = new THREE.Vector3(), _mat = new THREE.Matrix4(), _pp = {};
  function startTransform(slot) {
    slot = clamp(Math.floor(slot), 0, 9);
    const row = slot >> 1, col = slot & 1;
    const s = 12.5 - 4.3 * row - (col ? 1.9 : 0), d = col ? 1.3 : -1.3;
    track.atS(s, _pp);
    const x = _pp.px + _pp.rhx * d, z = _pp.pz + _pp.rhz * d;
    const y = terrain.heightAt(x, z);
    const n = terrain.normalAt(x, z, 0.5);
    const T = track.sampleAt(s).tangent;
    _f.copy(T).addScaledVector(n, -T.dot(n)).normalize();
    _x.crossVectors(_f, n).normalize();
    _mat.makeBasis(_x, n, _f.clone().negate());
    return { position: new THREE.Vector3(x, y + 0.6, z), quaternion: new THREE.Quaternion().setFromRotationMatrix(_mat) };
  }

  const setVis = (o, v) => { if (o.visible !== v) o.visible = v; };
  const gd = (it) => camPos.distanceTo(it.center) - it.radius;
  const decoItems = [...ground.decals, ...ground.items];
  function update(dt, camera) {
    time += dt;
    lib.wind.uTime.value = time;
    if (weather.gust) lib.wind.uAmp.value = windBase * (1 + weather.gust * (0.5 + 0.5 * Math.sin(time * 0.9) * Math.sin(time * 0.37 + 1.3)));
    for (const t of waterMats) t.offset.y = (time * 0.02) % 1;
    ground.update(time);
    if (!camera) return;
    camera.getWorldPosition(camPos);
    for (const ch of ground.chunks) { const v = gd(ch) < R.lod0; for (const m of ch.lod0) setVis(m, v); }
    for (const f of ground.farItems) { const v = f.chunks.some((ch) => { const d = gd(ch); return d >= R.lod0 - 40 && d < R.groundFar; }); for (const m of f.meshes) setVis(m, v); }
    for (const it of ground.rainItems) setVis(it.mesh, weather.wet > 0.5 && gd(it) < R.deco);
    for (const it of decoItems) setVis(it.mesh || it.group, it.always || gd(it) < R.deco);
    for (const ch of scenery.chunks) {
      const d = gd(ch);
      setVis(ch.near, d < R.near); setVis(ch.mid, d < R.mid); setVis(ch.far, d >= R.near - 10 && d < R.treesFar);
    }
    for (const g of scenery.grass) setVis(g.mesh, gd(g) < R.grass);
    for (const fo of farmObjs) {
      const v = camPos.distanceTo(fo.center) - fo.radius < R.farm;
      setVis(fo.group, v);
      if (v) fo.update(time, dt);
    }
  }

  const landmarks = [];
  for (const f of farms) landmarks.push(f.bend ? { type: 'barn', s: f.s, lateral: f.barnLateral } : { type: 'farm', s: f.s, lateral: f.side * (f.hw + 68) });
  for (const z of field.zones) if (z.kind === 'stream' && z.bridge) landmarks.push({ type: 'bridge', s: z.s, lateral: 0 });
  landmarks.push({ type: 'finish', s: TRACK_LENGTH, lateral: 0 });
  landmarks.sort((a, b) => a.s - b.s);

  return {
    landmarks,
    trackId: 'country', flags: { closed: false, laps: 1, flat: false, noStuckRescue: false }, splits: [],
    track: { length: TRACK_LENGTH, lapLength: TRACK_LENGTH, sampleAt: track.sampleAt, project: track.project },
    mapPaths() { const pts = [], pp = {}; for (let s = 0; s <= TRACK_LENGTH; s += 10) { const p = track.sampleAt(s).position; pts.push([p.x, p.z]); } return [{ pts, main: true }]; },
    heightAt: terrain.heightAt,
    normalAt: (x, z) => terrain.normalAt(x, z),
    surfaceAt,
    hazards: field.hazards,
    startTransform,
    setWeather, weather,
    update,
    // extras (not part of the contract)
    group: root, seed,
    info: { drop: track.drop, farms: farms.map((f) => ({ s: f.s, x: f.x, z: f.z, bend: !!f.bend })) },
    dispose() { scene.remove(root); root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); },
  };
}
