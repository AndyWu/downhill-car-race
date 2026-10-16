// Material library: uses the graphics agent's PBR materials when supplied, otherwise procedural fallbacks.
import * as THREE from 'three';
import { ihash, clamp } from './util.js';

// ---- tileable procedural textures (DataTexture: works headless too) ----
function tn(u, v, p, seed) { // periodic value noise, u,v in [0,1) -> [0,1]
  const x = u * p, y = v * p, xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const w = (a) => ((a % p) + p) % p;
  const a = ihash(w(xi), w(yi), seed), b = ihash(w(xi + 1), w(yi), seed), c = ihash(w(xi), w(yi + 1), seed), d = ihash(w(xi + 1), w(yi + 1), seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
function fb(u, v, base, oct, seed) {
  let s = 0, a = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * tn(u, v, base << i, seed + i * 7); n += a; a *= 0.5; }
  return s / n;
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function makeTex(size, fn, srgb = true) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = fn(x / size, y / size), i = (y * size + x) * 4;
    data[i] = clamp(c[0], 0, 255); data[i + 1] = clamp(c[1], 0, 255); data[i + 2] = clamp(c[2], 0, 255); data[i + 3] = c[3] === undefined ? 255 : c[3];
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}
const TEX = {
  dirt: () => makeTex(256, (u, v) => {
    const n = fb(u, v, 4, 4, 1), f = tn(u, v, 64, 5), peb = tn(u, v, 48, 9) > 0.86 ? 1 : 0;
    const c = mix([122, 92, 62], [168, 134, 96], n); const k = 0.85 + 0.3 * f;
    return peb ? [150 * k, 140 * k, 128 * k] : [c[0] * k, c[1] * k, c[2] * k];
  }),
  mud: () => makeTex(256, (u, v) => { const n = fb(u, v, 4, 4, 11); const c = mix([48, 34, 24], [86, 62, 40], n); const sp = tn(u, v, 40, 3) > 0.9 ? 1.5 : 1; return [c[0] * sp, c[1] * sp, c[2] * sp]; }),
  water: () => makeTex(128, (u, v) => { const n = fb(u, v, 3, 4, 21); const c = mix([62, 82, 84], [112, 130, 126], n); return c; }),
  rock: () => makeTex(256, (u, v) => { const n = fb(u, v, 6, 4, 31), c = mix([86, 84, 80], [150, 146, 138], n); const cr = Math.abs(tn(u, v, 10, 8) - 0.5) < 0.02 ? 0.55 : 1; return [c[0] * cr, c[1] * cr, c[2] * cr]; }),
  gravel: () => makeTex(256, (u, v) => { const n = tn(u, v, 56, 41), m = fb(u, v, 8, 3, 43); const c = mix([110, 100, 88], [176, 168, 154], n); const k = 0.8 + 0.4 * m; return [c[0] * k, c[1] * k, c[2] * k]; }),
  sand: () => makeTex(128, (u, v) => { const n = fb(u, v, 6, 3, 51); const c = mix([196, 168, 118], [224, 198, 148], n); const g = tn(u, v, 80, 6) * 14; return [c[0] - g, c[1] - g, c[2] - g]; }),
  grass: () => makeTex(256, (u, v) => { const n = fb(u, v, 8, 4, 61), f = tn(u, v, 90, 2); const c = mix([66, 92, 40], [108, 138, 62], n); const k = 0.85 + 0.3 * f; return [c[0] * k, c[1] * k, c[2] * k]; }),
  wood: () => makeTex(256, (u, v) => { const plank = Math.floor(u * 6); const pv = ihash(plank, 0, 71); const g = fb(u * 0.15 + pv, v, 3, 3, 72 + plank) ; const edge = Math.abs((u * 6) % 1 - 0.5) > 0.47 ? 0.45 : 1; const c = mix([92, 76, 60], [150, 130, 108], g * 0.7 + pv * 0.3); const k = edge * (0.8 + 0.4 * tn(u * 2, v * 20 % 1, 40, 5)); return [c[0] * k, c[1] * k, c[2] * k]; }),
  bark: () => makeTex(128, (u, v) => { const g = fb(u * 3 % 1, v, 8, 3, 81); const c = mix([58, 44, 34], [112, 92, 74], g); return c; }),
  barn: () => makeTex(256, (u, v) => { const plank = Math.floor(u * 8); const pv = ihash(plank, 0, 91); const n = fb(u, v, 4, 4, 92); const edge = Math.abs((u * 8) % 1 - 0.5) > 0.46 ? 0.55 : 1; const c = mix([120, 34, 28], [168, 62, 46], n * 0.6 + pv * 0.4); const wear = tn(u, v, 12, 93) > 0.72 ? 0.8 : 0; const cc = mix(c, [150, 130, 110], wear); return [cc[0] * edge, cc[1] * edge, cc[2] * edge]; }),
  metal: () => makeTex(256, (u, v) => { const n = fb(u, v, 5, 5, 101), r = tn(u, v, 20, 103); const c = mix([112, 108, 104], [150, 70, 34], clamp(n * 1.5 - 0.15 + r * 0.4, 0, 1)); const rib = 0.88 + 0.12 * Math.sin(u * 6.2832 * 8); return [c[0] * rib, c[1] * rib, c[2] * rib]; }),
  straw: () => makeTex(128, (u, v) => { const n = tn(u * 2 % 1, v, 60, 111); const c = mix([180, 150, 70], [226, 200, 120], n); return c; }),
  shingle: () => makeTex(128, (u, v) => { const row = Math.floor(v * 10), o = (row % 2) * 0.5; const n = ihash(Math.floor(u * 8 + o), row, 121); const c = mix([48, 44, 42], [84, 78, 72], n); const edge = (v * 10) % 1 < 0.1 ? 0.6 : 1; return [c[0] * edge, c[1] * edge, c[2] * edge]; }),
  field: () => makeTex(128, (u, v) => { const row = 0.7 + 0.3 * Math.sin(u * 6.2832 * 16); const n = fb(u, v, 6, 3, 131); const k = row * (0.8 + 0.4 * n); return [200 * k, 200 * k, 200 * k]; }),
  leaf: () => makeTex(128, (u, v) => { const n = fb(u, v, 10, 4, 141), s = tn(u, v, 40, 3); const c = mix([42, 78, 30], [92, 128, 52], n); const k = 0.8 + 0.4 * s; return [c[0] * k, c[1] * k, c[2] * k]; }),
  brick: () => makeTex(128, (u, v) => { const row = Math.floor(v * 12), o = (row % 2) * 0.5; const n = ihash(Math.floor(u * 6 + o), row, 151); const m = ((v * 12) % 1 < 0.1 || ((u * 6 + o) % 1) < 0.07) ? 1 : 0; return m ? [170, 165, 155] : mix([110, 50, 38], [150, 76, 54], n); }),
  checker: () => makeTex(64, (u, v) => ((Math.floor(u * 8) + Math.floor(v * 8)) % 2 ? [240, 240, 235] : [24, 24, 24])),
};
export function textureOf(name) { return (TEX[name] && (TEX[name].cache ||= TEX[name]())) || null; }
function tex(name, rep = 1) { const t = textureOf(name); return t; }

const std = (o) => new THREE.MeshStandardMaterial(o);
const FALLBACK = {
  dirtRoad: () => std({ map: tex('dirt'), roughness: 0.96, metalness: 0 }),
  mud: () => std({ map: tex('mud'), roughness: 0.35, metalness: 0.0 }),
  water: () => std({ map: tex('water'), color: 0xbfd6dc, roughness: 0.06, metalness: 0.0 }),
  waterPuddle: () => FALLBACK.water(),
  rock: () => std({ map: tex('rock'), roughness: 0.92, metalness: 0, flatShading: true }),
  gravel: () => std({ map: tex('gravel'), roughness: 0.95, metalness: 0 }),
  sand: () => std({ map: tex('sand'), roughness: 0.98, metalness: 0 }),
  grass: () => std({ map: tex('grass'), roughness: 1, metalness: 0 }),
  woodWeathered: () => std({ map: tex('wood'), roughness: 0.9, metalness: 0 }),
  bark: () => std({ map: tex('bark'), roughness: 0.95, metalness: 0 }),
  barnPaint: () => std({ map: tex('barn'), roughness: 0.85, metalness: 0 }),
  metalRusted: () => std({ map: tex('metal'), roughness: 0.65, metalness: 0.55 }),
  foliage: () => std({ map: tex('leaf'), roughness: 0.85, metalness: 0, side: THREE.DoubleSide }),
  straw: () => std({ map: tex('straw'), roughness: 1, metalness: 0 }),
  shingle: () => std({ map: tex('shingle'), roughness: 0.9, metalness: 0 }),
  field: () => std({ map: tex('field'), roughness: 1, metalness: 0 }),
  brick: () => std({ map: tex('brick'), roughness: 0.95, metalness: 0 }),
  glass: () => std({ color: 0x1c2428, roughness: 0.15, metalness: 0.3 }),
  dark: () => std({ color: 0xffffff, roughness: 0.7, metalness: 0.05 }),
  checker: () => std({ map: tex('checker'), roughness: 0.8, metalness: 0 }),
  blade: () => std({ color: 0xffffff, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
};

function applySway(m, wind, o) {
  const prev = m.onBeforeCompile;
  const f = (n) => Number(n).toFixed(4);
  m.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(m, shader, renderer);
    shader.uniforms.uWindTime = wind.uTime; shader.uniforms.uWindAmp = wind.uAmp;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;\nuniform float uWindAmp;' + (o.attr ? '\nattribute float swayH;\nattribute vec2 swayO;' : ''))
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${o.attr ? 'vec2 swIp = swayO;' : `#ifdef USE_INSTANCING
          vec2 swIp = instanceMatrix[3].xz;
        #else
          vec2 swIp = vec2(0.0);
        #endif`}
        float swH = pow(max(${o.attr ? 'swayH' : 'position.y'} * ${f(o.hscale)}, 0.0), ${f(o.hpow)});
        float swP = uWindTime * ${f(o.freq)} + dot(swIp, vec2(0.37, 0.29));
        transformed.x += (sin(swP) + 0.35 * sin(swP * 2.3 + 1.7)) * ${f(o.amp)} * uWindAmp * swH;
        transformed.z += cos(swP * 0.83 + 0.5) * ${f(o.amp * 0.6)} * uWindAmp * swH;`);
  };
  const baseKey = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => '';
  m.customProgramCacheKey = () => `${baseKey()}|sway${o.amp}_${o.freq}_${o.hpow}_${o.hscale}${o.attr ? 'A' : ''}`;
}

// per-material weather response: snow = max cover on upward faces, wet = darkening / gloss
const WX = {
  dirtRoad: { snow: 0.5, wet: 1 }, grass: { snow: 1, wet: 0.5 }, foliage: { snow: 0.6, wet: 0.3 }, blade: { snow: 0.55, wet: 0.2 },
  metalRusted: { snow: 0.9, wet: 0.5 }, woodWeathered: { snow: 0.35, wet: 0.6 }, rock: { snow: 0.5, wet: 0.6 }, straw: { snow: 0.5, wet: 0.3 },
  barnPaint: { snow: 0.45, wet: 0.4 }, field: { snow: 1, wet: 0.3 }, gravel: { snow: 0.5, wet: 0.8 }, sand: { snow: 0.7, wet: 0.7 }, mud: { snow: 0.4, wet: 0.2 },
};
function applyWeather(m, wx, o) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(m, shader, renderer);
    shader.uniforms.uSnow = wx.uSnow; shader.uniforms.uWet = wx.uWet;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSnow;\nuniform float uWet;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          #ifdef FLAT_SHADED
            float wxUp = 0.8;
          #else
            float wxUp = dot(normalize(vNormal), normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
          #endif
          float wxSnow = uSnow * ${o.snow.toFixed(3)} * smoothstep(0.35, 0.8, wxUp);
          diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - ${(0.32 * o.wet).toFixed(3)} * uWet), vec3(0.9, 0.94, 1.0), wxSnow);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, min(roughnessFactor, 0.32), uWet * ${o.wet.toFixed(3)} * 0.8);`);
  };
  const baseKey = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => '';
  m.customProgramCacheKey = () => `${baseKey()}|wx${o.snow}_${o.wet}`;
}

export function createMaterialLibrary(provided = {}) {
  const cache = new Map();
  const wind = { uTime: { value: 0 }, uAmp: { value: 1 } };
  const wx = { uSnow: { value: 0 }, uWet: { value: 0 } };
  const scrolling = [];
  function get(key, opts = {}) {
    const ck = key + JSON.stringify(opts);
    if (cache.has(ck)) return cache.get(ck);
    const p = provided && provided[key];
    if (p && p.isMaterial && opts.direct) { cache.set(ck, p); return p; }
    let m;
    if (p && p.isMaterial) { m = p.clone(); if (p.onBeforeCompile) m.onBeforeCompile = p.onBeforeCompile; if (p.onBeforeRender) m.onBeforeRender = p.onBeforeRender; if (p.customProgramCacheKey && p.customProgramCacheKey.toString().indexOf('onBeforeCompile') < 0) m.customProgramCacheKey = p.customProgramCacheKey; }
    else m = (FALLBACK[key] || FALLBACK.dirtRoad)();
    if (opts.vertexColors) m.vertexColors = true;
    if (opts.side !== undefined) m.side = opts.side;
    if (opts.transparent) { m.transparent = true; m.depthWrite = false; }
    if (opts.polygonOffset) { m.polygonOffset = true; m.polygonOffsetFactor = opts.polygonOffset; m.polygonOffsetUnits = opts.polygonOffset; }
    if (opts.color !== undefined && m.color) m.color = new THREE.Color(opts.color);
    if (opts.sway) applySway(m, wind, { amp: 0.1, freq: 1.6, hpow: 1, hscale: 1, ...opts.sway });
    if (WX[key] && !opts.noWeather) applyWeather(m, wx, WX[key]);
    m.needsUpdate = true;
    cache.set(ck, m);
    return m;
  }
  return { get, wind, wx, provided: !!(provided && Object.keys(provided).length) };
}

/** Text banner texture (falls back to a checker pattern with no DOM). */
export function bannerTexture(text, bg = '#d8c9a0', fg = '#2a1d10') {
  if (typeof document === 'undefined') return textureOf('checker');
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  let px = 84; g.font = `bold ${px}px Georgia, serif`;
  while (g.measureText(text).width > 450 && px > 20) { px -= 4; g.font = `bold ${px}px Georgia, serif`; }
  g.fillText(text, 256, 68);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
