// Publisher-side tool: mint a Family Pass entitlement for one iPad (offline "receipt").
//
//   node src/net/tools/issue-pass.mjs --owner <iPad device public key> --key issuer-private.jwk.json [--seats 6]
//   node src/net/tools/issue-pass.mjs --owner <…> --dev        # DEV-ONLY throw-away key
//   node src/net/tools/issue-pass.mjs --genkey issuer-private.jwk.json   # new issuer keypair; prints the public JWK
//
// The iPad shows its device key via licensing.devicePublicKey; the resulting token is pasted /
// scanned into licensing.importPass(token).
import { readFileSync, writeFileSync } from 'node:fs';
import { signToken, randomId, ALG } from '../licenseToken.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : a), []));

if (args.genkey) {
  const kp = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
  writeFileSync(args.genkey, JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey)), { mode: 0o600 });
  const { kty, crv, x, y } = await crypto.subtle.exportKey('jwk', kp.publicKey);
  console.log('Private key written to', args.genkey, '(keep it OUT of the repo)\nPublic JWK for PROD_ISSUER_PUBLIC_KEYS:\n', JSON.stringify({ kty, crv, x, y }));
  process.exit(0);
}
if (!args.owner) { console.error('missing --owner <device public key>'); process.exit(1); }
let key;
if (args.dev) key = await (await import('../devIssuer.js')).DEV_ONLY_issuerKey();
else if (args.key) key = await crypto.subtle.importKey('jwk', JSON.parse(readFileSync(args.key, 'utf8')), ALG, false, ['sign']);
else { console.error('need --key <jwk file> or --dev'); process.exit(1); }
const payload = { k: 'pass', v: 1, id: randomId(), sku: 'family', seats: Math.min(+args.seats || 6, 6), owner: args.owner, iat: Math.floor(Date.now() / 1000), ...(args.dev ? { dev: true } : {}) };
console.log(await signToken(payload, key));
