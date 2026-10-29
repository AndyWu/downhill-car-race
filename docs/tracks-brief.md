# Tracks brief — 4 tracks (owner request)

Work in the worktree `/home/user/dcr-tracks` (branch `feat/tracks`). Directory ownership as in ARCHITECTURE.md.
Cross-team needs go in `docs/requests.md` under a "Tracks" heading. Every race is still **3,218 m** of racing.

| id | Name | Shape | Race |
|---|---|---|---|
| `country` | Country Road (existing) | point-to-point downhill | 1 run, 3,218 m — **must stay exactly as it is today** |
| `village` | Hill Village | point-to-point gentle downhill through a village | 1 run, 3,218 m along the main street; 3 places where the road **splits into 2–3 alternative streets and rejoins** (e.g. market square / riverside lane / narrow back alley). Each alternative has different length, width and hazards so the choice matters. Buildings, walls, shops, church, fountain, carts, washing lines, cobbles. |
| `corn` | Corn & Pumpkins | point-to-point gentle downhill | 1 run, 3,218 m on **very narrow** dirt lanes (≈3–3.8 m) between tall corn walls, past pumpkin patches, hay, scarecrows, and **birds** (flocks that circle and scatter when carts pass). |
| `circuit` | Speedway | **closed loop**, nearly flat with gentle dips/banking | **3 laps** of 1,072.7 m = 3,218 m. Paddle-powered: no long downhill, so paddling matters most. Kerbs, tyre walls, grandstands, pit wall, start/finish gantry, painted lines, flags. |

## Contract (src/scene — Agent 1)

```js
export const TRACKS = [{ id, name, description, laps, lapLength, length }]   // length = race distance (3218)
createWorld(scene, { seed, trackId = 'country', renderer, materials, onProgress })
world.trackId
world.flags = { closed: bool, laps: n, flat: bool, noStuckRescue: bool }   // circuit: closed, laps 3, flat, noStuckRescue
world.track = {
  length,          // race distance 3218 (all tracks)
  lapLength,       // 3218, or 1072.7 on the circuit
  // s is RACE PROGRESS in metres (0..length). Circuit: sampleAt wraps every lapLength.
  // Village: choice = { [splitId]: pathIndex } picks which street a car takes through each split; omitted = main street (0).
  sampleAt(s, choice?) → { position, tangent, right, up, width, camber },
  // nearest road to pos (all roads, incl. village branches) → progress s, lateral on THAT road.
  // hintS: the car's previous s; on the circuit picks the lap closest to the hint (so s keeps growing lap after lap);
  // in the village picks the branch closest to the hint position.
  project(pos, hintS?) → { s, lateral, splitId?, pathIndex? },
}
world.splits = [{ id, fromS, toS, paths: [{ index, name, length, width, note }] }]   // [] except village
world.heightAt/normalAt/surfaceAt   // cover every road incl. branches; corn walls / buildings contain cars (berm-like or high-drag)
world.landmarks, world.hazards, world.startTransform(slot 0..9), world.setWeather(), world.update()  // unchanged contract
world.mapPaths()  → [{ pts: [[x,z],...], main: bool }]   // for the race map: main road + every branch
```
`?track=village|corn|circuit|country` URL param selects the track (default country).

## Other agents
- **Agent 3 Core (src/core, main.js):** pass `hintS` to `project` in physics; race finish at `s >= track.length` with unwrapped s; respect `world.flags.noStuckRescue` for the player; build the world for the chosen track (`?track`, UI choice, host's choice in multiplayer — rebuild the world when the track changes); lap counter → `ui.setLap(lap, laps)`; map → `ui.setMapTrack(mainPts, branchPaths)`; per-AI route choice passed through.
- **Agent 7 AI:** planner works in progress-s using `track.sampleAt(s, choice)`; each driver picks a route per split by personality (Ace = fastest, Clementine = safest/widest, Barnaby = random, Buster = shortest even if rough); circuit = 3 laps, flat → paddling cadence matters; sims for all 4 tracks.
- **Agent 4 UI/Audio:** track chooser on title + garage (persisted, like weather) with a small drawn preview/description; `ui.setLap(lap, laps)` chalk "Lap 2/3" under the rank (circuit only); `ui.setMapTrack(mainPts, branches)` draws branches thinner; ambience per track (village: church bell, chatter, dogs; corn: crows, rustling corn; circuit: crowd, PA tannoy).
- **Agent 2 Network:** the host's `trackId` travels with weather/time in the race-start message; clients rebuild the world for it before the countdown; lobby shows the chosen track.
- **Agent 6 Graphics:** any new materials the scene asks for (cobbles, brick, plaster, roof tiles, asphalt, kerb paint, corn leaves, pumpkin) via docs/requests.md.
