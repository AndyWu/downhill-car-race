# Soap Box Derby — Shared Architecture Contract

Vanilla ES modules + Three.js (r186) bundled by Vite. **No external physics engine** — a
custom deterministic raycast-suspension vehicle model (fixed 60 Hz step) so the host can be
authoritative and the whole thing works offline without WASM caching edge cases.

Coordinate system: Y up, metres, seconds. The track starts near the origin and descends
roughly along **-Z**. `s` = arc-length distance along the road centreline (0 … 3218 m).

## Ownership (one agent per directory — do not edit other agents' files)

| Dir | Owner | Purpose |
|---|---|---|
| `src/scene/` | Agent 1 Scene | track spline, terrain, hazards, scenery |
| `src/net/`, `public/sw.js`, `public/manifest.webmanifest`, `public/icons/` | Agent 2 Network | PWA, QR-WebRTC, sync, licensing |
| `src/core/`, `src/main.js`, `index.html` | Agent 3 Core | loop, physics, input, flag cloth, camera |
| `src/audio/`, `src/ui/` | Agent 4 Audio/UI | WebAudio, lobby/garage/orientation UI |
| `src/vehicles/` | Agent 5 Trucks | 10 truck models + stats |
| `src/graphics/` | Agent 6 Graphics | materials, lighting, post-fx, headlight beam |
| `src/ai/` | Agent 7 AI | 5 AI drivers |
| `critique/` | Agent 8 Critic | reports + screenshots |
| `tests/` | Critic / Orchestrator | Playwright harness |

Cross-cutting needs → write a note in `docs/requests.md` instead of editing someone else's file.

## Module contracts (exports MUST match exactly)

### `src/scene/index.js` (Agent 1)
```js
export const TRACK_LENGTH = 3218;
export async function createWorld(scene, { seed = 1, renderer, materials } = {}) → World
World = {
  track: {
    length,
    sampleAt(s) → { position: Vector3, tangent: Vector3, right: Vector3, up: Vector3, width: number, camber: number /*rad*/ },
    project(pos: Vector3) → { s, lateral /*m, +right*/ },   // nearest centreline point
  },
  heightAt(x, z) → number,              // ground height incl. road + terrain
  normalAt(x, z) → Vector3,
  surfaceAt(x, z) → { type: 'dirt'|'mud'|'water'|'rock'|'sand'|'gravel'|'grass', friction /*0..1.2*/, drag /*extra N·s/m factor*/, bump /*0..1*/ },
  hazards: Array<{ type, s, lateral, radius }>,   // for AI avoidance
  startTransform(slot /*0..5*/) → { position: Vector3, quaternion: Quaternion },
  update(dt, camera),                    // wind sway, LOD, streaming
}
```
Must be deterministic from `seed` (host and clients build identical worlds).

### `src/vehicles/index.js` (Agent 5)
```js
export const TRUCKS = [ /* 10 */ { id, name, description, mass /*kg incl. driver*/, dragCoef, frontalArea, rollingResist, gripMul, steerLock /*rad*/, steerRate, paddleEfficiency, brakeForce, suspension: {stiffness, damping, travel}, wheelRadius, wheelBase, trackWidth } ];
export function buildTruck(spec, { materials } = {}) → {
  group: THREE.Group,               // origin = chassis centre at axle height, +Z is FORWARD? NO → forward is -Z (Three.js convention)
  parts: {
    steeringWheel: Object3D,        // rotate about its local Z axis
    paddleL: Object3D, paddleR: Object3D,  // rotate about local X (pushed forward)
    handbrakeLever: Object3D, gearLever: Object3D,  // rotate about local X
    headlight: Object3D,            // place lamp mesh; graphics adds the SpotLight here
    flagMount: Object3D,            // flag cloth attaches here
    wheels: [FL, FR, RL, RR] Object3D,
    driverEye: Object3D,            // first-person camera anchor
  }
}
```

### `src/core/` (Agent 3)
- `src/main.js` boots everything, owns the game loop, mode switching (title → garage → lobby → race).
- `src/core/physics.js`: `createVehicleBody(spec, world)` → `{ state:{position,quaternion,velocity,angularVelocity,speed,s,lateral,wheelContacts}, step(dt, input), serialize(Float32Array, offset), deserialize(...) }`
- `src/core/input.js`: `createInput(domElement)` → `{ read() → Input, requestPermissions() }`
- `Input = { steer /*-1..1*/, paddleL /*0..1 impulse this frame*/, paddleR, handbrake /*0..1*/, headlight: bool, reverse: bool }`
- `src/core/flag.js`: `createFlag({ material? })` → `{ mesh, update(dt, speedMps, windVec) }`

### `src/audio/index.js` (Agent 4)
`createAudio()` → `{ unlock() /*call in user gesture*/, update(dt, { speed, surface, wheelContacts, paddleL, paddleR, handbrake, bumps, listener:Object3D }), oneShot(name) }`

### `src/ui/index.js` (Agent 4)
`createUI(root, { trucks, onStartSolo, onHost, onJoin, onSelectTruck })` → `{ show(screen), hide(), setOrientationBlocked(bool) }`. Cockpit has **zero HUD**: no numbers on screen during race. Touch zones are invisible except subtle thumb glyphs that fade after 3 s.

### `src/graphics/index.js` (Agent 6)
```js
export function createRenderer(canvas) → THREE.WebGLRenderer
export function createMaterials(renderer) → { dirtRoad, mud, water, rock, sand, grass, woodWeathered, barnPaint, metalRusted, rope, foliage, ... }  // shared library, used by scene + trucks
export function setupLighting(scene, renderer) → { sun, update(dt, camera) }
export function attachHeadlight(headlightObj) → { setOn(bool) }
export function createPostFX(renderer, scene, camera) → { render(dt, { speed, splatter }), setSize(w,h), addSplatter(type /*'mud'|'water'*/, amount) }
```

### `src/net/index.js` (Agent 2)
```js
export function registerServiceWorker()
export function createLobby({ role: 'host'|'client', ui }) → { start(), onPeer(cb), onReady(cb), close() }
export function createSync({ role, peers, worldSnapshotSize }) → { sendInput(Float32Array), onInput(cb(peerId, Float32Array)), broadcastSnapshot(Float32Array), onSnapshot(cb) }
export const licensing = { async init(), async provisionSeat(name), seats(), async verify() }
```

### `src/ai/index.js` (Agent 7)
```js
export const AI_PROFILES = [ Barnaby, Clementine, Buster, Maeve, Ace ];
export function createAIDriver(profile, { world, rng }) → { think(dt, selfState, others[]) → Input }
```
AI outputs the exact same `Input` struct as a human so the physics is shared.

## Test hooks
`main.js` exposes `window.__game = { state, world, vehicles, input, setDebugInput(Input), teleport(s), screenshotReady:Promise }` and honours URL params `?autostart=1&truck=0&s=1200&time=dusk&headlight=1&ai=5` for headless capture.
