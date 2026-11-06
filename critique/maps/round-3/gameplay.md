# GAMEPLAY CRITIQUE — MAP ROUND 3
**Score:** village 6/10, corn 7/10, circuit 7/10

How I tested (round-2 harness, extended):
- **Build:** the HEAD build (`26a18d1`), built into scratch and served with `vite preview` on port 4534.
- **Sims:** `node tests/ai-sim.mjs 3 --track=<id>` on all four tracks, and `tests/ai-game.mjs --track=<id>` (player trucks 0 and 4) from a private copy on port 4535.
- **In-game races** through `__game.advance()` with `ai=9`, on each map:
  - one full 10-car race with the road-following autopilot (the "good" driver);
  - one with a "relaxed" driver (at most 12 m/s, paddling 60 % of the time).
- **New this round:**
  - every rescue now logs from-s → to-s, the lateral and the street;
  - re-stuck loops are detected: the same car rescued again within 20 s and 40 m;
  - bad-driving runs record stuck time;
  - wedge runs check that the cart drives off after its rescue;
  - cameras on every village branch and split mouth, on all 4 corn bay ramps and at circuit s 280/452/760/940;
  - the true grid frame cost (during the countdown), plus 6 points along the track;
  - a probe of the circuit pins and the village river lanes (`probes.txt`);
  - the results panel at 844×390.

Raw data: `screens/gameplay/<map>-results.json`, `ai-sim-3seeds.txt`, `ai-game.txt`, `probes.txt`.

| | country | village | corn | circuit |
|---|---|---|---|---|
| Ace finish, sim (r2 → r3) | 273 s | 288 → 281 | 300 → **291** | 289 → 286 |
| Last AI, sim | ~394 | 391 → 392 | 443 → 446 | 390 → 389 |
| Spearman ρ, sim avg | 0.93 | 0.85 → **0.78 (FAILS the 0.8 assert;** seeds 0.60/0.87/0.87) | 0.92 → **0.81** (0.93/0.65/0.83) | 0.88 → **0.94** |
| Lead changes per race, sim | 1.0 | 2.3 → 2.0 | 0.0 → **0.0** | 2.0 → **0.0** |
| AI rescues per race, sim | 5.3 | 6.0 → **8.0** | 2.7 → **5.3** | 4.0 → **1.3** |
| AI rescues in game (good / relaxed race) | – | 17/15 → **19/13** (incl. an 8-rescue loop) | 4/7 → 4/5 | 10/6 → 5/11 |
| ρ at 90 s, ai-game (truck 0/4) | 0.83/0.88 | 0.93/0.83 | 0.92/0.75 | 0.93/0.93 |
| Good autopilot vs Ace, in game | −34 s | −131 → **−89** (222 vs 311; Vance 251) | −63 → **−106** (238 vs 344) | −22 → **−20** (248 vs 268) |
| Relaxed driver vs Ace | – | 269/311 → **273/284 (player still wins by 11 s)** | 291/316 → **282/300 (player wins by 18 s)** | 290/283 → **291/284 (Ace wins)** |
| Player first takes the lead (good / relaxed) | – | 22.6 → 15.3 / 50.4 s | 41.9 → 39.1 / 46.3 s | **2.9 → 3.1 / 5.6 s** |
| Bad driving: median / max recovery | – | 0.3 / 5.3 s | 1.0 / 6.9 s | 2.6 / 4.3 s |
| Wedge (steer held into the side, let go) → rescue | – | 4.0–17.3 → **2.8–10.1 s** | 8.4–11.8 → 7.7–10.1 s | see problem 2 |
| Grid frame (countdown, 10 carts) calls / triangles | – | 168 / 292k | 233 / 378k | 222 / 376k |
| Frame along the track, calls / triangles | – | 67–117 / 99–231k | 101–163 / 135–266k | 74–148 / 171–265k |

## Round-2 problems: status

