// Run: node src/scene/sanity.mjs   (headless sanity checks for the scene contract)
import * as THREE from 'three';
import { createWorld, TRACK_LENGTH } from './index.js';

const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  :', m); };
const scene = new THREE.Scene();
const w = await createWorld(scene, { seed: 1 });
const w2 = await createWorld(new THREE.Scene(), { seed: 1 });
assert(TRACK_LENGTH === 3218 && w.track.length === 3218, 'length 3218');

// continuity
let maxStep = 0, maxAng = 0, prev = w.track.sampleAt(0);
for (let s = 1; s <= 3218; s++) { const a = w.track.sampleAt(s); maxStep = Math.max(maxStep, Math.abs(a.position.distanceTo(prev.position) - 1)); maxAng = Math.max(maxAng, a.tangent.angleTo(prev.tangent)); prev = a; }
assert(maxStep < 0.01 && maxAng < 0.05, `sampleAt continuous (step err ${maxStep.toFixed(4)}, max turn/m ${maxAng.toFixed(3)} rad)`);
const p0 = w.track.sampleAt(0).position, p1 = w.track.sampleAt(3218).position;
const drop = p0.y - p1.y;
assert(drop > 180 && drop < 300, `elevation drop ${drop.toFixed(1)} m (avg grade ${(drop / 3218 * 100).toFixed(1)}%)`);
const w0 = w.track.sampleAt(500).width; assert(w0 >= 6 && w0 <= 8.1, 'width in 6..8');

// project round trip
let e = 0, el = 0;
for (let s = 0; s <= 3218; s += 5.7) { const f = w.track.sampleAt(s); const p = f.position.clone().addScaledVector(f.right, 2.3); const r = w.track.project(p); e = Math.max(e, Math.abs(r.s - s)); el = Math.max(el, Math.abs(r.lateral - 2.3)); }
assert(e < 0.2 && el < 0.1, `project(sampleAt(s)) ~ s (max s err ${e.toFixed(3)}, lateral err ${el.toFixed(3)})`);

// heightAt vs road, normals, determinism
let he = 0, nmin = 1;
for (let s = 40; s <= 3218; s += 13) { const f = w.track.sampleAt(s); const h = w.heightAt(f.position.x, f.position.z); he = Math.max(he, Math.abs(h - f.position.y)); nmin = Math.min(nmin, w.normalAt(f.position.x, f.position.z).y); }
assert(he < 0.5, `heightAt on centreline within 0.5 m of spline (${he.toFixed(2)})`);
assert(nmin > 0.8, `road normals upright (min y ${nmin.toFixed(2)})`);
let det = true; for (let i = 0; i < 20; i++) { const x = -50 + i * 11, z = -i * 90; if (w.heightAt(x, z) !== w2.heightAt(x, z)) det = false; }
assert(det && JSON.stringify(w.hazards) === JSON.stringify(w2.hazards), 'deterministic for same seed');
// lateral heightAt continuity (no cliffs)
let jump = 0;
for (let s = 50; s < 3200; s += 17) { const f = w.track.sampleAt(s); let last = null; for (let d = -30; d <= 30; d += 0.25) { const h = w.heightAt(f.position.x + f.right.x * d, f.position.z + f.right.z * d); if (last !== null) jump = Math.max(jump, Math.abs(h - last)); last = h; } }
assert(jump < 0.9, `no height cliffs across the road (max 0.25 m step ${jump.toFixed(2)} m)`);

// surfaces
const valid = new Set(['dirt', 'mud', 'water', 'rock', 'sand', 'gravel', 'grass']);
const seen = {}; let bad = 0;
for (let s = 0; s < 3218; s += 0.75) for (const d of [-2.5, 0, 2.5, 9]) {
  const f = w.track.sampleAt(s); const u = w.surfaceAt(f.position.x + f.right.x * d, f.position.z + f.right.z * d);
  seen[u.type] = (seen[u.type] || 0) + 1;
  if (!valid.has(u.type) || !(u.friction >= 0 && u.friction <= 1.2) || !(u.drag >= 0) || !(u.bump >= 0 && u.bump <= 1)) bad++;
}
assert(bad === 0, 'surfaceAt returns valid types/ranges ' + JSON.stringify(seen));
for (const t of ['mud', 'water', 'rock', 'sand', 'gravel']) assert(seen[t] > 0, `surface type '${t}' present`);
const hk = {}; for (const h of w.hazards) hk[h.kind] = (hk[h.kind] || 0) + 1; console.log('hazards', w.hazards.length, hk);

// start slots
const st = [0, 1, 2, 3, 4, 5].map((i) => w.startTransform(i));
let okSlots = true;
for (const t of st) { const info = w.track.project(t.position); const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(t.quaternion); if (info.s < -2 || info.s > 14 || Math.abs(info.lateral) > 2 || fwd.dot(w.track.sampleAt(info.s).tangent) < 0.95) okSlots = false; }
assert(okSlots, 'startTransform: 6 slots on the ramp, facing downhill');

// render cost estimate at sample camera positions
const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 2500);
for (const s of [10, 400, 1100, 1900, 2800]) {
  const f = w.track.sampleAt(s); cam.position.copy(f.position).add(new THREE.Vector3(0, 1.2, 0)); cam.lookAt(f.position.clone().addScaledVector(f.tangent, 50)); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  w.update(0.016, cam);
  const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  let draws = 0, tris = 0;
  scene.traverse((o) => {
    if (!(o.isMesh || o.isLineSegments)) return;
    let v = true, p = o; while (p) { if (!p.visible) v = false; p = p.parent; } if (!v) return;
    const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    const bs = o.isInstancedMesh ? (o.boundingSphere || (o.computeBoundingSphere(), o.boundingSphere)) : g.boundingSphere;
    const sph = bs.clone().applyMatrix4(o.matrixWorld); if (!fr.intersectsSphere(sph)) return;
    draws++; tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
  });
  console.log(`cam s=${s}: ~${draws} draw calls, ~${(tris / 1000) | 0}k tris`);
}
{
  const f = w.track.sampleAt(1100); cam.position.copy(f.position).add(new THREE.Vector3(0, 1.2, 0)); cam.lookAt(f.position.clone().addScaledVector(f.tangent, 50)); cam.updateMatrixWorld(true);
  w.update(0.016, cam);
  const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const by = {};
  scene.traverse((o) => {
    if (!(o.isMesh || o.isLineSegments)) return; let v = true, p = o; while (p) { if (!p.visible) v = false; p = p.parent; } if (!v) return;
    const g = o.geometry; const bs = o.isInstancedMesh ? o.boundingSphere : g.boundingSphere; if (!bs) return;
    if (!fr.intersectsSphere(bs.clone().applyMatrix4(o.matrixWorld))) return;
    const k = o.name.replace(/_?\d+$/, ''); const t = ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
    by[k] = by[k] || { n: 0, t: 0 }; by[k].n++; by[k].t += t;
  });
  console.log(Object.entries(by).map(([k, v]) => `${k}:${v.n}/${(v.t / 1000) | 0}k`).join('  '));
}
