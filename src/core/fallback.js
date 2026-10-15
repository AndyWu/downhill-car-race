// Minimal stand-ins so the app runs when other agents' modules are missing.
import * as THREE from 'three';

export const FALLBACK_TRUCKS = [
  { id: 'fb0', name: 'Plain Box', description: 'Fallback', mass: 95, dragCoef: 0.8, frontalArea: 0.55, rollingResist: 0.012, gripMul: 1, steerLock: 0.5, steerRate: 3, paddleEfficiency: 1, brakeForce: 400, suspension: { stiffness: 0, damping: 0, travel: 0.22 }, wheelRadius: 0.28, wheelBase: 1.7, trackWidth: 0.95, color: 0xb5482f },
  { id: 'fb1', name: 'Heavy Box', description: 'Fallback', mass: 120, dragCoef: 1.0, frontalArea: 0.7, rollingResist: 0.015, gripMul: 1.05, steerLock: 0.45, steerRate: 2.6, paddleEfficiency: 0.9, brakeForce: 450, suspension: { stiffness: 0, damping: 0, travel: 0.22 }, wheelRadius: 0.3, wheelBase: 1.8, trackWidth: 1.0, color: 0x3f6aa0 },
  { id: 'fb2', name: 'Slim Box', description: 'Fallback', mass: 80, dragCoef: 0.65, frontalArea: 0.45, rollingResist: 0.01, gripMul: 0.9, steerLock: 0.55, steerRate: 3.5, paddleEfficiency: 1.1, brakeForce: 350, suspension: { stiffness: 0, damping: 0, travel: 0.22 }, wheelRadius: 0.26, wheelBase: 1.6, trackWidth: 0.9, color: 0x5a8a3a },
];

const SLOPE = 0.1;

export function createFallbackWorld(scene) {
  const LEN = 3218;
  const W = 260;
  const geo = new THREE.PlaneGeometry(W, LEN + 600, 1, 1); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const zz = pos.getZ(i) - LEN / 2; pos.setXYZ(i, pos.getX(i), SLOPE * zz, zz); }
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d'); g.fillStyle = '#6e5a3c'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${30 + Math.random() * 60},${25 + Math.random() * 40},15,0.35)`; g.fillRect(Math.random() * 128, Math.random() * 128, 3, 3); }
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(W / 6, (LEN + 600) / 6); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  scene.add(mesh);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 1.6, 0.3), new THREE.MeshStandardMaterial({ color: 0xcccccc }), 140);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < 70; i++) for (let sd = 0; sd < 2; sd++) {
    const z = -i * 50; mtx.makeTranslation(sd ? 4 : -4, SLOPE * z + 0.8, z); posts.setMatrixAt(i * 2 + sd, mtx);
  }
  scene.add(posts);

  const hv = new THREE.Vector3();
  const track = {
    length: LEN,
    sampleAt(s) {
      return { position: new THREE.Vector3(0, -SLOPE * s, -s), tangent: new THREE.Vector3(0, -SLOPE, -1).normalize(), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), width: 6, camber: 0 };
    },
    project(p) { return { s: -p.z, lateral: p.x }; },
  };
  return {
    isFallback: true, track, hazards: [],
    heightAt: (x, z) => SLOPE * z,
    normalAt: () => hv.set(0, 1, -SLOPE).normalize().clone(),
    surfaceAt: (x) => (Math.abs(x) > 5 ? { type: 'grass', friction: 0.7, drag: 2, bump: 0.05 } : { type: 'dirt', friction: 0.85, drag: 0, bump: 0.05 }),
    startTransform(slot) {
      const row = Math.floor(slot / 2), x = (slot % 2 ? 1 : -1) * 1.4, z = -3 + row * 4;
      const up = new THREE.Vector3(0, 1, -SLOPE).normalize();
      const f = new THREE.Vector3(0, -SLOPE, -1).normalize();
      const right = new THREE.Vector3().crossVectors(f, up).normalize();
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, f.clone().negate()));
      return { position: new THREE.Vector3(x, SLOPE * z + 0.4, z), quaternion: q };
    },
    update() {},
    dispose() { scene.remove(mesh); scene.remove(posts); },
  };
}

export function buildFallbackTruck(spec) {
  const group = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
  const color = spec.color || 0xb5482f;
  const add = (geo, m, x, y, z, parent = group) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); parent.add(me); return me; };
  const L = spec.wheelBase + 1.0;
  add(new THREE.BoxGeometry(spec.trackWidth, 0.25, L), mat(color), 0, 0.02, 0);
  add(new THREE.BoxGeometry(spec.trackWidth * 0.95, 0.22, L * 0.38), mat(color), 0, 0.2, -L * 0.3); // hood
  add(new THREE.BoxGeometry(spec.trackWidth, 0.35, 0.08), mat(0x3a2a1a), 0, 0.3, L * 0.45);       // seat back
  const wheels = [];
  const pos = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [sx, sz] of pos) {
    const w = new THREE.Object3D(); w.position.set(sx * spec.trackWidth / 2, 0, sz * spec.wheelBase / 2);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(spec.wheelRadius, spec.wheelRadius, 0.12, 14), mat(0x222222));
    cyl.rotation.z = Math.PI / 2; w.add(cyl);
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, spec.wheelRadius * 1.6), mat(0xd0d0d0)); w.add(spoke);
    group.add(w); wheels.push(w);
  }
  const driverEye = new THREE.Object3D(); driverEye.position.set(0, 0.62, 0.3); group.add(driverEye);
  const steeringWheel = new THREE.Object3D(); steeringWheel.position.set(0, 0.42, -0.2); group.add(steeringWheel);
  const tor = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 20), mat(0x2a2018)); tor.rotation.x = -0.9; steeringWheel.add(tor);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.02), mat(0x2a2018)); bar.rotation.x = -0.9; steeringWheel.add(bar);
  const mkPedal = (x) => { const p = new THREE.Object3D(); p.position.set(x, 0.14, -0.2); group.add(p); add(new THREE.BoxGeometry(0.14, 0.02, 0.3), mat(0x555555), 0, 0, -0.15, p); return p; };
  const paddleL = mkPedal(-0.22), paddleR = mkPedal(0.22);
  const mkLever = (x, c) => { const p = new THREE.Object3D(); p.position.set(x, 0.1, 0.0); group.add(p); add(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 6), mat(c), 0, 0.15, 0, p); add(new THREE.SphereGeometry(0.03, 8, 8), mat(0xcc3333), 0, 0.3, 0, p); return p; };
  const handbrakeLever = mkLever(-0.38, 0x888888), gearLever = mkLever(0.38, 0x777777);
  const headlight = new THREE.Object3D(); headlight.position.set(0, 0.2, -L * 0.5); group.add(headlight);
  add(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffeeaa, emissive: 0x332200 }), 0, 0, 0, headlight);
  const flagMount = new THREE.Object3D(); flagMount.position.set(-0.28, 0.33, -L * 0.3); group.add(flagMount);
  return { group, parts: { steeringWheel, paddleL, paddleR, handbrakeLever, gearLever, headlight, flagMount, wheels, driverEye } };
}
