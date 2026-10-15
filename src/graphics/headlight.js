import * as THREE from 'three';
import { G, tickTime } from './shared.js';

function radialTexture(size, stops) {
  const d = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = (i + 0.5) / size * 2 - 1, y = (j + 0.5) / size * 2 - 1, r = Math.sqrt(x * x + y * y);
    const v = Math.max(0, Math.min(1, stops(r, Math.atan2(y, x))));
    const p = (j * size + i) * 4; d[p] = d[p + 1] = d[p + 2] = v * 255; d[p + 3] = v * 255;
  }
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat); t.needsUpdate = true;
  t.colorSpace = THREE.SRGBColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}
let glowTex = null, goboTex = null;

const BEAM_VS = /* glsl */`
varying vec3 vL;
void main() { vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
// Back faces of the cone shell only: analytic chord length of the view ray through the (clipped) cone gives
// a cheap single-scatter volume. Dust = animated 3D value noise + sparse drifting motes sampled along the chord.
const BEAM_FS = /* glsl */`
precision highp float;
varying vec3 vL;
uniform vec3 uCamL; uniform mat4 uM; uniform vec3 uColor;
uniform float uLen, uK, uIntensity, uTime, uVis;
float h31( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float vn3( vec3 x ) { vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( h31( i ), h31( i + vec3( 1, 0, 0 ) ), f.x ), mix( h31( i + vec3( 0, 1, 0 ) ), h31( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
		mix( mix( h31( i + vec3( 0, 0, 1 ) ), h31( i + vec3( 1, 0, 1 ) ), f.x ), mix( h31( i + vec3( 0, 1, 1 ) ), h31( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }
float mote( vec3 wp ) {
	vec3 mp = wp * 2.5 + vec3( 0.0, uTime * 0.15, 0.0 );
	vec3 id = floor( mp ); vec3 f = fract( mp ) - 0.5;
	vec3 jit = vec3( h31( id + 3.1 ), h31( id + 7.7 ), h31( id + 9.3 ) ) - 0.5;
	return step( 0.82, h31( id ) ) * smoothstep( 0.13, 0.0, length( f - jit * 0.6 ) ) * ( 0.5 + 0.5 * sin( uTime * 2.0 + h31( id ) * 40.0 ) );
}
void main() {
	vec3 O = vec3( uCamL.xy, - uCamL.z );
	vec3 P = vec3( vL.xy, - vL.z );
	vec3 Dv = P - O; float tFar = length( Dv ); vec3 D = Dv / tFar;
	float k2 = uK * uK;
	float a = D.x * D.x + D.y * D.y - k2 * D.z * D.z;
	float b = 2.0 * ( O.x * D.x + O.y * D.y - k2 * O.z * D.z );
	float c = O.x * O.x + O.y * O.y - k2 * O.z * O.z;
	float disc = b * b - 4.0 * a * c;
	float t0 = 0.0, t1 = -1.0;
	if ( disc > 0.0 && abs( a ) > 1e-8 ) {
		float sq = sqrt( disc );
		float r1 = ( - b - sq ) / ( 2.0 * a ), r2 = ( - b + sq ) / ( 2.0 * a );
		if ( r1 > r2 ) { float tmp = r1; r1 = r2; r2 = tmp; }
		if ( a > 0.0 ) { t0 = r1; t1 = r2; }                     // inside between the roots
		else if ( D.z > 0.0 ) { t0 = r2; t1 = 1e4; }              // heading down the cone: inside after the far root
		else { t0 = 0.0; t1 = r1; }
	} else if ( a < 0.0 && disc <= 0.0 ) { t0 = 0.0; t1 = 1e4; }  // ray lies entirely inside the (double) cone
	if ( abs( D.z ) > 1e-5 ) {
		float za = - O.z / D.z, zb = ( uLen - O.z ) / D.z;
		t0 = max( t0, min( za, zb ) ); t1 = min( t1, max( za, zb ) );
	} else if ( O.z < 0.0 || O.z > uLen ) t1 = -1.0;
	t0 = max( t0, 0.0 );
	t1 = min( t1, tFar + 60.0 );
	float wgt = ( c < 0.0 && O.z > 0.0 && O.z < uLen ) ? 1.0 : 0.5;
	float chord = max( 0.0, t1 - t0 );
	if ( chord <= 0.0 ) discard;
	vec3 mid = O + D * ( t0 + chord * 0.5 );
	float zz = clamp( mid.z, 0.0, uLen );
	float rad = length( mid.xy ) / max( uK * zz, 1e-3 );
	float core = clamp( 1.0 - rad * rad, 0.0, 1.0 ); core *= core;
	float along = smoothstep( 0.0, 1.2, zz ) * exp( - zz * 0.09 ) * ( 1.0 - smoothstep( uLen * 0.6, uLen, zz ) );
	vec3 wm = ( uM * vec4( mid.x, mid.y, - mid.z, 1.0 ) ).xyz;
	float n = vn3( wm * 0.8 + vec3( uTime * 0.12, - uTime * 0.04, uTime * 0.09 ) ) * 0.6 + vn3( wm * 2.1 - uTime * 0.07 ) * 0.4;
	float dens = core * along * ( 0.45 + 0.9 * n );
	float haze = 1.0 - exp( - chord * dens * 0.1 );
	float m = 0.0;
	for ( int i = 0; i < 3; i ++ ) {
		float tt = t0 + chord * ( 0.2 + 0.3 * float( i ) );
		vec3 pp = O + D * tt; float zq = clamp( pp.z, 0.0, uLen );
		float rq = length( pp.xy ) / max( uK * zq, 1e-3 );
		vec3 w = ( uM * vec4( pp.x, pp.y, - pp.z, 1.0 ) ).xyz;
		m += mote( w ) * ( 1.0 - rq * rq ) * exp( - zq * 0.06 ) * step( rq, 1.0 );
	}
	float al = ( haze * 0.8 + m * 2.2 ) * uIntensity * uVis * wgt;
	gl_FragColor = vec4( uColor, al );
}`;

/**
 * attachHeadlight(obj): obj = truck.parts.headlight (forward is local -Z).
 * Adds SpotLight + volumetric beam cone + lens glow. Returns { setOn(bool), isOn, light, beam, update(dt), dispose() }.
 * Filament warm-up + subtle battery flicker run on their own rAF loop while on / fading (pass {autoTick:false}
 * and call update(dt) yourself for fixed-step control).
 */
export function attachHeadlight(obj, opts = {}) {
  const { range = 70, angle = 0.36, intensity = 2600, aimDrop = 0.9, beamLength = 26, autoTick = true, castShadow = true } = opts;
  glowTex ??= radialTexture(64, (r) => Math.pow(Math.max(0, 1 - r), 2.2));
  goboTex ??= radialTexture(128, (r, a) => {
    const hot = Math.pow(Math.max(0, 1 - r * 0.8), 0.7);
    const ring = 1 - 0.12 * Math.sin(r * 22) * Math.max(0, 1 - r) - 0.08 * Math.sin(a * 6) * r;
    return hot * ring * (r < 0.98 ? 1 : 0);
  });
  goboTex.colorSpace = THREE.NoColorSpace;

  const group = new THREE.Group(); group.name = 'HeadlightRig';
  const light = new THREE.SpotLight(0xffd7a0, 0, range, angle, 0.65, 1.7);
  light.castShadow = castShadow;
  light.shadow.mapSize.set(512, 512);
  light.shadow.camera.near = 0.35; light.shadow.camera.far = range;
  light.shadow.bias = -0.0008; light.shadow.normalBias = 0.03;
  light.map = goboTex;
  light.shadow.autoUpdate = false; light.shadow.needsUpdate = true; // allocate the map once; re-render only while lit
  light.target.position.set(0, -aimDrop, -10);
  group.add(light, light.target);

  const R = beamLength * Math.tan(angle * 0.9);
  const geo = new THREE.CylinderGeometry(R, 0.02, beamLength, 28, 1, false);
  geo.translate(0, beamLength / 2, 0); geo.rotateX(-Math.PI / 2); // apex at origin, opens toward -Z
  const beamMat = new THREE.ShaderMaterial({
    uniforms: {
      uLen: { value: beamLength }, uK: { value: R / beamLength }, uCamL: { value: new THREE.Vector3() }, uM: { value: new THREE.Matrix4() },
      uColor: { value: new THREE.Color(1.0, 0.82, 0.55) }, uIntensity: { value: 0 }, uTime: G.gfxTime, uVis: { value: 0.2 },
    },
    vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, fog: false,
  });
  const beam = new THREE.Mesh(geo, beamMat);
  beam.frustumCulled = false; beam.renderOrder = 10; beam.visible = false; beam.name = 'HeadlightBeam';
  beam.rotation.x = -Math.atan2(aimDrop, 10);
  beamMat.uniforms.uM.value = beam.matrixWorld;
  const _v = new THREE.Vector3();
  beam.onBeforeRender = (r, sc, cam) => { _v.setFromMatrixPosition(cam.matrixWorld); beam.worldToLocal(_v); beamMat.uniforms.uCamL.value.copy(_v); };
  group.add(beam);

  const lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.04, 0.03), side: THREE.DoubleSide });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.075, 20), lensMat);
  lens.position.set(0, 0, -0.03); lens.name = 'HeadlightLens';
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1, 0.8, 0.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
  glow.scale.setScalar(0.9); glow.position.set(0, 0, -0.1); glow.renderOrder = 11;
  group.add(lens, glow);
  obj.add(group);

  const COLD = new THREE.Color(1.0, 0.32, 0.08), HOT = new THREE.Color(1.0, 0.86, 0.62), tmp = new THREE.Color();
  let on = false, t = 0, level = 0, last = performance.now(), raf = 0, dipT = 0, nextDip = 4 + Math.random() * 6, clock = 0;

  function update(dt) {
    clock += dt;
    if (on) t += dt;
    // filament: slow rise with a couple of stutters
    let warm = on ? 1 - Math.exp(-t * 5.5) : 0;
    if (on && t < 0.5) warm *= 0.7 + 0.3 * Math.sin(t * 60) * Math.sin(t * 23);
    level = on ? Math.max(level, 0) + (warm - level) * Math.min(1, dt * 30) : Math.max(0, level - dt / 0.12);
    // battery flicker
    let fl = 1 + 0.025 * Math.sin(clock * 37) + 0.018 * Math.sin(clock * 91 + 1.3) + 0.012 * Math.sin(clock * 7.3);
    nextDip -= dt;
    if (nextDip < 0) { dipT = 0.07; nextDip = 5 + Math.random() * 9; }
    if (dipT > 0) { dipT -= dt; fl *= 0.8 + 0.2 * Math.abs(Math.sin(dipT * 90)); }
    const b = level * fl;
    light.intensity = intensity * b;
    tmp.copy(COLD).lerp(HOT, Math.min(1, level * 1.15)); light.color.copy(tmp);
    const night = G.gfxNight.value;
    beamMat.uniforms.uIntensity.value = b;
    beamMat.uniforms.uVis.value = 0.1 + 0.9 * night;
    beamMat.uniforms.uColor.value.copy(tmp).multiplyScalar(0.9);
    beam.visible = level > 0.01;
    lensMat.color.setRGB(tmp.r * (0.05 + 5 * b), tmp.g * (0.05 + 5 * b), tmp.b * (0.04 + 5 * b));
    glow.material.opacity = Math.min(1, b * 0.9) * (0.5 + 0.5 * night);
    glow.material.color.copy(tmp);
    light.shadow.autoUpdate = level > 0.003; // no shadow pass while off (never toggle visible/castShadow: that recompiles shaders)
  }

  function loop() {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    tickTime();
    update(dt);
    raf = (on || level > 0.003) ? requestAnimationFrame(loop) : 0;
  }
  function setOn(v) {
    if (v === on) return;
    on = !!v; if (on) t = 0;
    if (autoTick && !raf && typeof requestAnimationFrame === 'function') { last = performance.now(); raf = requestAnimationFrame(loop); }
  }
  update(0);
  return {
    setOn, get isOn() { return on; }, light, beam, group, update, get level() { return level; },
    dispose() { cancelAnimationFrame(raf); obj.remove(group); geo.dispose(); beamMat.dispose(); light.dispose(); },
  };
}
