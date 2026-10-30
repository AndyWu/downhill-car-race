// Run: node src/scene/tracks-clearance.mjs [village|corn|circuit ...]
// Verifies, for every network track (every road incl. each village branch):
//  1. no registered static footprint (buildings, walls, stalls, carts, barriers, tyres, stands, gantry legs, scarecrows, hay, pumpkins, corn ...)
//     intrudes into the drivable corridor (half-width + 0.3 m) of ANY road (union of corridors at junctions)
//  2. heightAt across the corridor has no bump/step > 0.25 m (outside tagged hazard zones), and tagged hazards leave a clear lane
//  3. every registered prop base is within +-0.15 m of heightAt under it
import * as THREE from 'three';
import { createWorld, TRACKS } from './index.js';

const MARGIN = 0.3, STEP = 0.25, GROUND = 0.15;
let fails = 0;
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['village', 'corn', 'circuit'];
for (const id of ids) {
  console.log('---', id);
  const w = await createWorld(new THREE.Scene(), { seed: 1, trackId: id });
  const { registry: reg, net, terrain } = w.debug, hAt = w.heightAt;
  // ---- 1. footprint clearance -------------------------------------------------------------------------------
  const byType = {}, bad = [];
  for (const it of reg.items) {
    byType[it.type] = (byType[it.type] || 0) + 1;
    if (it.hazard) continue;   // tagged hazards are checked by the clear-lane test below
    const c = reg.polyClear(it.pts, 0.5);
    if (c < MARGIN) bad.push({ it, c });
  }
  const sum = {}; for (const b of bad) sum[b.it.type] = (sum[b.it.type] || 0) + 1;
  console.log(`  registry: ${reg.items.length} footprints`, JSON.stringify(byType));
  for (const b of bad.slice(0, 12)) console.log(`    INTRUDES ${b.it.type} at (${b.it.gp[0].toFixed(0)},${b.it.gp[1].toFixed(0)}) clearance ${b.c.toFixed(2)} m`);
  if (bad.length) { fails++; console.error(`FAIL: ${id}: ${bad.length} footprints intrude into a corridor`, JSON.stringify(sum)); } else console.log(`ok  : ${id}: no footprint within ${MARGIN} m of any corridor`);
  // ---- 3. grounding -----------------------------------------------------------------------------------------
  const gb = [];
  for (const it of reg.items) {
    if (it.supported) continue;   // sits on another registered solid (billboard board on its posts)
    const h = hAt(it.gp[0], it.gp[1]);
    let e = it.baseY - h + (it.lift || 0), ok;
    if (it.sunk) {   // base buried in the ground: must be at or below the lowest terrain under the footprint (nothing floating), but not deeper than 5 m
      let lo = 1e9; for (const p of it.pts) lo = Math.min(lo, hAt(p[0], p[1])); lo = Math.min(lo, h);
      e = it.baseY - lo; ok = e <= GROUND && e >= -5;
    } else ok = Math.abs(e) <= GROUND;
    if (!ok) gb.push({ it, e });
  }
  const gs = {}; for (const b of gb) gs[b.it.type] = (gs[b.it.type] || 0) + 1;
  for (const b of gb.slice(0, 12)) console.log(`    UNGROUNDED ${b.it.type} at (${b.it.gp[0].toFixed(0)},${b.it.gp[1].toFixed(0)}) base-ground ${b.e.toFixed(2)} m`);
  if (gb.length) { fails++; console.error(`FAIL: ${id}: ${gb.length} props not within ${GROUND} m of heightAt`, JSON.stringify(gs)); } else console.log(`ok  : ${id}: all ${reg.items.length} props grounded within ${GROUND} m`);
  // ---- 3b. grounding against the RENDERED ground meshes (ray cast), not just heightAt ----------------------------
  {
    const meshes = []; w.group.traverse((o) => { if (o.isMesh && /^(tile|ribbon|road_|branch_|farfield)/.test(o.name)) meshes.push(o); });
    w.group.updateMatrixWorld(true);
    const rc = new THREE.Raycaster(), dn = new THREE.Vector3(0, -1, 0), o3 = new THREE.Vector3(), rb = [];
    for (const it of reg.items) {
      if (it.supported || it.hazard || it.type === 'corn' || it.type === 'tyre') continue;
      rc.set(o3.set(it.gp[0], it.baseY + 25, it.gp[1]), dn);
      const hit = rc.intersectObjects(meshes, false)[0];
      if (!hit) continue;
      const e = it.baseY + (it.lift || 0) - hit.point.y;
      if (e > GROUND || (!it.sunk && e < -0.3)) rb.push({ it, e });
    }
    const rs = {}; for (const b of rb) rs[b.it.type] = (rs[b.it.type] || 0) + 1;
    for (const b of rb.slice(0, 8)) console.log(`    FLOATS/BURIED ${b.it.type} at (${b.it.gp[0].toFixed(0)},${b.it.gp[1].toFixed(0)}) base vs rendered ground ${b.e.toFixed(2)} m`);
    if (rb.length) { fails++; console.error(`FAIL: ${id}: ${rb.length} props float above / sink into the rendered ground`, JSON.stringify(rs)); } else console.log(`ok  : ${id}: every prop sits on the rendered ground mesh (ray cast, +${GROUND} / -0.3 m)`);
  }
  // ---- 2. height steps across every corridor ---------------------------------------------------------------
  const pp = {}; let nStep = 0, worst = 0; const stepBad = [];
  net.roads.forEach((r, ri) => {
    const hz = (r.field ? r.field.zones : []).map((z) => ({ a: z.s - z.a * 1.7 - 2, b: z.s + z.a * 1.7 + 2 }));
    const inHz = (s) => hz.some((h) => s >= h.a && s <= h.b);
    const n = r.closed ? r.length : r.length;
    for (let s = 0; s <= n; s += 1) {
      if (inHz(s)) continue;
      r.atS(s, pp); const hw = pp.hw + MARGIN; let prev = null, prevAlong = null;
      for (let d = -hw; d <= hw + 1e-6; d += STEP) {
        const x = pp.px + pp.rhx * d, z = pp.pz + pp.rhz * d, h = hAt(x, z);
        if (prev !== null && Math.abs(h - prev) > STEP) { nStep++; worst = Math.max(worst, Math.abs(h - prev)); if (stepBad.length < 8) stepBad.push(`${r.name || ri} s=${s} d=${d.toFixed(2)} dh=${(h - prev).toFixed(2)}`); }
        prev = h;
      }
    }
  });
  if (nStep) { fails++; console.error(`FAIL: ${id}: ${nStep} lateral height steps > ${STEP} m (worst ${worst.toFixed(2)})`, stepBad.join(' | ')); } else console.log(`ok  : ${id}: no lateral height step > ${STEP} m across any corridor`);
  // along-road bumps: heightAt vs centreline profile changes over 1 m must stay within slope + 0.25
  let nB = 0; const bumpBad = [];
  net.roads.forEach((r, ri) => {
    const hz = (r.field ? r.field.zones : []).map((z) => ({ a: z.s - z.a * 1.7 - 2, b: z.s + z.a * 1.7 + 2 })), inHz = (s) => hz.some((h) => s >= h.a && s <= h.b);
    for (const dd of [-1, 0, 1]) {
      let prev = null, prevP = null;
      for (let s = 0; s <= r.length; s += 1) {
        r.atS(s, pp); const hw = pp.hw * 0.8 * dd, x = pp.px + pp.rhx * hw, z = pp.pz + pp.rhz * hw, h = hAt(x, z), py = pp.py;
        if (prev !== null && !inHz(s) && Math.abs((h - prev) - (py - prevP)) > STEP) { nB++; if (bumpBad.length < 6) bumpBad.push(`${r.name || ri} s=${s} d=${hw.toFixed(1)}`); }
        prev = h; prevP = py;
      }
    }
  });
  if (nB) { fails++; console.error(`FAIL: ${id}: ${nB} along-road bumps > ${STEP} m`, bumpBad.join(' | ')); } else console.log(`ok  : ${id}: no along-road bump > ${STEP} m outside hazard zones`);
  // hazards leave a clear lane
  let minLane = 99, laneBad = [];
  net.roads.forEach((r, ri) => {
    if (!r.field) return;
    for (const z of r.field.zones) {
      if (!z.obstacles) continue;
      const o = {};
      for (let s = z.s - z.a - 3; s <= z.s + z.a + 3; s += 0.5) {
        r.atS(s, pp); const hw = pp.hw; let run = 0, best = 0;
        for (let d = -hw; d <= hw; d += 0.1) { r.field.query(s, d, o); if (o.lift > 0.25) run = 0; else { run += 0.1; best = Math.max(best, run); } }
        const need = Math.min(3.5, hw * 2 * 0.55);
        minLane = Math.min(minLane, best);
        if (best < need - 1e-6) laneBad.push(`${r.name || ri} s=${z.s.toFixed(0)} lane=${best.toFixed(2)}<${need.toFixed(2)}`);
      }
    }
  });
  const lb = [...new Set(laneBad)];
  if (lb.length) { fails++; console.error(`FAIL: ${id}: hazards leave too narrow a lane`, lb.slice(0, 6).join(' | ')); } else console.log(`ok  : ${id}: obstacle hazards keep a clear lane (min ${minLane === 99 ? 'n/a' : minLane.toFixed(2) + ' m'})`);
}
console.log(fails ? `${fails} FAILING checks` : 'ALL OK');
process.exit(fails ? 1 : 0);
