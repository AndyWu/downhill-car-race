// Geometry kit: per-material "collectors" that bake primitives (with vertex-colour grime, planar UVs,
// decal cells) into a handful of merged meshes per truck.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { getTextures, CELL } from './textures.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- materials
let fallback = null;
const providedClones = new WeakMap();

function vcClone(src) {
  if (!src) return null;
  if (!providedClones.has(src)) {
    const c = src.clone();
    c.vertexColors = true;
    providedClones.set(src, c);
  }
  return providedClones.get(src);
}

export function getMaterials(provided) {
  if (!fallback) {
    const t = getTextures();
    fallback = {
      wood: new THREE.MeshStandardMaterial({ name: 'truckWood', map: t.wood || null, vertexColors: true, roughness: 0.93, metalness: 0 }),
      metal: new THREE.MeshStandardMaterial({ name: 'truckMetal', map: t.rust || null, vertexColors: true, roughness: 0.72, metalness: 0.3 }),
      paint: new THREE.MeshStandardMaterial({ name: 'truckPaint', map: t.atlas || null, vertexColors: true, roughness: 0.78, metalness: 0.05, alphaTest: 0.45, side: THREE.DoubleSide }),
      rope: new THREE.MeshStandardMaterial({ name: 'truckRope', map: t.rope || null, vertexColors: true, roughness: 1, metalness: 0 }),
      rubber: new THREE.MeshStandardMaterial({ name: 'truckRubber', map: t.rubber || null, vertexColors: true, roughness: 0.92, metalness: 0 }),
      lens: new THREE.MeshStandardMaterial({ name: 'truckLens', color: 0xf3ecc8, emissive: 0xffe9a0, emissiveIntensity: 0.15, roughness: 0.2, metalness: 0, side: THREE.DoubleSide }),
    };
  }
  const m = { ...fallback };
  if (provided) {
    m.wood = vcClone(provided.woodWeathered) || m.wood;
    m.metal = vcClone(provided.metalRusted) || m.metal;
    m.rope = vcClone(provided.rope) || m.rope;
    m.rubber = vcClone(provided.rubber) || m.rubber;
  }
  return m;
}

// ---------------------------------------------------------------- collector
const DIRT = new THREE.Color(0x4b3b29);
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

function planarUV(g, tile, off) {
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const size = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
  const a = size[0] >= size[1] && size[0] >= size[2] ? 0 : size[1] >= size[2] ? 1 : 2;
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const co = [p.getX(i), p.getY(i), p.getZ(i)];
    const nn = [Math.abs(n.getX(i)), Math.abs(n.getY(i)), Math.abs(n.getZ(i))];
    const major = nn[0] >= nn[1] && nn[0] >= nn[2] ? 0 : nn[1] >= nn[2] ? 1 : 2;
    let u, v;
    if (major === a) { const o = [0, 1, 2].filter((k) => k !== a); u = co[o[0]]; v = co[o[1]]; }
    else { const o = [0, 1, 2].filter((k) => k !== a && k !== major)[0]; u = co[a]; v = co[o]; }
    uv.setXY(i, u / tile + off[0], v / tile + off[1]);
  }
}

function cellRect(cell, inset = 0.004) {
  const col = cell % 4, row = (cell / 4) | 0;
  return [col * CELL + inset, 1 - (row + 1) * CELL + inset, CELL - inset * 2];
}

function plainUV(g, off) {
  const [u0, v0, sz] = cellRect(0, 0.01);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const fu = Math.min(0.95, Math.max(0.05, off[0] + p.getX(i) * 0.22 + p.getZ(i) * 0.1));
    const fv = Math.min(0.95, Math.max(0.05, off[1] + p.getY(i) * 0.22 - p.getZ(i) * 0.1));
    uv.setXY(i, u0 + fu * sz, v0 + fv * sz);
  }
}


function hash3(x, y, z) {
  let h = Math.imul(Math.floor(x) * 374761393 + Math.floor(y) * 668265263 + Math.floor(z) * 2147483647, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** smooth value noise in [0,1] */
export function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v), w);
}

