# CORN CRITIQUE — MAP ROUND 4
**Score:** 7.5 / 10   (round 1: 5, round 2: 6.5, round 3: 7)

**Setup.** `feat/tracks` @ e7d038a. I built to my own scratch dir, served it on :4552 and loaded `?track=corn&q=medium` at 640x360. The machine was heavily loaded by other agents, so I ran a reduced drive matrix. All drives used `setDebugInput` and the real physics. Evidence is in `critique/maps/round-4/screens/corn/`. The raw data is `drive-straight.json` and `drive-quick.txt`. I looked at every shot I cite.
- 40 s straight paddling from s=150.
- Full lock for 3 s at 14 m/s, then 3 s released: s 600 (both sides), 2100, the s 340 pumpkin patch, the s 1780 gap, the s 1215 patch and the s 2020 barn yard. I also ran 10 m/s at s 600.
- Chase and far cameras at s 340, 644, 689, 1360, 1850, 2650 and 3070.
- Bay approaches and bay ramp corners at 560, 1040, 1850 and 2650.
- Night chase and cockpit at 780, 1850 and 2020.

I did not repeat s 1500 and 2700, the 10 m/s runs other than s 600, the barn yards at 780 and 1660, the pumpkin patch at 2470, the dusk views or the race-start views. The round-3 results for those stay as they were.

## Round-3 problems: status
| # | Problem | Status | Evidence |
|---|---|---|---|
| 1 | Chase camera inside the corn, cart invisible | **Fixed.** On every wall-hugging shot the cart is visible, the camera is lifted and the corn is on one side only. I checked the s 644 and s 689 spots, all bay ramp corners, and the 40 s straight drive. The far camera at s 644, 1360, 2650 and 3070 also keeps the cart in view. | `drive_lock_600_14_R_t2.0_s652_chase`, `drive_lock_600_14_L_rel_t1.0_s667_chase`, `baycorner_1040_L_s1044_lat-4.45_chase`, `baycorner_1850_L_s1858_lat-4.18_far`, `drive_straight_t19.0_s430_chase`, `far_0644`, `far_2650` |
| 2 | Wall stops the cart dead; double rescues | **Mostly fixed.** 0 rescues in all 8 runs. Containment was 0.95–1.6 m past the edge. Roll was 19–22 degrees. After 3 s of continuous full lock at 14 m/s the cart still carries 5.3–7.1 m/s, against 0.1–2.6 m/s in round 3. 10 m/s lock at s 600 ended at 4.55 m/s. That is acceptable but short of the "keeps at least 8.5 m/s" claim. I measured at 3 s of sustained lock, which is harsher than a single hit. | `drive-quick.txt`, `drive_pump_340_*`, `drive_gap_1780_14_R_*` |
| 3 | Unsteered cart drifts onto the wall foot | **Not fixed.** 40 s of straight paddling: 38 of 80 samples were outside the lane edge, against 44 of 80 in round 3. Max lat was 3.1 and 2.8, with hw 1.7–1.9. Tilt was 16–22 degrees, with upY 0.92–0.95. Speed stays at 8.5–11 m/s and the cart gets back to the centre on its own from time to time (s 286–353). It never gets stuck. The camera now copes with it. | `drive-straight.json`, `drive_straight_t5.0_s210_chase`, `drive_straight_t19.0_s430_chase` |
| 4 | Corn look | **Much improved.** The canopy now has a ragged top with leaf and tassel cards. The polka dots are gone. The wall face has a second stalk row and reads as dark corn, and the cockpit leaf fade works (`drive_lock_600_14_R_t2.0_s652_cockpit` shows clean leaves, not giant cards). The sunflowers are now round-stemmed with leaves and read well. From the far camera the wall top is still soft, rounded rolls with a yellow-green stripe pattern. The far-camera "hedge" feel is reduced but still present. | `far_0644`, `far_1360`, `far_3070`, `drive_lock_600_14_L_t1.0_s613_chase` |
| 5 | Bays don't read from the approach | **Partly fixed.** The centre line is bolder (a visible straw strip from 44 m out), but from the chase camera the bay is still not obvious. The entry shots show only the strip plus the usual lane. The big "PASSING BAY >>" board is not visible in any entry shot (`bayentry_560/1040/2650_chase`). The ramp corners are acceptable now that the camera copes. | `bayentry_560_chase`, `bayentry_2650_chase`, `baycorner_560_L_after_s611_lat-2.5_chase` |
| 6 | Mud | **Mostly fixed.** The splatter drops are smaller and the glowing tan blobs at night are gone (`night_cockpit_2020`, `night_chase_2020`). The lane puddles are still near-black shadow patches, not brown (`chase_0644`, `chase_0689`, `baycorner_560_L_after_s611_lat-2.5_chase`). Droplet rings still float around the cart (`night_cockpit_1850`). | as listed |
| 7 | Polish | **Round bales and sunflowers fixed.** The night lantern halos are still big (`night_cockpit_0780`, `night_cockpit_2020`). | `night_cockpit_0780` |

