# CORN CRITIQUE — MAP ROUND 2
**Score:** 6.5 / 10   (round 1: 5)

Build inspected: `feat/tracks` @ 60975f6 (clean worktree), own build served on :4512, `?track=corn&q=medium`, 640x360.
I covered: cockpit every 150 m (`lane_cockpit_*`); chase and far views at 10 points (`chase_*`, `far_*`); 12 aerials (`aerial_*`); eye-height shots of the start, finish, bays and gaps (`eye_*`); the race start with 9 AI (`race_*`); the finish run and results (`finish_*`); two crow sequences while driving (`birds_f800_*`, `birds_f1130_*`); dusk and night (`dusk_*`, `night_*`).
I also drove about 750 m with `setDebugInput` (`drive_*`, cockpit and chase at each event). The drive was 16 s of straight paddling, then full lock right and left into the corn. It also went full lock into the s≈340 pumpkin patch at 10 and 13 m/s, wedged into the corn without paddling, and steered across the s=1850 bay. Every shot was looked at. The evidence is in `critique/maps/round-2/screens/corn/`.

## Round-1 problems: status
| # (R1) | Problem | Status | Evidence |
|---|---|---|---|
| 1 | No start or finish | **Fixed.** There is a start gate "CORN & PUMPKINS / GO! GO! GO!" with bunting, bale rows and spectators. The finish has an arch, a chequered line, bale stands with a crowd, and lanterns at dusk and night. | `race_start_chase`, `eye_start_gate`, `eye_finish_arch`, `finish_chase_approach`, `night_chase_3205` |
| 2 | Chase camera inside the corn | **Mostly fixed in the lane.** The cart is visible in all 10 chase shots. It is **broken when the cart leaves the lane**: the camera stays clamped at the lane edge and loses the cart. Bay corners also fill half the frame. | `chase_*`; but `drive_pumpR14_t1.5_s353_chase` (no cart in frame), `drive_bay_t2.0_s1838_chase` |
| 3 | Clearings hidden behind a bank | **Fixed for pumpkin, hay and gap zones.** **Not fixed for the two barn yards**, which keep the full bank by design: from the lane you see only a roof line. | `lane_cockpit_1200`, `_1650`, `_2850`, `eye_gap_0220`; still hidden: `lane_cockpit_0750`, `chase_2020`, `far_2020` |
| 4 | Fence rails across the lane | **Fixed.** The rails now follow the lane. | `drive_pumpR_t2.0_s346_chase`, `aerial_0365_pumpkin` |
| 5 | Corn reads as lawn from above | **Fixed from aerials**, where the rows are striped and read as a corn field. **Partly fixed in the far camera**: the canopy edge beside the lane is a smooth rounded hedge with yellow polka dots, and the tassel cards are sparse. The close wall face is still a big flat streaked plane. | `aerial_0560_bay`, `aerial_1215_pumpkin` vs `far_0300`, `far_2650`, `drive_steerL_t2.5_s598_cockpit` |
| 6 | Repetition | **Much better.** New: 10 view gaps (tractor, wagon, bales, pipe), 5 sunflower patches, signs, and taller/shorter wall stretches. 9 of the 22 cockpit frames still look the same, though up from 15. The two tractor gaps use the same green tractor. | `lane_cockpit_0600`, `_2550`, `eye_gap_0220`, `eye_gap_1415`, `sheet` frames 0150/0300/2100/2700/3000 |
| 7 | Crows invisible | **Partly fixed.** The crows are black and bigger, they sit on posts and the gate, and AI carts now scatter them too. From the lane, a flock is still 3–6 small specks for about one second. | `birds_f800_01`, `birds_f800_02`, `lane_cockpit_1200`, `birds_f1130_02` |
| 8 | Potato-like pumpkins | **Fixed enough.** They are orange and ribbed with stems and leaves. They are low-poly and some are pale yellow-green. | `drive_pumpRel14_t2.0_s358_chase`, `far_2470` |
| 9 | Pull to the verge and cart roll | **Not fixed.** With no steering, the cart reached lat −0.93 at s=190 and −2.3 at s=235, then rode the corn bank for 100 m at upY 0.88–0.91 (25–28° of roll). The same happened in both crow drives. | `drive-log`; `drive_straight_t8.0_s277_*`, `birds_f1130_01…04` |
| 10 | Dusk murk, nothing lit at night | **Night fixed** (lanterns at the barns and finish, stars). **Dusk not fixed**: the corridor is a flat maroon and the lane is hard to read in cockpit. | `night_chase_0780`, `night_chase_3205`; `dusk_cockpit_0300`, `dusk_cockpit_1215` |

