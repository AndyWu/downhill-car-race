// Shared PBR material library. See src/graphics/README-materials block at bottom of index.js for the key list.
import * as THREE from 'three';
import { RECIPES, bakeFoliage } from './textures.js';
import { applyWorldUV } from './worldUV.js';
import { G, injectGlobals, installFog, tickTime } from './shared.js';

export function createMaterials(renderer, opts = {}) {
  installFog();
  const maxA = renderer?.capabilities?.getMaxAnisotropy?.() ?? 4;
  const aniso = Math.min(opts.anisotropy ?? 8, maxA);
  const big = opts.quality === 'low' ? 256 : (opts.bigTextureSize ?? (opts.quality === 'high' ? 512 : 384));
  const small = opts.quality === 'low' ? 256 : (opts.textureSize ?? 256);
  const T = {};
  const M = {};

  const pbr = (set, extra = {}) => new THREE.MeshStandardMaterial({
    map: set.map, normalMap: set.normalMap, normalScale: new THREE.Vector2(1, 1),
    roughnessMap: set.ormMap, aoMap: set.ormMap, aoMapIntensity: 1,
    roughness: 1, metalness: 0, ...extra,
  });
  const timed = (mat) => { mat.onBeforeRender = tickTime; return mat; };

  T.dirtRoad = RECIPES.dirtRoad(big, aniso);
  M.dirtRoad = pbr(T.dirtRoad, { name: 'dirtRoad', normalScale: new THREE.Vector2(1.3, 1.3) });

  T.mud = RECIPES.mud(big, aniso);
  M.mud = pbr(T.mud, { name: 'mud', normalScale: new THREE.Vector2(1.4, 1.4) });

  T.rock = RECIPES.rock(small, aniso);
  M.rock = pbr(T.rock, { name: 'rock', normalScale: new THREE.Vector2(1.5, 1.5) });

  T.sand = RECIPES.sand(small, aniso);
  M.sand = pbr(T.sand, { name: 'sand' });

  T.grass = RECIPES.grass(small, aniso);
  M.grass = pbr(T.grass, { name: 'grass' });

  T.woodWeathered = RECIPES.woodWeathered(big, aniso);
  M.woodWeathered = pbr(T.woodWeathered, { name: 'woodWeathered', normalScale: new THREE.Vector2(1.2, 1.2) });

  T.barnPaint = RECIPES.barnPaint(big, aniso);
  M.barnPaint = pbr(T.barnPaint, { name: 'barnPaint', normalScale: new THREE.Vector2(1.2, 1.2) });

  T.metalRusted = RECIPES.metalRusted(small, aniso);
  M.metalRusted = pbr(T.metalRusted, { name: 'metalRusted', metalness: 1, metalnessMap: T.metalRusted.ormMap });

  T.rope = RECIPES.rope(small, aniso);
  M.rope = pbr(T.rope, { name: 'rope' });

  T.hay = RECIPES.hay(small, aniso);
  M.hay = pbr(T.hay, { name: 'hay' });

  T.rubber = RECIPES.rubber(small, aniso);
  M.rubber = pbr(T.rubber, { name: 'rubber' });

  // ---- paintChipped: map.a = paint coverage. material.color tints the painted area only; chips show raw primer/rust.
  T.paintChipped = RECIPES.paintChipped(small, aniso);
  const makePaint = (color = 0xb02a1e, extra = {}) => {
    const m = pbr(T.paintChipped, { name: 'paintChipped', color: new THREE.Color(color), metalness: 0.1, ...extra });
    m.onBeforeCompile = (shader) => {
      injectGlobals(shader);
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', /* glsl */`
	#ifdef USE_MAP
		vec4 gPs = texture2D( map, vMapUv );
		diffuseColor.rgb = mix( gPs.rgb, diffuseColor.rgb * gPs.rgb, smoothstep( 0.15, 0.6, gPs.a ) );
	#endif`);
    };
    m.customProgramCacheKey = () => 'paintChipped';
    return m;
  };
  M.paintChipped = makePaint(0xb02a1e);
  M.makePaint = makePaint;

  // ---- water: murky, glossy, env-reflective (fresnel via PBR) with two scrolling ripple layers + rain rings.
  // UVs expected in metres (1 UV unit = 1 ripple tile).
  T.water = RECIPES.waterNormal(256, aniso);
  M.water = timed(new THREE.MeshStandardMaterial({
    name: 'water', color: new THREE.Color(0x2a2214), roughness: 0.04, metalness: 0.0,
    normalMap: T.water.normalMap, normalScale: new THREE.Vector2(0.28, 0.28),
    transparent: true, opacity: 0.95, depthWrite: false, envMapIntensity: 0.85,
  }));
  M.water.onBeforeCompile = (shader) => {
    injectGlobals(shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float gfxTime;').replace('#include <normal_fragment_maps>', /* glsl */`
	{
		vec2 wuv = vNormalMapUv; float t = gfxTime;
		vec3 n1 = texture2D( normalMap, wuv + vec2( t * 0.021, t * 0.013 ) ).xyz * 2.0 - 1.0;
		vec3 n2 = texture2D( normalMap, wuv * 1.9 + vec2( - t * 0.017, t * 0.026 ) + 0.31 ).xyz * 2.0 - 1.0;
		vec2 rg = n1.xy + n2.xy;
		vec2 q = wuv * 5.0; vec2 cell = floor( q ); vec2 f = fract( q ) - 0.5;
		float hh = fract( sin( dot( cell, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
		vec2 ctr = vec2( hh, fract( hh * 7.13 ) ) * 0.5 - 0.25;
		float ph = fract( t * 0.3 + hh * 3.7 );
		float d = length( f - ctr );
		float rr = ph * 0.5;
		float ring = sin( ( d - rr ) * 42.0 ) * exp( - abs( d - rr ) * 16.0 ) * ( 1.0 - ph ) * step( 0.45, hh );
		rg += normalize( f - ctr + 1e-4 ) * ring * 0.7;
		vec3 mapN = normalize( vec3( rg * normalScale, 1.0 ) );
		normal = normalize( tbn * mapN );
	}`);
  };
  M.water.customProgramCacheKey = () => 'gfxWater';

  // ---- foliage: alpha-tested leaf cards, wind sway, sun back-light translucency
  T.foliage = bakeFoliage(512, aniso);
  const wind = { value: 0.6 };
  M.foliage = timed(new THREE.MeshStandardMaterial({
    name: 'foliage', map: T.foliage, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.72, metalness: 0,
    color: new THREE.Color(0xdde8c8), shadowSide: THREE.DoubleSide,
  }));
  M.foliage.userData.wind = wind;
  M.foliage.onBeforeCompile = (shader) => {
    injectGlobals(shader);
    shader.uniforms.gWind = wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float gWind; uniform float gfxTime;')
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
	{
		#ifdef USE_INSTANCING
			vec2 gO = instanceMatrix[3].xz;
		#else
			vec2 gO = modelMatrix[3].xz;
		#endif
		float gh = max( position.y, 0.0 );
		float gp = gfxTime * 1.6 + ( gO.x + gO.y ) * 0.37;
		transformed.x += ( sin( gp + gh * 1.7 ) + 0.5 * sin( gp * 2.3 + gh * 3.1 ) ) * 0.018 * gh * gWind;
		transformed.z += cos( gp * 0.9 + gh * 1.3 ) * 0.014 * gh * gWind;
	}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', /* glsl */`#include <lights_fragment_end>
	#if NUM_DIR_LIGHTS > 0
	{
		vec3 gLd = directionalLights[ 0 ].direction;
		vec3 gV = normalize( vViewPosition );
		float gT = pow( saturate( - dot( gV, gLd ) ), 2.0 );
		reflectedLight.directDiffuse += directionalLights[ 0 ].color * diffuseColor.rgb * vec3( 1.0, 1.2, 0.55 ) * gT * 0.55;
	}
	#endif`);
  };
  M.foliage.customProgramCacheKey = () => 'gfxFoliage';
  // assign to foliage meshes so shadows honour the alpha cutout
  M.foliage.userData.depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: T.foliage, alphaTest: 0.5, side: THREE.DoubleSide });

  M.glass = new THREE.MeshStandardMaterial({
    name: 'glass', color: 0xa9c3cc, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.2,
    envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide,
  });

  // ---- world-space / triplanar variants (cloned, original untouched)
  M.worldUV = (nameOrMat, o) => {
    const base = typeof nameOrMat === 'string' ? M[nameOrMat] : nameOrMat;
    const m = base.clone();
    m.name = base.name + '_worldUV';
    return applyWorldUV(m, o);
  };
  M.applyWorldUV = applyWorldUV;
  M.textures = T;
  M.uniforms = G;
  M.setWind = (v) => { wind.value = v; };
  M.dispose = () => {
    for (const k in M) if (M[k]?.isMaterial) M[k].dispose();
    for (const k in T) { const e = T[k]; if (e?.isTexture) e.dispose(); else for (const t of Object.values(e ?? {})) t?.dispose?.(); }
  };
  return M;
}
