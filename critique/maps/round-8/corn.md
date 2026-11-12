# CORN CRITIQUE — MAP ROUND 8
**Score:** 7 / 10 (round 7: 7). Visuals and grid unchanged and good. The 0.7 m/s bay-corner stops are not reproducible with a clean lead-in (they came from my round-7 test order), but the held-lock rub still never rejoins the lane and a slow steady driver is still crawling.

**Setup.** HEAD 17b865d, `npx vite --port 4631` (stopped afterwards), `?autostart=1&track=corn&q=low/medium`, 480x270 to 800x450, swiftshader, `setDebugInput` / `teleport` / `advance`. Scripts and `lock.json` in `screens/corn/`.

## Bay-corner stops (s 328 R, 600 L/R, 965 L) re-tested
Same method as round 7 (teleport at s at 14 m/s, 3 s full lock with paddling, 3 s released, cases run back to back in one page): 328 R 7.9 m/s at 3 s, 600 L 9.4, 600 R 9.7, 965 L 8.1, 1195 R 9.7, 1770 R 8.3, 1990 L 7.9 (3.9 by 6 s), 2100 R 9.4, 2574 L 8.4. Nobody stopped. **But** 5 of 14 back-to-back cases (328 L, 600@10 R, 965 R, 1448 R, 800 R) came out at 0.1-0.4 m/s from the first half second with lateral 0.0 and 2-4 rescues. Re-running those five with a 1.2 s straight lead-in before the teleport gave 8.6, 3.7, 7.1, 7.5, 7.7 m/s at 3 s and no stop. So the zero-speed results are a state carried over from the previous case (teleport straight after wall contact or a rescue; the cart is dead at lateral 0 which is not a corn contact), not the map or the new assist. My round-7 "bay stops" were the same artifact (those traces also start already slow). I withdraw that finding as a map problem. Possibly worth a look: `teleport()` right after a rub leaves the cart pinned (dev-only, a player never does that). The one real number: full lock at only 10 m/s into a bay (600 R) bleeds to 3.7 m/s in 3 s (faster carts keep more).

