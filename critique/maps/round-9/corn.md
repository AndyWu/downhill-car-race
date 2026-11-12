# CORN CRITIQUE — MAP ROUND 9
**Score:** 8 / 10 (round 8: 7). The held-wheel death crawl is gone: a full-lock hold now ends back in the lane in 5-7 s at 8-12 m/s with zero rescues. Remaining: hard-over nose-in still loops rescues, and a steady paddler is very slow against the pack.

**Setup.** HEAD d24d9bf, `npx vite --port 4651` (stopped), `?autostart=1&track=corn&q=low`, 640x360, swiftshader. Paddle input numeric (`paddleL:1`). Every case has a 1.2 s straight lead-in teleport (no chained-state artefacts). Scripts/logs in `screens/corn/` (`rub.mjs`, `full.mjs`, `full.log`, `shots.mjs`).

## 14 s full-lock hold while paddling (re-test of the 8+ criterion)
Format t/speed/lateral; lane edge is about 2.0-2.5 m.
- s 600 R at 10 m/s: 2 s 5.3/2.0, 5 s 7.5/1.0, 7 s 8.6/0.4, 14 s 11.3/0. Back in lane at ~6 s, 0 rescues. Lowest speed 5.3.
- s 600 L: lane at 7 s, 11.6 m/s at 14 s, 0 rescues. 1448 R: lane at 9 s, 11.5 at 14 s. 1931 L: lane at ~8 s, 10.3 at 14 s. 2574 R: lane at 8 s, 11.5 at 14 s. 965 L: lane at ~6 s, 12.4 at 14 s. All 0 rescues, minimum speed 5.3-7.6 m/s.
- Idle (not paddling) full lock, 1448 L: back in lane by 5 s, holds 6.2-6.8 m/s, 18 s, 0 rescues. Release test (3 s lock then centre): returns across the lane and settles at 0 in ~4 s, natural.
- Feel: the cart noses along the corn for about 2 s (speed dips 10 -> 5-8), then the nose swings back and it slides into the lane while the wheel is still held. It reads as "the wall pushes me back out", not as the game turning the wheel; no visible snap (`lock600_1.5s/3s/5.5s.jpg`). A player holding the wheel hard-over gets a soft bounce and an uninterrupted run. This is what I asked for last round.

## Rescue / re-wedge
- Nose-in at lateral 2.0, centred wheel + paddling: free in 2 s, up to 8 m/s at 7 s, no rescue needed. Good.
- Nose-in, wheel held toward the wall + paddling: 2 rescues in 15 s, speed 0.1-4 m/s, only 36 m covered (rescue at 6 s, then wedged again at ~11-12 s, 0.1 m/s). The 1 s ignore + 2 s fade helps (no longer 0.0-0.4 for the whole time and it does move on between), but the hard-over wheel still re-wedges once. This is the same artificial case as last round (round 8: 31 m in 15 s, three rescues), so a slight improvement only. Not seen in the lock-hold cases above, which never wedge.
- One unexplained slowdown: idle full-lock R at s 965, speed 9.0 -> 3.3 at s 1077 (lateral about 0), then 0.4-0.5 m/s for 6 s with no rescue. Repeating a coast from s 1060 (centred, no paddling) was clean (8.5-9.3 m/s past 1122), so it is probably an AI cart or a one-off contact in the lane at the moment, but a cart that sits at 0.5 m/s for 6 s unrescued deserves a look.
- Teleport-after-rub artefacts: gone with a lead-in; I did not see the dead 0.1 m/s cart anywhere.

## Full paddled run (PD lane bot, constant paddle, numeric)
Reached s 3190 at 508 s (avg about 6.3 m/s; the round-8 bot with unpaddled input managed 4.9). 1 rescue (near s 700, at ~100 s), 0% of samples outside the lane, longest crawl below 1.5 m/s 3.75 s, min 0.03 m/s (that rescue). Cruise 6-6.8 m/s. The whole pack had already finished (all 10 at s 3190+, the board shows the first AIs at about 180-195 s). So a steady, mistake-free paddler finishes roughly 5 minutes after the leaders. Teleported finish (s 3100) shows results panel, bunting, hay arch and crowd fine (`finish.jpg`).

## Camera, grid, visuals
Unchanged and good: staggered grid with the hay arch and bunting (`grid_0.jpg`); cockpit/chase camera stays on the lane while the cart nudges the corn (`lock600_*.jpg`), sunflower and leaf cards read well, minor dithering of close leaf cards.

## What works (max 3 bullets)
- Wall hits and held wheels are forgiving: 0 rescues in 6 lock-hold cases, return to lane in 5-9 s, 8-12 m/s afterwards.
- Best-looking map of the three; lane, walls, pumpkins, sunflowers, arch read clearly.
- Clean grid, camera and finish with results.

## Problems (ranked)
1. **Pace of a steady human**: ~6.3 m/s average against the results board estimates for the AI (about 180-285 s for the 3.2 km, i.e. roughly 11-17 m/s); last by about 5 minutes even with no mistakes. Decides every race on this map; not a bug in the lane assist.
2. **Hard-over wheel after a rescue still re-wedges once** (nose-in, wheel into the corn: 2 rescues, 36 m in 15 s). Much milder than round 8 but still a stutter.
3. **Possible stall at s 1077 (idle lock R), 0.5 m/s for 6 s unrescued** after hitting something in the lane; not reproduced on a clean coast.
4. Close leaf cards dither, far canopy soft (nits).

## What raises it to 9+
Raise the coast/paddle speed (or soften the AI) so a clean human is within about 60 s of the pack, make the post-rescue latch also hold the assist when the wheel is held into the corn at the rescue point, and add a rescue trigger for speed below 1 m/s for 3 s in the lane (the s 1077 stall).
