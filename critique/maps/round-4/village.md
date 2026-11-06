# VILLAGE CRITIC — MAP ROUND 4
**Score:** 7.5 / 10   (round 1: 5, round 2: 6, round 3: 7)

Build of `feat/tracks` at `e7d038a`, unmodified, preview on port 4551, `?track=village&q=medium`, 800x450. Branch streets were sampled with `world.track.sampleAt(s, {splitId: pathIndex})` (path 1/2 = the two branches), with the camera placed there while the cart was teleported beside it. Evidence is in `screens/village/`.

## Round-3 claims, verified
| Claim | Verdict | Evidence |
|---|---|---|
| River water no longer covers Main Street (s 1609-1682, 2562-2643) | **Fixed.** Cobbles all the way across in chase and top views, no water on Main Street, no grey slab in the middle of the street. | `main-chase-1620/1650/1675.jpg`, `main-chase-2570/2610/2640.jpg`, `main-top-1645.jpg`, `main-top-2600.jpg` |
| Main Street stalls removed, AI rescues about 5 per race | **Mostly.** `ai-sim 3 --track=village` passes all assertions, rho 0.88. Rescues over 3 seeds: 20 (Vance 8, Tilly 4, Clementine 4, Dot 3, Rosco 1), so about 6.7 per race, against 13 in round 3. Top three finish 265-293 s, bottom three 346-389 s. | `aisim.log` |
| Gentler split-2 alley steps | **Fixed.** Scripted drives, speed-hold and gain 3.0 ("sloppy") both go through the alley s 1410-1730 in 19.4 s with no stall, min speed 10.4 m/s. In round 3 the alley took 26.8 s and stalled at 0.14 m/s. All routes driven are 19.4-21.9 s (split-3 river lane run did not finish in the time available). | `drive4.log` (8 routes, plus split 3 river not finished, `slow: []`) |
| 0.9 m walls and crowd at start and finish | **Fixed.** Brick wall with a readable START/FINISH gantry and a crowd that no longer towers over the wall. It is still a brick corridor with open fields behind it. | `start-chase.jpg`, `finish-chase.jpg`, `finish-eye.jpg` |
| Chunky rubble | **Fixed.** Grey stones with volume on Main Street and in the alleys. | `appr1-m15.jpg`, `alley1-eye-590.jpg` |
| Darker drooping willows | **Fixed.** Dark green drooping strands on a trunk. They are no longer mint balloons. | `river2-willow-1560.jpg`, `river3-eye-2500.jpg` |
| Fingerposts earlier | **Fixed.** A fingerpost is at the gore tip of split 2 and split 3, visible from the mouths. The overhead banner is large and legible at -45 m. | `mouth2-river.jpg`, `mouth3-river.jpg`, `appr2-m45.jpg` |
| Cameras clamped in village streets | **Fixed in the places I checked.** No chase or cockpit view ends up inside a house. | `main-chase-*.jpg`, `alley2-chase-1592.jpg`, `river2-chase-1580.jpg` |

## What works (max 3 bullets)
- **The branch streets are now the strongest part.**
  - The alley is tight and plaster-coloured, with beams, bunting and a worn plinth (`alley2-steps-1585.jpg`, `alley2-chase-1592.jpg`, `alley2-eye-1660.jpg`).
  - The riverside lane has a brick parapet, visible water, a footbridge and dark willows (`river2-willow-1560.jpg`, `river3-eye-2500.jpg`).
  - The market is a wide paved plaza (`river3-eye-2540.jpg`).
- **Main Street is clean for the whole length, and the river fix means no more flooded-road look.** The forks are signposted far enough ahead (`appr2-m45.jpg`).
- **Balance and containment hold.** Every route is within 2.5 s of the others, there are no stalls, and the alley is forgiving.

## Problems (ranked, most severe first)
1. **Torn and overlapping cobble texture at every junction mouth and merge.**
   - **What:** Where a branch strip overlaps Main Street, the cobble pattern shears into stepped rectangles and diagonal tears across the whole road width, 5-10 m long.
   - **Where:** s about 506 (split 1 mouth), 730 (split 1 merge), 1456 and 1692 (split 2), 2406 and 2650 (split 3); also Main Street at s about 2610 on the right (`main-chase-2610.jpg`).
   - **Evidence:** `mouth1-alley.jpg`, `mouth1-market.jpg`, `mouth2-river.jpg`, `mouth3-river.jpg`, `merge2-river.jpg`, `merge3-river.jpg`, `alley1-eye-710.jpg`.
   - **Why it matters:** It was already listed in round 3 and is unchanged. Players see it six times a race, and on the Market it is the most visible flaw left.
2. **Hatched plank wedges and floating wall stubs at wall ends.**
   - **What:** The diagonal striped wedge at the ends of the gore walls is still there. In the alley at s about 590 a plaster wall slab stands out from the house line with a thin beam above it.
   - **Evidence:** `mouth2-river.jpg` (left of the gore), `alley1-eye-710.jpg` (both wall ends), `alley1-eye-590.jpg`.
3. **Long blank grey walls.**
   - **What:** The non-water side of the river lane, parts of the alleys and some gores are blank slate-grey walls with no windows, doors or plants.
   - **Evidence:** `river2-eye-1560.jpg`, `river3-eye-2500.jpg`, `river2-chase-1580.jpg`, `main-chase-1650.jpg` (right), `main-chase-2570.jpg`.
4. **Start and finish are still a brick corridor with an empty field behind.** It is much better than round 3 but plain. The street ends in open grass and a few trees (`start-chase.jpg`, `finish-chase.jpg`).
5. **AI rescues remain at about 6.7 per race.** Vance has 8 across 3 seeds. A target of 5 or fewer per race is not yet met, and the clusters were not located this round.
6. **Smaller items:**
   - The river water is very dark and flat from eye height (`river2-eye-1560.jpg`).
   - From the main road the branch mouths hide behind houses at -15 m (`appr1-m15.jpg`, `appr3-m15.jpg`).
   - Tight top-view geometry: floating roof patches over the s 2635 merge (`top3-merge.jpg`).

## Fix list (concrete, actionable, ordered)
1. **Junction texture (`village.js`, branch strip mouths):**
   - Fade the branch road strip with alpha or a UV-aligned blend over its first and last 8-10 m.
   - Or snap the branch strip's UVs to Main Street's cobble phase there.
   - Or cut the Main Street strip out under the branch overlap so two cobble layers never share a pixel.
   - Check at s 506, 730, 1456, 1692, 2406, 2650 and 2610.
2. **Wall ends:** replace the hatched wedge with a square post and the plinth material (as the gore posts already are); give the alley s 590 slab a house front behind it or remove it.
3. **Blank walls:** add doors, windows, vines or washing lines to long garden walls, especially the river lane's non-water side (s 1500-1600, 2450-2560).
4. **Start/finish backdrop:** add a back row of houses or hedge behind the wall so the corridor ends in village, not field.
5. **AI rescues (`src/ai/`, gameplay fixer):** identify Vance's clusters from the `ai-sim` rescue log (8 over 3 seeds) and move or narrow whatever is there; goal 5 or fewer per race.
