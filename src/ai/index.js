// AI opponents. Contract (see ARCHITECTURE.md):
//   AI_ROSTER = AI_PROFILES = 9 drivers worst -> best (each with .skill 0..1, .truckId, .honk); ANCHORS = the original 5
//   createAIDriver(profile, { world, rng, spec?, rubberBand?, headlight? }) -> { think(dt, selfState, others[]) -> Input }
export { AI_PROFILES, AI_ROSTER, ANCHORS, Barnaby, Clementine, Buster, Maeve, Ace, Tilly, Dot, Rosco, Vance } from './profiles.js';
export { createAIDriver, forwardXZ } from './driver.js';
export { createRng } from './rng.js';
