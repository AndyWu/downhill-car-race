// Personality tables. One table per profile; everything the planner/controller needs lives here.
// Units: metres, seconds, m/s. steer is normalised -1..1 (+ = right).
const merge = (a, b) => {
  const o = { ...a };
  for (const k of Object.keys(b)) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? merge(a[k] || {}, b[k]) : b[k];
  return o;
};

const BASE = {
  // --- controller ---
  reactionTime: 0.12,   // s of latency on steer + brake commands
  steerGain: 1.0,       // multiplies pure-pursuit steer command
  steerNoise: 0.01,     // OU noise amplitude added to steer (normalised units)
  steerNoiseTau: 0.6,
  steerTau: 0.08,       // actuator smoothing (s)
  yawDamp: 0.2,         // rad of steer per rad/s of yaw-rate error (counter-steer)
  look: { min: 6, time: 0.55 }, // pure-pursuit distance = max(min, time*speed)
  // --- perception ---
  perception: { detect: { default: 1 }, minRockRadius: 0 }, // per-hazard probability the driver "sees" it
  hazardWeight: { rock: 40, mud: 10, water: 8, default: 10 }, // planner cost per type
  hazardMargin: 1.0,    // m of soft clearance around a hazard
  hazardStretch: 1.0,   // >1 starts avoiding earlier (stretches hazard along s)
  surfaceWeight: {},    // cost per surface type under the planned path (sand, gravel, grass, mud...)
  // --- planner ---
  line: { mode: 'avoid', edge: 0.8, pull: 0.08, maxStep: 2, relaxIters: 0, corridorTol: 0.8, smooth: 6 },
  speed: { mu: 0.8, cornerFactor: 1, brakeDecel: 4, cap: 18, scale: 1, useSurface: false, forward: false, lookTime: 0.25 },
  // --- paddling ---
  paddle: {
    mode: 'rhythm', cadence: 2, strength: 1, jitter: 0.05, slopeMax: 0.06, speedMargin: 0.3,
    stamina: { drain: 0.01, regen: 0.05, minFactor: 0.6 },
  },
  brake: { gain: 0.35, dead: 0.4, max: 1, tap: false },
  aggression: 0, carAvoid: 0, leaderEase: 0.3,
  draft: { range: 0, strength: 0, overtake: false },
};

const make = (o) => Object.freeze(merge(BASE, o));

export const Barnaby = make({
  id: 'barnaby', truckId: 'pallet-pounder', name: 'Barnaby', tier: 1, title: 'Rookie',
  description: 'Oversteers, weaves, misses rocks, forgets to paddle, brakes late.',
  reactionTime: 0.15, steerGain: 0.95, yawDamp: 0.15, steerNoise: 0.03, steerNoiseTau: 0.5, steerTau: 0.1,
  look: { min: 7, time: 0.5 },
  perception: { detect: { rock: 0.5, mud: 1, water: 1, default: 0.5 } },
  hazardWeight: { rock: 20, mud: 10, water: 8, default: 5 }, hazardMargin: 0.8, hazardStretch: 0.9,
  line: { mode: 'center', edge: 0.1, pull: 0.3, maxStep: 3, smooth: 1 },
  speed: { mu: 0.8, cornerFactor: 1.2, brakeDecel: 9, cap: 8.4 },
  paddle: { mode: 'forgetful', cadence: 2.7, strength: 0.9, jitter: 0.3,
    attentive: 0.5, startDist: 120 },
  brake: { gain: 0.3, dead: 0.5, max: 0.9 },
});

export const Clementine = make({
  id: 'clementine', truckId: 'sled-dog', name: 'Clementine', tier: 2, title: 'Cautious',
  description: 'Long look-ahead, wide hazard margins, slow paddling, over-brakes every turn.',
  reactionTime: 0.15, steerGain: 0.9, steerNoise: 0.008, steerTau: 0.1,
  look: { min: 8, time: 0.8 },
  hazardWeight: { rock: 60, mud: 30, water: 25, default: 25 }, hazardMargin: 3.0, hazardStretch: 2.5,
  surfaceWeight: { sand: 4, gravel: 2, grass: 8, mud: 6, water: 5 },
  line: { mode: 'avoid', edge: 0.5, pull: 0.1, maxStep: 1 },
  speed: { mu: 0.8, cornerFactor: 0.56, brakeDecel: 2.6, cap: 9.2, useSurface: true, streamV: 6 },
  paddle: { mode: 'slow', cadence: 2.3, strength: 0.85, jitter: 0.1 },
  brake: { gain: 0.5, dead: 0.2 },
  carAvoid: 1, pass: true,
});

