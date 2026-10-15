// Procedural, tileable PBR texture baking (albedo sRGB, tangent normal, ORM = AO/Rough/Metal).
// Everything is generated at startup in plain JS typed arrays => fully offline, deterministic.
import * as THREE from 'three';
import { fbm, vnoise, worley, hash2, clamp, mix, smoothstep } from './noise.js';

const cache = new Map();

function makeTex(data, w, h, srgb, aniso) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/**
 * shade(u,v,c): fill c.{r,g,b (sRGB 0..1), a, h (0..1), rough, ao, metal}
 * returns { map, normalMap, ormMap }
 */
function bake(name, size, shade, { normalStrength = 3, aniso = 8, needsOrm = true } = {}) {
  const key = name + size;
  if (cache.has(key)) return cache.get(key);
  const N = size, n = N * N;
  const alb = new Uint8ClampedArray(n * 4), orm = new Uint8ClampedArray(n * 4), nrm = new Uint8ClampedArray(n * 4);
  const hgt = new Float32Array(n);
  const c = {};
  for (let j = 0; j < N; j++) {
    const v = j / N;
    for (let i = 0; i < N; i++) {
      const u = i / N;
      c.r = c.g = c.b = 0.5; c.a = 1; c.h = 0.5; c.rough = 0.8; c.ao = 1; c.metal = 0;
      shade(u, v, c);
      const k = j * N + i, p = k * 4;
      alb[p] = c.r * 255; alb[p + 1] = c.g * 255; alb[p + 2] = c.b * 255; alb[p + 3] = c.a * 255;
      orm[p] = c.ao * 255; orm[p + 1] = c.rough * 255; orm[p + 2] = c.metal * 255; orm[p + 3] = Math.min(255, Math.max(0, c.h * 255)); // height (for parallax)
      hgt[k] = c.h;
    }
  }
  const S = normalStrength * N / 256 * 4;
  for (let j = 0; j < N; j++) {
    const jm = ((j - 1 + N) % N) * N, jp = ((j + 1) % N) * N, jc = j * N;
    for (let i = 0; i < N; i++) {
      const im = (i - 1 + N) % N, ip = (i + 1) % N;
      const gx = (hgt[jc + ip] - hgt[jc + im]) * S;
      const gy = (hgt[jp + i] - hgt[jm + i]) * S;
      const il = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      const p = (jc + i) * 4;
      nrm[p] = (-gx * il * 0.5 + 0.5) * 255;
      nrm[p + 1] = (-gy * il * 0.5 + 0.5) * 255;
      nrm[p + 2] = (il * 0.5 + 0.5) * 255;
      nrm[p + 3] = 255;
    }
  }
  const out = {
    map: makeTex(new Uint8Array(alb.buffer), N, N, true, aniso),
    normalMap: makeTex(new Uint8Array(nrm.buffer), N, N, false, aniso),
    ormMap: needsOrm ? makeTex(new Uint8Array(orm.buffer), N, N, false, aniso) : null,
  };
  out.map.name = name + '_albedo'; out.normalMap.name = name + '_normal';
  if (out.ormMap) out.ormMap.name = name + '_orm';
  cache.set(key, out);
  return out;
}

const wrapd = (d) => d - Math.round(d);
const set = (c, r, g, b) => { c.r = r; c.g = g; c.b = b; };
const lerp3 = (c, r1, g1, b1, r2, g2, b2, t) => { c.r = mix(r1, r2, t); c.g = mix(g1, g2, t); c.b = mix(b1, b2, t); };
const mul = (c, k) => { c.r *= k; c.g *= k; c.b *= k; };
const W = {};

