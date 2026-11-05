# CIRCUIT CRITIQUE — MAP ROUND 1
**Score:** 5 / 10

Build: `feat/tracks` worktree as of round 1, `npx vite build` into a scratch outDir, `?track=circuit&autostart=1`, q=medium for visuals and q=low for driving.
What I did: cockpit survey every 60 m (s 0 to 1020), chase and free-camera views of the hairpins, chicane, gantry, pits, grandstands and infield, day and night. I drove more than a full lap with `setDebugInput` (paddling continuously with PD steering): s 0 to 1345, Lap 1/3 changed to Lap 2/3 at s≈1073, lap time about 72 s at 15–16.8 m/s. I deliberately ran wide five times (s 290, 600, 100 both sides, 880). I hit the barrier at 16 m/s at ten more spots. I finished a race (teleported to s 3150): `finished=true`, results screen shown.

## What works (max 3 bullets)
- The start straight reads as a real speedway at first glance: two roofed grandstands full of spectators, bunting, flags, colourful garage fronts and a chequered line (`cockpit-s0060.jpg`, `day-stands-roof-tree.jpg`).
- Lap logic and UI work: "Lap 1/3" changed to "2/3" at s≈1073, then "3/3", and the finish triggers at 3218 m. The race-map shape (paperclip with a chicane notch) matches the real track, and the player dot is placed correctly (`race-lap3.jpg`, `race-finish.jpg`).
- On the flat you can always recover from the grass run-off when the cart comes back at an angle. After wide moments at s 290, 600 and 100 the cart was back on asphalt within 1–2 s and up to 12–15 m/s within 10 s (`wide-290-L-after.jpg`, `wide-600-R-after.jpg`).

## Problems (ranked, most severe first)
1. **You can escape over the barrier on the pit straight, and barrier hits launch the cart into the air.**
   - Where: s≈165–185, right side, pit straight. The verge `pit` branch lets the berm drop away after the barrier from s>LAP-70 to s<230.
   - What I saw: at 16 m/s with steer +0.35 the cart climbed the 1.5 m lip, flew 6.4 m high and landed at d=+14.9 in the infield field. An off-track rescue then put it back at d=0 about a second later.
   - Every other barrier hit (s 40, 60, 150, 420, 700, 960, 1000) also launched the cart: 1.8 m measured in the side view at s 700, and up to 4.6–8.9 m above the terrain below by my probe.
   - Evidence: `launch150-f4.jpg`, `launch150-f6.jpg`, `launch150-f8.jpg`, `escape-150-0.35.jpg`, `launch700-side-f7.jpg`.
   - Why it matters: the barrier is a ramp, not a wall. Kids will hit it every lap, and flying over a concrete wall looks broken.
2. **The chase camera ends up inside the barrier mesh and the whole screen goes grey.**
   - Where: s≈318, outside of hairpin 1, after running wide on the left.
   - Evidence: `wide-290-L.jpg`, a completely grey frame with only the HUD showing.
   - Why it matters: it happens whenever you touch the wall in chase view, so it reads as a crash or render bug.
3. **A cart that runs nose-first into the tyre wall can get stuck, and `noStuckRescue: true` means no rescue comes.**
   - Where: s≈905–912, outside of hairpin 2.
   - What I saw: I paddled continuously at full steer back towards the track for 12 s. The cart stayed at 0.2–2 m/s and s did not move past 911.
   - Only an explicit reverse for 2.5 s got it out (`afterRev` s 956, 14.5 m/s).
   - Evidence: `wide-880-L.jpg`, `wide-880-L-after.jpg`, `stuck-905-after-reverse.jpg`.
   - Why it matters: a child on an iPad won't know to reverse. The run-off is only about 1.9 m of grass (hw+1.5 to hw+3.35) before the wall, so there's no room to turn.
4. **The layout is not fun to race: it's flat-out all the way round.**
   - Both "hairpins" are constant R72 m semicircles. My driver took them at 16.8 m/s with steer ≤0.06.
   - The chicane (s≈570–690) only dropped the speed to 12.8 m/s.
   - Two 290 m straights make up about 55 % of the lap. There's no braking point, no line choice and nowhere to overtake except by paddling faster.
   - From the air it's a stadium oval in an empty field (`day-aerial-nofog.jpg`, `day-hairpin-above.jpg`).
   - Why it matters: three laps of holding paddle with no decisions. It doesn't feel like a small professional circuit, which always has at least one tight hairpin and varied corner radii.
5. **The trackside dressing looks placeholder.**
   - Every sponsor billboard is a blank coloured board with no text: white, green, red and yellow (`cockpit-s0240.jpg`, `cockpit-s0660.jpg`, `day-chicane-bb-close2.jpg`).
   - The tyre walls don't read as tyres. They are 6-sided light blue-grey and white lumps with grass showing between them, and every fifth group is brightened 6× to near white. They look like milk churns or bollards (`cockpit-s0420.jpg`, `wide-880-L.jpg`, `launch700-side-f7.jpg`).
6. **The START / FINISH banner is buried inside the gantry beam.**
   - The banner plane sits at y+9.0 and is 1.9 m tall, inside the 1.5 m beam box at y+9.2, so only its bottom 0.4 m shows.
   - No "START / FINISH" text is visible from either side (`day-gantry.jpg`, `night-gantry.jpg`).
   - The gantry reads as rusty wooden planks, and the five "start lights" are flat red boxes that aren't emissive.
7. **The night race has no circuit lighting.**
   - No floodlight towers, no lit grandstands, no glowing gantry or start lights.
   - The track is only readable from the moon (`night-chase-s420.jpg`, `night-grandstand.jpg`, `night-gantry.jpg`).
   - Why it matters: a night speedway is the obvious showcase for this map.
