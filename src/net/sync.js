// Star-topology sync over pre-negotiated DataChannels: inputs at 60 Hz, snapshots at 30 Hz.
//   fast (unordered, maxRetransmits 0): client inputs → host, host snapshots → clients, ping/pong
//   ctrl (reliable, ordered): JSON lobby/control messages (countdown, truck choices, seed)

import {
  MSG, INPUT_REDUNDANCY, INPUT_STRIDE, packInputPacket, unpackInputPacket,
  createSnapshotEncoder, createSnapshotDecoder, packPing, packPong, msgType, SNAP_HEADER, SNAP_STRIDE,
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
export function createSync({ role, peers, worldSnapshotSize = 0, snapshotHz = 30, tickRate = 60, keyframeEvery = 10, world, inputBacklog = 4 } = {}) {
  const isHost = role === 'host';
  const inputCbs = new Set(), snapCbs = new Set(), ctrlCbs = new Set();
  const lastSeq = new Map();      // host: peerId → last delivered input seq
  let lastTick = -1;              // client: newest snapshot tick delivered
  const history = [];             // client: last input frames, newest first
  const attached = new WeakSet();
  const unsubs = [];
  // world (deterministic scene) enables 11-byte track-relative car records; defaults to window.__game.world
  const encoder = createSnapshotEncoder({ keyframeEvery, world });
  const decoder = createSnapshotDecoder({ world });
  const queues = new Map();       // host: peerId → pending input frames (jitter buffer for takeInput)
  const consumed = new Map();     // host: peerId → last seq handed out by takeInput (used as ack)
  const lastTaken = new Map();
  const sendEvery = Math.max(1, Math.round(tickRate / snapshotHz));
  let lastSentTick = -Infinity;
  const pendingEvents = new Map(); // id → event bits from ticks we skipped
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
            let q = queues.get(peer.id); if (!q) queues.set(peer.id, (q = []));
            q.push(f); if (q.length > 16) q.shift();
            inputCbs.forEach((cb) => cb(peer.id, f));
          }
        }
        break;
      }
      case MSG.SNAPSHOT: {
        if (isHost) return;
        let s;
        try { s = decoder.decode(data); } catch { return; }
        if (s.tick <= lastTick) return; // stale / reordered
        lastTick = s.tick;
        stats.snapshotsRx++;
        snapCbs.forEach((cb) => cb(s.data, s.tick));
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
    encoderStats: encoder.stats,
    /** CLIENT: send one input frame Float32Array [seq, steer, paddleL, paddleR, handbrake, flags]. */
    sendInput(frame) {
      history.unshift(frame.slice(0, INPUT_STRIDE));
      if (history.length > INPUT_REDUNDANCY) history.length = INPUT_REDUNDANCY;
      const pkt = packInputPacket(history);
      all().forEach((p) => { if (send(p, pkt)) stats.inputsTx++; });
    },
    /** HOST: cb(peerId, Float32Array frame) once per new seq, in order. */
    onInput(cb) { inputCbs.add(cb); return () => inputCbs.delete(cb); },
    /**
     * HOST (recommended, instead of merging onInput frames): call once per physics tick per remote
     * slot. Returns the next input frame from a small jitter buffer so every client frame is applied
     * on exactly one host tick, in order → client prediction replays match. When the buffer is empty
     * the last frame is repeated with paddle pulses cleared (`repeated: true`); when it backs up past
     * `inputBacklog` frames the oldest are merged (paddle pulses kept). The seq returned here is what
     * snapshots ack for this slot. → { frame: Float32Array, seq, repeated } | null
     */
    takeInput(id) {
      const q = queues.get(id);
      if (q && q.length > inputBacklog) {
        let pl = 0, pr = 0;
        while (q.length > inputBacklog) { const d = q.shift(); pl = Math.max(pl, d[2]); pr = Math.max(pr, d[3]); stats.inputsMerged = (stats.inputsMerged || 0) + 1; }
        q[0][2] = Math.max(q[0][2], pl); q[0][3] = Math.max(q[0][3], pr);
      }
      if (q && q.length) {
        const f = q.shift();
        consumed.set(id, f[0]); lastTaken.set(id, f);
        return { frame: f, seq: f[0], repeated: false };
      }
      const last = lastTaken.get(id);
      if (!last) { consumed.set(id, consumed.get(id) ?? -1); return null; }
      const rep = last.slice(); rep[2] = 0; rep[3] = 0;
      stats.inputsRepeated = (stats.inputsRepeated || 0) + 1;
      return { frame: rep, seq: last[0], repeated: true };
    },
    /**
     * HOST: call every physics tick with Float32Array
     *   [tick, count, (id,px,py,pz,qx,qy,qz,qw,vx,vy,vz,s,events,ack)×count]  (SNAP_STRIDE = 14; ack is filled here).
     * Only every (tickRate/snapshotHz)-th tick is sent (30 Hz by default); event bits from skipped
     * ticks are OR-ed into the next sent snapshot. Returns bytes sent per peer (0 when skipped).
     */
    broadcastSnapshot(snap) {
      const tick = snap[0];
      const n = snap[1] | 0;
      if (tick - lastSentTick < sendEvery) {
        for (let i = 0; i < n; i++) { const b = SNAP_HEADER + i * SNAP_STRIDE; const ev = snap[b + 12] | 0; if (ev) pendingEvents.set(snap[b], (pendingEvents.get(snap[b]) | 0) | ev); }
        return 0;
      }
      lastSentTick = tick;
      if (pendingEvents.size) {
        snap = snap.slice();
        for (let i = 0; i < n; i++) { const b = SNAP_HEADER + i * SNAP_STRIDE; snap[b + 12] = (snap[b + 12] | 0) | (pendingEvents.get(snap[b]) | 0); }
        pendingEvents.clear();
      }
      let acks = lastSeq;
      if (consumed.size) { acks = new Map(lastSeq); for (const [id, sq] of consumed) { if (sq >= 0) acks.set(id, sq); else acks.delete(id); } }
      const pkt = encoder.encode(snap, acks);
      let sent = 0;
      all().forEach((p) => { if (send(p, pkt)) sent++; });
      if (sent) { stats.snapshotsTx++; stats.snapshotBytes = pkt.byteLength; stats.snapshotBytesTotal = (stats.snapshotBytesTotal || 0) + pkt.byteLength; }
      return pkt.byteLength;
    },
    /** CLIENT: cb(Float32Array snapshot, tick). Feed it into createInterpolator().push() and createPredictor().onSnapshot(). */
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
