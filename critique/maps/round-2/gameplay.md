# GAMEPLAY CRITIQUE — MAP ROUND 2
**Score:** village 6/10, corn 7/10, circuit 7/10

How I tested: I used the round-1 harness, extended. I built into scratch and served it with `vite preview` on port 4514. I ran `node tests/ai-sim.mjs 3 --track=<id>` on all four tracks, and `tests/ai-game.mjs --track=<id>` from a private copy on its own port. In the built game, through `__game.advance()` with `ai=9`, I ran:
- a full 10-car race with the road-following autopilot (the "good" driver);
- a second race with a "relaxed" driver (target speed at most 12 m/s, paddling 60 % of the time);
- 16 bad-driving runs and 8 wedge runs per map;
- wall hits at 16 m/s, where I measured air above the ground;
- nose-in pins, both paddling and idle (on the circuit: s 280, 440, 452, 465, 760);
- chase, far and side cameras on the 3 sharpest bends, driving the bend and driving into the wall;
- the race map at each village split;
- `renderer.info` at 6 points (`q=medium`, 960×540, ai=9);
- the 844×390 touch layout;
- 5 restarts, checking GPU memory.

The raw data is in `screens/gameplay/<map>-results.json`, `ai-sim-3seeds.txt` and `ai-game.txt`.

| | country | village | corn | circuit |
|---|---|---|---|---|
| Ace finish, sim (r1 → r2) | 276 s | 307 → **288** | 320 → **300** | 353–395 → **289** |
| Last AI, sim (r1 → r2) | ~382 | ~437 → **391** | ~461 → **443** | 529–627 → **390** |
| Spearman ρ, sim avg (seeds) | 0.88 | 0.76 → **0.85** (0.78/0.98/0.78) | 0.91 → 0.92 | 0.78 → **0.88** (0.77/0.92/0.95) |
| Lead changes per race, sim | 1.0 | 1.0 → 2.3 | **0.0 → 0.0** | 3.0 → 2.0 |
| AI rescues per race, sim | 3.3 | 12.3 → **6.0** | 3.7 → 2.7 | 4.3 → 4.0 |
| AI rescues per race, in game (good / relaxed driver race) | – | 10 → **17 / 15** | 10 → 4 / 7 | 6 → 10 / 6 |
| ρ at 90 s, ai-game | 0.85 | 0.82 | 0.85 | 0.98 |
| Good autopilot vs Ace, in game | −34 s | −80 → **−131** (231 vs 362) | −90 → −63 (240 vs 303) | −108 → **−22** (247 vs 269) |
| Relaxed driver vs Ace | – | 288 vs 296 → 269 vs 311 (player wins) | 303 vs 319 → 291 vs 316 (player wins) | DNF → **290 vs 283 (Ace wins)** |
| Player first takes the lead (grid slot 4) | – | 31.6 s / 22.6 s | 41.9 s / 74.5 s | **2.9 s / 4.4 s** |

