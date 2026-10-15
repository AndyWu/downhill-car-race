// Shared uniforms + global fog chunk override. Every material compiled after
// installFog() gets height+distance fog with directional sun in-scattering.
import * as THREE from 'three';

/** Global uniforms shared by every material / shader in the graphics module. */
export const G = {
  gfxSunDir: { value: new THREE.Vector3(0, 1, 0) },     // world, TOWARD the light
  gfxSunFog: { value: new THREE.Color(1, 0.9, 0.7) },    // in-scatter colour (linear)
  gfxFogH: { value: new THREE.Vector2(0, 0.045) },      // x: base height, y: falloff /m
  gfxNight: { value: 0 },                                // 0 day .. 1 night
  gfxTime: { value: 0 },
  gfxReflTex: { value: null },                           // planar reflection (set by postFX.setPlanarReflection)
  gfxReflVP: { value: new THREE.Matrix4() },
  gfxReflOn: { value: 0 },
};

export function injectGlobals(shader) {
  for (const k in G) shader.uniforms[k] = G[k];
}

let installed = false;
export function installFog() {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk;

  C.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogRel;
#endif`;
  C.fog_vertex = /* glsl */`
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogRel = transpose( mat3( viewMatrix ) ) * mvPosition.xyz;
#endif`;
  C.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogRel;
	uniform vec3 gfxSunDir;
	uniform vec3 gfxSunFog;
	uniform vec2 gfxFogH;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`;
  C.fog_fragment = /* glsl */`
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float gfxDist = length( vFogRel );
		vec3 gfxRd = vFogRel / max( gfxDist, 1e-3 );
		float gfxK = gfxFogH.y;
		float gfxKd = gfxK * vFogRel.y;
		float gfxFy = abs( gfxKd ) > 0.002 ? ( 1.0 - exp( - gfxKd ) ) / gfxKd : 1.0;
		float gfxCamH = clamp( cameraPosition.y - gfxFogH.x, 0.0, 40.0 );
		float gfxTau = fogDensity * exp( - gfxK * gfxCamH ) * gfxDist * gfxFy;
		float fogFactor = 1.0 - exp( - gfxTau );
		float gfxSd = max( dot( gfxRd, gfxSunDir ), 0.0 );
		vec3 gfxFc = fogColor + gfxSunFog * ( pow( gfxSd, 4.0 ) * 0.55 + pow( gfxSd, 24.0 ) * 0.9 );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
		vec3 gfxFc = fogColor;
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, gfxFc, fogFactor );
#endif`;

  // every material (unless it overrides onBeforeCompile and calls injectGlobals) gets the globals
  THREE.Material.prototype.onBeforeCompile = function (shader) { injectGlobals(shader); };
}

/** Mimics three's ACESFilmic + sRGB so JS-side colours can be matched to what the screen shows. */
export function displayColor(c, exposure = 1) {
  const k = exposure / 0.6;
  const r0 = c.r * k, g0 = c.g * k, b0 = c.b * k;
  let r = 0.59719 * r0 + 0.35458 * g0 + 0.04823 * b0;
  let g = 0.076 * r0 + 0.90834 * g0 + 0.01566 * b0;
  let b = 0.0284 * r0 + 0.13383 * g0 + 0.83777 * b0;
  const f = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  r = f(r); g = f(g); b = f(b);
  const R = 1.60475 * r - 0.53108 * g - 0.07367 * b;
  const Gc = -0.10208 * r + 1.10813 * g - 0.00605 * b;
  const B = -0.00327 * r - 0.07276 * g + 1.07602 * b;
  return new THREE.Color(Math.min(Math.max(R, 0), 1), Math.min(Math.max(Gc, 0), 1), Math.min(Math.max(B, 0), 1));
}

export function tickTime() { G.gfxTime.value = (performance.now() / 1000) % 100000; }
