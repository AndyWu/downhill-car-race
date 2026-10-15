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

export const TRACK_LENGTH = TL;
const tick = () => new Promise((r) => setTimeout(r, 0));

export async function createWorld(scene, { seed = 1, renderer, materials, onProgress } = {}) {
  const progress = (p, label) => { try { onProgress && onProgress(p, label); } catch (e) { /* ignore */ } };
  progress(0.02, 'surveying the road');
  const track = buildTrack(seed, TRACK_LENGTH);
  const field = createHazardField(track, seed);
  const farms = planFarms(track, seed);
  await tick();
  progress(0.15, 'shaping the hills');
  const gaps = [];
  for (const f of farms) gaps.push({ s: f.s, side: f.side, r: 0.8 });
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
  const RANGE_GROUND = 1100, RANGE_SCENERY = 340, RANGE_GRASS = 190, RANGE_FARM = 420;
  let time = 0;
  const waterMats = [];
  if (!lib.provided) for (const k of ['water']) { const m = lib.get(k, { vertexColors: true, transparent: true, polygonOffset: -2 }); if (m.map) waterMats.push(m.map); }

  function surfaceAt(x, z) {
    const i = terrain.roadInfo(x, z);
    const ad = Math.abs(i.d), hw = i.hw;
    if (i.ramp) return { type: 'dirt', friction: 0.92, drag: 0, bump: 0.04 };
    if (ad > hw + 1.2) {
      // verge / bank: soft, sticky ground so a drifting car is slowed hard
      const k = 1 - Math.min(1, Math.max(0, (ad - (hw + 1.2)) / 8));
      return { type: 'grass', friction: lerp(SURFACES.grass.friction, 0.32, k), drag: lerp(SURFACES.grass.drag, 1.5, k), bump: lerp(SURFACES.grass.bump, 0.55, k) };
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
    slot = clamp(Math.floor(slot), 0, 5);
    const row = slot >> 1, col = slot & 1;
    const s = 9.5 - 4.2 * row - (col ? 1.9 : 0), d = col ? 1.3 : -1.3;
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

  const vis = (items, range) => {
    for (const it of items) {
      const dist = camPos.distanceTo(it.center) - it.radius;
      const v = dist < range;
      const o = it.mesh || it.group;
      if (o.visible !== v) o.visible = v;
    }
  };
  const groundItems = [...ground.chunks, ...ground.decals, ...ground.items];
  function update(dt, camera) {
    time += dt;
    lib.wind.uTime.value = time;
    for (const t of waterMats) t.offset.y = (time * 0.02) % 1;
    ground.update(time);
    if (camera) {
      camera.getWorldPosition(camPos);
      vis(groundItems, RANGE_GROUND);
      vis(scenery.chunks, RANGE_SCENERY);
      vis(scenery.grass, RANGE_GRASS);
      for (const fo of farmObjs) {
        fo.group.visible = camPos.distanceTo(fo.center) - fo.radius < RANGE_FARM;
        if (fo.group.visible) fo.update(time, dt);
      }
    }
  }

  const landmarks = [];
  for (const f of farms) landmarks.push(f.bend ? { type: 'barn', s: f.s, lateral: f.barnLateral } : { type: 'farm', s: f.s, lateral: f.side * (f.hw + 68) });
  for (const z of field.zones) if (z.kind === 'stream' && z.bridge) landmarks.push({ type: 'bridge', s: z.s, lateral: 0 });
  landmarks.push({ type: 'finish', s: TRACK_LENGTH, lateral: 0 });
  landmarks.sort((a, b) => a.s - b.s);

  return {
    landmarks,
    track: { length: TRACK_LENGTH, sampleAt: track.sampleAt, project: track.project },
    heightAt: terrain.heightAt,
    normalAt: (x, z) => terrain.normalAt(x, z),
    surfaceAt,
    hazards: field.hazards,
    startTransform,
    update,
    // extras (not part of the contract)
    group: root, seed,
    info: { drop: track.drop, farms: farms.map((f) => ({ s: f.s, x: f.x, z: f.z, bend: !!f.bend })) },
    dispose() { scene.remove(root); root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); },
  };
}
