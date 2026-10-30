// Run: node src/scene/tracks-sanity.mjs [country|village|corn|circuit ...]   (contract checks for every track)
import * as THREE from 'three';
import { createWorld, TRACKS } from './index.js';

let fails = 0;
const assert = (c, m) => { if (!c) { fails++; console.error('FAIL:', m); } else console.log('ok  :', m); };
const ids = process.argv.slice(2).length ? process.argv.slice(2) : TRACKS.map((t) => t.id);
assert(TRACKS.length === 4 && TRACKS.every((t) => t.length === 3218), 'TRACKS lists 4 tracks of 3218 m');
const valid = new Set(['dirt', 'mud', 'water', 'rock', 'sand', 'gravel', 'grass', 'cobble', 'asphalt', 'corn', 'wall']);
for (const id of ids) {
  console.log('---', id);
  const w = await createWorld(new THREE.Scene(), { seed: 1, trackId: id });
  const w2 = await createWorld(new THREE.Scene(), { seed: 1, trackId: id });
  const T = TRACKS.find((t) => t.id === id);
  assert(w.trackId === id && w.track.length === 3218 && Math.abs(w.track.lapLength - T.lapLength) < 1e-6, `${id}: length 3218, lapLength ${w.track.lapLength.toFixed(1)}`);
  assert(w.flags && w.flags.laps === T.laps && w.flags.closed === (T.laps > 1), `${id}: flags ${JSON.stringify(w.flags)}`);
  // continuity
  let maxStep = 0, prev = w.track.sampleAt(0);
  for (let s = 1; s <= 3218; s++) { const a = w.track.sampleAt(s); maxStep = Math.max(maxStep, Math.abs(a.position.distanceTo(prev.position) - 1)); prev = a; }
  assert(maxStep < 0.02, `${id}: sampleAt continuous (max step error ${maxStep.toFixed(4)})`);
  if (T.laps > 1) {
    const a = w.track.sampleAt(40).position, b = w.track.sampleAt(40 + T.lapLength).position, c = w.track.sampleAt(40 + 2 * T.lapLength).position;
    assert(a.distanceTo(b) < 0.01 && a.distanceTo(c) < 0.01, `${id}: sampleAt wraps every lap`);
  }
  // project round trip with hint (unwrapped on the circuit)
  let e = 0, el = 0;
  for (let s = 5; s <= 3218; s += 7.3) { const f = w.track.sampleAt(s); const p = f.position.clone().addScaledVector(f.right, 0.6); const r = w.track.project(p, s - 0.7); if (id === 'village' && r.pathIndex > 0) continue; e = Math.max(e, Math.abs(r.s - s)); el = Math.max(el, Math.abs(r.lateral - 0.6)); }
  assert(e < 0.3 && el < 0.2, `${id}: project(sampleAt(s)) ~ s with hint (s err ${e.toFixed(3)}, lateral err ${el.toFixed(3)})`);
  // village branches
  if (id === 'village') {
    assert(w.splits.length === 3 && w.splits.every((sp) => sp.paths.length >= 3 && sp.paths[0].index === 0), 'village: 3 splits with main + 2 alternatives each');
    let ok = true, lens = [];
    for (const sp of w.splits) for (const pa of sp.paths) {
      lens.push(`${sp.id}.${pa.index} ${pa.name} ${pa.length.toFixed(0)}m w${pa.width}`);
      for (let k = 0.15; k <= 0.85; k += 0.1) {
        const s = sp.fromS + (sp.toS - sp.fromS) * k, f = w.track.sampleAt(s, { [sp.id]: pa.index });
        const r = w.track.project(f.position, s);
        if (Math.abs(r.s - s) > 1.2 || Math.abs(r.lateral) > 0.6 || (r.pathIndex ?? 0) !== pa.index) { ok = false; console.error('  mismatch', sp.id, pa.index, s.toFixed(0), JSON.stringify(r)); }
      }
    }
    assert(ok, 'village: every branch projects back to its own path/progress (' + lens.join('; ') + ')');
    assert(w.hazards.some((h) => h.splitId && h.pathIndex > 0) && w.hazards.every((h) => h.splitId == null || h.pathIndex != null), 'village: branch hazards carry splitId + pathIndex');
    const mp = w.mapPaths(); assert(mp.length === 1 + 6 && mp.filter((p) => p.main).length === 1, 'village: mapPaths = main + 6 branches');
  } else { assert(w.mapPaths().length >= 1 && w.mapPaths()[0].main, `${id}: mapPaths has the main path`); assert(w.splits.length === 0, `${id}: no splits`); }
  // start grid
  const st = Array.from({ length: 10 }, (_, i) => w.startTransform(i));
  let okSlots = true;
  for (let i = 0; i < 10; i++) { const pr = w.track.project(st[i].position, 0); const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(st[i].quaternion); const tg = w.track.sampleAt(pr.s).tangent; if (Math.abs(pr.lateral) > 2.4 || fwd.dot(tg) < 0.95) okSlots = false; for (let j = i + 1; j < 10; j++) if (st[i].position.distanceTo(st[j].position) < 2.3) okSlots = false; }
  assert(okSlots, `${id}: 10 start slots on the road, facing forward, >= 2.3 m apart`);
  // surfaces + heights
  const seen = {}; let bad = 0;
  for (let s = 0; s < 3218; s += 1.7) for (const d of [-2.2, 0, 2.2, 6, 12]) { const f = w.track.sampleAt(s), x = f.position.x + f.right.x * d, z = f.position.z + f.right.z * d, u = w.surfaceAt(x, z); seen[u.type] = (seen[u.type] || 0) + 1; if (!valid.has(u.type) || !(u.friction >= 0 && u.friction <= 1.2) || !(u.drag >= 0) || !(u.bump >= 0 && u.bump <= 1) || !Number.isFinite(w.heightAt(x, z))) bad++; }
  assert(bad === 0, `${id}: surfaceAt valid ${JSON.stringify(seen)}`);
  let det = true; for (let i = 0; i < 20; i++) { const f = w.track.sampleAt(i * 150), x = f.position.x + 7, z = f.position.z + 3; if (w.heightAt(x, z) !== w2.heightAt(x, z)) det = false; }
  assert(det && JSON.stringify(w.hazards) === JSON.stringify(w2.hazards), `${id}: deterministic for the same seed`);
  const f0 = w.track.sampleAt(500), r0 = w.setWeather('rain'); assert(r0.gripMul < 1, `${id}: setWeather works`); w.setWeather('clear');
  // draw-call / triangle budget at a few camera positions
  const cam = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 2500);
  for (const s of [10, 600, 1500, 2600]) {
    const f = w.track.sampleAt(s); cam.position.copy(f.position).add(new THREE.Vector3(0, 1.0, 0)); cam.lookAt(f.position.clone().addScaledVector(f.tangent, 50)); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
    w.update(0.016, cam);
    const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    let calls = 0, tris = 0;
    w.group.traverse((o) => {
      if (!(o.isMesh || o.isLineSegments)) return; let v = true, p = o; while (p) { if (!p.visible) v = false; p = p.parent; } if (!v) return;
      const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); const bs = o.isInstancedMesh ? (o.boundingSphere || (o.computeBoundingSphere(), o.boundingSphere)) : g.boundingSphere;
      if (!fr.intersectsSphere(bs.clone().applyMatrix4(o.matrixWorld))) return;
      calls++; tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
    });
    console.log(`      cam s=${s}: ~${calls} draw calls, ~${(tris / 1000) | 0}k tris`);
  }
}
process.exitCode = fails ? 1 : 0;
console.log(fails ? `${fails} FAILED` : 'all ok');
