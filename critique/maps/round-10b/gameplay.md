# GAMEPLAY CRITIQUE — MAP ROUND 10b (corn only)
**Score:** corn 9 / 10 (round 10: 8)

Build: dev server (`npx vite --port 4692`, stopped afterwards) on corn-r10 HEAD `86ec5b8`. Scripts and raw data in `screens/gameplay/` (`race.mjs`, `analyze.mjs`, `extra.mjs`, `race-*.json`, `extra.json`, `ai-sim-3.txt`, `ai-sim-8.txt`, race-end jpgs). Container restarted mid-run; the races were rerun/continued, nothing was reused from a different build.

Harness notes: the race driver is deterministic, so "good" and "goodb" are the same trajectory (291.5 s both, only one counted). The extra ~300 s races are the noisy "relaxed" driver with two seeds. In-game, 10 carts, `ai=9`, truck 4, q=low.

## Results (in-game, 10 carts)
| run | human | AI rescues | doubles <10 s | stalls >=2 s | clusters (>=3 carts) | rescues <60 s | AI-only Spearman | lead changes | order |
|---|---|---|---|---|---|---|---|---|---|
| fast | 243.0 s | 0 | 0 | 0 | 0 | 0 | 0.92 | 2 (Rosco, Vance 17 s, You 77 s) | You, Vance 272.5, Ace 287, Rosco 315, Maeve 315.7, Buster, Tilly, Dot, Clem, Barnaby |
| mid (~270) | 260.8 s | 0 | 0 | 0 | 0 | 0 | 0.97 | 4 (Ace 28, You 31, Vance 53, You 86) | You, Vance 280.3, Ace 282.7, Maeve 314.4, Rosco 318.3, Buster... |
| good (~300) | 291.5 s | 0 | 0 | 0 | 0 | 0 | 0.97 | 1 (Vance 32 s) | Vance 275.5, Ace 283.3, You, Rosco 313.1, Maeve 313.8, Buster... |
| relaxed seed a | 290.1 s | 0 | 0 | 0 | 0 | 0 | 0.93 | 1 (Vance 17 s) | Vance 273, Ace 277.9, You, Maeve 312.5, Rosco 316.7... |
| relaxed seed c | 314.5 s | 1 (Rosco) | 0 | 0 | 0 | 0 | 0.98 | 1 (Vance 17 s) | Vance 272.9, Ace 277.5, Maeve 314.1, You 314.5, Rosco 317.9... |

Round 10 for comparison: 15 AI rescues / doubles / 3-5 cart clusters / Maeve 9th / Spearman 0.62 at 302 s. Now: 1 rescue in 5 races (about 1500 car-minutes), zero doubles, zero stalls >= 2 s, no rescue in the first 60 s, Ace always top 2-3, Maeve always ahead of Buster/Dot/Clementine/Tilly/Barnaby, Spearman 0.92-0.98 (all >= 0.85). Every "to reach 9" target from round 10 items 1-3 is met at 243, 261, 290, 291 and 314 s human paces.

ai-sim: `ai-sim 3 --track=corn` worst/best 1.31, rho 0.92, 0.7 lead changes, slowest AI 131 m in 20 s, ALL ASSERTIONS PASSED. 8 seeds: worst/best 1.32, rho 0.93, 1.4 lead changes, ALL ASSERTIONS PASSED.

## What works
- **The AI field is robust against human pace.** The clusters at s 250-320 and 470-515 are gone at all five paces, and the order follows skill. The fix (no AI-AI momentum exchange, field-average rubber band, level-rule floor, no wedge rescue for AI) addressed the real cause.
- **Variety survived.** Three different leaders across the five races (Rosco off the grid, Ace, Vance, the human); the human wins at 243 and 261 s, finishes 3rd-4th at 290-314 s with Maeve/Rosco fighting within 0.1-6 s of the human (relaxed c: human 314.5 vs Maeve 314.1, a real photo finish).
- **Held-wheel behaviour keeps the edge-riding feel.** Full lock 12 s at 4 spots x 2 sides (`extra.json`): 0 rescues, settles at +-1.0 to +-1.2 m at 12 s at speed 10-11.5 m/s.

## Problems (ranked)
1. **[Feel, minor-moderate] Hands-off lane nudge reads as the game steering.** Test: cart pushed 1.4-2.8 m off centre then wheel released (`extra.json` `nudge`). At s 300 it returns to +1.0 m and stays; at s 900 and s 1500 it does not stop at 1.0 m on its own side but sweeps through the middle and settles at -0.95 to -1.0 m on the OTHER side within about 3-5 s (starts 1.4-2.8 m). It never sits dead centre (it parks at +-1.0 m), so it is not "centring the cart", but crossing the lane on its own with the wheel released is visible game driving, and a player who lets go to the right would not expect to end up on the left. It only acts with the wheel within 0.12 of centre, so a player who is steering is never fought. Acceptable for a family game and arguably needed to stop a hands-off cart in a bay bend running into the far wall; I would soften it (lower gain, or damp so it stops at the first crossing of 1.0 m rather than overshooting) before calling it fully clean. The owner explicitly does not want the game centring the cart, so this is the most visible remaining item.
2. **[Held wheel, minor] s 2600 peak is still 4.2-4.4 m** (target <= 2.5 m): peaks 3.8 m at 4-6 s, then 2.7-3.1 m at 8-9 s before recovering to 1.2-1.4 m at 12 s, no rescue. The bay edge here is wide; other spots peak 2.4-3.1 m.
3. **[Drama, minor] Lead stays with Vance from ~17-32 s onwards in all four 290-314 s races** (only 1 lead change; the human is 3rd with Vance and Ace 17-25 s ahead). It is a fair, clean race (the human fights Maeve/Rosco behind), but the front is decided early. At 243-261 s the race is much livelier (2-4 lead changes, human vs Vance within 3 m at 90 s).
4. **[Not verified] "Ghosting" of AI carts.** I did not capture a visual of two AI carts overlapping; I did not run a dedicated contact test. Evidence is indirect: zero stalls/rescues from pairs, so the lack of momentum exchange is working; whether pairs visibly interpenetrate (versus slide past) was not judged visually. Human-vs-AI contact is unchanged (still exchanges momentum per the code), which is the contact a player actually sees.
5. **[Test coverage]** relaxed seed c had one AI rescue (Rosco), single, not early, no double: within target.

## Ghosting / drama / nudge answers
- Ghosting: not visually verified (item 4); no mechanical sign of trouble (0 stalls). Recommend one screenshot check of two AI carts side by side if the owner has seen odd overlaps.
- Lane nudge: mostly not "game centring" (parks at +-1.0 m, only on a released wheel), but it can carry the cart across the lane; see item 1.
- Racing drama: good at fast and mid pace, adequate at ~300 s (a real fight behind and for the human's own position, but the front pair is gone early).

## To reach 10 (not required)
1. Make the hands-off nudge stop at the first crossing of +-1.0 m instead of crossing the lane.
2. Peak lateral at s 2600 under held wheel <= 2.5 m.
3. Keep the leaders closer through the mid-race (Vance/Ace gap is 5-8 s at the finish, 17-25 s ahead of a 300 s human at mid-race).
4. Verify AI-AI contact visually.

## Score notes
- **8 -> 9:** the top round-10 issue (clustered stalls, doubles, rescued leaders, inverted order at a mid-pace human) is fixed and held across five in-game runs at 243-314 s and in both ai-sim runs; every numeric target met. Held back from 10 by the hands-off lane nudge crossing behaviour, the s 2600 held peak, an early-decided front at ~300 s, and unverified AI-AI visual overlap.
