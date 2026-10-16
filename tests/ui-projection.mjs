// Unit-style check for the results-card projection: node tests/ui-projection.mjs
import { createProjector } from '../src/ui/projection.js';
import assert from 'node:assert/strict';
const P = createProjector();
// Clementine ahead of Barnaby at 90 s; Clementine had a momentary speed dip (instantaneous speed 2 m/s) at the end.
let out;
for (let t = 60; t <= 100; t += 5) {
  out = P([{ name: 'Clementine', s: 885 + (t - 90) * 11.7 }, { name: 'Barnaby', s: 842 + (t - 90) * 11.2 }, { name: 'Ace', s: 1500 + (t - 90) * 22 }], t, t);
}
const eta = (n) => out.find((r) => r.e.name === n).eta;
console.log('etas', Object.fromEntries(out.map((r) => [r.e.name, +r.eta.toFixed(1)])));
assert(eta('Clementine') < eta('Barnaby'), 'car ahead on s projected behind a slower-or-equal car');
assert(eta('Ace') < eta('Clementine'));
// no history: falls back to race average s / elapsed
const Q = createProjector(); const o2 = Q([{ name: 'X', s: 600 }], 50, 50);
assert(Math.abs(o2[0].eta - (3218 - 3 - 600) / 12) < 0.5, 'fallback to race-average speed');
// a clearly slower car ahead on s may legitimately be projected behind
const R = createProjector(); let o3;
for (let t = 0; t <= 30; t += 5) o3 = R([{ name: 'slow', s: 900 + t * 3 }, { name: 'fast', s: 800 + t * 20 }], t + 100, t + 100);
assert(o3.find((r) => r.e.name === 'slow').eta > o3.find((r) => r.e.name === 'fast').eta);
console.log('ui-projection OK');
