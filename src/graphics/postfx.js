// Single combined post pass (+ tiny bloom chain). Scene -> HDR MSAA target -> bloom (1/2, 1/4, 1/8) -> final:
// refractive lens splatter, radial speed blur, bloom add, ACES, grading, vignette, grain, sRGB.
import * as THREE from 'three';
import { tickTime, G } from './shared.js';
import { getTier } from './quality.js';

const MAXD = 32;
const VS = /* glsl */`varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

const BRIGHT_FS = /* glsl */`
precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold;
void main() {
	vec3 c = texture2D( tSrc, vUv + uTexel * vec2( -1.0, -1.0 ) ).rgb + texture2D( tSrc, vUv + uTexel * vec2( 1.0, -1.0 ) ).rgb
		+ texture2D( tSrc, vUv + uTexel * vec2( -1.0, 1.0 ) ).rgb + texture2D( tSrc, vUv + uTexel * vec2( 1.0, 1.0 ) ).rgb;
	c = min( c * 0.25, vec3( 10.0 ) );
	float br = max( c.r, max( c.g, c.b ) );
	float knee = uThreshold * 0.5;
	float soft = clamp( br - uThreshold + knee, 0.0, 2.0 * knee ); soft = soft * soft / ( 4.0 * knee + 1e-4 );
	float w = max( soft, br - uThreshold ) / max( br, 1e-4 );
	gl_FragColor = vec4( c * w, 1.0 );
}`;
const BLUR_FS = /* glsl */`
precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uDir;
void main() {
	vec3 c = texture2D( tSrc, vUv ).rgb * 0.2270270270;
	c += ( texture2D( tSrc, vUv + uDir * 1.3846153846 ).rgb + texture2D( tSrc, vUv - uDir * 1.3846153846 ).rgb ) * 0.3162162162;
	c += ( texture2D( tSrc, vUv + uDir * 3.2307692308 ).rgb + texture2D( tSrc, vUv - uDir * 3.2307692308 ).rgb ) * 0.0702702703;
	gl_FragColor = vec4( c, 1.0 );
}`;

const FINAL_FS = /* glsl */`
precision highp float;
#define MAXD ${MAXD}
varying vec2 vUv;
uniform sampler2D tScene, tB1, tB2;
uniform float uTime, uMotion, uBloom, uVig, uGrain, uExposure, uAspect, uGrade;
uniform int uDropN;
uniform vec4 uDA[ MAXD ];
uniform vec4 uDB[ MAXD ];
float hash( vec2 p ) { p = fract( p * vec2( 443.897, 441.423 ) ); p += dot( p, p.yx + 19.19 ); return fract( ( p.x + p.y ) * p.x ); }
vec3 aces( vec3 v ) {
	v *= uExposure / 0.6;
	vec3 a = vec3( 0.59719 * v.r + 0.35458 * v.g + 0.04823 * v.b, 0.076 * v.r + 0.90834 * v.g + 0.01566 * v.b, 0.0284 * v.r + 0.13383 * v.g + 0.83777 * v.b );
	a = ( a * ( a + 0.0245786 ) - 0.000090537 ) / ( a * ( 0.983729 * a + 0.432951 ) + 0.238081 );
	return clamp( vec3( 1.60475 * a.r - 0.53108 * a.g - 0.07367 * a.b, - 0.10208 * a.r + 1.10813 * a.g - 0.00605 * a.b, - 0.00327 * a.r - 0.07276 * a.g + 1.07602 * a.b ), 0.0, 1.0 );
}
vec3 toSRGB( vec3 c ) { return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) ); }
void main() {
	vec2 uv = vUv;
	// ---- lens splatter (refraction + mud) ----
	vec2 duv = vec2( 0.0 ); vec3 mudRGB = vec3( 0.0 ); float mudA = 0.0; float spec = 0.0, rim = 0.0;
	for ( int i = 0; i < MAXD; i ++ ) {
		if ( i >= uDropN ) break;
		vec4 A = uDA[ i ]; vec4 B = uDB[ i ];
		vec2 duvRaw = uv - A.xy; vec2 d = duvRaw; d.x *= uAspect;
		float r = A.z; float el = max( B.w, 1.0 );
		if ( abs( d.x ) > r * 2.0 * el && B.z < 0.001 && abs( d.y ) > r * 2.0 * el ) continue;
		// streak axis: spray leaves the bottom of the frame outward/upward, stretched by speed (el)
		vec2 ax = normalize( vec2( ( A.x - 0.5 ) * uAspect * 0.8, 0.7 ) ); vec2 pp = vec2( - ax.y, ax.x );
		vec2 dq = vec2( dot( d, ax ) / el, dot( d, pp ) );
		float tl = B.z;
		float ty = clamp( d.y, 0.0, tl );
		float td = length( vec2( d.x, d.y - ty ) );
		float tw = r * 0.3 * ( 1.0 - 0.6 * ty / max( tl, 1e-4 ) );
		float trailM = tl > 0.0 ? ( 1.0 - smoothstep( tw * 0.55, tw, td ) ) * A.w : 0.0;
		if ( B.x < 0.5 ) {
			float dist = length( dq );
			float m = ( 1.0 - smoothstep( r * 0.9, r, dist ) ) * A.w;
			if ( m > 0.001 ) {
				#ifdef REFRACT
				duv -= duvRaw * 2.2 * m;
				#endif
				vec2 q = dq / r;
				float ring = smoothstep( 0.72, 0.95, dist / r ) * ( 1.0 - smoothstep( 0.95, 1.0, dist / r ) );
				rim += m * smoothstep( 0.6, 0.95, dist / r ) * 0.1;
				spec += m * ( smoothstep( 0.4, 0.0, length( q - vec2( -0.35, 0.4 ) ) ) * 0.9 + smoothstep( 0.35, 0.0, length( q - vec2( 0.3, -0.5 ) ) ) * 0.2 );
				spec += ring * A.w * ( 0.18 + 0.5 * max( 0.0, dot( normalize( q + 1e-4 ), vec2( -0.55, 0.8 ) ) ) ); // subtle edge highlight
			}
			#ifdef REFRACT
			duv -= vec2( d.x / uAspect, 0.0 ) * 0.45 * trailM;
			#endif
			spec += trailM * 0.05;
		} else {
			float ang = atan( dq.y, dq.x );
			float wob = 1.0 + 0.1 * sin( ang * 3.0 + B.y * 6.28 ) + 0.06 * sin( ang * 5.0 + B.y * 17.0 ) + 0.03 * sin( ang * 9.0 + B.y * 5.0 );
			float dist = length( dq ) / wob;
			float m = ( 1.0 - smoothstep( r * 0.86, r, dist ) ) * A.w;
			float thick = pow( smoothstep( 1.0, 0.12, dist / r ), 1.0 );
			#ifdef REFRACT
			duv -= duvRaw * 0.3 * m * ( 1.0 - thick );
			#endif
			vec3 col = mix( vec3( 0.28, 0.2, 0.12 ), vec3( 0.07, 0.048, 0.03 ), thick );
			col += vec3( 1.0, 0.95, 0.85 ) * smoothstep( 0.3, 0.0, length( dq / r - vec2( -0.3, 0.35 ) ) ) * 0.12 * thick;
			float ma = max( m * mix( 0.35, 0.97, thick ), trailM * 0.8 );
			mudRGB = mix( mudRGB, col, ma ); mudA = mudA + ma * ( 1.0 - mudA );
		}
	}
	vec2 suv = uv + duv;
	// ---- radial speed blur ----
	vec3 c;
	if ( uMotion > 0.0005 ) {
		vec2 dv = ( suv - 0.5 ) * uMotion; float j = hash( gl_FragCoord.xy + uTime ) - 0.5;
		c = vec3( 0.0 );
		for ( int k = 0; k < 7; k ++ ) c += texture2D( tScene, suv - dv * ( float( k ) + j ) / 6.0 ).rgb;
		c /= 7.0;
	} else c = texture2D( tScene, suv ).rgb;
	// ---- bloom ----
	c += ( texture2D( tB1, suv ).rgb * 0.5 + texture2D( tB2, suv ).rgb * 0.75 ) * uBloom;
	// ---- splatter composite (scene-lit) ----
	float L = dot( c, vec3( 0.3, 0.59, 0.11 ) );
	c = mix( c, mudRGB * ( 0.45 + 0.9 * clamp( L, 0.0, 1.5 ) ), mudA );
	c *= 1.0 - clamp( rim, 0.0, 1.0 ) * 0.15;
	c += vec3( 1.0, 0.98, 0.94 ) * spec * ( 0.15 + 0.6 * L );
	// ---- tone map + grade (display space) ----
	vec3 t = aces( c );
	vec3 s = toSRGB( t );
	float lum = dot( s, vec3( 0.2126, 0.7152, 0.0722 ) );
	float gdom = clamp( ( s.g - max( s.r, s.b ) ) * 4.0, 0.0, 1.0 );
	s = mix( s, vec3( lum ), gdom * 0.42 * uGrade );
	s.r += gdom * 0.018 * uGrade; s.b -= gdom * 0.01 * uGrade;
	s *= mix( vec3( 1.0 ), mix( vec3( 0.92, 0.99, 1.06 ), vec3( 1.06, 1.0, 0.92 ), smoothstep( 0.2, 0.85, lum ) ), 0.65 * uGrade );
	s = mix( s, s * s * ( 3.0 - 2.0 * s ), 0.2 * uGrade );
	s = s * 0.975 + 0.008;
	float vv = length( ( vUv - 0.5 ) * vec2( 1.0, 0.92 ) );
	s *= 1.0 - uVig * smoothstep( 0.28, 0.85, vv ) * smoothstep( 0.28, 0.85, vv + 0.08 );
	float n = hash( gl_FragCoord.xy + fract( uTime ) * 913.1 ) - 0.5;
	s += n * uGrain * ( 1.25 - lum );
	s += ( hash( gl_FragCoord.xy * 1.7 + 3.0 ) - 0.5 ) / 255.0;
	gl_FragColor = vec4( clamp( s, 0.0, 1.0 ), 1.0 );
}`;

export function createPostFX(renderer, scene, camera, opts = {}) {
  const gfx = renderer.userData?.gfx ?? { scale: 1, tick() {}, onScale() {} };
  const ext = renderer.extensions;
  const hdr = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
  const type = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const tier = getTier();
  const samples = opts.msaa ?? tier.msaa;
  const P = { bloom: opts.bloom ?? (tier.bloom ? 0.5 : 0), bloomThreshold: opts.bloomThreshold ?? 1.4, vignette: opts.vignette ?? 0.55, grain: opts.grain ?? 0.04, grade: opts.grade ?? tier.grade, motion: opts.motionBlur ?? (tier.motionBlur ? 1 : 0) };
  const mk = (w, h, s = 0, depth = false) => new THREE.WebGLRenderTarget(w, h, { type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: depth, samples: s, generateMipmaps: false });
  let rtScene = null, rtBright, rtA1, rtB1, rtA2, rtB2;
  const size = new THREE.Vector2();

  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const quad = new THREE.Mesh(tri, null); quad.frustumCulled = false;
  const qScene = new THREE.Scene(); qScene.add(quad);
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const sm = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, toneMapped: false });

  const brightM = sm(BRIGHT_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 } });
  const blurM = sm(BLUR_FS, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
  const dA = Array.from({ length: MAXD }, () => new THREE.Vector4()), dB = Array.from({ length: MAXD }, () => new THREE.Vector4());
  const finalM = sm(FINAL_FS, {
    tScene: { value: null }, tB1: { value: null }, tB2: { value: null }, uTime: { value: 0 }, uMotion: { value: 0 }, uBloom: { value: 0.5 },
    uVig: { value: 0.5 }, uGrain: { value: 0.04 }, uExposure: { value: 1 }, uAspect: { value: 1 }, uGrade: { value: 1 },
    uDropN: { value: 0 }, uDA: { value: dA }, uDB: { value: dB },
  });
  if (tier.refraction) finalM.defines.REFRACT = 1;

  function allocate() {
    renderer.getDrawingBufferSize(size);
    const s = gfx.scale ?? 1;
    const W = Math.max(8, Math.round(size.x * s)), H = Math.max(8, Math.round(size.y * s));
    for (const t of [rtScene, rtBright, rtA1, rtB1, rtA2, rtB2]) t?.dispose();
    rtScene = mk(W, H, samples, true);
    const bs = P.bloom > 0.001 ? 1 : 0; // bloom disabled (low tier): keep 2x2 stubs
    const sz = (d) => (bs ? Math.max(2, d) : 2);
    rtBright = mk(sz(W >> 1), sz(H >> 1));
    rtA1 = mk(sz(W >> 2), sz(H >> 2)); rtB1 = mk(rtA1.width, rtA1.height);
    rtA2 = mk(sz(W >> 3), sz(H >> 3)); rtB2 = mk(rtA2.width, rtA2.height);
    finalM.uniforms.uAspect.value = size.x / size.y;
  }
  gfx.onScale?.(() => { allocate(); if (refl.rt) allocRefl(); });
  allocate();

  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); }
  function blur(src, tmp, dst, w, h) {
    blurM.uniforms.tSrc.value = src.texture; blurM.uniforms.uDir.value.set(1 / w, 0); pass(blurM, tmp);
    blurM.uniforms.tSrc.value = tmp.texture; blurM.uniforms.uDir.value.set(0, 1 / h); pass(blurM, dst);
  }

  // ---------------- lens splatter ----------------
  const drops = [];
  const R = Math.random;
  let lastSpeed = 0;
  function addSplatter(type = 'mud', amount = 0.5) {
    const mud = type === 'mud';
    const n = Math.max(mud ? 3 : 1, Math.min(8, Math.round(1 + amount * (mud ? 7 : 7))));
    const sp = Math.min(1, lastSpeed / 14);
    for (let i = 0; i < n; i++) {
      const big = R() < 0.18 + amount * 0.2;
      const r = mud ? (big ? 0.06 + R() * 0.04 : 0.026 + R() * 0.03) : (big ? 0.022 + R() * 0.018 : 0.007 + R() * 0.013);
      const life = mud ? 9 + R() * 7 : 6 + R() * 5;
      // lower ~55% of the frame only, weighted to the bottom (wheel/road spray cannot reach the eye line)
      drops.push({ x: 0.06 + R() * 0.88, y: 0.02 + 0.53 * Math.pow(R(), 1.6), r, age: 0, life, kind: mud ? 1 : 0, seed: R(), trail: 0, elong: 1 + sp * (mud ? 1.2 : 2.0) * (0.4 + R()), delay: 0.3 + R() * (mud ? 3.5 : 1.8), vy: (mud ? 0.005 : 0.025) + R() * (mud ? 0.012 : 0.03) });
    }
    while (drops.length > Math.min(10, MAXD, tier.maxDrops)) drops.shift();
  }
  function stepDrops(dt) {
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.age += dt;
      if (d.age > d.delay) {
        const v = d.vy * Math.min(1, (d.age - d.delay) * 0.6) * (d.kind ? 0.35 : 1);
        d.y -= v * dt; d.trail += v * dt;
        d.elong = Math.max(1, d.elong - dt * 0.3); // streak relaxes into a round drop as it stops flying
        d.r *= 1 - (d.kind ? 0.004 : 0.02) * dt;
      }
      const f = d.age / d.life;
      if (f >= 1 || d.y < -0.15) drops.splice(i, 1);
    }
    for (let i = 0; i < MAXD; i++) {
      const d = drops[i];
      if (!d) continue;
      const f = d.age / d.life;
      const a = Math.min(1, d.age / 0.05) * (1 - Math.min(1, Math.max(0, (f - 0.6) / 0.4)) ** 1.5);
      dA[i].set(d.x, d.y, d.r, a); dB[i].set(d.kind, d.seed, d.trail, d.elong);
    }
    finalM.uniforms.uDropN.value = Math.min(drops.length, MAXD);
  }

  // ---------------- optional planar reflection for water (one extra low-res scene pass) ----------------
  const refl = { on: false, y: 0, scale: tier.reflScale ?? 0.4, rt: null, cam: new THREE.PerspectiveCamera(), dummy: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1), hide: [], plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0) };
  refl.dummy.needsUpdate = true;
  const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _u = new THREE.Vector3();
  function allocRefl() {
    refl.rt?.dispose();
    renderer.getDrawingBufferSize(size);
    refl.rt = new THREE.WebGLRenderTarget(Math.max(16, Math.round(size.x * refl.scale)), Math.max(16, Math.round(size.y * refl.scale)), { type, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, generateMipmaps: false });
    G.gfxReflTex.value = refl.rt.texture;
  }
  function renderReflection() {
    camera.updateMatrixWorld();
    const rc = refl.cam;
    rc.fov = camera.fov; rc.aspect = camera.aspect; rc.near = camera.near; rc.far = Math.min(camera.far, 600); rc.updateProjectionMatrix();
    _p.setFromMatrixPosition(camera.matrixWorld);
    camera.getWorldDirection(_d);
    _u.setFromMatrixColumn(camera.matrixWorld, 1);
    rc.position.set(_p.x, 2 * refl.y - _p.y, _p.z);
    rc.up.set(_u.x, -_u.y, _u.z);
    rc.lookAt(rc.position.x + _d.x, rc.position.y - _d.y, rc.position.z + _d.z);
    rc.updateMatrixWorld();
    G.gfxReflVP.value.multiplyMatrices(rc.projectionMatrix, rc.matrixWorldInverse);
    refl.plane.constant = -refl.y + 0.02;
    const prevShadow = renderer.shadowMap.autoUpdate, prevNeed = renderer.shadowMap.needsUpdate, prevClip = renderer.clippingPlanes;
    renderer.shadowMap.autoUpdate = !refl.warm; // reuse last frame's shadow maps (allocate on the very first pass)
    if (refl.warm) renderer.shadowMap.needsUpdate = false;
    refl.warm = true;
    renderer.clippingPlanes = [refl.plane];
    for (const m of refl.hide) m.visible = false;
    // water materials (including clones made by the scene) must not sample the target we are rendering into
    G.gfxReflTex.value = refl.dummy; G.gfxReflOn.value = 0;
    renderer.setRenderTarget(refl.rt);
    renderer.render(scene, rc);
    G.gfxReflTex.value = refl.rt.texture; G.gfxReflOn.value = 1;
    for (const m of refl.hide) m.visible = true;
    renderer.clippingPlanes = prevClip;
    renderer.shadowMap.autoUpdate = prevShadow; renderer.shadowMap.needsUpdate = prevNeed;
  }
  /** Mirror the scene about the horizontal plane y at ~0.4x res and feed it to the water materials.
   *  Costs one extra scene render: enable only while a puddle is on screen; call again each frame to track y. */
  function setPlanarReflection({ enabled = true, y, scale, materials = [] } = {}) {
    if (!tier.reflection) { refl.on = false; G.gfxReflOn.value = 0; return; } // low tier: PMREM sky reflection only
    if (scale && scale !== refl.scale) { refl.scale = scale; if (refl.rt) allocRefl(); }
    if (y !== undefined) refl.y = y;
    if (materials.length) refl.hide = materials;
    refl.on = enabled;
    if (enabled && !refl.rt) allocRefl();
    G.gfxReflOn.value = enabled ? 1 : 0;
  }

  let lastAuto = 0, time = 0;
  function render(dt = 1 / 60, state = {}) {
    gfx.tick?.(dt);
    tickTime();
    time += dt;
    const { speed = 0, splatter } = state;
    lastSpeed = speed;
    if (splatter) {
      const spl = typeof splatter === 'number' ? { type: 'mud', amount: splatter } : splatter;
      if (spl.amount > 0 && time - lastAuto > 0.14) { lastAuto = time; addSplatter(spl.type, spl.amount * (spl.type === 'mud' ? 0.7 : 0.35)); }
    }
    stepDrops(dt);

    if (refl.on) renderReflection();
    renderer.setRenderTarget(rtScene);
    renderer.render(scene, camera);

    const bloomOn = P.bloom > 0.001;
    if (bloomOn) {
      brightM.uniforms.tSrc.value = rtScene.texture;
      brightM.uniforms.uTexel.value.set(0.5 / rtScene.width, 0.5 / rtScene.height);
      brightM.uniforms.uThreshold.value = P.bloomThreshold;
      pass(brightM, rtBright);
      blurM.uniforms.tSrc.value = rtBright.texture; blurM.uniforms.uDir.value.set(1 / rtBright.width, 0); pass(blurM, rtA1);
      blurM.uniforms.tSrc.value = rtA1.texture; blurM.uniforms.uDir.value.set(0, 1 / rtA1.height); pass(blurM, rtB1);
      blur(rtB1, rtA2, rtB2, rtA2.width, rtA2.height);
    }
    const U = finalM.uniforms;
    U.tScene.value = rtScene.texture; U.tB1.value = rtB1.texture; U.tB2.value = rtB2.texture;
    U.uTime.value = time; U.uBloom.value = bloomOn ? P.bloom : 0;
    U.uMotion.value = P.motion * 0.02 * Math.min(1, Math.max(0, (speed - 10) / 30));
    U.uVig.value = P.vignette + Math.min(0.2, speed * 0.004); U.uGrain.value = P.grain; U.uGrade.value = P.grade;
    U.uExposure.value = renderer.toneMappingExposure;
    pass(finalM, null);
  }

  function setSize(w, h) {
    renderer.setSize(w, h);
    if (camera.isPerspectiveCamera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
    allocate();
    if (refl.rt) allocRefl();
  }

  return {
    render, setSize, addSplatter, setPlanarReflection,
    get reflectionTarget() { return refl.rt; },
    clearSplatter() { drops.length = 0; finalM.uniforms.uDropN.value = 0; },
    /** tweak at runtime: { bloom, bloomThreshold, vignette, grain, grade, motion } */
    setParams(o) { Object.assign(P, o); },
    params: P, drops,
    dispose() { for (const t of [rtScene, rtBright, rtA1, rtB1, rtA2, rtB2]) t?.dispose(); brightM.dispose(); blurM.dispose(); finalM.dispose(); tri.dispose(); },
  };
}
