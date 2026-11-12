# CORN CRITIQUE — MAP ROUND 6
**Score:** 7 / 10   (round 5: 8; the visual fixes landed, but the physics change regressed wall-hit handling)

**Setup.** `feat/tracks` @ 30ad13b, own build on :4592 (stopped), `?track=corn&q=medium`, 640x360, real physics via `setDebugInput`. The machine was very loaded (load 12-17), so the bay-corner matrix was cut short (560 L and R and 1040 R done) and dusk/night were sampled at 780/1850/2020. Scripts are in the scratchpad `r6c-corn/`. Every cited shot was looked at. Evidence is in `screens/corn/`.

## Claims verified
| Claim | Verdict | Evidence |
|---|---|---|
| Lens mud drops wet brown with sheen | **Verified.** Day drops are brown with pale highlights. Dusk drops are pale grey-brown. No near-black blobs (round-5 problem 2 is fixed). The dark patch under the cart in `chase_0644` is the cart shadow. | `mud_day_122_5`, `mud_dusk_122_5`, `dusk_chase_2020` |
| Denser ragged canopy edge | **Verified, modest.** Leaf and tassel cards break the rim from the chase and far cameras. The surface is still soft rolls, but the silhouette reads as plants. The cut-out leaf cards look dithered or pixelated when large (`drive_lock_600_14_R_rel_t1.0_s681_chase`). | `far_1360`, `far_2650`, `baycorner_560_R_s572_lat0.96_far` |
| Stronger re-centring nudge | **Partly.** Straight paddling is in lane more often, but see the regressions below. | `drive-straight.json` |
| Wedge rescue ~3.5 s | **Works, but too eager.** It fires in ordinary full-lock tests (see below). | `drive-q.json` |
| Cameras | Chase and far kept the cart visible in every shot, including the 560 bay exit and wall-hug frames. No camera problems. | `far_1360`, `drive_lock_600_14_R_t2.0_s653_chase`, `baycorner_560_R_s572_lat0.96_chase` |
| Night / dusk | Unchanged from round 5 and fine. The lane, cart and straw line are readable, and there are stars. | `night_chase_0780`, `night_chase_1850`, `dusk_chase_2020` |

## Metrics
- **Straight paddling, 2 x 20 s from s=150 (`drive-straight.json`):** 27 of 80 samples outside the lane edge (round 5: 37/80, so 66 % in lane against 54 %). This is a real gain, but short of the 70 % target. Max lat was 3.05 m (hw 1.7). Min upY was 0.886-0.94. Of the 80 samples, 53 were in lane.
- **Rescue in straight paddling:** 1 rescue in 40 s. At s~654-683 the cart crossed from -2.2 m to +2.7 m in about 1.5 s, hit the corn at 13 m/s, bled to 3 m/s, and was lifted to lat 0 at v 0.6. It then took ~6 s to get back to 10 m/s. Round 5 had no rescue and kept 8-13 m/s.
- **Full lock 3 s then 3 s released, speed kept (`drive-q.json`, round 5 in brackets):**

| Test | Retained at release | Rescue |
|---|---|---|
| 600 @ 14 R | 1.68 m/s (5.7-7.1) | yes |
| 600 @ 14 L | 1.14 | yes |
| 600 @ 10 R | 1.03 (6.2) | yes |
| 328 @ 14 R | 1.5 | yes (x2) |
| 1770 @ 14 R | 0.07 | yes (x2) |
| 1195 @ 14 R | 7.5 | yes |
| 1990 @ 14 R | 6.5 | yes |

