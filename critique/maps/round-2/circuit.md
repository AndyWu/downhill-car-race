# CIRCUIT CRITIQUE — MAP ROUND 2
**Score:** 7 / 10   (round 1: 5 / 10)

**Build:** worktree `feat/tracks` at `60975f6`, built with `npx vite build` into a scratch outDir and served by `vite preview` on port 4513. URL `?track=circuit&autostart=1`. Visuals at q=medium (960×540), driving at q=low (640×360), race at 844×390.

**What I did:**
- **Cockpit survey.** Every 60 m by day (`cockpit-s0000…s1020`) and every 120 m at night.
- **Chase and far views.** At the grid, hairpin and chicane.
- **Free-camera views.** Gantry front and back, grandstand, pits, hairpin and chicane from above and low, day and night.
- **Autopilot lap.** Pure-pursuit steering with a speed target set from curvature, paddling, standing start at s=2. I drove to s 1200.
- **Wall hits.** Nine deliberate hits at 14–16 m/s with steer ±0.5–0.6 into both walls (s 40, 150 ×2, 250, 520, 640, 820, 960, 1050). After each one, the autopilot recovered.
- **Hairpin tests.**
  - Arrive at 15–16 m/s without braking.
  - Nose-in on both sides at 8 m/s, then paddle straight for 15 s.
  - Wedge paddling and wedge idle for 12 s.
- **Race.** A 10-car race with ai=9 for 45 s. Then a teleport to s 3180 to check the finish.
- **Checks.**
  - Physics probe: `heightAt` and `surfaceAt` on every metre × 7 lateral points of the asphalt.
  - `node src/scene/tracks-clearance.mjs circuit`: ALL OK.

Raw data is in my scratch folder (`drive-geo_lap.json`, `drive-geo_walls_hair.json`).

**Measured layout** (curvature from `track.sampleAt`). These match the fixer's notes, and every lap is the same:

| Section | s (m) | Min radius |
|---|---|---|
| T1 | 238–314 | R48 |
| Hairpin | 424–478 | R16.6 |
| T3 | 538–598 | R39 |
| Chicane | 718–778 | three R20–21 arcs |
| T5 | 898–990 | R30 |

- Lap length is 1072.7 m, and three laps give the full 3218 m.
- Height range is −1.8 to +1.9 m.

## Round-1 status
**Fixed (verified):**
- **R1 #1, barrier launches and escape.** In 9 hits at 14–16 m/s, max air (cart height above `heightAt`) was 0.24–0.34 m, which is just the ride height. The walls stopped the cart at |lat| 7.6–11.4 m. Nothing escaped, including the pit straight on both sides (s 40 and 150).
  - Back on the asphalt at more than 5 m/s took 1.1–3.2 s.
  - Evidence: `wallhit150-chase-f0…f5.jpg`.
- **R1 #2, chase camera in the barrier.** In all six chase frames of a 16 m/s wall hit, the camera stays on the track side of the wall (`wallhit150-chase-f*.jpg`).
- **R1 #3, nose-in stuck with no rescue.** A cart pinned nose-first in the outside hairpin tyre wall (s 456, lat +7.6, 0.08–0.4 m/s) was put back on the centre line, facing forward, after 4.0 s. The other side (lat −11.5) was rescued after 3–4 s. A cart that is simply idle on the asphalt is left alone, which is correct.
  - Evidence: `hair-wedge-idle-0s/3s/12s.jpg`, `hair-wedge-paddle-*.jpg`.
- **R1 #4, flat-out layout (mostly fixed).** There is a real R17 hairpin, an S-chicane and varied radii.
  - Autopilot minimum speeds were 10.8 m/s at the hairpin and 9.1 m/s at the chicane, against 15–16 m/s on the straights.
  - Lap from a standing start: 86.8 s. "Lap 1/3" changed to "Lap 2/3" at s 1073.
  - The top-down views read as a proper small circuit (`free-hairpin-above.jpg`, `free-chicane-above.jpg`).
- **R1 #5, placeholder dressing.**
  - Tyre walls are now black upright stacks with red and white bands, and they read as tyres (`cockpit-s0480.jpg`, `cockpit-s0960.jpg`).
  - The billboards carry text: BOLTS & CO, TURBO TEA, SOAPBOX GP (`cockpit-s0480/0660/0840.jpg`).
- **R1 #6, gantry.**
  - The gantry is clean white steel with a readable START / FINISH banner on both faces and 5 red lamps (`free-gantry-front.jpg`, `free-gantry-back.jpg`).
- **R1 #8, pits and grid.**
  - There is a pit lane with lines, 12 coloured garage bays with parked carts, a paddock with tents and vans, a race-control tower and a car park (`free-pits.jpg`, `free-pits-high.jpg`).
  - Grid boxes are painted (`free-gantry-front.jpg`).
