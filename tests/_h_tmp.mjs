import * as THREE from 'three';
import { createWorld } from '../src/scene/index.js';
const w = await createWorld(new THREE.Scene(), { seed: 1, trackId: 'village' });
console.log(JSON.stringify((w.track.splits||[]).map(s=>({id:s.id,from:s.fromS,to:s.toS}))));
for (const h of w.hazards) if ([[780,830],[1250,1300],[1800,1840],[2780,2810]].some(([a,b])=>h.s>a-40&&h.s<b+40)) console.log(h.type,h.s.toFixed(0),h.lateral?.toFixed?.(1),h.splitId,h.pathIndex,h.halfLength,h.halfWidth,h.radius);
