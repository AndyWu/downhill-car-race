// ============================================================================================
//  DEV-ONLY ISSUER KEY — DO NOT SHIP IN A STORE / PRODUCTION BUILD.
//
//  There is no server, so in development we mint "purchase receipts" (family-pass
//  entitlements) locally with this throw-away ECDSA P-256 key. licensing.js only imports this
//  module behind `import.meta.env.DEV || VITE_DEV_PASSES === '1'`, so production bundles
//  dead-code-eliminate it. Real passes are minted offline by the publisher with
//  src/net/tools/issue-pass.mjs using a private key that never enters the repo, and the
//  matching public key goes into ISSUER_PUBLIC_KEYS in licensing.js.
// ============================================================================================

export const DEV_ONLY_ISSUER_PRIVATE_JWK = {
  kty: 'EC', crv: 'P-256',
  x: '7zdEhLcyyOhHoSERkjhB5eK7AeRuFq51tHgmBa1NDvI',
  y: 'g0H-k3wD6zAHdc7FW3WRWpzKY-a1_hG0kcZq1AYUlTM',
  d: 'kH2uPBDh3DA_YLohOC2gCcdNTCD8gQOIf50g2h_JJyM',
};

export async function DEV_ONLY_issuerKey() {
  return crypto.subtle.importKey('jwk', DEV_ONLY_ISSUER_PRIVATE_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}
