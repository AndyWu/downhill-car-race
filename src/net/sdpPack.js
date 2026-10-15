// Compact binary SDP packing for serverless QR signaling.
//
// A data-channel-only SDP from Chrome / Safari / Firefox is ~500-900 bytes, far too much for
// a quickly-scannable QR code. Almost all of it is boilerplate that the other side can
// regenerate. We keep only what is unique per peer connection:
//
//   byte 0      : version(2b)=1 | kind(1b: 0 offer, 1 answer) | setup(2b) | slot(3b)
//   bytes 1-2   : session tag (u16 LE) — rejects QR codes from a previous race session
//   byte 3      : ice-ufrag length (chars)
//   byte 4      : ice-pwd length (chars)
//   N bytes     : ufrag+pwd packed at 6 bits/char (ICE chars are exactly the base64 alphabet)
//   32 bytes    : DTLS sha-256 fingerprint, raw
//   byte        : candidate count
//   per cand    : type byte (bits0-1 kind: 0 IPv4, 1 mDNS-UUID, 2 IPv6, 3 raw string;
//                  bit2: UUID was upper-case), address payload, port (u16 LE)
//
// The result is base64url (no padding). A typical Chrome offer with one mDNS candidate packs to
// ~78 bytes (≈104 chars). Anything we cannot represent (non sha-256 fingerprint, mid ≠ "0",
// unusual sctp-port …) falls back to lz-string of a minimised SDP, prefixed with "!".

import LZString from 'lz-string';

