# Offline play, local multiplayer and licensing (Agent 2 / `src/net`)

## 1. Install once, then play with no internet

1. Open the game once from its **HTTPS** URL in Safari (for example GitHub Pages).
2. `registerServiceWorker()` installs `sw.js`. The SW precaches **every** file in `dist/`, using the list from
   `dist/precache-manifest.json`. `vite.sw-manifest.js` generates that list at build time with a sha-256 hash
   per file, and also inlines it into `dist/sw.js`. Any asset change therefore makes `sw.js` byte-different,
   which is what makes iOS pick up an update.
3. Share ▸ **Add to Home Screen**. The manifest sets `display: standalone` and `orientation: landscape`.
   `injectPWAHead()` adds the iOS meta tags at runtime if `index.html` lacks them.

Caching rules in `public/sw.js`:

| Request | Strategy |
|---|---|
| Navigation (any URL in scope, any query string) | Cached `index.html` first, then the network. On a hotspot with no internet, network requests can hang, so the app shell never waits on them. |
| Same-origin GET assets | Cache-first (Vite file names are hashed), then the network with runtime caching. |
| Activate | Deletes every `sbd-*` cache that does not belong to the current manifest version, then `clients.claim()`. |
| Updates | A first install activates at once. Later versions wait until the page calls `applyUpdate(reg)` after the `sbd:sw-update` event, so the game never swaps mid-race. |

`offlineReady` / `onOfflineReady(cb)` / `getOfflineStatus()` / the window event `sbd:offline-ready` report ready only when the controlling SW is `activated` **and** the SW itself counts every manifest file in its versioned cache (`GET_STATUS` message). `tests/net-offline.mjs` checks this.

Verified with Playwright against a production build: the SW takes control, the context goes offline, and both
the reload and a `?autostart=1&truck=3` navigation still boot from cache.

## 2. Why the Home-Screen launch is still a *secure context*

`DeviceOrientationEvent.requestPermission()` (tilt steering) and `navigator.mediaDevices.getUserMedia()`
(QR scanning) are only exposed when `window.isSecureContext === true`.

- A Home-Screen web app is bound to the **origin it was installed from**, which is `https://…`. When it launches
  offline, the document is still requested at that `https://` URL. The service worker answers it from Cache
  Storage, but the document's URL and origin do not change, so the page remains a secure context with no network.
- The secure-context rule depends on the document's URL scheme, not on whether the bytes came from the network.
  A response served by a service worker inherits the scope's `https:` origin.
- What would **break** it: serving the game from a LAN IP over plain `http://172.20.10.1:…`, which is not
  secure (only `localhost` is exempt), or opening a `file://` copy. iPads cannot run a web server anyway. That
  is a big reason the multiplayer design needs **no server at all**: signaling travels as QR codes and the
  page always stays on its original HTTPS origin.
- Permission prompts still need a user gesture. Call `requestPermission()` and `getUserMedia()` from a tap
  handler. iOS standalone apps may ask again on each cold launch.
- Make sure the HTTPS host sends no `Cross-Origin-*`/CSP headers that block `blob:`/`data:` for
  canvas/QR, or the camera on Safari.

## 3. Local radio bridge (Personal Hotspot)

The host iPad turns on **Settings ▸ Personal Hotspot ▸ Allow Others to Join**, and iPads #2–#6 join that
Wi-Fi network. The full player-facing copy is in `src/net/lobbyCopy.js` (`LOBBY_COPY.radio`). Notes:

- Wi-Fi-only iPads have no Personal Hotspot. Any shared Wi-Fi network works too, as does a phone hotspot. The
  copy says this.
- We use a **star topology**: every client talks only to the host. On Personal Hotspot the host *is* the access
  point, so this works even where client-to-client traffic is isolated.
- WebRTC uses `iceServers: []`. Only *host* candidates are gathered: hotspot IPv4 `172.20.10.x`, mDNS
  `uuid.local` names (Safari and Chrome hide raw IPs until camera permission is granted), and IPv6. All of
  them stay on the local link, so no internet, STUN or TURN is involved.

## 4. Serverless QR signaling

Host: confirms that the hotspot is on, sees a high-contrast **Offer QR**, and taps *Scan Player N's reply*. The camera opens only on that tap and never before. Each offer is single-use, because ICE latches onto the first iPad that tries it. So every offer carries its own 16-bit tag, and the *New code* button mints a fresh one. A client whose reply is never scanned gets *Try again* after 40 s. Client: scans the offer (`createScanner`: getUserMedia + jsQR on an offscreen canvas,
rAF loop, decoding every second frame) → `clientAcceptOffer` → **Answer QR**. The host scans that, the peer
locks in, and the next slot's offer appears. Every screen also has a copy/paste text-code fallback.

