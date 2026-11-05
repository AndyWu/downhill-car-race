# Map critique loop — brief

Owner request: 4 critics review the 3 new maps (Hill Village `village`, Corn & Pumpkins `corn`, Speedway `circuit`);
fixers address the findings; repeat until **every map scores ≥ 8/10**.

Work happens in the worktree `/home/user/dcr-tracks` (branch `feat/tracks`). Never use `git stash`, `git checkout`, `git reset`
or `git commit` there — the orchestrator commits. node_modules is symlinked. Chromium is at `/opt/pw-browsers`
(launch args `['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']`).
The machine is shared and slow: one heavy Playwright job at a time per agent, `q=low`/`q=medium`, small viewports,
build into your own scratch outDir (`npx vite build --outDir <scratch>/dist`) and serve it with `npx vite preview --outDir … --port <unique>`.

## Critics
| Critic | Scope |
|---|---|
| Village critic | `village`: visuals, layout, every street (use `?track=village` + `__game.teleport(s)`; branch streets via `world.track.sampleAt(s, {splitId: pathIndex})` and placing the camera/cart there), junctions, hazards, buildings, driving through it |
| Corn critic | `corn`: lane, corn walls, pumpkins, scarecrows, birds, barn yards, driving |
| Circuit critic | `circuit`: track surface, kerbs, barriers, grandstands, pits, gantry, 3 laps, paddling on the flat, run-offs |
| Gameplay critic | all three maps: how they *play* — driving feel, containment, getting stuck, AI behaviour and order (`node tests/ai-sim.mjs 3 --track=<id>`, `tests/ai-game.mjs --track=<id>`), race map/rank/lap UI, phone touch layout, frame cost (`renderer.info` draw calls/triangles) |

Each critic writes `critique/maps/round-N/<critic>.md` (critic ∈ `village`, `corn`, `circuit`, `gameplay`) in this schema and saves
JPEG evidence to `critique/maps/round-N/screens/<critic>/`:

```
# <CRITIC> CRITIQUE — MAP ROUND N
**Score:** X / 10            (gameplay critic: one line per map: village X/10, corn X/10, circuit X/10)
## What works (max 3 bullets)
## Problems (ranked, most severe first; each: what / where (s metres, street) / evidence file / why it matters)
## Fix list (concrete, actionable, ordered; name files/functions where you can)
```

Scoring guide (be strict and honest; this is a homemade-soapbox game for families on iPads, not AAA — judge against a
polished indie mobile racer):
- 10: nothing to fix · 8: polished, only minor nits · 6: playable, several visible problems · 4: obvious bugs/blocks · 2: broken.
- A map passes when its own critic's score AND the gameplay critic's score for it are both ≥ 8.
- Score movement between rounds must be justified by observed evidence. Do not modify any source files.

## Fixers (new agents each round)
| Fixer | Owns |
|---|---|
| Village fixer | `src/scene/tracks/village.js` |
| Corn fixer | `src/scene/tracks/corn.js` |
| Circuit fixer | `src/scene/tracks/circuit.js` |
| Gameplay fixer | `src/ai/`, `src/core/`, `src/main.js`, `src/ui/`, `src/audio/` |

Shared scene files (`ground2.js`, `terrainnet.js`, `world2.js`, `roadnet.js`, `scatter.js`, `registry.js`, `hazards.js`,
`materials.js`): edit only when needed, keep edits small and local, and note them in `docs/requests.md` under "Map loop";
never change country-road behaviour (`node src/scene/sanity.mjs` and the country fingerprint must stay identical).
Every fixer must finish with: `node src/scene/tracks-clearance.mjs <map>` (all OK), `node src/scene/tracks-sanity.mjs`,
`npx vite build`, and screenshots of what they changed that they have looked at.