export const PACK_VERSION = 1;
const ICE_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const SETUPS = ['actpass', 'active', 'passive'];
const MAX_CANDIDATES = 3;
const UUID_RE = /^([0-9a-fA-F]{8})-([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-([0-9a-fA-F]{12})\.local$/;

// ---------- base64url ----------
export function bytesToB64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlToBytes(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- SDP parsing ----------
export function parseSdp(sdp) {
  const lines = sdp.split(/\r?\n/).filter(Boolean);
  const r = { mLines: 0, candidates: [], ufrag: null, pwd: null, fpAlgo: null, fp: null, setup: null, mid: null, sctpPort: null, maxMsg: null, mLine: null };
  for (const l of lines) {
    if (l.startsWith('m=')) { r.mLines++; r.mLine = l; continue; }
    if (!l.startsWith('a=')) continue;
    const idx = l.indexOf(':');
    const key = idx < 0 ? l.slice(2) : l.slice(2, idx);
    const val = idx < 0 ? '' : l.slice(idx + 1);
    switch (key) {
      case 'ice-ufrag': r.ufrag ??= val.trim(); break;
      case 'ice-pwd': r.pwd ??= val.trim(); break;
      case 'fingerprint': if (!r.fp) { const [a, f] = val.trim().split(/\s+/); r.fpAlgo = a.toLowerCase(); r.fp = f; } break;
      case 'setup': r.setup ??= val.trim(); break;
      case 'mid': r.mid ??= val.trim(); break;
      case 'sctp-port': r.sctpPort ??= val.trim(); break;
      case 'max-message-size': r.maxMsg ??= val.trim(); break;
      case 'candidate': {
        const p = val.trim().split(/\s+/);
        // foundation component transport priority address port typ type ...
        if (p.length < 8) break;
        r.candidates.push({ component: +p[1], transport: p[2].toLowerCase(), priority: +p[3], address: p[4], port: +p[5], type: p[7], raw: val });
        break;
      }
    }
  }
  return r;
}

function addrKind(addr) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(addr)) return 0;
  const m = UUID_RE.exec(addr);
  if (m) return 1;
  if (addr.includes(':')) return 2;
  return 3;
}

function selectCandidates(cands) {
  const seen = new Set();
  const usable = [];
  for (const c of cands) {
    if (c.component !== 1 || c.transport !== 'udp' || c.type !== 'host') continue;
    const k = c.address + ':' + c.port;
    if (seen.has(k)) continue;
    seen.add(k);
    usable.push(c);
  }
  // Prefer IPv4 (hotspot 172.20.10.x), then mDNS, then IPv6, then anything else.
  const rank = (c) => [0, 1, 2, 3][addrKind(c.address)];
  usable.sort((a, b) => rank(a) - rank(b) || b.priority - a.priority);
  return usable.slice(0, MAX_CANDIDATES);
}

function canBinaryPack(p) {
  if (p.mLines !== 1 || !p.mLine || !/^m=application \d+ UDP\/DTLS\/SCTP webrtc-datachannel/.test(p.mLine)) return 'm-line';
  if (p.fpAlgo !== 'sha-256' || !p.fp || p.fp.split(':').length !== 32) return 'fingerprint';
  if (!p.ufrag || !p.pwd) return 'ice-credentials';
  const okChars = (s) => s.length < 256 && [...s].every((ch) => ICE_ALPHA.includes(ch));
  if (!okChars(p.ufrag) || !okChars(p.pwd)) return 'ice-chars';
  if (!SETUPS.includes(p.setup)) return 'setup';
  if ((p.mid ?? '0') !== '0') return 'mid';
  if ((p.sctpPort ?? '5000') !== '5000') return 'sctp-port';
  return null;
}

// ---------- 6-bit packing ----------
function pack6(str, out, offset) {
  let acc = 0, bits = 0, o = offset;
  for (const ch of str) {
    acc = (acc << 6) | ICE_ALPHA.indexOf(ch);
    bits += 6;
    while (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 0xff; }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out[o++] = (acc << (8 - bits)) & 0xff;
  return o;
}
function unpack6(bytes, offset, nChars) {
  let acc = 0, bits = 0, o = offset, s = '';
  while (s.length < nChars) {
    if (bits < 6) { acc = (acc << 8) | bytes[o++]; bits += 8; }
    bits -= 6;
    s += ICE_ALPHA[(acc >> bits) & 63];
    acc &= (1 << bits) - 1;
  }
  return { str: s, offset: o };
}

// ---------- pack / unpack ----------
/**
 * @param {string} sdp local description SDP (after ICE gathering complete)
 * @param {{kind:'offer'|'answer', slot:number, tag:number}} meta
 * @returns {string} compact base64url code (or "!"+lz-string fallback)
 */
export function packSdp(sdp, { kind, slot = 0, tag = 0 }) {
  const p = parseSdp(sdp);
  const why = canBinaryPack(p);
  if (why) return packFallback(sdp, { kind, slot, tag });
  const cands = selectCandidates(p.candidates);
  const buf = new Uint8Array(512);
  let o = 0;
  buf[o++] = (PACK_VERSION << 6) | ((kind === 'answer' ? 1 : 0) << 5) | (SETUPS.indexOf(p.setup) << 3) | (slot & 7);
  buf[o++] = tag & 0xff; buf[o++] = (tag >> 8) & 0xff;
  buf[o++] = p.ufrag.length; buf[o++] = p.pwd.length;
  o = pack6(p.ufrag + p.pwd, buf, o);
  for (const hx of p.fp.split(':')) buf[o++] = parseInt(hx, 16);
  buf[o++] = cands.length;
  for (const c of cands) {
    const k = addrKind(c.address);
    if (k === 0) {
      buf[o++] = 0;
      for (const n of c.address.split('.')) buf[o++] = +n;
    } else if (k === 1) {
      const hex = c.address.slice(0, 36).replace(/-/g, '');
      const upper = hex !== hex.toLowerCase();
      if (upper && hex !== hex.toUpperCase()) { // mixed case: keep verbatim
        o = writeRaw(buf, o, c.address);
      } else {
        buf[o++] = 1 | (upper ? 4 : 0);
        for (let i = 0; i < 32; i += 2) buf[o++] = parseInt(hex.slice(i, i + 2), 16);
      }
    } else if (k === 2) {
      const words = expandIPv6(c.address);
      if (!words) { o = writeRaw(buf, o, c.address); }
      else { buf[o++] = 2; for (const w of words) { buf[o++] = w >> 8; buf[o++] = w & 0xff; } }
    } else {
      o = writeRaw(buf, o, c.address);
    }
    buf[o++] = c.port & 0xff; buf[o++] = (c.port >> 8) & 0xff;
  }
  return bytesToB64url(buf.subarray(0, o));
}

function writeRaw(buf, o, s) {
  const b = new TextEncoder().encode(s);
  buf[o++] = 3; buf[o++] = b.length;
  buf.set(b, o);
  return o + b.length;
}

function expandIPv6(a) {
  const addr = a.split('%')[0];
  if (addr.includes('.')) return null; // v4-mapped: rare, keep raw
  const [head, tail] = addr.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : null;
  const words = t === null ? h : [...h, ...Array(8 - h.length - t.length).fill('0'), ...t];
  if (words.length !== 8) return null;
  return words.map((w) => parseInt(w || '0', 16));
}
function compressIPv6(words) {
  const hex = words.map((w) => w.toString(16));
  // find longest zero run
  let best = -1, bestLen = 0;
  for (let i = 0; i < 8;) {
    if (words[i] !== 0) { i++; continue; }
    let j = i; while (j < 8 && words[j] === 0) j++;
    if (j - i > bestLen && j - i > 1) { best = i; bestLen = j - i; }
    i = j;
  }
  if (best < 0) return hex.join(':');
  return hex.slice(0, best).join(':') + '::' + hex.slice(best + bestLen).join(':');
}

function packFallback(sdp, { kind, slot, tag }) {
  // Strip lines the remote side never needs.
  const keep = sdp.split(/\r?\n/).filter((l) => l && !/^a=(extmap-allow-mixed|ice-options|msid-semantic)/.test(l)
    && !(l.startsWith('a=candidate:') && / tcp /i.test(l)));
  const json = JSON.stringify({ k: kind === 'answer' ? 1 : 0, s: slot, t: tag, d: keep.join('\n') });
  return '!' + LZString.compressToEncodedURIComponent(json);
}

function hostPriority(i) { return ((126 << 24) >>> 0) + ((65535 - i) << 8) + 255; }

/**
 * @param {string} code
 * @returns {{kind:'offer'|'answer', slot:number, tag:number, sdp:string, packed:'binary'|'lz', bytes:number}}
 */
export function unpackSdp(code) {
  code = code.trim();
  if (code.startsWith('!')) {
    const json = LZString.decompressFromEncodedURIComponent(code.slice(1));
    if (!json) throw new Error('Bad signaling code');
    const j = JSON.parse(json);
    return { kind: j.k ? 'answer' : 'offer', slot: j.s, tag: j.t, sdp: j.d.split('\n').join('\r\n') + '\r\n', packed: 'lz', bytes: code.length };
  }
  const b = b64urlToBytes(code);
  let o = 0;
  const h = b[o++];
  if (h >> 6 !== PACK_VERSION) throw new Error('Unsupported signaling version');
  const kind = (h >> 5) & 1 ? 'answer' : 'offer';
  const setup = SETUPS[(h >> 3) & 3];
  if (!setup) throw new Error('Bad setup role');
  const slot = h & 7;
  const tag = b[o] | (b[o + 1] << 8); o += 2;
  const ul = b[o++], pl = b[o++];
  const cred = unpack6(b, o, ul + pl); o = cred.offset;
  const ufrag = cred.str.slice(0, ul), pwd = cred.str.slice(ul);
  const fp = [];
  for (let i = 0; i < 32; i++) fp.push(b[o++].toString(16).toUpperCase().padStart(2, '0'));
  if (o > b.length) throw new Error('Truncated signaling code');
  const n = b[o++];
  const cands = [];
  for (let i = 0; i < n; i++) {
    const t = b[o++];
    let addr;
    switch (t & 3) {
      case 0: addr = `${b[o]}.${b[o + 1]}.${b[o + 2]}.${b[o + 3]}`; o += 4; break;
      case 1: {
        let hex = '';
        for (let k = 0; k < 16; k++) hex += b[o++].toString(16).padStart(2, '0');
        if (t & 4) hex = hex.toUpperCase();
        addr = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}.local`;
        break;
      }
      case 2: { const w = []; for (let k = 0; k < 8; k++) { w.push((b[o] << 8) | b[o + 1]); o += 2; } addr = compressIPv6(w); break; }
      case 3: { const len = b[o++]; addr = new TextDecoder().decode(b.subarray(o, o + len)); o += len; break; }
    }
    const port = b[o] | (b[o + 1] << 8); o += 2;
    cands.push({ addr, port });
  }
  if (o > b.length) throw new Error('Truncated signaling code');
  const sessId = 1000000000 + tag * 10 + slot + (kind === 'answer' ? 5 : 0);
  const L = [
    'v=0',
    `o=- ${sessId} 2 IN IP4 127.0.0.1`,
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    ...cands.map((c, i) => `a=candidate:${i + 1} 1 udp ${hostPriority(i)} ${c.addr} ${c.port} typ host generation 0`),
    'a=end-of-candidates',
    `a=ice-ufrag:${ufrag}`,
    `a=ice-pwd:${pwd}`,
    'a=ice-options:trickle',
    `a=fingerprint:sha-256 ${fp.join(':')}`,
    `a=setup:${setup}`,
    'a=mid:0',
    'a=sctp-port:5000',
    'a=max-message-size:262144',
  ];
  return { kind, slot, tag, sdp: L.join('\r\n') + '\r\n', packed: 'binary', bytes: b.length, candidates: cands };
}
