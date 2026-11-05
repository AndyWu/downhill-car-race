// TEMP dev preview with the real graphics materials + lighting (village fixer scratch; delete before finishing)
import * as THREE from 'three';
import * as gfx from '../graphics/index.js';
import { createWorld } from './index.js';
const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const renderer = gfx.createRenderer(canvas, { preserveDrawingBuffer: true, dynamicResolution: false });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight, false);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 4000); scene.add(camera);
const materials = gfx.createMaterials(renderer, { quality: q.get('q') || 'low' });
const lighting = gfx.setupLighting(scene, renderer);
lighting.setTime(q.get('time') || 'day', true); lighting.setWeather(q.get('weather') || 'clear', true);
const world = await createWorld(scene, { seed: 1, trackId: q.get('track') || 'village', renderer, materials });
window.__world = world; world.setWeather(q.get('weather') || 'clear');
const frame = (cam) => { world.update(0.016, cam); lighting.update(0.016, cam, 8); renderer.render(scene, cam); };
window.__shoot = (ss, ch = {}, dd = 0, hh = 1.2, lk = 30, pitch = 2, dyaw = 0) => {
  const f2 = world.track.sampleAt(ss, ch);
  camera.position.copy(f2.position).addScaledVector(f2.right, dd); camera.position.y = Math.max(f2.position.y + hh, world.heightAt(camera.position.x, camera.position.z) + hh);
  const t2 = world.track.sampleAt(ss + lk, ch).position.clone(); t2.addScaledVector(f2.right, dyaw); t2.y = camera.position.y - pitch; camera.lookAt(t2);
  for (let i = 0; i < 3; i++) frame(camera);
  window.__info = JSON.parse(JSON.stringify(renderer.info.render));
};
window.__ready = true;
