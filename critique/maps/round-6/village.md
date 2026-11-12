# VILLAGE CRITIC — MAP ROUND 6
**Score:** 8 / 10   (rounds 1-5: 5, 6, 7, 7.5, 7.5)

Build of `feat/tracks` at `30ad13b`, unmodified, scratch outDir, preview port 4591 (stopped), `?track=village&q=medium`, 800x450. Branch streets sampled with `world.track.sampleAt(s,{splitId:pathIndex})`, camera placed there (eye height and top-down). Evidence in `screens/village/`. The machine was loaded for parts of the run; the driving test is a coarse containment test, not a lap.

## Round-5 claims, verified
| Claim | Verdict | Evidence |
|---|---|---|
| Merge-end cobble tears fixed (s 715-740, 1680-1700, 2630-2660) | **Fixed at the field level, small residue.** Top-down at all six merge ends shows one continuous cobble field, no splinters or zigzag patch (`merge1-market-top`, `merge1-alley-top`, `merge2-river-top`, `merge3-market-top`). Eye height is clean (`merge1-market-eye`, `merge2-river-eye`, `merge3-river-eye`). A narrow stepped/serrated band remains along the road edge where a strip's kerb crosses the other strip (right edge in `merge2-river-eye`, `merge3-river-eye`, `main2610-eye`), and thin overlay seams are visible top-down (`mouth2-river-top`, `main2610-top`). It reads as a kerb line, not a tear. | listed |
| Main Street wedge s 2610 | **Fixed.** No offset wedge; only a faint seam line down the road in the top view (`main2610-eye`, `main2610-top`). | |
| Split mouths still clean after the UV change | **Yes.** Mouths 1, 2, 3 (s 502, 1452, 2402), both branches, show continuous cobbles and clean brick gore posts (`mouth1-market-eye`, `mouth3-market-eye`, `mouth2-river-top`). No regression. | |
| Warmer plaster | **Fixed.** Garden/alley walls are now sand-ochre, matching the houses (`merge3-river-eye`, `river2-1520`, `river3-2480`, `alley1-650`). | |
| Ivy as flat leaf cards | **Partly.** No more faceted lumps, but the cards are large, bright, saturated squares scattered like confetti (`alley1-650` right edge) rather than a climbing plant; on long walls they are sparse (`river2-1520`). | |
| Square brick gore posts | **Fixed.** Brick post with stone cap at the split-3 market mouth (`mouth3-market-eye` left) and at split 1 (`mouth1-market-eye`). | |
| River parapet physics 1.5 m | Looks right: red-brick parapet with a pale cap (`river3-2480`, `river2-1520`). In my drive probe a cart steered into the riverside wall at s 1600 and s 2480 (both directions) stopped against it and did not cross; it never left the lane (`drive.json`). Coarse test, no throttle, so no judgement on bounce. | |
| AI rescues ~3/race | **Better, target not quite met.** `ai-sim 3 --track=village`: ALL ASSERTIONS PASSED, rho 0.86 (0.87/0.82/0.88), slowest top-3 286 s vs fastest bottom-3 345 s. Rescue column sums to 13 over 9 drivers (Vance 5, Clementine 3, others 0-1), about 4.3 per race against the claimed ~3 and 6.3 last round. Round-5's failing spread is gone. | `aisim.log` |
| Rescued cars no longer land on each other | Not reproduced in this sim (no overlaps noticed); not separately tested. | |

## What works (max 3 bullets)
- **Continuous cobbles across all junctions.** The defect that cost points for three rounds is gone at mouths and merges, including the Main Street wedge.
- **Cohesive palette.** Warm plaster walls, brick parapet, houses, bunting and awnings now read as one village (`river3-2480`, `merge3-river-eye`); start and finish crowd walls with houses behind remain good (`start-back`).
- **AI race quality.** Sim passes, spread restored, rescues reduced.

## Problems (ranked, most severe first)
1. **Alley s about 590 junction still has a sheared cobble wedge.** On the left, where the alley opens onto the market pavement, a differently oriented cobble block with a stepped zigzag edge (`alley1-590.jpg`). Third round in a row; small but the player passes through it. Same stepped look, less strong, along kerbs at merge edges (`merge2-river-eye`, `main2610-eye`).
2. **Ivy cards look like green confetti.** Large, saturated, randomly tilted squares (`alley1-650`), and almost absent on long walls. Smaller, darker, denser, wall-aligned cards would read as ivy.
3. **Strip overlay seams visible from above / at kerb-height** (`mouth2-river-top`, `main2610-top`): a faint line down Main Street at s 2610 and striated gore edges. Only noticeable from a high camera.
4. **AI rescues still above target** (13 over 3 races, Vance 5). Minor.
5. **Long garden walls remain plain slabs** between doors/windows (`river3-2480` right) and river water is flat from eye height. Nits.

## Fix list (concrete, actionable, ordered)
1. `village.js` `theme.roadUV`: extend the proximity blend to the alley-to-market-pavement overlap at s 580-600 (left side); fade the blend weight to zero over the kerb-edge strip so the serrated step disappears.
2. Ivy (wall dressing in `village.js`): halve the card size, darken the green, increase count and align to the wall plane; add a plinth or cap stripe to long walls.
3. Optionally hide the overlap seam by drawing the lower strip's edge kerb only outside the other strip's footprint.
4. Look at Vance's five rescues in the `ai-sim` log (`src/ai/`).
