# CIRCUIT CRITIQUE — MAP ROUND 3
**Score:** 7 / 10   (round 1: 5, round 2: 7)

**Build:** worktree `feat/tracks` at `26a18d1` (circuit fixes in `8d8c819`, gameplay WIP in `26a18d1`). I built it with `npx vite build` into a scratch outDir and served it with `vite preview` on port 4533, using `?track=circuit&autostart=1`.
- Visuals: q=medium at 960×540.
- Driving: q=low at 640×360.
- Race, start lights and cost: 844×390 and 960×540 with ai=9.

My scripts and raw logs are in the scratch folder `r3-circuit/` (`drive3*.log`, `race-day.log`, `lights-day.log`, `cost.mjs`).

**What I did:**
- **Day survey.** Cockpit every 60 m (`cockpit-s0000…s1020`). Chase at 8 points and far at 3. Free-camera views of the gantry, grandstand, pits, hairpin and chicane, plus 3 low "grass-bleed" views at s 404–455 and 528–545.
- **Night survey.** The same views, with the cockpit every 120 m.
- **Autopilot lap.** Pure pursuit with a curvature speed target and paddling, from a standing start at s 2 to s 1200 (`lap-chase-s*.jpg`).
- **Hairpin time trial.** From s 370 at 16 m/s to s 520, with 6 driving styles.
- **Wall hits.** 11 hits at 14–16 m/s, both walls.
- **Pins.** Nose-in pins at the hairpin outside and inside, the chicane and T1. Each was followed by a "child" phase (paddle, no steering) or an idle phase, lasting 20–30 s.
- **Gravel stops.** One idle and one paddling straight.
- **Cameras.** Side, far and chase during wall hits at s 150 and at the hairpin.
- **Start lights.** Driven through the real countdown path (`state.countdown = 3`, then the main step).
- **Race.** A 10-car race for 40 s, then the lap-2 chip and the finish.
- **Cost.** `renderer.info` summed over real frames at the grid.

Note: two blank free-camera files (`*free-aerial-whole.jpg`, camera beyond the far plane) were removed from the evidence folder.

## Round-2 status
**Fixed (verified):**
- **R2 #2, grass drawn over the asphalt.** It's gone. The hairpin entry, apex and T3 entry show clean edge lines and kerbs, at cockpit height and in the low free views. Evidence: `cockpit-s0420.jpg`, `cockpit-s0540.jpg`, `free-grassbleed-410/535/hp-apex.jpg`, `free-hairpin-entry-low.jpg`, `night-free-grassbleed-410.jpg`.
- **R2 #4, start lights.** The gantry is dark before the start. It shows 4 of 5 red lamps late in the countdown (`lights-day-2p8-gantry.jpg`), turns all green at GO (`lights-day-2p2-gantry.jpg`) and goes dark again about 2.5 s later (`lights-day-1p6/go2/go3-gantry.jpg`). The lamps are also visible from the grid in chase view (`lights-day-2p8.jpg`).
  - Caveat: `autostart=1` races have `countdown: 0` (`main.js` line 1017), so they skip straight to green. The menu path uses the real countdown.
- **R2 #5, side camera in the wall.** At 16 m/s into the s 150 wall and the hairpin wall, the side camera never fills the screen with a wall plane. The cart stays visible in all 10 frames, and chase and far are clean too. Evidence: `wallhit150-side-f0…f4.jpg`, `wallhithp-side-f0…f4.jpg`, `wallhit*-far/chase-*.jpg`.
- **R2 #3, braking now matters, and far more than before.** Time from s 370 to s 520 entering at 16 m/s:

  | Driving style | Time | Min speed |
  |---|---|---|
  | Braking autopilot (alat 7) | 10.35 s | 10.9 m/s |
  | Braking autopilot (alat 5) | 11.15 s | 9.4 m/s |
  | Brake to 10 m/s | 11.55 s | — |
  | Brake to 8 m/s | 12.95 s | — |
  | Flat out with pursuit steering | never got there | stopped dead in the gravel at lat −10.9 |

  The gravel trap reads as a brown strip in the game (`chase-s0431.jpg`). The full autopilot lap took 89.1 s (round 2: 86.8 s), with a hairpin minimum of 11.1 m/s and a chicane minimum of 6.75 m/s. "Lap 1/3" changed to "Lap 2/3" at s 1073.

**Partly fixed:**
- **R2 #1, night floodlights.**
  - The white blowout is gone. The cart at the grid is warm orange in chase view, not a white blob (`night-chase-s0000.jpg`). The grass zebra stripes are gone (`night-far-s0020.jpg`).
  - **The cockpit still glows at the grid.** The paddles, flag and cowl are bright cream with bloom, while the road ahead is dark (`night-cockpit-s0000.jpg`).
  - **The hairpin is still a flat khaki sheet.** Kerbs and run-off vanish, and the cart is a dark smudge (`night-chase-s0451.jpg`).
  - **The light pools are hard-edged polygons.** They spill over the kerbs and grass (`night-chase-s0758.jpg`, `night-far-s0748.jpg`).
  - **Away from the pools the cart is a black silhouette** (`night-chase-s0900.jpg`).
  - **The grandstand roof strip** draws a long laser-like streak across the cockpit view (`night-cockpit-s0120.jpg`).
