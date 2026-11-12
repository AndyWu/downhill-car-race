# GAMEPLAY CRITIQUE — MAP ROUND 8 (corn only)
**Score:** corn 7 / 10 (round 7: 7)

Build: dev server (`npx vite --port 4632`, stopped afterwards) on HEAD `17b865d`. Same harness as round 7 (`play3.mjs` race/relaxed/bad/wall + `extra.mjs`), plus `node tests/ai-sim.mjs 3 --track=corn`.
Raw data: `screens/gameplay/corn-results.json`, `extra.json`, `ai-sim.txt`, `run-corn.log`, `corn-race-end*.jpg`.

| Target (from r7) | r7 | r8 | met? |
|---|---|---|---|
| Good race AI rescues <= 4, none within 3 s of another | 10 (4 groups) | **6 events** (Rosco 81 s, Dot 101.5+101.7, Tilly 204.7, Dot 285.2+285.5), no two different cars within 3 s | partly: 4 incidents, but 2 are the same cart rescued twice in 0.2-0.3 s |
| Relaxed race AI rescues | 3 | **1** (Clementine 285 s; Barnaby, Tilly stalled 3 s beside her, not rescued) | yes |
| 5 slowest spread >= 20 s | 2.4 s (convoy) | good 57 s (355.7-413.0), relaxed 70 s (352-422) | yes |
| Ace ahead of Vance >= 4 s, both races | 0.2 s | good 22.2 s (274.6 / 296.8), relaxed 38.9 s (284.5 / 323.4) | yes |
| worst/best <= 1.40 | 1.48 | sim 1.49 (all 3 seeds 1.44-1.53); in game AI-only 1.50 (413.0 / 274.6), 1.71 with the player | **no** |
| Some lead changes | 0 sim | sim 0.0; in game 2 (good) and 1 (relaxed), all caused by the player | no (sim) |
| Finish order vs skill (Spearman, 9 AI) | not skill-ordered | good race 0.77, relaxed 0.93; sim 0.88 | better, good race still has inversions |

## What works (max 3 bullets)
- **The AI field is now a field.** Ace beats Vance by 22-39 s, the five slowest spread 57-70 s instead of finishing in a 2.4 s convoy, rescues fall from 10 to 6 (good) and 3 to 1 (relaxed), no two different carts are rescued together, and the relaxed race is skill-ordered (rho 0.93). The player passes the whole pack in the good race (leads from 54 s, wins by 33 s) and is 2nd in the relaxed race (301.5 s, 17 s behind Ace and 22 s ahead of Vance).
- **Human recovery is much better.** 32 full-lock scrapes keep 8.6-13.3 m/s and advance 137-173 m in 15 s (r7: 8.5-11 m/s, 111-154 m). A held lock to the left never pins the cart (0 rescues, drives off at 10-14 m/s), nose-in hands-off wedges are rescued in 3.7-3.8 s, bad-driving recovery is 0.5 s median / 0.8 s max (r7 1.0 / 1.4), and the solo race is 227.9 s with 0 rescues. 40 s of unsteered paddling covers 499-602 m (r7 527-580), 0-1 rescues, 4-9 s in the corn, never stuck.
- **Pile-up pattern changed:** the four 3-car freezes after the bays are gone from the good race. Only one 2-car stall remains (Tilly + Clementine at s 1702, 2.5-3.2 s, one rescue).

