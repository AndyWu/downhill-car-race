import * as THREE from 'three';
import { installFog } from './shared.js';
import { getTier } from './quality.js';

/**
 * WebGL2 renderer: ACES filmic, sRGB, PCF shadows, DPR capped at 2 and a dynamic resolution scaler.
 * (three r186 removed PCFSoftShadowMap; PCFShadowMap is the soft-filtered one now.)
 * renderer.userData.gfx = { scaler, basePixelRatio, scale, onScale(cb), tick(dt) }
 */
export function createRenderer(canvas, opts = {}) {
  installFog();
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, alpha: false, stencil: false, depth: true,
    powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
  });
  const tier = getTier();
  const STEPS = tier.steps;
  const dprCap = opts.maxPixelRatio ?? tier.dpr;
  const base = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, dprCap);
  renderer.setPixelRatio(base);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = tier.shadowType === 'basic' ? THREE.BasicShadowMap : THREE.PCFShadowMap;
  renderer.setClearColor(0x0b0f14, 1);

  const gfx = {
    basePixelRatio: base, scale: STEPS[0], tier, enabled: opts.dynamicResolution !== false,
    targetMs: opts.targetMs ?? 18.5, cb: null, ema: 16, over: 0, under: 0, warm: 2.0, idx: 0,
    onScale(cb) { gfx.cb = cb; },
    setScale(s) {
      gfx.scale = s;
      if (gfx.cb) gfx.cb(s);
      else { renderer.setPixelRatio(base * s); renderer.setSize(renderer.domElement.clientWidth || 1, renderer.domElement.clientHeight || 1, false); }
    },
    /** feed frame time (s) every frame */
    tick(dt) {
      if (!gfx.enabled || dt <= 0 || dt > 0.5) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      if (gfx.warm > 0) { gfx.warm -= dt; return; }
      gfx.ema += (dt * 1000 - gfx.ema) * 0.08;
      if (gfx.ema > gfx.targetMs * 1.12) { gfx.over += dt; gfx.under = 0; }
      else if (gfx.ema < gfx.targetMs * 0.8) { gfx.under += dt; gfx.over = 0; }
      else { gfx.over = gfx.under = 0; }
      if (gfx.over > 1.0 && gfx.idx < STEPS.length - 1) { gfx.idx++; gfx.over = 0; gfx.ema = gfx.targetMs; gfx.setScale(STEPS[gfx.idx]); }
      else if (gfx.under > 5.0 && gfx.idx > 0) { gfx.idx--; gfx.under = 0; gfx.setScale(STEPS[gfx.idx]); }
    },
  };
  renderer.userData ??= {};
  renderer.userData.gfx = gfx;
  return renderer;
}