export const RECIPES = {
  // ---------------------------------------------------------------- dirt road with tyre ruts + pebbles
  dirtRoad(size, aniso) {
    return bake('dirtRoad', size, (u, v, c) => {
      const uu = u + (vnoise(v * 6, 0.5, 6, 1, 5) - 0.5) * 0.05;
      const n1 = fbm(u, v, 4, 4, 5, 1), n2 = fbm(u, v, 24, 24, 3, 2), grain = vnoise(u * size / 3, v * size / 3, size / 3, size / 3, 3);
      const d1 = wrapd(uu - 0.25) / 0.06, d2 = wrapd(uu - 0.75) / 0.06;
      const rut = Math.max(Math.exp(-d1 * d1), Math.exp(-d2 * d2));
      let h = 0.58 - rut * 0.2 + n1 * 0.22 + n2 * 0.08 + grain * 0.04;
      lerp3(c, 0.43, 0.33, 0.22, 0.3, 0.22, 0.145, n1);
      const dust = smoothstep(0.58, 0.8, n2) * (1 - rut) * 0.35;
      c.r = mix(c.r, 0.55, dust); c.g = mix(c.g, 0.45, dust); c.b = mix(c.b, 0.33, dust);
      c.r = mix(c.r, 0.3, rut * 0.35); c.g = mix(c.g, 0.22, rut * 0.35); c.b = mix(c.b, 0.15, rut * 0.35);
      mul(c, 0.85 + grain * 0.3);
      let rough = 0.94 - rut * 0.14 + (grain - 0.5) * 0.08, ao = 0.75 + clamp(h - 0.3) * 0.35;
      worley(u, v, 26, 11, W);
      if (W.id < 0.18) {
        const rad = 0.1 + 0.16 * (W.id / 0.18);
        const q = W.f1 / rad;
        if (q < 1) {
          const dome = Math.sqrt(1 - q * q);
          const tone = 0.55 + 0.7 * hash2(Math.floor(W.id * 1e4), 3, 4);
          const g = 0.46 * tone;
          c.r = mix(c.r, g * 1.04, dome > 0.15 ? 1 : dome / 0.15); c.g = mix(c.g, g, dome > 0.15 ? 1 : dome / 0.15); c.b = mix(c.b, g * 0.92, dome > 0.15 ? 1 : dome / 0.15);
          h += dome * 0.12; rough = 0.86;
        } else if (q < 1.5) ao *= 0.8 + (q - 1) * 0.4;
      }
      c.h = h; c.rough = rough; c.ao = ao;
    }, { normalStrength: 4, aniso });
  },

  // ---------------------------------------------------------------- wet mud
  mud(size, aniso) {
    return bake('mud', size, (u, v, c) => {
      // two tyre ruts along V (u = .3/.7) with herringbone tread pressed in; rut floors hold standing water
      const uu = u + (vnoise(v * 5, 0.5, 5, 1, 35) - 0.5) * 0.06;
      const d1 = wrapd(uu - 0.3) / 0.075, d2 = wrapd(uu - 0.7) / 0.075;
      const rA = Math.exp(-d1 * d1), rB = Math.exp(-d2 * d2), rut = Math.max(rA, rB);
      const dd = rA > rB ? d1 : d2;
      const tread = smoothstep(0.42, 0.58, ((v * 14 + Math.abs(dd) * 2.4) % 1 + 1) % 1) * smoothstep(0.15, 0.6, rut);
      const wet = smoothstep(0.52, 0.64, fbm(u, v, 3, 3, 4, 31));
      const lumps = fbm(u, v, 8, 8, 5, 32);
      const ridges = 1 - Math.abs(2 * fbm(u, v, 5, 5, 3, 33) - 1);
      const grain = vnoise(u * size / 4, v * size / 4, size / 4, size / 4, 34);
      let h = 0.58 + lumps * 0.26 + ridges * 0.14 + grain * 0.025;
      h = mix(h, 0.42 + fbm(u, v, 20, 20, 2, 35) * 0.03, wet * 0.8);
      h -= rut * 0.36 + tread * rut * 0.07;
      const wetMask = Math.max(wet, smoothstep(0.4, 0.95, rut));
      lerp3(c, 0.27, 0.185, 0.11, 0.38, 0.275, 0.17, lumps);
      c.r = mix(c.r, 0.16, wetMask * 0.8); c.g = mix(c.g, 0.115, wetMask * 0.8); c.b = mix(c.b, 0.075, wetMask * 0.8);
      worley(u, v, 40, 36, W);
      let rough = mix(0.84, 0.2, wetMask) + (grain - 0.5) * 0.16;
      if (W.id < 0.12 && W.f1 < 0.3) { const d = Math.sqrt(1 - (W.f1 / 0.3) ** 2); h += d * 0.12; c.r = mix(c.r, 0.36, d * 0.7); c.g = mix(c.g, 0.31, d * 0.7); c.b = mix(c.b, 0.26, d * 0.7); rough = 0.6; }
      c.h = clamp(h); c.rough = clamp(rough, 0.08, 1); c.ao = 0.5 + 0.5 * clamp(h * 1.5 + 0.1);
    }, { normalStrength: 3.2, aniso });
  },

  // ---------------------------------------------------------------- gravel: grey/brown stones with dark soil in the gaps
  gravel(size, aniso) {
    return bake('gravel', size, (u, v, c) => {
      // dirt-dominant ground (matches dirtRoad) with sparse loose stones scattered as a masked overlay
      const n1 = fbm(u, v, 4, 4, 5, 171), grain = vnoise(u * size / 3, v * size / 3, size / 3, size / 3, 172);
      lerp3(c, 0.4, 0.31, 0.205, 0.29, 0.215, 0.14, n1);
      mul(c, 0.85 + grain * 0.3);
      let h = 0.4 + n1 * 0.2 + grain * 0.04, ao = 0.8 + 0.2 * n1, rough = 0.94;
      const layer = (f, seed, cover, rmin, rmax, hgt) => {
        worley(u, v, f, seed, W);
        const id = W.id, k = Math.floor(id * 1e4);
        if (hash2(k, 21, seed) > cover) return;
        const rad = rmin + (rmax - rmin) * hash2(k, 5, seed);
        const q = W.f1 / rad;
        if (q >= 1.12) return;
        const pick = hash2(k, 9, seed);
        let r, g, b;
        if (pick < 0.35) { r = 0.33; g = 0.32; b = 0.3; }
        else if (pick < 0.65) { r = 0.4; g = 0.33; b = 0.25; }
        else if (pick < 0.88) { r = 0.22; g = 0.21; b = 0.2; }
        else { r = 0.44; g = 0.41; b = 0.36; }
        const t = 0.75 + 0.5 * hash2(k, 11, seed);
        const dome = q < 1 ? Math.sqrt(1 - q * q) : 0;
        const e = smoothstep(0.0, 0.2, dome);
        c.r = mix(c.r, r * t, e); c.g = mix(c.g, g * t, e); c.b = mix(c.b, b * t, e);
        h += dome * hgt * (0.5 + 0.5 * pick);
        ao = q < 1 ? mix(ao, 0.75 + 0.25 * dome, e) : ao * (0.82 + 0.18 * (q - 1) / 0.12); // contact shadow ring
        rough = mix(rough, 0.7 + 0.2 * pick, e);
      };
      layer(9, 166, 0.16, 0.18, 0.5, 0.55);   // few big stones
      layer(21, 162, 0.17, 0.2, 0.55, 0.4);  // medium
      layer(46, 164, 0.2, 0.25, 0.6, 0.25); // small chips
      mul(c, 0.92 + 0.16 * vnoise(u * 128, v * 128, 128, 128, 165));
      c.h = clamp(h); c.rough = rough; c.ao = ao;
    }, { normalStrength: 3.2, aniso });
  },

  // ---------------------------------------------------------------- tileable ripple normal for water
  waterNormal(size, aniso) {
    return bake('waterNormal', size, (u, v, c) => {
      const a = fbm(u, v, 5, 5, 5, 41, 0.55);
      const r = Math.sin((u * 6 + fbm(u, v, 3, 3, 3, 42) * 1.5) * Math.PI * 2) * 0.5 + 0.5;
      c.h = a * 0.8 + r * 0.04; set(c, 0.1, 0.1, 0.1);
    }, { normalStrength: 2.2, aniso, needsOrm: false });
  },

  // ---------------------------------------------------------------- fractured rock
  rock(size, aniso) {
    return bake('rock', size, (u, v, c) => {
      const wu = u + (fbm(u, v, 4, 4, 3, 55) - 0.5) * 0.1, wv = v + (fbm(u, v, 4, 4, 3, 56) - 0.5) * 0.1;
      worley(wu, wv, 6, 51, W);
      const crack = 0.4 + 0.6 * smoothstep(0.0, 0.2, W.f2 - W.f1);
      const strata = Math.sin((v + fbm(u, v, 3, 3, 3, 52) * 0.25) * Math.PI * 2 * 9) * 0.5 + 0.5;
      const fine = fbm(u, v, 12, 12, 5, 53), grit = vnoise(u * 96, v * 96, 96, 96, 57);
      const h = crack * 0.35 + fine * 0.45 + W.id * 0.15 + grit * 0.05;
      const tone = 0.8 + (W.id - 0.5) * 0.25 + (fine - 0.5) * 0.7 + (grit - 0.5) * 0.15;
      set(c, 0.42 * tone, 0.39 * tone, 0.35 * tone);
      c.r += strata * 0.04; c.g += strata * 0.025;
      const lich = smoothstep(0.6, 0.74, fbm(u, v, 7, 7, 3, 54)) * 0.5;
      c.r = mix(c.r, 0.40, lich); c.g = mix(c.g, 0.45, lich); c.b = mix(c.b, 0.23, lich);
      mul(c, 0.6 + 0.4 * crack);
      c.h = h; c.rough = 0.9 - fine * 0.15; c.ao = 0.55 + 0.45 * crack;
    }, { normalStrength: 4.2, aniso });
  },

  // ---------------------------------------------------------------- sand with wind ripples
  sand(size, aniso) {
    return bake('sand', size, (u, v, c) => {
      const warp = fbm(u, v, 3, 3, 3, 61);
      const ph = (v + warp * 0.14 + (fbm(u, v, 8, 2, 2, 63) - 0.5) * 0.02) * Math.PI * 2 * 10;
      const rip = 1 - Math.abs(Math.sin(ph));
      const grain = vnoise(u * size / 2, v * size / 2, size / 2, size / 2, 62);
      const lowf = fbm(u, v, 5, 5, 4, 64);
      lerp3(c, 0.65, 0.54, 0.38, 0.83, 0.72, 0.52, rip);
      mul(c, 0.86 + lowf * 0.28);
      if (grain > 0.93) mul(c, 1.14);
      c.h = rip * 0.4 + lowf * 0.25 + grain * 0.06; c.rough = 0.95; c.ao = 0.7 + rip * 0.3;
    }, { normalStrength: 2.4, aniso });
  },

  // ---------------------------------------------------------------- muted grass ground
  grass(size, aniso) {
    return bake('grass', size, (u, v, c) => {
      const clump = fbm(u, v, 8, 8, 4, 71), dry = fbm(u, v, 3, 3, 3, 73);
      const A = vnoise(u * 128, v * 32, 128, 32, 72), B = vnoise(u * 32, v * 128, 32, 128, 75), C = vnoise(u * 90, v * 90, 90, 90, 76);
      const blade = (A + B + C) / 3;
      lerp3(c, 0.16, 0.25, 0.07, 0.3, 0.34, 0.12, clump);
      const dr = smoothstep(0.45, 0.7, dry) * 0.6;
      c.r = mix(c.r, 0.42, dr); c.g = mix(c.g, 0.36, dr); c.b = mix(c.b, 0.17, dr);
      const soil = smoothstep(0.66, 0.78, fbm(u, v, 5, 5, 3, 74));
      c.r = mix(c.r, 0.27, soil); c.g = mix(c.g, 0.2, soil); c.b = mix(c.b, 0.13, soil);
      mul(c, 0.65 + blade * 0.7);
      const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11; // desaturate a touch (TLoU palette)
      c.r = mix(c.r, l, 0.18); c.g = mix(c.g, l, 0.18); c.b = mix(c.b, l, 0.18);
      c.h = blade * 0.55 + clump * 0.3 + (1 - soil) * 0.1; c.rough = 0.92; c.ao = 0.5 + 0.5 * blade;
    }, { normalStrength: 2.2, aniso });
  },

  // ---------------------------------------------------------------- dusty weathered boards (tile = 1x1 m, 4 boards, grain along U)
  woodWeathered(size, aniso) {
    return bake('wood', size, (u, v, c) => {
      const bv = v * 4, b = Math.floor(bv), fv = bv - b;
      const id = hash2(b, 0, 81);
      const edge = smoothstep(0, 0.04, fv) * smoothstep(0, 0.04, 1 - fv);
      const gap = 1 - edge;
      const seed = 81 + b * 7;
      const gr = fbm(u, v, 3, 60, 4, seed, 0.55);
      const warp = fbm(u, v, 2, 8, 3, seed + 3);
      const lines = Math.abs(Math.sin((fv * 20 + warp * 6) * Math.PI));
      const bleach = clamp(fbm(u, v, 3, 3, 3, 82) * 0.8 + id * 0.35 - 0.1);
      lerp3(c, 0.36, 0.27, 0.19, 0.58, 0.55, 0.5, bleach);
      mul(c, 0.78 + gr * 0.45);
      mul(c, 1 - 0.22 * (1 - lines) * (1 - bleach * 0.6));
      const ck = fbm(u, v, 2, 40, 3, seed + 9);
      const crackMask = smoothstep(0.5, 0.62, fbm(u, v, 3, 3, 3, 83));
      const crack = (1 - smoothstep(0.0, 0.035, Math.abs(ck - 0.5))) * crackMask;
      mul(c, 1 - crack * 0.7);
      worley(u, v, 5, 84, W);
      let knot = 0;
      if (W.id < 0.35) { knot = Math.exp(-((W.f1 / 0.2) ** 2)); const ring = Math.sin(W.f1 * 55) * 0.5 + 0.5; mul(c, 1 - 0.5 * knot + (ring - 0.5) * 0.18 * knot); }
      const grime = clamp(gap * 1.0 + crack * 0.9 + (1 - smoothstep(0, 0.25, fv)) * 0.3);
      const edgeW = (1 - smoothstep(0.02, 0.12, Math.min(fv, 1 - fv))) * edge; // bare, sun-bleached board edges
      c.r = mix(c.r, 0.62, edgeW * 0.45); c.g = mix(c.g, 0.58, edgeW * 0.45); c.b = mix(c.b, 0.52, edgeW * 0.45);
      const mold = smoothstep(0.58, 0.72, fbm(u, v, 4, 4, 4, 85)) * 0.5;
      c.r = mix(c.r, 0.3, mold * 0.4); c.g = mix(c.g, 0.34, mold * 0.4); c.b = mix(c.b, 0.26, mold * 0.4);
      mul(c, 1 - grime * 0.7);
      c.h = 0.55 - (1 - lines) * 0.07 + gr * 0.06 - gap * 0.42 - crack * 0.25 - knot * 0.05;
      c.rough = clamp(0.84 + gr * 0.12 - bleach * 0.05 + edgeW * 0.08); c.ao = clamp(1 - grime * 0.85 - crack * 0.3);
    }, { normalStrength: 3.2, aniso });
  },

  // ---------------------------------------------------------------- weathered red barn paint (tile = 2x2 m, 8 vertical planks, grain along V)
  barnPaint(size, aniso) {
    return bake('barnPaint', size, (u, v, c) => {
      const bu = u * 8, b = Math.floor(bu), fu = bu - b;
      const edge = smoothstep(0, 0.035, fu) * smoothstep(0, 0.035, 1 - fu);
      const gap = 1 - edge;
      const seed = 91 + b * 5;
      const gr = fbm(u, v, 60, 3, 4, seed, 0.55);
      const lines = Math.abs(Math.sin((fu * 16 + fbm(u, v, 8, 2, 3, seed + 1) * 5) * Math.PI));
      // bare wood
      const wood = 0.74 + gr * 0.5;
      const wr = 0.47 * wood * (0.8 + 0.2 * lines), wg = 0.43 * wood * (0.8 + 0.2 * lines), wb = 0.39 * wood * (0.82 + 0.18 * lines);
      // paint presence (streaky, peeling more at plank edges)
      const streak = fbm(u, v, 16, 2, 4, 92), blob = fbm(u, v, 3, 3, 4, 93), rag = fbm(u, v, 28, 28, 3, 98);
      const pm = streak * 0.4 + blob * 0.5 + rag * 0.12 + (1 - edge) * 0.05 + (1 - smoothstep(0, 0.18, fu)) * 0.05;
      const paint = 1 - smoothstep(0.585, 0.615, pm);
      const rim = 1 - smoothstep(0.0, 0.05, Math.abs(pm - 0.6));
      const chalk = fbm(u, v, 3, 3, 3, 95);
      let pr = 0.38, pg = 0.07, pb = 0.05;
      const vary = 0.78 + 0.45 * fbm(u, v, 8, 8, 3, 94);
      pr *= vary; pg *= vary; pb *= vary;
      pr = mix(pr, 0.5, chalk * 0.4); pg = mix(pg, 0.22, chalk * 0.4); pb = mix(pb, 0.18, chalk * 0.4);
      pr = mix(pr, 0.55, rim * 0.5); pg = mix(pg, 0.27, rim * 0.5); pb = mix(pb, 0.22, rim * 0.5);
      const sk = 0.6 + 0.55 * fbm(u, v, 44, 2, 3, 96) * (0.7 + 0.5 * fbm(u, v, 6, 6, 3, 99));
      pr *= sk; pg *= sk; pb *= sk;
      c.r = mix(wr, pr, paint); c.g = mix(wg, pg, paint); c.b = mix(wb, pb, paint);
      const grime = clamp(gap * 1.0 + (1 - paint) * 0.2 * (1 - fbm(u, v, 6, 6, 2, 97)) + rim * 0.12);
      const edgeW = (1 - smoothstep(0.02, 0.1, Math.min(fu, 1 - fu))) * edge * paint; // worn paint on plank edges
      c.r = mix(c.r, 0.5, edgeW * 0.4); c.g = mix(c.g, 0.34, edgeW * 0.4); c.b = mix(c.b, 0.3, edgeW * 0.4);
      const rain = smoothstep(0.55, 0.8, fbm(u, v, 30, 2, 3, 100)); // dark rain-run streaks
      mul(c, 1 - rain * 0.25);
      const mildew = smoothstep(0.6, 0.75, fbm(u, v, 5, 5, 4, 101)) * 0.4;
      c.r = mix(c.r, 0.28, mildew * 0.35); c.g = mix(c.g, 0.3, mildew * 0.35); c.b = mix(c.b, 0.24, mildew * 0.35);
      mul(c, 1 - grime * 0.7);
      c.h = paint * 0.2 + gr * 0.08 + (1 - lines) * 0.04 - gap * 0.5 + 0.45;
      c.rough = mix(0.93, 0.58 + chalk * 0.22, paint); c.ao = clamp(1 - gap * 0.9 - rim * 0.15 - (1 - paint) * 0.1);
    }, { normalStrength: 3.6, aniso });
  },

  // ---------------------------------------------------------------- rusted steel
  metalRusted(size, aniso) {
    return bake('metalRusted', size, (u, v, c) => {
      const rustN = fbm(u, v, 5, 5, 5, 101), streak = fbm(u, v, 30, 3, 3, 103);
      const scratch = vnoise(u * size, v * 6, size, 6, 105);
      worley(u, v, 30, 102, W);
      const pit = W.f1 < 0.2 && W.id < 0.45 ? 1 - W.f1 / 0.2 : 0;
      const rustMask = smoothstep(0.4, 0.6, rustN * 0.75 + streak * 0.4 + pit * 0.2);
      const rc = fbm(u, v, 12, 12, 3, 104);
      lerp3(c, 0.27, 0.115, 0.055, 0.58, 0.29, 0.105, rc);
      const clean = 0.8 + scratch * 0.35;
      c.r = mix(0.3 * clean, c.r, rustMask); c.g = mix(0.3 * clean, c.g, rustMask); c.b = mix(0.315 * clean, c.b, rustMask);
      c.r = mix(c.r, 0.07, pit * 0.8); c.g = mix(c.g, 0.04, pit * 0.8); c.b = mix(c.b, 0.03, pit * 0.8);
      c.h = 0.5 + rustN * 0.3 * rustMask + (1 - rustMask) * scratch * 0.03 - pit * 0.3;
      c.metal = mix(1.0, 0.18, rustMask); c.rough = mix(0.38, 0.9, rustMask) - (1 - rustMask) * (1 - scratch) * 0.08;
      c.ao = 1 - pit * 0.6;
    }, { normalStrength: 3, aniso });
  },

  // ---------------------------------------------------------------- twisted rope (u around, v along; 3 strands)
  rope(size, aniso) {
    return bake('rope', size, (u, v, c) => {
      const a = (u * 3 + v * 3) % 1, b = ((u - v) % 1 + 1) % 1;
      const hh = Math.pow(Math.sin(Math.PI * a), 0.6);
      const fibre = vnoise(a * 64, b * 3, 64, 3, 111) * 0.6 + vnoise(a * 128, b * 8, 128, 8, 112) * 0.4;
      const dirt = fbm(u, v, 4, 4, 3, 113);
      const t = 0.62 + fibre * 0.55;
      set(c, 0.6 * t, 0.49 * t, 0.33 * t);
      mul(c, 0.75 + dirt * 0.4);
      mul(c, 0.3 + 0.7 * hh);
      c.h = hh * 0.7 + fibre * 0.22; c.rough = 0.95; c.ao = 0.35 + 0.65 * hh;
    }, { normalStrength: 3.5, aniso });
  },

  // ---------------------------------------------------------------- chipped paint (alpha = paint coverage, tinted by material.color)
  paintChipped(size, aniso) {
    return bake('paintChipped', size, (u, v, c) => {
      worley(u, v, 9, 121, W);
      const n = fbm(u, v, 7, 7, 5, 122);
      const edgeWear = 1 - smoothstep(0, 0.3, W.f1) * 0;
      const m = n * 0.8 + (W.id > 0.7 ? (1 - W.f1) * 0.12 : 0);
      const paint = 1 - smoothstep(0.6, 0.66, m);
      const rim = 1 - smoothstep(0, 0.04, Math.abs(m - 0.63));
      const scuff = vnoise(u * 200, v * 9, 200, 9, 123);
      const l = 0.9 - fbm(u, v, 12, 12, 3, 124) * 0.12 - (scuff > 0.8 ? 0.06 : 0);
      const under = fbm(u, v, 16, 16, 3, 125);
      // alpha = paint; rgb in painted area = grime multiplier; in chipped area = raw primer/rust colour
      if (paint > 0.5) set(c, l, l, l); else lerp3(c, 0.34, 0.33, 0.32, 0.5, 0.26, 0.12, smoothstep(0.35, 0.7, under));
      c.a = paint;
      c.h = 0.55 * (paint) + 0.4 + rim * 0.05; c.rough = mix(0.8, 0.42, paint) + (scuff - 0.5) * 0.1; c.ao = 0.7 + 0.3 * paint;
      c.metal = paint > 0.5 ? 0.0 : 0.5;
    }, { normalStrength: 3, aniso });
  },

  // ---------------------------------------------------------------- straw / hay
  hay(size, aniso) {
    return bake('hay', size, (u, v, c) => {
      const A = vnoise(u * 220, v * 12, 220, 12, 131), B = vnoise(u * 12, v * 220, 12, 220, 132);
      const dir = fbm(u, v, 3, 3, 3, 133);
      const s = dir > 0.5 ? A : B, s2 = dir > 0.5 ? B : A;
      const tone = 0.55 + s * 0.6;
      set(c, 0.74 * tone, 0.6 * tone, 0.3 * tone);
      mul(c, 0.7 + 0.3 * s2);
      const dark = fbm(u, v, 6, 6, 3, 134); mul(c, 0.7 + 0.5 * dark);
      c.h = s * 0.6 + s2 * 0.15; c.rough = 0.92; c.ao = 0.4 + 0.6 * s;
    }, { normalStrength: 2.5, aniso });
  },

  // ---------------------------------------------------------------- rubber
  rubber(size, aniso) {
    return bake('rubber', size, (u, v, c) => {
      const g = vnoise(u * 128, v * 128, 128, 128, 141), f = fbm(u, v, 6, 6, 3, 142);
      const k = 0.05 + g * 0.03 + f * 0.03;
      set(c, k, k, k * 1.05);
      c.h = g * 0.4 + f * 0.3; c.rough = 0.8 + g * 0.12; c.ao = 0.8 + f * 0.2;
    }, { normalStrength: 1.6, aniso });
  },
};