export const Buster = make({
  id: 'buster', truckId: 'wagon-wheel-willy', name: 'Buster', tier: 3, title: 'Aggressive',
  description: 'Furious paddling, plows through mud and water, late lines, bumps rivals.',
  reactionTime: 0.1, steerGain: 1.4, yawDamp: 0.3, steerNoise: 0.03, steerTau: 0.07,
  look: { min: 6, time: 0.5 },
  perception: { detect: { default: 1 }, minRockRadius: 2.3 }, // only avoids huge rocks (by half-width)
  hazardWeight: { rock: 15, mud: 2.5, water: 2, default: 0 }, hazardMargin: 0.3, hazardStretch: 0.8,
  line: { mode: 'racing', edge: 0.3, pull: 0.02, maxStep: 3, relaxIters: 70 },
  speed: { mu: 0.85, cornerFactor: 0.92, brakeDecel: 6.5, cap: 10.7, scale: 1.0 },
  paddle: { mode: 'furious', cadence: 2.9, strength: 1.0, jitter: 0.04,
    stamina: { drain: 0.05, regen: 0.05, minFactor: 0.7 } },
  brake: { gain: 0.5, dead: 0.7 },
  aggression: 0.8, pass: true, leaderEase: 0.4,
});

export const Maeve = make({
  id: 'maeve', truckId: 'crate-comet', name: 'Maeve', tier: 4, title: 'Tactical',
  description: 'Pre-computed minimum-curvature racing line, avoids drag terrain, metronomic paddling.',
  reactionTime: 0.12, steerGain: 1.0, steerNoise: 0.005,
  look: { min: 7, time: 0.6 },
  hazardWeight: { rock: 50, mud: 18, water: 15, default: 15 }, hazardMargin: 1.5, hazardStretch: 1.5,
  surfaceWeight: { sand: 2.5, gravel: 1.2, grass: 5, mud: 4, water: 3 },
  line: { mode: 'racing', edge: 1.6, pull: 0.02, maxStep: 1, slot: 0.25, relaxIters: 600, corridorTol: 0.8 },
  speed: { mu: 0.9, cornerFactor: 1.05, brakeDecel: 3.8, cap: 11.8, useSurface: true, streamV: 8 },
  paddle: { mode: 'rhythm', cadence: 2.8, strength: 1.0, jitter: 0, slopeMax: 0.12, stamina: { drain: 0.01, regen: 0.08, minFactor: 0.8 } },
  brake: { gain: 0.45, dead: 0.3 },
  carAvoid: 0.8, pass: true, leaderEase: 0.5,
});

export const Ace = make({
  id: 'ace', truckId: 'door-dasher', name: 'Ace', tier: 5, title: 'Pro',
  description: 'Racing line + grip-limited speed profile, drafting, dry-dirt preference, optimal paddle timing.',
  reactionTime: 0.06, steerGain: 1.0, steerNoise: 0.003, steerTau: 0.06,
  look: { min: 8, time: 0.6 },
  hazardWeight: { rock: 60, mud: 25, water: 22, default: 20 }, hazardMargin: 1.5, hazardStretch: 1.8,
  surfaceWeight: { sand: 4, gravel: 2.5, grass: 6, mud: 5, water: 4 },
  line: { mode: 'racing', edge: 1.6, pull: 0.02, maxStep: 1, slot: 0.25, relaxIters: 700, corridorTol: 1.0 },
  speed: { mu: 0.8, cornerFactor: 0.95, brakeDecel: 3.8, cap: 13.0, useSurface: true, streamV: 8.5, forward: true },
  paddle: { mode: 'optimal', cadence: 2.8, strength: 1.0, jitter: 0, slopeMax: 0.08, stamina: { drain: 0.005, regen: 0.1, minFactor: 0.9 } },
  brake: { gain: 0.5, dead: 0.2, tap: true },
  draft: { range: 8, strength: 0.9, overtake: true },
  carAvoid: 0.8, pass: true, leaderEase: 0.6,
});

