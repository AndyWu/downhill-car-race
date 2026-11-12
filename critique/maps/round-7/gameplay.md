# GAMEPLAY CRITIQUE — MAP ROUND 7 (corn only)
**Score:** corn 7 / 10 (round 6: 7)

Build: dev server (`npx vite --port 4612`, stopped afterwards) on HEAD `1f3d4e7`. Same harness as round 6 (`play3.mjs`: 10-car good and relaxed autopilot races, bad driving, wedge-and-hold, wall pins) plus a new `extra*.mjs` (nose-in wedges, 32 full-lock scrapes, 40 s straight paddling) and `node tests/ai-sim.mjs 3 --track=corn`.
Raw data: `screens/gameplay/corn-results.json`, `extra.json`, `extra2.json`, `extra3.json`, `ai-sim.txt`, `run-corn.log`, `corn-race-end*.jpg`.

| | r6 | r7 |
|---|---|---|
| Wedge, hands off (nose into corn) | 8.4–10.9 s | 3.1 s (90° nose-in), 3.7–3.8 s and 5.6–6.3 s (70°, two runs; the spread depends on the "live" window) |
| Scraping along the corn at 8–12 m/s with steer held (paddling or hands off) | rescued at 8.4–10.9 s or never | unchanged: hands-off rescued at 8.9–10.9 s, paddling never rescued |
| 32 full-lock paddled scrapes (12 m/s, 15 s) | – | 0 rescues on the 16 left-hand scrapes; the 16 right-hand ones are all rescued within 0.3 s (stale-state artefact of the teleport, see below); speed 8.5–11 m/s while scraping, 111–154 m in 15 s |
| 40 s straight paddling, no steer (6 starts) | – | 527–580 m, 0 rescues in 5 of 6 (one at 16.2 s, 1.7 m/s); lane wander ±3 m, 27–33 % of time in the corn, never stuck |
| Bad-driving recovery (16 trials) | 1.1 median / 1.4 max | 1.0 median / 1.4 max; solo full race 227.9 s, 0 rescues |
| Good-autopilot race, AI rescues | 8 | **10** (4 groups) |
| Relaxed race, AI rescues | 3 | 3 (Ace x2 at s 177 / 1076, Buster at 2015) |
| ai-sim rho / worst-best / lead changes | 0.88 / 1.47 / 0.0 | 0.90 / **1.48** / 0.0 |
| ai-sim Maeve vs Vance | tied 311/311 | Vance 306 < Maeve 318 (3-seed avg), Ace 279; seed 3 still 311 vs 312 |
| ai-sim AI rescues (3 seeds) | 13 | 4 |

## What works (max 3 bullets)
- **A hands-off wedge is now rescued in about 3-6 s** (r6 8-11 s) and the cart lands on the lane at lat 0 and drives off (0 re-rescues in the 16 after-rescue drives). Bad-driving recovery is 0.6-1.4 s, a sloppy solo race finishes in 228 s with 0 rescues, and 40 s of unsteered paddling never strands the player.
- **Lane fairness for the player is fine.** The good player leads from 45 s and wins by 51 s; the relaxed player finishes 3rd (303.7 s), 7 s behind Vance and Ace, and is 4th at 90 s with 5 cars within 30 m: a real fight in a one-lane map. Full-lock scrapes keep 8.5-11 m/s, so a child holding the wheel loses about a third of the speed but is not punished with a stall.
- **ai-sim improved on the AI side:** rescues 13 -> 4 across 3 seeds, Ace wins by 25 s over Vance, Vance beats Maeve on average, rho 0.90.