/** cylindrical UV projection around a local axis (seam-safe per triangle). u runs around, v along the axis. */
function cylUV(g, axis, tile, off, swap) {
  const p = g.attributes.position, uv = g.attributes.uv;
  g.computeBoundingBox();
  const bb = g.boundingBox, ext = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
  const ia = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const rad = Math.max(0.02, 0.5 * Math.max(...ext.filter((_, i) => i !== ia)));
  const k = (rad / tile);
  const a = new Float32Array(p.count), v = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const c = [p.getX(i), p.getY(i), p.getZ(i)];
    const o = [0, 1, 2].filter((q) => q !== ia);
    a[i] = Math.atan2(c[o[0]], c[o[1]]);
    v[i] = c[ia] / tile;
  }
  for (let t = 0; t < p.count; t += 3) {
    for (let j = 1; j < 3; j++) {
      while (a[t + j] - a[t] > Math.PI) a[t + j] -= Math.PI * 2;
      while (a[t + j] - a[t] < -Math.PI) a[t + j] += Math.PI * 2;
    }
  }
  for (let i = 0; i < p.count; i++) {
    const u = a[i] * k + off[0], vv = v[i] + off[1];
    if (swap) uv.setXY(i, vv, u); else uv.setXY(i, u, vv);
  }
}

export class Collector {
  constructor(kind, kit, grime = true) {
    this.kind = kind; this.kit = kit; this.grime = grime; this.list = [];
    this.mud = grime ? 'height' : 'none'; this.mudR = 0.25; this.tileDefault = 0;
  }