- **R1 #9, surface.** The white flecks are gone. The kerbs are crisp red and white blocks (`chase-s0431.jpg`, `free-chicane-low.jpg`).
- **R1 #10, AI pace** (cross-scope). After 45 s, the 9 AI were at s 258–444 against my autopilot's 288. I was 8th of 10 in a real pack (`race-pack-chase.jpg`).
- **Finish.** The finish triggers past 3218 (`finished=true`, `race-finish.jpg`).

**Partly fixed:**
- **R1 #7, night lighting.** Floodlight towers, lit roof strips, lit garages and emissive signs now exist. But the real lights are badly over-exposed (see Problem 1).
- **R1 #4, corners and braking.** The hairpin can still be taken flat out by using the run-off (see Problem 3).

**New in round 2:** Problems 1, 2, 4 and 5 below.

## What works (max 3 bullets)
- **Walls are walls now.** There's no launch, no escape and no camera in the wall. A pinned cart is rescued in about 4 s, nose-first or side-on, and an idle cart on the asphalt is left alone.
- **It looks and races like a small real circuit.**
  - Hairpin, chicane, sweeper and fast T1 each have their own kerbs, tyre stacks and run-off.
  - The start straight has two grandstands with people and roofs, bunting, the gantry, grid boxes and a pit lane with garages (`cockpit-s0060.jpg`, `free-pits.jpg`, `chase-s0451.jpg`).
- **Laps, lap chip, race map and finish all work.** The 10-car race stays bunched with the player in the pack.

## Problems (ranked, most severe first)
1. **Night floodlights blow the picture out at the grid and the hairpin.** Every night race starts with this.
   - **Where:** s≈0 at the grid, and s≈440–460 at the hairpin.
   - **Grid:** in cockpit view the cart's own cockpit glows white with heavy bloom (`night-cockpit-s0000.jpg`). In chase view the cart is a white blob (`night-chase-s0000.jpg`). The grass beside the start straight turns into bright yellow zebra stripes (`night-far-s0020.jpg`, `night-free-gantry-back.jpg`).
   - **Hairpin:** the whole hairpin turns into a flat beige sheet. The cart, its shadow and the road markings almost disappear (`night-chase-s0451.jpg`).
   - **Between towers:** the track is very dark, readable mainly from the edge lines (`night-cockpit-s0360/0600/0840.jpg`).
   - **Likely cause:** the 3 nearest-tower `PointLight`s (in `circuit.js` `update()`, `L.intensity = n * 900`, distance 70, decay 1.6), plus `poolMat` additive light pools at opacity 0.5. When the lights sit within a few metres of the cart, they saturate it.
   - **Why it matters:** the night speedway is meant to be the showcase. Instead, the first thing a child sees is a glare blob where their cart should be.
2. **Grass terrain shows through the asphalt on the run-in to the hairpin and T3.**
   - **Where:** s≈404–425 (hairpin entry) and s≈528–545 (T3 entry), and possibly elsewhere on the insides of tight corners.
   - **What I saw:** large tongues of grass mesh lie over half the road, hiding the white edge line and the kerb. This is visible at cockpit height every lap (`cockpit-s0420.jpg`, `cockpit-s0540.jpg`).
   - **Clearest evidence:** the low free-camera shots `free-hairpin-entry-low.jpg`, `night-free-grassbleed-535.jpg` and `night-free-grassbleed-410.jpg`.
   - **Physics is not affected.** `heightAt` is within 0.12 m of the road, and `surfaceAt` reads `asphalt` on all 7 × 1073 probe points. So this is rendering only, and `tracks-clearance` (ALL OK) does not catch it.
   - **Likely cause:** `theme.ribbonEnd: 35` in `circuit.js`. The near-field grass ribbons (`ground2.js` `terrGeo`, offsets up to 35 m from the edge) are extruded sideways from each road row. On the inside of the R17 hairpin, the inner edge is at about R12 and the opposite leg is about 34 m away. On the inside of the R40 sweeper, offsets past the curve centre fold over and land on the other leg's or the approach's asphalt.
   - **Why it matters:** it is the most visible rendering bug on the lap, and it sits exactly where the player is choosing a line.
3. **The hairpin does not force a brake. Running wide costs almost nothing.**
   - **Arriving flat out:** at 16 m/s with pursuit steering and no braking, the cart went round the R17 hairpin at 16.0 m/s. It drifted to lat −6.95, just 0.45 m onto the run-off.
   - **Careful line:** my careful autopilot slowed to 10.8 m/s. A child holding both paddles therefore never needs to lift.
   - **Running wide with no steering:** the cart ended on the grass at 9 m/s, the next best case.
   - **Where:** s 424–478.
   - **Evidence:** `drive-geo_walls_hair.json` → `hair[wide-halfsteer]`, `chase-s0431.jpg`.
   - **Why it matters:** you still win by holding paddles. Corner skill is barely rewarded. This is acceptable for families, but the gap to a polished racer is visible.