8. **The pits and infield are bare.**
   - The garages are one continuous concrete slab directly behind the barrier. There's no pit lane, pit wall or paddock, and the back is a blank wall with trees against it (`day-pits.jpg`, `day-behind-pits.jpg`).
   - The garages stop at s≈122. The rest of the infield is randomly scattered trees with no race-control tower, marshal posts or car park (`day-infield-from-stands.jpg`, `day-start-aerial.jpg`).
   - The grid has no grid boxes, only the chequered line (`day-startline-low.jpg`).
9. **The surface detail is muddy.**
   - The asphalt has large white flecks that look like snow or litter at cockpit height (all `cockpit-*.jpg`).
   - The kerbs are pink smears from per-vertex colour at `rowStep: 2`, not crisp red and white blocks (`day-chicane-bb-close.jpg`, `wide-600-R.jpg`).
   - No z-fighting seen. The chequered line is offset correctly.
10. **AI cars are far too slow on the flat** (cross-scope, for the gameplay critic).
    - After 22 s of racing the AI were at s 84–159 while I was at s 310.
    - The results screen estimated their 3 laps at about 740–765 s, against my pace of about 216 s (`race-pack-22s.jpg`, `race-finish.jpg`).
    - The race is no contest.

Checked with nothing found: nothing intrudes onto the asphalt anywhere on the loop. There are no floating flags, posts or billboards. The barrier ribbon is continuous with no visible gaps, and the loop seam at s=0 / 1072.7 is closed. Grandstands sit on the ground.

## Fix list (concrete, actionable, ordered)
1. **`circuit.js` `verge()`: stop the berm acting as a launch ramp.**
   - Remove the `pit` back-slope (or start it at r ≥ 4 m) so there's no drop right behind the barrier on s<230 or s>LAP-70.
   - Make the lip a flat-topped wall: about 2.0 m high, rising over 0.25 m, and holding full height to r ≥ 3 m.
   - Gameplay fixer: in `src/core/physics.js`, treat surface `type === 'wall'` as a lateral constraint. Reflect the velocity component along the track normal with restitution ≈0.2 and add no vertical impulse, so walls stop carts instead of launching them.
   - Re-test with a 16 m/s, steer ±0.35 hit at s 150 and s 40, then confirm max |d| < 8.6 and air < 0.5 m.
2. **`src/core/camera.js`: keep the chase and far cameras out of the barrier.** Clamp the camera's lateral offset to within hw+3.2 of the track centre, or raise the camera above the barrier top (terrain + 1.5 m) when it would end up inside it.
3. **Stuck recovery.**
   - Set `noStuckRescue: false` in `planCircuit` flags, or add a circuit-specific rule: speed < 1 m/s for 3 s while paddling forward triggers an auto-reverse nudge or a rescue.
   - Widen the run-off on the outside of both turns (verge `r` offset hw+3.4 → hw+6 for |kap|>0.008), and move the tyre walls and barriers out with it (`hw3()`, the tyre `d`).
4. **`loopPoints()`: give the circuit real corners.**
   - Make the s≈300–500 turn a tight hairpin (R≈15–18 m) with a short braking straight before it. Keep one R≈60–70 sweeper.
   - Sharpen the chicane: about 12 m lateral offset over 25–30 m instead of 22 m over about 70 m.
   - Target a minimum corner speed of about 7–9 m/s, so steering and wall-avoidance matter. Keep the lap close to 1072.7 m (`lengthTarget`).
5. **Tyre walls (`zones` block).**
   - Stack the cylinders upright (axis vertical, 3 high, radius 0.32, spacing 0.62 so they touch) in near-black (0.06–0.1).
   - Use a white or red painted band on every 4th stack instead of the ×6 near-white tint.
   - Add 8 radial segments, or a dark inner disc, so they read as tyres.
6. **Billboards: put text on them.** Use `bannerTexture()` with varied slogans such as "PADDLE POWER", "SOAPBOX GP", "GRAN'S JAM", "BOLTS & CO", with the coloured board as the background.
7. **Gantry.**
   - Move the banner plane in front of the beam (offset ±0.4 m along the tangent, one plane per face) or lower it under the beam.
   - Paint the gantry clean white or grey metal, not `metalRusted`.
   - Make the 5 start lights emissive.
8. **Night lighting.**
   - Add 6–8 floodlight towers (pole plus emissive lamp head plus a few PointLights at night only, or baked emissive cones) around the stands and hairpins.
   - Add emissive strips under the grandstand roofs.
9. **Pits, grid and infield.**
   - Pits: add a pit-lane strip and pit wall between the track and the garages. Split the garage slab into individual bays with roof edges, and add backs with doors.
   - Paddock: put a few tents and vans behind the garages.
   - Grid: paint grid-box marks at `startPos` slots.
   - Infield: add a race-control tower near s≈0, marshal posts with flags at each corner, and some infield landmarks such as a car park or picnic area. Keep trees at least 25 m from the stand backs (`scatterTrees` `minClear` per side, or a registry exclusion for the stands).
10. **Surface.**
    - Tone down the white speckle in `asphaltLines`, or override it for the circuit with a darker, finer aggregate.
    - Draw the kerbs as a separate draped strip mesh with a red/white block texture (like `strip()`), not vertex colour.
11. **(Gameplay fixer)** Investigate the AI's flat-ground pace on `circuit`. The AI should run at roughly 85–100 % of the player's 15–16 m/s paddling pace. Check with `node tests/ai-sim.mjs 3 --track=circuit`.