  /** Bake a geometry. o: p[x,y,z], r[x,y,z] euler, q quaternion, s scale (num|array), c colour, v variation,
   *  grime 0..1, cell (decal cell index), tile (uv metres per texture repeat) */
  add(geo, o = {}) {
    const rand = this.kit.rand;
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (o.tess) g = new TessellateModifier(o.tess, 6).modify(g);
    const uv0 = g.attributes.uv.array.slice();
    if (o.s !== undefined) {
      const s = typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s;
      g.applyMatrix4(_m4.makeScale(s[0], s[1], s[2]));
    }
    if (o.cell !== undefined) {
      const [u0, v0, sz] = cellRect(o.cell);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * sz, v0 + uv.getY(i) * sz);
    } else if (o.uvAxis && (this.kind === 'wood' || this.kind === 'metal' || this.kind === 'rubber')) {
      cylUV(g, o.uvAxis, o.tile || this.tileDefault || (this.kind === 'metal' ? 0.9 : 0.7), [rand() * 4, rand() * 4], this.kind === 'wood');
    } else if (this.kind === 'wood') planarUV(g, o.tile || this.tileDefault || 0.7, [rand() * 4, rand() * 4]);
    else if (this.kind === 'metal') planarUV(g, o.tile || 0.9, [rand() * 4, rand() * 4]);
    else if (this.kind === 'rubber') planarUV(g, o.tile || 0.3, [rand() * 4, rand() * 4]);
    else if (this.kind === 'paint') plainUV(g, [rand(), rand()]);
    // transform
    if (o.q) _q.copy(o.q); else { const r = o.r || [0, 0, 0]; _q.setFromEuler(_e.set(r[0], r[1], r[2], 'XYZ')); }
    const p = o.p || [0, 0, 0];
    _m4.compose(_v.set(p[0], p[1], p[2]), _q, _one);
    if (this.kit.xf) _m4.premultiply(this.kit.xf);
    g.applyMatrix4(_m4);
    // vertex colours
    const base = new THREE.Color(o.c === undefined ? 0xffffff : o.c);
    const vr = o.v === undefined ? (this.kind === 'wood' ? 0.1 : 0.04) : o.v;
    base.multiplyScalar(1 + (rand() - 0.5) * 2 * vr);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const gs = this.grime ? (o.grime === undefined ? 1 : o.grime) : 0;
    const tmp = new THREE.Color();
    const nrm = g.attributes.normal;
    const wear = o.wear ? { paint: new THREE.Color(o.wear.paint).multiplyScalar(this.kind === 'wood' ? 1.7 : 1), bare: new THREE.Color(o.wear.bare), amt: o.wear.amt ?? 0.5 } : null;
    const mud = new Float32Array(pos.count);
    const seedOff = rand() * 50;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let t = Math.min(1, Math.max(0, (y - this.kit.groundY) / 0.45));
      t = t * t * (3 - 2 * t);
      if (wear) {
        // wear mask: bevel/edge (normal off the dominant axis) + noise chips + lower-edge rub
        const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
        const edge = 1 - Math.max(ax, ay, az);
        const n = vnoise(x * 38 + seedOff, y * 38, z * 38) * 0.6 + vnoise(x * 9 + seedOff, y * 9, z * 9) * 0.4;
        const m = Math.min(1, Math.max(0, edge * 2.6 + (n - 0.5) * 1.8 * wear.amt + (wear.amt - 0.35)));
        const ms = m * m * (3 - 2 * m);
        tmp.copy(wear.paint).lerp(wear.bare, ms);
        tmp.multiplyScalar(1 + (rand() - 0.5) * 0.08);
      } else {
        tmp.copy(base);
        tmp.multiplyScalar(1 + (rand() - 0.5) * 0.08);
      }
      if (o.colorFn) { const cc = o.colorFn(i, x, y, z, uv0[i * 2], uv0[i * 2 + 1]); if (cc) tmp.copy(cc).multiplyScalar(this.kind === 'wood' ? 1.5 : 1); }
      tmp.multiplyScalar(1 - gs * 0.28 * (1 - t));
      if (gs) tmp.lerp(DIRT, gs * (1 - t) * 0.45);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      // mud mask for setMudCoat(): rises from the ground, or from the tyre tread on wheels
      let w = 0;
      if (this.mud === 'height') w = (1 - t) * (0.55 + 0.45 * vnoise(x * 14, y * 14, z * 14));
      else if (this.mud === 'radial') {
        const r = Math.hypot(y, z) / (this.mudR || 0.25);
        w = Math.min(1, Math.max(0, (r - 0.45) * 2)) * (0.45 + 0.55 * vnoise(x * 20, y * 20, z * 20));
      }
      mud[i] = w;
    }
    g.setAttribute('mud', new THREE.BufferAttribute(mud, 1));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!Number.isFinite(pos.getX(0) + pos.getY(0) + pos.getZ(0) + pos.getX(pos.count - 1))) {
      console.warn('[vehicles] dropped NaN geometry', geo.type, this.kind, new Error().stack.split('\n')[3]);
      return this;
    }
    this.list.push(g);
    return this;
  }

  // ---- primitive shortcuts ----
  box(size, p, o = {}) { return this.add(new THREE.BoxGeometry(size[0], size[1], size[2]), { ...o, p }); }

  cyl(r, h, p, o = {}) {
    const g = new THREE.CylinderGeometry(r, o.r2 === undefined ? r : o.r2, h, o.seg || 10, 1, !!o.open);
    if (o.axis === 'x') g.rotateZ(Math.PI / 2); else if (o.axis === 'z') g.rotateX(Math.PI / 2);
    return this.add(g, { uvAxis: o.axis === 'x' ? 'x' : o.axis === 'z' ? 'z' : 'y', ...o, p });
  }

  sph(r, p, o = {}) { return this.add(new THREE.SphereGeometry(r, o.seg || 8, o.seg ? Math.ceil(o.seg / 2) : 6), { ...o, p }); }

  tor(R, t, p, o = {}) { return this.add(new THREE.TorusGeometry(R, t, o.rseg || 6, o.seg || 20, o.arc || Math.PI * 2), { ...o, p }); }

  /** box beam between two points (cross-section w x h; h defaults to w) */
  bar(a, b, w, h, o = {}) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(Z, d.clone().normalize());
    const m = A.clone().add(B).multiplyScalar(0.5);
    return this.add(new THREE.BoxGeometry(w, h === undefined ? w : h, len), { ...o, p: [m.x, m.y, m.z], q });
  }

  /** cylinder rod between two points */
  rod(a, b, r, o = {}) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(Y, d.clone().normalize());
    const m = A.clone().add(B).multiplyScalar(0.5);
    return this.add(new THREE.CylinderGeometry(r, o.r2 ?? r, len, o.seg || 6, 1), { uvAxis: 'y', ...o, p: [m.x, m.y, m.z], q });
  }

  tube(points, r, o = {}) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), !!o.closed, 'catmullrom', 0.3);
    const g = new THREE.TubeGeometry(curve, o.segs || points.length * 6, r, o.rseg || 4, !!o.closed);
    const uv = g.attributes.uv, len = curve.getLength() * (o.uvScale || 28);
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len);
    return this.add(g, o);
  }

  extrude(shape, depth, p, o = {}) {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: o.curve || 8 });
    g.translate(0, 0, -depth / 2);
    return this.add(g, { ...o, p });
  }

  lathe(pts, p, o = {}) {
    return this.add(new THREE.LatheGeometry(pts.map((q) => new THREE.Vector2(q[0], q[1])), o.seg || 20), { uvAxis: 'y', ...o, p });
  }

  /** corrugated sheet: width w across X, length d along Z, ridges run along Z */
  corr(w, d, p, o = {}) {
    const pitch = o.pitch || 0.09, amp = o.amp || 0.012, th = 0.0025, n = Math.max(2, Math.round(w / pitch));
    const top = [], bot = [];
    const steps = n * 4;
    for (let i = 0; i <= steps; i++) {
      const x = -w / 2 + (w * i) / steps, y = Math.sin((i / 4) * Math.PI * 2) * amp;
      top.push(new THREE.Vector2(x, y + th)); bot.push(new THREE.Vector2(x, y - th));
    }
    const sh = new THREE.Shape([...top, ...bot.reverse()]);
    return this.extrude(sh, d, p, o);
  }

  /** hand-painted decal quad, facing +Z by default. cell: DECAL.* */
  decal(cell, p, w, h, o = {}) {
    return this.add(new THREE.PlaneGeometry(w, h), { grime: 0, v: 0, ...o, cell, p });
  }

  rivets(a, b, n, r = 0.008, o = {}) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      this.sph(r, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], { seg: 4, c: 0x6b5545, v: 0.2, ...o });
    }
  }

  nail(p, axis = 'y', o = {}) { return this.cyl(0.0075, 0.005, p, { seg: 5, axis, c: 0x4a4038, v: 0.2, ...o }); }

  /** rope wrapped around an axis-aligned pole/box: lash([cx,cy,cz], 'x', radius, width, turns) */
  lash(c, axis, radius, width, turns = 5, o = {}) {
    const pts = [], n = Math.ceil(turns * 8);
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = t * turns * Math.PI * 2, s = (t - 0.5) * width;
      const u = Math.cos(a) * radius, w = Math.sin(a) * radius;
      if (axis === 'x') pts.push([c[0] + s, c[1] + u, c[2] + w]);
      else if (axis === 'y') pts.push([c[0] + u, c[1] + s, c[2] + w]);
      else pts.push([c[0] + u, c[1] + w, c[2] + s]);
    }
    const { r, ...rest } = o;
    return this.tube(pts, r || 0.0085, { rseg: 4, segs: n * 2, c: 0xffffff, grime: 0.3, ...rest });
  }

  /** silver duct-tape patch (thin box) */
  tape(p, size, o = {}) { return this.box(size, p, { c: 0x9fa2a0, v: 0.06, grime: 0.6, ...o }); }

  merged() {
    if (!this.list.length) return null;
    const g = mergeGeometries(this.list, false);
    g.computeBoundingSphere();
    return g;
  }
}

