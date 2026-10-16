import * as THREE from 'three';
import { createSky } from './sky.js';
import { G, installFog, tickTime } from './shared.js';
import { getTier } from './quality.js';
import { createWeatherParticles } from './weather.js';

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
    elev: 0.8, azim: 95, sunColor: C(0xff6a38), sunInt: 2.2,
    hemiSky: C(0x6070a0), hemiGround: C(0x3a3038), hemiInt: 0.85,
    zenith: C(0x1c2a58), horizon: C(0xd6805f), ground: C(0x38303a), haze: C(0xc8688a),
    fog: C(0x8a6a78), fogDensity: 0.0052, fogSun: C(0xd05a30), exposure: 1.3, env: 0.45,
    cover: 0.35, cloudLit: C(0xff8a68), cloudShade: C(0x3a3e66), glow: 0.9, disc: 30, stars: 0, night: 0.55,
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

/** Weather presets: modifiers layered over the time-of-day preset (numbers are lerped, so changes fade in ~3 s). */
export const WEATHER = {
  clear: { fog: 1, gray: 0, dark: 0, lift: 0, cover: 0, sun: 1, hemi: 1, exp: 1, wet: 0, rain: 0, snow: 0, snowCover: 0, wind: 0, cool: 0, desat: 0, fogH: 0.045, bolt: 0 },
  fog:   { fog: 7, gray: 0.8, dark: 0.08, lift: 0.4, cover: 0.9, sun: 0.35, hemi: 1.2, exp: 1.08, wet: 0.2, rain: 0, snow: 0, snowCover: 0, wind: 0.05, cool: 0.1, desat: 0.4, fogH: 0.085, bolt: 0 },
  snow:  { fog: 2.4, gray: 0.55, dark: 0, lift: 0.55, cover: 0.92, sun: 0.4, hemi: 1.35, exp: 1.05, wet: 0, rain: 0, snow: 1, snowCover: 0.85, wind: 0.2, cool: 0.8, desat: 0.15, fogH: 0.055, bolt: 0 },
  rain:  { fog: 2.6, gray: 0.7, dark: 0.25, lift: 0, cover: 1, sun: 0.3, hemi: 0.9, exp: 0.97, wet: 1, rain: 1, snow: 0, snowCover: 0, wind: 0.5, cool: 0.2, desat: 0.25, fogH: 0.05, bolt: 0 },
  storm: { fog: 3.2, gray: 0.75, dark: 0.55, lift: 0, cover: 1, sun: 0.18, hemi: 0.7, exp: 0.92, wet: 1, rain: 1, snow: 0, snowCover: 0, wind: 1, cool: 0.25, desat: 0.3, fogH: 0.05, bolt: 1 },
};
const WKEYS = Object.keys(WEATHER.clear);
const WALIAS = { foggy: 'fog', heavyrain: 'rain', 'heavy rain': 'rain', stormy: 'storm', snowy: 'snow', sunny: 'clear' };

/**
 * Sun/moon directional light (single shadow caster, texel-snapped frustum following the camera),
 * hemisphere light, sky dome, height+distance fog, PMREM environment.
 */
