// 60 Hz star-topology sync over pre-negotiated DataChannels.
//   fast (unordered, maxRetransmits 0): client inputs → host, host snapshots → clients, ping/pong
//   ctrl (reliable, ordered): JSON lobby/control messages (countdown, truck choices, seed)

import {
  MSG, INPUT_REDUNDANCY, INPUT_STRIDE, packInputPacket, unpackInputPacket,
  packSnapshot, unpackSnapshot, packPing, packPong, msgType,
} from './protocol.js';

const now = () => performance.now();

function listPeers(peers) {
  if (!peers) return [];
  if (typeof peers === 'function') return listPeers(peers());
  if (peers instanceof Map) return [...peers.values()];
  if (Array.isArray(peers)) return peers;
  return [peers];
}

/**
 * @param {{role:'host'|'client', peers: Peer[]|Map|()=>Peer[], worldSnapshotSize?: number}} o
 */
export function createSync({ role, peers, worldSnapshotSize = 0 } = {}) {
  const isHost = role === 'host';
  const inputCbs = new Set(), snapCbs = new Set(), ctrlCbs = new Set();
  const lastSeq = new Map();      // host: peerId → last delivered input seq
  let lastTick = -1;              // client: newest snapshot tick delivered
  const history = [];             // client: last input frames, newest first
  const attached = new WeakSet();
  const unsubs = [];
  const stats = { sentBytes: 0, recvBytes: 0, inputsRx: 0, snapshotsRx: 0, snapshotsTx: 0, inputsTx: 0 };

  // ---- clock sync (client side estimates host clock) ----
  const clock = {
    offset: 0, rtt: 0, samples: [],
    hostNow() { return isHost ? now() : now() + this.offset; },
    toLocal(hostMs) { return isHost ? hostMs : hostMs - this.offset; },
    synced: isHost,
  };
  let pingTimer = null;
  let pingsSent = 0;

  function attach(peer) {
    if (!peer || attached.has(peer)) return;
    attached.add(peer);
    unsubs.push(peer.on('fast', (data) => onFast(peer, data)));
    unsubs.push(peer.on('ctrl', (m) => ctrlCbs.forEach((cb) => cb(peer.id, m))));
  }
  const all = () => { const l = listPeers(peers); l.forEach(attach); return l; };
  all();

  function onFast(peer, data) {
    if (!(data instanceof ArrayBuffer) || data.byteLength < 2) return;
    stats.recvBytes += data.byteLength;
    switch (msgType(data)) {
      case MSG.INPUT: {
        if (!isHost) return;
        const frames = unpackInputPacket(data); // newest first
        const last = lastSeq.has(peer.id) ? lastSeq.get(peer.id) : -1;
        for (let i = frames.length - 1; i >= 0; i--) {
          const f = frames[i];
          if (f[0] > last) {
            lastSeq.set(peer.id, f[0]);
            stats.inputsRx++;
            inputCbs.forEach((cb) => cb(peer.id, f));
          }
        }
        break;
      }
      case MSG.SNAPSHOT: {
        if (isHost) return;
        const s = unpackSnapshot(data);
        if (s.tick <= lastTick) return; // stale / reordered
        lastTick = s.tick;
        stats.snapshotsRx++;
        snapCbs.forEach((cb) => cb(s.data, s.tick, s.hostTimeMs));
        break;
      }
      case MSG.PING: {
        if (!isHost) return;
        const t = new DataView(data).getFloat64(8, true);
        send(peer, packPong(t, now()));
        break;
      }
      case MSG.PONG: {
        if (isHost) return;
        const dv = new DataView(data);
        const t0 = dv.getFloat64(8, true), hostT = dv.getFloat64(16, true), t1 = now();
        const rtt = t1 - t0;
        clock.samples.push({ rtt, offset: hostT + rtt / 2 - t1 });
        if (clock.samples.length > 8) clock.samples.shift();
        const best = clock.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
        clock.rtt = best.rtt; clock.offset = best.offset; clock.synced = true;
        break;
      }
    }
  }

  function send(peer, buf) {
    if (peer.fast?.readyState !== 'open') return false;
    peer.sendFast(buf);
    stats.sentBytes += buf.byteLength;
    return true;
  }

  if (!isHost) {
    const ping = () => {
      all().forEach((p) => send(p, packPing(now())));
      pingsSent++;
      pingTimer = setTimeout(ping, pingsSent < 8 ? 250 : 2000);
    };
    pingTimer = setTimeout(ping, 50);
  }

  return {
    role,
    worldSnapshotSize,
    clock,
    stats,
    /** CLIENT: send one input frame Float32Array [seq, steer, paddleL, paddleR, handbrake, flags]. */
    sendInput(frame) {
      history.unshift(frame.slice(0, INPUT_STRIDE));
      if (history.length > INPUT_REDUNDANCY) history.length = INPUT_REDUNDANCY;
      const pkt = packInputPacket(history);
      all().forEach((p) => { if (send(p, pkt)) stats.inputsTx++; });
    },
    /** HOST: cb(peerId, Float32Array frame) once per new seq, in order. */
    onInput(cb) { inputCbs.add(cb); return () => inputCbs.delete(cb); },
    /** HOST: Float32Array [tick, count, (id,px,py,pz,qx,qy,qz,qw,vx,vy,vz,s,events)×count]. */
    broadcastSnapshot(snap) {
      const pkt = packSnapshot(snap, now());
      let n = 0;
      all().forEach((p) => { if (send(p, pkt)) n++; });
      if (n) stats.snapshotsTx++;
      return pkt.byteLength;
    },
    /** CLIENT: cb(Float32Array snapshot, tick, hostTimeMs). Feed it into createInterpolator().push(). */
    onSnapshot(cb) { snapCbs.add(cb); return () => snapCbs.delete(cb); },
    /** Reliable control message. Host: to all (or one peerId). Client: to host. */
    sendControl(msg, peerId) {
      all().forEach((p) => { if (peerId === undefined || p.id === peerId) p.sendCtrl(msg); });
    },
    onControl(cb) { ctrlCbs.add(cb); return () => ctrlCbs.delete(cb); },
    /** HOST helper: schedule a synchronized countdown; clients convert with clock.toLocal(). */
    startCountdown(seconds = 3, extra = {}) {
      const at = now() + 300 + seconds * 1000;
      this.sendControl({ t: 'countdown', goAtHostMs: at, seconds, ...extra });
      return at;
    },
    close() { clearTimeout(pingTimer); unsubs.forEach((u) => u()); inputCbs.clear(); snapCbs.clear(); ctrlCbs.clear(); },
  };
}
