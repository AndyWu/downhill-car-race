// Shared tree / bush / rock scatter for the network tracks (near = merged meshes, far = cheap instanced silhouettes).
import * as THREE from 'three';
import { mulberry32, Noise, clamp, smoothstep, lerp } from '../util.js';
import { makePine, makeOak, makeBirch, makePoplar, makeBush, makeDead, makeRock, bakeTrees, makeFarConifer, makeFarBroad } from '../scenery.js';

const GREEN = [[0.7, 1.15], [0.8, 1.15], [0.6, 1.1]], YEL = [[0.95, 1.35], [0.9, 1.15], [0.5, 0.8]], AUTUMN = [[1.5, 2.2], [0.55, 1.1], [0.25, 0.5]], BLUEG = [[0.65, 0.95], [0.8, 1.1], [0.75, 1.1]];
let SPECIES = null;
function species() {
  if (SPECIES) return SPECIES;
  SPECIES = [
    { name: 'pineA', ...makePine(1, 1.0), sc: [0.8, 1.4], amp: 0.14, pal: BLUEG, con: true },
    { name: 'pineB', ...makePine(2, 0.7), sc: [1.0, 1.6], amp: 0.14, pal: GREEN, con: true },
    { name: 'oakA', ...makeOak(2), sc: [0.8, 1.3], amp: 0.1, pal: GREEN },
    { name: 'oakB', ...makeOak(6), sc: [0.7, 1.4], amp: 0.1, pal: YEL },
    { name: 'maple', ...makeOak(9, true), sc: [0.7, 1.2], amp: 0.1, pal: AUTUMN },
    { name: 'birch', ...makeBirch(3), sc: [0.8, 1.2], amp: 0.14, pal: YEL },
    { name: 'poplar', ...makePoplar(8), sc: [0.8, 1.4], amp: 0.1, pal: GREEN },
    { name: 'bush', ...makeBush(5), sc: [0.7, 1.7], amp: 0.06, pal: YEL, bush: true },
  ];
  return SPECIES;
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const compose = (x, y, z, yaw, sx, sy, sz, tx = 0, tz = 0) => { _e.set(tx, yaw, tz, 'YXZ'); _q.setFromEuler(_e); return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), new THREE.Vector3(sx, sy, sz)); };

/**
 * opts: { net, terrain, lib, parent, seed, chunk=125, perChunk, minClear, maxOff, mix:[weights for species idx], exclude(x,z)->bool }
 * returns [{ near, far, center, radius }]
 */
export function scatterTrees(o) {
  const { net, terrain, lib, parent, seed } = o;
  const sp = species(), main = net.main, pp = {}, q = {};
  const nz = new Noise(seed * 211 + 9);
  const CH = o.chunk || 125, lo = main.closed ? 0 : 0, hi = main.length;
  const trunkMat = lib.get('woodWeathered', { vertexColors: true, sway: { amp: 0.07, freq: 1.2, hpow: 2, hscale: 1, attr: true } });
  const canopyMat = lib.get('foliage', { vertexColors: true, side: THREE.DoubleSide, sway: { amp: 0.22, freq: 1.35, hpow: 2, hscale: 1, attr: true } });
  const farMat = lib.get('blade', { vertexColors: true, side: THREE.DoubleSide, sway: { amp: 0.2, freq: 1.3, hpow: 2, hscale: 0.1 } });
  const farCon = makeFarConifer(), farBrd = makeFarBroad();
  const items = [];
  const mix = o.mix || [1, 1, 1, 1, 0.5, 1, 1, 1.5];
  const msum = mix.reduce((a, b) => a + b, 0);
  const pick = (r) => { let t = r * msum; for (let i = 0; i < mix.length; i++) { t -= mix[i]; if (t <= 0) return i; } return mix.length - 1; };
  for (let c = 0; c * CH < hi; c++) {
    const s0 = c * CH, s1 = Math.min(hi, s0 + CH), rng = mulberry32(seed * 1000 + c * 31 + (o.salt || 11));
    const list = [];
    for (let i = 0; i < (o.perChunk || 90); i++) {
      const s = s0 + rng() * (s1 - s0), side = rng() < 0.5 ? -1 : 1;
      main.atS(s, pp);
      const off = pp.hw + (o.minClear || 6) + Math.pow(rng(), 1.7) * (o.maxOff || 80);
      const x = pp.px + pp.rhx * side * off, z = pp.pz + pp.rhz * side * off;
      if (rng() > 0.25 + 0.75 * smoothstep(-0.3, 0.4, nz.n1(s / 110 + side * 5.1 + off / 70))) continue;
      net.project2(x, z, q); const rd = q.road; rd.params(q.idx, {}); const hwq = rd.tables.width[Math.round(q.idx) % rd.TN] * 0.5;
      if (q.dist - hwq < (o.minClear || 6) - 1) continue;
      if (o.exclude && o.exclude(x, z, s)) continue;
      const si = pick(rng()), spc = sp[si], scl = lerp(spc.sc[0], spc.sc[1], rng());
      const y = terrain.heightAt(x, z);
      const m = compose(x, y - 0.15, z, rng() * 6.28, scl * lerp(0.8, 1.28, rng()), scl * lerp(0.78, 1.35, rng()), scl * lerp(0.8, 1.28, rng()), (rng() - 0.5) * 0.09, (rng() - 0.5) * 0.09);
      const br = 0.82 + rng() * 0.3, t = rng();
      list.push({ sp: spc, m, col: new THREE.Color(br * lerp(spc.pal[0][0], spc.pal[0][1], t), br * lerp(spc.pal[1][0], spc.pal[1][1], rng() * 0.6 + t * 0.4), br * lerp(spc.pal[2][0], spc.pal[2][1], rng())) });
    }
    if (!list.length) continue;
    const near = new THREE.Group(), far = new THREE.Group(); near.name = 'trees_near_' + c; far.name = 'trees_far_' + c;
    const tg = bakeTrees(list, 'trunk'), cg = bakeTrees(list, 'canopy');
    if (tg) { const m = new THREE.Mesh(tg, trunkMat); m.castShadow = true; near.add(m); }
    if (cg) { const m = new THREE.Mesh(cg, canopyMat); m.castShadow = true; near.add(m); }
    const mkInst = (geo, arr) => {
      const m = new THREE.InstancedMesh(geo, farMat, arr.length);
      arr.forEach((it, i) => { m.setMatrixAt(i, it.m); m.setColorAt(i, it.col); }); m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); return m;
    };
    const con = list.filter((it) => it.sp.con), brd = list.filter((it) => !it.sp.con && !it.sp.bush);
    if (con.length) far.add(mkInst(farCon, con)); if (brd.length) far.add(mkInst(farBrd, brd));
    const mid = main.atS((s0 + s1) / 2, {});
    parent.add(near); parent.add(far);
    items.push({ near, far, center: new THREE.Vector3(mid.px, mid.py, mid.pz), radius: (s1 - s0) / 2 + 40 });
  }
  return items;
}
