// Salvage building blocks shared by the truck models: pallets, doors, hems, crates, tin sheets.
import * as THREE from 'three';

/** Wood pallet. (cx,cy,cz) = centre of the TOP surface of the deck boards; w across X, d along Z; rx tilts about X. */
export function pallet(k, cx, cy, cz, w, d, o = {}) {
  const rand = k.rand, nb = o.boards || 7, th = 0.02;
  const bw = Math.min(o.bw || 0.1, (d * 0.92) / nb);
  const gap = (d - nb * bw) / Math.max(1, nb - 1);
  const tone = o.tone ?? 0xd6c29a;
  k.withXf([cx, cy, cz], [o.rx || 0, o.ry || 0, o.rz || 0], () => {
    const sx = [-w / 2 + 0.05, 0, w / 2 - 0.05];
    for (let i = 0; i < nb; i++) {
      if (o.missing && o.missing.includes(i)) continue;
      const z = -d / 2 + bw / 2 + i * (bw + gap);
      const short = rand() < 0.2 ? rand() * 0.1 : 0;
      const len = w - short;
      const c = new THREE.Color(tone).multiplyScalar(0.78 + rand() * 0.3);
      k.wood.box([len, th, bw], [(rand() - 0.5) * 0.02 - short / 2 * (rand() < 0.5 ? 1 : -1), -th / 2 + (rand() - 0.5) * 0.004, z], { r: [0, (rand() - 0.5) * 0.03, 0], c });
      for (const x of sx) for (const dz of [-0.28, 0.28]) k.metal.nail([x, 0.003, z + dz * bw], 'y');
    }
    for (const x of sx) k.wood.box([0.045, 0.085, d], [x, -th - 0.0425, 0], { c: new THREE.Color(tone).multiplyScalar(0.82) });
    for (const z of [-d / 2 + 0.05, 0, d / 2 - 0.05]) k.wood.box([w, 0.018, 0.1], [0, -th - 0.094, z], { c: new THREE.Color(tone).multiplyScalar(0.75) });
  });
}

/** Rolled hem / pipe along an axis between two points */
export function pipe(k, a, b, r, c = 0x8a8a84, bucket = 'metal') { k[bucket].rod(a, b, r, { seg: 7, c }); }

/** triangular flat metal skirt in the YZ plane at x, vertices [[z,y],...] */
export function skirt(k, x, pts, c = 0xffffff, bucket = 'metal') {
  const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false });
  g.translate(0, 0, -0.002);
  g.rotateY(-Math.PI / 2); // shape x -> world z, shape y -> world y, thickness along x
  k[bucket].add(g, { p: [x, 0, 0], c });
}

/** wooden slat crate (open slatted box). centre p, size [w,h,d], slats along each face with gaps */
export function slatCrate(k, p, size, o = {}) {
  const [w, h, d] = size, rand = k.rand;
  const th = 0.014, ns = o.slats || 4, tone = o.tone ?? 0xd4bd90;
  const col = () => new THREE.Color(tone).multiplyScalar(0.78 + rand() * 0.3);
  const sh = h / ns;
  // end/side slats
  for (let i = 0; i < ns; i++) {
    const y = p[1] - h / 2 + sh * (i + 0.5);
    const sl = sh * 0.8;
    for (const sz of [-1, 1]) k.wood.box([w, sl, th], [p[0], y, p[2] + sz * (d / 2 - th / 2)], { c: col(), r: [0, 0, (rand() - 0.5) * 0.03] });
    for (const sx of [-1, 1]) k.wood.box([th, sl, d - th * 2], [p[0] + sx * (w / 2 - th / 2), y, p[2]], { c: col() });
  }
  // corner posts and bottom slats
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.wood.box([0.035, h, 0.035], [p[0] + sx * (w / 2 - 0.0175), p[1], p[2] + sz * (d / 2 - 0.0175)], { c: col() });
  const nb = 4;
  for (let i = 0; i < nb; i++) k.wood.box([w - 0.03, th, (d / nb) * 0.8], [p[0], p[1] - h / 2 + th / 2, p[2] - d / 2 + (d / nb) * (i + 0.5)], { c: col() });
  // nails on the posts
  for (let i = 0; i < ns; i++) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.metal.nail([p[0] + sx * (w / 2 - 0.0175), p[1] - h / 2 + sh * (i + 0.5), p[2] + sz * (d / 2 + 0.0)], 'z');
  }
}

/** spare wheel mounted upright facing the rear (axle along Z). kind 'tyre' = fat black tyre + painted hub, 'bike' = spoked */
export function spareWheel(k, p, R, kind = 'tyre', hub = 0xc8352a) {
  if (kind === 'tyre') {
    k.paint.tor(R - 0.07, 0.07, p, { seg: 20, rseg: 8, c: 0x1c1c1a, grime: 0.6, tile: 1 });
    k.paint.cyl(R - 0.1, 0.06, p, { axis: 'z', seg: 18, c: hub });
    k.paint.cyl(0.04, 0.09, p, { axis: 'z', seg: 8, c: 0x9a9a92 });
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; k.paint.cyl(0.01, 0.075, [p[0] + Math.cos(a) * 0.09, p[1] + Math.sin(a) * 0.09, p[2]], { axis: 'z', seg: 5, c: 0x555048 }); }
  } else {
    k.paint.tor(R - 0.02, 0.02, p, { seg: 28, rseg: 6, c: 0x161616 });
    k.paint.tor(R - 0.045, 0.006, p, { seg: 28, rseg: 4, c: 0xc4c4be });
    for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; k.paint.rod([p[0], p[1], p[2]], [p[0] + Math.cos(a) * (R - 0.045), p[1] + Math.sin(a) * (R - 0.045), p[2]], 0.003, { seg: 3, c: 0xd0d0cc }); }
    k.paint.cyl(0.03, 0.05, p, { axis: 'z', seg: 8, c: 0xb8b8b0 });
  }
  k.metal.rod([p[0], p[1] - R * 0.5, p[2] - 0.12], [p[0], p[1], p[2] - 0.04], 0.015, { seg: 6, c: 0x6a625a });
}
