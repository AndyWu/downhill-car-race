// Single combined post pass (+ tiny bloom chain). Scene -> HDR MSAA target -> bloom (1/2, 1/4, 1/8) -> final:
// refractive lens splatter, radial speed blur, bloom add, ACES, grading, vignette, grain, sRGB.
import * as THREE from 'three';
import { tickTime, G } from './shared.js';

const MAXD = 32;
const VS = /* glsl */`varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

const BRIGHT_FS = /* glsl */`
precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold;
void main() {
	vec3 c = texture2D( tSrc, vUv + uTexel * vec2( -1.0, -1.0 ) ).rgb + texture2D( tSrc, vUv + uTexel * vec2( 1.0, -1.0 ) ).rgb
		+ texture2D( tSrc, vUv + uTexel * vec2( -1.0, 1.0 ) ).rgb + texture2D( tSrc, vUv + uTexel * vec2( 1.0, 1.0 ) ).rgb;
	c = min( c * 0.25, vec3( 24.0 ) );
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
		float r = A.z;
		if ( abs( d.x ) > r * 2.0 && B.z < 0.001 ) continue;
		float tl = B.z;
		float ty = clamp( d.y, 0.0, tl );
		float td = length( vec2( d.x, d.y - ty ) );
		float tw = r * 0.34 * ( 1.0 - 0.6 * ty / max( tl, 1e-4 ) );
		float trailM = tl > 0.0 ? ( 1.0 - smoothstep( tw * 0.55, tw, td ) ) * A.w : 0.0;
		if ( B.x < 0.5 ) {
			float dist = length( d );
			float m = ( 1.0 - smoothstep( r * 0.9, r, dist ) ) * A.w;
			if ( m > 0.001 ) {
				duv -= duvRaw * 2.6 * m;
				vec2 q = d / r;
				rim += m * smoothstep( 0.65, 1.0, dist / r ) * 0.55;
				spec += m * ( smoothstep( 0.4, 0.0, length( q - vec2( -0.35, 0.4 ) ) ) * 1.2 + smoothstep( 0.35, 0.0, length( q - vec2( 0.3, -0.5 ) ) ) * 0.25 );
			}
			duv -= vec2( d.x / uAspect, 0.0 ) * 0.5 * trailM; // trail: mild streak refraction
			rim += trailM * 0.12; spec += trailM * 0.05;
		} else {
			float ang = atan( d.y, d.x );
			float wob = 1.0 + 0.1 * sin( ang * 3.0 + B.y * 6.28 ) + 0.06 * sin( ang * 5.0 + B.y * 17.0 ) + 0.03 * sin( ang * 9.0 + B.y * 5.0 );
			float dist = length( d ) / wob;
			float m = ( 1.0 - smoothstep( r * 0.93, r, dist ) ) * A.w;
			float thick = smoothstep( 1.0, 0.35, dist / r );
			vec3 col = mix( vec3( 0.26, 0.18, 0.11 ), vec3( 0.1, 0.067, 0.042 ), thick );
			col += vec3( 1.0, 0.95, 0.85 ) * smoothstep( 0.3, 0.0, length( d / r - vec2( -0.3, 0.35 ) ) ) * 0.12 * thick; // wet glint
			float ma = max( m * mix( 0.78, 0.98, thick ), trailM * 0.9 );
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
	c *= 1.0 - clamp( rim, 0.0, 1.0 ) * 0.35;
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
  const samples = opts.msaa ?? 4;
  const P = { bloom: opts.bloom ?? 0.55, bloomThreshold: opts.bloomThreshold ?? 1.0, vignette: opts.vignette ?? 0.55, grain: opts.grain ?? 0.04, grade: opts.grade ?? 1, motion: opts.motionBlur ?? 1 };
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

  function allocate() {
    renderer.getDrawingBufferSize(size);
    const s = gfx.scale ?? 1;
    const W = Math.max(8, Math.round(size.x * s)), H = Math.max(8, Math.round(size.y * s));
    for (const t of [rtScene, rtBright, rtA1, rtB1, rtA2, rtB2]) t?.dispose();
    rtScene = mk(W, H, samples, true);
    rtBright = mk(Math.max(2, W >> 1), Math.max(2, H >> 1));
    rtA1 = mk(Math.max(2, W >> 2), Math.max(2, H >> 2)); rtB1 = mk(rtA1.width, rtA1.height);
    rtA2 = mk(Math.max(2, W >> 3), Math.max(2, H >> 3)); rtB2 = mk(rtA2.width, rtA2.height);
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
  function addSplatter(type = 'mud', amount = 0.5) {
    const mud = type === 'mud';
    const n = Math.max(1, Math.round(2 + amount * (mud ? 9 : 13)));
    for (let i = 0; i < n; i++) {
      const big = R() < 0.12 + amount * 0.25;
      const r = mud ? (big ? 0.05 + R() * 0.05 * (0.5 + amount) : 0.014 + R() * 0.035) : (big ? 0.035 + R() * 0.03 : 0.008 + R() * 0.02);
      const life = mud ? 9 + R() * 8 : 6 + R() * 6;
      drops.push({ x: 0.08 + R() * 0.84, y: 0.15 + R() * 0.8, r, age: 0, life, kind: mud ? 1 : 0, seed: R(), trail: 0, delay: 0.4 + R() * 2.5 * (mud ? 2 : 1), vy: (mud ? 0.004 : 0.012) + R() * 0.02 * (r / 0.03) });
    }
    while (drops.length > MAXD) drops.shift();
  }
  function stepDrops(dt) {
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.age += dt;
      if (d.age > d.delay) {
        const v = d.vy * Math.min(1, (d.age - d.delay) * 0.5) * (d.kind ? 0.35 : 1);
        d.y -= v * dt; d.trail += v * dt;
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
      dA[i].set(d.x, d.y, d.r, a); dB[i].set(d.kind, d.seed, d.trail, 0);
    }
    finalM.uniforms.uDropN.value = Math.min(drops.length, MAXD);
  }

  // ---------------- optional planar reflection for water (one extra low-res scene pass) ----------------
  const refl = { on: false, y: 0, scale: 0.4, rt: null, cam: new THREE.PerspectiveCamera(), hide: [], plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0) };
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
    const prevShadow = renderer.shadowMap.autoUpdate, prevClip = renderer.clippingPlanes;
    renderer.shadowMap.autoUpdate = !refl.warm; // reuse last frame's shadow maps (allocate on the very first pass)
    refl.warm = true;
    renderer.clippingPlanes = [refl.plane];
    for (const m of refl.hide) m.visible = false;
    renderer.setRenderTarget(refl.rt);
    renderer.render(scene, rc);
    for (const m of refl.hide) m.visible = true;
    renderer.clippingPlanes = prevClip;
    renderer.shadowMap.autoUpdate = prevShadow;
  }
  /** Mirror the scene about the horizontal plane y at ~0.4x res and feed it to the water materials.
   *  Costs one extra scene render: enable only while a puddle is on screen; call again each frame to track y. */
  function setPlanarReflection({ enabled = true, y, scale, materials = [] } = {}) {
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
    if (splatter) {
      const spl = typeof splatter === 'number' ? { type: 'mud', amount: splatter } : splatter;
      if (spl.amount > 0 && time - lastAuto > 0.14) { lastAuto = time; addSplatter(spl.type, spl.amount * 0.35); }
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