// ---------------- 9-driver skill ladder (worst -> best) ----------------
// New drivers are numeric blends of their two neighbours (so they sit between them) plus a distinct trait.
const blend = (lo, hi, t) => {
  if (typeof lo === 'number' && typeof hi === 'number') return lo + (hi - lo) * t;
  if (lo && hi && typeof lo === 'object' && typeof hi === 'object' && !Array.isArray(lo)) {
    const o = {};
    for (const k of new Set([...Object.keys(lo), ...Object.keys(hi)])) o[k] = k in lo && k in hi ? blend(lo[k], hi[k], t) : (k in lo ? lo[k] : hi[k]);
    return o;
  }
  return t < 0.5 ? lo : hi; // strings / booleans: take the nearer neighbour
};
const between = (lo, hi, t, over) => Object.freeze(merge(blend({ ...lo }, { ...hi }, t), over));

export const Tilly = between(Barnaby, Clementine, 0.5, {
  id: 'tilly', truckId: 'bathtub-betty', name: 'Tilly', tier: 1.5, skill: 0.18, title: 'Daydreamer',
  description: 'Drifts across the road, paddles in bursts, honks at nothing in particular.',
  steerNoise: 0.07, look: { min: 6 }, speed: { cap: 8.8 },
  paddle: { mode: 'forgetful', attentive: 0.65, startDist: 100 },
  honk: { p: 0.25, gap: 14, idle: 0.02 },
});
export const Dot = between(Clementine, Buster, 0.5, {
  id: 'dot', truckId: 'crate-comet', name: 'Dot', tier: 2.5, skill: 0.4, title: 'Steady Eddie',
  description: 'Even-tempered and tidy; brakes for corners but paddles with purpose.',
  speed: { cap: 9.6 }, paddle: { mode: 'rhythm', slopeMax: 0.08 }, carAvoid: 0.6, pass: true,
  honk: { p: 0.35, gap: 10, idle: 0 },
});
export const Rosco = between(Buster, Maeve, 0.5, {
  id: 'rosco', truckId: 'rust-bucket', name: 'Rosco', tier: 3.5, skill: 0.62, title: 'Bruiser',
  description: 'Hard-charging with decent lines; leans on rivals when passing.',
  speed: { cap: 11.2 }, aggression: 0.6, pass: true, carAvoid: 0.4,
  line: { mode: 'racing' },
  honk: { p: 0.8, gap: 4, idle: 0 },
});
export const Vance = between(Maeve, Ace, 0.5, {
  id: 'vance', truckId: 'tin-lizzie', name: 'Vance', tier: 4.5, skill: 0.84, title: 'Slipstreamer',
  description: 'Lives in other cars slipstreams and picks the moment to slingshot.',
  speed: { cap: 12.3 }, draft: { range: 8, strength: 0.85, overtake: true }, pass: true,
  honk: { p: 0.5, gap: 8, idle: 0 },
});

// skill 0..1 and honk personality on the anchors
const anchor = (p, skill, honk) => Object.freeze({ ...p, skill, honk });
const B = anchor(Barnaby, 0.05, { p: 0.15, gap: 15, idle: 0.04 });
const C = anchor(Clementine, 0.28, { p: 0.08, gap: 20, idle: 0 });
const U = anchor(Buster, 0.5, { p: 1.0, gap: 2.5, idle: 0.08 });
const M = anchor(Maeve, 0.73, { p: 0.3, gap: 10, idle: 0 });
const A = anchor(Ace, 0.95, { p: 0.45, gap: 8, idle: 0 });
export const ANCHORS = [B, C, U, M, A];
export const AI_ROSTER = [B, Tilly, C, Dot, U, Rosco, M, Vance, A];
// Backwards compatible name: the roster (worst -> best). Index i is the i-th AI backfilled into a race.
export const AI_PROFILES = AI_ROSTER;
