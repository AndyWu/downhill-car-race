# CIRCUIT CRITIQUE — MAP ROUND 5
**Score:** 8 / 10   (round 1: 5, round 2: 7, round 3: 7, round 4: 8)

**Build:** `feat/tracks` at `88fe5fc`, built to a scratch outDir and served with `vite preview` on port 4573 (`?track=circuit`). q=low 640x360 for physics and laps, q=medium 800x450 for views. Evidence in `screens/circuit/`. Measurements were run in-page with `__game.advance()` and a pursuit-steer harness (aim at the centreline 12 m ahead, steer gain 1.6); the harness scripts were scratch files and are deleted.

## Round-4 claims, checked
| Claim | Result |
|---|---|
| Hairpin gravel s 392–502 drag 1.5 plus barrier scrub: flat out should cost more than braking | **Partly.** Time s 370 → 520 at 16 m/s entry (table below). A precise flat-out line is still the fastest (11.65 s), never touches gravel or wall and keeps 9.5 m/s. A sloppy or wide line is now punished hard. Braking never pays on a clean line. |
| Gravel escape and rescue | **Verified.** Idle in the gravel on the outside (lat −8.8, s 430/450/480) is lifted back to asphalt at 4.2 s every time. Idle against the wall on the other side: 4.8 s. A paddling cart in gravel is back on asphalt at 4.2 s (s 450, gravel side). |
| Wedge rescue at s 858 (|lat| > hw−0.6), both sides | **Verified.** Half-width is 5.0. Placed at lat ±4.7, ±5.2 and ±6.0, stationary: rescued to s 867 at 4.0–4.1 s, all six cases. Placed at speed 3 pointing out: grass at lat ±7.7, then lifted at 4.0–5.0 s. Nothing stayed pinned in 8 s. |
| Barrier scrub must not make normal contacts sticky | **Verified.** On the s 640 straight, a 12 m/s cart touching the barrier at 6° and 15° (both sides) is back inside the lane in 0.2–0.4 s and still has 11.8 m/s after 0.3 s, 10.7 m/s after 3 s (ordinary rolling decay). No sticking, left and right identical. |
| Circuit moon fill so carts read at night | **Verified.** The cart now shows red body, tan wheels and a yellow driver against the blue road in chase view at s 451, 758, 900 (`night-chase-s0451.jpg`, `night-chase-s0758.jpg`, `night-chase-s0900.jpg`). It is no longer a black silhouette. It is still the darkest object on screen, but it reads. |
| Widened night-ribbon fades | **Verified.** From above (`night-free-hairpin-above.jpg`) the ribbon is a smooth soft-edged band, and the hard start and end cut-offs seen in round 4 are gone. Only a faint straight edge remains where the hairpin ribbon meets the straight, at the right of the frame. |
| Paler, finer gravel | **Verified.** From above (`day-free-hairpin-above.jpg`) the gravel is a clear grey speckled strip between kerb and wall, easy to tell from the green run-off. In chase view (`day-chase-s0431.jpg`, `day-chase-s0451.jpg`) it reads as a pale brown-grey strip. Round 4 called it "dead grass"; it is no longer. |
| Camber 10 % | Not visually judgeable; no banked-road artefacts in any chase or cockpit shot. |
| AI lapped-car gap fix | **No errors.** 3 laps with 5 AI carts finished with no page errors; the AI ended 1 to 2 laps behind (s 1593–2242 against the player at 3215) with no wedging or ghosting seen. I could not see the gap code itself in play. |

## Hairpin timing, s 370 → 520 at 16 m/s entry (pursuit steering, handbrake pulses for braking)
| Style | Time | Min speed | Notes |
|---|---|---|---|
| Flat out, tight line (look-ahead 12 m) | 11.65 s | 9.5 | asphalt only, max lat 2.7 |
| Flat out, look-ahead 18 m | 11.90 s | 8.3 | asphalt only, max lat 5.1 |
| Flat out, look-ahead 22 m (wide) | 13.00 s | 6.9 | max lat 6.5 |
| Flat out, look-ahead 25 m | 13.65 s | 6.4 | 12 grass samples |
| Flat out, look-ahead 30 m (very wide) | did not finish in 18 s | 0 | 86 grass + 1 wall samples, rescued |
| Brake toward 13 m/s, look-ahead 12 | 12.40 s | 8.8 | handbrake pulses |
| Brake toward 11 m/s | 13.75 s | 7.7 | |
| Brake toward 9 m/s | 15.75 s | 6.3 | |
| Brake toward 11 m/s, look-ahead 18 | 13.05 s | 7.4 | |

The pulsed handbrake overshoots its target (min speeds are below the target), so the braking rows are pessimistic. Even so, a clean flat-out line beats every braking style I tried by at least 0.75 s. A steering mistake at speed now costs 1.3 s up to a full rescue, which is a real penalty and it is only the gravel and wall scrub, not braking, that provides it.

## What works (max 3 bullets)
- **Recovery is now complete and symmetric.** Gravel, wall, grass and the barrier wedge at s 858 all lift the cart back to the asphalt in 4–5 s on both sides, and ordinary barrier touches do not stick (`day-chase-s0431.jpg` shows the hairpin run-off).
- **Night looks finished.** The track is readable moonlit asphalt, the cart reads against it, and the grid with headlight haze and gantry is atmospheric (`night-chase-grid-natural.jpg`, `night-chase-after6s.jpg`, `night-free-grid-front.jpg`, `night-cockpit-s0451.jpg`).
- **Three clean laps.** Pursuit autopilot with full paddle finished 3 laps in 177.7 s (lap changes at s 1073 / 2146, at 58.7 s and 113.7 s), took 1st place of 6, zero respawns, no page errors. It was an aggressive run: about 9 s of gravel, 5 s of wall and 5.5 s of grass samples out of about 180 s, with max |lat| 12, and it still never needed a rescue.

## Problems (ranked, most severe first)
1. **The hairpin still does not reward braking on a clean line (design nit).** A precise flat-out line is 0.75–4 s faster than any braked line and never touches gravel (table above). Only an imprecise line is punished. For a family game this is forgiving and arguably fine, but the intended "brake here" moment does not exist for a precise driver. The code comment on `gravelAt()` ("costs ~1.5-2 s over a braked line") is still not true for a clean line, and the fixer's own figure (+0.5 s) differs from mine in the same direction: flat out is never worse than braking on a good line.
2. **A no-input cart at the hairpin drifts to the outside wall.** From idle at lat 7 at s 430 the cart bounced between asphalt and grass for 8 s without being rescued (it moves at 0–2.3 m/s, so the crawl timer never accumulates). Only reachable for a cart that never steers or paddles, so it is a nit.
3. **The night cart is still the darkest thing on screen**, and the grid chase view has a heavy cream haze from the AI headlights (`night-chase-s0000.jpg` with AI behind the camera, `night-chase-grid-natural.jpg`). It is readable and reads as headlight fog, so it is not a defect, only a taste point.
4. **Cost (cross-scope).** The grid frame cost is unchanged and belongs to the gameplay critic and LOD work.

## Fix list
1. (Optional, design) Make the brake-here moment real: add a wall scrub or a gravel start at the hairpin entry line (s ~385–400 is probably still asphalt) so a line that carries 20 m/s into the apex ends in gravel, or accept the forgiving behaviour and fix the `gravelAt()` comment to say so.
2. (Nit, `core/physics.js`) Count slow movement (< 2.5 m/s) on the asphalt of the hairpin outside edge toward the pin timer, or accept it for a no-input cart.
3. (Nit) Lift the night cart slightly more (rim light) if a stronger read is wanted.
