# CORN CRITIQUE — MAP ROUND 10
**Score:** 9 / 10 (round 9: 8). The two big round-9 complaints are gone on this build: a steady paddler now averages 11.5 m/s and finishes in 277 s (third overall, inside the pack), and held-wheel contact ends at the lane edge with no rescue and no stall. What keeps it off 10 is a handful of corner-case nits.

**Setup.** HEAD f271e6b, `npx vite --port 4671 --strictPort` (stopped afterwards), `?autostart=1&track=corn&q=low`, 640x360, swiftshader, chromium at /opt/pw-browsers. Numeric paddles (`paddleL/R: 1`), 1.2 s straight lead-in after every teleport. Scripts/logs/screens in `screens/corn/` (`rub.mjs`/`rub.log`, `full.mjs`/`full.log`, `shots.mjs`/`shots.log`, jpgs). Format below: t/speed/lateral (lane edge about 2.0-2.5 m).

## Re-check of round-9 issues
1. **Steady paddler vs the pack: fixed.** PD lane bot, constant numeric paddle, control step 0.1 s (round 9 used 0.25 s): reached s 3191 at **276.7 s**, avg **11.5 m/s**, cruise 11.2-12.8 m/s (round 9: 6.3 m/s, 508 s). **0 rescues, 0% of samples outside the lane, longest crawl 0.2 s, minimum speed 0.92 m/s (the standing start).** At that moment the pack was at s 3253, 3240, 2853, 2841, 2733, 2661, 2576, 2572, 2547, i.e. the bot was 3rd of 10, about 15-30 s behind the two leaders. The results panel ETAs (`finish.jpg`) read about 205-316 s for the AIs, so a clean human run lands mid-pack instead of 5 minutes last. Caveat: the bot is a precise PD lane-keeper; a human will lose some time, but this is no longer decisive.
2. **Hard-over re-wedge after a rescue: much better, one residual stutter.** Nose-in at lateral 2.0, wheel held into the corn + paddling: one rescue at 6 s, then it keeps moving (0.7 -> 6.9 m/s by 15 s, 46 m); round 9 was 2 rescues and 36 m in 15 s with a second dead stop at 0.1 m/s. Nose-in, wheel at -1 from lateral 2.5: one rescue at 3.5 s, 8.4 m/s by 15 s. Nose-in with the wheel centred, paddling: no rescue, free in 3 s, 8 m/s by 7 s. Nose-in idle: one rescue at 3.5 s, then a slow creep (3 m/s at 15 s). No repeated dead stops anywhere; minimum 0.1 m/s only at the one idle rescue frame.
3. **s ~1077 stall: not reproduced.** Idle full-lock R from s 965: 8.5-8.8 m/s straight through 1073/1081 (lateral 2.4 -> 1.9 -> 1.3), 0 rescues. Coast from 1060 centred: 9.1 m/s through 1113. Closed.

## Held-wheel behaviour with the new edge-return (14 s lock while paddling, 0 rescues in all)
- s 600 R: 2 s 5.3/2.0, 7 s 8.8/1.4, 14 s 11.6/1.0. s 600 L: 7.5/-2.5 at 2 s, 12.7/-1.0 at 14 s. s 1448 R: 7.9/2.3 at 2 s, 10.8/1.1 at 14 s. s 1931 L: ends 10.1/-1.0. s 2574 R: dips to 8.8 at 3 s, ends 11.2/1.2. s 965 L: lateral -2.9 at 1 s, 11.7/-1.1 at 14 s.
- Idle lock: 965 R 8.0-8.8 m/s for 18 s ending at lateral 1.2; 1448 L 6.2-8.1 m/s, 0 rescues.
- The correction now settles the cart at 1.0-1.2 m on the held side and stays there at speed: the "game is steering for me" feel of a centring snap is gone, and the wall behaves like a soft rail. Speed recovers monotonically after the first 2-3 s dip. In `lock600_3s.jpg` the cart is mid-lane, nose off the corn face, no visible snap.

## Look, readability, camera, grid, finish
- Grid (`grid_0.jpg`): staggered grid, hay arch with sign, bunting, hay bales, pink parasol cart ahead, rival number flags, minimap with progress dot all read at 640x360. Chase camera in `lock600_3s.jpg`: sunflower wall left, dense corn right with leaf cards, checker marker flags on posts, flying pumpkin-like blobs/leaves at the edge. Lane edge versus corn face is readable.
- Finish: results panel with ranks and AI ETAs, bunting, hay and crowd. (The teleported 1st place at 0:37.72 is a teleport artefact, not a bug.)

## What works (max 3 bullets)
- Pace and contact are now right: a clean paddler is mid-pack (11.5 m/s average), wall contact never kills speed for more than 2-3 s.
- Rescues are rare and non-repeating even in the artificial nose-in-plus-held-wheel case; no stalls found.
- Best-looking map of the three: lane, sunflower/corn walls, hay arch, bunting, grid and finish all hold up.

## Problems (ranked)
1. **Nose-in with centred wheel, then paddling, overshoots across the lane** (test at s 1000, lateral 2.0): freed at 8 s at lateral 0, then at s 1044-1060 lateral -3.0 / -4.2 / -3.4 (about 2 m past the lane edge, 9-10 m/s) before coming back at s 1090. The cart wanders into the corn on the opposite side with no steer input. Possibly the post-escape yaw plus the edge-return; harmless to speed here but a visible swerve.
2. **Post-rescue slow creep when idle** (nose-in, no paddle): 1-3 m/s for 15 s, 33 m. Only reachable by an idle player but it looks lifeless; a gentle shove after a rescue would help.
3. **First 2-3 s after a hard-over hit still dip 10 -> 5-8 m/s** (e.g. s 600 R 5.3 m/s). Acceptable and readable, but it is the only place a steady player loses time.
4. Nits: close leaf cards still dither, far canopy soft; sunflower row and corn are visually very similar from far away at low quality.

## To reach 9 -> 10 (testable, ranked by impact)
1. Fix the post-escape swerve: repeat nose-in at s 1000, lateral 2.0, yaw 1 rad, centred wheel, paddling; |lateral| must stay below 2.3 during s 1020-1100 (today -4.2 at s ~1052). Check the angular velocity/yaw the rescue/escape leaves behind and damp it.
2. After any rescue, apply a small forward speed floor (about 3-4 m/s) or push for 1 s so idle nose-in cases (s 1000) exceed 5 m/s by 8 s instead of 2 m/s.
3. Soften the first impact at s 600 and s 1448 R (hold R, paddling): keep the minimum speed above 7 m/s instead of 5.3 and 7.5.
4. Reduce leaf-card dither at near range and give the far canopy a bit more tone variation so the corn/sunflower seam reads at distance (visual polish; check at s 600, 1448, 2574 with the camera 10 m back).
5. Re-run the full paddled run with a deliberately sloppy bot (steer noise +-0.3, 20% paddle duty) to confirm a human-grade run still finishes within about 60 s of the AI median (not tested; the PD bot is the best case).
