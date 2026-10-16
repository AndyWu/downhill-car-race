// GPU weather particles: one instanced draw call per system. Positions are computed entirely in the vertex shader
// (wrapped around the camera in a box), so the CPU only updates a handful of uniforms per frame.
import * as THREE from 'three';
import { G } from './shared.js';

const RAIN_VS = /* glsl */`
attribute vec2 corner; attribute vec4 aSeed;
uniform vec3 uCam; uniform vec3 uVel; uniform vec3 uStreak; uniform vec3 uBox; uniform float uTime; uniform vec2 uRes;
uniform float uLen; uniform float uWidth;
varying float vA;
void main() {
	vec3 q = aSeed.xyz * uBox;
	vec3 v = uVel * ( 0.85 + 0.3 * aSeed.w );
	q += v * uTime;
	q = mod( q - uCam, uBox ) - 0.5 * uBox + uCam;
	vec3 p0 = q, p1 = q - ( uStreak * ( 0.85 + 0.3 * aSeed.w ) ) * uLen;
	vec4 c0 = viewMatrix * vec4( p0, 1.0 ), c1 = viewMatrix * vec4( p1, 1.0 );
	// clip against the near plane so streaks never explode through the camera
	if ( c0.z > -0.15 || c1.z > -0.15 ) { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); vA = 0.0; return; }
	vec4 s0 = projectionMatrix * c0, s1 = projectionMatrix * c1;
	vec2 n0 = s0.xy / s0.w, n1 = s1.xy / s1.w;
	vec2 dir = ( n1 - n0 ) * uRes; float l = length( dir ); dir = l > 1e-4 ? dir / l : vec2( 0.0, -1.0 );
	vec2 perp = vec2( -dir.y, dir.x );
	vec4 sp = mix( s0, s1, corner.y );
	vec2 off = perp * corner.x * uWidth * ( 1.0 + 0.8 * aSeed.w ) / uRes * sp.w * 2.0;
	gl_Position = sp + vec4( off, 0.0, 0.0 );
	float dist = -c0.z;
	vA = smoothstep( uBox.z * 0.5, uBox.z * 0.3, dist ) * smoothstep( 0.3, 1.5, dist ) * ( 0.45 + 0.55 * aSeed.w ) * ( 1.0 - 0.35 * corner.y );
}`;
const RAIN_FS = /* glsl */`
precision mediump float; uniform vec3 uColor; uniform float uAlpha; varying float vA;
void main() { gl_FragColor = vec4( uColor, vA * uAlpha ); }`;

const SNOW_VS = /* glsl */`
attribute vec4 aSeed;
uniform vec3 uCam; uniform vec3 uVel; uniform vec3 uBox; uniform float uTime; uniform float uScale;
varying float vA; varying float vR;
void main() {
	vec3 q = aSeed.xyz * uBox;
	float ph = aSeed.w * 6.2831;
	vec3 v = uVel * ( 0.6 + 0.8 * aSeed.w );
	q += v * uTime;
	q.x += sin( uTime * 0.7 + ph ) * 0.6; q.z += cos( uTime * 0.55 + ph * 1.7 ) * 0.6;
	q = mod( q - uCam, uBox ) - 0.5 * uBox + uCam;
	vec4 mv = viewMatrix * vec4( q, 1.0 );
	float d = max( -mv.z, 0.1 );
	gl_Position = projectionMatrix * mv;
	gl_PointSize = clamp( uScale * ( 0.35 + aSeed.w ) / d, 2.0, 26.0 );
	vA = smoothstep( uBox.z * 0.5, uBox.z * 0.25, d ) * smoothstep( 0.2, 1.0, d ) * ( mv.z < 0.0 ? 1.0 : 0.0 );
	vR = aSeed.w;
}`;
const SNOW_FS = /* glsl */`
precision mediump float; uniform vec3 uColor; uniform float uAlpha; varying float vA; varying float vR;
void main() {
	vec2 c = gl_PointCoord * 2.0 - 1.0; float r2 = dot( c, c );
	float a = smoothstep( 1.0, 0.15, r2 ) * vA * uAlpha;
	gl_FragColor = vec4( uColor, a );
}`;

export const COUNTS = {
  low: { rain: 1000, snow: 700 },
  medium: { rain: 2500, snow: 1800 },
  default: { rain: 5000, snow: 3500 },
  high: { rain: 7000, snow: 4500 },
};

function seeds(n, attrName = 'aSeed') {
  const a = new Float32Array(n * 4);
  let s = 1234567;
  const R = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < n * 4; i++) a[i] = R();
  return a;
}

