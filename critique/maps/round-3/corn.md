# CORN CRITIQUE — MAP ROUND 3
**Score:** 7 / 10   (round 1: 5, round 2: 6.5)

**Build and setup.** I inspected `feat/tracks` @ 26a18d1, which has the round-2 corn fixer and gameplay fixer changes. I built my own copy, served it on :4532, and loaded `?track=corn&q=medium` at 640×360.

**What I captured.** Every shot below was looked at.
- Cockpit, chase and far views every 150 m (`lane_cockpit_*`, `chase_*`, `far_*`).
- Eye-height free-camera shots of the start, finish, bays, gaps, barn yards, pumpkin patch and sunflowers (`eye_*`).
- Each passing bay driven on both sides into the exit-ramp corner, in chase and far (`baycorner_*`, `bayentry_*`).
- Dusk and night (`dusk_*`, `night_*`).
- A 10-car race start, the finish run, and two crow drive-bys (`race_*`, `finish_*`, `birds_*`).

**Drives.** All drives used `setDebugInput` and the real physics. The raw logs are `drive-straight.json`, `drive-lock.json` and `drive-zones.json`, next to the screenshots.
- 40 s of straight paddling from s=150.
- Full lock for 3 s at 10 and 14 m/s, both sides, at s 600, 1500, 2100 and 2700. Then 5 s with the wheel released (passive).
- Full lock at 14 m/s into the s≈340 pumpkin patch (also at 10 m/s), the s 1765–1800 pipe gap and sunflower stretch (both sides), the pumpkin patches at 1215 and 2470, the barn yards at 780 and 2020, and the hay yard at 1660. Each was followed by 5 s of counter-steering at 0.5.

Evidence: `critique/maps/round-3/screens/corn/`.

