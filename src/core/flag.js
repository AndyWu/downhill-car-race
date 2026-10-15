// Speed flag: a pole with a faded cloth whose travelling-wave flutter encodes apparent wind speed.
// Limp at 0 m/s, taut and rippling fast at 15+ m/s. Pole is at local origin, cloth streams towards +Z (backwards).
import * as THREE from 'three';

const NX = 16, NY = 10;
const L = 0.52, Hh = 0.24, POLE = 0.75;

function makeTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const n = 4, cw = 256 / 8, ch = 128 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < 8; x++) {
    g.fillStyle = (x + y) % 2 ? '#b8553f' : '#e6d9b5';
    g.fillRect(x * cw, y * ch, cw, ch);
  }
  g.fillStyle = 'rgba(40,30,20,0.0)';
  g.font = 'bold 84px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(30,40,70,0.82)'; g.fillText('7', 128, 70);
  // fade / wear
  const img = g.getImageData(0, 0, 256, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const k = 0.78 + Math.random() * 0.1;
    img.data[i] = img.data[i] * k + 40 * (1 - k); img.data[i + 1] = img.data[i + 1] * k + 38 * (1 - k); img.data[i + 2] = img.data[i + 2] * k + 34 * (1 - k);
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(60,40,20,0.35)'; g.lineWidth = 6; g.strokeRect(0, 0, 256, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function createFlag({ material } = {}) {
  const group = new THREE.Group(); group.name = 'speedFlag';
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, POLE, 8), new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 0.8 }));
  pole.position.y = POLE / 2; group.add(pole);
  const geo = new THREE.PlaneGeometry(1, 1, NX, NY);
  const uv = geo.attributes.uv; const pos = geo.attributes.position;
  const base = new Float32Array(pos.count * 2); // u (0 at pole..1 tip), v (0 top..1 bottom)
  for (let i = 0; i < pos.count; i++) { base[i * 2] = uv.getX(i); base[i * 2 + 1] = 1 - uv.getY(i); }
  const mat = material || new THREE.MeshStandardMaterial({ map: makeTexture(), side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });
  const cloth = new THREE.Mesh(geo, mat); cloth.frustumCulled = false;
  group.add(cloth);
  group.rotation.y = 0.85; // sweep the tail sideways so a cockpit viewer sees the cloth, not just its edge
  let t = 0, wApp = 0, phase = 0;

  function update(dt, speedMps = 0, windVec) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    const wx = windVec ? windVec.x || 0 : 0, wz = windVec ? windVec.z || 0 : 0;
    const apparent = Math.hypot(speedMps, wx, wz * 0.5);
    wApp += (apparent - wApp) * Math.min(1, dt * 5);
    const w = Math.min(1, Math.max(0, wApp / 15));        // 0 limp .. 1 taut
    const pw = w * w * (3 - 2 * w);
    phase += dt * (1.5 + wApp * 3.2);                     // travel rate grows with wind
    t += dt;
    const k = 3.5 + 12 * pw;                              // spatial frequency
    const amp = (0.012 + 0.07 * pw) * (1 - 0.35 * pw * pw);
    const len = L * (0.55 + 0.45 * pw);                   // limp cloth bunches
    const side = Math.max(-1, Math.min(1, wx / 10)) * 0.05 * pw;
    for (let i = 0; i < pos.count; i++) {
      const u = base[i * 2], v = base[i * 2 + 1];
      const droop = (1 - pw) * 0.9 * u * u * len + (1 - pw) * v * 0.0;
      const ud = Math.min(droop, len * 0.95);
      const z = Math.sqrt(Math.max(len * len * u * u - ud * ud * 0, 0)) * (1 - 0.8 * (1 - pw) * u * 0.5);
      const wave = Math.sin(k * u - phase + v * 1.7) * amp * Math.pow(u, 1.15)
        + Math.sin(k * 2.1 * u - phase * 1.7 + v * 3.1) * amp * 0.28 * u * pw
        + Math.sin(t * 25 + u * 9 + v * 5) * 0.006 * u * pw * pw; // tip flutter
      const y = POLE - v * Hh - ud * 1.0 + (pw * 0.01) * Math.sin(phase * 0.7 + u * 4) * u;
      pos.setXYZ(i, wave + side * u, y, z + 0.012);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }
  update(0.016, 0);
  return { mesh: group, update, cloth };
}