## Problems (ranked, most severe first)
1. **[AI / sim] No margin and no drama in the sim: worst/best 1.49, 0 lead changes.** `ai-sim` prints ALL ASSERTIONS PASSED only because the limit is 1.5; the three seeds are 1.44 / 1.53 (seed 2: Barnaby 423 vs Ace 277; the assertion averages). Ace 277 / Vance 300 / Maeve 318 are identical in every seed, so the front three never change places without the player; the back six finish 391-423 s. A viewer who watches an AI-only race sees the same order every time. Evidence: `ai-sim.txt`.
2. **[AI] Same cart double-rescued within 0.2-0.3 s (Dot at s 702->704->737, s 2115->2117->2132).** The first rescue puts the cart down at lat 0 and the next tick counts it as stalled again (`respawns` increments twice), so the cart jumps 33 m then 15 m forward. It is two "rescues" for one incident, inflates the count to 6 (target 4), and the double jump is visible. Looks like a stale progress/pin timer after `recover()` (the same non-cleared buffer I noted in r7, now hitting the AI). Evidence: `corn-results.json` → `race.rescues`.
3. **[AI] Good-race order still has skill inversions.** Buster (0.50) 333.8 ties Maeve (0.73) 334.1; Tilly (0.18) 355.7 beats Rosco (0.62) 364.6 and Clementine (0.28) 365.1; Barnaby (0.05) 405.4 and Dot (0.40) 413.0 are last. Spearman 0.77 (sim 0.88). The cause is the player pack (mid cars get the pace lift / rubber band, Maeve is held down by it), but the ordering of the middle is still pile-up luck rather than skill. The relaxed race has the same shape, so it is not only luck: Barnaby = Tilly 422 s, Dot = Clementine 387 s.
4. **[AI, minor] Triple stalls with one rescue.** Relaxed race: Clementine/Barnaby/Tilly stalled together at s 2245-2247 for 2.5-3 s (t 282.6); only Clementine is teleported (285.1) which un-jams the rest. Sim seed 1: Barnaby/Tilly/Buster stalled 4-6 s at s 649-689. So the stagger works but the stall itself (a 3-car jam on the first bay exit at ~s 650 and at 2245) is still there; it is just resolved faster.
5. **[test caveat, not a game bug]** `teleport()` still leaves the progress buffer, so a nose-in wedge test that starts right after another trial is rescued in 0.1-0.3 s (all right-side wedge/pin trials in `extra.json`, `corn-results.json` → `wall.pins`). Kept out of the numbers above; the fresh-state results are the idle wedges (3.7-3.8 s) and the left-side runs.

## Is the human-only corn assist fair?
Mostly yes. It only acts while a wheel is more than ~0.35 m into the corn (steer fade, nose swing about 23 deg/s, inward push capped at 2.5 m/s of drift). It does not add speed: full-lock scrapes still run at 8.6-13 m/s against 14-17 m/s on the lane, the player is slower while rubbing the corn and a straight-paddling cart spends 4-9 s of 40 in the corn. It is also not a rubber band: the good player's lead comes from a 228 s solo line, not from the assist, and the relaxed player (more corn contact) finishes 2nd, 17 s behind Ace, which is the right place for a sloppy-but-trying child. The edge over the AI is the rescue: AI carts that wedge wait 2-3 s for the stagger rule or are teleported, while a human is slid back out, and AI carts get no push at all (bump each other more in a dense pack). That is a few seconds per incident, which is below the 22-39 s Ace/Vance margins and the pack gaps, so it is not decisive. Does it feel like an invisible hand? When paddling straight into the wall the cart slides sideways back to the lane and the steering input is ignored for the last bit; a player who steers "into the corn" on purpose will find the cart refuses, which feels like bumper-car steering rather than a hand pushing from behind. I consider this fine for a family game and consistent with the stated goal (kids are not punished with a stall). Suggestion: also give AI carts the steer fade (not the push) so the corn behaves the same for everybody, which would remove most of the remaining 2-car stalls.

## Other checks
- Wall-hit launch: max vertical speed 1.14 m/s, 0.46 m air above ground over 80 wall hits (no launches). Solo bad-driving: 16 trials, 0.5 s median recovery. Race UI (rank/lap) updates (rank 5/10 at 30 s, 1/10 from 60 s; the "Lap 1/3" label is shown on a 1-lap map, a minor carry-over, not scored).
- Rescues after teleport in the wall/wedge sections are the stale-state artefact (see 5).

## What would raise it to 8+
- Fix the double rescue (clear the progress buffer / pin timers inside `recover()` for AI carts; `src/core/physics.js` rescue block around the `_pwN` buffer) so the good race is <= 4 rescues counted per incident.
- Give the sim margin: worst/best <= 1.40 (pull Barnaby/Dot up 15-20 s or lift the whole back field's cornTop), and give Vance a hot window (e.g. rubber band him within 10 s of Ace for the first third, or reduce Ace's cornTop) so `ai-sim` shows >= 0.5 lead changes per race without the player.
- Reduce middle inversions: stop the back-field pace lift from raising Buster/Tilly above Maeve/Rosco; target good-race Spearman >= 0.85.
- Optional: AI steer-fade in the corn to remove the remaining 2-3 car stalls at s ~650 and ~1700/2245.

## Score notes
- **7 -> 7:** real, measured gains (Ace/Vance 0.2 -> 22 s, convoy 2.4 -> 57 s, rescues 10 -> 6 and 3 -> 1, human scrape and wedge recovery clearly better), so it is a strong 7. Not 8 because the sim still sits at 1.49 with zero lead changes (an explicit 8+ target, 1.40 and some lead changes), the double rescue makes the good race 6 events against a target of 4, and the middle of the field is still partly random.
