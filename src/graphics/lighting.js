import * as THREE from 'three';
import { createSky } from './sky.js';
import { G, installFog, tickTime } from './shared.js';

const C = (h) => new THREE.Color(h);
const deg = Math.PI / 180;

/** Time-of-day presets. Colours are sRGB hex (converted to linear on construction). */
export const TIME_PRESETS = {
  day: {
    elev: 52, azim: 140, sunColor: C(0xfff0d8), sunInt: 3.4,
    hemiSky: C(0xa5c6ea), hemiGround: C(0x6e5e48), hemiInt: 0.95,
    zenith: C(0x3f78b8), horizon: C(0xb6cad6), ground: C(0x77746a), haze: C(0xd2d8d6),
    fog: C(0xaebfc8), fogDensity: 0.0032, fogSun: C(0x9a8a60), exposure: 0.95, env: 0.75,
    cover: 0.5, cloudLit: C(0xffffff), cloudShade: C(0x7f8da0), glow: 0.35, disc: 28, stars: 0, night: 0,
  },
  golden: {
    elev: 11, azim: 108, sunColor: C(0xffa850), sunInt: 3.6,
    hemiSky: C(0x8aa6cc), hemiGround: C(0x5e4636), hemiInt: 0.6,
    zenith: C(0x4a6c9e), horizon: C(0xe9b58c), ground: C(0x7a6558), haze: C(0xf4c08e),
    fog: C(0xd3b093), fogDensity: 0.0042, fogSun: C(0xc88a4a), exposure: 1.0, env: 0.5,
    cover: 0.42, cloudLit: C(0xffc890), cloudShade: C(0x6a6f8c), glow: 0.7, disc: 40, stars: 0, night: 0,
  },
  dusk: {
    elev: 0.8, azim: 95, sunColor: C(0xff6a38), sunInt: 1.5,
    hemiSky: C(0x4d5d8e), hemiGround: C(0x2c2530), hemiInt: 0.45,
    zenith: C(0x1c2a58), horizon: C(0xd6805f), ground: C(0x38303a), haze: C(0xc8688a),
    fog: C(0x8a6a78), fogDensity: 0.0052, fogSun: C(0xd05a30), exposure: 1.15, env: 0.3,
    cover: 0.35, cloudLit: C(0xff8a68), cloudShade: C(0x3a3e66), glow: 0.9, disc: 30, stars: 0.25, night: 0.55,
  },
  night: {
    elev: 36, azim: 205, sunColor: C(0x9db6ff), sunInt: 1.15,
    hemiSky: C(0x2c4474), hemiGround: C(0x141824), hemiInt: 0.85,
    zenith: C(0x050a18), horizon: C(0x16233c), ground: C(0x0a0e18), haze: C(0x1a2a46),
    fog: C(0x0d1624), fogDensity: 0.0062, fogSun: C(0x1a2442), exposure: 1.55, env: 0.4,
    cover: 0.3, cloudLit: C(0x6a7aa8), cloudShade: C(0x0c1224), glow: 0.5, disc: 3.5, stars: 1, night: 1,
  },
};
const NUM_KEYS = ['elev', 'azim', 'sunInt', 'hemiInt', 'fogDensity', 'exposure', 'env', 'cover', 'glow', 'disc', 'stars', 'night'];
const COL_KEYS = ['sunColor', 'hemiSky', 'hemiGround', 'zenith', 'horizon', 'ground', 'haze', 'fog', 'fogSun', 'cloudLit', 'cloudShade'];
const clonePreset = (p) => { const o = {}; for (const k of NUM_KEYS) o[k] = p[k]; for (const k of COL_KEYS) o[k] = p[k].clone(); return o; };

/**
 * Sun/moon directional light (single shadow caster, texel-snapped frustum following the camera),
 * hemisphere light, sky dome, height+distance fog, PMREM environment.
 */
