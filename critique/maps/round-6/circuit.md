# CIRCUIT CRITIQUE — MAP ROUND 6
**Score:** 9 / 10   (round 1: 5, round 2: 7, round 3: 7, round 4: 8, round 5: 8)

**Build:** `feat/tracks` at `30ad13b`, built to a scratch outDir and served with `vite preview` on port 4593 (`?track=circuit`, now stopped). Physics at q=low/norender via `__game.advance()` with a pursuit-steer harness (aim at the centreline N m ahead, gain 1.6, handbrake pulses for braking); views at q=medium 800x450. The machine was heavily loaded (load 13-21), so the timing matrix is smaller than in round 5. Scripts are scratch files outside the repo.

## Round-6 claims, checked
| Claim | Result |
|---|---|
| Gravel starts at the hairpin arc entry, grip 0.25 | **Verified visually.** From above (`day-hairpin-above.jpg`) the pale gravel strip begins at the straight/arc join on the outside and runs the whole arc. In chase it reads as a brown-grey strip between kerb and tyre wall (`day-chase-s0431.jpg`, `day-hairpin-entry-low.jpg`). |
| Flat out now costs 1-2 s against braking (s 370 to 520, 16 m/s entry) | **Verified, with a caveat.** Table below: braked clean 10.35-10.6 s; flat out 11.1-14.4 s depending on look-ahead, median about 12.4 s. The gap is +0.75 s at best, +2 s typical, +4 s sloppy. Every flat-out run ended up on gravel and the tyre wall (max lateral 11-12 m). In round 5 a precise flat-out line (11.65 s) beat braking (12.4 s); that inversion is gone. |
| Crawl/grass rescue ~4.5 s | **Verified.** See rescue table. |
| No-input cart at lat 7, s 430 | **Fixed.** Round 5: bounced 8 s unrescued. Now lifted to asphalt at 4.0 s (both sides, s 430/450/480). |
| Wedge rescue at s 858 | **Verified.** Lat +/-4.7 and +/-6: lifted to s 867 at 4.0-4.1 s, all four cases. |
| Brighter night moon fill | **Verified.** `night-chase-s0431.jpg`: red body, tan wheels and yellow driver read against the blue asphalt. Still the darkest object on screen, but clearly readable. Hairpin from above at night (`night-hairpin-above.jpg`) shows asphalt, kerbs and gravel as separate tones. |
| AI: no corner passes, no pile-ups at the hairpin | **No pile-up seen.** 3 laps, 5 AI: in the hairpin window (lap s 370-520) the AI never dropped under 3 m/s and never touched gravel, wall or grass (0.0 s over the whole race), max 3 AI in the window at once. Lead changes and pole order are the gameplay critic's area; my run had the player in front from the start, so I could not observe lead changes. |

## Hairpin timing, s 370 to 520, 16 m/s entry
| Style | Time | Min speed | Surfaces |
|---|---|---|---|
| Brake to 14 m/s, look-ahead 12 | 10.35 s | 12.2 | asphalt only, max lat 2.1 |
| Brake to 11.5 m/s, look-ahead 12 | 10.6 s | 11.2 | asphalt only, max lat 3.6 |
| Brake to 13 m/s, look-ahead 12 | 11.6 s | 6.8 | pulse overshoot ran wide: 27 grass samples (harness artefact) |
| Brake to 14 m/s, look-ahead 16 | 13.65 s | 0.4 | wide, max lat 7.7 (late-turn artefact) |
| Flat out, look-ahead 8 | 14.35 s | 5.0 | 79 gravel, 59 wall, 18 grass samples |
| Flat out, look-ahead 12 | 13.6 s | 5.2 | 74 gravel, 50 wall, 17 grass |
| Flat out, look-ahead 16 | 11.55 s | 7.3 | 72 gravel, 11 wall, 14 grass |
| Flat out, look-ahead 18 | 12.35 s | 4.9 | 62 gravel, 36 wall, 3 grass |
| Flat out, look-ahead 22 | 12.05 s | 5.0 | gravel + wall |
| Flat out, look-ahead 25 | 11.1 s | 6.4 | gravel + wall |
| Flat out, look-ahead 30 | 13.0 s | 6.4 | 85 gravel, 33 grass, 22 wall |

Sloppy line for a kid (flat out, ordinary steering): 13.6 s, i.e. about 3.3 s lost against a braked line. It always finished the section; it never stayed pinned. The lucky best case (look-ahead 25, 11.1 s) loses only 0.75 s because slamming through the gravel and wall scrub still keeps 6 m/s; a precise braked line is still the fastest in every run.

## Gravel and wall escape, rescue, stuck checks (stationary or paddling, no steering)
| Case | Rescued to asphalt |
|---|---|
| No input, s 430 lat +7 (grass) / -7 (gravel), s 450 lat +7, s 480 lat +7 | 4.0 s each, never stuck |
| Paddling, s 430 lat +8.8 (wall, grass) | 4.7 s |
| Paddling, s 430 lat -8.8 (gravel) | 4.0 s |
| Paddling, s 480 lat +9 (wall, grass) | 4.5 s |
| s 858 lat +4.7 / -4.7 / +6 / -6, no input | 4.0 / 4.0 / 4.1 / 4.0 s, to s 867 |
| No-input coaster entering the hairpin at 10 m/s from s 340 | rolls straight into the outside gravel (about 4 s of gravel samples) and is lifted back |

Nothing was stuck in any run. Rescue puts the cart up to 50 m ahead on the asphalt at a standstill; that is fair for a family game.

## Laps with AI
Pursuit autopilot with full paddle and handbrake braking before the hairpin, 5 AI, q=low: finished 3 laps in 211.9 s (lap changes at 65.1 s and 125.7 s), 1st place, no page errors. At 160 s the fastest AI was at s 1996 against the player at 2568, so the AI are far slower than a competent player (about 600 m or half a lap), which is a pacing point for the gameplay critic.

## What works (max 3 bullets)
- **The hairpin now has a real brake-here moment.** Gravel from the arc entry, low grip and the tyre wall make flat out lose roughly 1-4 s, braked lines stay clean asphalt, and a mistake never traps a kid (`day-chase-s0392.jpg` shows the clear straight approach, `day-hairpin-above.jpg` the gravel run-off).
- **Recovery is complete and fast.** Gravel, grass, wall and the s 858 wedge all lift the cart in 4.0-4.7 s on both sides, including the no-input case that failed in round 5.
- **Night is readable.** The cart, kerbs and gravel separate from the asphalt (`night-chase-s0431.jpg`, `night-hairpin-above.jpg`, `night-hairpin-entry-low.jpg`).

## Problems (ranked, most severe first)
1. **Flat out is only 0.75 s slower in the best case.** A kid who ploughs straight through gets a fair penalty (about 2-3 s typically), but a lucky wide line through the gravel loses little. Minor design nit; acceptable for a forgiving game.
2. **Night cart is still the darkest object in frame** (`night-chase-s0431.jpg`). Readable, taste point only.
3. **AI is much slower than a competent player** (about 600 m behind after 160 s). Belongs to the gameplay critic.
4. **Not rechecked this round:** grid frame cost and AI headlight haze (cross-scope, unchanged by this fix).

## Fix list
1. (Optional) Raise gravel drag slightly so a lucky wide flat-out line costs at least 1.5 s, or accept it.
2. (Optional) Slight rim light on the night cart.
3. (Gameplay) Check AI pace on circuit against a braking human line.
