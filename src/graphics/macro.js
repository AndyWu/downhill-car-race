// Anti-tiling: multiplies albedo by two large-scale noise samples (lightness + warm/cool drift) in UV space.
import { bakeMacro } from './textures.js';

export function applyMacro(material, { scale = 0.09, strength = 0.45, tint = 0.5 } = {}) {
  const prev = material.onBeforeCompile;
  const U = { gMacroT: { value: bakeMacro() }, gMS: { value: scale }, gStr: { value: strength }, gTint: { value: tint } };
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(material, shader, renderer);
    Object.assign(shader.uniforms, U);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform sampler2D gMacroT; uniform float gMS, gStr, gTint;')
      .replace(/#include <map_fragment>|\/\/ GFX_MAP_END/, (m) => m + `
	#ifdef USE_MAP
	{
		float gMv = texture2D( gMacroT, vMapUv * gMS ).r * 0.6 + texture2D( gMacroT, vMapUv * gMS * 0.31 + 0.5 ).r * 0.4;
		diffuseColor.rgb *= ( 1.0 - gStr ) + gStr * 2.0 * gMv;
		diffuseColor.rgb *= mix( vec3( 1.0 ), mix( vec3( 1.05, 1.0, 0.92 ), vec3( 0.94, 1.0, 1.06 ), gMv ), gTint );
	}
	#endif
	`);
  };
  material.userData.macro = U;
  return material;
}