**Fixed**
- **Village cars climbing walls (r2 #7).**
  - All 10 wall hits at 16 m/s now stop with air ≤ 0.43 m and vy ≤ 0.11 m/s (r2: 1.8–3.3 m up the house face).
  - Evidence: `village-results.json` → `wall.hits`.
- **Corn field escape (r2 #3).**
  - The s 1770 right-side run is now rescued after 3.4 s at lat 0.
  - Across all 16 bad-driving runs the worst excursion is 4.8 m, in a bay.
  - Evidence: `corn-results.json` → `wall.pins`, `bad.res`.
- **Village branches on the race map (r2 #8).** Each fork is now an orange dashed bulge that is easy to see (`race-maps-sheet.jpg`).
- **Circuit AI pace (r2 #6, part).**
  - Ace (286) now beats Maeve (291) in all 3 seeds.
  - Sim rescues dropped 4.0 → 1.3, and ρ rose to 0.94.
  - A relaxed driver still loses to Ace.
- **Chase/far cameras against corn and village walls (r2 #5, part).** Chase and far views now keep the cart in view at:
  - the corn wall at s 1360, 2650 and 3070, and all 4 bay ramps;
  - the village main-street walls at 680, 1495 and 1630;
  - 5 of the 6 village branches.

  Evidence: `corn-cams-sheet.jpg`, `village-cams-sheet.jpg`, `village-cams2-sheet.jpg`.
- **Repeated rescues 8 m apart on the main street.**
  - Rescues now drop the cart 12–25 m ahead, at lat 0.
  - Every wedge run drives off afterwards with 0 re-rescues.

**Partly fixed**
- **Long waits for a stuck cart (r2 #4).**
  - Village: 2.8–10.1 s (was up to 17.3 s).
  - Corn: 7.7–10.1 s (was 8.4–11.8 s), of which roughly the first 4–5 s is the cart still rolling along the corn.
- **A decent player races alone (r2 #2).** On village the relaxed player's margin over Ace shrank from 42 s to 11 s, but the player still wins. On corn it got worse (see problem 3).

**Not fixed**
- **Village AI rescues (r2 #1).**
  - The game logged 19 rescues in the good race and 13 in the relaxed race; the sim got worse (6.0 → 8.0).
  - In the good race Ace finished 2nd of the AI, 60 s behind Vance.
- **Corn 0.0 lead changes.**
- **Circuit grid start.** The player still leads after 3.1 s.

**New or regressed**
- A village branch-mismatch rescue loop.
- The circuit hairpin gravel pin is never rescued.
- Corn AI order collapsed (ρ 0.81, with one seed at 0.65).
- Circuit sim lead changes fell 2 → 0.
- The village far camera ends up inside a house at the Riverside mouth.
- The side camera ends up inside the corn or a house.
- The results panel is clipped at 390 px tall.

## What works (max 3 bullets)
- **Containment is solid on all three maps.**
  - No launches. Wall air is ≤ 0.43 m on village and ≤ 0.51 m on circuit; corn is ≤ 0.40 m with vy ≤ 1.8 m/s.
  - Nothing escapes, apart from a short dip into the village river (problem 6).
  - Bad driving recovers quickly. Median recovery is 0.3 s on village, 1.0 s on corn and 2.6 s on circuit. Every circuit run-off rescue lands at lat 0 on the asphalt and drives off.
  - The good solo autopilot finishes every map with 0 rescues and 0 s off-road (village 219 s, corn 229 s, circuit 245 s).
- **The circuit is a real race.**
  - Ace leads the AI and wins the relaxed race (284 vs 291).
  - A good driver beats Ace by 20 s, close to country's 34 s.
  - Nobody is lapped: the last car finishes in about 382 s.
  - The finishing order matches skill (ρ 0.94), and every circuit camera view stays clean (`circuit-cams-sheet.jpg`).
- **The UI and memory hold up.**
  - The 844×390 layout has no overlaps on any map (`*-phone-844x390.jpg`).
  - The lap chip shows only on the circuit, and the village forks now read on the map.
  - Restart memory is flat. Over 5 restarts the geometry/texture counts stay at village 117–130/39, corn 151–164/54 and circuit 161–174/41.
  - Frame cost on the road stays at or below 163 calls and 266k triangles, at 2–10 ms CPU per frame in swiftshader.

## Problems (ranked, most severe first; each: what / where (s metres, street) / evidence file / why it matters)
1. **[village] Rescues put AI cars on a different street from their plan, and they loop.**
   - **The loop:** In the good race, Buster's plan was split 2 → path 1 (Riverside Lane). He was rescued at s 1483 and placed on path 2 (Back Alley, `"path":"2:2"`). He then steered for his planned street, hit the alley wall and was rescued again, 8 times in 45 s:
     - 1507, 1547, 1566, 1598, 1622, 1650, 1668, 1686;
     - stalled 22.4 s in total; he finished last.
   - **The same in the relaxed race:** Vance (plan: split 2 → main) was rescued 4 times on `2:2` between s 1464 and 1527, and twice on `1:1`/`1:2` at 542–561 and 712–724.
   - **The cause:** `recover()` (`src/core/physics.js`, around line 403) takes the street from `track.project()` at the stuck position. The AI keeps its own `choice`.
   - **Tangles:** There are also 4 two-car tangles where both cars are rescued in the same 0.1 s:
     - Barnaby and Tilly at s 229 and again at 2128;
     - Maeve and Ace at 1258;
     - Rosco and Vance at 1285.
   - **Ace:** He was rescued 3 times (1259, 1360, 1362) and finished 311 s against a sim time of 281 s.
   - **The sim:** ρ fails its own 0.8 assertion (0.78). Vance has 7 rescues and beats Ace in 2 of 3 seeds.
   - **Evidence:** `village-results.json` → `race.rescues`, `race.loops`, `relaxed.loops`; `ai-sim-3seeds.txt`.
   - **Why it matters:** The finishing order is random, and a kid watches a cart blink forward 8 times down an alley.
2. **[circuit] A cart pinned nose-in in the hairpin gravel trap is never rescued (regression).**
   - **The runs:**
     - s 465, outside (lat −10.6, `gravel`), paddling: not rescued in 20 s. Speed 0.1 m/s throughout; `state.pin` oscillates 1.7–2.7 and never reaches 4.
     - s 452, paddling: 14 s.
     - s 440, idle: not rescued. The cart crawls at 0.3 m/s for 16 s.
     - The wedge runs at s 322 and 483 take 11–14 s.
   - **The cause:** The circuit pin rule (`physics.js` line 379) counts only `grass`/`wall` wheel contacts. The gravel trap added in round 2 is neither, so the pin timer drains.
   - **The pile-up:** In the relaxed race, Tilly, Clementine and Dot were all rescued at the hairpin entry (s 401–406) within 1 s at t≈60. That race logged 11 rescues; Vance had 4 of them and spent 9.1 s off-road.
   - **Evidence:** `probes.txt`, `circuit-results.json` → `wall.pins`, `bad.wedge`, `relaxed.rescues`.
   - **Why it matters:** This is the round-1 "stuck forever" bug back, at the corner where children will crash most.
3. **[corn, village] The player is still unchallenged, and corn's AI order collapsed.**
   - **Corn:**
     - The good autopilot beats Ace by 106 s (r2: 63; country: 34). Ace was rescued twice in the first 40 s (s 213 and 252), was 7th at 90 s and finished 5th of the AI.
     - The relaxed driver beats Ace by 18 s.
     - The sim has ρ 0.81 (seed 2: 0.65), 0 lead changes, and rescues doubled (2.7 → 5.3 per race; Buster 21 s off-road).
   - **Village:** The relaxed driver beats Ace by 11 s.
   - **Evidence:** `*-results.json` → `race.finish` / `relaxed.finish` / `order90`, `ai-sim-3seeds.txt`.
4. **[village, corn] Outside cameras still lose the cart in some places.**
   - **Village far camera:** At the split-2 Riverside mouth (s≈1487, cart against the right wall), the screen is solid house wall and the cart is invisible (`village-cam2-mouth2-far-wall.jpg`).
   - **Village side camera:** At s 1630 the side view is half inside a house (`village-cam-side-1630-wall.jpg`).
   - **Corn side camera:** With the cart against the corn, the side camera sits inside the corn and shows only leaves at s 1360, 2650 and 3070 (`corn-cam-side-*-wall.jpg`). `camClamp` does not limit it, or it cannot clear the corn height.
5. **[circuit] The grid start still means nothing, and the race has no lead changes.**
   - **The start:** The player in slot 4 leads after 3.1 s (relaxed driver: 5.6 s).
   - **Lead changes:** The sim's lead changes fell from 2.0 to 0.0. Ace leads from the start, and the field is strung out (ρ 0.94).
   - **The relaxed race:** It had 3 lead changes only because of the player.
   - **Evidence:** `circuit-results.json` → `race.pRank1`, `relaxed.pRank1`; `ai-sim-3seeds.txt`.
6. **[village] A cart can drop into the river beside the Riverside lanes.**
   - **Split 2, s 1600, steering left:** the cart went 3.5 m past the street edge and spent 4 s in the water before the rescue.
   - **Split 3, s≈2547:** the camera run ended with the cart sitting in the river at lat −6.7 (`village-cam2-b3-2-side-wall.jpg`, `-chase-wall.jpg`).
   - **Why it matters:** The rescue arrives (4 s), but the 0.5 m parapet (`LOWR`) does not hold a cart.
   - **Also:** On Main Street at s 1610–1650 the road is drawn as water (`village-cam-chase-1630.jpg`). Physics and `project()` say cobble / Main Street, so the player seems to drive through the river. This is a village-critic visual item.
7. **[all, minor] The results panel does not fit 390 px tall.**
   - At 844×390 the "1st" header is cut off at the top and the RACE AGAIN / Garage / Barn row at the bottom.
   - At 640×360 rows 1–5, including the player's own result, are off-screen.
   - Evidence: `results-panel-844x390.jpg`, `village-race-end.jpg`.
8. **[corn, circuit, minor] The grid frame is the heaviest frame.**
   - During the countdown all 10 carts are in near LOD, giving corn 233 calls / 378k triangles and circuit 222 / 376k: about 1.5–2× any on-road frame.
   - Evidence: `corn-cost-grid.jpg`, `circuit-cost-grid.jpg`, `*-results.json` → `cost`.

## Fix list (concrete, actionable, ordered; name files/functions where you can)
1. **Rescue onto the AI's own street** (`src/main.js` around line 745, `src/core/physics.js` `recover()`).
   - Give `recover()` an optional `choice` argument and pass `v.ai.choice` for AI cars. Only the player should use `project()`.
   - Or: after a rescue, call `ai.setChoice()`/replan to the street the cart was put on.
   - Keep the cart on the planned street even when it stalled at the junction gore (s 1450–1500, 2400–2450).
   - For a two-car tangle (both `needsRescue` within 0.5 s and less than 4 m apart), rescue only the rear car, or offset the second car by 6 m and lateral ±1.2.
   - Re-check: a village race with ≤ 6 rescues, no loops, Ace in the AI top 2, and sim ρ ≥ 0.8.
2. **Circuit gravel pin** (`src/core/physics.js` line 379): add `gravel` to `offAsph`, or use the lanes branch's test (|lateral| > hw − 0.6). Target: the hairpin pins at s 440, 452 and 465, paddling or idle, rescued in ≤ 4 s. Re-run the hairpin pin and wedge tests.
3. **Corn and village pace** (`src/ai/driver.js` `TRACK_CAP`, rubber band; `src/ai/planner.js`).
   - Find what stalls Ace at corn s 205–255 (two rescues at 213 and 252 in the first 40 s; probably a hazard or the first scarecrow). Make the planner route around it.
   - Raise the top-3 caps or rubber band until a relaxed driver loses to Ace on corn and village, and a good autopilot is within about 40 s of Ace.
   - Bring corn sim rescues back to ≤ 3 per race (Buster has 21 s off-road).
4. **Cameras** (`src/main.js` `camClamp`, `src/core/camera.js`).
   - Apply the corridor clamp to the side view as well.
   - Near a split mouth (|s − fromS/toS| < 40), also clamp against Main Street's frame. Or cast a ray from the camera to the cart, and when it hits a building or corn, pull the camera in toward the cart or raise it to at least 3.2 m on corn.
5. **Circuit start and racing** (`src/ai/driver.js` `standing`).
   - A stronger launch for the front row, so the player in slot 4 does not lead before about 10 s.
   - Let Ace's leader-ease (`leaderEase`) hold him within reach so the sim shows ≥ 1 lead change again.
6. **Village river parapet** (`src/scene/tracks/village.js`, `LOWR`): make the river-side edge a `wall` surface (sideways stop) even with the parapet only 0.5 m high. Also find out why the water mesh covers Main Street at s 1610–1650. This is the village fixer's item.
7. **Results panel** (`src/ui/index.js`): fit the panel to `100vh` on short landscape screens. Scale it, or use a 2-column list and smaller header, so the player's row and RACE AGAIN are always visible at 844×390.
8. **Grid cost** (`src/main.js` LOD): during the countdown, keep the near-LOD radius to the 2–3 carts around the player (currently 11 m). Target ≤ 170 calls at the grid.
