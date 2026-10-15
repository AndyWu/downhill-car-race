// Public contract for the network layer (see ARCHITECTURE.md). Extras are additive.
//
//   registerServiceWorker()                         PWA offline cache
//   createLobby({ role, ui }) → { start(), onPeer(cb), onReady(cb), close() }
//   createSync({ role, peers, worldSnapshotSize }) → { sendInput, onInput, broadcastSnapshot, onSnapshot, … }
//   licensing = { init(), provisionSeat(name), seats(), verify(), … }

export { registerServiceWorker, injectPWAHead, isStandalone, applyUpdate } from './pwa.js';
export { createLobby } from './lobby.js';
export { createSync } from './sync.js';
export { createInterpolator } from './interpolator.js';
export { licensing, MAX_SEATS } from './licensing.js';
export { LOBBY_COPY, LOBBY_PHASES, fmt } from './lobbyCopy.js';
export { createLobbyView } from './lobbyView.js';
export { renderQR, createScanner } from './qr.js';
export { packSdp, unpackSdp } from './sdpPack.js';
export { createPeer, hostCreateOffer, hostAcceptAnswer, clientAcceptOffer, CHANNELS } from './peer.js';
export {
  encodeInputFrame, decodeInputFrame, packSnapshot, unpackSnapshot,
  INPUT_STRIDE, SNAP_HEADER, SNAP_STRIDE, SNAP_FIELDS, FLAG_HEADLIGHT, FLAG_REVERSE,
} from './protocol.js';
