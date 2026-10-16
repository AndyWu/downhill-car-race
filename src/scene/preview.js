// Standalone preview of the scene module (dev only): /src/scene/preview.html?s=500&d=0&h=1.4&look=60&yaw=0
import * as THREE from 'three';
import { createWorld } from './index.js';
const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9c4d6); scene.fog = new THREE.Fog(0xb9cdd8, 80, 650);
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x6b5a3c, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 2.6); sun.position.set(-120, 160, 60); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.far = 500;
scene.add(sun); scene.add(sun.target);
const world = await createWorld(scene, { seed: Number(q.get('seed') || 1) });
window.__world = world; world.setWeather(q.get('weather') || 'clear');
const cam = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 2500);
const s = Number(q.get('s') || 500), d = Number(q.get('d') || 0), h = Number(q.get('h') || 1.6), look = Number(q.get('look') || 40), yaw = Number(q.get('yaw') || 0);
const f = world.track.sampleAt(s);
cam.position.copy(f.position).addScaledVector(f.right, d).add(new THREE.Vector3(0, h, 0));
cam.position.y = Math.max(cam.position.y, world.heightAt(cam.position.x, cam.position.z) + h);
const tgt = world.track.sampleAt(s + look).position.clone().addScaledVector(f.right, d * 0.5 + Math.tan(yaw) * look); tgt.y = cam.position.y - Number(q.get('pitch') || 2);
cam.lookAt(tgt);
sun.position.copy(f.position).add(new THREE.Vector3(-80, 140, 50)); sun.target.position.copy(f.position);
function frame() { world.update(0.016, cam); renderer.render(scene, cam); }
for (let i = 0; i < 3; i++) frame();
window.__ready = true;
window.__info = renderer.info.render;
