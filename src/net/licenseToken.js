// Signed-token primitives (WebCrypto ECDSA P-256 / SHA-256). Works in browsers and Node ≥ 20.
// Token = base64url(JSON payload) + "." + base64url(raw 64-byte r||s signature)

import { bytesToB64url, b64urlToBytes } from './sdpPack.js';

export const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
export const SIG = { name: 'ECDSA', hash: 'SHA-256' };
const enc = new TextEncoder(), dec = new TextDecoder();

export async function signToken(payload, privateKey) {
  const body = bytesToB64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign(SIG, privateKey, enc.encode(body)));
  return body + '.' + bytesToB64url(sig);
}

export function readToken(token) {
  const [body, sig] = String(token).split('.');
  if (!body || !sig) throw new Error('Malformed token');
  return { body, sig, payload: JSON.parse(dec.decode(b64urlToBytes(body))) };
}

export async function verifyToken(token, publicKey) {
  const { body, sig, payload } = readToken(token);
  const ok = await crypto.subtle.verify(SIG, publicKey, b64urlToBytes(sig), enc.encode(body));
  return ok ? payload : null;
}

export async function exportPublicRaw(publicKey) {
  return bytesToB64url(new Uint8Array(await crypto.subtle.exportKey('raw', publicKey)));
}
export async function importPublicRaw(b64) {
  return crypto.subtle.importKey('raw', b64urlToBytes(b64), ALG, true, ['verify']);
}
export async function importPublicJwk(jwk) {
  return crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, ALG, true, ['verify']);
}
export function randomId(n = 9) { return bytesToB64url(crypto.getRandomValues(new Uint8Array(n))); }