/** soft leaf-cluster atlas with alpha (canvas), RGB bled into transparent area to avoid dark mip halos */
export function bakeFoliage(size, aniso) {
  const key = 'foliage' + size;
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, size, size);
  let s = 12345;
  const R = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const leaf = (x, y, len, wid, ang, hue) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    const grd = g.createLinearGradient(0, -wid, 0, wid);
    const l0 = 22 + hue * 14, l1 = 33 + hue * 16;
    grd.addColorStop(0, `hsl(${78 + hue * 22},${34 + hue * 10}%,${l0}%)`);
    grd.addColorStop(1, `hsl(${88 + hue * 20},${40 + hue * 8}%,${l1}%)`);
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(len * 0.25, -wid, len * 0.7, -wid * 0.8, len, 0);
    g.bezierCurveTo(len * 0.7, wid * 0.8, len * 0.25, wid, 0, 0);
    g.fill();
    g.strokeStyle = `hsla(80,30%,${48 + hue * 10}%,0.55)`; g.lineWidth = Math.max(1, wid * 0.08);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.95, 0); g.stroke();
    g.lineWidth = Math.max(0.6, wid * 0.04); g.globalAlpha = 0.35;
    for (let k = 1; k < 6; k++) { const px = len * k / 6.5; g.beginPath(); g.moveTo(px, 0); g.lineTo(px + len * 0.1, -wid * 0.55 * (1 - k / 7)); g.moveTo(px, 0); g.lineTo(px + len * 0.1, wid * 0.55 * (1 - k / 7)); g.stroke(); }
    g.restore();
  };
  // a few twigs fanning out from the bottom centre
  const branches = 9;
  for (let b = 0; b < branches; b++) {
    const ba = -Math.PI / 2 + (b / (branches - 1) - 0.5) * 2.2 + (R() - 0.5) * 0.2;
    const bl = size * (0.35 + R() * 0.25);
    const bx = size * 0.5, by = size * 0.96;
    g.strokeStyle = 'rgb(58,44,30)'; g.lineWidth = size * 0.012;
    g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl); g.stroke();
    const nl = 7;
    for (let k = 1; k <= nl; k++) {
      const t = k / nl, px = bx + Math.cos(ba) * bl * t, py = by + Math.sin(ba) * bl * t;
      for (const side of [-1, 1]) leaf(px, py, size * (0.13 + R() * 0.05), size * (0.035 + R() * 0.012), ba + side * (0.7 + R() * 0.5), R());
    }
    leaf(bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl, size * 0.14, size * 0.04, ba, R());
  }
  const img = g.getImageData(0, 0, size, size), d = img.data;
  // bleed average leaf colour into transparent texels & binarise-ish alpha for alphaTest
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) { d[i] = 56; d[i + 1] = 78; d[i + 2] = 30; }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.name = 'foliage_albedo';
  cache.set(key, tex);
  return tex;
}

/** grey, mean-0.5 macro variation texture used by world-UV terrain shading to break tiling */
export function bakeMacro(size = 128) {
  if (cache.has('macro')) return cache.get('macro');
  const d = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const v = fbm(i / size, j / size, 4, 4, 5, 151) * 0.65 + fbm(i / size, j / size, 11, 11, 3, 152) * 0.35;
    const k = clamp((v - 0.5) * 1.8 + 0.5) * 255, p = (j * size + i) * 4;
    d[p] = d[p + 1] = d[p + 2] = k; d[p + 3] = 255;
  }
  const t = makeTex(d, size, size, false, 4);
  cache.set('macro', t);
  return t;
}
