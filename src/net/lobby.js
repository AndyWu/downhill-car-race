// Lobby state machine: hotspot instructions → QR offer/answer exchange → locked-in peers.
//
// UI, in order of preference:
//   1. ui.renderLobby(state, actions): called on every state change;
//   2. Agent 4's slot API (ui.showQR / setLobbySteps / …) via lobbyUiAdapter.js;
//   3. otherwise the fallback modal in lobbyView.js.
//
// Camera policy: the camera is NEVER opened automatically. Host: only after tapping "Scan
// Player N's reply". Client: only after tapping "Scan the Host's code". Every screen also offers
// "Can't use the camera? Tap to paste the code".
//
// Host flow:   radio (confirm hotspot) → offering [show offer QR ⇄ scanning reply] → ready
// Client flow: radio (confirm Wi-Fi) → scanOffer → answering → showAnswer (slow → retry) → connected
// Each offer is single-use (ICE latches onto the first iPad that tries it), so offers carry
// their own 16-bit tag; the host can mint a fresh one with refreshOffer() ("New code").
// The host pre-builds its first offer in the background, and submitCode() is accepted in any
// phase (a pasted code proves the radio step), so scripted tests need no extra taps.

import { hostCreateOffer, hostAcceptAnswer, clientAcceptOffer } from './peer.js';
import { unpackSdp } from './sdpPack.js';
import { createScanner } from './qr.js';
import { LOBBY_COPY, computeSteps } from './lobbyCopy.js';
import { createLobbyView } from './lobbyView.js';
import { isAgent4UI, createUiAdapter } from './lobbyUiAdapter.js';

const CONNECT_TIMEOUT_MS = 20000;
const CLIENT_SLOW_MS = 40000;

/**
 * @param {{role:'host'|'client', ui?:object, maxPeers?:number, name?:string, camera?:boolean, root?:HTMLElement, slowMs?:number}} o
 */
export const RACE_SEATS = 10;     // cars per race (humans + AI backfill)
export const MAX_HUMANS = 6;      // family pass: host + 5 clients
const FALLBACK_AI_NAMES = ['Barnaby', 'Tilly', 'Clementine', 'Dot', 'Buster', 'Rosco', 'Maeve', 'Vance', 'Ace'];

/** Seat list for a race: humans first, then AI backfill (roster order) up to `seats`. */
export function seatList(humans, { seats = RACE_SEATS, aiNames = FALLBACK_AI_NAMES } = {}) {
  const list = humans.slice(0, MAX_HUMANS).map((p, i) => ({ ...p, slot: p.slot ?? i }));
  let ai = 0;
  while (list.length < seats) list.push({ slot: list.length, name: aiNames[ai++ % aiNames.length], kind: 'ai', ready: true });
  return list;
}

