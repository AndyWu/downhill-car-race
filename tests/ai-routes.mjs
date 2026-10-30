// Route-choice unit test on a synthetic village: the country world with 2 fake splits (alternative streets shifted sideways).
// Real village worlds come from createWorld({trackId:'village'}); this checks the AI side of the contract offline.
import * as THREE from 'three';
import { AI_ROSTER, createAIDriver, createRng } from '../src/ai/index.js';
const { createWorld } = await import('../src/scene/index.js');
const base = await createWorld(new THREE.Scene(), { seed: 1 });
const splits = [
  { id: 0, fromS: 700, toS: 950, paths: [{ index: 0, name: 'market', length: 250, width: 6.5 }, { index: 1, name: 'alley', length: 262, width: 3.6 }, { index: 2, name: 'riverside', length: 258, width: 5.5 }] },
  { id: 1, fromS: 1800, toS: 2050, paths: [{ index: 0, name: 'main', length: 250, width: 6.5 }, { index: 1, name: 'lane', length: 244, width: 4.2 }] },
];
const shift = (s, choice) => { for (const sp of splits) { const k = choice?.[sp.id] ?? 0; if (k && s > sp.fromS && s < sp.toS) { const u = (s - sp.fromS) / (sp.toS - sp.fromS); return { k, off: (k === 1 ? 7 : -7) * Math.sin(Math.PI * u) ** 2, w: sp.paths[k].width }; } } return null; };
const world = {
  ...base, splits, flags: { closed: false, laps: 1, flat: false, noStuckRescue: false },
  track: { ...base.track, lapLength: base.track.length, sampleAt(s, choice) { const f = base.track.sampleAt(s); const sh = shift(s, choice); if (sh) { f.position = f.position.clone().addScaledVector(f.right, sh.off); f.width = sh.w; } return f; } },
  hazards: base.hazards.concat([{ type: 'rock', kind: 'rock', s: 800, lateral: 0, radius: 1.5, halfLength: 6, halfWidth: 2, splitId: 0, pathIndex: 0 }, { type: 'mud', kind: 'mud', s: 880, lateral: 0, radius: 3, halfLength: 12, halfWidth: 1.5, splitId: 0, pathIndex: 2 }]),
};
const out = {};
for (const p of AI_ROSTER) {
  const picks = [];
  for (let k = 0; k < 5; k++) picks.push(JSON.stringify(createAIDriver(p, { world, rng: createRng(7 + k) }).choice));
  out[p.name] = picks;
  console.log(p.name.padEnd(10), picks.join(' '));
}
const fails = [];
const same = (n) => new Set(out[n]).size === 1;
if (!same('Ace') || !same('Buster') || !same('Clementine')) fails.push('deterministic personalities should always pick the same streets');
if (new Set(out.Barnaby).size < 2 && new Set(out.Tilly).size < 2) fails.push('random drivers never varied');
if (JSON.parse(out.Clementine[0])[0] === 1) fails.push('Clementine should avoid the narrow alley');
const d1 = createAIDriver(AI_ROSTER[8], { world, rng: createRng(1) }), d2 = createAIDriver(AI_ROSTER[8], { world, rng: createRng(1) });
if (JSON.stringify(d1.choice) !== JSON.stringify(d2.choice)) fails.push('not deterministic');
console.log(fails.length ? 'FAIL:\n - ' + fails.join('\n - ') : 'ALL ROUTE ASSERTIONS PASSED');
process.exit(fails.length ? 1 : 0);
