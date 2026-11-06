# CIRCUIT CRITIQUE — MAP ROUND 4
**Score:** 8 / 10   (round 1: 5, round 2: 7, round 3: 7)

**Build:** `feat/tracks` at `e7d038a`, built to a scratch outDir and served with `vite preview` on port 4553 (`?track=circuit&autostart=1`). q=low at 640x360 for driving, q=medium at 960x540 for views. Evidence is in `screens/circuit/`.

## Round-3 claims, checked
| Claim | Result |
|---|---|
| Gravel counts for the pinned-cart rescue | **Verified.** Idle in gravel at s 444.6 is lifted in ~3.5 s (`gravel-idle`). Nose-in pins at s 440/445/452/458 (paddling, no steer) are all rescued at t = 4.3–4.5 s. |
| Rescues advance past the hairpin exit | **Verified.** Every rescue landed at s 477–480, lat 0, heading dot 1.00. Round 3 landed at s 454 with the cart still in the bend. |
| No-steer paddler re-trapped | **Not re-trapped.** After the rescues it was not pinned in the hairpin. A no-steer paddler then runs off at the next bend and ends on the grass at s 573–595, lat +10 to +11.5 (20 s window). That is expected for a cart that never steers. The T1 pin was rescued to s 308 and was not re-pinned. |
| Wall hits | Outside hairpin hits at s 452 (14 m/s) and s 460 (15 m/s) were back on the asphalt in 2.5 s and 2.7 s with the autopilot, no rescue needed. Round 3 could not get out in 8 s. |
| Gravel drag 0.6 and brown tint | Drag verified in play: the gravel-paddle case was rescued and was at 9.7 m/s again 15 s later. The tint reads as a dry-brown strip beside the kerb (`day-chase-s0431.jpg`, `day-chase-s0451.jpg`). It is visible but looks like dead grass, not gravel. |
| Night light pools replaced by ribbon, none within 26 m | **Verified.** No polygon pools. At the hairpin and at s 758 and s 900 the road has a soft blue wash with readable edge lines and kerbs (`night-chase-s0451/0758/0900.jpg`). The grid cockpit no longer glows: the road is dark and the paddles are normal (`night-cockpit-s0000.jpg`, `night-cockpit-s0120.jpg`). |
| Roof lamps instead of a streak | **Verified.** The long streak is gone. At s 120 there are small lamp dots under the roof (`night-cockpit-s0120.jpg`). |
| Billboards skipped at s 436–520 | **Verified.** The cockpit at s 480 shows only a red barrier band, no BOLTS & CO (`day-cockpit-s0480.jpg`). The board still appears on the back straight, as intended (`lap-chase-s2807.jpg`). |
| Finer run-off grass | **Verified.** Low view at the hairpin shows a tight blade texture, not a smear (`day-free-runoff-low.jpg`). |

## What works (max 3 bullets)
- **The hairpin soft-lock is gone.** Idle, paddling or nose-in, a cart is lifted back to the asphalt past the bend in about 4.5 s. Wall hits recover on their own in under 3 s.
- **Night now looks finished.** The grid, hairpin and back straight read as moonlit asphalt with clear lines and kerbs, and the gantry, grandstand and bunting are legible (`night-free-floodlight-check.jpg`, `night-free-grandstand.jpg`). The glare is gone.
- **Three clean laps.** An autopilot ran 3 full laps in 224 s with no rescues. Lap chips changed at s 1073.9 and s 2151.1 (`lap-chip-Lap23.jpg`, `lap-chip-Lap33.jpg`), max |lat| was 1.98, and every sample was on asphalt. Lap times were about 76, 71 and 70 s. No page errors in any run.

## Problems (ranked, most severe first)
1. **The hairpin no longer rewards braking.** Time from s 370 to s 520 entering at 16 m/s:

   | Style | Time | Min speed |
   |---|---|---|
   | Flat out with pursuit steering | 10.60 s | 12.0 m/s |
   | Braking autopilot, alat 7 | 10.35 s | 10.9 m/s |
   | Braking autopilot, alat 5 | 11.15 s | 9.4 m/s |
   | Brake to 10 m/s | 11.55 s | — |
   | Brake to 8 m/s | 12.95 s | — |

   Flat out, with a wall and gravel brush on the way (30 gravel, 28 wall and 22 grass samples), costs only 0.25 s over the best braking line, and it is 2.3 s faster than a cautious brake to 8 m/s. The gravel comment in `circuit.js` still says "costs ~2 s". It is forgiving for kids, but the one braking point on the lap is now pointless, and a careful child is punished. Wall scrub only drops the cart to 12 m/s.
2. **The no-steer paddler is never re-rescued while moving.** `state.pin` only counts `speed < 1.5`, so a cart rolling along the grass at 2–4 m/s after the hairpin rescue is left alone (s 573–595, lat +10 to +11.5). That is acceptable for this map. It is worth watching on the gameplay side.
3. **The night cart is still a dark silhouette.** There is no rim or fill on it in chase view (`night-chase-s0900.jpg`, `night-chase-s0451.jpg`). The road is fine, but the cart is the least readable thing on screen.
4. **The gravel reads as dead grass.** Look at the left of `day-chase-s0431.jpg`. From above, `day-free-hairpin-above.jpg`, it is almost indistinguishable from the surrounding grass. At night the ribbon's straight start and end cut-offs are visible from above (`night-free-hairpin-above.jpg`), which is only a nit.
5. **Cost (cross-scope).** The grid frame cost is unchanged from round 3 and is a gameplay and LOD matter.

## Fix list
1. (Circuit fixer, `gravelAt()` / gravel surface in `circuit.js`) Raise the hairpin gravel drag, or give a short speed penalty at the wall, so flat out costs about 1.5–2 s over braking. Update the stale comment either way.
2. (Circuit fixer, night) Add a faint cool rim light or emissive lift on the cart, or a small `PointLight` carried with it, so it stands out at night.
3. (Circuit fixer) Use a lighter, more mineral gravel tint with larger flecks. Soften the ribbon's start and end ramp.
4. (Gameplay fixer, optional) Count slow movement (< 4 m/s) on `grass` or `gravel` for more than 8 s toward the pin timer on the speedway.
5. (Gameplay fixer) Use vehicle LOD for grid carts.
