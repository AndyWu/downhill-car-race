// Geometry helpers + a Batch that merges many small parts into one mesh per material key.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function xf(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}
function scaleUV(g, su, sv) {
  const uv = g.attributes.uv; if (!uv) return g;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}
export function boxG(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile);
  }
  return g;
}
export function cylG(rt, rb, h, seg = 8, tile = 2) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1);
  return scaleUV(g, (Math.PI * 2 * Math.max(rt, rb)) / tile, h / tile);
}
export function sphG(r, ws = 8, hs = 6, tile = 2, phiLen = Math.PI * 2, thetaLen = Math.PI) {
  const g = new THREE.SphereGeometry(r, ws, hs, 0, phiLen, 0, thetaLen);
  return scaleUV(g, (r * 4) / tile, (r * 2) / tile);
}
export function prismG(pts, depth, tile = 2) {
  const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return scaleUV(g, 1 / tile, 1 / tile);
}
export function prep(geom) {
  let g = geom.index ? geom.toNonIndexed() : geom.clone();
  for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
export class Batch {
  constructor() { this.parts = new Map(); }
  add(key, geom, matrix, color = [1, 1, 1]) {
    const g = prep(geom);
    if (matrix) g.applyMatrix4(matrix);
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = color[0]; c[i * 3 + 1] = color[1]; c[i * 3 + 2] = color[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
    return this;
  }
  build(lib, { shadow = true, opts = {} } = {}) {
    const group = new THREE.Group();
    for (const [key, list] of this.parts) {
      const geo = mergeGeometries(list, false);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, lib.get(key, { vertexColors: true, ...(opts[key] || {}) }));
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      mesh.name = 'batch_' + key;
      group.add(mesh);
    }
    return group;
  }
}
