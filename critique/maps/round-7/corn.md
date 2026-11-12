# CORN CRITIQUE — MAP ROUND 7
**Score:** 7 / 10 (round 6: 8 on 17b24c2). Visuals unchanged and still good; the grid fix works; the round-6 wall-contact and rescue complaints are only partly fixed.

**Setup.** `feat/tracks` HEAD 1f3d4e7, `npx vite --port 4611` (stopped afterwards), `?autostart=1&track=corn&q=medium`, 640x360 / 800x450, swiftshader, real physics through `__game.setDebugInput` / `teleport` / `advance`. Track length 3218 m. Evidence in `screens/corn/` (`lock.json`, grid, launch, run, finish shots). Every cited shot was looked at.

## Re-test of the round-6 complaints
| Complaint | Result in round 7 |
|---|---|
| Starting grid look / collisions | **Fixed.** Slots are staggered single file (s step 2.7 m, d = ±0.7), player in slot 5 of 10 at s=2.7, rear car at s=-10.8, front car 13.5. No collision or spin in the first 8 s (0 respawns, nobody below 2.2 m/s). The two columns are 1.4 m apart and the grid reads as a clean zig-zag queue from the far camera (`grid_far.jpg`) and the cockpit (`grid_cd_view0.jpg`). Pack stays strung out (rear four at 3-6 m/s at t=5 s, front at 6-8). Nit: the back of the grid is 24 m behind the front, so slots 8-10 start already out of sight of the banner. |
| Full-lock wall hits keep speed | **Still mixed.** 3 s full lock, 3 s released (`lock.json`). Retained at release: 600 @14 R 6.0; 1195 R 9.3; 1770 R 9.8; 1990 R 7.5; 2100 R 8.2 (all fine). But 600 @14 L 0.9, 600 @10 R 0.9, 328 @14 R 0.7 and 965 @12 L 0.8 m/s: nose-in stops at the bay corners (s 328, 600, 965), recovering only to 4.3-5.5 m/s after 3 s. 4 of 9 runs near-stop, round 6 retest 0 of 7 (but that retest used other, easier spots; the physics fix to rescue did not touch the wall response). No rescue fired in any of the 9 (round 6: 0 as well). |
| Wedge-and-hold rescue time | **Better only for a truly stopped cart; scraping carts are never rescued.** Hold full lock without paddling: rescued at 8.75 s (s1448) and 11.25 s (s965), but the cart only came to rest at ~7 s and ~9 s, so ~1.5-2.3 s after standing still. Hold full lock WITH paddling at s328 (nose-in, crawling 0.7-2.3 m/s): rescued at 7.5 s. Hold full lock with paddling on a straight/bend (600, 965, 1448, 1931, 2574): NEVER rescued in 14 s; the cart rubs the wall at 4-6 m/s and creeps forward (s +100 m in 14 s), so the progress rule never trips. The advertised ~4 s is seen only after the cart has stopped, not from first contact. |
| Whole-run driving | A PD lane-centring bot with constant paddling (a stand-in for a careful child) ran 420 s without a rescue and without a stuck, covering 3071 of 3218 m, average ~7.3 m/s, last of 10 all race, 198 of 1472 samples (13 %) beyond the lane edge, min speed 0.2 m/s once. A cruder P-only bot had 5 rescues in the first 811 m. So the lane is forgiving only for a controlled driver; a twitchy one gets rescued a lot. |

## What works (max 3 bullets)
- **Look is still the best of the three maps.** Rich cornfield walls with leaf cards and sunflowers, hay-bale foot, bunting arch, crowd and marshals at the finish, readable red-brown lane with a visible wall-foot band (`run_good_610.jpg`, `run_good_1700.jpg`, `finish_approach.jpg`).
- **The start grid is now a proper queue.** No fusing or early pile-up, player in the middle of the pack, good camera angle on the grid (`grid_far.jpg`).
- **Rescue is gentle and does not misfire.** 0 rescues across 9 full-lock runs and 420 s of paddling; the cart is only lifted once it has truly stopped, and the finish line and results panel work (`finish_end.jpg`, finishing in a straight roll-out).

## Problems (ranked, most severe first)
1. **Nose-in at the bay corners kills all speed.** s 328 R, 600 L, 600 R, 965 L: speed falls from 10-14 to 0.7-0.9 m/s in under 2 s, and the cart takes 3+ s to reach 4-5 m/s again. The corner/bay entry geometry is a speed trap for a child who steers late. Evidence: `lock.json`.
2. **Rubbing the wall at full lock is a slow crawl forever, not a rescue.** On any straight or bend a player who keeps steering into the corn rubs at 4-6 m/s lat 2.5-4.4 m, with no rescue and no push back to the lane (14 s tested; `r7d` traces: 600 R 12.9 -> 5.5, 1448 R 8.1 -> 4.6, 2574 R 10.5 -> 4.5). The cart is 1-3 m inside the corn rim. A child who leaves the wheel hard over simply loses the race. This is the round-6 problem 1 inverted: no rescue, no recovery.
3. **Stalled carts still wait 8-11 s overall.** Idle full lock: the cart slows to a standstill over 7-9 s and is only then lifted (8.75 / 11.25 s), and a crawl at 0.7-2.3 m/s took 7.5 s. The progress rule needs 3 s of < 1 m advance plus the 3.5 s grace, so it trips late.
4. **A careful bot is last all race (rank 10 from ~110 s, ~7.3 m/s against AI 10+).** Without the AI rubber-band the slowest AI is still 2-3 m/s faster than a steady paddler; the player slot is mid-grid but falls to the back in the first 60 s (rank 5 -> 6 -> 10). Not provably a map issue, but corn is the one map where the gap to the pack is that large.
5. **Wall-hug chase camera still loses the cart in the leaves.** After a hit the chase cam looks through foliage and the cart is a few pixels (`after_locktests.jpg`). Minor and unchanged.
6. **Far canopy and dithered leaf cards unchanged** (soft rolls at distance; pixelated cut-outs close to the lane). Round-6 nit, still visible in `run_good_1700.jpg`.

## Fix list
1. `src/scene/tracks/corn.js` bay corner geometry (s 328, 600, 965): widen the entry or round the foot so a late steer glances along the wall, not nose-in; target: retained >= 5 m/s after 3 s full lock at 14 m/s from these s values.
2. `src/core/physics.js` corn rubbing/rescue (~L426-450): add a lateral-depth rule: wheel > 0.8 m into the corn for > 3 s with the steer pushing outward -> ease the cart back to the lane edge (not a teleport), and make the progress window trip at ~2 s; also count crawling (< 2.5 m/s) as wedged without the 3.5 s grace.
3. `src/core/physics.js` corn wall response: reduce speed bleed for an obtuse grazing hit so the full-lock rub does not slow to 4-5 m/s.
4. `src/ai/driver.js` / `corn.js`: consider a small pace tweak at the weak end so a clean steady driver is not 40 m behind by s 800.
5. Chase camera: raise/pull back when the cart is within 0.5 m of the corn rim (`src/core/` camera clamp, `camClamp`).

## Why 7, and what gets it to 8+
Grid and look are 8+, but the wall-contact behaviour the owner asked about is still poor in two ways (nose-in stops at the bay corners; a full-lock rub neither recovers nor rescues), and the rescue is quick only after a full stop. Fix items 1-3 and re-test: full lock at the four corner spots retains >= 5 m/s, and a 14 s hold-into-wall ends in a gentle recovery within ~5 s.
