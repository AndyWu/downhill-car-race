// World-space UV / triplanar projection for terrain materials (onBeforeCompile).
// Needs material.map; uses normalMap and the ORM texture (roughnessMap/aoMap/metalnessMap) if set.
import { injectGlobals } from './shared.js';
import { bakeMacro } from './textures.js';

/**
 * @param {THREE.MeshStandardMaterial} material  (modified in place — clone first if shared!)
 * @param {{scale?:number, mode?:'triplanar'|'planar', macro?:boolean, macroScale?:number, sharpness?:number}} o
 *   scale: metres covered by one texture tile (default 4)
 *   mode: 'planar' = XZ projection only (1 fetch/map, best for roads & flat ground); 'triplanar' for cliffs/banks
 *   macro: multiply by large-scale value noise (default true) to hide tiling
 */
export function applyWorldUV(material, o = {}) {
  const { scale = 4, mode = 'planar', macro = true, macroScale = 1 / 41, sharpness = 4 } = o;
  const prev = material.onBeforeCompile;
  const macroTex = bakeMacro();
  const U = {
    gInvScale: { value: 1 / scale },
    gSharp: { value: sharpness },
    gMacro: { value: macroTex },
    gMacroScale: { value: macroScale },
  };
  material.userData.worldUV = { uniforms: U, mode };
  material.onBeforeCompile = (shader, renderer) => {
    injectGlobals(shader);
    if (prev && prev !== material.onBeforeCompile) prev(shader, renderer);
    Object.assign(shader.uniforms, U);
    const planar = mode === 'planar';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;\nvarying vec3 vGN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
	vec4 gwp = vec4( transformed, 1.0 );
	vec3 gwn = objectNormal;
	#ifdef USE_INSTANCING
		gwp = instanceMatrix * gwp;
		gwn = mat3( instanceMatrix ) * gwn;
	#endif
	vGW = ( modelMatrix * gwp ).xyz;
	vGN = normalize( mat3( modelMatrix ) * gwn );`);
    const pars = /* glsl */`
varying vec3 vGW; varying vec3 vGN;
uniform float gInvScale; uniform float gSharp; uniform sampler2D gMacro; uniform float gMacroScale;
${planar ? '#define GW_PLANAR' : ''}
vec4 gTri( sampler2D t, vec3 p, vec3 w ) {
	#ifdef GW_PLANAR
		return texture2D( t, p.xz );
	#else
		return texture2D( t, p.zy ) * w.x + texture2D( t, p.xz ) * w.y + texture2D( t, p.xy ) * w.z;
	#endif
}
#ifdef USE_NORMALMAP
vec3 gTriNormal( vec3 p, vec3 w, vec3 wn, vec2 ns ) {
	#ifdef GW_PLANAR
		vec3 ty = texture2D( normalMap, p.xz ).xyz * 2.0 - 1.0; ty.xy *= ns;
		ty = vec3( ty.xy + wn.xz, abs( ty.z ) * wn.y );
		return normalize( ty.xzy );
	#else
		vec3 tx = texture2D( normalMap, p.zy ).xyz * 2.0 - 1.0; tx.xy *= ns;
		vec3 ty = texture2D( normalMap, p.xz ).xyz * 2.0 - 1.0; ty.xy *= ns;
		vec3 tz = texture2D( normalMap, p.xy ).xyz * 2.0 - 1.0; tz.xy *= ns;
		tx = vec3( tx.xy + wn.zy, abs( tx.z ) * wn.x );
		ty = vec3( ty.xy + wn.xz, abs( ty.z ) * wn.y );
		tz = vec3( tz.xy + wn.xy, abs( tz.z ) * wn.z );
		return normalize( tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z );
	#endif
}
#endif
vec3 gP; vec3 gW; vec3 gWN; vec4 gORM = vec4( 1.0 );
`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <roughnessmap_pars_fragment>', '#include <roughnessmap_pars_fragment>\n' + pars)
      .replace('#include <map_fragment>', /* glsl */`
	gP = vGW * gInvScale; gWN = normalize( vGN );
	gW = pow( abs( gWN ), vec3( gSharp ) ); gW /= ( gW.x + gW.y + gW.z );
	vec4 sampledDiffuseColor = gTri( map, gP, gW );
	${macro ? `#ifdef GW_PLANAR
	float gM = texture2D( gMacro, vGW.xz * gMacroScale ).r * 0.65 + texture2D( gMacro, vGW.zx * gMacroScale * 0.23 + 0.37 ).r * 0.35;
	#else
	float gM = ( texture2D( gMacro, vGW.zy * gMacroScale ).r * gW.x + texture2D( gMacro, vGW.xz * gMacroScale ).r * gW.y + texture2D( gMacro, vGW.xy * gMacroScale ).r * gW.z ) * 0.65
		+ ( texture2D( gMacro, vGW.yz * gMacroScale * 0.23 + 0.37 ).r * gW.x + texture2D( gMacro, vGW.zx * gMacroScale * 0.23 + 0.37 ).r * gW.y + texture2D( gMacro, vGW.yx * gMacroScale * 0.23 + 0.37 ).r * gW.z ) * 0.35;
	#endif
	sampledDiffuseColor.rgb *= 0.62 + 0.76 * gM;` : ''}
	diffuseColor *= sampledDiffuseColor;`)
      .replace('#include <roughnessmap_fragment>', /* glsl */`
	float roughnessFactor = roughness;
	#ifdef USE_ROUGHNESSMAP
		gORM = gTri( roughnessMap, gP, gW );
		roughnessFactor *= gORM.g;
	#endif`)
      .replace('#include <metalnessmap_fragment>', /* glsl */`
	float metalnessFactor = metalness;
	#ifdef USE_METALNESSMAP
		metalnessFactor *= gORM.b;
	#endif`)
      .replace('#include <normal_fragment_maps>', /* glsl */`
	#ifdef USE_NORMALMAP
		normal = normalize( ( viewMatrix * vec4( gTriNormal( gP, gW, gWN, normalScale ), 0.0 ) ).xyz );
	#endif`)
      .replace('#include <aomap_fragment>', /* glsl */`
	#ifdef USE_AOMAP
		float ambientOcclusion = ( gORM.r - 1.0 ) * aoMapIntensity + 1.0;
		reflectedLight.indirectDiffuse *= ambientOcclusion;
		#if defined( USE_ENVMAP ) && defined( STANDARD )
			float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
			reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
		#endif
	#endif`);
  };
  material.customProgramCacheKey = () => 'worldUV-' + mode + (macro ? 'm' : '');
  material.needsUpdate = true;
  return material;
}
