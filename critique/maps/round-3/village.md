# VILLAGE CRITIC — MAP ROUND 3
**Score:** 7 / 10   (round 1: 5/10, round 2: 6/10)

## Method
- **Build:** a fresh build of `feat/tracks` at `26a18d1`, unmodified, served with `vite preview` on port 4531.
- **URL:** `?track=village&q=medium&ai=0`, at 640×360. Signs were checked at 1024×768, the iPad size.
- **Shots taken:**
  - **Main Street:** 28 cockpit shots, one every 120 m (`main-*.jpg`).
  - **Branch streets:** 5 eye-height shots on every branch street (`br<split>-<path>-<kind>-s<S>.jpg`).
  - **Splits:** approach shots at −60, −36, −15 and −2 m, plus −75 m and +6 m on iPad (`approach*`, `sign*-ipad-*`).
  - **Junctions:** cockpit shots of every merge from every path, plus far, 35 m and 75 m views (`junc*`).
  - **River:** high and side views (`river*`).
  - **Weather and time of day:** rain, night and dusk (`rain-*`, `night-*`, `dusk-*`).
  - **Problem spots:** chase and top views (`chase-main-*`, `top-*`, `wall-*`).
- **Route timing:** I drove all 9 routes with `setDebugInput`, from `fromS−40` to `toS+30`, using a closed-loop steering controller toward `sampleAt(s+look, {split:path})` and paddling both sides. Split 2 and split 3 Main Street were also re-run with a softer gain.
- **Wall-climb test:** full lock at 16 m/s, both sides, at s 322, 965, 1630, 2253 and 2896.
- **AI race:** one full 9-AI in-game race (`ai=9`, `advance(5)`), wrapping each AI's `body.recover` to log every rescue.
- **Clearance:** `tracks-clearance.mjs village` reports **ALL OK**: 1510 props grounded, clear lane at least 4.10 m.

### Route times (seconds)
The second number, where given, is a re-run with gentler steering (look 10 m, gain 2.0).

| split | Main Street | path 1 | path 2 | spread |
|---|---|---|---|---|
| 1 (500–740) | 20.4 | Market 20.7 | Back Alley 21.1 | ±0.35 ✅ |
| 2 (1450–1700) | 24.1 / **20.0** | Riverside 19.5 / 19.4 | Back Alley **26.8** / **20.0** | ±0.3 on a clean line; +7 s if you graze the alley |
| 3 (2400–2660) | 21.4 / 21.6 | Market 20.9 | Riverside 20.6 | ±0.5 ✅ |

- **Rescues:** none on any route.
- **Split 2 is fragile.** With the sharper steering gain, the alley run stalled to **0.14 m/s at s≈1598–1602**. That is at the step zone (`steps` hazard at 1592), with 0.9 s on a `wall` surface. The Main Street run dropped to 6 m/s at the same progress. On a clean line all three paths are within about 0.6 s.

## Round-2 status
- **Fixed: the junction mouths (round-2 problem 1, the worst one).**
  - The sheared cobble pyramids, sawtooth ramps and floating V-shaped wall pieces are gone at all 6 junctions (`approach1-m2`, `approach2-m2`, `approach3-m2`, `main-1450`, `main-1690`, `junc*-merge-from*-cockpit`).
  - Walls now end in square posts.
  - What is left is small: torn or overlapping cobble texture where two road strips overlap (`br1-1-market-s529`, `br1-2-alley-s711`, `junc1-merge-from1-cockpit`, `sign2-ipad-p6`), and odd diagonal "hatched" plank wedges at some wall ends (`br2-2-alley-s1625`, `br1-1-market-s711`, `finish-beyond`).
- **Fixed: the Back Alleys (problem 2).**
  - Houses now stand tight to the lane.
  - Timber beams span the alley, and washing lines and bunting hang across it.
  - The walls are plaster, a different material from Main Street (`br1-2-alley-s620`, `br1-2-alley-s668`, `br2-2-alley-s1575`, `br2-2-alley-s1670`, `rain-alley2-s1600`).
  - Some long blank grey stretches remain.