export function setupLighting(scene, renderer, opts = {}) {
  installFog();
  const shadowSize = opts.shadowMapSize ?? 2048;
  let shadowExtent = opts.shadowExtent ?? 42;

  const sky = createSky();
  sky.mesh.scale.setScalar(1);
  scene.add(sky.mesh);

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.name = 'Sun';
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 2.5;
  sun.shadow.blurSamples = 8;
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  hemi.name = 'SkyHemi';
  scene.add(hemi);

  const fog = new THREE.FogExp2(0xaebfc8, 0.003);
  scene.fog = fog;

  // --- PMREM
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(sky.mesh.geometry, sky.material));
  let envRT = null;
  const bakeEnv = () => {
    sky.uniforms.uDiscScale.value = 0;
    const oldTM = renderer.toneMapping;
    const rt = pmrem.fromScene(envScene, 0, 0.1, 100, { size: 128 });
    renderer.toneMapping = oldTM;
    sky.uniforms.uDiscScale.value = 1;
    if (envRT) envRT.dispose();
    envRT = rt;
    scene.environment = rt.texture;
  };

  const cur = clonePreset(TIME_PRESETS.day);
  let target = cur, name = 'day', settled = true, envDirty = true;
  const dir = new THREE.Vector3(), tmpC = new THREE.Color();

  const apply = () => {
    const el = cur.elev * deg, az = cur.azim * deg;
    dir.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();
    G.gfxSunDir.value.copy(dir);
    sky.uniforms.uSunDir.value.copy(dir);
    sun.color.copy(cur.sunColor);
    sun.intensity = cur.sunInt * (cur.elev < 2 ? Math.max(0.15, (cur.elev + 2) / 4) : 1);
    hemi.color.copy(cur.hemiSky); hemi.groundColor.copy(cur.hemiGround); hemi.intensity = cur.hemiInt;
    const u = sky.uniforms;
    u.uZenith.value.copy(cur.zenith); u.uHorizon.value.copy(cur.horizon); u.uGround.value.copy(cur.ground);
    u.uHaze.value.copy(cur.haze); u.uSunColor.value.copy(cur.sunColor); u.uGlow.value = cur.glow; u.uDisc.value = cur.disc;
    u.uCover.value = cur.cover; u.uCloudLit.value.copy(cur.cloudLit); u.uCloudShade.value.copy(cur.cloudShade); u.uStars.value = cur.stars;
    u.uDiscSize.value = cur.night > 0.9 ? 0.9996 : 0.99986;
    fog.color.copy(cur.horizon).lerp(cur.haze, 0.55); fog.density = cur.fogDensity;
    G.gfxSunFog.value.copy(cur.fogSun);
    G.gfxNight.value = cur.night;
    renderer.toneMappingExposure = cur.exposure;
    scene.environmentIntensity = cur.env;
  };

  const lerpTo = (k) => {
    let delta = 0;
    for (const key of NUM_KEYS) { const d = target[key] - cur[key]; cur[key] += d * k; delta += Math.abs(d); }
    for (const key of COL_KEYS) { tmpC.copy(target[key]); delta += Math.abs(tmpC.r - cur[key].r) + Math.abs(tmpC.g - cur[key].g) + Math.abs(tmpC.b - cur[key].b); cur[key].lerp(target[key], k); }
    return delta;
  };

  function setTime(n, instant = false) {
    const p = TIME_PRESETS[n];
    if (!p) { console.warn('[gfx] unknown time preset', n); return; }
    name = n; target = p; settled = false;
    if (instant) { lerpTo(1); apply(); bakeEnv(); settled = true; envDirty = false; }
  }
  setTime('day', true);

  // --- shadow frustum following the camera, snapped to the shadow texel grid
  const fwd = new THREE.Vector3(), tgt = new THREE.Vector3(), bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3();
  const lm = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
  function fitShadow(camera) {
    const ext = shadowExtent, cam = sun.shadow.camera;
    camera.getWorldDirection(fwd);
    tgt.copy(camera.position).addScaledVector(fwd, ext * 0.55);
    bz.copy(dir);
    lm.lookAt(bz, new THREE.Vector3(), UP);
    bx.setFromMatrixColumn(lm, 0); by.setFromMatrixColumn(lm, 1);
    const texel = (2 * ext) / sun.shadow.mapSize.x;
    const px = tgt.dot(bx), py = tgt.dot(by);
    tgt.addScaledVector(bx, Math.round(px / texel) * texel - px).addScaledVector(by, Math.round(py / texel) * texel - py);
    sun.target.position.copy(tgt);
    sun.position.copy(tgt).addScaledVector(dir, ext * 4);
    if (cam.right !== ext) {
      cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext; cam.near = 1; cam.far = ext * 9; cam.updateProjectionMatrix();
    }
    sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
  }

  function update(dt, camera) {
    tickTime();
    sky.uniforms.uTime.value = G.gfxTime.value;
    if (!settled) {
      const d = lerpTo(1 - Math.exp(-Math.min(dt, 0.1) * 1.6));
      apply();
      if (d < 0.004) { settled = true; envDirty = true; lerpTo(1); apply(); }
    } else if (envDirty) { bakeEnv(); envDirty = false; }
    if (camera) {
      camera.updateMatrixWorld();
      G.gfxFogH.value.x = camera.position.y - 2.5;
      fitShadow(camera);
    }
  }

  return {
    sun, hemi, sky: sky.mesh, skyUniforms: sky.uniforms, fog,
    setTime, update,
    get time() { return name; },
    presets: TIME_PRESETS,
    /** metres half-extent of the sun shadow box (smaller = sharper). */
    setShadowExtent(m) { shadowExtent = m; },
    setShadowMapSize(n) { sun.shadow.mapSize.set(n, n); sun.shadow.map?.dispose(); sun.shadow.map = null; },
    /** direction TOWARD the sun/moon (world) */
    get sunDirection() { return dir; },
    /** 0 day .. 1 night, smoothed */
    get night() { return G.gfxNight.value; },
    dispose() { envRT?.dispose(); pmrem.dispose(); },
  };
}