The cumulative respawn counter went 0 to 9 over 7 tests, against 0 in round 5. A 3 s hold into the wall is a harsh test and a rescue is arguably right for a truly wedged cart. But speed is no longer "kept" in 5 of 7 runs.
- **Brief hit (steer into the wall 0.6 s, then let go, from 12 m/s):** fine. Speed dipped to 8.8 and recovered to 13 m/s, with no rescue. Max yaw rate was 97 deg/s, during the impact. The nudge then walks the cart back across the lane over ~4 s, and it overshoots to -1.9 m. This is acceptable and not jerky. Nose-in at 600 and 2.3 m lateral the cart is held against the foot for ~2 s (`nudge_brief_after`).
- **Player actively steering out of the wall (1 s into the wall, then a +-0.6 corrector toward the centre, 8 s):** poor. The cart was thrown wall to wall (lat +2.8 to -2.4 in ~0.5 s several times), yaw rates were 200-770 deg/s, and speed fell to 0.2-6 m/s. Two rescues fired in 8 s. My bang-bang corrector is cruder than a real child's steering, and I could not separate how much comes from the ~11 deg/s nudge (3x stronger) and how much from the wall response. But a player who tries to correct is clearly not helped. The 11 deg/s push plus the 2.4x align term acts against steering inputs and produces sudden heading flips. The impression is jerky and fights the player when they correct late.

## What works (max 3 bullets)
- **The two requested visual fixes landed.** Lens mud is brown with a sheen at day and dusk, and the canopy edge now has leaf and tassel silhouettes from the far camera.
- **A hands-off paddler stays in lane more** (66 % against 54 %), with a good camera, and a brief brush with the corn is forgiving (8.8 m/s min, no rescue).
- **Look, night and bays are unchanged and solid.** The cart stays visible, the night lane is readable, the sunflowers, pumpkins and farm are good, and the bay approach reads as before.

## Problems (ranked, most severe first)
1. **Sustained wall contact now loses almost all speed and triggers a rescue.** In 5 of 7 full-lock tests the retained speed was 0.07-1.7 m/s (round 5: 5.7-7.1). Eight of the nine rescues came from this test set. Evidence: `drive-q.json` and `drive_lock_600_14_R_rel_t1.0_s681_chase`. In a race a child who holds steer into the corn gets teleported and loses 5+ s. The `_rub` and `inCorn` pin rules (physics.js ~L408-430) count any 0-2.5 m/s creep or <9.5 m/s rub as wedged.
2. **Steering against the wall is chaotic.** A corrector steer gives wall-to-wall thrashing at 200-770 deg/s yaw, two rescues in 8 s (`nudge.out`: "player_steers_away_in_corn"). The nudge and the player's steering are not blended, so the cart can flip heading inside a single frame at 0.1 s steps.
3. **Straight paddling still has one violent oscillation at s~620-680.** The nudge swings the cart from the left wall to the right wall at speed, then hits at 13 m/s and rescues (see Metrics). In-lane is 66 %, below the 70 % target.
4. **Far canopy is still soft rolls** with sparse silhouettes and shading stripes (`far_2650`). It is better, but the dithered cut-out leaf cards look pixelated up close (`drive_lock_600_14_R_rel_t1.0_s681_chase`).
5. **Not exercised, so no claim made:** bay corners 1040/1850/2650, side camera, mud at night. The round-5 results stand for those.

## Fix list
1. `src/core/physics.js` corn rubbing block (~L219-231): ramp the nudge by contact depth and steer input. Skip or halve the `0.2*h` yaw term when the player's steer is non-zero or already turning away from the wall, and clamp its per-step yaw change (e.g. <= 60 deg/s total) so a corrector input is not overridden.
2. Same file, rescue rules (~L408-430): do not rescue while the cart is moving at >1.5 m/s in the corn and still gaining speed. Count `_rub` only with a low, non-increasing speed, and raise the rub window from 6 s to ~8 s. Keep the 3.5 s wedge rescue only for speed <1 m/s.
3. Target numbers for the recheck: full lock at 14 m/s, 3 s, retained speed of 5 m/s or more and at most 1 rescue in 7 runs, and a paddler 70 % or more in lane with 0 rescues in 40 s.
4. `corn.js` canopy cards: use smoother alpha (not dither) on large leaf cards near the lane, or fade them by distance.