- **Mostly fixed: the river (problem 3).**
  - The 0.5 m parapet lets the water read from the cockpit (`br2-1-river-s1525`, `br2-1-river-s1575`, `br3-2-river-s2478`).
  - The footbridge now spawns (`river2-f35-sideL`, `rain-river2-s1575`).
  - The willows are still smooth mint-green pill shapes and read as balloons, not willows (`river2-f60-sideL`, `river3-f60-sideL`).
  - The non-river side is still long blank grey walls (`river2-f35-sideR`, `river3-f35-sideR`).
  - **New:** see problem 1 below. The water now spills over Main Street.
- **Fixed: the sign text overlap (problem 4).**
  - The banner now has one line per destination with arrows, and nothing overlaps (`sign1-ipad-m75`, `sign2-ipad-m75`).
  - Fingerposts stand at the gore tips (`sign3-ipad-p6`, `br1-2-alley-s572`).
  - The banner is still small: on an iPad it is only readable between about 60 and 40 m before the split.
- **Fixed for normal lines: route balance (problem 5).** See the table above. The rocks are now drawn as rubble (`br2-2-alley-s1525`).
  - The rubble at s 1088 and 1338 on Main Street looks like flat grey paper shards, not stones (`main-1090`, `main-1330`).
  - The "Shortest" alley is still never faster, so the label promises a reward the route doesn't give.
- **Fixed: the gores (problem 6).** The gore wedges now hold houses and gardens instead of bare lawn (`junc1-merge-top35`, `junc2-split-top35`, `junc3-split-top35`).
- **Fixed on Main Street: the plinth monotony (problem 7).**
  - House fronts now come down to a low stone plinth, so doors and ground floors show. Main Street reads as a real street for the whole 3.2 km (`main-0130` … `main-3130`).
  - The start and finish straights are still 2 m brick trenches with giant peg-doll spectators towering above the wall (`main-0010`, `main-3200-finish`, `finish-beyond`).
- **Fixed: dusk and night life (problem 8).**
  - Lit windows glow at night, and night is genuinely pretty (`night-cockpit-s2300`, `night-market1-s620`).
  - The lamps don't light the road, so the cobbles are very dark.
  - The village is still one house deep when seen from the church (`church-far`).
- **Partly fixed: the race map (problem 9).** Branches are now drawn as orange dashes, but each one is about 5 px and the player dot covers it at the split (`racemap-crop`).
- **Fixed: gameplay critic's wall climbing (gameplay round-2 problem 7).**
  - Full lock at 16 m/s now rises at most **0.47 m**, with roll upY ≥ 0.86. In round 2 the cart climbed 1.8–3.3 m up house fronts.
  - The cart never spends any time above 0.8 m.
- **Fixed: gameplay critic's AI traps (gameplay round-2 problem 1).** In the full in-game race there were **0 rescues** in each of the three trap zones: church plaza s 1056–1100, split 1 s 630–770, and s 2590–2700.
  - Total AI rescues: **13**. Round 2 had 17 and 15.
  - Finishing order: Ace 284 s, Maeve 309.8 s, Vance 340.8 s. The top AI now finish at the top.
  - New clusters (`airace-1.json`):
    - Vance: s 130–132 (×2) and s 904–945 (×3, one on `wall`).
    - s 1888–1889: Dot and Clementine together.
    - **s 2784–2796 (×3)**, at the Main Street stall at 2795.

## What works (max 3 bullets)
- **Main Street is now a convincing village street from the cockpit.**
  - Colourful plaster and brick fronts come down to a low plinth, with doors, shutters, awnings and bunting.
  - There are no sheared junction mounds left.
  - Clean pass at every 120 m (`main-0250`, `main-0970`, `main-1930`, `main-2770`).
- **The three route types finally feel different.**
  - Market Square is a wide paved plaza with stalls and villagers (`br1-1-market-s620`, `br3-1-market-s2530`).
  - The Back Alley is a tight plaster lane with beams and washing (`br2-2-alley-s1575`).
  - Riverside has visible water, a parapet and a footbridge (`br2-1-river-s1525`).
  - Times are balanced within about ±0.6 s on a clean line.
