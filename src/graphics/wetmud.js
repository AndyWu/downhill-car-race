// Wet mud: global wetness uniform, steep parallax (tyre ruts hold standing water), pooled-water shading.
// Height lives in the alpha channel of the ORM texture (roughnessMap.a).
import { injectGlobals } from './shared.js';
import { bakeMacro } from './textures.js';

export function applyWetMud(material, { steps = 10, uvMetres = 2.4, depth = 0.05, wet = 0.85 } = {}) {
  const U = {
    gWet: { value: wet }, gDepthUV: { value: depth / uvMetres },
    gMacroM: { value: bakeMacro() },
  };
  material.userData.wet = U.gWet;
  material.userData.parallax = { depth: U.gDepthUV, uvMetres };
  material.onBeforeCompile = (shader) => {
    injectGlobals(shader);
    Object.assign(shader.uniforms, U);
    const pars = /* glsl */`
uniform float gWet; uniform float gDepthUV; uniform sampler2D gMacroM; uniform float gfxTime;
vec2 gUv; vec2 gDx; vec2 gDy; float gPool; vec4 gORM; float gWl;
float gHt( vec2 uv ) { return textureGrad( roughnessMap, uv, gDx, gDy ).a; }
`;
    shader.fragmentShader = '#define MUD_STEPS ' + steps + '\n' + shader.fragmentShader
      .replace('#include <roughnessmap_pars_fragment>', '#include <roughnessmap_pars_fragment>\n' + pars)
      .replace('#include <map_fragment>', /* glsl */`
	gWl = mix( 0.14, 0.40, gWet );
	gUv = vMapUv; gDx = dFdx( vMapUv ); gDy = dFdy( vMapUv );
	#if MUD_STEPS > 0
	{
		float gDist = length( vViewPosition );
		if ( gDist < 26.0 ) {
			vec3 pN = normalize( vNormal );
			mat3 pT = getTangentFrame( - vViewPosition, pN, vMapUv );
			vec3 vd = normalize( vViewPosition );
			vec3 vts = vec3( dot( vd, normalize( pT[ 0 ] ) ), dot( vd, normalize( pT[ 1 ] ) ), dot( vd, pN ) );
			float nL = float( MUD_STEPS );
			vec2 P = vts.xy / max( vts.z, 0.25 ) * gDepthUV;
			vec2 dUV = P / nL; float lD = 1.0 / nL, cL = 0.0;
			vec2 uv = vMapUv;
			float cD = 1.0 - max( gHt( uv ), gWl );
			for ( int i = 0; i < MUD_STEPS; i ++ ) { if ( cL >= cD ) break; uv -= dUV; cD = 1.0 - max( gHt( uv ), gWl ); cL += lD; }
			vec2 pv = uv + dUV;
			float aft = cD - cL, bef = ( 1.0 - max( gHt( pv ), gWl ) ) - ( cL - lD );
			uv = mix( uv, pv, clamp( aft / ( aft - bef + 1e-5 ), 0.0, 1.0 ) );
			gUv = mix( uv, vMapUv, smoothstep( 12.0, 26.0, gDist ) );
		}
	}
	#endif
	gORM = textureGrad( roughnessMap, gUv, gDx, gDy );
	gPool = smoothstep( gWl + 0.035, gWl - 0.005, gORM.a );
	float gWetM = max( gPool, smoothstep( 0.5, 0.22, gORM.g ) );
	vec4 sampledDiffuseColor = textureGrad( map, gUv, gDx, gDy );
	float gMac = texture2D( gMacroM, vMapUv * 0.09 ).r;
	sampledDiffuseColor.rgb *= 0.7 + 0.6 * gMac;
	sampledDiffuseColor.rgb *= mix( 1.0, 0.55, gWet * gWetM ) * mix( 1.0, 0.8, gWet );
	sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, vec3( 0.05, 0.045, 0.03 ), gPool * gWet * 0.85 );
	diffuseColor *= sampledDiffuseColor;`)
      .replace('#include <roughnessmap_fragment>', /* glsl */`
	float roughnessFactor = roughness * mix( gORM.g, 0.2, gWet * 0.8 * gWetM );
	roughnessFactor = mix( roughnessFactor, roughnessFactor * 0.75, gWet * 0.4 );
	roughnessFactor = mix( roughnessFactor, 0.04, gPool * gWet );`)
      .replace('#include <normal_fragment_maps>', /* glsl */`
	#ifdef USE_NORMALMAP_TANGENTSPACE
	{
		vec3 mapN = textureGrad( normalMap, gUv, gDx, gDy ).xyz * 2.0 - 1.0;
		mapN.xy *= normalScale * ( 1.0 - gPool * gWet * 0.9 );
		vec2 rip = ( texture2D( normalMap, gUv * 3.0 + vec2( gfxTime * 0.03, - gfxTime * 0.02 ) ).xy * 2.0 - 1.0 ) * 0.3 * gPool * gWet;
		mapN.xy += rip;
		normal = normalize( tbn * normalize( mapN ) );
	}
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
  material.customProgramCacheKey = () => 'gfxWetMud' + steps;
  return material;
}