## What works (max 3 bullets)
- The map now has a beginning and an end. The start gate with bunting, bale rows and spectators, and the finish arch with packed bale stands, both make the race feel like an event. At night their lanterns glow (`race_start_chase.jpg`, `eye_finish_arch.jpg`, `finish_chase_approach.jpg`, `night_chase_3205.jpg`).
- The corridor has things to look at. You get a pumpkin patch with a scarecrow and crows, sunflowers, a tractor in a cut gap, an irrigation pipe and hay yards, and the rows read as a real corn field from above (`lane_cockpit_1200.jpg`, `lane_cockpit_0600.jpg`, `eye_gap_0220.jpg`, `aerial_0636_sunflower.jpg`, `aerial_1215_pumpkin.jpg`).
- In the lane, the chase and far cameras now keep the cart in view on every bend I sampled. In my drives, steering full lock into the corn never put a camera inside the wall (`chase_0300`…`chase_3150`, `drive_steerR_t2.5_s512_chase.jpg`).

## Problems (ranked, most severe first; each: what / where (s metres, street) / evidence file / why it matters)
1. **The cart rides the corn bank at 25–30° of roll whenever you don't steer precisely, and nearly flips on hard steering.**
   - Paddling straight from s=150, the cart is on the corn surface by s=235 and stays there for about 100 m with upY ≈ 0.9 (`drive_straight_t8.0_s277_cockpit.jpg`).
   - Full lock left at s=596 rolled it to upY 0.40 (66°): the cockpit is mostly the corn wall and sky, and speed fell from 9 to 2.5 m/s. It crawled at 1–4 m/s for the next 10 s (`drive_steerL_t1.5_s596_cockpit.jpg`).
   - In the s=1850 bay it reached upY 0.21 (`drive_bay_t2.0_s1838_*`). A 10 m/s steer into the pumpkin-sign corner reached upY 0.35 (`drive_pumpR_t1.0_s332_cockpit.jpg`).
   - Where: everywhere, worst at s 190–300, 590–610 and the bay ramps.
   - Why it matters: this is the normal state for a child on a 3.5 m lane. A tilted horizon and a near-flip are the main thing they will feel on this map.
2. **The pumpkin patch is a containment hole: the fence and pumpkins do not stop the cart.**
   - Full lock right at 13 m/s at s=330 carried the cart through the fence line to **lateral 27 m**, deep into the patch.
   - Pumpkins pass through the cart body (`drive_pumpR14_t1.5_s353_cockpit.jpg`, `drive_pumpR14_t3.5_s356_cockpit.jpg`).
   - It sat there until the stuck rescue about 11 s later (respawn 1 in the log).
   - Round 1's corn critic measured at most 3 m here; the fixer's own note in requests.md says 9 m.
   - Where: s 330–405 R; the same pumpkin and hay layout is at 1180–1250 R, 1620–1700 L, 2430–2505 L and 2820–2890 R. I only tested s=340.
   - Why it matters: kids will steer into the pumpkins on purpose. The result is a solid-looking fence that is not solid, followed by an 11 s wait.
