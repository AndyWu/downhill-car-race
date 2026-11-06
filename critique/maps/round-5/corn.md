# CORN CRITIQUE — MAP ROUND 5
**Score:** 8 / 10   (rounds 1-4: 5, 6.5, 7, 7.5)

**Setup.** `feat/tracks` @ 88fe5fc, own build served on :4572, `?track=corn&q=medium`, 640x360, real physics through `setDebugInput`. The machine was heavily loaded, so I ran a reduced matrix. Every shot cited was looked at. Evidence (`screens/corn/`):
- 40 s straight paddling from s=150 (`drive-straight.json`).
- Full lock for 3 s then 3 s released at s 600 (14 m/s both sides, 10 m/s R), 328 (pumpkin patch), 1770 (gap), 1195 (patch) and 1990 (barn yard) (`drive-q.json`).
- Chase/far cameras at s 340, 644, 689, 1360, 2650, 3070.
- Bay ramp corners at 560 and 1040, and bay approaches (`bayapp_*`, `eye6_*`).
- Night and dusk at 780, 1850, 2020.

Not repeated (round-4 results stand): bay corners at 1850 and 2650, barn yards at 780 and 1660, pumpkin patch at 2470, dedicated side-camera runs. No exceptions or rescues occurred in any run.

## Claims verified
| Claim | Verdict | Evidence |
|---|---|---|
| Night moon fill, lantern glow halved | **Verified.** The lane, cart and corn wall edge are all readable, with stars and a visible barn. Halos are small. This was the worst problem last round. | `night_chase_0780`, `night_cockpit_0780`, `night_chase_1850` |
| Bigger "PASSING BAY >>" board, 40 m board, straw line from 30 m, bale stacks | **Verified.** From 56-66 m before the ramp the yellow boards, bale stacks and centre line read clearly from the chase camera. | `bayapp_560_66_chase`, `bayapp_560_56_chase`, `eye6_bay560_a`, `eye6_bay1850_b` |
| Lighter wet-brown puddles | **Not convincing.** The splatter and puddle blobs are still near-black on the lane and on the dusk red lane. | `chase_0644`, `far_0644`, `dusk_chase_2020` |
| Pale tassel spikes on the first ~7 m of canopy | **Verified, modest.** Yellow spikes now break up the far-camera canopy. The surface is still soft rolls with stripes, but it reads as a crop. | `far_1360`, `far_2650`, `baycorner_560_L_s568_lat-1.93_far` |
| Wall rub swings the nose back ~4°/s | **Partly.** See metrics below. Hits are kinder, but a paddler is not re-centred. | `drive-straight.json` |
| Side camera clamp / weaker AI | Not specifically driven. Chase and far cameras kept the cart visible in every shot, including the 600 and 1040 bay corners. | `baycorner_1040_L_s1043_lat-4.3_chase`, `drive_lock_600_14_R_t2.0_s652_chase` |

**Metrics.**
- **Straight paddling, 40 s:** 37 of 80 samples (46 %) were outside the lane edge (27 + 10), against 38/80 in round 4. This is not improved. Max lat was 2.9 and 3.4 m (hw 1.7), and min upY 0.93-0.95 (roll about 18-21 degrees). The cart reaches the wall foot at s~200, drifts across at s~360 and rides the foot again, and it re-centres only occasionally. Speed stayed at 8-13 m/s with no rescues, and the camera copes (`drive_straight_t5.0_s209_chase`, `drive_straight_t12.0_s324_chase`).
- **Full lock, 14 m/s, 3 s:** excursion 0.9-1.55 m, roll 19-21 degrees, 0 rescues. Retained speed was 5.7-7.1 m/s (round 4: 5.3-7.1).
- **Full lock, 10 m/s at s 600:** 6.2 m/s (round 4: 4.55), a real gain. It is still below the claimed 8.5, but that is a 3 s continuous-lock test, which is harsher than a normal hit.
- **Recovery after release:** in-lane with upY above 0.95 within 1.5 s in 3 of 6 runs. The other 3 had not recovered within 3 s, but they carry speed.

## What works (max 3 bullets)
- **Night is now playable and pretty.** There is a moonlit lane, a readable cart, small lantern glows and a visible starry sky. The scene is no longer a black hole.
- **Passing bays announce themselves.** There are large yellow boards on posts, bale stacks and a straw centre line from 60+ m out. It is obvious something is coming, which was missing in round 4.
- **Containment, camera and corn look are solid.** The cart is always visible, there are no rescues, and the wall hits keep 6-7 m/s. The corn has layered stalks, leaves, tassels and sunflowers, and the pumpkin patch and barn yards read well.

## Problems (ranked, most severe first)
1. **An unsteered cart still spends about half the time up on the wall foot, tilted ~20 degrees** (37/80 outside the lane edge, `drive-straight.json`). The ~4°/s nose swing is not enough to re-centre a paddler. It is harmless (no rescue, camera fine, speed fine), but a child who does not steer sees a tilted horizon for most of the straights (`drive_straight_t12.0_s324_chase` is a good frame; `chase_0644` shows the tilt).
2. **Puddles and mud splats are still near-black blobs** (`chase_0644`, `far_0644`). They sit on the lane like holes. At dusk they are black on red (`dusk_chase_2020`). The wet-brown fix did not land on the splat/overlay path, or it was drawn too dark by the scene light.
3. **Far-camera canopy is still soft green rolls** with stripe shading and sparse tassel spikes (`far_2650`). No per-plant silhouette from above, only the first few metres are broken up.
4. **Bay approach from the chase camera is only legible 56 m+ out.** Within ~20 m the board is edge-on and then overhead (`bayentry_560_chase` shows only the straw strip). This is fine functionally. It is a nit.
5. **Retained speed after a sustained wall ride is 5.7-7 m/s,** below the 8.5 claim. Minor.

## Fix list
1. `src/core/physics.js` corn rubbing block: strengthen the re-centre. For example, raise the `0.07*h` yaw push, or apply a small lateral acceleration toward the lane centre while `cornN > 0`. The target is 70 % or more of paddling samples in lane (`drive3.mjs straight`).
2. Puddles/mud (`corn.js` puddle material and `graphics/splatter.js`): use an opaque wet-brown (about #6b4a2e) with a pale highlight, and avoid multiply-dark blending.
3. Far camera: add a lighter top stripe or per-plant leaf cards on the canopy top for views above 5 m.
