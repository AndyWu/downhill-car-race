# GAMEPLAY CRITIQUE — MAP ROUND 5
**Score:** village 8/10, corn 8/10, circuit 7/10

Build: HEAD `88fe5fc`, scratch build, `vite preview` on port 4574. Same harness as round 4 (10-car race with a good and a relaxed autopilot, bad-driving/wedge/wall/pin runs, cameras, cost, phone, memory) plus `ai-sim 3 --track=<id>` (village, corn, circuit, country), `ai-game 0,4`, the circuit/village probes, a replay of the circuit relaxed race around Ace's crash, and the results panel at 844x390.
Raw data: `screens/gameplay/<map>-results.json`, `ai-sim-3seeds.txt`, `ai-game.txt`, `circuit-probe.txt`, `village-probe.txt`.

| | country | village | corn | circuit |
|---|---|---|---|---|
| Sim ρ (r4 → r5) | 0.93 (unchanged, 272.9 s, ALL PASSED) | 0.88 → **0.77 (seeds 0.55/0.88/0.88)** | 0.87 → 0.86 | 0.92 → **0.95** |
| Sim assertions | pass | **FAIL: mean ρ 0.77 < 0.8** | **pass** (worst/best 1.49, limit 1.5; r4 1.69) | pass (1.37) |
| Sim lead changes | 1.0 | 3.0 | 0 | 0 |
| ai-game ρ at 90 s (truck 0 / 4) | – | 0.88 / 0.90 (r4 0.73/0.68) | 0.85 / 0.87 | 0.93 / 0.87 |
| Race rescues, game (good / relaxed) | – | 4 / 10 (r4 5/5) | 2 / 1 (3/2) | 3 / 6 (6/4) |
| Good autopilot vs Ace | – | −35 s (227 vs 262; Vance 237) | −46 s (239 vs 285; r4 −74) | −19 s (249 vs 268) |
| Relaxed driver vs Ace | – | Ace wins by 8 s | Ace wins by 6 s | **player wins by 11 s because Ace crashes** |
| Bad driving, median / max recovery | – | 0.1 / 0.9 s | 1.1 / 1.4 s | 2.0 / 2.6 s |
| Wedge-and-hold rescue | – | 3.0–5.2 s | **8.3–10.5 s** | **2.4–2.8 s (s 858: never → 2.5 s)** |
| Frame cost, calls / tris (grid → road) | – | 154/285k → 67–152 / 109–287k | 221/375k → 82–186 / 134–248k | 193/352k → 66–161 / 155–295k |
| Player first leads (good / relaxed) | – | 129 s / – | 39.5 s / – | 4.3 s / 13.4 s |

## What works (max 3 bullets)
- **Circuit barrier wedge is fixed and recovery is uniform.**
  - Wedge-and-hold at s 858 (both sides) is rescued in 2.5 s (r4: never). Every wedge test on the lap is now 2.4–2.8 s.
  - Bad driving recovers in a median 2.0 s, max 2.6 s. Hairpin gravel pins on the outside of the bend are rescued in 2.5 s.
  - Evidence: `circuit-probe.txt`, `circuit-results.json` → `bad.wedge`, `wall.pins`.
- **Village is a proper race and the corn spread is back inside the limit.**
  - Village: the good autopilot wins by 35 s, Vance is 9.5 s behind, 8 lead changes, the relaxed driver is second behind Ace by 8 s. Wedge rescue is now 3–5 s (r4 ~8 s). `ai-game` ρ rose from 0.73/0.68 to 0.88/0.90.
  - Corn: sim passes (worst/best 1.49). The weak AIs are no longer left behind (Dot 408 s, Ace 285 s), and the good player's margin fell from 74 s to 46 s. The relaxed driver still loses narrowly to Ace.
  - The corn bay-exit side camera is fixed: it sits inside the lane at 2.3 m above ground and the cart is clearly visible (`corn-cam2-bay1-exit-side-wall.jpg`, `corn-cam2-bay3-exit-side-wall.jpg`).
