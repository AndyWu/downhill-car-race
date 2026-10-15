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
  aggression: 0, carAvoid: 0,
  draft: { range: 0, strength: 0, overtake: false },
};

const make = (o) => Object.freeze(merge(BASE, o));

export const Barnaby = make({
  id: 'barnaby', name: 'Barnaby', tier: 1, title: 'Rookie',
  description: 'Oversteers, weaves, misses rocks, forgets to paddle, brakes late.',
  reactionTime: 0.2, steerGain: 1.05, yawDamp: 0.12, steerNoise: 0.035, steerNoiseTau: 0.5, steerTau: 0.1,
  look: { min: 7, time: 0.5 },
  perception: { detect: { rock: 0.5, mud: 1, water: 1, default: 0.5 } },
  hazardWeight: { rock: 20, mud: 10, water: 8, default: 5 }, hazardMargin: 0.8, hazardStretch: 0.9,
  line: { mode: 'center', edge: 0.1, pull: 0.3, maxStep: 3, smooth: 1 },
  speed: { mu: 0.8, cornerFactor: 1.2, brakeDecel: 9, cap: 10.8 },
  paddle: { mode: 'forgetful', cadence: 2.7, strength: 0.9, jitter: 0.3,
    attentive: 0.85, startDist: 120 },
  brake: { gain: 0.3, dead: 0.5, max: 0.9 },
});

export const Clementine = make({
  id: 'clementine', name: 'Clementine', tier: 2, title: 'Cautious',
  description: 'Long look-ahead, wide hazard margins, slow paddling, over-brakes every turn.',
  reactionTime: 0.15, steerGain: 0.9, steerNoise: 0.008, steerTau: 0.1,
  look: { min: 8, time: 0.8 },
  hazardWeight: { rock: 60, mud: 30, water: 25, default: 25 }, hazardMargin: 3.0, hazardStretch: 2.5,
  surfaceWeight: { sand: 4, gravel: 2, grass: 8, mud: 6, water: 5 },
  line: { mode: 'avoid', edge: 0.5, pull: 0.1, maxStep: 1 },
  speed: { mu: 0.8, cornerFactor: 0.52, brakeDecel: 2.6, cap: 11.4, useSurface: true },
  paddle: { mode: 'slow', cadence: 2.3, strength: 0.85, jitter: 0.1 },
  brake: { gain: 0.5, dead: 0.2 },
  carAvoid: 1,
});

export const Buster = make({
  id: 'buster', name: 'Buster', tier: 3, title: 'Aggressive',
  description: 'Furious paddling, plows through mud and water, late lines, bumps rivals.',
  reactionTime: 0.1, steerGain: 1.4, yawDamp: 0.3, steerNoise: 0.03, steerTau: 0.07,
  look: { min: 6, time: 0.5 },
  perception: { detect: { default: 1 }, minRockRadius: 2.3 }, // only avoids huge rocks (by half-width)
  hazardWeight: { rock: 15, mud: 0, water: 0, default: 0 }, hazardMargin: 0.3, hazardStretch: 0.8,
  line: { mode: 'racing', edge: 0.3, pull: 0.02, maxStep: 3, relaxIters: 70 },
  speed: { mu: 0.85, cornerFactor: 1.05, brakeDecel: 6.5, cap: 11.9, scale: 1.0 },
  paddle: { mode: 'furious', cadence: 3.7, strength: 1.0, jitter: 0.04,
    stamina: { drain: 0.02, regen: 0.1, minFactor: 0.85 } },
  brake: { gain: 0.5, dead: 0.7 },
  aggression: 0.8,
});

export const Maeve = make({
  id: 'maeve', name: 'Maeve', tier: 4, title: 'Tactical',
  description: 'Pre-computed minimum-curvature racing line, avoids drag terrain, metronomic paddling.',
  reactionTime: 0.12, steerGain: 1.0, steerNoise: 0.005,
  look: { min: 7, time: 0.6 },
  hazardWeight: { rock: 50, mud: 18, water: 15, default: 15 }, hazardMargin: 1.5, hazardStretch: 1.5,
  surfaceWeight: { sand: 2.5, gravel: 1.2, grass: 5, mud: 4, water: 3 },
  line: { mode: 'racing', edge: 1.6, pull: 0.02, maxStep: 1, slot: 0.25, relaxIters: 600, corridorTol: 0.8 },
  speed: { mu: 0.8, cornerFactor: 1.0, brakeDecel: 3.8, cap: 12.0, useSurface: true },
  paddle: { mode: 'rhythm', cadence: 2.8, strength: 1.0, jitter: 0, slopeMax: 0.12, stamina: { drain: 0.01, regen: 0.08, minFactor: 0.8 } },
  brake: { gain: 0.45, dead: 0.3 },
  carAvoid: 0.8, pass: true,
});

export const Ace = make({
  id: 'ace', name: 'Ace', tier: 5, title: 'Pro',
  description: 'Racing line + grip-limited speed profile, drafting, dry-dirt preference, optimal paddle timing.',
  reactionTime: 0.06, steerGain: 1.0, steerNoise: 0.003, steerTau: 0.06,
  look: { min: 8, time: 0.6 },
  hazardWeight: { rock: 60, mud: 25, water: 22, default: 20 }, hazardMargin: 1.5, hazardStretch: 1.8,
  surfaceWeight: { sand: 4, gravel: 2.5, grass: 6, mud: 5, water: 4 },
  line: { mode: 'racing', edge: 1.6, pull: 0.02, maxStep: 1, slot: 0.25, relaxIters: 700, corridorTol: 1.0 },
  speed: { mu: 0.8, cornerFactor: 0.95, brakeDecel: 3.8, cap: 13.6, useSurface: true, forward: true },
  paddle: { mode: 'optimal', cadence: 2.8, strength: 1.0, jitter: 0, slopeMax: 0.08, stamina: { drain: 0.005, regen: 0.1, minFactor: 0.9 } },
  brake: { gain: 0.5, dead: 0.2, tap: true },
  draft: { range: 8, strength: 0.9, overtake: true },
  carAvoid: 0.8, pass: true,
});

export const AI_PROFILES = [Barnaby, Clementine, Buster, Maeve, Ace];
