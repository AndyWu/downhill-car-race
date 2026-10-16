// "Still rolling" finish projection for the results card (pure, unit-testable).
// eta = (trackLength - 3 - s) / max(4, v) where v is a 20 s rolling average speed taken from the car's own
// s history (samples pushed on every call), falling back to race-average speed s / elapsed. Instantaneous
// speed is never used, so a momentary dip cannot throw a car minutes behind. A car ahead on s is never
// projected behind a car it is ahead of unless its average speed is clearly lower (< 85 %).
export function createProjector() {
  const hist = new Map();
  return function project(rows, nowSec, elapsedSec) {
    const out = rows.map((e) => {
      let h = hist.get(e.name); if (!h) hist.set(e.name, (h = []));
      h.push({ t: nowSec, s: e.s });
      while (h.length > 2 && nowSec - h[0].t > 20) h.shift();
      const span = nowSec - h[0].t;
      let v = span >= 3 ? (e.s - h[0].s) / span : (elapsedSec > 1 ? e.s / elapsedSec : 0);
      if (!(v > 0) || !isFinite(v)) v = elapsedSec > 1 ? e.s / elapsedSec : 4;
      v = Math.max(4, v);
      return { e, v, eta: Math.max(0, (e.trackLength || 3218) - 3 - e.s) / v };
    });
    const bys = out.slice().sort((a, b) => a.e.s - b.e.s); // back to front
    for (let i = 1; i < bys.length; i++) { // enforce: car ahead (larger s) not behind a car behind it unless clearly slower
      const behind = bys[i - 1], front = bys[i];
      if (front.eta >= behind.eta && front.v >= 0.85 * behind.v) front.eta = Math.max(0, behind.eta - 0.01);
    }
    return out;
  };
}
