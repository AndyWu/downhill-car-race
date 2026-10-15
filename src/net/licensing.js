// Offline Family Sharing licensing — no server.
//
// Chain of trust:
//   ISSUER (publisher key, public half embedded below)
//     └─ signs FAMILY PASS  { k:'pass', id, seats:6, owner:<owner device public key>, iat }
//          └─ owner device key signs SEAT tokens { k:'seat', pass, i:0..5, g:generation, n:name, dev:<device pub>|null }
//
// • Each iPad has its own ECDSA P-256 device keypair (private key non-extractable in IndexedDB).
// • The device that redeemed the purchase is the pass "owner" and can provision up to 6 seats.
// • A seat can be moved to another iPad with a signed grant shown as a QR (SBDG1.<pass>~<seat>).
//   Optionally the receiving iPad first shows a seat request (SBDR1.<its device pub>) so the
//   grant is bound to that iPad only. Re-granting a seat index bumps its generation `g`; when
//   devices meet in a lobby the host can reject stale generations (compareSeats()).
// • Persistence: IndexedDB ('sbd-licensing'), mirrored to localStorage, memory as last resort.

import { signToken, verifyToken, readToken, exportPublicRaw, importPublicRaw, importPublicJwk, randomId, ALG } from './licenseToken.js';

export const MAX_SEATS = 6;
const DB_NAME = 'sbd-licensing', STORE = 'kv', LS_KEY = 'sbd.license.v1';

// Vite replaces import.meta.env (and .DEV) statically; in plain Node it is undefined.
const VITE_ENV = import.meta.env || {};
const IS_DEV_BUILD = !!VITE_ENV.DEV;

const DEV_ISSUER_PUBLIC = { kid: 'dev', jwk: { kty: 'EC', crv: 'P-256', x: '7zdEhLcyyOhHoSERkjhB5eK7AeRuFq51tHgmBa1NDvI', y: 'g0H-k3wD6zAHdc7FW3WRWpzKY-a1_hG0kcZq1AYUlTM' } };
// Issuer public keys the app trusts in production builds.
const PROD_ISSUER_PUBLIC_KEYS = [
  // { kid: 'prod-2026', jwk: { kty:'EC', crv:'P-256', x:'…', y:'…' } },   ← publisher adds real key here
];

// The literal `import.meta.env.DEV` guard lets the bundler drop devIssuer.js (and its private
// key) from production builds entirely.
const defaultDevIssuerLoader = () => (import.meta.env.DEV ? import('./devIssuer.js') : Promise.reject(new Error('Dev passes are disabled in production builds')));

// ---------------- storage ----------------
function openIDB() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no indexedDB'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function createStorage() {
  const ls = (() => { try { const s = globalThis.localStorage; s.setItem('__t', '1'); s.removeItem('__t'); return s; } catch { return null; } })();
  const mem = new Map();
  let db = null;
  try { db = await openIDB(); } catch { db = null; }
  const tx = (mode, fn) => new Promise((res, rej) => {
    const t = db.transaction(STORE, mode); const st = t.objectStore(STORE); const r = fn(st);
    t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error);
  });
  return {
    kind: db ? 'indexeddb' : ls ? 'localStorage' : 'memory',
    async get(k) {
      if (db) { try { return await tx('readonly', (s) => s.get(k)); } catch { /* fall through */ } }
      if (mem.has(k)) return mem.get(k);
      try { return JSON.parse(ls?.getItem(LS_KEY + '.' + k) || 'null') ?? undefined; } catch { return undefined; }
    },
    async set(k, v) {
      mem.set(k, v);
      if (db) { try { await tx('readwrite', (s) => s.put(v, k)); return; } catch { /* fall back */ } }
      try { ls?.setItem(LS_KEY + '.' + k, JSON.stringify(v)); } catch { /* quota */ }
    },
    mirrorRead() { try { return JSON.parse(ls?.getItem(LS_KEY) || 'null'); } catch { return null; } },
    mirrorWrite(obj) { try { ls?.setItem(LS_KEY, JSON.stringify(obj)); } catch { /* quota */ } },
    get hasIDB() { return !!db; },
  };
}

// ---------------- licensing ----------------
/**
 * @param {{trustDevIssuer?:boolean, loadDevIssuer?:()=>Promise<{DEV_ONLY_issuerKey:Function}>}} [o]
 *   Tests in Node pass both explicitly; in the browser they default to "dev build only".
 */