**Round-1 problems, status:**
- **Fixed:**
  - Circuit wedge never rescued (#1). A nose-in pin on grass or wall is now lifted after 2.6–2.9 s, at the hairpin s 440–465, the chicane s 760 and T1 s 280, whether paddling or idle.
  - Circuit race too long (#2). Ace now finishes in about 4:50 and the last car in 6:30, with nobody lapped. The owner's 3 × 1072.7 m distance is unchanged.
  - Corn trains and pile-ups (#3). In-game AI slow time is under 5 s per car, with 4–7 rescues per race.
  - Post-finish rescues (#7). There were 0 in all 6 races.
  - Lap chip overlap (#8). The chip now sits beside the rank, at (93,11) 63×25, with no overlaps at 844×390 (`circuit-phone-844x390.jpg`).
  - Restart memory growth (#9). Over 5 restarts the counts stay flat: circuit 161/41, corn 148/53, village 117–130/39.
- **Partly fixed:**
  - Player unchallenged (#4). It is fixed on the circuit and still open on corn and village.
  - Village stalls (#5). The sim is better, but in the game it is worse (see below).
- **Not fixed:**
  - Long wedge rescues on corn and village (#6/#9). Corn takes 8.4–11.8 s (round 1: 9.9–10.8). Village takes 4–17.3 s (round 1: 7.4–8.7).
  - Corn has 0.0 lead changes in the sim.
- **New problems:**
  - The player clears the whole circuit field in 3 s.
  - A corn cart can drive out into the field at s≈1770–1800.
  - Village repeat-rescue traps.
  - The village far/chase camera can sit inside a house.
  - The corn chase/side camera hides a cart that is against the corn.
  - Circuit grid frame cost went up.

## What works (max 3 bullets)
- **The circuit now plays like a race.**
  - Three laps take Ace 269–289 s, and the last AI finishes at 382–390 s with nobody lapped.
  - A good driver beats Ace by 22 s, close to country's 34 s. A relaxed driver loses to Ace by 7 s, so there is a real opponent.
  - Wall hits at 16 m/s never launch: air ≤ 0.40 m and vy ≤ 1.74 m/s at all 16 hits, including the hairpin s 440/452 and the chicane s 750.
  - A nose-in cart at the hairpin outside wall (lat −11.6) is rescued in 2.6 s, whether it keeps paddling or sits idle.
  - A cart that rolls back onto the asphalt is correctly left alone.
  - Chase and far cameras stay inside the corridor (cam lateral ≤ 6.3 m with the cart at −10.8) and never go into the tyre wall. Evidence: `circuit-cams-sheet.jpg`, `circuit-results.json` → `wall`.
- **Recovering from bad driving is quick everywhere.** Median and maximum recovery times:
  - corn: median 0.9 s, max 2.2 s;
  - circuit: median 2.6 s, max 4.3 s;
  - village: median 1.0 s.

  Solo good runs had 0 rescues and 0 off-road on all maps.
- **The UI is fixed.**
  - The lap chip no longer overlaps the paddle box.
  - The lap chip is hidden on the one-lap maps.
  - The rank shows a real mid-pack place at the start (4/10 at 12 s).
  - Village branches now appear on the race map (`race-maps-sheet.jpg`).

  Frame cost stays iPad-safe: village 67–117 calls and 98–209k triangles, corn 93–143 and 144–263k, circuit 102–150 and 232–370k. CPU per frame is 3–12 ms in swiftshader.

## Problems (ranked, most severe first; each: what / where (s metres, street) / evidence file / why it matters)
1. **[village] The best AI keep getting stuck and rescued in the real game.**
   - **What:** The sim improved to 6 rescues per race, but the built game logged 17 rescues (good-driver race) and 15 (relaxed race), up from 10 in round 1. They hit the top AI hardest: Ace 5, Vance 4–5, Maeve 4.
   - **Where:** The same spots in both races:
     - s≈1056–1100: the church plaza and fountain. Ace 1067, 1082 and 1089; Vance 1056 and 1097; Dot stalled on a `rock` at 1085.
     - s≈630–770: the split-1 mouth, market and exit. Ace 638, Vance 637, Maeve 687 and 750, Buster 757.
     - s≈2590–2700: Vance 2590, 2641, 2687 and 2695.
     - s≈2994–3007: near the finish.
     - s≈130–270: the first hazards.
   - **Repeat rescues:** Several rescues come in pairs 7–9 m apart (Barnaby 130/139, Ace 1082/1089, Vance 2687/2695). `recover(3)` puts the cart back into the same trap.
   - **Result:** In the good-driver race, Ace finished 5th of 9 AI in 361.5 s (sim: 288 s), and Rosco won the AI race.
   - **Evidence:** `village-results.json` → `race.rescues` / `stuckEv` / `relaxed.rescues`, `village-race-end.jpg`.
   - **Why it matters:** The finishing order is random and the "best" opponents look broken.
2. **[corn, village] A decent player still races alone.**
   - **Corn:** The good autopilot beats Ace by 63 s (country: 34 s). The relaxed driver, paddling 60 % of the time with a 12 m/s cap, still beats Ace by 25 s (291 vs 316). Ace's sim time is exactly 300.0 s in every seed, which shows a hard speed cap.
   - **Village:** The good autopilot beat Ace by 131 s in one race (the gap is inflated by problem 1). The relaxed driver beat Ace by 42 s.
   - **Corn lead changes:** The sim still shows 0.0 lead changes per race. The passing bays let the pack shuffle, but nobody ever challenges Ace.
   - **Evidence:** `*-results.json` → `race.finish` / `relaxed.finish` / `ranks`, `ai-sim-3seeds.txt`.
3. **[corn] A cart can drive out into the field and roam for 15 s.**
   - **Where:** s≈1770–1800.
   - **What:** Steering into the right side while paddling took the cart through the corn edge to lat 15 → 37 → 52 m. It wandered there for about 17 s until the wrong-way rescue fired. The surface stays `corn` the whole time.
   - **Evidence:** `corn-escape-1770.jpg`, `corn-results.json` → `wall.pins` (s0 1770, side +1, latEnd 52–67).
   - **Why it matters:** This is the only containment break on the three maps. A child can get lost in a sunflower field.
4. **[corn, village] A stopped cart still waits a long time for a rescue.**
   - **Corn:** All 8 wedge runs took 8.4–11.8 s. The cart stops on `dirt`, `gravel` or `sand` at lat ±0.8–1.9 after sliding back off the berm. The new 3.5 s rule for `corn`/`wall` surfaces never applies, so the 5 s timer runs, and creep above 0.4 m/s keeps resetting it.
   - **Village:** Wedge runs took 4.0–17.3 s (s 1448 left 17.3 s, s 2574 left 17.2 s). Three bad-driving runs took 7.7–9.4 s (s 257 L, 644 L, 2253 L).
   - **Evidence:** `corn-results.json` / `village-results.json` → `bad.wedge`, `bad.res`.
5. **[village, corn] Outside cameras lose the cart against walls and corn.**
   - **Village:** The village has no corridor clamp (`CAM_MARGIN` only covers corn and circuit). At s≈1630, the far camera driven into the wall ends up inside a house: the screen is solid plaster and the cart is invisible (`village-cam-far-1630-wall.jpg`). The chase camera at the same spot is half blocked.
   - **Corn:** When the cart is pushed into the corn (cart lat −5.5 in the s 2650 bay), the chase and side cameras sit inside the lane and the corn wall hides the cart. See `corn-cam-chase-2650-wall.jpg`, `corn-cam-side-2650-wall.jpg` and `corn-cam-far-1360-wall.jpg`.
   - **Evidence:** `village-cams-sheet.jpg`, `corn-cams-sheet.jpg`.
6. **[circuit] The grid start means nothing, and Vance spins out.**
   - **The start:** The player starts in slot 4 but leads after 2.9 s (relaxed driver: 4.4 s). The front-row AI hesitate on the line: Barnaby and Tilly stalled 3–4 s at s≈33–95 in both the game and the sim.
   - **Vance:** In the good-driver race he had 6 rescues and 10.5 s off-road. In the stall trace he was facing backwards (heading −0.93) at s 342, after T1, and backwards on the grass at s 671.
   - **AI pace:** Maeve (0.73) beats Ace (0.95) in all 3 sim seeds (284 vs 289). Ace is held by a cap.
   - **Evidence:** `circuit-results.json` → `race.rescues` / `stuckEv`, `ai-sim-3seeds.txt`.
7. **[village] Cars climb walls.**
   - **What:** Full lock at 16 m/s puts the cart 1.8–3.3 m up the house or wall face for 1.3–1.5 s. The side views show the cart tilted on the brickwork.
   - **Where:** s 322, 965, 2253, 2896.
   - **Compared with country:** Country's grass verges give 1.3–2.6 m, so this is not a new launch bug. On a walled street, though, it reads as driving up a house.
   - **Evidence:** `village-cam-side-1630-wall.jpg`, `village-cam-side-680-wall.jpg`, `village-results.json` → `wall.hits`.
8. **[village, minor] Branches are on the map but barely readable.** Each split is a 3–5 px dashed bulge on a 73×200 px map, and the player dot covers it when you are at the split. Evidence: `race-maps-sheet.jpg`.
9. **[circuit, minor] Grid frame cost went up.** At s=11 with the field around the player, the circuit costs 150 draw calls and 370k triangles (round 1: 128 calls, 269k). That is the heaviest point measured on any map. Evidence: `circuit-cost-11.jpg`.

## Fix list (concrete, actionable, ordered; name files/functions where you can)
1. **Village AI traps** (`src/ai/driver.js`, `src/ai/planner.js`, `src/core/physics.js`):
   - Add the church plaza and fountain (s 1050–1100, landmark at lateral −8) and the split-1 market/exit (s 630–770) to the planner's obstacle cost, so the line avoids the kerb props.
   - Have `recover()` skip past the hazard or prop that caused the stall: use ahead ≥ 12 m, or the next clear `s` from `hazards`, instead of 3 m. That removes the 8 m repeat rescues.
   - Re-check with `ai-game` and a full in-game race. Target: ≤ 6 rescues per race in the game and Ace in the AI top 3.
2. **Corn and village pace** (`src/ai/driver.js` `TRACK_CAP`):
   - Raise corn Ace's cap. Ace's sim time is exactly 300.0 s every seed. Target sim Ace about 270–280 s and in-game Ace within 35–40 s of the good autopilot.
   - Let the top three AI use the passing bays to attack each other, aiming for ≥ 1 sim lead change on corn.
   - The relaxed driver should not beat Ace on corn or village.
3. **Corn field escape** (`src/scene/tracks/corn.js`, around s 1770–1800): find the break in the bank or clearing edge on the right side. Close it with a full 1.9 m bank, or give the yard a fence. Add a containment check for this spot to `containment.mjs`.
4. **Stuck rescue on corn and village** (`src/core/physics.js` `step()`):
   - Use the circuit-style hysteresis pin timer everywhere except country: speed < 1.5 m/s, drain slowly, fire at about 4 s.
   - Count "touched corn or wall within the last 2 s", not only the current surface, so a cart that slid back onto dirt still qualifies.
5. **Cameras** (`src/main.js` `CAM_MARGIN` and `camClamp`; `src/core/camera.js` `outside()`):
   - Add village with about hw + 0.3, using the branch choice from `project()`.
   - On corn, when the cart is outside the lane, clamp to the cart's side, or raise the camera above the corn height (about 2.6 m plus margin) so it looks over the corn.
6. **Circuit start and Vance** (`src/ai/driver.js`):
   - Remove the front-row hesitation at the start.
   - Give the AI a launch so the player in slot 4 does not lead within 3 s.
   - Find why Vance spins after T1 at s≈320–345: check his truck's grip against the flat-track cadence at corner entry.
   - Let Ace's flat cap exceed Maeve's.
7. **Village walls** (`src/core/physics.js`, `flags.wallSurface`): apply the circuit's "sideways stop, no climb" wall response to village `wall` surfaces, so carts can't drive up house fronts.
8. **Race map** (`src/main.js` `mapWarp` / `src/ui/index.js` `drawMap`):
   - Exaggerate the village branch offsets more, so each split is at least 8 px wide.
   - Draw the branches in a distinct colour.
9. **Circuit grid cost** (`src/scene/tracks/circuit.js`): merge or instance the grandstand crowd and the pit props seen from the grid, to bring the count under about 130 calls and 300k triangles.