- **Atmosphere and physics are solid.**
  - Rain looks good (`rain-market1-s620`), and night with lit windows is lovely (`night-cockpit-s2300`).
  - Carts no longer climb house walls.
  - The round-2 AI trap spots are clean.

## Problems (ranked, most severe first)
1. **The river water is drawn over Main Street, so the cart drives through a canal for 70–80 m. This is new in round 3.**
   - **What:** The `river_2` and `river_3` water ribbons overlap the Main Street corridor.
     - `river_2` covers Main Street from s 1609 to 1682, reaching up to 3.0 m inside the 3.1 m half-width (27 vertices on Main).
     - `river_3` covers s 2562 to 2643, up to 2.9 m inside (33 vertices).
     - Physics still reports `cobble`, so this is purely visual. But from the chase camera the cart sits in dark water across most of the street. In `wall-1630-far` a brick parapet and a grey slab also stand in the middle of the "river" on Main Street.
   - **Evidence:** `chase-main-s1672.jpg`, `chase-main-s2632.jpg`, `wall-1630-chase.jpg`, `wall-1630-far.jpg`, `junc2-merge-from0-cockpit.jpg`, `junc3-merge-from0-cockpit.jpg`, `top-s1672.jpg`.
   - **Why it matters:** Every player on Main Street sees it twice per race. It looks like a flooded road or a broken map, right where the river was meant to become a highlight.
2. **The split-2 Back Alley is fragile.**
   - **What:** A slightly-off line at the step zone (s≈1592–1602) hits a `wall` surface and stops the cart dead (0.14 m/s). The run takes 26.8 s instead of 20.0 s.
   - **Evidence:** `screens/village/drive3.log` (split2 alley run0 : `slow` 1598–1602, `surf.wall` 0.9 s) against `drive3b.json` → `2:2:1`.
   - **Why it matters:** Kids on iPads won't drive a perfect line, so the "Shortest" route costs them about 7 s. The same spot is a likely AI trap.
3. **New AI rescue clusters on Main Street, and the stall at s≈2795 is the worst.**
   - **What:** Three rescues at s 2784–2796 (Vance, Barnaby, Clementine) are at the Main Street stall hazard at 2795, which is `type: rock`, `lat 0`. There are also rescues at s 904–945 (Vance ×3) and s 130 (×2).
   - **Evidence:** `airace-1.json`.
   - **Why it matters:** The traps moved instead of disappearing. 13 rescues per race is still about 3× the country map.
4. **The start and finish straights are still brick trenches with giant spectators.**
   - **What:** At both ends the street is 2 m brick walls with 2 m peg-doll heads standing above them. There are no house fronts. Past the finish line the plinth becomes grey diagonal planks.
   - **Evidence:** `main-0010.jpg`, `main-3200-finish.jpg`, `start-behind-back.jpg`, `finish-beyond.jpg`, `rain-cockpit-s3190.jpg`.
   - **Why it matters:** These are the first and last things every player sees, and they now look worse than the rest of the street.
5. **Rubble and the willows still look like placeholders.**
   - **Rubble:** At s 1088 and 1338 on Main Street, flat grey shards lie flat on the road (`main-1090.jpg`, `main-1330.jpg`, `rain-chase-s1550.jpg`).
   - **Willows:** They are smooth mint-green capsules (`river2-f60-sideL.jpg`, `river3-f60-sideL.jpg`). The code asks for dark olive `[0.1,0.17,0.07]`, but on screen they render light.
6. **The forks are hard to read from the cockpit.**
   - **Banner:** It is legible only between about 60 and 40 m before the split. At 75 m the text is 6 px high on an iPad (`sign1-ipad-m75.jpg`).
   - **Branch mouths:** From −15 m the mouths still hide behind houses (`approach1-m15.jpg`, `approach3-m15.jpg`).
   - **Fingerposts:** Only one of three showed in the +6 m shots (`sign3-ipad-p6.jpg` shows one; `sign1-ipad-p6.jpg` and `sign2-ipad-p6.jpg` show none).
