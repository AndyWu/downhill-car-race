// AI opponents. Contract (see ARCHITECTURE.md):
//   AI_PROFILES = [Barnaby, Clementine, Buster, Maeve, Ace]
//   createAIDriver(profile, { world, rng, spec?, rubberBand?, headlight? }) -> { think(dt, selfState, others[]) -> Input }
export { AI_PROFILES, Barnaby, Clementine, Buster, Maeve, Ace } from './profiles.js';
export { createAIDriver, forwardXZ } from './driver.js';
export { createRng } from './rng.js';
