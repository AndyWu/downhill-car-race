# VILLAGE CRITIQUE — MAP ROUND 2
**Score:** 6 / 10   (round 1: 5/10)

Method: fresh build of `feat/tracks` at `60975f6` (unmodified), `vite preview`, `?track=village&q=medium&ai=0`, 640×360 (signs also checked at 1024×576).
I took 28 cockpit shots of Main Street every 120 m (`main-*.jpg`, with HUD) and 5 eye-height shots on each of the 6 branch streets (`br<split>-<path>-<kind>-s<S>.jpg`, camera placed with `world.track.sampleAt(s,{split:path})`).
Each split has approach shots at −60/−36/−15/−2 m (`approach*`). Each junction has views from 35 m up, 75 m up and far (`junc*-top35`, `junc*-top`, `junc*-far`), plus cockpit-height views of every merge from every path (`junc*-merge-from*-cockpit`).
Rivers were shot from above and from the parapet (`river*`). I also shot start/finish/church, rain and dusk (`rain-*`, `dusk-*`).
I drove all 9 routes with `setDebugInput`, using a closed-loop steering controller toward `sampleAt(s+8,{split:path})` and paddling both sides, from `fromS−40` to `toS+30` (`drive*-N.jpg`).
`tracks-clearance.mjs village`: ALL OK (1305 props grounded, clear lane ≥ 4.10 m).

Drive results. Time in seconds; the time on the intended path (from `project()`) is in brackets.

| split | Main Street | path 1 | path 2 |
|---|---|---|---|
| 1 (500–740) | 20.3 | Market 20.3 (13.6 on 1:1) | Back Alley 21.6 (15.7 on 1:2) |
| 2 (1450–1700) | 20.1 | Riverside 19.7 (14.6 on 2:1) | Back Alley **25.3** (19.3 on 2:2) |
| 3 (2400–2660) | 25.1 (one run dropped to 1.07 m/s, 1.1 s "stuck"; a re-run only dipped to 5.3 m/s at s≈2640) | Market 20.6 | Riverside 20.5 |

The cart always stayed on its chosen path: no wall hits (`maxOff` ≤ 0.23 m) and no rescues.

## Round-1 status
- **Fixed:** start and finish (problem 2).
  - START arch, bunting, waving crowd and a house closing the view behind the grid (`main-0010.jpg`, `start-behind-back.jpg`).
  - FINISH arch with a chequered line, a bigger crowd and a town hall closing the street (`main-3200-finish.jpg`, `finish-beyond.jpg`).
- **Fixed:** hazard props.
  - Stalls and barrels now sit flat on the cobbles. There are no cobble cones under them and no cart shafts poking through the player (`br1-1-market-s620.jpg`, `br3-1-market-s2582.jpg`).
- **Mostly fixed:** street edge (problem 5).
  - There is now a light kerb stone, a pavement strip and a vertical plinth wall instead of the sheared half-pipe (`main-1090.jpg`).
- **Partly fixed:** branch identity (problem 1).
  - Market Square is now a real place: a paved apron, low parapets, striped-awning stalls with goods and villagers, and bunting (`br1-1-market-s620.jpg`, `rain-market1-s620.jpg`).
  - Riverside Lane now has a water channel, a brick parapet and willows, but this is only visible from above or from the chase camera (`river2-f35-high.jpg`, `river2-f60-sideL.jpg`).
  - The Back Alleys are unchanged.
- **Partly fixed:** life.
  - There are crowds at start and finish and villagers at stalls.
  - At dusk the lamp heads glow faintly, but windows stay dark (`dusk-cockpit-s1090.jpg`).
- **Not fixed:** junction geometry (problem 3), one-house-deep set (problem 6), race map (problem 8), route balance (problem 9).
- **New in this round:**
  - Signpost banners exist, but their text overlaps.
  - The split-2 alley is now 5 s slower than Main Street.

## What works (max 3 bullets)
- **Start and finish are now real events.** The arch and banner, bunting, two walls of waving spectators, a chequered line, and a building closing each end of the street give the race a beginning and an end (`main-0010.jpg`, `main-3200-finish.jpg`, `rain-cockpit-s20.jpg`).
- **Market Square reads as a market.** It is wide and paved, with awning stalls stacked with produce, barrel and crate stacks as obstacles, bunting, and low parapets opening the space. It is the one branch a child would recognise as "a different street" (`br1-1-market-s620.jpg`, `br3-1-market-s2530.jpg`, `drive1-market-1.jpg`).
- **Clean to drive, with tidy props.**
  - All 9 routes run at about 10–18 m/s with no wall contact.
  - The clearance script passes.
  - Main Street now has a kerb, a pavement and a plinth instead of the skate-ramp berm.
  - Rain is still atmospheric (`rain-chase-s520.jpg`, `rain-cockpit-s1090.jpg`).