## Round-2 problems: status
| # (R2) | Problem | Status | Evidence |
|---|---|---|---|
| 1 | Cart rides the corn bank at 25–30° and nearly flips (upY 0.21–0.40) | **Fixed for roll.** Across 27 full-lock hits, roll stayed at 17–23°. The worst was 27.6° on a rock at s 1800. The minimum upY was 0.886, against 0.21 in round 2. **The drift is not fixed.** Straight paddling with no steering still reaches the foot ramp within about 5 s and runs along it at lat ±2.2–4.3 (hw 1.7, upY 0.93–0.96). That was 44 of 80 samples over 630 m. | `drive-straight.json`, `drive_straight_t19.0_s428_*`, `birds_f800_04…07`, `birds_f1130_02…04` |
| 2 | Pumpkin patch containment hole (27 m) | **Fixed.** At 14 m/s full lock into s 340 the cart got no more than 2.0 m past the lane edge. Every clearing, barn yard and gap I tested held at 1.07–1.85 m. The pumpkins and fence now read as the edge. | `drive_pump_340_14_R_t1.0_s341_*`, `drive_pump_1215_*`, `drive_pump_2470_*`, `drive_farm_*`, `drive_hay_*`; `drive-zones.json` |
| 2b | (gameplay R2 #3) field escape at s≈1770–1800 | **Fixed.** Right and left at 10 and 14 m/s at 1765, 1770, 1775 and 1785, the cart got at most 1.72 m past the edge. It never reached the field. | `drive_gap_1780_*`, `drive_gap_1800_*` |
| 3 | Camera loses the cart | **Changed, but still broken, in a new way.** The cart can no longer leave the lane, but now the chase camera goes **inside the corn wall** whenever the cart hugs the wall. Then the screen is solid leaf cards and the cart cannot be seen. See problem 1 below. | `drive_lock_600_14_R_t2.0_s644_chase`, `drive_lock_600_14_L_rel_t1.0_s689_chase`, `baycorner_1850_R_after_s1892_lat-3.13_chase` |
| 4 | Signs in the bank-riding line | **Mostly fixed.** The signs at hw+1.2 no longer collide, and none of my 27 hits crashed into one. Their posts still stand where a wall-riding cart drives, so the cart passes through them. The bay boards' text is cropped ("BAY" / "PASSIN"). | `lane_cockpit_1800`, `drive_gap_1780_14_L_t1.0_s1793_chase` |
| 5 | Bays don't read as bays | **Partly fixed.** There is now pale gravel, a faint straw centre dash, and a "PASSING BAY 40m >>" board. Inside the bay the wider pale strip reads (`chase_1050`, `eye_bay_1850_exit`). From the chase camera 44 m before each bay, the bay is still invisible (`bayentry_*`). The ramp ends are still diagonal wall slabs that the camera clips (problem 1). | `bayentry_0560/1040/1850/2650_chase`, `eye_bay_1850_entry`, `eye_gap_1780_pipe` |
| 6 | Corn wall is a flat painted board; the canopy reads as a hedge | **Not fixed.** Stalk cards stand in front of the face, but the face is still one streaked plane. From the far camera, the canopy is still rounded green rolls with yellow polka dots and a few tassel cards. | `far_0150…far_3150`, `eye_wall_close_1500`, `drive_lock_600_14_R_rel_t1.0_s671_cockpit` |
| 7 | Barn yards hidden behind the bank | **Fixed.** From the lane you now see the red barn, farmhouse, silo, windmill, scarecrow and lamp posts. | `lane_cockpit_0750`, `lane_cockpit_1950`, `eye_farm_0780`, `eye_farm_2020`, `drive_farm_780_14_L_t1.5_s763_cockpit` |
| 8 | Dusk murk | **Fixed.** The lane is now a lighter warm tan between olive walls under a pink sky, and the lane edge is easy to read in cockpit. | `dusk_cockpit_0300`, `dusk_cockpit_0560`, `dusk_chase_1850` |
| 9 | Polish | **Mixed.** The second tractor is now red (`eye_gap_1415`). The crows are bigger and read as black silhouettes (`birds_f800_01`, `birds_f1130_02`). The finish has a big FINISH board and a crowd (`finish_chase_line`). The start bales got twine bands but are still flat yellow boxes (`eye_start_gate`). The night mud splatter is still glowing tan blobs (`night_chase_2020`, `night_cockpit_2020`). | as listed |

## What works (max 3 bullets)
- **Containment is solid and the cart stays upright.**
  - In 27 full-lock hits at 10–14 m/s, including every clearing type and the old s 340 and s 1780 holes, the cart got at most 2.0 m past the lane edge.
  - Roll stayed at about 20°, against 66–78° in round 2.
  - It never ended up in a field (`drive-lock.json`, `drive-zones.json`).
- **The set pieces are now part of the drive.** From the lane and the cockpit you see:
  - the barn yards (barn, farmhouse, silo, windmill, scarecrows, lamp posts);
  - the pumpkin patches behind a rail fence, with a scarecrow and crows;
  - the hay yards, the red and green tractors, the irrigation pipe, and the sunflower rows;
  - the start gate with bunting and the finish crowd.

  (`lane_cockpit_0750`, `lane_cockpit_1200`, `lane_cockpit_2850`, `eye_farm_2020`, `race_start_chase`, `finish_chase_line`)
- **Lighting works at all three times of day.** Dusk is warm and readable. Night has lanterns at the barns, the patches and the finish, under stars (`dusk_cockpit_0560`, `night_chase_0780`, `night_cockpit_1215`).

## Problems (ranked, most severe first; each: what / where (s metres, street) / evidence file / why it matters)
1. **The chase camera goes inside the corn whenever the cart is against the wall, and the cart disappears.**
   - The clamp in `src/main.js` `camClamp` allows `max(hw + 0.9, |cartLat| + 1.5)`. A cart riding the wall foot sits at lat ≈ hw + 1.0…1.6, so the camera may go to hw + 2.5…3.1. That is past the corn face at hw + 1.6, i.e. inside the wall mesh and canopy.
   - Seen in:
     - `drive_lock_600_14_R_t2.0_s644_chase` (solid corn, no cart)
     - `drive_lock_600_14_L_rel_t1.0_s689_chase`
     - `baycorner_1850_R_after_s1892_lat-3.13_chase` (no cart)
     - `drive_straight_t19.0_s428_chase` (the camera at canopy height, half the frame a flat green "lawn")
     - `baycorner_1040_L_after_s1069_lat-3.49_chase`
   - At the bay exit ramps it happens on every bay I drove: `baycorner_1850_L_after…`, `baycorner_2650_L_after…`, `baycorner_2650_R_after…`, `baycorner_560_L_after…` all have a canopy slab or leaf card over a third to all of the frame.
   - The far camera at the bays sits on the canopy, and the cart is a speck half hidden behind the wall top (`baycorner_1040_L_s1039_lat-4.24_far`, `baycorner_2650_L_s2647_lat-3.68_far`).
   - Why it matters: problem 2 makes wall-riding the normal state for a child who doesn't steer. A screen full of leaves with no cart is the worst thing a kid can see. In round 2, "the chase camera never goes in the wall" was one of the map's strengths, so this is a regression.
2. **Hitting the wall stops the cart dead, and the stuck rescue often fires (sometimes twice).**
   - At 14 m/s into the s 340 pumpkin fence, speed went from 11.7 to 0.1 m/s within 0.5 s. Two rescues followed about 1 s apart, and after the second the cart was set down and rolled across into the left wall (`drive-zones.json` seg `pump_340_14_R`).
   - Across the 11 clearing and gap hits, the rescue fired 5 times.
   - Minimum speeds were 0.06–0.6 m/s at s 1215, 2470, 2020 and 1828 (the 1850 bay ramp).
   - Even glancing full-lock hits on plain corn cost 14 → 2.6–7.7 m/s within 3 s (`drive-lock.json`, `vAtRelease`).
   - With the wheel released, 9 of 16 lock runs were still on the wall foot 5 s later. The 7 that came back took 1.5–4.5 s.
   - Why it matters: containment is right, but the response feels like a brick wall rather than a springy corn edge. The extra rescues teleport the player when they could have reversed out in a second.
3. **A cart that isn't steered drifts onto the wall foot within about 5 s and runs along it.**
   - Straight paddling from s 150: lat −0.84 at s 190, then −2.1…−3.0 from s 205 to 285. It crossed the lane and rode +2.2…+3.0 from s 377 to 520, then +3.9…+4.3 in the 560 bay.
   - That is 44 of 80 samples outside the lane edge, with upY 0.93–0.96 (16–21° tilt).
   - The `crown −0.15` dish does not re-centre the cart on the bends.
   - The crow drives (`birds_f800_04…07`, `birds_f1130_02…04`) show the same thing: the cockpit is half corn wall within 4 s of letting go.
   - Why it matters: combined with problems 1 and 2, a young player spends a lot of the race scraping the corn with a tilted horizon and a camera in the leaves.
4. **The corn itself is still the weakest visual.**
   - Up close, the face is one plane with long vertical streaks. The stalk cards in front help in cockpit, but at the wall the cockpit fills with 2–3 huge flat leaf cards (`drive_lock_600_10_R_t1.0_s612_cockpit`, `drive_gap_1800_14_R_t1.0_s1798_cockpit`).
   - From the far camera, the top is still a soft rounded roll with yellow polka dots on every row, closer to a vineyard hedge than a 2.5 m corn canopy (`far_0150`, `far_1350`, `far_2700`).
   - The sunflowers are flat pale-green sticks with a crossbar leaf, which read as crosses or swords up close (`drive_lock_600_10_L_t1.0_s609_chase`, `drive_straight2_t10.0_s610_chase`).
   - Why it matters: this is the surface you see for three minutes.
5. **The passing bays still don't show from the approach.**
   - From the chase camera 44 m out, every bay looks like the normal lane (`bayentry_*`).
   - The pale gravel only shows once you are in the bay (`chase_1050`).
   - The "PASSING BAY" boards are small, 1.2 m off the edge, and the text is cropped to "BAY" / "PASSIN" (`lane_cockpit_1800`).
   - The ramp ends are still angular wall slabs (problem 1).
6. **Mud clods and droplets are big, dark, floating smudges.**
   - Brown blurry blobs up to about 60 px across fill the cockpit and chase views after mud: `race_12s_chase`, `race_12s_cockpit`, `birds_f800_04…07`, `far_1500`.
   - At night the mud splatter is lit as bright tan blobs (`night_chase_2020`, `night_cockpit_2020`).
   - Transparent droplet rings float around the cart (`baycorner_1850_R_s1858_lat0.9_chase`, `night_cockpit_1850`).
   - Mud puddles in the lane read as black shadows (`chase_0300`, `chase_2850`).
   - This is shared splatter code, but it is most visible here.
7. **Minor items.**
   - The start and finish bales are flat untextured yellow boxes (`eye_start_gate`, `race_start_far`).
   - The tractors are blocky (`drive_straight_t5.0_s215_cockpit`).
   - The night lantern halos are very large: one covers about a quarter of the screen in `night_cockpit_1215`.
   - There is no "FINISH 40 m" pre-banner.

## Fix list (concrete, actionable, ordered; name files/functions where you can)
1. **Camera, highest priority. Owner: gameplay fixer, `src/main.js` `camClamp`.**
   - On corn, cap the allowed lateral at the corn face: `lim = Math.min(Math.max(hwC + m, |cartLat| + 1.5), hwC + WALL_R − 0.25)`, where WALL_R = 1.6 is exported from `corn.js` or put on `world.flags`.
   - When the cart is beyond hw + 0.8, raise the chase camera instead of moving it sideways: target height ≥ corn top + 0.8 m, looking down at the cart.
   - Apply the same cap to the far camera, and keep it at least 1.5 m above the canopy or below 0.6 × corn height.
   - For the bay ramps, use the narrowest `width` over [camera s, cart s], not only the two endpoints.
   - Re-check with these shots: `drive_lock_600_14_R t2.0`, `baycorner_1850_R_after`, `baycorner_1040_L_after`.
2. **Softer wall response. Owner: corn fixer plus gameplay, `corn.js` `surface()` and `src/core/physics.js` `wallN`.**
   - Keep the outward velocity zeroed, but don't kill the tangential speed. Cap the loss at about 30 % per hit.
   - Add a small inward push (about 1–2 m/s²) while the cart is on `type:'wall'`, so it slides back to the lane.
   - Stop the corn stuck rescue firing again within 3 s of a rescue, and don't fire it while speed is rising.
   - Target: full lock at 14 m/s into any clearing should keep at least 6 m/s and cause 0 rescues.
3. **Re-centring. Owner: corn fixer, `corn.js` `terrainOpts` / `verge`.**
   - Make the dish stronger only near the edges: start a ~6–8° rise at hw − 0.3 instead of a uniform crown, so a cart with no steering is pushed back before it reaches the foot ramp.
   - Optionally, the gameplay fixer can add a light lane-follow assist on corn when steering input is 0.
   - Target: 40 s of straight paddling keeps |lat| ≤ hw + 0.3 for at least 80 % of samples.
4. **Corn look. Owner: corn fixer.**
   - Replace the rounded canopy roll near the lane with a ragged top: instanced leaf and tassel cards every 1–1.5 m along the first 6–8 m.
   - Remove or shrink the yellow polka-dot pattern in `cornTop`.
   - Break the face plane: offset the face by ±0.3 m every 2–3 m, or add a second, darker stalk-card row 0.6 m behind it.
   - Fade or cull the stalk cards within 1 m of the cockpit camera, so wall contact doesn't fill the screen with three giant leaves.
   - Give the sunflowers round stems with alternating leaves, not a crossbar.
5. **Bays.**
   - Put a big "PASSING BAY →" board at the start of the entry ramp, on top of the bank at about 2.5 m, with bale stacks either side.
   - Make the straw centre line bolder and start it at the ramp.
   - Widen the sign boards, or shorten the text, so it isn't cropped.
   - Taper the ramp wall over the full 22 m with rounded corners instead of the diagonal slab.
6. **Particles. Owner: shared splatter / post code.**
   - Shrink the mud clods by about half and make them darker and opaque.
   - Make the splatter and droplet materials follow night lighting.
   - Make the lane mud puddles a wet brown with a sheen instead of black.
7. **Polish.**
   - Give the start and finish bales a straw texture and vary their sizes.
   - Reduce the night lantern halo size (`glowMat.size` 3.4 → about 2).
   - Add a "FINISH 40 m" banner.
