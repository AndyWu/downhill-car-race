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
varying float vT; varying vec3 vW; varying vec3 vN; varying vec3 vV;
uniform float uLen;
void main() {
	vT = clamp( - position.z / uLen, 0.0, 1.0 );
	vec4 wp = modelMatrix * vec4( position, 1.0 );
	vW = wp.xyz;
	vN = normalize( normalMatrix * normal );
	vec4 mv = viewMatrix * wp;
	vV = - mv.xyz;
	gl_Position = projectionMatrix * mv;
}`;
const BEAM_FS = /* glsl */`
precision highp float;
varying float vT; varying vec3 vW; varying vec3 vN; varying vec3 vV;
uniform vec3 uColor; uniform float uIntensity, uTime, uVis;
float h31( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float vn3( vec3 x ) { vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( h31( i ), h31( i + vec3( 1, 0, 0 ) ), f.x ), mix( h31( i + vec3( 0, 1, 0 ) ), h31( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
		mix( mix( h31( i + vec3( 0, 0, 1 ) ), h31( i + vec3( 1, 0, 1 ) ), f.x ), mix( h31( i + vec3( 0, 1, 1 ) ), h31( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }
void main() {
	float e = abs( dot( normalize( vN ), normalize( vV ) ) );
	float edge = pow( e, 1.7 );
	float along = smoothstep( 0.0, 0.07, vT ) * pow( 1.0 - vT, 1.5 );
	vec3 q = vW * 0.9 + vec3( uTime * 0.15, - uTime * 0.05, uTime * 0.1 );
	float n = vn3( q ) * 0.6 + vn3( q * 2.3 ) * 0.4;
	float haze = edge * ( 0.45 + 0.9 * n );
	// drifting dust motes
	vec3 mp = vW * 3.0 + vec3( 0.0, uTime * 0.18, 0.0 );
	vec3 id = floor( mp ); vec3 f = fract( mp ) - 0.5;
	float r = h31( id );
	vec3 jit = vec3( h31( id + 3.1 ), h31( id + 7.7 ), h31( id + 9.3 ) ) - 0.5;
	float mote = step( 0.86, r ) * smoothstep( 0.16, 0.0, length( f - jit * 0.6 ) ) * ( 0.5 + 0.5 * sin( uTime * 2.0 + r * 40.0 ) );
	float a = ( haze * 0.30 + mote * edge * 1.6 ) * along * uIntensity * uVis;
	gl_FragColor = vec4( uColor * a, a );
}`;

/**
 * attachHeadlight(obj): obj = truck.parts.headlight (forward is local -Z).
 * Adds SpotLight + volumetric beam cone + lens glow. Returns { setOn(bool), isOn, light, beam, update(dt), dispose() }.
 * Filament warm-up + subtle battery flicker run on their own rAF loop while on / fading (pass {autoTick:false}
 * and call update(dt) yourself for fixed-step control).
 */
export function attachHeadlight(obj, opts = {}) {
  const { range = 70, angle = 0.36, intensity = 900, beamLength = 26, autoTick = true, castShadow = true } = opts;
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
  light.target.position.set(0, -0.35, -10);
  group.add(light, light.target);

  const R = beamLength * Math.tan(angle * 0.85);
  const geo = new THREE.CylinderGeometry(R, 0.03, beamLength, 28, 1, true);
  geo.translate(0, beamLength / 2, 0); geo.rotateX(-Math.PI / 2);
  // tilt cone to match target direction (slightly downward)
  geo.rotateX(-Math.atan2(0.35, 10));
  const beamMat = new THREE.ShaderMaterial({
    uniforms: {
      uLen: { value: beamLength }, uColor: { value: new THREE.Color(1.0, 0.82, 0.55) }, uIntensity: { value: 0 },
      uTime: G.gfxTime, uVis: { value: 0.2 },
    },
    vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, fog: false,
  });
  const beam = new THREE.Mesh(geo, beamMat);
  beam.frustumCulled = false; beam.renderOrder = 10; beam.visible = false; beam.name = 'HeadlightBeam';
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