export function setupLighting(scene, renderer, opts = {}) {
  installFog();
  const tier = getTier();
  const shadowSize = opts.shadowMapSize ?? tier.shadowMap;
  let shadowExtent = opts.shadowExtent ?? tier.shadowExtent;

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

  // ---- weather state
  const W = { ...WEATHER.clear };            // current (lerped)
  let Wt = WEATHER.clear, wName = 'clear', wDirty = false;
  const particles = createWeatherParticles(scene, tier.name, renderer);
  const partW = { rain: 0, snow: 0, wind: 0, night: 0, color: new THREE.Color(0.7, 0.75, 0.8) };
  const boltCbs = new Set();
  let flash = 0, flashT = -1, nextBolt = 6 + Math.random() * 6, flashWas = false;
  const LUM = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const LIFT = new THREE.Color(0.5, 0.55, 0.62), FLASHC = new THREE.Color(0.55, 0.65, 1.0), WHITE = new THREE.Color(1, 1, 1);
  const wc = new THREE.Color();
  const addC = (c, o, k) => { c.r += o.r * k; c.g += o.g * k; c.b += o.b * k; };
  /** weather-modified copy of a time-of-day colour */
  const wmod = (src, dayness, out) => {
    out.copy(src);
    const l = LUM(src);
    if (W.gray > 0.001) out.lerp(wc.setRGB(l, l, l), W.gray * 0.8);
    if (W.lift > 0.001) out.lerp(wc.copy(LIFT).multiplyScalar(dayness), W.lift);
    if (W.dark > 0.001) out.multiplyScalar(1 - W.dark * 0.45);
    return out;
  };
  const mz = new THREE.Color(), mh = new THREE.Color(), mg = new THREE.Color(), mhz = new THREE.Color(), mcl = new THREE.Color(), mcs = new THREE.Color(), mhs = new THREE.Color(), mhg = new THREE.Color(), mfs = new THREE.Color();

  const apply = () => {
    const el = cur.elev * deg, az = cur.azim * deg;
    dir.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();
    G.gfxSunDir.value.copy(dir);
    sky.uniforms.uSunDir.value.copy(dir);
    const dayness = 1 - cur.night * 0.85;
    wmod(cur.zenith, dayness, mz); wmod(cur.horizon, dayness, mh); wmod(cur.ground, dayness, mg); wmod(cur.haze, dayness, mhz);
    wmod(cur.cloudLit, dayness, mcl); wmod(cur.cloudShade, dayness, mcs); wmod(cur.hemiSky, dayness, mhs); wmod(cur.hemiGround, dayness, mhg); wmod(cur.fogSun, dayness, mfs);
    if (flash > 0.001) { addC(mz, FLASHC, flash * 0.9); addC(mh, FLASHC, flash * 1.1); addC(mhz, FLASHC, flash * 1.0); addC(mcl, FLASHC, flash * 1.4); addC(mcs, FLASHC, flash * 0.5); }
    sun.color.copy(cur.sunColor).lerp(WHITE, W.gray * 0.5);
    if (flash > 0.001) sun.color.lerp(FLASHC, Math.min(1, flash));
    sun.intensity = cur.sunInt * (W.sun + (1 - W.sun) * cur.night * 0.6) * (cur.elev < 2 ? Math.max(0.15, (cur.elev + 2) / 4) : 1) + flash * 7;
    hemi.color.copy(mhs); hemi.groundColor.copy(mhg); hemi.intensity = cur.hemiInt * (W.hemi + (1 - W.hemi) * cur.night * 0.5) + flash * 2.2;
    const u = sky.uniforms;
    u.uZenith.value.copy(mz); u.uHorizon.value.copy(mh); u.uGround.value.copy(mg);
    u.uHaze.value.copy(mhz); u.uSunColor.value.copy(cur.sunColor); u.uGlow.value = cur.glow * (1 - W.cover * 0.8); u.uDisc.value = cur.disc * (1 - W.cover);
    u.uCover.value = Math.max(cur.cover, W.cover); u.uCloudLit.value.copy(mcl); u.uCloudShade.value.copy(mcs); u.uStars.value = cur.stars * (1 - Math.min(1, W.cover * 1.1));
    u.uDiscSize.value = cur.night > 0.9 ? 0.9996 : 0.99986;
    fog.color.copy(mh).lerp(mhz, 0.55); fog.density = cur.fogDensity * W.fog;
    G.gfxSunFog.value.copy(mfs).multiplyScalar(1 - W.cover * 0.7);
    G.gfxNight.value = cur.night;
    G.gfxFogH.value.y = W.fogH;
    G.gfxWet.value = W.wet; G.gfxSnow.value = W.snowCover; G.gfxRain.value = W.rain; G.gfxWind.value = W.wind;
    G.gfxCool.value = W.cool; G.gfxDesat.value = W.desat;
    renderer.toneMappingExposure = cur.exposure * W.exp * (1 + flash * 0.25);
    scene.environmentIntensity = cur.env * (1 - W.cover * 0.35) + flash * 0.6;
    partW.color.copy(mhz).lerp(WHITE, 0.4);
    partW.night = cur.night;
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

  function setWeather(n, instant = false) {
    const key = WALIAS[String(n).toLowerCase()] || String(n).toLowerCase();
    const p = WEATHER[key];
    if (!p) { console.warn('[gfx] unknown weather', n); return; }
    wName = key; Wt = p; wDirty = true;
    if (instant) { for (const k of WKEYS) W[k] = p[k]; apply(); bakeEnv(); envDirty = false; }
    else envDirty = true;
    nextBolt = 3 + Math.random() * 5;
  }
  /** Fire a lightning bolt now (storm does this on its own timer). Calls every onLightning callback with { distance (m), delay (s until the thunder should be heard), intensity }. */
  function triggerLightning(distance = 400 + Math.random() * 2400) {
    flashT = 0;
    const info = { distance, delay: distance / 343, intensity: 1 - Math.min(0.7, distance / 4000) };
    for (const cb of boltCbs) { try { cb(info); } catch (e) { console.warn('[gfx] onLightning cb', e); } }
    return info;
  }
  const bolt = (t) => { const e = (t0, tau) => (t < t0 ? 0 : Math.exp(-(t - t0) / tau)); return Math.min(1, Math.max(e(0, 0.07), 0.75 * e(0.16, 0.1), 0.5 * e(0.38, 0.16))); };

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

  let frameN = 0;
  function update(dt, camera, speed = 0) {
    tickTime();
    frameN++;
    sky.uniforms.uTime.value = G.gfxTime.value;
    // weather lerp + lightning
    let needApply = false;
    if (wDirty) {
      const k = 1 - Math.exp(-Math.min(dt, 0.25) * 0.9); let dl = 0;
      for (const key of WKEYS) { const d = Wt[key] - W[key]; W[key] += d * k; dl += Math.abs(d); }
      needApply = true;
      if (dl < 0.004) { for (const key of WKEYS) W[key] = Wt[key]; wDirty = false; envDirty = true; }
    }
    if (W.bolt > 0.5 && wName === 'storm') { nextBolt -= dt; if (nextBolt <= 0) { triggerLightning(); nextBolt = 5 + Math.random() * 10; } }
    if (flashT >= 0) { flashT += dt; flash = bolt(flashT); if (flashT > 1.2) { flashT = -1; flash = 0; } flashWas = true; needApply = true; }
    else if (flashWas) { flash = 0; flashWas = false; needApply = true; }
    if (!settled) {
      const d = lerpTo(1 - Math.exp(-Math.min(dt, 0.1) * 1.6));
      apply();
      if (d < 0.004) { settled = true; envDirty = true; lerpTo(1); apply(); }
    } else { if (needApply) apply(); if (envDirty && !wDirty) { bakeEnv(); envDirty = false; } }
    partW.rain = W.rain; partW.snow = W.snow; partW.wind = W.wind;
    if (camera) particles.update(dt, camera, speed, partW);
    if (camera) {
      camera.updateMatrixWorld();
      G.gfxFogH.value.x = camera.position.y - 2.5;
      // shadow cadence: re-fit + re-render the sun shadow map every N frames (texel-snapped, so a stale map never shimmers)
      const every = tier.shadowEvery || 1;
      const doShadow = every === 1 || !settled || frameN <= 2 || frameN % every === 0;
      if (doShadow) fitShadow(camera);
      if (every > 1) { renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = doShadow; }
    }
  }

  return {
    sun, hemi, sky: sky.mesh, skyUniforms: sky.uniforms, fog,
    setTime, update, setWeather, triggerLightning,
    get weather() { return wName; },
    /** live weather values: { rain, snow, wet, wind, fog, flash } for audio / physics / scene wind */
    get weatherState() { return { name: wName, rain: W.rain, snow: W.snow, wet: W.wet, wind: W.wind, fog: W.fog, flash }; },
    onLightning(cb) { boltCbs.add(cb); return () => boltCbs.delete(cb); },
    get time() { return name; },
    presets: TIME_PRESETS,
    /** metres half-extent of the sun shadow box (smaller = sharper). */
    setShadowExtent(m) { shadowExtent = m; },
    setShadowMapSize(n) { sun.shadow.mapSize.set(n, n); sun.shadow.map?.dispose(); sun.shadow.map = null; },
    /** direction TOWARD the sun/moon (world) */
    get sunDirection() { return dir; },
    /** 0 day .. 1 night, smoothed */
    get night() { return G.gfxNight.value; },
    dispose() { particles.dispose(); envRT?.dispose(); pmrem.dispose(); },
  };
}
