// Hex-tiled stochastic texture sampling (Mikkelsen-style): three offset fetches blended on a triangular grid,
// so no visible repetition grid. mode 'full' replaces map/normal/ORM sampling; 'detail' keeps the base sampling
// (coherent tyre ruts) and multiplies a hex-sampled, differently scaled detail layer on top (breaks the tile repeat).
const HEX = /* glsl */`
vec2 gxHash( vec2 p ) { return fract( sin( vec2( dot( p, vec2( 127.1, 311.7 ) ), dot( p, vec2( 269.5, 183.3 ) ) ) ) * 43758.5453 ); }
void gxHex( vec2 uv, out vec2 o1, out vec2 o2, out vec2 o3, out vec3 w ) {
	vec2 sk = mat2( 1.0, 0.0, - 0.57735027, 1.15470054 ) * ( uv * gxScale );
	vec2 base = floor( sk ); vec3 t = vec3( fract( sk ), 0.0 ); t.z = 1.0 - t.x - t.y;
	vec2 v1, v2, v3;
	if ( t.z > 0.0 ) { w = vec3( t.z, t.y, t.x ); v1 = base; v2 = base + vec2( 0.0, 1.0 ); v3 = base + vec2( 1.0, 0.0 ); }
	else { w = vec3( - t.z, 1.0 - t.y, 1.0 - t.x ); v1 = base + vec2( 1.0, 1.0 ); v2 = base + vec2( 1.0, 0.0 ); v3 = base + vec2( 0.0, 1.0 ); }
	o1 = gxHash( v1 ); o2 = gxHash( v2 ); o3 = gxHash( v3 );
	w = pow( w, vec3( 6.0 ) ); w /= ( w.x + w.y + w.z );
}
vec2 gxO1, gxO2, gxO3; vec3 gxW; vec2 gxUv, gxDx, gxDy;
vec4 gxTex( sampler2D t ) {
	return textureGrad( t, gxUv + gxO1, gxDx, gxDy ) * gxW.x + textureGrad( t, gxUv + gxO2, gxDx, gxDy ) * gxW.y + textureGrad( t, gxUv + gxO3, gxDx, gxDy ) * gxW.z;
}
`;

export function applyStochastic(material, { mode = 'full', scale = 3.0, detailScale = 2.3, detailStrength = 0.55, detailMean = 0.12 } = {}) {
  const prev = material.onBeforeCompile;
  const U = { gxScale: { value: scale } };
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(material, shader, renderer);
    Object.assign(shader.uniforms, U);
    let fs = shader.fragmentShader.replace('#include <roughnessmap_pars_fragment>', '#include <roughnessmap_pars_fragment>\nuniform float gxScale;\n' + HEX + '\nvec4 gxORM = vec4( 1.0 );');
    if (mode === 'full') {
      fs = fs
        .replace('#include <map_fragment>', `
	gxUv = vMapUv; gxDx = dFdx( vMapUv ); gxDy = dFdy( vMapUv );
	gxHex( gxUv, gxO1, gxO2, gxO3, gxW );
	vec4 sampledDiffuseColor = gxTex( map );
	diffuseColor *= sampledDiffuseColor;
	// GFX_MAP_END`)
        .replace('#include <roughnessmap_fragment>', `
	float roughnessFactor = roughness;
	#ifdef USE_ROUGHNESSMAP
		gxORM = gxTex( roughnessMap );
		roughnessFactor *= gxORM.g;
	#endif`)
        .replace('#include <normal_fragment_maps>', `
	#ifdef USE_NORMALMAP_TANGENTSPACE
	{
		vec3 mapN = gxTex( normalMap ).xyz * 2.0 - 1.0;
		mapN.xy *= normalScale;
		normal = normalize( tbn * normalize( mapN ) );
	}
	#endif`)
        .replace('#include <aomap_fragment>', `
	#ifdef USE_AOMAP
		float ambientOcclusion = ( gxORM.r - 1.0 ) * aoMapIntensity + 1.0;
		reflectedLight.indirectDiffuse *= ambientOcclusion;
	#endif`);
    } else {
      fs = fs.replace('#include <map_fragment>', `#include <map_fragment>
	#ifdef USE_MAP
	{
		gxUv = vMapUv * ${detailScale.toFixed(3)} + 0.37; gxDx = dFdx( gxUv ); gxDy = dFdy( gxUv );
		gxHex( gxUv, gxO1, gxO2, gxO3, gxW );
		vec3 dd = gxTex( map ).rgb;
		float dl = dot( dd, vec3( 0.3, 0.59, 0.11 ) );
		diffuseColor.rgb *= mix( 1.0, clamp( dl / ${detailMean.toFixed(3)}, 0.45, 1.6 ), ${detailStrength.toFixed(2)} );
	}
	#endif
	// GFX_MAP_END`);
    }
    shader.fragmentShader = fs;
  };
  const prevKey = material.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : () => '';
  material.customProgramCacheKey = () => prevKey() + '|gx' + mode;
  material.needsUpdate = true;
  return material;
}
