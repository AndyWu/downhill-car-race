# VILLAGE CRITIC — MAP ROUND 5
**Score:** 7.5 / 10   (rounds 1-4: 5, 6, 7, 7.5)

Build of `feat/tracks` at `88fe5fc`, unmodified, built to a scratch outDir, preview on port 4571, `?track=village&q=medium`, 800x450. Branch streets were sampled with `world.track.sampleAt(s, {splitId: pathIndex})` and the camera placed there. Evidence is in `screens/village/`. The machine was heavily loaded (load average 14), so no full-route scripted drives were repeated this round. `ai-sim` ran under that load, so its timing-sensitive numbers are less reliable.

## Round-4 claims, verified
| Claim | Verdict | Evidence |
|---|---|---|
| Junction cobble UVs blended, no tears | **Mostly fixed, not fully.** The mouths are now clean: the split 1, 2 and 3 mouths show one continuous cobble field with no tears (`mouth1-market.jpg`, `mouth1-alley.jpg`, `mouth2-river.jpg`, `mouth2-alley.jpg`, `mouth3-market.jpg`, `junc1-mouth-top.jpg`, `junc2-mouth-top.jpg`). The merges are still torn. `merge1-market.jpg` and `alley1-eye-710.jpg` show diagonal splinters and sheared cobbles across the full width at s about 715-730; `merge2-river.jpg` shows a zigzag stepped patch on the right at s about 1680; `merge3-river.jpg` and `main-chase-2610.jpg` show a smaller offset wedge on the right edge of the road. The tears are roughly half the size and strength of round 4 but are still visible at 3 of 6 junction ends. At the alley s 590 (`alley1-eye-590.jpg`) a differently oriented cobble wedge shows at the left. | listed |
| Skirt wedges removed | **Fixed.** No hatched plank wedges at the gore walls (`mouth2-river.jpg`, `junc1-merge-top.jpg`). Walls end in a clean brick end face. | |
| Alley/garden walls with windows, doors, flower boxes, ivy | **Fixed in part.** Walls now carry windows, doors and flower boxes (`river2-eye-1520.jpg`, `river3-eye-2480.jpg`, `merge2-river.jpg`). The colour is a cool blue-grey, not warm plaster. The ivy is a few faceted green lumps that look pasted on (`alley1-eye-650.jpg` right). Long runs are still flat slabs (`merge3-river.jpg` right, `mouth3-market.jpg` left). | |
| Houses and hedge behind start and finish crowd | **Fixed.** Looking back from the start there are timber-framed houses with shutters behind a red-brick crowd wall with a hedge (`start-back.jpg`). The finish is a street with houses at the end (`finish-chase.jpg`). | |
| Riverside wall 1.25 m, softer puddles | Visually fine: the brick parapet reads as a wall and the water is lighter (`river2-eye-1520.jpg`, `river3-eye-2480.jpg`). I did not test the physics. | |
| AI rescues about 4.7 per race | **Not met.** 19 rescues over 3 seeds, so 6.3 per race (Vance 7, Buster 3). Round 4 was 6.7. | `aisim.log` |
| Village mid-pack AI spread | `ai-sim` **FAILS**: mean Spearman 0.77 (< 0.8). Seed 1 rho was 0.55 (Rosco and Buster, skill 0.5-0.6, finish last at 397 s). Seeds 2 and 3 were 0.88. The slowest top-3 is 290 s against the fastest bottom-3 at 347 s. Round 4 passed at 0.88. This may be load noise (82 s wall), but it is a regression against the last report. | `aisim.log` |

## What works (max 3 bullets)
- **Junction mouths and the riverside lane.** Clean continuous cobbles at all three mouths. The riverside lane has a brick parapet, water, willows and a footbridge, and the doors and windows on the wall opposite break up the flat surface (`river3-eye-2480.jpg`).
- **Start and finish.** A crowd on a brick wall with a hedge, with houses behind. This reads as a village square and not a field any more (`start-back.jpg`, `finish-chase.jpg`).
- **Main Street and the alleys.** Dense houses, awnings, bunting and signs, with no stretch of Main Street that looks unfinished.

## Problems (ranked, most severe first)
1. **Cobble tears remain at the merge ends (s about 715-730, 1680-1692, 2630-2650) and as a wedge on Main Street at s about 2610.** Roughly half as bad as round 4, but it is the same defect, shown to the player 3 times a race in the junction the camera looks at (`merge1-market.jpg`, `alley1-eye-710.jpg`, `merge2-river.jpg`, `merge3-river.jpg`, `main-chase-2610.jpg`). The mouths prove the blend works; the merge side needs the same treatment.
2. **AI target missed and spread regressed.** 6.3 rescues per race against a claimed 4.7. Vance, the top-3 driver, has 7 over 3 seeds. Mean rho 0.77 fails the sim. Evidence: `aisim.log`.
3. **Garden and alley walls are still large flat blue-grey slabs with a few features.** The windows and doors help, but the colour does not match the warm plaster of the houses, and the ivy is faceted lumps (`alley1-eye-650.jpg`, `mouth3-market.jpg`, `merge3-river.jpg`).
4. **Alley s 590 junction wedge.** A differently oriented cobble block on the left, where the alley meets the market pavement (`alley1-eye-590.jpg`).
5. **Minor:** gore wall ends at the split 3 market mouth are an unfinished-looking grey box with a brick stub (`mouth3-market.jpg` left); river water is flat from eye height.

## Fix list (concrete, actionable, ordered)
1. **`village.js` branch strips:** apply the shared world-frame UV blend to the strip END (merge) as well as the start, at s 715-740, 1680-1700, 2630-2660. Check Main Street s 2605-2615 too. Re-shoot with `sampleAt(s,{splitId:pathIndex})` at those s values.
2. **Wall materials (`village.js`):** use the warm plaster tint and a lighter wash, and replace the ivy lumps with a flatter leaf plane; add a cap or plinth stripe to long garden walls.
3. **Gore end at split 3 market mouth:** square brick post, like the other gores.
4. **AI (`src/ai/`):** locate Vance's 7 rescues in the `ai-sim` rescue log and rerun `ai-sim 3 --track=village` on an idle machine; check whether the seed-1 rho of 0.55 repeats before concluding it is a regression.
