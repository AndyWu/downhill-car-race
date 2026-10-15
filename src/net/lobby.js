// Lobby state machine: hotspot instructions → QR offer/answer exchange → locked-in peers.
//
// UI, in order of preference:
//   1. ui.renderLobby(state, actions) — called on every state change;
//   2. Agent 4's slot API (ui.showQR / setLobbySteps / showScanner …) via lobbyUiAdapter.js —
//      in this mode start() goes straight past the hotspot screen (the steps stay listed);
//   3. otherwise the fallback modal in lobbyView.js.

import { hostCreateOffer, hostAcceptAnswer, clientAcceptOffer } from './peer.js';
import { unpackSdp } from './sdpPack.js';
import { createScanner } from './qr.js';
import { LOBBY_COPY } from './lobbyCopy.js';
import { createLobbyView } from './lobbyView.js';
import { isAgent4UI, createUiAdapter } from './lobbyUiAdapter.js';

const CONNECT_TIMEOUT_MS = 20000;

/**
 * @param {{role:'host'|'client', ui?:object, maxPeers?:number, name?:string, camera?:boolean, root?:HTMLElement}} o
 */
export function createLobby({ role, ui, maxPeers = 5, name = 'Player', camera = true, root } = {}) {
  const isHost = role === 'host';
  const tag = isHost ? (crypto.getRandomValues(new Uint16Array(1))[0]) : null;
  const peers = new Map();          // slot → open Peer (host: clients; client: {0: host})
  const slots = new Map();          // host: slot → Peer (any state)
  const peerCbs = new Set(), readyCbs = new Set(), stateCbs = new Set();
  let current = null;               // host: peer whose offer is on screen
  let scanner = null;
  let view = null;
  let closed = false;
  const adapter = !ui?.renderLobby && isAgent4UI(ui) ? createUiAdapter(ui, { name }) : null;

  const state = {
    role, phase: 'idle', tag, slot: isHost ? 0 : null,
    offerCode: null, answerCode: null, error: null, busy: false,
    peers: [], cameraOn: false, copy: LOBBY_COPY,
  };

  const actions = {
    begin, submitCode, startRace, flipCamera, cancel: () => close({ keepPeers: false }),
    startCamera, stopCamera,
    get video() { return scanner?.video ?? null; },
  };

  function render() {
    state.peers = [...slots.values()].map((p) => ({ id: p.id, state: p.state, name: p.meta.name || `Player ${p.id + 1}` }));
    if (!isHost && peers.get(0)) state.peers = [{ id: 0, state: peers.get(0).state, name: 'Host' }];
    stateCbs.forEach((cb) => cb(state));
    if (closed) return;
    if (ui?.renderLobby) ui.renderLobby(state, actions);
    else if (adapter) adapter.render(state, actions);
    else if (typeof document !== 'undefined' && ui !== false) { view ??= createLobbyView(root); view.render(state, actions); }
  }
  const setPhase = (p) => { state.phase = p; state.error = null; render(); };
  const fail = (msg) => { state.error = msg; state.busy = false; render(); };

  async function startCamera() {
    if (!camera || scanner?.running) return;
    scanner ??= createScanner({ onResult: (t) => submitCode(t) });
    try { await scanner.start(); state.cameraOn = true; } catch (e) { state.cameraOn = false; fail(LOBBY_COPY.errors.camera + ` (${e.message})`); }
    render();
  }
  function stopCamera() { scanner?.stop(); state.cameraOn = false; }
  async function flipCamera() { await scanner?.flip(); render(); }

  function start() { closed = false; setPhase('radio'); if (adapter) begin(); }

  async function begin() {
    if (isHost) { setPhase('offering'); startCamera(); await offerNext(); }
    else { setPhase('scanOffer'); startCamera(); }
  }

  // ---------------- host ----------------
  async function offerNext() {
    if (closed || current) return;
    let slot = 0;
    for (let s = 1; s <= maxPeers; s++) if (!slots.has(s)) { slot = s; break; }
    if (!slot) { state.offerCode = null; state.slot = null; render(); return; }
    state.busy = true; render();
    const { peer, code } = await hostCreateOffer(slot, tag);
    if (closed) { peer.close(); return; }
    slots.set(slot, peer);
    current = peer;
    peer.on('ctrl', (m) => { if (m?.t === 'hello') { peer.meta.name = String(m.name || '').slice(0, 24); render(); } });
    peer.on('state', render);
    state.offerCode = code; state.slot = slot; state.busy = false;
    render();
  }

  async function hostOnCode(code) {
    let a;
    try { a = unpackSdp(code); } catch { return fail(LOBBY_COPY.errors.wrongKind); }
    if (a.kind !== 'answer') return fail(LOBBY_COPY.errors.wrongKind);
    if (a.tag !== tag) return fail(LOBBY_COPY.errors.oldSession);
    const peer = slots.get(a.slot);
    if (!peer || peer.pc.signalingState !== 'have-local-offer') return; // duplicate scan
    try { await hostAcceptAnswer(peer, a, tag); } catch (e) { return fail(e.message); }
    state.error = null;
    const to = setTimeout(() => { if (peer.state !== 'open') peer.close(); }, CONNECT_TIMEOUT_MS);
    peer.opened.then(() => {
      clearTimeout(to);
      peers.set(peer.id, peer);
      peer.sendCtrl({ t: 'welcome', slot: peer.id, tag });
      peerCbs.forEach((cb) => cb(peer));
      render();
    }).catch(() => {
      clearTimeout(to);
      slots.delete(peer.id); peers.delete(peer.id);
      fail(LOBBY_COPY.errors.connectFailed);
      if (!current) offerNext();
    });
    peer.on('state', (s) => { if ((s === 'closed' || s === 'failed') && peers.get(peer.id) === peer) { peers.delete(peer.id); slots.delete(peer.id); render(); if (!current && !closed && state.phase === 'offering') offerNext(); } });
    if (current === peer) { current = null; await offerNext(); }
    render();
  }

  function startRace() {
    if (!isHost) return;
    stopCamera();
    for (const [s, p] of slots) if (p.state !== 'open') { p.close(); slots.delete(s); }
    current = null;
    const players = [{ slot: 0, name }, ...[...peers.values()].map((p) => ({ slot: p.id, name: p.meta.name || `Player ${p.id + 1}` }))];
    peers.forEach((p) => p.sendCtrl({ t: 'lobby-closed', players }));
    setPhase('ready');
    const info = { role, tag, localSlot: 0, peers: [...peers.values()], players };
    readyCbs.forEach((cb) => cb(info));
  }

  // ---------------- client ----------------
  async function clientOnCode(code) {
    if (state.phase !== 'scanOffer') return;
    let o;
    try { o = unpackSdp(code); } catch { return fail(LOBBY_COPY.errors.wrongKind); }
    if (o.kind !== 'offer') return fail(LOBBY_COPY.errors.wrongKind);
    setPhase('answering');
    let res;
    try { res = await clientAcceptOffer(o); } catch (e) { setPhase('scanOffer'); return fail(e.message); }
    if (closed) { res.peer.close(); return; }
    const { peer, code: answer, slot } = res;
    stopCamera();
    state.answerCode = answer; state.slot = slot; state.tag = o.tag;
    setPhase('showAnswer');
    peer.on('state', render);
    try { await peer.opened; } catch { setPhase('scanOffer'); startCamera(); return fail(LOBBY_COPY.errors.connectFailed); }
    peers.set(0, peer);
    peer.sendCtrl({ t: 'hello', name, slot });
    setPhase('connected');
    peerCbs.forEach((cb) => cb(peer));
    const info = { role, tag: o.tag, localSlot: slot, peers: [peer], host: peer };
    readyCbs.forEach((cb) => cb(info));
  }

  async function submitCode(text) {
    text = String(text || '').trim();
    if (!text) return;
    return isHost ? hostOnCode(text) : clientOnCode(text);
  }

  function close({ keepPeers = true } = {}) {
    closed = true;
    stopCamera();
    view?.destroy(); view = null;
    for (const [s, p] of slots) if (!keepPeers || p.state !== 'open') { p.close(); slots.delete(s); }
    if (!keepPeers) { peers.forEach((p) => p.close()); peers.clear(); }
    ui?.renderLobby?.({ ...state, phase: 'closed' }, actions);
    adapter?.render({ ...state, phase: 'closed' }, actions);
  }

  return {
    role, tag, peers, state, actions,
    start, begin, submitCode, startRace,
    onPeer(cb) { peerCbs.add(cb); return () => peerCbs.delete(cb); },
    onReady(cb) { readyCbs.add(cb); return () => readyCbs.delete(cb); },
    onState(cb) { stateCbs.add(cb); return () => stateCbs.delete(cb); },
    close,
  };
}
