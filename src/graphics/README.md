# src/graphics — Agent 6 (materials, lighting, post-FX, headlight)

Public API (`src/graphics/index.js`, matches ARCHITECTURE.md):

```js
createRenderer(canvas, { maxPixelRatio=2, dynamicResolution=true, targetMs=18.5 }) -> WebGLRenderer
createMaterials(renderer, { quality:'default'|'low'|'high' }) -> MaterialLibrary   // sync, ~1.2 s CPU, cached
setupLighting(scene, renderer, { shadowMapSize=2048, shadowExtent=42 }) -> Lighting
attachHeadlight(obj, { intensity, angle, beamLength, castShadow, autoTick }) -> Headlight
createPostFX(renderer, scene, camera, { msaa=4, bloom, vignette, grain }) -> PostFX
```

The scene MUST be rendered through `postFX.render()` (scene -> HDR target -> combined pass). Tone mapping,
sRGB, grading, bloom are all done in that pass; the renderer's own toneMapping only matters for a fallback
`renderer.render()`.

Frame loop:

```js
const renderer = createRenderer(canvas);
const mats = createMaterials(renderer);
const lighting = setupLighting(scene, renderer);   // sky dome, sun, hemi, fog, PMREM env, scene.fog
const post = createPostFX(renderer, scene, camera);
post.setSize(innerWidth, innerHeight);             // also calls renderer.setSize + camera aspect
lighting.setTime('golden');                        // 'day' | 'golden' | 'dusk' | 'night'  (smooth ~2 s; setTime(n,true) = instant)
function frame(dt) { lighting.update(dt, camera); post.render(dt, { speed: speedMps }); }
```

## Material library keys (all `MeshStandardMaterial` unless noted)

Every textured material = albedo (sRGB) + tangent normal + ORM (R=AO, G=roughness, B=metal; used as
roughnessMap/aoMap/metalnessMap). All generated procedurally at startup (no assets). Textures tile.

| key | notes (UV expectations) |
|---|---|
| `dirtRoad` | tyre ruts run along V (centres at U=.25/.75), pebbles. 1 tile ≈ 3-5 m. |
| `mud` | dark, glossy wet patches (low roughness) mixed with rough lumps. 1 tile ≈ 2.5 m. |
| `water` | murky glossy, env-reflective (fresnel), 2 scrolling ripple layers + rain rings, transparent, decal polygon offset. **UV in metres** (1 UV unit = 1 ripple tile). |
| `waterPuddle` | same + `vertexColors` (alpha fades puddle rim into the mud). Use with `mats.makePuddleGeometry(rx, rz, seed)`. |
| `rock` | fractured plates + lichen. `sand` wind-ripples. `grass` muted ground grass (desaturated). |
| `woodWeathered` | dusty grey/brown boards, cracks, knots, grime. Tile = 1x1 m, 4 boards, grain along U. |
| `barnPaint` | peeling red paint over grey wood. Tile = 2x2 m, 8 vertical planks, grain along V. Looks repetitive when tiled flat — use `mats.worldUV('barnPaint',{mode:'triplanar',macroScale:1/9})` for big walls. |
| `metalRusted` | steel -> rust, pitting, streaks (metalness map). |
| `rope` | 3-strand twist. U = around, V = along (CylinderGeometry/TubeGeometry-with-swapped UV). Use repeat/UV scale on V. |
| `foliage` | alpha-tested (0.5) leaf-cluster card (UV 0..1, base at bottom), DoubleSide, wind sway (object-space height), sun back-light translucency. Assign `mesh.customDepthMaterial = mats.foliage.userData.depthMaterial` for cut-out shadows. `mats.setWind(0..1)`. |
| `paintChipped` | tintable chipped paint. `mats.makePaint(hex)` -> new material (alpha of map = paint coverage; colour tints paint only, chips show primer/rust). |
| `rubber` | tyres. `hay` straw bales. `glass` transparent env-reflective windscreen. |

Extras on the library object: `worldUV(nameOrMaterial, opts)` (clone + world-space/triplanar projection;
`opts: { scale (m/tile), mode:'planar'|'triplanar', macro:true, macroScale, sharpness }`), `applyWorldUV(mat, opts)`
(in place), `asDecal(mat)` (polygonOffset — use for mud/puddle patches lying on terrain), `makePaint`,
`makePuddleGeometry`, `waterMaterials`, `textures`, `setWind`, `dispose`.

## Lighting

`setupLighting` returns `{ sun, hemi, sky, fog, setTime(name, instant?), update(dt, camera), setShadowExtent(m),
setShadowMapSize(n), sunDirection, night, presets, dispose }`.
* One shadow-casting DirectionalLight (sun by day, moon at night), ortho frustum `shadowExtent` m half-size centred
  ~0.55·extent ahead of the camera, snapped to the shadow texel grid (no shimmer). 2048 map.