- **Cameras, phone UI, results and cost are good on all three maps, and country is unchanged.**
  - The results panel fits 844x390 on all three maps (`results-panel-*-844x390.jpg`) and the phone HUD has no overlaps (`*-phone-844x390.jpg`).
  - Frame cost is flat against r4 (grid frame ≤ 221 calls / 375k tris; road frames 66–186 calls). Memory is flat over 5 restarts.
  - `ai-sim --track=country`: ρ 0.93, 272.9 s, ALL PASSED, identical to r4.

## Problems (ranked, most severe first; each: what / where (s metres, street) / evidence file / why it matters)
1. **[circuit] Ace wrecks himself on lap 3 when he is right behind the player.**
   - **What happened:** In the relaxed race, Ace trails the player by 1–6 m at the hairpin exit (s 2694, lap-relative about 534).
     - His speed falls from 9.8 to 5.8 m/s and he drifts to lateral −3.3 asphalt, then −7.3 on grass, where he stalls at 0.2 m/s. Rescue at t 259.8 (s 2732 → 2749).
     - A second stall on asphalt at s 2763 with Vance 0–2 m alongside (0 m/s for 2.5 s, rescue at 265.5). A third rescue follows at s 3068 (t 297).
     - Total: three rescues and about 40 s lost. Ace finishes 308.6 s (268 in the good race). The relaxed player wins by 11 s, third behind Maeve and ahead of Ace.
   - **Evidence:** `circuit-results.json` → `relaxed` (`rescues`, `stuckEv`, `loops`); a per-0.5 s replay of Ace and the cars within 25 m was taken from the same race (numbers above). The sim, where Ace is never near the player, has 0 rescues for him.
   - **Why it matters:** The follow/gap logic added for lapped cars (or its braking) makes the best AI brake and veer when a car is a few metres ahead. It appears in the most common case, a child driving just ahead of Ace. The rival's collapse is what makes the relaxed player win.
2. **[village] `ai-sim --track=village` fails its own assertion.**
   - Mean ρ is 0.77 < 0.8 (seed 1 is 0.55: Rosco and Buster are last at 397 s while Tilly, Dot, Clementine and Barnaby finish 341–365 s; seeds 2 and 3 are 0.88). r4 passed at 0.88.
   - Ace and Vance finish within 0–3 s of each other in every seed (270/270, 275/275, 263/266), which is a convoy.
   - The in-game checks look fine (`ai-game` ρ 0.88/0.90, race order Ace, Vance, Maeve, Rosco, Buster in the good race). The sim is the project's gate, so this is a regression to fix.
3. **[village] Weak AIs still pair-rescue on hazards, and the relaxed race has 10 rescues.**
   - Barnaby/Tilly at s 1616–1632 (steps and rock hazards on Riverside split 2), Clementine at 2565 → 2594 (stalls at 2557 and 2582, lateral 0, split 3), Barnaby at 3040 → 3056.
   - Each is a pair of rescues 1.6–2.5 s apart: the rescue lands 12 m on, the cart is stuck again and is rescued again.
   - The good race has 4 rescues, so the fixers' "~4.7 per race" holds only there. Not serious, but a rescue landing on or behind a centre-line stall repeats.
4. **[village] The river at Riverside split 2, s 1600, still takes a cart on the left.**
   - 3.7 m beyond the street edge for 3.4 s, then rescue (`village-probe.txt`). At s 1520 holding left rescues in 12.2 s, and at s 2480 holding left on split 3 is never rescued (rubbing the wall at 0.3 m beyond the edge).
5. **[corn] The wedge-and-hold rescue is still 8.3–10.5 s, and a cart paddling along the corn is never rescued.**
   - The fixer's "wedge rescue 4 s" does not show up (r4 8.4–10.2 s). Pins `rescuedAt` is null for every paddling case: the cart rubs the corn at 8.3–9.5 m/s for 200 m with `latEnd` −2.5…−2.8, so re-centring is not visible (idle pins end at −2…+1.6, as in r4).
   - For a child it is a slow 8 m/s crawl, not a block; the lane is single-track so there is no obvious escape.