## Problems (ranked, most severe first)
1. **Every junction mouth is still a mess of sheared cobble pyramids and broken wall pieces. This is unchanged from round 1.**
   - **What and where:** Where the plinth walls of two roads meet, the terrain forms tall cobble-textured sawtooth ramps and pyramids right beside the racing line. This happens at all 6 junctions, at s 500, 740, 1450, 1700, 2400 and 2660.
   - **Evidence:**
     - Mounds: `main-1450.jpg` (right), `main-1690.jpg` (2 m sheared ramp, left), `main-0730.jpg`, `approach1-m2.jpg`, `approach2-m2.jpg`, `approach3-m2.jpg`.
     - Pyramid at the alley mouth: `br1-2-alley-s572.jpg`.
     - Torn road texture: `br1-1-market-s529.jpg` and `br1-2-alley-s529.jpg`.
     - Floating V-shaped wall piece and a hovering slab: `junc2-merge-from1-cockpit.jpg`.
     - Sheared wedges seen while driving: `drive2-river-3.jpg`, `drive2-alley-4.jpg`.
   - **Why it matters:** The junction is the map's signature moment, and the player sees it 6 times per race at cockpit height. It is the most "broken-looking" thing in the game.
2. **The Back Alleys still have no identity: a 3 m-wide trench between 2 m grey plank walls.**
   - **What and where:** Both alley paths (split 1 path 2, split 2 path 2) are a corridor of identical grey vertical-board walls, with houses set back behind them (`br1-2-alley-s620.jpg`, `br1-2-alley-s668.jpg`, `br2-2-alley-s1480.jpg`, `br2-2-alley-s1625.jpg`, `br2-2-alley-s1670.jpg`, `drive2-alley-3.jpg`).
   - **Missing:** At these sample points there are no washing lines, no arches over the alley, and no house fronts tight to the lane. The arches and washing lines in code (`inSpan(road, ±1, …)`) rarely trigger because the frontage seldom fills both sides.
   - **Why it matters:** "Back Alley" is a third of the route choices, and it looks like a storm drain.
3. **The river is invisible from the driver's seat, and its trees are toy balls.**
   - **Where:** The water strip sits 0.3 m below the road, 1–6 m beyond a 0.9 m brick parapet. From cockpit height (1.15 m) you see a brick wall and some trees, never water (`br2-1-river-s1525.jpg`, `br2-1-river-s1575.jpg`, `br3-2-river-s2478.jpg`, `drive2-river-1.jpg`, `drive3-river-1.jpg`).
   - From above it reads well as a canal (`river2-f35-high.jpg`, `river3-f60-high.jpg`).
   - **Trees:** The "willows" are smooth pastel-lime sphere clusters that look like balloons (`river2-f35-sideL.jpg`, `rain-river2-s1575.jpg`).
   - **Footbridge:** I did not see the footbridge in any shot.
   - **Other side:** The non-river side is long blank grey garden walls (`br3-2-river-s2530.jpg`, `river3-f35-sideR.jpg`).
4. **The signposts are unreadable: their text overlaps.**
   - **What:** The banners 34 m before each split print "▲ Main Street" on top of the left-column names (`sign1-ipad-m47.jpg`: "Back Alley" collides with "Main Street"; `sign2-ipad-m48.jpg`: same with "Riverside Lane").
   - **Cause:** Both side streets compute as "left", so the left column has 2 lines while the centre has 1, and the centred text is not clipped against the left column.
   - **Size:** At 640×360 the banner is unreadable before you pass under it (`approach1-m60.jpg`).
   - **Approach:** From 15 m out you still cannot see that the road forks; the branch mouths hide behind houses (`approach1-m15.jpg`, `approach3-m15.jpg`).
5. **Route balance contradicts the labels and got worse.**
   - The split-2 Back Alley ("Shortest") took 25.3 s against 20.1 s for Main Street and 19.7 s for Riverside, a 5 s penalty for the "short" route. In round 1 the penalty was about 1.5 s.
   - The split-1 alley is +1.3 s.
   - Market Square at split 1 is no faster than Main Street (20.3 vs 20.3), so "Wide and straight" earns nothing.
   - In one of two runs, the split-3 Main Street run dropped to 1.07 m/s near the s 2606 "rock" (25.1 s). The rock itself is only a cobble bump with no visible rock prop (`main-2606-rock-chase.jpg`).
