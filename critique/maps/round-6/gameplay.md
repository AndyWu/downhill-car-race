# GAMEPLAY CRITIQUE — MAP ROUND 6
**Score:** village 8/10, corn 7/10, circuit 8/10

Build: village and circuit from `30ad13b`, corn re-run on a fresh build of HEAD `17b24c2` (the orchestrator's corn physics fix: round-5 nudge restored, wedge rescue only below 1 m/s). Preview on port 4594, since stopped. Same harness as round 5 (10-car race with good and relaxed autopilot, bad driving, wedge-and-hold, wall pins, cameras, cost, phone, memory), plus ai-sim on four tracks, an iPad 1024x768 check and the results panel.
Raw data: `screens/gameplay/<map>-results.json`, `ai-sim-3seeds.txt`, `ipad-phone-layout.txt`, `run-*.log`. I did not re-run `tests/ai-game.mjs`: the in-game 10-car races (below) cover the same ground.

| | country | village | corn | circuit |
|---|---|---|---|---|
| ai-sim rho (r5 → r6) | 0.93 → 0.93, 1.44, ALL PASSED | 0.77 → **0.86**, worst/best 1.41, PASSED | 0.86 → 0.88, worst/best **1.47** (limit 1.5), PASSED | 0.95 → 0.89, 1.36, PASSED |
| ai-sim lead changes | 1.0 | 1.7 (r5 3.0) | **0.0** | **4.0** (r5 0) |
| Race rescues, game (good / relaxed) | – | 9 / 3 (r5 4 / 10) | 8 / 3 (r5 2 / 1) | 1 / 2 (r5 3 / 6) |
| Good autopilot vs Ace | – | −30 s (228 vs 269; Vance 238) | −55 s (239 vs 294) | −28 s (246 vs 275) |
| Relaxed driver vs Ace | – | Ace by 4.5 s | Ace by 2.6 s | Maeve, Ace, Vance all ahead: player 4th (299 vs Ace 292) |
| Bad driving, median / max recovery | – | 0.1 / 0.9 s | 1.1 / 1.4 s | 2.0 / 2.6 s |
| Wedge-and-hold rescue | – | 3.0–5.2 s | **8.4–10.9 s** | 2.4–2.6 s |
| Frame cost, calls / tris (grid) | – | 111 / 206k (r5 154/285k) | 176 / 296k (r5 221/375k) | 193 / 353k (r5 same) |
| Player first leads (good / relaxed) | – | 64.5 s / 68.6 s | 39.7 s / never | 4.9 s / 19.8 s |

## What works (max 3 bullets)
- **Circuit is now a real race and the round-5 Ace crash is gone.**
  - Sim: 4.0 lead changes per race (r5 0), Maeve and Ace within 3–5 s, rho 0.89, worst/best 1.36.
  - Relaxed in-game race: Ace finishes 292 s (r5 308.6 s) with 1 rescue and no hairpin crash. Only Dot and Ace are rescued in the whole relaxed race (2 rescues, r5 6); the good race has 1 (Ace). No AI pile-ups at the hairpin and none of the s 119–152 stalls of r5.
  - Wedge rescue is 2.4–2.6 s at every point, bad-driving recovery median 2.0 s and a full sloppy solo race finishes in 245 s with 0 rescues, so a kid-like driver does not get stuck.
- **Village sim is green again (0.86, was 0.77) and a sloppy driver is never stuck.**
  - Good player wins by 30 s with Vance second (238 s), the relaxed driver finishes second behind Ace (4.5 s). Bad-driving recovery is 0.1 s median, 0.9 s max, 0 rescues in 16 trials. Relaxed race: 3 rescues (r5 10).
  - Wedge rescue 3.0–5.2 s, unchanged.
- **UI, cameras, cost and iPad layout are clean; country is unchanged.**
  - New "Brake" label (`.sbd-hbbox`) sits at x 190–367 on iPad (1024x768), clear of both paddle boxes (left box ends x 148); no HUD overlaps on any map at 1024x768 or 844x390 (`circuit-ipad-1024x768.jpg`, `corn-phone-844x390.jpg`, `circuit-phone-844x390.jpg`).
  - Results panel fits 844x390 on all three maps once the slide-in has finished (`results-panel-circuit-844x390.jpg`). Race map, rank and lap UI fine (`circuit-map-2253.jpg`, `village-map-1575.jpg`). Cameras are fine at the problem spots (`village-cam-chase-1630-wall.jpg`, `circuit-cam2-w940-chase-wall.jpg`).
  - Frame cost flat or lower than r5 (grid frames: village 111 calls, corn 176, circuit 193). Memory flat over 5 restarts. ai-sim country: rho 0.93, ALL PASSED.

## Problems (ranked, most severe first; each: what / where (s metres, street) / evidence file / why it matters)
1. **[corn] The wedge-and-hold rescue is still 8.4–10.9 s and a cart paddling along the corn is never rescued.**
   - The fixer's "~3.5 s" is not seen after the orchestrator's physics fix. All 8 wedge trials rescue at 8.4–10.9 s (s 965, 1448, 1931, 2574, both sides), r5 8.3–10.5 s. Every `paddle` pin has `rescuedAt` null with `latEnd` ±2.5…2.8 and speed 8.3–12.9 m/s, which is r5 behaviour.
   - Evidence: `corn-results.json` → `bad.wedge`, `wall.pins`.
   - Why it matters: the fixer asked for a 3–4 s rescue and re-centring; both are unchanged. For a child holding the wheel into the corn this is a slow crawl, not a block (the lane is one-track), so not severe. This is the reason corn stays at 7.
2. **[corn] The weak AIs still pile up in pairs and triples at the same place.**
   - Good race: Dot, Barnaby and Tilly are all rescued at s 733–766 within 1.7 s (t 94.7–96.4). They all stalled at 0.3–1.2 m lateral, so it is a real pile-up on the lane centre line. Tilly and Barnaby also pair at s 200–225 at t 29–31. Dot is rescued twice within 1.7 s (739 → 739 → 766): the second landing is 27 m on, so the "28 m drop for a twice-rescued car" works, but the first rescue puts it back on the same stall at 739.
   - Relaxed: Vance is rescued twice at 900–931 (2.5 s stall at lat 0, `loops`).
   - Good race has 8 rescues (r5 2), relaxed 3 (r5 1): more rescues than r5 in total.
   - Evidence: `corn-results.json` → `race.rescues`, `race.stuckEv`, `relaxed.loops`.
3. **[corn] Still a convoy and no margin on the sim gate.**
   - Sim lead changes 0.0 and worst/best 1.47 against a limit of 1.5. Maeve and Vance tie again (311/311 in seeds 2 and 3). In-game Ace 293.8 and Vance 306.9, but at 90 s the order is Rosco, Vance, Ace, Maeve all within 40 m, so the order is not skill-ordered.
   - Relaxed player never leads (finishes 2nd, 2.6 s behind Ace); good player leads from 39.7 s.
   - Evidence: `ai-sim-3seeds.txt`, `corn-results.json` → `relaxed.pRank1`.
4. **[circuit] Ace still stalls shortly after the start line on lap 2 when a car is beside him.**
   - Relaxed: Ace swerves from lateral +3.5 to −4.7 at s 1062–1088 with Vance 2–3 m behind or alongside, drops from 11 to 0.2 m/s, drifts to −6.7 and is rescued at t 108.5 (s 1090 → 1102). Good race: a stall at s 1138, lateral +3, 2.5 s, rescued at 107.3 with Vance 5 m ahead. A replay of the same window gave a clean pass, so this is not deterministic.
   - Evidence: `circuit-results.json` → `relaxed.stuckEv`, `race.stuckEv`.
   - Why it matters: it is a single rescue per race, not the three of r5, but it is the same cause (a contested start straight). Ace's pass line should not swing 8 m across the track with a car 3 m behind.
5. **[circuit] The relaxed driver finishes 4th of 10, behind Maeve (287.6), Ace (292.3) and Vance (298.1), at 299.4 s.**
   - The player leads at 19.8 s (r5 13.4 s) in the relaxed race and then loses places. The good player leads at 4.9 s (r5 4.3 s). The slot-4 player does lead after a few seconds in the good race, but not in the relaxed race.
   - Maeve (skill 0.73) beats Ace (0.95) in the sim in all three seeds (288 vs 291). Vance is third. The order of the top two is inverted by about 3 s; lead changes come from this.
6. **[circuit, minor] A cart paddling on the grass is still never rescued.**
   - Pins at s 280 (side +1), 440 (+1, 11 s), 760 (−1, 12.5 s) keep 8–12 m/s on the infield for 100+ m. Idle carts are rescued in 2.6–5.5 s. Not a stall; a child will steer back, but it allows a shortcut.
7. **[village] Rescue pairs and simultaneous rescues remain in the good race (9 rescues).**
   - Barnaby at s 130 → 132 → 150 (t 23.5 and 25.2: second drop is 18 m, not 28 m), Dot/Clementine rescued together at s 2790 (t 322.5/322.6), Maeve at 390 and 717 (lateral 2.3 / 5.1). The relaxed race has 3 rescues, so the "~3 per race" claim holds there.
   - Village wall pins (paddling into the wall) still never rescue; idle carts also do not rescue (`latEnd` ±3 at 6–9 m/s). These are slow crawls along a wall, not stalls.
8. **[all, minor] The iPad "Brake" label is small and low contrast.** About 17 px text at the bottom edge between the paddle box and the cockpit wheel (`circuit-ipad-1024x768.jpg`): it reads, but a child could miss it. The box itself is 177x187 px, so the touch target is fine.

## Fix list (concrete, actionable, ordered; name files/functions where you can)
1. **Corn rescue** (`src/core/physics.js`, corn/wallN pin counter): the restored rule only rescues below 1 m/s, so the wedge case takes 8–11 s. Count `surface === 'corn'` with speed < 4 m/s (not 1 m/s) and |lat| > hw − 0.6 for 4 s as a pin, but keep the full-lock fix (do not fire while the player is steering away). Add the check to the wedge test: rescue ≤ 5 s.
2. **Corn AI pile-ups at s ~735 and ~200** (`src/ai/driver.js`, rescue block in `src/main.js`): when two AIs are rescued within 3 s of each other at the same s, stagger the drops by ≥ 12 m, and for a stall on the centre line drop the car 20 m on, not 2 m (Dot 739 → 739).
3. **Corn convoy** (`src/ai/driver.js` `TRACK_CAP`): give Maeve about −2 % so she is not tied with Vance and add ≥ 1 s margin at the weak end so worst/best ≤ 1.45.
4. **Circuit Ace on the start straight** (`src/ai/driver.js` pass-line): do not move the pass line more than 3 m laterally within 25 m with a car behind; cap lateral rate for the top AI.
5. **Circuit Maeve vs Ace** (`TRACK_CAP` circuit): trim Maeve about 1 s/lap so Ace wins the sim in at least 2 of 3 seeds, keeping the lead changes.
6. **Circuit infield** (`src/core/physics.js`): a cart more than 3 m beyond the barrier line with no wheel on asphalt for more than 6 s gets `recover(9)`.
7. **Village rescue spacing** (`src/main.js` rescue block): make a twice-rescued car drop 28 m (Barnaby dropped 18 m).
8. **iPad Brake label** (`src/ui/index.js` `.sbd-hbbox`): raise the label contrast and size by about 30 %.

## Score notes
- **Circuit 7 → 8:** the round-5 blockers are gone (Ace relaxed-race crash, lead changes 0 → 4.0, rescues 3/6 → 1/2, no hairpin pile-ups, kid-like solo run clean, wedge 2.4–2.6 s). It stays at 8, not higher, because Ace still stalls once near the line on lap 2 and the relaxed driver ends 4th behind Maeve.
- **Village 8 → 8:** sim is green again (0.86) and relaxed-race rescues fell from 10 to 3, but the good race has 9 rescues (r5 4) and rescue pairs remain, so no move up.
- **Corn 8 → 7:** wedge rescue is 8.4–10.9 s (the claimed ~3.5 s is not observed), rescues rose (good 2 → 8, with a three-car pile-up at s 733–766), the sim has no margin (1.47 / 1.5) and 0 lead changes, and the convoy remains.