export class Kit {
  constructor(seed, materials) {
    this.rand = rng(seed);
    this.groundY = -0.25;
    this.xf = null;
    this.mats = getMaterials(materials);
    this.wood = new Collector('wood', this);
    this.metal = new Collector('metal', this);
    this.paint = new Collector('paint', this);
    this.rope = new Collector('rope', this);
  }

  /** un-grimed collector of any kind for moving parts */
  pieceOf(kind, mud = 'none') { const c = new Collector(kind, this, false); c.mud = mud; return c; }

  /** run fn with every baked primitive transformed by (pos, euler rot) — for tilted sub-assemblies */
  withXf(pos, rot, fn) {
    const prev = this.xf;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'XYZ')), new THREE.Vector3(1, 1, 1));
    this.xf = prev ? prev.clone().multiply(m) : m;
    fn();
    this.xf = prev;
  }

  /** new un-grimed paint collector for moving parts / wheels */
  piece(grime = false) { const c = new Collector('paint', this, grime); c.mud = 'none'; return c; }

  meshOf(collector, material, name) {
    const g = collector.merged();
    if (!g) return null;
    const m = new THREE.Mesh(g, material);
    m.name = name; m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  /** static meshes (4 draw calls max) */
  staticMeshes() {
    return [
      this.meshOf(this.wood, this.mats.wood, 'wood'),
      this.meshOf(this.metal, this.mats.metal, 'metal'),
      this.meshOf(this.paint, this.mats.paint, 'paint'),
      this.meshOf(this.rope, this.mats.rope, 'rope'),
    ].filter(Boolean);
  }
}
