// Public contract for the network layer (see ARCHITECTURE.md). Extras are additive.
//
//   registerServiceWorker()                         PWA offline cache
//   createLobby({ role, ui }) → { start(), onPeer(cb), onReady(cb), close() }
//   createSync({ role, peers, worldSnapshotSize }) → { sendInput, onInput, broadcastSnapshot, onSnapshot, … }
//   licensing = { init(), provisionSeat(name), seats(), verify(), … }

export { registerServiceWorker, injectPWAHead, isStandalone, applyUpdate, offlineReady, onOfflineReady, getOfflineStatus } from './pwa.js';
export { createLobby, seatList, RACE_SEATS, MAX_HUMANS } from './lobby.js';
export { createSync, normalizeConditions, WEATHERS, TIMES_OF_DAY } from './sync.js';
export { createInterpolator } from './interpolator.js';
export { createPredictor } from './predictor.js';
export { licensing, MAX_SEATS } from './licensing.js';
export { LOBBY_COPY, LOBBY_PHASES, fmt } from './lobbyCopy.js';
export { createLobbyView } from './lobbyView.js';
export { renderQR, createScanner } from './qr.js';
export { packSdp, unpackSdp } from './sdpPack.js';
export { createPeer, hostCreateOffer, hostAcceptAnswer, clientAcceptOffer, CHANNELS } from './peer.js';
export {
  encodeInputFrame, decodeInputFrame, packSnapshot, unpackSnapshot, createSnapshotEncoder, createSnapshotDecoder, SNAP_VERSION,
  INPUT_STRIDE, SNAP_HEADER, SNAP_STRIDE, SNAP_FIELDS, FLAG_HEADLIGHT, FLAG_REVERSE, FLAG_HONK, SNAP_EVENTS, MAX_CARS,
} from './protocol.js';
