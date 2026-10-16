// Headless test for lens splatter: node tests/splatter-sim.mjs
import { createSplatterSim, MIN_WET_STEPS } from '../src/graphics/splatter.js';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// 1. frame-rate independence: 3 s of mud contact at intensity 0.5, rendered at three dts
const totals = {};
for (const dt of [1 / 60, 1 / 30, 0.25]) {
  const s = createSplatterSim({ rng: mulberry(7) });
  let maxR = 0, maxVis = 0;
  for (let t = 0; t < 3 - 1e-9; t += dt) {
    s.contact('mud', 0.5, dt, 0); s.step(dt);
    for (const d of s.drops) maxR = Math.max(maxR, d.r);
    maxVis = Math.max(maxVis, s.drops.length);
  }
  totals[dt] = s.spawned;
  ok(maxVis <= 10, `dt=${dt.toFixed(3)}: visible drops <= 10 (max ${maxVis})`);
  ok(maxR <= 0.101, `dt=${dt.toFixed(3)}: drop radius capped (max ${maxR.toFixed(3)})`);
}
const v = Object.values(totals);
ok(Math.max(...v) - Math.min(...v) <= 2, `spawned counts match across frame rates: ${JSON.stringify(totals)}`);

// 2. a single 0.25 s frame must not dump a pile
{ const s = createSplatterSim({ rng: mulberry(1) }); const n = s.contact('mud', 1, 0.25, 0); ok(n <= 4, `one 0.25 s frame spawns <= 4 (got ${n})`); }

// 3. water needs >= 2 consecutive physics steps of contact
{
  const s = createSplatterSim({ rng: mulberry(3) });
  let n = 0;
  for (let i = 0; i < 120; i++) n += s.contact('water', 1, 1 / 60, undefined);
  ok(n === 0, 'water ignored with no wetSteps');
  for (let i = 0; i < 120; i++) n += s.contact('water', 1, 1 / 60, 1);
  ok(n === 0, 'water ignored with wetSteps = 1');
  for (let i = 0; i < 120; i++) n += s.contact('water', 1, 1 / 60, MIN_WET_STEPS);
  ok(n > 0, `water spawns with wetSteps >= 2 (got ${n})`);
}

// 4. clear() is instant and resets budgets
{
  const s = createSplatterSim({ rng: mulberry(5) });
  for (let i = 0; i < 60; i++) s.contact('mud', 1, 1 / 60, 0);
  ok(s.drops.length > 0, 'drops exist before clear');
  s.clear();
  ok(s.drops.length === 0, 'clear() empties drops immediately');
  ok(s.contact('mud', 1, 1 / 60, 0) === 0, 'no leftover budget fires after clear');
}

// 5. dry road: zero intensity spawns nothing
{ const s = createSplatterSim(); for (let i = 0; i < 600; i++) s.contact('mud', 0, 1 / 60, 0); ok(s.spawned === 0, 'no drops without contact'); }

console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
