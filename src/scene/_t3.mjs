import * as THREE from 'three';
const { createWorld } = await import('./index.js');
const w = await createWorld(new THREE.Scene(), { seed: 1, trackId: 'village' });
let bad = [];
for (let s = 5; s <= 3218; s += 3.1) { const f = w.track.sampleAt(s); const p = f.position.clone().addScaledVector(f.right, 1.5); const r = w.track.project(p, s - 0.5); if (Math.abs(r.s - s) > 0.5 || Math.abs(r.lateral - 1.5) > 0.5) bad.push(`${s.toFixed(0)}->${r.s.toFixed(1)}/${r.lateral.toFixed(1)}/${r.pathIndex}`); }
console.log(bad.length, bad.slice(0, 20).join(' '));
console.log(JSON.stringify(w.splits.map(s => s.paths.map(p => p.name + ':' + p.length + ':' + p.width))));
console.log('hazards', w.hazards.length, w.hazards.filter(h=>h.splitId).length);
