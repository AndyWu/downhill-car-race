# CORN CRITIQUE — MAP ROUND 10b
**Score:** 9 / 10 (round 10: 9). All four round-10 "to reach 10" gameplay items are fixed or within tolerance, the hands-off nudge does not read as the game taking the wheel, and a sloppy human-grade run finishes within about 7 s of the pack. Held at 9 rather than 10 because of the small leftovers below (first-hit dip, brief AI-AI overlaps, visual nits not re-checked).

**Setup.** HEAD 86ec5b8 (corn-r10), vite on 4691 (stopped afterwards; restarted once after a container restart), `?autostart=1&track=corn&q=low`, 640x360, swiftshader. Numeric paddles, 1.2 s lead-in after teleports. Scripts/logs/screens in `screens/corn/` (`rub.mjs`/`rub.log`, `sloppy.mjs`/`sloppy.log`, `overlap.mjs`/`overlap.out`, `hud_grid.jpg`). Format: t/speed/lateral.

## Round-10 items re-tested
1. **Nose-in escape swerve (s 1000, lat 2.0, centred wheel, paddling): fixed.** Lateral stays between -2.1 and +0.5 through s 1000-1100 (round 10: -4.2); no rescue, 11 m/s by 14 s. Nose-in idle: one rescue at 3.5 s, then 7.0-7.6 m/s and lateral peak -1.8 (round 10: creeping 1-3 m/s).
2. **Idle post-rescue speed: fixed.** 6-7 m/s within 3 s of the rescue and holding (was 3 m/s at 15 s). The shove works.
3. **First hit on a held hard-over, paddling:** s 600 R minimum 6.3 m/s (was 5.3), s 600 L 7.5, s 1448 R 8.5 (was 7.5), s 1931 L 8.4, s 965 L 10.1. Improved but the s 600 R dip is still under the 7 m/s target.
4. **s 2574 R hold (bay edge):** dips to 6.3 m/s at 3 s (round 10: 8.8) with lateral 2.3 and recovers to 10.1 m/s at 14 s, ending at lateral 1.5. This is the weakest case now; the bay edge costs about 5 m/s for 3-4 s. 0 rescues in all 14 s holds, idle holds (965 R 7.4-8.4 m/s; 1448 L 6.8-8.4 m/s) also 0 rescues.
5. Nose-in with the wheel held into the corn (steer +1 / -1 at lat 2.5) still needs one rescue and then drives on (8.8 and 9.7 m/s by 15 s); the cart sits 3-5 m into the corn side while the wheel is held, which is the player's input, not the game's.

## Hands-off nudge: does it feel like the game takes the wheel?
No, by the numbers. Release test (hold R 3 s, then wheel centred, paddling): lateral eases 1.3 -> 1.1 -> 1.0 -> 0.8 -> 0.5 -> 0.1 over 6 s, speed rising 7.7 -> 9.6 m/s; a slow glide, no snap, and it only acts when the wheel is centred. With the wheel held it never overrides: held-wheel runs sit at 1.0-1.2 m on the held side (soft rail) rather than being pulled to the lane centre, so the earlier user complaint (correction centring the cart) is not reproduced. Subjective caveat: a human drifting at 1.0-1.7 m off centre and then easing the wheel will see a gentle drift back, not a hold of that position; I judge it acceptable and invisible at speed, but a real-hand test is the only way to be sure.

## Sloppy human bot (steer noise +-0.3 every 0.3 s, 20% paddle duty per 0.5 s, PD lane keeping), full run vs the pack
Finished at **352 s**, avg 9.1 m/s (cruise 7.7-10.9), **0 rescues, 0.2% of samples outside the lane, longest crawl 0.2 s (standing start), min speed 0.91 m/s**. At the finish the pack sat at s 3260, 3260, 3244, 3242, 3241, 3234, 3230, (us 3190), 3187, 3144: i.e. roughly 8th of 10, about 70 m / 7 s behind the main group and ahead of two AIs. Well inside the 60 s goal, and the rubber band keeps a weak player in the race without a ghost-car feel.

## AI-AI collisions without momentum exchange
Pair distance sampled every 0.1 s for all 36 AI pairs. Over the 352 s sloppy run: 681 of 126,720 pair-samples (0.5%) closer than 1.2 m, minimum 0.22 m, i.e. brief near-full overlaps exist. In a separate 200 s AI-only run (human parked at the start) there were **0** pair-samples under 1.0 m, so the overlaps happen when the pack bunches around the human or the start/finish area, not in free running. I did not capture a screenshot of an overlap, so how visible it is remains unverified; at 0.5% of samples it is a rare ghosting glitch rather than a systemic problem.

## HUD
`.sbd-lap` exists in the DOM but has no `.on` class (opacity 0), and `hud_grid.jpg` shows no lap label on corn. Pass.

## What works (max 3 bullets)
- Contact is forgiving and never fatal: 0 rescues in every held-wheel and sloppy-run test, dips recover monotonically.
- Escape/rescue behaviour is now clean: no cross-lane swerve, post-rescue shove restores speed.
- Sloppy human pace is competitive; hands-off nudge is gentle and does not centre the cart under input.

## Problems (ranked)
1. **Bay edge at s 2574-2610 with held R still costs 11 -> 6.3 m/s for ~4 s** (regressed from 8.8 in round 10, likely the 1.7 m bay-edge nudge/corn give-way interplay). Minor, but it is the largest remaining speed loss.
2. **First hit at s 600 R dips to 6.3 m/s** (target 7+).
3. **AI-AI near-overlaps (<1.2 m) in 0.5% of pair-samples, down to 0.22 m**, when the pack bunches around the human; no screenshot confirmation of visibility.
4. Visual nits from round 10 (leaf-card dither near, soft far canopy, sunflower/corn seam at distance) were not re-checked this round.

## To reach 10
1. Keep s 2574 R and s 600 R minimum speed above 7.5 m/s with paddling held.
2. Capture and, if visible, remove AI-AI overlaps (small positional separation without momentum transfer when pair distance < 1 m).
3. Re-check the leaf-card dither/far canopy tone at s 600, 1448, 2574.
