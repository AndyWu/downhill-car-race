// Mud splash coat for vehicles: applyMudCoat(materialOrObject3D) -> { set(0..1), get(), dispose() }.
// Mask rises from the bottom of the truck (truck-local space, noisy edge, biased to the rear / wheel arches),
// wet-mud albedo + low roughness, dries to rougher/lighter as `set` falls.
import * as THREE from 'three';
import { injectGlobals } from './shared.js';

const _inv = new THREE.Matrix4();

function patch(material, H) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(material, shader, renderer); else injectGlobals(shader);
    shader.uniforms.gMudAmt = H.amt; shader.uniforms.gMudInv = H.inv; shader.uniforms.gMudBase = H.base;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMudW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
	{
		vec4 mw = vec4( transformed, 1.0 );
		#ifdef USE_INSTANCING
			mw = instanceMatrix * mw;
		#endif
		vMudW = ( modelMatrix * mw ).xyz;
	}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vMudW; uniform float gMudAmt; uniform mat4 gMudInv; uniform float gMudBase;
float mh( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float mn( vec3 x ) { vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( mh( i ), mh( i + vec3( 1, 0, 0 ) ), f.x ), mix( mh( i + vec3( 0, 1, 0 ) ), mh( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
		mix( mix( mh( i + vec3( 0, 0, 1 ) ), mh( i + vec3( 1, 0, 1 ) ), f.x ), mix( mh( i + vec3( 0, 1, 1 ) ), mh( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
	if ( gMudAmt > 0.001 ) {
		vec3 lp = ( gMudInv * vec4( vMudW, 1.0 ) ).xyz;
		float hAbove = lp.y - gMudBase;
		float nz = mn( lp * 6.0 ) * 0.6 + mn( lp * 19.0 ) * 0.3 + mn( lp * 47.0 ) * 0.1;
		float rear = smoothstep( -0.6, 0.9, lp.z ) * 0.18;
		float lvl = gMudAmt * 1.15 + rear * gMudAmt;
		float m = smoothstep( 0.0, 0.18, lvl * ( 0.55 + 0.9 * nz ) - hAbove );
		m = clamp( m + step( 0.74, nz ) * gMudAmt * 0.35 * smoothstep( 0.9, 0.0, hAbove ), 0.0, 1.0 ); // flung speckles higher up
		float dry = smoothstep( 0.7, 0.2, gMudAmt );
		vec3 mudC = mix( vec3( 0.075, 0.052, 0.034 ), vec3( 0.2, 0.15, 0.1 ), dry * ( 0.4 + 0.6 * nz ) ) * ( 0.7 + 0.6 * nz );
		diffuseColor.rgb = mix( diffuseColor.rgb, mudC, m );
		roughnessFactor = mix( roughnessFactor, mix( 0.3, 0.88, dry ), m );
		metalnessFactor *= 1.0 - m;
	}`);
  };
  const prevKey = material.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : () => '';
  material.customProgramCacheKey = () => prevKey() + '|mudcoat';
  material.needsUpdate = true;
}

function rootOf(o) { while (o.parent && !o.parent.isScene) o = o.parent; return o; }

/**
 * applyMudCoat(material)  -> patches that material in place (clone it first if it is shared!). The "truck-local" frame is
 *                            the topmost ancestor below the scene (buildTruck().group).
 * applyMudCoat(object3d)  -> clones every mesh material under it, patches them, uses `object3d` as the local frame.
 * Truck-local convention: y up, origin = chassis centre at axle height, mud starts at y = -0.4 (`opts.base`).
 * handle.set(v) 0..1 — call every frame from the physics state, e.g. v += dt*0.15 in mud, -= dt*0.01 otherwise.
 */
export function applyMudCoat(target, opts = {}) {
  const H = { amt: { value: 0 }, inv: { value: new THREE.Matrix4() }, base: { value: opts.base ?? -0.4 }, root: null, frame: -1 };
  const hook = (mat, getRoot) => {
    patch(mat, H);
    const prevBR = mat.onBeforeRender;
    mat.onBeforeRender = function (renderer, scene, camera, geometry, object, group) {
      if (prevBR) prevBR.call(this, renderer, scene, camera, geometry, object, group);
      const r = H.root || rootOf(object);
      if (H.amt.value > 0.001) {
        r.updateWorldMatrix(true, false);
        H.inv.value.copy(r.matrixWorld).invert();
        this.uniformsNeedUpdate = true;
      }
    };
  };
  const mats = [];
  if (target.isMaterial) { hook(target); mats.push(target); }
  else {
    H.root = target;
    target.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const arr = Array.isArray(o.material) ? o.material : [o.material];
      const cl = arr.map((m) => { const c = m.clone(); c.onBeforeCompile = m.onBeforeCompile; if (m.customProgramCacheKey) c.customProgramCacheKey = m.customProgramCacheKey; hook(c); mats.push(c); return c; });
      o.material = Array.isArray(o.material) ? cl : cl[0];
    });
  }
  return {
    set(v) { H.amt.value = Math.min(1, Math.max(0, v)); },
    get() { return H.amt.value; },
    add(dv) { H.amt.value = Math.min(1, Math.max(0, H.amt.value + dv)); },
    materials: mats,
    dispose() { for (const m of mats) m.dispose(); },
  };
}