export function createLobby({ role, ui, maxPeers = MAX_HUMANS - 1, name = 'Player', camera = true, root, slowMs = CLIENT_SLOW_MS, seats = RACE_SEATS, aiNames } = {}) {
  maxPeers = Math.min(maxPeers, MAX_HUMANS - 1);
  const isHost = role === 'host';
  const tag = isHost ? (crypto.getRandomValues(new Uint16Array(1))[0]) : null;
  const peers = new Map();          // slot → open Peer (host: clients; client: {0: host})
  const slots = new Map();          // host: slot → Peer (any state)
  const peerCbs = new Set(), readyCbs = new Set(), stateCbs = new Set();
  let current = null;               // host: peer whose offer is on screen
  const offerTags = new Map();      // host: per-offer 16-bit tag → peer (each offer is single-use)
  let offering = null;              // host: in-flight offer promise
  let scanner = null;
  let view = null;
  let closed = false;
  let clientPeer = null, slowTimer = null, attempt = 0;
  const adapter = !ui?.renderLobby && isAgent4UI(ui) ? createUiAdapter(ui, { name }) : null;

  const state = {
    role, phase: 'idle', tag, slot: isHost ? 0 : null,
    offerCode: null, answerCode: null, error: null, notice: null, busy: false,
    radioConfirmed: false, scanning: false, cameraOn: false, slow: false,
    peers: [], steps: [], copy: LOBBY_COPY,
    seats, aiNames: aiNames || FALLBACK_AI_NAMES, seatList: [],
  };

  const actions = {
    begin: confirmRadio, confirmRadio, scanAnswer, scanOffer, stopScan, submitCode, startRace, retry, refreshOffer,
    flipCamera, cancel: () => close({ keepPeers: false }),
    get video() { return scanner?.video ?? null; },
  };

  function render() {
    state.peers = [...slots.values()].map((p) => ({ id: p.id, state: p.state, name: p.meta.name || `Player ${p.id + 1}` }));
    if (!isHost && peers.get(0)) state.peers = [{ id: 0, state: peers.get(0).state, name: 'Host' }];
    state.error = state.notice; // back-compat field name
    const humans = isHost
      ? [{ slot: 0, name, kind: 'host', you: true, ready: true }, ...state.peers.filter((p) => p.state === 'open' || p.state === 'connecting').map((p) => ({ slot: p.id, name: p.name, kind: 'human', ready: p.state === 'open' }))]
      : [{ slot: 0, name: 'Host', kind: 'host', ready: state.phase === 'connected' }, { slot: state.slot ?? 1, name, kind: 'human', you: true, ready: state.phase === 'connected' }];
    state.seatList = seatList(humans, { seats, aiNames: state.aiNames });
    state.steps = computeSteps(state);
    stateCbs.forEach((cb) => cb(state));
    if (closed) return;
    if (ui?.renderLobby) ui.renderLobby(state, actions);
    else if (adapter) adapter.render(state, actions);
    else if (typeof document !== 'undefined' && ui !== false) { view ??= createLobbyView(root); view.render(state, actions); }
  }
  const setPhase = (p) => { state.phase = p; state.notice = null; render(); };
  const notify = (msg) => { state.notice = msg; state.busy = false; render(); };

  // ---------------- camera (only on explicit request) ----------------
  async function startCamera() {
    state.scanning = true;
    if (!camera) { render(); return; }
    scanner ??= createScanner({ onResult: (t) => submitCode(t) });
    if (scanner.running) { render(); return; }
    render();
    try { await scanner.start(); state.cameraOn = true; state.notice = null; }
    catch { state.cameraOn = false; state.notice = LOBBY_COPY.notices.camera; }
    render();
  }
  function stopCamera() { scanner?.stop(); state.cameraOn = false; }
  function stopScan() { stopCamera(); state.scanning = false; render(); }
  async function flipCamera() { await scanner?.flip(); render(); }

  if (!aiNames) import('../ai/index.js').then((m) => { const r = m.AI_ROSTER || m.AI_PROFILES; if (r?.length) { state.aiNames = r.map((p) => p.name); if (!closed && state.phase !== 'idle') render(); } }).catch(() => {});

  function start() {
    closed = false;
    setPhase('radio');
    if (isHost) offerNext(); // build the first code in the background so it's instant
  }

  function confirmRadio() {
    if (state.radioConfirmed && state.phase !== 'radio') return;
    state.radioConfirmed = true;
    if (isHost) { setPhase('offering'); if (!current) offerNext(); }
    else setPhase('scanOffer');
  }

  // ---------------- host ----------------
  function scanAnswer() { if (isHost) { if (!state.radioConfirmed) confirmRadio(); startCamera(); } }

  function offerNext() {
    if (offering) return offering;
    offering = (async () => {
      if (closed || current) return;
      let slot = 0;
      for (let s = 1; s <= maxPeers; s++) if (!slots.has(s)) { slot = s; break; }
      if (!slot) { state.offerCode = null; state.slot = null; render(); return; }
      state.busy = true; render();
      let otag;
      do { otag = crypto.getRandomValues(new Uint16Array(1))[0]; } while (offerTags.has(otag));
      const { peer, code } = await hostCreateOffer(slot, otag);
      offerTags.set(otag, peer); peer.offerTag = otag;
      if (closed) { peer.close(); return; }
      slots.set(slot, peer);
      current = peer;
      peer.on('ctrl', (m) => { if (m?.t === 'hello') { peer.meta.name = String(m.name || '').slice(0, 24); render(); } });
      peer.on('state', render);
      state.offerCode = code; state.slot = slot; state.busy = false;
      render();
    })().finally(() => { offering = null; });
    return offering;
  }

  async function hostOnCode(code) {
    let a;
    try { a = unpackSdp(code); } catch { return notify(LOBBY_COPY.notices.badCode); }
    if (a.kind !== 'answer') return notify(LOBBY_COPY.notices.wrongKind);
    if (offering) await offering;
    const peer = offerTags.get(a.tag);
    if (!peer) return notify(LOBBY_COPY.notices.oldSession);
    if (slots.get(peer.id) !== peer) return notify(LOBBY_COPY.notices.staleReply);
    if (peer.pc.signalingState !== 'have-local-offer') return; // duplicate scan
    try { await hostAcceptAnswer(peer, a, peer.offerTag); } catch (e) { return notify(LOBBY_COPY.notices.connectFailed); }
    if (!state.radioConfirmed) { state.radioConfirmed = true; state.phase = 'offering'; }
    state.notice = null;
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
      notify(LOBBY_COPY.notices.connectFailed);
      if (!current) offerNext();
    });
    peer.on('state', (s) => { if ((s === 'closed' || s === 'failed') && peers.get(peer.id) === peer) { peers.delete(peer.id); slots.delete(peer.id); render(); if (!current && !closed && state.phase === 'offering') offerNext(); } });
    // Reply received: camera off, show the next player's code.
    stopCamera(); state.scanning = false;
    if (current === peer) { current = null; await offerNext(); }
    render();
  }

  /** Host: replace the code on screen with a fresh one (an offer only works with the first iPad that tries it). */
  async function refreshOffer() {
    if (!isHost) return;
    if (offering) await offering;
    if (current && current.pc.signalingState === 'have-local-offer') {
      current.close(); slots.delete(current.id); current = null;
      state.offerCode = null; stopCamera(); state.scanning = false; state.notice = null;
      await offerNext();
    }
  }

  function startRace() {
    if (!isHost) return;
    stopCamera(); state.scanning = false;
    for (const [s, p] of slots) if (p.state !== 'open') { p.close(); slots.delete(s); }
    current = null;
    const players = [{ slot: 0, name }, ...[...peers.values()].map((p) => ({ slot: p.id, name: p.meta.name || `Player ${p.id + 1}` }))];
    const lineup = seatList(players.map((p) => ({ ...p, kind: p.slot === 0 ? 'host' : 'human' })), { seats, aiNames: state.aiNames });
    peers.forEach((p) => p.sendCtrl({ t: 'lobby-closed', players, lineup }));
    setPhase('ready');
    const info = { role, tag, localSlot: 0, peers: [...peers.values()], players, lineup, seats };
    readyCbs.forEach((cb) => cb(info));
  }

  // ---------------- client ----------------
  function scanOffer() { if (!isHost) { if (!state.radioConfirmed) confirmRadio(); startCamera(); } }

  async function clientOnCode(code) {
    if (state.phase !== 'scanOffer' && state.phase !== 'radio') return;
    let o;
    try { o = unpackSdp(code); } catch { return notify(LOBBY_COPY.notices.badCode); }
    if (o.kind !== 'offer') return notify(LOBBY_COPY.notices.wrongKind);
    state.radioConfirmed = true;
    stopCamera(); state.scanning = false;
    setPhase('answering');
    const my = ++attempt;
    let res;
    try { res = await clientAcceptOffer(o); } catch { setPhase('scanOffer'); return notify(LOBBY_COPY.notices.connectFailed); }
    if (closed || my !== attempt) { res.peer.close(); return; }
    const { peer, code: answer, slot } = res;
    clientPeer = peer;
    state.answerCode = answer; state.slot = slot; state.tag = o.tag; state.slow = false;
    setPhase('showAnswer');
    clearTimeout(slowTimer);
    slowTimer = setTimeout(() => { if (my === attempt && state.phase === 'showAnswer') { state.slow = true; render(); } }, slowMs);
    peer.on('state', render);
    try { await peer.opened; } catch {
      if (my !== attempt || closed) return;
      clearTimeout(slowTimer);
      state.answerCode = null; state.slow = false;
      setPhase('scanOffer');
      return notify(LOBBY_COPY.notices.connectFailed);
    }
    if (my !== attempt || closed) return;
    clearTimeout(slowTimer);
    peers.set(0, peer);
    peer.sendCtrl({ t: 'hello', name, slot });
    state.slow = false;
    setPhase('connected');
    peerCbs.forEach((cb) => cb(peer));
    const info = { role, tag: o.tag, localSlot: slot, peers: [peer], host: peer };
    readyCbs.forEach((cb) => cb(info));
  }

  /** Client: abandon the current reply (never scanned / failed) and scan the Host's code again. */
  function retry() {
    if (isHost) return;
    attempt++;
    clearTimeout(slowTimer);
    clientPeer?.close(); clientPeer = null;
    state.answerCode = null; state.slow = false; state.slot = null;
    setPhase('scanOffer');
  }

  async function submitCode(text) {
    text = String(text || '').trim();
    if (!text) return;
    return isHost ? hostOnCode(text) : clientOnCode(text);
  }

  function close({ keepPeers = true } = {}) {
    closed = true;
    clearTimeout(slowTimer);
    stopCamera(); state.scanning = false;
    view?.destroy(); view = null;
    for (const [s, p] of slots) if (!keepPeers || p.state !== 'open') { p.close(); slots.delete(s); }
    if (!keepPeers) { peers.forEach((p) => p.close()); peers.clear(); if (!isHost && clientPeer && !peers.size) clientPeer.close(); }
    ui?.renderLobby?.({ ...state, phase: 'closed' }, actions);
    adapter?.render({ ...state, phase: 'closed' }, actions);
  }

  return {
    role, tag, peers, state, actions,
    start, begin: confirmRadio, confirmRadio, submitCode, startRace, retry, refreshOffer, scanAnswer, scanOffer, stopScan,
    onPeer(cb) { peerCbs.add(cb); return () => peerCbs.delete(cb); },
    onReady(cb) { readyCbs.add(cb); return () => readyCbs.delete(cb); },
    onState(cb) { stateCbs.add(cb); return () => stateCbs.delete(cb); },
    close,
  };
}