Compact SDP (`sdpPack.js`): ICE ufrag+pwd at 6 bits/char, a 32-byte raw DTLS sha-256 fingerprint, the setup
role, the slot, a 16-bit session tag, and up to 3 UDP host candidates (IPv4 = 4 B, mDNS UUID = 16 B with a
case flag, IPv6 = 16 B, port = 2 B). The receiver rebuilds a valid data-channel SDP from that. Measured sizes:

| Candidates | Binary | base64url | QR size |
|---|---|---|---|
| 1 mDNS (Chrome default) | 78 B | **104 chars** | 37×37 modules at EC-L |
| 1 IPv4 | 66 B | 88 chars | |
| IPv4 + IPv6 + mDNS | 104 B | 139 chars | |

Anything non-standard (a fingerprint that is not sha-256, `mid ≠ 0`, …) falls back to `"!" + lz-string(minimised SDP)`.

## 5. Sync protocol

Two pre-negotiated DataChannels per peer: `fast` (id 0, `ordered:false, maxRetransmits:0`) and `ctrl` (id 1, reliable).

- **Input** (client → host, 60 Hz): `Float32Array [seq, steer, paddleL, paddleR, handbrake, flags]` with
  `flags` = `1` headlight | `2` reverse. Each packet carries the last 3 frames (76 B), so a dropped packet
  never loses a paddle stroke. The host delivers each seq once, in order.
- **Snapshot** (host → clients), **wire v2 at 30 Hz**. The host still calls `broadcastSnapshot` every 60 Hz tick; sync sends every second tick and ORs the event bits.
  - **Header** (25 B): version byte, keyframe flag, tick, delta base age, and a per-snapshot origin plus scale.
  - **Per car** (22 B): u24×3 position (0.2 mm precision at a 3 km spread), smallest-three 10-bit quaternion (≤ 0.21° error), i16 velocity (2 cm/s), u16 `s` in decimetres, plus an optional events byte and an optional ack byte (the last input seq the host applied, & 255).
  - **Keyframes** every 10 snapshots. In between, a car that has not moved since the keyframe costs 1 B.
  - **Measured:** 6 cars ≈ 157–162 B, which is ~4.7 KiB/s per client and ~23 KiB/s for 5 clients (v1 was 202 B at 60 Hz = 12 KiB/s per client).
- **Prediction**: `createPredictor({ body, slot })` runs the local car on the client with its own inputs. On each snapshot it rewinds to the acked authoritative state, replays the inputs that haven't been acked yet, and fades out the visual correction (half-life 120 ms).
- **Clock**: a ping/pong on `fast`. The sample with the lowest RTT out of the last 8 is kept.
  `sync.clock.toLocal(hostMs)` is used for the synchronized countdown (`sync.startCountdown()`).
- **Interpolation**: `createInterpolator({ delayMs: 100 })`. It renders about 100 ms behind using cubic
  Hermite on position (velocities as tangents) and nlerp on the quaternion. Host-tick→local-time mapping
  calibrates itself with a min-filter. Event bits are OR-accumulated so one-shot events are never missed.

## 6. Offline Family Sharing licence

Chain of trust: **issuer key** → signed **Family Pass** (ECDSA P-256, bound to the buyer iPad's device key)
→ up to **6 seat tokens**, signed by the owner iPad's device key. Device keys are non-extractable WebCrypto
keys kept in IndexedDB. Pass and seat tokens are mirrored to `localStorage`. To move a seat:

1. The receiving iPad shows `createSeatRequest()` (`SBDR1.<device pub>`).
2. The owner scans it, and `grantSeat({ request })` creates a seat grant QR (`SBDG1.<pass>~<seat>`).
3. The receiver runs `acceptSeatGrant()` on it.

Re-granting a seat index bumps its generation. `compareSeats()` lets the lobby host reject stale copies.

- **DEV-ONLY**: `src/net/devIssuer.js` holds a throw-away issuer private key. `licensing.devIssuePass()`
  works only in `vite dev`: a literal `import.meta.env.DEV` guard removes the module from production
  bundles (verified). Production passes are minted with `node src/net/tools/issue-pass.mjs --key …`, and the
  public JWK goes into `PROD_ISSUER_PUBLIC_KEYS` in `licensing.js`.
- Without a server we **cannot revoke** a seat copy on an iPad we never meet again. Generation checks only
  apply when devices race together.