3. **The camera loses the cart when the cart leaves the lane.**
   - With the cart at lat 9–27 m in the patch, the chase camera stays clamped near the lane edge, looking along the lane. The frame shows only fence and pumpkins, with no cart (`drive_pumpR14_t1.5_s353_chase.jpg`, `drive_pumpR14_t3.5_s356_chase.jpg`).
   - In the bays the clamp parks the camera inside the corner where the wall steps in. A torn, jagged canopy edge then fills half the frame (`drive_bay_t2.0_s1838_chase.jpg`, `drive_relR_t2.5_s560_chase.jpg`).
   - The far camera at the 2650 bay sits in the canopy, and a leaf card covers 40 % of the frame (`far_2650.jpg`).
   - Where: the clearings, and the bays at 560, 1850 and 2650.
   - Why it matters: losing the cart on screen is the worst camera failure for a child.
4. **Signs sit inside the line a bank-riding cart takes.**
   - At s=469 the cart, riding at lat 2.6, drove into the "FRESH CORN" sign: its posts fill the cockpit (`drive_steerR_t1.5_s469_cockpit.jpg`).
   - At s=332 the cart climbed the "PUMPKINS" sign corner and rolled to upY 0.35 (`drive_pumpR_t1.0_s332_cockpit.jpg`).
   - Where: the signs at hw+0.9 (gap, pumpkin and bay signs).
   - Why it matters: problem 1 makes lat ≈ 2.5 m the usual line, so these become hidden obstacles.
5. **The passing bays don't read as bays.**
   - At eye height, a bay is just a slightly wider lane. The two small blue "PASSING BAY" boards are about 0.5 m tall and the dirt colour does not change (`eye_bay_0560_entry.jpg`, `eye_bay_1850_entry.jpg`, `chase_2650.jpg`).
   - The ramp ends are diagonal wall slabs that the camera clips (see 3).
   - Where: s 542–578, 1022–1058, 1832–1868, 2632–2668.
   - Why it matters: the bays are the overtaking mechanic, and the player cannot see where to try a pass.
6. **The corn wall face is still a flat painted board up close, and the far-camera canopy reads as a hedge.**
   - Close up, the face shows long vertical streaks and blurry diagonal leaves on one plane, with no depth (`drive_steerL_t2.5_s598_cockpit.jpg`, `birds_f800_09_s960.jpg`, `lane_cockpit_0450.jpg`).
   - From the far camera, the canopy beside the lane is a rounded mossy roll with yellow dots, plus a few tassel cards (`far_0300.jpg`, `far_0560.jpg`).
   - Where: whole map.
   - Why it matters: this is the map's identity and the most-seen surface.
7. **The barn yards are still hidden behind the full 1.9 m bank.**
   - At 720–840 L you see a roof line over a dark bank (`lane_cockpit_0750.jpg`).
   - At 1960–2080 R the barn and silo are invisible from the lane; chase and far show a lamp post on a bank (`chase_2020.jpg`, `far_2020.jpg`). The aerial shows the farm is there (`aerial_2020_farm.jpg`).
   - Why it matters: these are the two biggest set pieces, and the driver never sees them.
8. **Dusk is still murky.**
   - The lane, the walls and the bank are all dark maroon, and the lane edge is hard to read in cockpit (`dusk_cockpit_0300.jpg`, `dusk_cockpit_1215.jpg`, `dusk_chase_2650.jpg`).
   - Night is better than dusk (`night_cockpit_0300.jpg`).
9. **Minor polish items.**
   - The start and finish hay bales are untextured flat yellow boxes. Viewed head-on they read as yellow walls (`eye_start_gate.jpg`, `race_start_far.jpg`).
   - The same green tractor appears in the 220 and 1415 gaps (`eye_gap_0220.jpg`, `eye_gap_1415.jpg`).
   - The crows are still specks from the lane; you only notice them as 2–4 silhouettes rising (`birds_f800_02_s791.jpg`).
   - Mud splatter decals are lit too brightly at night: tan blobs on a dark screen (`night_cockpit_2020.jpg`).
   - The finish banner is small for a 3-minute payoff (`finish_cockpit_approach.jpg`).

