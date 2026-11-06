# GAMEPLAY CRITIQUE — MAP ROUND 4
**Score:** village 8/10, corn 7/10, circuit 7/10

Build: HEAD `e7d038a`, scratch build, `vite preview` on port 4554. Same harness as round 3 (10-car race with a good and a relaxed autopilot, bad-driving/wedge/wall/pin runs, cameras, cost, phone, memory) plus `ai-sim 3 --track=<id>`, `ai-game 0,4`, a hairpin/edge probe and the results panel at 844x390.
Raw data: `screens/gameplay/<map>-results.json`, `ai-sim-3seeds.txt`, `ai-game.txt`, `circuit-probe.txt`, `village-probe.txt`.

| | country | village | corn | circuit |
|---|---|---|---|---|
| Sim ρ (r3 → r4) | 0.93 (unchanged, 272.9 s, ALL PASSED) | 0.78 → **0.88** | 0.81 → **0.87** | 0.94 → 0.92 |
| Sim lead changes | 1.0 | 2.0 → 1.0 | 0 → 0 | 0 → 0 |
| Sim assertions | pass | pass | **FAIL: worst/best 1.69 > 1.5** (Barnaby 467 s, Ace 276 s) | pass |
| Race rescues, game (good / relaxed) | – | 19/13 → **5/5** | 4/5 → **3/2** | 5/11 → **6/4** |
| Good autopilot vs Ace | – | −89 → **−46 s** (227 vs 274; Vance 246) | −106 → **−74 s** (239 vs 313) | −20 → **−16 s** (252 vs 268) |
| Relaxed driver vs Ace | – | player won by 11 → **tie (272.5 vs 272.2)** | player won by 18 → **Ace wins by 4.3 s** | Ace wins by 7 → **5.8 s** |
| Rescue loops (same car, 20 s/40 m) | – | 8-rescue loop → 2 pairs (2 rescues each, 2 s apart) | 1 pair (Vance, gravel at s 975) | none |
| ρ at 90 s, ai-game (truck 0/4) | – | 0.93/0.83 → **0.73/0.68** | 0.92/0.75 → **0.90/0.95** | 0.93/0.93 → 0.93/0.88 |
| Bad driving, median / max recovery | – | 0.3/5.3 → **0.1/0.9 s** | 1.0/6.9 → 1.3/3 s | 2.6/4.3 → ~1.9/3 s |
| Grid frame calls / tris (r3) | – | 168/292k → **111/197k** | 233/378k → **174/291k** | 222/376k → **144/261k** |
| Road frame, calls / tris | – | 67–152 / 104–291k | 110–163 / 144–223k | 73–160 / 171–295k |
| Player first leads (good / relaxed) | – | 65 s / 68 s | 40 s / – (Ace leads) | 3.4 s / 7.2 s |

## What works (max 3 bullets)
- **The village is now a real race.**
  - Rescues dropped from 19 to 5 per race and the 8-rescue Back Alley loop is gone. Ace, Vance and Maeve finish 1-2-3 among the AI, and the relaxed driver ties Ace.
  - Bad driving recovers in under a second on every street.
  - Evidence: `village-results.json` → `race`, `relaxed`, `bad`.
- **Containment, cameras, phone UI and cost are good on all three maps.**
  - Corn wall hits keep 7–11 m/s along the corn with no escapes (`corn-results.json` → `wall.pins`).
  - The village mouth/side cameras and the corn chase/side/far cameras keep the cart in view (`village-cam2-mouth2-far-wall.jpg`, `village-cam2-b3-2-side-wall.jpg`, `corn-cam-side-2650-wall.jpg`, `corn-cam-far-3070-wall.jpg`).
  - The results panel now fits 844x390 in two columns on all maps (`results-panel-village-844x390.jpg`, `results-panel-corn-844x390.jpg`).
  - The HUD has no overlaps (`*-phone-844x390.jpg`) and memory is flat over 5 restarts.
  - Grid frame cost is down 30–35 %.
- **Circuit hairpin gravel no longer traps a parked cart.** An idle cart at s 440/452 is lifted back in 2.8 s (r3: never). A paddling cart escapes on its own. Ace beats a relaxed player and trails a good one by 16 s.

## Problems (ranked, most severe first; each: what / where (s metres, street) / evidence file / why it matters)
1. **[circuit] A cart wedged against the barrier at s 858 on the asphalt edge is never rescued.**
   - **The probe:** The cart is at lateral ±5.7 (hw 5), speed 0, surface `asphalt`, steering into the wall.
     - Steer held: no rescue in 20 s (`stuck` counter 16.5 and rising).
     - Idle: rescued only at 18.3 s.
   - **Why:** The circuit pin rule counts only grass/wall/gravel wheel contacts, and the `stuck` rescue is skipped when `noStuckRescue` is set. A cart pressed on the asphalt side of the barrier matches neither.
   - **Evidence:** `circuit-probe.txt`, `circuit-results.json` → `bad.wedge` (s 858: `rescuedAt` null).
   - **Why it matters:** This is the round-3 "stuck forever" bug on a different surface. A child who pins the cart there waits indefinitely unless they find reverse. It is probably not the only barrier-on-asphalt spot.
