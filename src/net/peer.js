// RTCPeerConnection wrapper + serverless offer/answer helpers (no camera needed — the QR
// layer just moves the returned code strings between devices).

import { packSdp, unpackSdp } from './sdpPack.js';

// Two pre-negotiated channels so neither side needs ondatachannel / extra round trips.
export const CHANNELS = {
  fast: { id: 0, label: 'fast', ordered: false, maxRetransmits: 0 }, // 60 Hz input / snapshots
  ctrl: { id: 1, label: 'ctrl', ordered: true },                      // lobby, countdown, seed
};

const GATHER_TIMEOUT_MS = 3000;

function emitter() {
  const m = new Map();
  return {
    on(ev, cb) { if (!m.has(ev)) m.set(ev, new Set()); m.get(ev).add(cb); return () => m.get(ev).delete(cb); },
    emit(ev, ...a) { m.get(ev)?.forEach((cb) => { try { cb(...a); } catch (e) { console.error(e); } }); },
  };
}

/** Peer object shared by lobby + sync. `id` = player slot (host is 0, clients 1..5). */
export function createPeer(id) {
  const pc = new RTCPeerConnection({ iceServers: [] });
  const ev = emitter();
  const mk = (spec) => {
    const opts = { negotiated: true, id: spec.id, ordered: spec.ordered };
    if (spec.maxRetransmits !== undefined) opts.maxRetransmits = spec.maxRetransmits;
    const ch = pc.createDataChannel(spec.label, opts);
    ch.binaryType = 'arraybuffer';
    return ch;
  };
  const fast = mk(CHANNELS.fast);
  const ctrl = mk(CHANNELS.ctrl);
  const peer = {
    id, pc, fast, ctrl,
    meta: {},           // name, truck, etc. (filled by lobby messages)
    state: 'new',
    on: ev.on,
    sendFast(buf) { if (fast.readyState === 'open') { try { fast.send(buf); } catch { /* buffer full: drop */ } } },
    sendCtrl(obj) { if (ctrl.readyState === 'open') ctrl.send(JSON.stringify(obj)); },
    close() { try { pc.close(); } catch { /* ignore */ } setState('closed'); },
  };
  const setState = (s) => { if (peer.state !== s) { peer.state = s; ev.emit('state', s); } };
  let opened = 0;
  const onOpen = () => { if (++opened === 2) setState('open'); };
  fast.onopen = onOpen;
  ctrl.onopen = onOpen;
  fast.onmessage = (e) => ev.emit('fast', e.data);
  ctrl.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } ev.emit('ctrl', m); };
  fast.onclose = ctrl.onclose = () => setState('closed');
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (s === 'failed' || s === 'closed') setState(s === 'failed' ? 'failed' : 'closed');
    else if (s === 'disconnected') setState('disconnected');
    else if (s === 'connected' && peer.state === 'disconnected') setState('open');
  };
  peer.opened = new Promise((res, rej) => {
    ev.on('state', (s) => { if (s === 'open') res(peer); else if (s === 'failed' || s === 'closed') rej(new Error('peer ' + s)); });
  });
  peer.opened.catch(() => {});
  return peer;
}

/**
 * Resolve when ICE gathering completes. With iceServers:[] only host candidates exist and they
 * appear within milliseconds, but some stacks (and sandboxed/no-network hosts) never fire
 * 'complete' — so we also settle once candidates have been idle for `idleMs`, capped at `timeout`.
 */
export function waitIceComplete(pc, { timeout = GATHER_TIMEOUT_MS, idleMs = 400 } = {}) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((res) => {
    let idle = null;
    const t = setTimeout(done, timeout);
    function done() { clearTimeout(t); clearTimeout(idle); pc.removeEventListener('icegatheringstatechange', chk); pc.removeEventListener('icecandidate', cand); res(); }
    function chk() { if (pc.iceGatheringState === 'complete') done(); }
    function cand(e) {
      if (!e.candidate) return done();
      clearTimeout(idle);
      idle = setTimeout(done, idleMs);
    }
    pc.addEventListener('icegatheringstatechange', chk);
    pc.addEventListener('icecandidate', cand);
    // Candidates may already have been gathered before we attached.
    if (/a=candidate:/.test(pc.localDescription?.sdp || '')) idle = setTimeout(done, idleMs);
  });
}

/** HOST: create peer for `slot`, gather ICE, return compact offer code. */
export async function hostCreateOffer(slot, tag) {
  const peer = createPeer(slot);
  await peer.pc.setLocalDescription(await peer.pc.createOffer());
  await waitIceComplete(peer.pc);
  const code = packSdp(peer.pc.localDescription.sdp, { kind: 'offer', slot, tag });
  peer.offerCode = code;
  return { peer, code };
}

/** HOST: apply a client's answer code to the matching peer. */
export async function hostAcceptAnswer(peer, code, tag) {
  const a = typeof code === 'string' ? unpackSdp(code) : code;
  if (a.kind !== 'answer') throw new Error('That QR is an offer, not an answer');
  if (tag !== undefined && a.tag !== tag) throw new Error('Answer is from a different race session');
  if (a.slot !== peer.id) throw new Error(`Answer is for slot ${a.slot}, expected ${peer.id}`);
  await peer.pc.setRemoteDescription({ type: 'answer', sdp: a.sdp });
  peer.state = 'connecting';
  return peer;
}

/** CLIENT: consume host offer code, return { peer, code(answer), slot, tag }. */
export async function clientAcceptOffer(code) {
  const o = typeof code === 'string' ? unpackSdp(code) : code;
  if (o.kind !== 'offer') throw new Error('That QR is an answer, not an offer');
  const peer = createPeer(0); // remote is the host (slot 0); our own slot is o.slot
  peer.localSlot = o.slot;
  await peer.pc.setRemoteDescription({ type: 'offer', sdp: o.sdp });
  await peer.pc.setLocalDescription(await peer.pc.createAnswer());
  await waitIceComplete(peer.pc);
  const answer = packSdp(peer.pc.localDescription.sdp, { kind: 'answer', slot: o.slot, tag: o.tag });
  return { peer, code: answer, slot: o.slot, tag: o.tag };
}