* Fog: global replacement of three's fog chunks (all materials): exponential height+distance density with
  sun-directional in-scattering. `scene.fog` is a `FogExp2` — density ≈ 0.003 means ~300 m visibility (units: 1/m, *not*
  three's exp² convention). Height falloff is anchored to the camera (`camera.y - 2.5`).
* PMREM environment from the sky (`scene.environment`), regenerated when a time-of-day transition settles.
* `gfxNight` (0..1) drives how visible the headlight beam is.

## Headlight

`attachHeadlight(truck.parts.headlight)` (forward = local -Z). Warm SpotLight (shadowed, gobo map) + analytic volumetric
cone (single scatter, animated dust + motes, visible mostly at dusk/night) + emissive lens + glow sprite.
`setOn(bool)` runs a ~0.5 s filament warm-up (colour temp ramp + stutter) and subtle battery flicker on its own rAF loop
(`{autoTick:false}` + `update(dt)` for manual stepping). The spot's shadow map is only re-rendered while lit.

## Post FX

`render(dt, { speed, splatter })`, `setSize(w,h)`, `addSplatter('mud'|'water', amount 0..1)`, `clearSplatter()`,
`setParams({bloom, bloomThreshold, vignette, grain, grade, motion})`, `setPlanarReflection({enabled, y, scale, materials: mats.waterMaterials})`.
Pipeline: scene -> MSAA half-float RT -> bright pass (1/2) -> separable blur (1/4, 1/8) -> one final pass (lens-drop
refraction + mud, radial speed blur, bloom, ACES, grading, vignette, grain, dither). 7 passes, 5 of them tiny.
`splatter` in render opts (`{type, amount}` or number=mud) auto-spawns drops while you stay in a hazard (rate-limited).
Splatter drips and fades over 6-16 s (max 32 drops).

`setPlanarReflection` mirrors the scene about the plane `y` into a 0.4x target (shadows reused, clip plane at the water,
water meshes hidden) — one extra scene pass, so enable only when a puddle is near/visible and call again with the nearest
puddle's `y` as it changes. Without it, water falls back to PMREM sky reflection only.

## Perf notes (iPad Safari WebGL2)

* Startup: ~1.2 s CPU texture baking at default quality (`quality:'low'` = all 256², ~0.8 s).
* Dynamic resolution: `renderer.userData.gfx` scaler steps the **scene target** 1 -> .6 when frame EMA > ~20 ms for 1 s, back up
  after 5 s of headroom; the canvas stays at min(dpr,2) and the final pass up-samples.
* MSAA 4 half-float target is the main memory/bandwidth cost: `createPostFX(..., { msaa: 0 })` on weak devices.
* Shadow map 2048 (`setShadowMapSize(1024)` to save). Spot headlight adds a 512 shadow map while on.
* Bloom threshold 1.0 on HDR (only suns, glints, headlight bloom).

## Round 2 additions

* **Quality tiers** (`?q=low|medium|default|high`, read by the graphics module; `quality.js`): low = scene target 0.7x (floor 0.5), DPR 1, no MSAA/bloom/planar reflection/refraction/motion blur, BasicShadowMap 1024, no parallax, 256 textures, aniso 1, no headlight shadows. medium = 0.85x, no MSAA, bloom, reflection at 0.3x, 1536 shadows, 6-step parallax, aniso 4. default = full. SwiftShader 1024x768 real game, 5 AI, median frame: low ~0.3 s, medium ~0.5 s, default ~2.2 s (shared 4-core box, noisy).
* **Wet mud** (`materials.mud`, `wetmud.js`): global wetness `mud.userData.wet.value` / `mats.setWetness(v)`; steep parallax (tier steps) 5 cm deep for UV unit = 2.4 m; tyre ruts with herringbone tread hold standing water (roughness 0.04, flat, rippled); albedo x0.55 in wet masks. Height is stored in the ORM texture alpha.
* **Mud coat**: `mats.applyMudCoat(truckGroup | material)` -> `{set, add, get}` (see docs/requests.md).
* `materials.gravel` (grey/brown stones + AO). Anti-tiling macro variation on dirt/grass/sand/gravel/rock. Wood/barn crevice grime, edge wear, mildew, rain streaks.
* Water: wet dark rim from vertex alpha; planar reflection no longer feeds back into itself (also works with scene-made clones).
* Headlight: near-field attenuation clamp (global `lights_pars_begin` patch), decay 1.3, `intensity` option keeps the old 2600 scale; at most 2 shadow-casting headlights. Bloom threshold 1.4 with a 10x radiance clamp; dusk has no stars (stars fade in only near night).