6. **[corn] The corn field still convoys.**
   - Sim finish times for Maeve/Vance are identical (320/320, 311/311, 311/311) and in the game Ace and Vance finish at 285.0/284.8. The weakest three are still at s ~500 at 90 s in `ai-game` truck 0 (Barnaby 510, Dot 498, Tilly 496, versus Clementine 745), though they recover in the race. Sim lead changes are 0 and worst/best is 1.49 against a limit of 1.5: no margin.
7. **[circuit] The grid start still means little, and AI-to-AI lead changes remain 0 in the sim.**
   - The player in slot 4 leads after 4.3 s (relaxed 13.4 s; r4 3.4/7.2). Ace's wire-to-wire lead is unchanged; Maeve is within 4–8 s of Ace (286/291, 285/289, 286/294), which is a good chase, but there are no passes.
8. **[circuit] Asphalt mid-lap rescues of AI are not gone.**
   - Both races have the same first-corner stall: Barnaby at s 139–152 (good) and Vance/Barnaby at 119–134 (relaxed), asphalt, lateral 1.7–1.9, 2.5 s stuck. Also Vance at 1468, Maeve at 2001/554. Rescue counts are 3/6 (r4 6/4), so it is a wash, but the 120–150 corner is a repeat.
9. **[circuit, minor] A cart paddling on the grass off the track is never rescued** while it keeps 8–12 m/s (`wall.pins` at s 440/465/760/280, side 1, paddle). It drives 100+ m through the infield. A child will steer back, but nothing stops a shortcut.
10. **[all, minor] The results list is small** at 844x390 (about 1.9 u text, two columns of five). Everything fits and the buttons are reachable.

## Fix list (concrete, actionable, ordered; name files/functions where you can)
1. **Circuit Ace crash behind the player** (`src/ai/driver.js`, the same-lap gap/following logic added in round 4). Reproduce with the relaxed autopilot (`critique/maps/round-5/screens/gameplay/circuit-results.json` → `relaxed.rescues`). Check why a top AI with a car 1–6 m ahead slows to 5.8 m/s and veers 3 m off line at the hairpin exit (s ~534 of lap 3). Do not let following/avoidance reduce target speed below the race pace, or steer off the asphalt, by more than a small amount. Add a check to `tests/ai-game.mjs` or the sim: Ace's rescues with the player 1–5 m ahead = 0.
2. **Village sim ρ** (`src/ai/driver.js` profiles / `TRACK_CAP` for village). Seed 1 puts Rosco and Buster last; lift them or lower the weakest AIs' lateral risk so mean ρ ≥ 0.8 and separate Ace and Vance by 6–10 s. Re-run `node tests/ai-sim.mjs 3 --track=village` until green.
3. **Rescue landing on a hazard** (`src/main.js` rescue block near line 763, `v.ai.rescueAhead`). When a car is rescued twice within 3 s, drop it 25–30 m ahead on its own line, or past any hazard whose s lies within 15 m of the drop point (village stalls at 2557/2582, steps at 1592).
4. **Corn wedge/crawl rescue** (`src/core/physics.js`, the corn/wallN pin counter near line 412–420). Count `surface === 'corn'` with speed < 9 m/s and |lat| > hw − 0.6 for 4–5 s as a pin, so holding the steer into the corn is rescued in about 5 s and paddling along it is nudged back to the lane (or the yaw nudge is doubled).
5. **Corn convoy** (`src/ai/driver.js` `TRACK_CAP`): give Maeve about −2 % so she is not tied with Vance, and add a 1 s margin to the weak end so worst/best is ≤ 1.45.
6. **Circuit start** (`src/ai/driver.js` standing launch): keep the slot-4 player off the lead until about 10 s (`leaderEase` so Ace stays within 1–2 s), and add a short contact-avoid at s 119–152 where Vance/Barnaby stall.
7. **Village river parapet** (`src/scene/tracks/village.js`, Riverside split 2, s 1560–1620): make the left edge a solid wall; check the s 2480 split 3 left-wall rubbing never rescues (add `wall` surface pin to the rescue rule).
8. **Circuit infield** (`src/core/physics.js`): a cart more than 3 m beyond the barrier line moving at speed with no wheel on the asphalt for more than 6 s gets `recover(9)`.
