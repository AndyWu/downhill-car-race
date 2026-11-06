import * as THREE from 'three';
const { createWorld } = await import('../src/scene/index.js');
const w = await createWorld(new THREE.Scene(), { seed: 1, trackId: 'corn' });
const [a,b]=[Number(process.argv[2]),Number(process.argv[3])];
for (const h of w.hazards) if (h.s>a&&h.s<b) console.log(h.type,h.s.toFixed(0),h.lateral?.toFixed(1),h.radius,h.halfLength,h.halfWidth);
for (let s=a;s<b;s+=10){const m=w.track.sampleAt(s);console.log(s,'w',m.width.toFixed(1),'slope?',m.position.y.toFixed(1));}