7. **Junction leftovers.**
   - Overlapping and torn cobble textures where road strips meet (`br1-1-market-s529.jpg`, `junc1-merge-from1-cockpit.jpg`, `sign2-ipad-p6.jpg`).
   - Diagonal "hatched" plank wedges at wall ends (`br2-2-alley-s1480.jpg`, `br2-2-alley-s1625.jpg`, `br3-1-market-s2629.jpg`).
   - At s≈1548 an alley timber beam leans right next to Main Street, with the alley strip showing beside it (`chase-main-s1548.jpg`, `top-s1550.jpg`).
8. **Long blank grey walls remain** on the river's non-water side, on parts of the alleys, and at a few Main Street gores (`river3-f35-sideR.jpg`, `br1-2-alley-s620.jpg`, `main-1090.jpg`, `main-2050.jpg`, `main-2530.jpg`).
9. **The race map branches are still tiny.** Each one is an orange dashed loop about 5 px wide, hidden by the player dot at the split (`racemap-crop.jpg`). This belongs to the gameplay fixer.

## Fix list (concrete, actionable, ordered)
1. **Clip the river water to stay off other roads** (`village.js`, river block in `decorate()`, the `waters` ribbon, about line 644):
   - For each ribbon row, clamp `WB` (and skip the row when `WA` already fails) so that every vertex has `reg.clear(x, z, road.id) > 0.5`. Equivalently, stop the row where the distance to Main Street's corridor is less than hw + 1.
   - Better still, start and end the water (`sA`/`sB`) where the river path is more than about 9 m from Main Street, not at a fixed 16 m.
   - Apply the same clamp to the far-bank wall strip and the end walls (the grey slab and parapet seen in `wall-1630-far`).
   - Verify with chase shots of Main Street at s 1600–1690 and 2560–2650.
2. **Split-2 alley steps** (`SPLITS`, the alley step hazard at about s 1592):
   - Lower the step `bump`, or move the step zone off the bend so a 0.5 m line error doesn't put a wheel on `wall`.
   - Give the alley a real time gain (about −1 s) so "Shortest" is true.
   - Target: a sloppy line (gain 2.5) takes at most about 21 s.
3. **AI traps on Main Street** (village fixer and gameplay fixer):
   - Move the Main Street stall at s 2795, or narrow its footprint. Also check the stalls at 806 and 1273, near the s 904–945 cluster.
   - Have the planner treat `stall` as a hard obstacle with lateral clearance.
   - Re-check with a full `ai=9` race. Target: ≤ 6 rescues.
4. **Start and finish straights** (`village.js`, start/finish section, about line 549):
   - Replace the 2 m brick trench with house fronts on a low plinth plus barrier rails, or drop the wall to about 1 m.
   - Seat the crowd behind the wall at a 1.5 m scale.
   - Use the normal plinth past the finish instead of hatched planks.
5. **Props:**
   - Rebuild the rubble piles as 5–8 chunky stone boxes or dodecahedra with height (0.2–0.4 m), not flat shards.
   - Fix the willow colour: the `dark` material looks lightened by lighting, so use a darker vertex colour or a non-shiny material, and give them narrower drooping strands.
6. **Fork legibility** (signpost loop, about line 563):
   - Make the banner about 2.4 m tall with 2 lines max: one line for Main Street, one combined line for the side streets.
   - Put a second banner or arch over the mouth of each branch itself, with the street name.
   - Make sure a fingerpost spawns at all 3 forks; at split 1 and split 2 none was visible at +6 m.
7. **Junction polish:**
   - Kill the hatched plank wedges at wall ends; use the plinth material.
   - Keep alley beams more than 1 m from Main Street's corridor (s≈1548).
   - Reduce the overlapping road-strip texture at the mouths, for example by fading the branch strip alpha over its first 8 m.
8. **Blank walls:** add doors, windows or climbing plants on long garden walls, or swap them for house frontage where the space allows (river far side, alley s 620, Main Street gores at 1090, 2050 and 2530).
9. **Race map** (gameplay fixer): draw the active branch with a 2× lateral exaggeration, or show a zoom inset within 60 m of a split.