## Problems (ranked, most severe first)
1. **[AI, most visible] The good race still has 10 AI rescues in 4 simultaneous clusters, not "about 3".** All are 2-3 cars stalled together at lat -1.3…+0.5 on the lane centre line for 2-2.6 s and then rescued within 0.5 s of each other:
   - s 1113-1144 at t 153-156 (Barnaby, Clementine, Dot; right after bay 1040's exit ramp),
   - s 1919-1944 at t 202-205 (Rosco and Maeve, two top-4 cars),
   - s 2023-2061 at t 252-254 (Buster, Tilly),
   - s 1986-2011 at t 262-265 (Clementine, Barnaby again).
   Three of the four are within 150 m after the s 1850 bay or s 1040 bay: cars bunch in the bay, then the lane narrows from 6.9 m to 3.5 m and they wedge together. A race viewer sees two or three carts freeze side by side and teleport forward together. The relaxed race has none of this, so it depends on the player being in the pack. A replay of s 1900-1950 with the same seed was clean (non-deterministic timing), so this is a probability per bay, not a fixed spot.
   Evidence: `corn-results.json` → `race.rescues`, `race.stuckEv`; `run-corn.log`.
2. **[AI] The back half of the field is a convoy that finishes within 2.4 s.** Good race: Buster 401.3, Tilly 401.4, Dot 401.7, Clementine 402.2, Barnaby 403.7 (skills 0.50 / 0.18 / 0.40 / 0.28 / 0.05); the order of finish is not skill-ordered and Buster (0.50) is no faster than Barnaby (0.05). In the sim these five span 367-412 s, so the in-game race (with the player in the pack) collapses the spread. The front four are also not skill-ordered: Vance 293.8 vs Ace 294.0 (relaxed 296.5 vs 296.6), Ace is supposed to be the champion, and Maeve sits 37 s behind both. Evidence: `race.finish`, `relaxed.finish`. There is no overtaking except in the 4 bays, and the AI never seems to use them deliberately: the player passes 3 cars in the first 45 s and then drives alone.
3. **[sim gate] worst/best 1.48 (limit 1.5) and 0.0 lead changes.** Ace leads wire to wire (Ace 279 vs Vance 304 means no lead changes in sim); only the player produces a lead change. No margin on the assertion: a one-second change in any seed fails it.
4. **[physics, minor] Rescue is still not applied to a cart that scrapes the corn on the left edge with steer held.** Paddling pins at s 1770 and 2735 (left side) keep 8.7-12 m/s along the corn with 0 rescues; left-hand scrapes in the 32-trial test are never rescued, the same trials on the right side are. This is not a stall (the cart advances 145 m in 15 s), but the player is on the corn for 15 s and below lane speed (14-17 m/s). Hands-off scrapes are rescued only at 8.9-10.9 s.
5. **[test caveat, not a game bug]** In the first extra run, immediate (0.1-0.3 s) rescues after teleporting nose-in with the previous trial's state looked like instant rescues; with a fresh `startRace` per trial they disappear, so the progress buffer is not cleared by `teleport()`. Only matters for debug and the test harness, not a real race.

## What would raise it to 8+
- Make bay exits a non-event: in `src/ai/driver.js` (the narrow-lane "level" slow-down) start the slow-down and re-form the single file 30-40 m before each bay end (bays at s 560, 1040, 1850, 2650) and give the car behind a longer follow gap (3 m+) for the 100 m after it; target at most 1 simultaneous rescue per cluster. Acceptance: good race <= 4 AI rescues and no pair rescued within 3 s of each other.
- Break the back-field convoy: in the race, cap the speed-up of a car blocked by a slower one so skill 0.5 pulls away from skill 0.05, and let Ace/Vance prefer the bays to pass (so Ace > Vance by at least 5 s in-game, not 0.2 s). Acceptance: in-game finish spread among the 5 slowest >= 20 s, Ace finishes ahead of Vance by >= 4 s in both good and relaxed races.
- Add margin to the sim: worst/best <= 1.40 and at least 0.5 lead changes per race (a hot Vance/Maeve in the middle bays), i.e. keep Vance at Ace's pace for the first third, then fade.
- Extend the progress rescue to the left-edge scrape: rescue after 6 s of any corn contact with speed < 11 m/s, regardless of steering input.

## Score notes
- **7 -> 7:** the wedge rescue (3-6 s, was 8-11 s) and the sim rescues (13 -> 4) are real improvements, and bad driving is clean. But what a family sees in a game, the pile-ups, is unchanged or worse (10 rescues in 4 groups vs 8), the weak half is a convoy, and Vance ties Ace in-game. The sim has no margin.
