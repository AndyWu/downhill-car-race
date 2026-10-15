// Analytic sky dome: gradient + haze band, sun/moon disc with mie glow, FBM clouds, stars.
import * as THREE from 'three';

export function createSky() {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uZenith: { value: new THREE.Color(0x4a7fb8) },
    uHorizon: { value: new THREE.Color(0xbfd0d8) },
    uGround: { value: new THREE.Color(0x7d7a6e) },
    uHaze: { value: new THREE.Color(0xd8d9d0) },
    uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
    uGlow: { value: 0.35 },          // mie glow strength
    uDisc: { value: 40 },            // disc radiance (HDR -> bloom)
    uDiscScale: { value: 1 },        // 0 while baking the PMREM
    uDiscSize: { value: 0.99985 },   // cos(angular radius)
    uCover: { value: 0.5 },          // 0 clear .. 1 overcast
    uCloudLit: { value: new THREE.Color(1, 0.97, 0.92) },
    uCloudShade: { value: new THREE.Color(0.45, 0.5, 0.58) },
    uStars: { value: 0 },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'sky', uniforms, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    vertexShader: /* glsl */`
varying vec3 vDir;
void main() {
	vDir = position;
	vec4 p = projectionMatrix * vec4( mat3( viewMatrix ) * position, 1.0 );
	gl_Position = p.xyww;
}`,
    fragmentShader: /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 uSunDir, uZenith, uHorizon, uGround, uHaze, uSunColor, uCloudLit, uCloudShade;
uniform float uGlow, uDisc, uDiscScale, uDiscSize, uCover, uStars, uTime;
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
float h21( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float h31( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float vn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( h21( i ), h21( i + vec2( 1, 0 ) ), f.x ), mix( h21( i + vec2( 0, 1 ) ), h21( i + 1.0 ), f.x ), f.y ); }
float fbm( vec2 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 5; i ++ ) { s += a * vn( p ); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
void main() {
	vec3 d = normalize( vDir );
	float h = d.y;
	vec3 col = mix( uHorizon, uZenith, pow( clamp( h, 0.0, 1.0 ), 0.42 ) );
	col = mix( col, uHaze, exp( - max( h, 0.0 ) * 7.0 ) * 0.55 );
	if ( h < 0.0 ) col = mix( uHorizon * 0.9, uGround, smoothstep( 0.0, - 0.25, h ) );
	float sd = max( dot( d, uSunDir ), 0.0 );
	vec3 glow = uSunColor * ( pow( sd, 6.0 ) * 0.25 + pow( sd, 40.0 ) * 0.6 + pow( sd, 400.0 ) * 1.2 ) * uGlow;
	col += glow * smoothstep( - 0.1, 0.1, h + 0.05 );
	// clouds on a virtual plane
	float cl = 0.0; vec3 cc = uCloudLit;
	if ( h > 0.005 ) {
		vec2 p = d.xz / ( h + 0.12 ) * 1.1 + vec2( uTime * 0.004, uTime * 0.0015 );
		float n = fbm( p );
		float thr = mix( 0.78, 0.36, uCover );
		cl = smoothstep( thr, thr + 0.22, n ) * smoothstep( 0.0, 0.16, h );
		float n2 = fbm( p + uSunDir.xz * 0.12 / ( h + 0.2 ) );
		float lit = clamp( 0.55 + ( n - n2 ) * 3.5, 0.0, 1.0 );
		cc = mix( uCloudShade, uCloudLit, lit );
		cc += uSunColor * pow( sd, 8.0 ) * 0.5 * ( 1.0 - cl * 0.5 );
		col = mix( col, mix( cc, uHaze, exp( - h * 5.0 ) * 0.5 ), cl * 0.92 );
	}
	// stars
	if ( uStars > 0.01 && h > 0.0 ) {
		vec3 q = d * 140.0; vec3 id = floor( q ); vec3 f = fract( q ) - 0.5;
		float r = h31( id );
		float star = step( 0.972, r ) * smoothstep( 0.35, 0.0, length( f ) ) * ( 0.4 + 0.6 * h31( id + 7.0 ) );
		col += vec3( 0.85, 0.9, 1.0 ) * star * uStars * 2.5 * ( 1.0 - cl ) * smoothstep( 0.0, 0.2, h );
	}
	// disc
	float disc = smoothstep( uDiscSize, uDiscSize + 0.00012, sd );
	col += uSunColor * disc * uDisc * uDiscScale * ( 1.0 - cl * 0.85 ) * step( - 0.02, h );
	gl_FragColor = vec4( col, 1.0 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'SkyDome';
  return { mesh, material: mat, uniforms };
}