- **R2 #5, re-wedge after a rescue.** Rescues now go about 9–10 m ahead (`recover(9)`). In the hairpin that is still inside the bend:
  - The gravel-paddle case was rescued to s 454.6 at lat 0. Paddling with no steering, it drove straight back into the trap and was pinned on the wall at s 471 within 8 s.
  - After the T1 rescue, the no-steer child rolled on into the hairpin and needed a second rescue there (`drive3b.log` → `t1-paddle`).
- **R2 #6, billboards.** There are more boards on the back straight (purple and yellow boards at s 780, TURBO TEA at s 660, SOAPBOX GP at s 840). BOLTS & CO still fills the top right of the cockpit view at s 480 (`cockpit-s0480.jpg`). Close to the cart, the run-off grass and gravel are still a smeared noise texture (`pin-hairpin-child-*.jpg`).

**New in round 3:** Problem 1 below, the gravel soft-lock.

## What works (max 3 bullets)
- **It looks like a proper small circuit by day, and the round-2 eyesores are fixed.** The grass-over-asphalt bug and the always-red gantry are both gone. The lamps sequence red, then green, then off. The kerbs, tyre stacks, grandstands with crowds, bunting, pit garages with carts and painted grid all read cleanly from every view (`ck*`, `free-gantry-front.jpg`, `free-pits*.jpg`, `free-chicane-above.jpg`).
- **Walls are walls, and the cameras behave.**
  - In 11 hits at 14–16 m/s, max air was 0.24–0.34 m and max vy 0.45–1.85 m/s. The cart stopped at |lat| 7.6–11.7.
  - Back on the asphalt at more than 5 m/s took 1.1–4.0 s at every spot except the hairpin gravel (see Problem 1).
  - Side, far and chase cameras all keep the cart in view.
- **The hairpin rewards braking.** It is the one real braking point. The rest of the lap (R48 T1, R39 T3, an R21 chicane at about 7 m/s, R30 T5) gives variety. The 10-car race starts with the player 9th of 10 in a real pack (`race-day-pack-1/5.jpg`). The lap chip, the race map with cart dots and the finish all work (`race-day-lap2-chip.jpg`, `race-day-finish.jpg`).

## Problems (ranked, most severe first; each: what / where (s metres, street) / evidence file / why it matters)
1. **The hairpin gravel trap is a soft-lock. A cart stuck in it is never rescued.**
   - **Where:** s 440–475, outside, lat −10.5 to −11.5.
   - **Paddling, no steering (the child case):**
     - Pinned nose-in at s 451 on `gravel` at 0.07 m/s, with no rescue in 20 s or in a repeat 30 s run.
     - Screenshots at 0, 3, 4.5, 6 and 9 s show the same frame: the cart's nose is in the tyre wall (`pin-hairpin-child-0s…9s.jpg`).
   - **Flat-out entry with pursuit steering:** stopped dead in the gravel at s 472, lat −10.9, and never reached s 520.
   - **Wall hit at s 452 at 14 m/s:** the autopilot could not get out in 8 s, and there was no rescue.
   - **Idle in the gravel:** the cart creeps back toward the road at 0.2 m/s on the run-off slope and still sits in the gravel after 15 s.
   - **Cause:** the circuit pin rule (`src/core/physics.js`, `noStuckRescue` branch) counts only `grass`/`wall` wheel contacts. `gravel` is neither, so `state.pin` drains. The gameplay critic found the same thing independently.
   - **Why it matters:** this is the single most likely place for a child to crash, because it is the only bend that needs a brake. The race then ends there. It is a block, not a nit.
2. **The night hairpin and light pools are still not natural.**
   - The hairpin pool turns the whole bend khaki: the kerbs disappear and the cart is a smudge (`night-chase-s0451.jpg`).
   - The pools elsewhere are hard-edged polygons that spill over the kerbs and grass (`night-chase-s0758.jpg`, `night-far-s0748.jpg`).
   - Outside the pools the cart is a black silhouette (`night-chase-s0900.jpg`).
   - At the grid, the cockpit glows bright cream with bloom while the road is dark (`night-cockpit-s0000.jpg`). This is likely the nearest-tower `PointLight` sitting a few metres from the cart.
   - The towers themselves barely seem to light the track: the road between pools is lit only by the moon.
   - **Why it matters:** the glare is fixed, but a night race still doesn't look floodlit. It looks like moonlight with some beige decals.