## What works (max 3 bullets)
- **The camera is solid.** The cart is visible in every chase and far shot I took, including full-lock wall rides, bay ramp corners and unsteered drives. The wall-riding problem was the single worst issue last round and it is gone.
- **Containment and wall response are now friendly.** There were no rescues in 8 hard hits at 14 m/s, 0.95–1.6 m maximum excursion, 19–22 degrees of roll and 5–7 m/s retained. The cart slides along the corn instead of stopping.
- **The corn now looks like corn up close.** There is a layered stalk face, ragged leaves, tassels, round-stem sunflowers and a pumpkin patch behind a rail fence. The lane stays readable from the chase camera.

## Problems (ranked, most severe first)
1. **Night is too dark to play.** `night_chase_1850` and `night_chase_2020` show a near-black lane with an almost invisible cart. The wall edge and lane edge are barely distinguishable. The lantern halos are the only bright things and they are huge (`night_cockpit_0780`, `night_cockpit_2020`). The fix removed the glowing mud, but the whole night scene is now dim. Add a lane or cart fill light and shrink the halos.
2. **An unsteered cart still spends about half of the time on the wall foot** (38 of 80 samples outside the lane edge, tilted 16–22 degrees, `drive-straight.json`). It is now harmless for the camera, but a child who doesn't steer sees a tilted horizon most of the race. The corn fixer's note says this needs a yaw push in `physics.js` while the cart is on a `wall` surface.
3. **Bays are still not obvious on approach.** From 44 m out the chase camera shows only a pale straw strip at the bottom of the screen. The "PASSING BAY" board is not visible (`bayentry_*`). Raise the board above the bank, or put bale stacks at the bay's start.
4. **Speed after a sustained wall hit is lower than claimed** (5.3–7.1 m/s at 14 m/s, 4.55 at 10 m/s). It feels fine but is not the 8.5 m/s the fixers claim. A harsh test at 3 s of continuous full lock.
5. **Lane puddles are still black patches and the far-camera canopy is still soft rolls.** The puddles read as holes or shadows (`chase_0644`, `chase_0689`). The far-camera canopy has no per-plant silhouette (`far_1360`, `far_2650`).
6. **Minor:** droplet rings float around the cart (`night_cockpit_1850`). The lantern halo size is unchanged.

## Fix list
1. Night: raise the ambient/fill light on the corn lane (`corn.js` night lighting, or a headlamp-style spot on the cart in `main.js`), and cut `glowMat.size` roughly in half.
2. `src/core/physics.js` wallN block: while on a `wall` surface, rotate the heading about 3 degrees per second away from the wall and cap the tangential loss at 30 % per hit. This lifts the straight-paddle in-lane share above 80 %.
3. Bays (`corn.js`): put the "PASSING BAY >>" board on top of the bank at about 2.5 m, start the straw centre line 30 m before the ramp, and add bale stacks at the ramp start.
4. Puddles (`corn.js` and `materials.js`): change the colour to wet brown with a sheen, not near-black.
5. Far-camera canopy: break up the soft rolls with taller tassel or leaf cards every 1–1.5 m along the first 6–8 m of canopy, and add a lighter stripe.