2. **[corn] `ai-sim --track=corn` fails its own assertion, and the weak AIs are far behind.**
   - Worst/best is 1.69 (limit 1.5): Barnaby 467 s vs Ace 276 s, with seed 1 at 496 s (Buster 496, Barnaby 496).
   - In the game at 90 s, Barnaby and Tilly are at s 447 while Dot is at 679 (`ai-game.txt`).
   - **The cost:** The Ace boost stretched the field, and the sim has 0 lead changes (r3: 0).
   - **Racing:** The three fastest AIs run in a convoy and finish within 4 s of each other (309.4, 309.8, 313.2). Ace is third in the good race, with no way to pass in the single-lane corn.
   - **The player:** A good player wins by 74 s (r3 106; country 34). A relaxed driver now loses narrowly to Ace, which is right.
3. **[circuit] The grid start still means nothing, and AI-to-AI lead changes remain 0.**
   - The player in slot 4 leads after 3.4 s (relaxed driver: 7.2 s). The stronger launch for skilled AIs did not change that.
   - The sim has 0 lead changes: Ace leads wire to wire.
4. **[circuit] AI cars are still rescued on plain asphalt mid-circuit.**
   - The good race had Rosco at s 937 → 991, Maeve at 1102 and 1853, Barnaby at 873/1792. Each was "stuck" for 2.5 s, lateral 1.5–4 m, on `asphalt`.
   - The relaxed race had Maeve at 1157 and Dot at 1115.
   - Total: 6 and 4 rescues. The hairpin exit itself is clean now, but s 870–1160 and 1790–1860 still need a look (contact between carts or kerb).
5. **[village] Mid-pack order degrades, and the junction at s 130–150 still costs the weak AIs.**
   - `ai-game` ρ at 90 s is 0.73 (truck 0) and 0.68 (truck 4), down from 0.93/0.83. Vance sits behind Rosco/Maeve/Buster at 90 s.
   - Race rescues: Barnaby 130 → 132 → 144, Vance 151 (relaxed), Ace 204, Maeve 2197, Tilly 1388/1391. Two cars are rescued together at s 2713 (Tilly and Clementine, 0.1 s apart) and at 2686/2713 (Vance).
   - Finish order is still sensible: sim ρ 0.88.
6. **[village] The river still takes a cart at Riverside.**
   - At split 2, s 1600, steering left, the cart goes 3.7 m beyond the street edge and stays for 3.9 s until the rescue (`village-probe.txt`). The 0.5 m parapet does not hold it.
   - The main-street water mismatch is gone: s 1610–1650 projects to cobble on the main street.
7. **[corn] The wedge-and-let-go rescue is still slow (8.4–10.2 s), and a cart rubbing the corn is rescued late or never.**
   - The cart now keeps rolling at 8+ m/s, so it is not stuck. But a paddling cart can run 200 m along the corn with no correction, at 7–12 m/s (`wall.pins`, `rescuedAt` null, `latEnd` −2.5…−3.2).
   - The yaw nudge away from the corn is too weak to recentre it. This is a nit for a careful player and the AI never does it.
8. **[corn, minor] The side camera at bay exits sits at lateral 1.9 against a half-width of 1.8, 1.3 m above ground**, i.e. just inside the corn (`corn-results.json` → `cams2`, bay1-exit and bay3-exit). Chase view at the wall (`corn-cam-chase-1360-wall.jpg`) is partly covered by leaves, but the cart is readable. I did not capture a screenshot of the bay-exit side view.
9. **[all, minor] The results list is small** at 844x390 (about 1.9 u text, two columns of five). Everything is visible and the buttons are reachable, but names are tiny (`results-panel-village-844x390.jpg`).

## Fix list (concrete, actionable, ordered; name files/functions where you can)
1. **Circuit edge rescue** (`src/core/physics.js`, the `noStuckRescue` block near line 390). Count `|lateral| > hw − 0.6` (as the village/corn branch does with `_edge`) in `offAsph`, or let `stuck > 4` with the cart at the edge trigger `recover(9)`. Target: s 858 and any barrier wedge rescued in ≤ 4 s with steer held.
2. **Corn pace spread** (`src/ai/driver.js` `TRACK_CAP`, rubber band). Lift the bottom 5 AIs on corn (about +1.5 m/s on the weakest) so the ratio is ≤ 1.5 and the sim goes green. Spread the top 3 by 8–10 s each so they do not convoy (lower Maeve/Vance caps a little, or give Ace a stronger leader-ease). Re-check: a good driver wins by ≤ 60 s.
3. **Circuit start and flow** (`src/ai/driver.js` `standing`/launch). Keep the player off the lead until about 10 s (slot-4 launch penalty), and let `leaderEase` hold Ace within reach for at least one AI-to-AI lead change. Look at the 870–1160 and 1790–1860 contacts.
4. **Village early junction** (s 130–150 and 2686–2726): find what stalls Barnaby and Vance twice in the first 25 s (a hazard on the planned line, or two cars wedging at the same spot), and rescue only the rear car of a pair.
5. **Village river parapet**: make the river-side edge a `wall` at Riverside split 2 s 1560–1620 (`src/scene/tracks/village.js`, `LOWR`).
6. **Corn pin recentring** (`src/core/physics.js` wallN block): a cart that has rubbed the corn for more than 6 s should get a rescue (or a stronger yaw nudge).
7. **Corn bay-exit side camera**: clamp the side camera to |lat| ≤ hw − 0.4 and ≥ 2.4 m above ground when the cart is within 2 m of the wall.