3. **A rescue inside the hairpin re-wedges a child.**
   - Rescues land 9–10 m ahead at lat 0, facing the tangent. In an R17 bend that is still inside the corner, so a no-steer paddler runs straight back into the gravel and wall within 8 s.
   - Evidence: `drive3b.log` → `gravel-paddle-straight` (rescued at s 454.6, pinned again at s 471) and `t1-paddle` (second rescue at s 451).
   - Combined with Problem 1, a child can loop between the gravel and the wall indefinitely.
4. **Grid frame cost is high.**
   - **Measured:** summed over real frames at the grid (q=medium, 960×540, chase), there are 7 renders per frame:
     - ai=9: 215 calls and 356k triangles;
     - ai=0: 118 calls and 210k triangles.
   - **What this means:** the 10 carts cost about 97 calls and 146k triangles. The gameplay critic's 222 / 376k agrees.
   - **Cross-scope:** the round-2 figure of 150 was measured differently. This is mostly vehicle LOD and belongs to the gameplay fixer, but the circuit's own 118 calls at the grid could still lose the crowd and bunting draw calls.
5. **Smaller visual issues.**
   - **Hairpin billboard:** BOLTS & CO dominates the cockpit and side views at the hairpin exit (`cockpit-s0480.jpg`, `wallhithp-side-f2.jpg`).
   - **Run-off texture:** close up, the run-off grass and gravel are a coarse smeared texture (`pin-hairpin-child-*.jpg`, `wallhit150-side-f1.jpg`).
   - **Grandstand roof strip at night:** it reads as a bright laser line (`night-cockpit-s0120.jpg`).
   - **Gravel colour:** from above, the gravel is hard to tell from the grass (`chase-s0431.jpg`, a faint brown).

Checked with nothing found:
- No props on the asphalt, and the barriers are continuous.
- The loop seam at s 0 is closed.
- The grandstands and garages are grounded.
- The lap chip and rank sit cleanly at 844×390.
- The finish triggers at s 3218 (`finished=true`, 1st of 10 after the teleport).
- No page errors in any run.

## Fix list (concrete, actionable, ordered; name files/functions where you can)
1. **(Gameplay fixer, `src/core/physics.js`, circuit `noStuckRescue` branch) Rescue carts stuck in the gravel.**
   - Add `'gravel'` to the `offAsph` surface test, or use |lateral| > hw + 1.5 as the corridor branch does.
   - Target: hairpin pins at s 445, 452 and 465, paddling or idle, are rescued in ≤ 4 s.
   - Re-run the s 452 wall hit, which should be back on the asphalt in < 5 s.
2. **(Gameplay fixer, `recover()`, with help from the circuit fixer) Place hairpin rescues past the exit.**
   - Inside the hairpin (s 405–494 on any lap) or any |kap| > 0.03 zone, set `ahead` so the cart lands at or past the exit, at about s 495. Alternatively, give it a small entry speed along the tangent.
   - The circuit fixer could expose `world.rescueS(s)` from `circuit.js` returning the next safe s.
   - Target: a no-steer paddler after a hairpin rescue reaches s 520 without touching gravel.
3. **(Circuit fixer, `circuit.js` gravel zone) Soften the trap so it costs time without trapping.**
   - Lower the gravel `drag` from 1.0 to about 0.6, and/or tilt the trap floor toward the track.
   - Target: a flat-out entry ends 2–3 s slower than braking, at about 4–6 m/s back on the asphalt, never at 0 m/s against the wall.
   - Make the gravel visibly beige from the cockpit and above: lift the decal colour or use a lighter `gravel` tint.
4. **(Circuit fixer, `circuit.js` night lighting: `poolMat`, `poolTexture()`, tower `PointLight`s in `update()`) Make the floodlights look natural.**
   - Give the pools a real radial falloff to transparent, so there are no polygon edges. Clip them to the asphalt and kerb width, and cut the hairpin pool's opacity or size so the kerbs stay readable.
   - Keep the `PointLight`s at the tower heads, ≥ 14 m up. Skip a tower within about 12 m of the camera, or clamp intensity by camera distance, so the grid cockpit doesn't glow.
   - Add a faint cool fill or emissive lift on `asphaltLines` at night so the cart isn't a pure silhouette.
   - Dim the grandstand roof strip's emissive.
   - Check `night-cockpit-s0000`, `night-chase-s0451` and `night-chase-s0900` afterwards.
5. **Polish.**
   - Move BOLTS & CO back about 4 m, or shrink it, at the hairpin exit.
   - Use a finer grass texture on the run-off strip.
   - (Gameplay) Use vehicle LOD for grid carts more than about 25 m from the camera, to bring the grid frame under about 180 calls.
   - (Gameplay, optional) Have `autostart=1` use a short countdown so the start lights are seen in quick races too.