## Fix list (concrete, actionable, ordered; name files/functions where you can)
1. **Keep the cart off the bank.** In `corn.js` `verge`, make the first 1.4 m outside the lane a steeper, shorter "kerb": raise `hFoot` from 0.56 to about 0.8 over 0.6 m, and keep `foot` to a narrower band. That way the cart bumps back instead of riding up the 0.4 m/m foot ramp at 25°.
   - Increase the lane's dish (`terrainOpts.crown` from −0.07 to about −0.15) so a cart that isn't steering re-centres.
   - Gameplay fixer: add a roll-limiting righting torque on `corn` surfaces in `src/core/physics.js`. Damp roll above 20° when `surface === 'corn'`.
   - Re-run the straight-paddle test: |lat| should stay ≤ hw + 0.5 and upY ≥ 0.95 over 300 m.
2. **Make the clearing edges hold.** In `corn.js`, register the pumpkin-patch and hay-yard fence as a physics barrier: a continuous `reg` wall or verge lip along `hw + 1.6`. Another option is to keep a 0.9 m lip in `verge` for `pumpkin`/`hay` kinds instead of `lerp(…, 0.4, ow)`, so the field is visible over the lip but not reachable.
   - Make the pumpkins solid, or at least slowing (use the registered circles in the obstacle/surface lookup as `type: 'bush'`).
   - Target: 14 m/s full lock at 340, 1215, 1660, 2470 and 2855 gives |lat| ≤ 4 m.
3. **Camera clamp (gameplay fixer, `src/main.js` `camClamp` and `src/core/camera.js`).** Clamp to `max(hw + 0.9, |cartLat| + 1.5)` so the camera follows a cart that has left the lane. Where the wall steps in or out (bays, gap ends), clamp to the *narrower* of the half-widths at the camera's s and at the cart's s.
   - For the far view, also keep the camera height ≥ canopy top + 1.5 m, or ≤ 0.6 × `CORN_H` inside the corridor, so it never sits in the canopy sheet.
4. **Move every lane-side sign** (`sign(...)` calls for gap, pumpkin, bay and road signs) from `lat 0.9` to the top of the bank or into the clearing (`hw + 2.5…3`). Alternatively, make them break-away and non-colliding, with the posts out of the 0–2.6 m band.
5. **Make the passing bays visible.**
   - Use lighter, gravelly dirt in the bay (in `theme.roadColor`, lerp toward tan by `bayW(s)`) and a painted or straw dashed centre line.
   - Add a big "PASSING BAY →" arrow board 40 m before each bay, on the bank top.
   - Put bale stacks or a mown stubble strip at both ends so the widening reads from 60 m out.
   - Round the corn-wall step at the bay ramps: taper the `openAt`/`fl` change over the full 14 m ramp, not as a diagonal slab.
6. **Corn wall depth.** Add a second instanced row of stalk cards 0.5–0.8 m behind the face. Shrink the vertical stretch of the `cornwall` texture (tile it 2–3× vertically) and break the face plane with ±0.3 m lateral noise every 2–3 m.
   - For the far view, replace the smooth rounded canopy roll near the lane with a jagged top edge of leaf and tassel cards every 1–1.5 m for the first 6–8 m from the lane.
7. **Barn yards.** Lower the bank in front of the farmyard (keep it high only at the yard's ends). Put a split-rail fence and gate on the lip so the barn, silo and windmill are visible over it, and register the fence posts as the barrier.
8. **Dusk:** add a corn-only dusk tweak. Lift the lane albedo by about 25 % and add a warm rim or ambient boost on the walls so lane and wall separate. Add 1–2 lanterns per pumpkin patch.
9. **Polish.**
   - Give the hay bales a straw texture or bevel and twine bands, and vary their size.
   - Tint the second tractor red or swap it for a combine.
   - Scale the crows up another 1.5× and have one flock per patch take off right over the lane.
   - Make the finish banner 2× bigger, and add a second banner 40 m before the line ("FINISH 40 m").
   - Make the post splatter material respect night lighting.