export function createWeatherParticles(scene, tierName = 'default', renderer = null) {
  const counts = COUNTS[tierName] || COUNTS.default;
  const common = () => ({ uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(0.7, 0.75, 0.8) } });

  // ---- rain: instanced camera-aligned ribbons
  const rg = new THREE.InstancedBufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  rg.setAttribute('corner', new THREE.Float32BufferAttribute([-0.5, 0, 0.5, 0, -0.5, 1, 0.5, 1], 2));
  rg.setIndex([0, 1, 2, 1, 3, 2]);
  rg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds(counts.rain), 4));
  rg.instanceCount = counts.rain;
  const ru = Object.assign(common(), { uVel: { value: new THREE.Vector3(0, -16, 0) }, uStreak: { value: new THREE.Vector3(0, -16, 0) }, uBox: { value: new THREE.Vector3(26, 16, 26) }, uRes: { value: new THREE.Vector2(1024, 768) }, uLen: { value: 0.045 }, uWidth: { value: 1.1 } });
  const rain = new THREE.Mesh(rg, new THREE.ShaderMaterial({ uniforms: ru, vertexShader: RAIN_VS, fragmentShader: RAIN_FS, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  rain.frustumCulled = false; rain.renderOrder = 20; rain.visible = false; rain.name = 'RainStreaks';

  // ---- snow: points
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(counts.snow * 3), 3));
  sg.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds(counts.snow), 4));
  const su = Object.assign(common(), { uVel: { value: new THREE.Vector3(0.4, -1.6, 0.1) }, uBox: { value: new THREE.Vector3(30, 18, 30) }, uScale: { value: 14 } });
  const snow = new THREE.Points(sg, new THREE.ShaderMaterial({ uniforms: su, vertexShader: SNOW_VS, fragmentShader: SNOW_FS, transparent: true, depthWrite: false, fog: false }));
  snow.frustumCulled = false; snow.renderOrder = 20; snow.visible = false; snow.name = 'SnowFall';
  scene.add(rain, snow);

  const camV = new THREE.Vector3(), lastCam = new THREE.Vector3(); let haveLast = false, t = 0;
  return {
    rain, snow,
    /** @param {{rain:number, snow:number, wind:number, color:THREE.Color, night:number}} W */
    update(dt, camera, speed, W) {
      t += dt;
      camera.getWorldPosition(camV);
      const vel = new THREE.Vector3();
      if (haveLast && dt > 0) vel.copy(camV).sub(lastCam).divideScalar(Math.max(dt, 1e-3)); // camera velocity (m/s)
      lastCam.copy(camV); haveLast = true;
      if (vel.length() > 60) vel.setLength(60);
      const wind = W.wind;
      // rain: fall velocity relative to the moving camera -> slanted, longer streaks at speed
      rain.visible = W.rain > 0.01;
      if (rain.visible) {
        ru.uCam.value.copy(camV); ru.uTime.value = t;
        ru.uVel.value.set(wind * 5, -16, wind * -2);
        ru.uStreak.value.copy(ru.uVel.value).sub(vel.multiplyScalar(0.8));
        ru.uLen.value = 0.03 + 0.012 * Math.min(4, ru.uStreak.value.length() / 16);
        ru.uAlpha.value = 0.34 * Math.min(1, W.rain * 1.2) * (0.35 + 0.65 * (1 - W.night * 0.75));
        ru.uColor.value.copy(W.color).multiplyScalar(0.75);
        const dpr = Math.min(2, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
        if (renderer) { const sz = renderer.getDrawingBufferSize(_v2); ru.uRes.value.copy(sz); ru.uWidth.value = 0.8; }
        rg.instanceCount = Math.max(1, Math.round(counts.rain * Math.min(1, 0.3 + W.rain)));
      }
      snow.visible = W.snow > 0.01;
      if (snow.visible) {
        su.uCam.value.copy(camV); su.uTime.value = t;
        su.uVel.value.set(wind * 2 + 0.3, -1.5, 0.1);
        su.uAlpha.value = 0.9 * Math.min(1, W.snow * 1.3) * (0.45 + 0.55 * (1 - W.night * 0.6));
        su.uColor.value.copy(W.color);
        const h = renderer ? renderer.getDrawingBufferSize(_v2).y : 768;
        su.uScale.value = 0.085 * h;
      }
    },
    dispose() { rg.dispose(); sg.dispose(); rain.material.dispose(); snow.material.dispose(); scene.remove(rain, snow); },
  };
}
const _v2 = new THREE.Vector2();