4. **The start lights are always lit red and never sequence.** All 5 lamps are on, by day and at night, during the countdown, after GO and for the whole race (`free-gantry-front.jpg`, `race-grid-lights.jpg`, `race-go.jpg`). `redMat` is a constant colour (1.5, 0, 0), and nothing ties it to `game.state.countdown`. A gantry lit red during the race reads as "stop".
5. **Smaller visual issues.**
   - **Side camera:** it goes inside the wall during a wall hit, and the screen fills with a translucent wall plane (`wallhit150-side-f1…f5.jpg`). The chase camera is fine.
   - **Re-wedge after rescue:** a rescue in the middle of the hairpin puts the cart at lat 0 facing the tangent. A child paddling with no steering drives straight back into the tyre wall at s 473 and waits another 4 s (`hair-wedge-paddle-12s.jpg`). Placing the cart a few metres further on, past the apex, would help.
   - **Run-off grass:** close up, the grass beside the kerbs is a coarse smeared noise texture (`wallhit150-chase-f2.jpg`, `cockpit-s0540.jpg`).
   - **Billboards:** at s 480 the BOLTS & CO board sits so close behind the wall at the hairpin exit that it fills the top right of the cockpit view (`cockpit-s0480.jpg`). This is fine, but it is the only sign you really notice. The back straight has few.

Checked with nothing found:
- No props intrude onto the asphalt (clearance ALL OK, cockpit survey).
- The barriers are continuous, and the loop seam at s 0 is closed.
- The grandstands are grounded, and there are no floating flags or posts at cart height.
- At 844×390 the lap chip sits beside the rank chip and no longer overlaps the pad box (`race-pack-chase.jpg`).
- No page errors.

## Fix list (concrete, actionable, ordered; name files/functions where you can)
1. **`circuit.js` night lighting (`update()` and the tower and pool setup).**
   - Cut the `PointLight` intensity to about 60–120 (try `n * 90`). Give it `distance` ≈ 45 and `decay` 2.
   - Mount each light at the tower head (≥ 14 m up), and never within 10 m laterally of the asphalt.
   - Drop `poolMat` opacity to about 0.18. Give the pools a soft radial falloff, so the hairpin and grid read as lit asphalt instead of a beige sheet.
   - Check at night that the cockpit at s 0 and the chase view at s 451 show the cart with normal contrast.
   - Between towers, add a faint cool fill on the track so it can be read at cockpit height. This could be dimmer extra pools every about 80 m, or a slight lift of `asphaltLines` emissive at night.
2. **`circuit.js` theme `ribbonEnd` and grass ribbons: stop terrain folding over the road on the inside of tight turns.**
   - Simplest: set `ribbonEnd` to about 10–12 m.
   - Better (`ground2.js` `terrGeo`, small and local, circuit only via a theme hook): clamp each row's offset on the inside of a curve to `1/|kap| − hw − 2`. Or drop vertices whose nearest road corridor (`net.project2`) is not this row's own road or is within the asphalt.
   - Verify with low free-camera shots at s 404–425 and 528–545, and with a check that no grass triangle lies above the asphalt within |d| < hw. The latter could be a new assertion in `tracks-clearance.mjs`.
3. **Make the hairpin cost time if you take it flat.**
   - Make the hairpin's outside run-off a draggier gravel trap (`surface()`: `type: 'gravel'`, friction about 0.45, drag about 1.0, for |kap| > 0.03 outside the kerb).
   - Or narrow the kerb-to-grass band on the outside of the hairpin, so that 16 m/s entry ends in the trap at about 6–8 m/s rather than on the kerb.
   - Target: flat-out entry is about 1.5–2 s slower than braking to about 10 m/s.
4. **Start lights: tie `redMat` to the countdown.**
   - Light 1–5 lamps as `game.state.countdown` falls. Pass it into `update()` through `world.update`, or have `main.js` call a `world.setStartLights(n)` hook.
   - Turn all lamps off, or switch them to green, at GO.
   - With split lamp meshes, use one material per lamp or vertex colours.
5. **(Gameplay fixer)**
   - Clamp the `side` camera out of the wall the same way `clampLat` does for chase and far (`src/core/camera.js`).
   - In the circuit pin-rescue (`physics.js`, the `noStuckRescue` branch), place the cart about 6–10 m further along when s is inside a corner with |kap| > 0.03, so a no-steer child doesn't re-wedge.
6. **Polish.**
   - Use a finer, less smeared grass texture or colour on the run-off strip (`terrColor` / `grass` on the circuit).
   - Add 2–3 more billboards on the back straight (s 600–700) and the run to the line (s 1000–1060).