function createLicensing({ trustDevIssuer = IS_DEV_BUILD, loadDevIssuer = defaultDevIssuerLoader } = {}) {
  const ISSUER_PUBLIC_KEYS = [...PROD_ISSUER_PUBLIC_KEYS, ...(trustDevIssuer ? [DEV_ISSUER_PUBLIC] : [])];
  let store = null;
  let device = null;          // { privateKey, publicKey, pub (b64 raw) }
  let passToken = null;       // string
  let pass = null;            // verified payload
  let seatTokens = [];        // strings (all seats known on this device)
  let ledger = {};            // owner only: i → { g, n, dev }
  let verified = { ok: false, reason: 'not initialised' };
  let initP = null;

  async function issuerKeys() { return Promise.all(ISSUER_PUBLIC_KEYS.map((k) => importPublicJwk(k.jwk))); }

  async function loadDevice() {
    let kp = await store.get('deviceKey');
    if (kp?.jwk) { // localStorage/memory path stores JWK
      kp = { privateKey: await crypto.subtle.importKey('jwk', kp.jwk.priv, ALG, true, ['sign']), publicKey: await crypto.subtle.importKey('jwk', kp.jwk.pub, ALG, true, ['verify']) };
    }
    if (!kp?.privateKey) {
      const extractable = !store.hasIDB; // IndexedDB can hold non-extractable CryptoKeys
      kp = await crypto.subtle.generateKey(ALG, extractable, ['sign', 'verify']);
      if (store.hasIDB) await store.set('deviceKey', { privateKey: kp.privateKey, publicKey: kp.publicKey });
      else {
        const jwk = { priv: await crypto.subtle.exportKey('jwk', kp.privateKey), pub: await crypto.subtle.exportKey('jwk', kp.publicKey) };
        await store.set('deviceKey', { jwk });
      }
    }
    device = { ...kp, pub: await exportPublicRaw(kp.publicKey) };
  }

  async function persist() {
    const data = { pass: passToken, seats: seatTokens, ledger };
    await store.set('license', data);
    store.mirrorWrite(data);
  }

  async function verifyPass(token) {
    for (const k of await issuerKeys()) {
      const p = await verifyToken(token, k).catch(() => null);
      if (p && p.k === 'pass' && p.v === 1 && p.seats <= MAX_SEATS) return p;
    }
    return null;
  }

  async function verifySeat(token, p = pass) {
    if (!p) return null;
    const owner = await importPublicRaw(p.owner);
    const s = await verifyToken(token, owner).catch(() => null);
    if (!s || s.k !== 'seat' || s.pass !== p.id) return null;
    if (!(Number.isInteger(s.i) && s.i >= 0 && s.i < Math.min(p.seats, MAX_SEATS))) return null;
    return s;
  }

  async function doVerify() {
    if (!passToken) { verified = { ok: false, reason: 'no pass', seats: [] }; return verified; }
    pass = await verifyPass(passToken);
    if (!pass) { verified = { ok: false, reason: 'pass signature invalid', seats: [] }; return verified; }
    // one seat per index — highest generation wins; enforce MAX_SEATS
    const byIdx = new Map();
    for (const t of seatTokens) {
      const s = await verifySeat(t);
      if (!s) continue;
      const cur = byIdx.get(s.i);
      if (!cur || s.g > cur.s.g) byIdx.set(s.i, { s, t });
    }
    seatTokens = [...byIdx.values()].map((x) => x.t).slice(0, MAX_SEATS);
    const isOwner = pass.owner === device.pub;
    const seats = [...byIdx.values()].map(({ s }) => ({ index: s.i, name: s.n, generation: s.g, boundTo: s.dev, mine: !s.dev || s.dev === device.pub }));
    seats.sort((a, b) => a.index - b.index);
    const ok = isOwner || seats.some((x) => x.mine);
    verified = { ok, reason: ok ? null : 'no seat for this iPad', isOwner, passId: pass.id, maxSeats: Math.min(pass.seats, MAX_SEATS), seats, dev: pass.dev === true, storage: store.kind };
    return verified;
  }

  async function init() {
    if (initP) return initP;
    initP = (async () => {
      store = await createStorage();
      await loadDevice();
      let data = await store.get('license');
      if (!data?.pass) data = store.mirrorRead() || data; // IndexedDB evicted → restore from mirror
      passToken = data?.pass || null;
      seatTokens = data?.seats || [];
      ledger = data?.ledger || {};
      await doVerify();
      return verified;
    })();
    return initP;
  }

  const api = {
    MAX_SEATS,
    init,
    async verify() { await init(); return doVerify(); },
    /** Synchronous list of seat profiles known on this device (after init). */
    seats() { return verified.seats ? verified.seats.slice() : []; },
    status() { return { ...verified }; },
    get devicePublicKey() { return device?.pub ?? null; },

    /** Owner: create a seat profile (max 6 per family pass). Returns { index, name, token }. */
    async provisionSeat(name, { forDevice = device?.pub ?? null, index } = {}) {
      await init();
      if (!pass) throw new Error('No family pass on this iPad');
      if (pass.owner !== device.pub) throw new Error('Only the iPad that bought the family pass can add seats');
      const max = Math.min(pass.seats, MAX_SEATS);
      if (index === undefined) {
        index = -1;
        for (let i = 0; i < max; i++) if (!ledger[i]) { index = i; break; }
        if (index < 0) throw new Error(`All ${max} family seats are in use`);
      }
      if (!(index >= 0 && index < max)) throw new Error('Seat index out of range');
      const g = (ledger[index]?.g ?? -1) + 1;
      const payload = { k: 'seat', v: 1, pass: pass.id, i: index, g, n: String(name || `Racer ${index + 1}`).slice(0, 24), dev: forDevice, iat: Math.floor(Date.now() / 1000) };
      const token = await signToken(payload, device.privateKey);
      ledger[index] = { g, n: payload.n, dev: forDevice };
      seatTokens = seatTokens.filter((t) => readToken(t).payload.i !== index);
      if (forDevice === device.pub || forDevice === null) seatTokens.push(token);
      await persist();
      await doVerify();
      return { index, name: payload.n, generation: g, token };
    },

    /** Receiving iPad: QR text asking the owner for a seat bound to this device. */
    async createSeatRequest(name = '') { await init(); return `SBDR1.${device.pub}.${encodeURIComponent(String(name).slice(0, 24))}`; },

    /** Owner: sign a seat grant for another iPad (optionally bound via its request). Returns QR text. */
    async grantSeat({ index, name, request } = {}) {
      await init();
      let dev = null;
      if (request) {
        const [tagStr, pub, nm] = String(request).split('.');
        if (tagStr !== 'SBDR1' || !pub) throw new Error('Not a seat request code');
        dev = pub; name ??= decodeURIComponent(nm || '');
      }
      // Bound grants leave only a ledger entry on the owner; bearer grants (no request) also
      // stay listed on the owner so the family seat count stays honest.
      const seat = await api.provisionSeat(name, { forDevice: dev, index });
      return `SBDG1.${passToken}~${seat.token}`;
    },

    /** Receiving iPad: accept a seat grant QR. */
    async acceptSeatGrant(text) {
      await init();
      const m = /^SBDG1\.(.+)~(.+)$/.exec(String(text).trim());
      if (!m) throw new Error('Not a seat grant code');
      const p = await verifyPass(m[1]);
      if (!p) throw new Error('Family pass signature invalid');
      if (pass && pass.id !== p.id) throw new Error('This iPad already belongs to a different family pass');
      const s = await verifySeat(m[2], p);
      if (!s) throw new Error('Seat signature invalid');
      if (s.dev && s.dev !== device.pub) throw new Error('This seat was granted to a different iPad');
      passToken = m[1];
      seatTokens = seatTokens.filter((t) => { try { return readToken(t).payload.i !== s.i; } catch { return false; } });
      seatTokens.push(m[2]);
      await persist();
      return doVerify();
    },

    /** Import a family pass (receipt) minted by the issuer. This iPad must be its owner. */
    async importPass(token) {
      await init();
      const p = await verifyPass(String(token).trim());
      if (!p) throw new Error('Family pass signature invalid');
      if (p.owner !== device.pub) throw new Error('This pass was issued to a different iPad — ask the owner for a seat instead');
      passToken = String(token).trim(); ledger = {}; seatTokens = [];
      await persist();
      return doVerify();
    },

    /** Lobby helper: given seat tokens presented by peers, flag duplicates / stale generations. */
    async compareSeats(tokens) {
      await init();
      const best = new Map(); const out = [];
      for (const t of tokens) { const s = await verifySeat(t).catch(() => null); out.push(s); if (s && (!best.has(s.i) || s.g > best.get(s.i))) best.set(s.i, s.g); }
      return out.map((s) => (s ? { index: s.i, valid: best.get(s.i) === s.g } : { valid: false }));
    },
    mySeatToken() { return seatTokens.find((t) => { const p = readToken(t).payload; return !p.dev || p.dev === device?.pub; }) ?? null; },

    /** DEV-ONLY: mint a family pass for THIS iPad with the throw-away dev issuer key. */
    async devIssuePass({ seats = MAX_SEATS } = {}) {
      await init();
      if (!trustDevIssuer) throw new Error('Dev passes are disabled in production builds');
      const { DEV_ONLY_issuerKey } = await loadDevIssuer();
      const payload = { k: 'pass', v: 1, id: randomId(), sku: 'family', seats: Math.min(seats, MAX_SEATS), owner: device.pub, iat: Math.floor(Date.now() / 1000), dev: true };
      const token = await signToken(payload, await DEV_ONLY_issuerKey());
      return api.importPass(token);
    },
  };
  return api;
}

export const licensing = createLicensing();
export { createLicensing };
