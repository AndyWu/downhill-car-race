// Star-topology sync over pre-negotiated DataChannels: inputs at 60 Hz, snapshots at 30 Hz.
//   fast (unordered, maxRetransmits 0): client inputs → host, host snapshots → clients, ping/pong
//   ctrl (reliable, ordered): JSON lobby/control messages (countdown, truck choices, seed)

import {
  MSG, INPUT_REDUNDANCY, INPUT_STRIDE, INPUT_HZ, packInputPacket, unpackInputPacket, strokeCount, withStrokeCounts, FLAG_HONK,
  createSnapshotEncoder, createSnapshotDecoder, packPing, packPong, msgType, SNAP_HEADER, SNAP_STRIDE, SNAP_EVENTS,
} from './protocol.js';

const now = () => performance.now();

export const WEATHERS = ['clear', 'fog', 'snow', 'rain', 'storm'];
export const TIMES_OF_DAY = ['day', 'night', 'dusk', 'golden'];
export const TRACK_IDS = ['country', 'village', 'corn', 'circuit'];
export const TRACK_NAMES = { country: 'Country Road', village: 'Hill Village', corn: 'Corn & Pumpkins', circuit: 'Speedway' };
/** Whitelists weather/time/trackId from the wire (also accepts 'foggy'/'heavy rain'/'stormy' spellings). */
export function normalizeConditions({ weather, time, trackId } = {}) {
  const alias = { foggy: 'fog', snowy: 'snow', 'heavy rain': 'rain', heavyrain: 'rain', rainy: 'rain', stormy: 'storm', sunny: 'clear' };
  let w = String(weather || 'clear').toLowerCase(); w = alias[w] || w;
  const t = String(time || 'day').toLowerCase();
  const k = String(trackId || 'country').toLowerCase();
  return { weather: WEATHERS.includes(w) ? w : 'clear', time: TIMES_OF_DAY.includes(t) ? t : 'day', trackId: TRACK_IDS.includes(k) ? k : 'country' };
}

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
export function createSync({ role, peers, worldSnapshotSize = 0, snapshotHz = 30, tickRate = 60, keyframeEvery = 10, world, inputBacklog = 8, inputHz = INPUT_HZ } = {}) {
  const isHost = role === 'host';
  const inputCbs = new Set(), snapCbs = new Set(), ctrlCbs = new Set();
  const lastSeq = new Map();      // host: peerId → last delivered input seq
  let lastTick = -1;              // client: newest snapshot tick delivered
  const history = [];             // client: last input frames, newest first
  let raceConditions = normalizeConditions();
  const HONK = SNAP_EVENTS.HONK, HONK_CNT_MASK = 0xc0;
  const honkCount = new Map(), honkRepeat = new Map(), seenHonk = new Map();
  const strokes = [0, 0];         // client: cumulative paddle stroke counters (mod 256)
  const applied = new Map();      // host: peerId → [strokes applied L, R] (mod 256)
  const lastImpulse = new Map();  // host: peerId → [last non-zero impulse L, R]
  const inputEvery = Math.max(1, Math.round(tickRate / inputHz));
  let unsent = 0;
  const attached = new WeakSet();
  const unsubs = [];
  // world (deterministic scene) enables 11-byte track-relative car records; defaults to window.__game.world
  const encoder = createSnapshotEncoder({ keyframeEvery, world });
  const decoder = createSnapshotDecoder({ world });
  const queues = new Map();       // host: peerId → pending input frames (jitter buffer for takeInput)
  const consumed = new Map();     // host: peerId → last seq handed out by takeInput (used as ack)
  const lastTaken = new Map();
  const depthWin = new Map();      // host: peerId → { n, min } jitter-buffer depth window
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
    unsubs.push(peer.on('ctrl', (m) => {
      if (m && m.t === 'ready' && isHost) { onReadyAck(peer.id, m); return; }
      if (m && m.t === 'prepare' && !isHost) onPrepare(m);
      ctrlCbs.forEach((cb) => cb(peer.id, m));
    }));
  }
  const all = () => { const l = listPeers(peers); l.forEach(attach); return l; };
  all();

  function onFast(peer, data) {
    if (!(data instanceof ArrayBuffer) || data.byteLength < 2) return;
    stats.recvBytes += data.byteLength;
    switch (msgType(data)) {
      case MSG.INPUT: {
        if (!isHost) return;
        const last = lastSeq.has(peer.id) ? lastSeq.get(peer.id) : -1;
        const frames = unpackInputPacket(data, last); // newest first
        let q = queues.get(peer.id); if (!q) queues.set(peer.id, (q = []));
        const done = consumed.has(peer.id) ? consumed.get(peer.id) : -1;
        for (let i = frames.length - 1; i >= 0; i--) {
          const f = frames[i];
          // jitter buffer accepts late / reordered frames (redundant copies fill the gaps)
          if (f[0] > done && f[0] < last && !q.some((x) => x[0] === f[0])) {
            let at = q.length; while (at > 0 && q[at - 1][0] > f[0]) at--;
            q.splice(at, 0, f);
          }
          if (f[0] > last) {
            lastSeq.set(peer.id, f[0]);
            stats.inputsRx++;
            q.push(f); if (q.length > 32) q.shift();
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
        // honk de-duplication (each honk is repeated in up to 3 snapshots with a 2-bit counter)
        for (let i = 0; i < s.data[1]; i++) {
          const b = SNAP_HEADER + i * SNAP_STRIDE, id = s.data[b], ev = s.data[b + 12] | 0;
          if (ev & HONK) {
            const cnt = (ev & HONK_CNT_MASK) >> 6;
            const fresh = seenHonk.get(id) !== cnt;
            seenHonk.set(id, cnt);
            s.data[b + 12] = (ev & ~(HONK | HONK_CNT_MASK)) | (fresh ? HONK : 0);
          }
        }
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

  // ---- race-start handshake: prepare (world rebuild on clients) → ready acks → countdown ----
  const prepareCbs = new Set(), progressCbs = new Set();
  let pending = null; // host: { raceId, expected:Set, ready:Set, done() }
  function onReadyAck(id, m) {
    if (!pending || m.raceId !== pending.raceId) return;
    pending.ready.add(id);
    const st = { raceId: pending.raceId, ready: [...pending.ready], expected: [...pending.expected] };
    progressCbs.forEach((cb) => cb(st));
    pending.check();
  }
  function sendReady(raceId, extra = {}) {
    all().forEach((p) => p.sendCtrl({ t: 'ready', raceId, ...extra }));
  }
  function onPrepare(m) {
    const info = { raceId: m.raceId, ...normalizeConditions(m), players: m.players, trucks: m.trucks, seed: m.seed, raw: m };
    if (!prepareCbs.size) { sendReady(m.raceId); return; } // nothing to rebuild → ack at once
    Promise.all([...prepareCbs].map((cb) => { try { return Promise.resolve(cb(info)); } catch (e) { return Promise.reject(e); } }))
      .then(() => sendReady(m.raceId), (e) => sendReady(m.raceId, { error: String(e && e.message || e) }));
  }

  const api = {
    role,
    worldSnapshotSize,
    clock,
    stats,
    encoderStats: encoder.stats,
    /** CLIENT: send one input frame Float32Array [seq, steer, paddleL, paddleR, handbrake, flags]. */
    sendInput(frame) {
      const f = frame.slice(0, INPUT_STRIDE);
      const prev = history[0];
      if (prev && f[0] !== prev[0] + 1) { history.length = 0; unsent = 0; } // seq restarted
      // cumulative stroke counters: every frame with a paddle impulse is one stroke
      if (f[2] > 0) { strokes[0] = (strokes[0] + 1) & 255; stats.strokesSent = (stats.strokesSent || 0) + 1; }
      if (f[3] > 0) { strokes[1] = (strokes[1] + 1) & 255; stats.strokesSent = (stats.strokesSent || 0) + 1; }
      withStrokeCounts(f, strokes[0], strokes[1]);
      history.unshift(f);
      if (history.length > INPUT_REDUNDANCY) history.length = INPUT_REDUNDANCY;
      if (++unsent < inputEvery) return;
      unsent = 0;
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
      const merge = (n) => { // fold n queued frames into one (latest steer, paddle pulses kept)
        let pl = 0, pr = 0, honk = 0;
        for (let i = 0; i < n - 1; i++) { const d = q.shift(); pl = Math.max(pl, d[2]); pr = Math.max(pr, d[3]); honk |= (d[5] | 0) & FLAG_HONK; }
        q[0][2] = Math.max(q[0][2], pl); q[0][3] = Math.max(q[0][3], pr); q[0][5] = (q[0][5] | 0) | honk;
        stats.inputsMerged = (stats.inputsMerged || 0) + n - 1;
      };
      if (q && q.length > inputBacklog) merge(q.length - inputBacklog + 1);
      // Shed standing latency: if the buffer never dipped below 2 frames for ~1 s, the link no
      // longer needs that much cushion → fold one frame (one small, smoothed correction).
      if (q) {
        const w = depthWin.get(id) || { n: 0, min: Infinity };
        w.min = Math.min(w.min, q.length); w.n++;
        if (w.n >= 60) { if (w.min >= 2 && q.length >= 2) { merge(2); stats.inputsTrimmed = (stats.inputsTrimmed || 0) + 1; } w.n = 0; w.min = Infinity; }
        depthWin.set(id, w);
      }
      // Strokes are applied from the cumulative counters, not from the frame's own impulse:
      // every stroke the client made is applied exactly once, even if its frame was lost,
      // merged or trimmed (one per tick; a backlog drains over the following ticks).
      const applyStrokes = (f, src) => {
        let ap = applied.get(id);
        const li = lastImpulse.get(id) || [1, 1];
        if (!ap) { ap = [(strokeCount(src, 0) - (src[2] > 0 ? 1 : 0)) & 255, (strokeCount(src, 1) - (src[3] > 0 ? 1 : 0)) & 255]; applied.set(id, ap); }
        for (const side of [0, 1]) {
          if (src[2 + side] > 0) li[side] = src[2 + side];
          const due = (strokeCount(src, side) - ap[side]) & 255;
          if (due > 0 && due < 128) {
            if (!(src[2 + side] > 0)) stats.strokesRecovered = (stats.strokesRecovered || 0) + 1;
            f[2 + side] = src[2 + side] > 0 ? src[2 + side] : li[side];
            ap[side] = (ap[side] + 1) & 255;
            stats.strokesApplied = (stats.strokesApplied || 0) + 1;
          } else f[2 + side] = 0;
        }
        lastImpulse.set(id, li);
        return f;
      };
      if (q && q.length) {
        const f = q.shift();
        const prevF = lastTaken.get(id);
        if (prevF && f[0] > prevF[0] + 1) stats.inputsLost = (stats.inputsLost || 0) + (f[0] - prevF[0] - 1);
        lastTaken.set(id, f.slice());
        consumed.set(id, f[0]);
        applyStrokes(f, lastTaken.get(id));
        return { frame: f, seq: f[0], repeated: false };
      }
      const last = lastTaken.get(id);
      if (!last) { consumed.set(id, consumed.get(id) ?? -1); return null; }
      const rep = last.slice();
      rep[5] = (rep[5] | 0) & ~FLAG_HONK; // a repeated frame never re-honks
      const src = last.slice(); src[2] = 0; src[3] = 0; // the repeated frame's own stroke was already applied
      applyStrokes(rep, src);                             // …but a backlog of missed strokes still drains
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
      const snapIn = snap;
      const tick = snap[0];
      const n = snap[1] | 0;
      if (tick - lastSentTick < sendEvery) {
        for (let i = 0; i < n; i++) { const b = SNAP_HEADER + i * SNAP_STRIDE; const ev = snap[b + 12] | 0; if (ev) pendingEvents.set(snap[b], (pendingEvents.get(snap[b]) | 0) | ev); }
        return 0;
      }
      lastSentTick = tick;
      if (pendingEvents.size || honkRepeat.size) {
        snap = snap.slice();
        for (let i = 0; i < n; i++) { const b = SNAP_HEADER + i * SNAP_STRIDE; snap[b + 12] = (snap[b + 12] | 0) | (pendingEvents.get(snap[b]) | 0); }
        pendingEvents.clear();
      }
      // Honks ride in 3 consecutive snapshots with a 2-bit per-car counter (bits 6-7), so a lost
      // unreliable packet doesn't eat a horn and clients can de-duplicate the repeats.
      for (let i = 0; i < n; i++) {
        const b = SNAP_HEADER + i * SNAP_STRIDE, id = snap[b];
        let ev = (snap[b + 12] | 0) & ~(HONK | HONK_CNT_MASK);
        if ((snap[b + 12] | 0) & HONK) { if (snap === snapIn) snap = snap.slice(); honkCount.set(id, ((honkCount.get(id) || 0) + 1) & 3); honkRepeat.set(id, 3); }
        const rep = honkRepeat.get(id) || 0;
        if (rep > 0) { ev |= HONK | (honkCount.get(id) << 6); if (rep > 1) honkRepeat.set(id, rep - 1); else honkRepeat.delete(id); }
        if (ev !== (snap[b + 12] | 0)) { if (snap === snapIn) snap = snap.slice(); snap[b + 12] = ev; }
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
      this.sendControl({ t: 'countdown', goAtHostMs: at, seconds, ...raceConditions, ...extra });
      return at;
    },
    /** HOST: weather/time/trackId sent with the prepare + countdown messages. Unknown → clear/day/country. */
    setRaceConditions({ weather, time, trackId } = {}) { raceConditions = normalizeConditions({ weather, time, trackId: trackId ?? raceConditions.trackId }); return raceConditions; },
    /**
     * HOST: two-phase race start. Sends {t:'prepare', raceId, weather, time, trackId, ...extra} so
     * clients can rebuild their world, waits until every connected client acks 'ready' (or
     * `timeoutMs`), then sends the countdown. Resolves { goAtLocal, raceId, ready:[ids], timedOut:[ids] }.
     * Clients that ack late simply join the countdown in progress.
     */
    prepareRace({ seconds = 3, timeoutMs = 20000, ...extra } = {}) {
      const cond = normalizeConditions({ ...raceConditions, ...extra });
      raceConditions = cond;
      const raceId = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
      const expected = new Set(all().filter((p) => p.ctrl?.readyState === 'open').map((p) => p.id));
      return new Promise((resolve) => {
        let timer = null;
        const finish = () => {
          clearTimeout(timer);
          const ready = [...pending.ready], timedOut = [...expected].filter((id) => !pending.ready.has(id));
          pending = null;
          const goAtLocal = api.startCountdown(seconds, { raceId, ...extra, ...cond });
          resolve({ goAtLocal, raceId, ready, timedOut, ...cond });
        };
        pending = {
          raceId, expected, ready: new Set(),
          check() {
            const open = new Set(all().filter((p) => p.ctrl?.readyState === 'open').map((p) => p.id));
            if ([...expected].every((id) => pending.ready.has(id) || !open.has(id))) finish();
          },
        };
        timer = setTimeout(finish, timeoutMs);
        api.sendControl({ t: 'prepare', raceId, ...extra, ...cond });
        pending.check(); // no clients → start at once
      });
    },
    /** HOST: cb({ raceId, ready:[ids], expected:[ids] }) whenever a client acks (for a "2/3 ready" label). */
    onPrepareProgress(cb) { progressCbs.add(cb); return () => progressCbs.delete(cb); },
    /**
     * CLIENT: cb({ raceId, weather, time, trackId, players, trucks, seed }) when the host prepares a
     * race. Return a promise that resolves once the world for `trackId` is built; 'ready' is then
     * sent automatically. With no handler registered the client acks immediately.
     */
    onRacePrepare(cb) { prepareCbs.add(cb); return () => prepareCbs.delete(cb); },
    /** CLIENT: manual ack (normally automatic via onRacePrepare). */
    sendReady,
    get raceConditions() { return { ...raceConditions }; },
    /**
     * CLIENT: cb({ goAtLocal, seconds, weather, time, players, trucks, seed, raw }) when the host
     * starts the race. goAtLocal is already converted to this device's performance.now() clock.
     */
    onRaceStart(cb) {
      const h = (id, m) => {
        if (!m || m.t !== 'countdown') return;
        const goAtLocal = clock.synced ? clock.toLocal(m.goAtHostMs) : now() + (m.seconds || 3) * 1000;
        cb({ goAtLocal, seconds: m.seconds, raceId: m.raceId, ...normalizeConditions(m), players: m.players, trucks: m.trucks, seed: m.seed, raw: m });
      };
      ctrlCbs.add(h);
      return () => ctrlCbs.delete(h);
    },
    /** HOST: last input seq applied for a slot via takeInput (−1 if none). */
    consumedSeq(id) { return consumed.has(id) ? consumed.get(id) : -1; },
    close() { clearTimeout(pingTimer); unsubs.forEach((u) => u()); inputCbs.clear(); snapCbs.clear(); ctrlCbs.clear(); },
  };
  if (globalThis.__NET_DEBUG) (globalThis.__netDebug ??= {}).sync = api; // test instrumentation
  return api;
}
