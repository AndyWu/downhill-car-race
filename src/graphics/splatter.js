// Lens-splatter simulation (pure JS, no GL): frame-rate independent spawning + drop ageing.
// contact(type, intensity, dt, wetSteps): integrates a per-second spawn rate over `dt` seconds of simulated contact.
// Drop size/shape never depends on dt; at most MAX_PER_CALL drops spawn per call; the remainder carries over.
export const RATE = { mud: 14, water: 8 };   // drops per second at intensity 1
export const MAX_PER_CALL = 4, MAX_BUDGET = 6, MIN_WET_STEPS = 2;

export function createSplatterSim({ rng = Math.random, maxVisible = 10 } = {}) {
  const drops = [];
  const budget = { mud: 0, water: 0 };
  let spawned = 0, speed = 0;

  function spawn(type, amount) {
    const R = rng, mud = type === 'mud';
    const sp = Math.min(1, speed / 14);
    const big = R() < 0.18 + amount * 0.2;
    const r = mud ? (big ? 0.06 + R() * 0.04 : 0.026 + R() * 0.03) : (big ? 0.022 + R() * 0.018 : 0.007 + R() * 0.013);
    drops.push({
      x: 0.06 + R() * 0.88, y: 0.02 + 0.53 * Math.pow(R(), 1.6), // lower ~55% of the frame, weighted to the bottom
      r, age: 0, life: mud ? 9 + R() * 7 : 6 + R() * 5, kind: mud ? 1 : 0, seed: R(), trail: 0,
      elong: 1 + sp * (mud ? 1.2 : 2.0) * (0.4 + R()), delay: 0.3 + R() * (mud ? 3.5 : 1.8), vy: (mud ? 0.005 : 0.025) + R() * (mud ? 0.012 : 0.03),
    });
    spawned++;
    while (drops.length > maxVisible) drops.shift();
  }

  /** @returns number of drops spawned by this call */
  function contact(type, amount, dt, wetSteps) {
    if (type !== 'mud' && type !== 'water') return 0;
    if (!(amount > 0) || !(dt > 0)) return 0;
    if (type === 'water' && !(wetSteps >= MIN_WET_STEPS)) return 0; // needs >= 2 consecutive physics steps of real water contact
    budget[type] = Math.min(MAX_BUDGET, budget[type] + RATE[type] * Math.min(1, amount) * Math.min(dt, 0.5));
    let n = 0;
    while (budget[type] >= 1 && n < MAX_PER_CALL) { spawn(type, Math.min(1, amount)); budget[type] -= 1; n++; }
    return n;
  }

  function step(dt) {
    // substep so one long frame ages drops exactly like many short ones
    let left = Math.min(dt, 1);
    while (left > 1e-6) {
      const h = Math.min(left, 1 / 30); left -= h;
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.age += h;
        if (d.age > d.delay) {
          const v = d.vy * Math.min(1, (d.age - d.delay) * 0.6) * (d.kind ? 0.35 : 1);
          d.y -= v * h; d.trail += v * h;
          d.elong = Math.max(1, d.elong - h * 0.3);
          d.r *= 1 - (d.kind ? 0.004 : 0.02) * h;
        }
        if (d.age / d.life >= 1 || d.y < -0.15) drops.splice(i, 1);
      }
    }
  }

  function clear() { drops.length = 0; budget.mud = budget.water = 0; }
  return { drops, contact, step, clear, setSpeed(v) { speed = v; }, get spawned() { return spawned; } };
}