6. **Gore wedges between diverging streets are still bare grass.** They are now fenced by plank walls, but they remain empty lawn or green slabs visible from the chase camera (`junc1-merge-top35.jpg`, `junc2-merge-top35.jpg`, `junc2-merge-far.jpg`, `junc3-merge-top35.jpg`, `junc1-merge-far.jpg`).
7. **Monotone grey plank plinth everywhere.**
   - **What:** The new plinth wall uses the same grey vertical-board look on every street. Main Street, the alleys, the start straight and the finish all read as the same grey fence, and it hides the ground floors and doors of the houses (`main-1210.jpg`, `main-2050.jpg`, `finish-beyond.jpg`).
   - **Start straight:** The start trench has crowds on top of it but meadow and trees behind, not houses (`start-behind-back.jpg`).
   - **Spectators:** They are large peg-dolls whose heads stand about 2 m above the wall top. They read as giants at cockpit height (`main-0010.jpg`).
8. **One-house-deep village; no dusk life.**
   - From the church view, the village is still a single ribbon of roofs with meadow directly behind (`church-far.jpg`, `junc1-merge-far.jpg`, `junc3-merge-far.jpg`).
   - At dusk the windows are dark, and there are only faint lamp heads (`dusk-cockpit-s1090.jpg`, `dusk-market1-s620.jpg`).
9. **The race map still can't show the street choice.** Inside every branch the HUD strip shows one wiggly line. The 16–40 m branch offsets are invisible at this scale (`drive1-alley-3.jpg`, `drive2-river-3.jpg`, `drive3-market-5.jpg`).

## Fix list (concrete, actionable, ordered; name files/functions where you can)
1. **Junction cleanup** (`village.js` `verge()` / `wallTop()` and the street-wall builder in `decorate()` "street walls" section):
   - Within about 30 m of `fromS`/`toS`, compute the verge from the *nearest* road only, and drop it to 0 when another road's corridor (`registry.clear`/`project2` distance < hw+OUT) is closer than this road's wall line.
   - End each street-wall strip with a square end-post where it meets another road, instead of letting the mesh shear. Kill wall segments whose length is < 2 m (the floating V pieces).
   - Verify with cockpit shots at `fromS−2` and `toS−22` on every path.
2. **Alley dressing** (`village.js` `decorate()`, `k === 'alley'` branch, plus `frontage()`):
   - Force narrow houses (w 4–6 m, setback 0) on both sides of alleys instead of plank walls.
   - Drop the `inSpan(±1)` requirement for arches; instead put a timber beam between the plinth tops.
   - Add washing lines every 15–20 m, and a different plinth material (whitewashed plaster or rough stone).
3. **Make the river visible from the cockpit:**
   - Lower the parapet on the river side to about 0.5 m (`LOW` for `kind==='river'`), or replace it with an iron railing (thin posts plus a rail), so the water reads at 1.15 m eye height.
   - Raise the water to about 0.15 m below the road edge and widen it.
   - Swap the willow sphere clusters for darker, drooping cone or ellipsoid canopies with a less saturated green.
   - Check that the footbridge actually spawns (the `inSpan`/`reg.clear(0,0)` test looks wrong: it uses `0,0`, not the bridge point).
4. **Signposts** (`decorate()` signpost loop):
   - Lay out the three entries as one line per destination with arrows, e.g. "◀ Back Alley | ▲ Main Street | Market Square ▶", or stack all lines in a single column.
   - Never draw the centre column over the side columns.
   - Use the true side of each branch's first 30 m (`bd.road.atS(25)`), not the midpoint, so the arrow matches what the player sees.
   - Make the banner taller (1.4 → 2 m, 2 lines max) and put a second, smaller fingerpost at the actual fork (`fromS−5`), so the choice is legible on an iPad.
5. **Route balance** (`SPLITS`, alley `amps`/`wig`, hazard opts):
   - Make the alleys genuinely shorter and faster on the straights. Reduce the split-2 alley `steps` count (4 step zones plus 2 rocks is too much) or reduce `bump`.
   - Give Market a real reward or cost.
   - Target: every path within ±1.5 s, with distinct risk.
   - Investigate the s≈2606 Main Street "rock", which nearly stopped the cart once. Make rocks visible props (loose cobbles or a rubble pile), not bare bumps.
6. **Gores:** fill each gore wedge with a building, a walled garden with trees, or a small square with a bench, instead of empty lawn.
7. **Plinth variety:** vary the plinth colour and material per house (plaster, stone, brick), drop it to about 1 m in front of houses so doors show, and add a few house fronts along the start/finish straights.
   - Scale spectators down to about 1.5 m, or stand them behind a lower parapet.
8. **Depth and dusk:** add a second row of `cheapHouse` roofs stepping up the slope behind both frontages (it exists for some stretches but not enough to read from the street). Add warm emissive windows (a random 30 %) to the `glow` batch for dusk/night.
9. **Race map** (`src/ui` map / `world.mapPaths`, gameplay fixer): show the branch the player is on in a different colour, or draw a zoomed inset around splits.