## Held lock and rubbing
- Hold full lock into the corn while paddling (s 600, 1448, 1931, 2574; 14 s): the steering fade and push stop the cart digging in, it settles at lateral 2.2-2.5 m (0.5-0.7 m into the corn, 4.0 at 2574 where the lane edge is wider) and rubs along the wall. Speed decays steadily: 9.3 -> 4.3 (600), 9.3 -> 1.4 (1448), 10 -> 2.6 (1931), 10.9 -> 4.9 (2574). It never returns to the lane while the wheel is held and no rescue fires (0 of 4). The assist holds the cart at the wall, it does not carry it out. Idle full lock (no paddling): holds at 6-7 m/s, lateral 2.4, drifts down the wall; at 965 it went 4.0 deep then back to 2.4. No rescue in 18 s.
- Release after 3 s of lock: the cart is at lateral 2.0, glides back across the lane in about 4 s and overshoots to -1.0 (at 6.4 m/s). That feels natural.
- Does the assist feel like an invisible hand? Mostly no. The fade is subtle in normal driving; in a hit you see the nose swing along the corn and the cart carry its speed (7-10 m/s at 3 s, previously 4-6 at the worst spots). Visible only as "the cart refuses to dig in", which reads as a forgiving wall. It does not read as being steered. The downside is the opposite: a child who holds the wheel is held in the leaves at 0.6 m depth, slowly losing speed, with nothing rescuing them.
## Nose-in wedge rescue (cart placed facing the corn, lateral 2.0-2.5, speed 0)
Wheel centred: rescued at 2.5 s (paddling) and 3.5 s (not paddling). Wheel centred is fast and good. Full lock toward the wall while paddling: rescued at 7.5 s; full lock the other way at lateral 2.5: rescued at 3.5 s but stuck again (0.0-0.4 m/s) and rescued again at 9.5 s and 12 s, i.e. 31 m in 15 s. So a child who keeps the wheel hard over is repeatedly rescued and re-wedged; ~4 s per rescue cycle. Stagger tweak is invisible to the player.
## Camera, grid, run, finish
- Chase/cockpit camera in the leaves (rub_4s, rub_8s, bay328_hit, bay600_view1): lane stays visible, cart at the bottom, no loss of the cart in the foliage this time. The view yaws toward the wall during a hold which is fine. Close sunflower and leaf cards are still dithered (view1 shot) but acceptable.
- Start grid: staggered single file, player 5th of 10 at s=2.7, rear car at -10.8, front at 13.5; no pile-up in 13 s, all cars 4.6-8.7 m/s at 3 s, 0 respawns. Arch, hay bales, bunting, marshals read well (grid_0, launch_3s). Back of the grid still 24 m behind the banner.
- Full run, PD lane-keeping bot with constant paddling: 520 s, reached s 2566 of 3218 (average ~4.9 m/s, 2-3 m/s slower than round 7's bot with the same sort of control, which I read as bot noise rather than a regression), 1 rescue at ~s 700, 2% of samples outside the lane, min speed 0.09 m/s once, longest crawl (< 1.5 m/s) 2.25 s. Never finished inside my cap. Finish approach, bunting arch, crowd and results panel work (teleported to s 3120: 1st, panel clean, `finish_results.jpg`).

## What works (max 3 bullets)
- Best-looking map of the three: corn walls, leaf cards, sunflowers, hay arch, readable lane, pumpkin field edges (`finish_approach.jpg`, `bay328_hit.jpg`).
- Wall hits at a bay or a bend keep speed now (7.9-9.7 m/s after 3 s full lock at 14 m/s), no pin, centred-wheel rescue 2.5-3.5 s.
- Clean start grid and a smooth finish with results.

## Problems (ranked, most severe first)
1. **Held full lock never rejoins the lane and never rescues.** The cart sits 0.5-0.7 m into the corn (4.0 m lateral at s 2574) and bleeds from ~10 m/s to 1.4-5 m/s in 14 s with no rescue and no push out to the lane. The inward push stops at the equilibrium depth (~0.35 m plus steer fade) instead of delivering the cart back. s 600/1448/1931/2574, `rub.out` numbers above.
2. **Hard-over wheel + nose-in is a rescue loop.** After a rescue with the wheel still held, the cart wedges again within ~4 s (0.0-0.4 m/s), 31 m in 15 s. The rescue does not clear steering or the assist is zero at low speed.
3. **Slow steady driver is still very slow**: ~4.9 m/s average in the bot run (never finished in 520 s) against AI 8-9 m/s, 1 rescue by s 700. The track is a lane one cart wide with long straights; a careful child is last by 100+ m. Not new, but on corn it decides the race.
4. **Teleport right after a wall rub leaves the cart dead at 0.1 m/s with repeated rescues** (5 of 14 chained tests). Probably dev-only, but cheap to check that a rescue/respawn really resets the wall/assist state.
5. Dithered close leaf cards, far canopy softness (unchanged nits).

## Fix list
1. `src/core/physics.js` corn assist (~L233-246): when held steer is into the corn and depth > ~0.5 m for > 1.5 s, ramp the inward push (and the steer fade) to a firm return to lane (target depth < 0.1 m), and clear the wedge state on rescue.
2. `src/core/physics.js` rescue: on rescue zero the steering command latch for 1-2 s so a held wheel does not immediately re-wedge; trigger a rescue when speed < 2.5 m/s for 2 s while depth > 0.3.
3. Pace: raise human coast speed or lower AI pace on corn so a steady paddler is within ~30 m of the back of the pack by 800 m.
4. Check `teleport()` after wall contact resets `cornN`/wall state.

## Why 7, and what gets it to 8+
Visual and grid are 8+. The fixer's main complaints (nose-in at bay corners) turned out to be a test-order artifact, and the new fade/push does keep speed on a hit. Still below 8 because a held wheel gets a slow death crawl or a re-wedge loop rather than a gentle return to the lane. Items 1-2 and a retest where a 14 s full-lock hold ends back in the lane (or one rescue, then free) at >= 5 m/s gets it to 8.
