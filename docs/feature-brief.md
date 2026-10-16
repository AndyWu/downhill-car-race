# Feature brief — 10-car races, weather, honks, rank, AI skill ladder

Requested by the owner after playtesting on a Mac. Work happens in the worktree
`/home/user/dcr-feat` (branch `feat/weather-10p`). Same directory ownership as
ARCHITECTURE.md. Post cross-team needs in `docs/requests.md` under a "Feature" heading.

## 1. 10 cars per race
- A race always has 10 cars: the humans (1 solo, up to 6 in a family race) plus AI backfill to 10.
- `world.startTransform(slot)` supports slots 0..9 (5 rows × 2, staggered, all on the start ramp).
- Netcode snapshots and the lobby handle 10 cars (human seats stay capped at 6 by the family pass).
- URL `?ai=N` still works for tests (default now 9 in solo).

## 2. AI skill ladder (bad → good)
- 9 AI drivers ranging smoothly from very bad to very good. Keep the 5 named personalities
  (Barnaby, Clementine, Buster, Maeve, Ace) as anchors and add 4 more named drivers between them
  (e.g. a tier between each pair), each with a skill 0..1 and distinct names/signature trucks.
- Export `AI_ROSTER` (ordered worst → best, 9 entries) alongside `AI_PROFILES`.
- Finishing order should broadly follow skill (adjacent drivers may swap; the bottom 3 and top 3 must be clearly separated).

## 3. Honk
- Every car has a horn with its own sound (bulb horn, bicycle bell, kazoo, duck call, old car "awooga", etc. — one per truck id).
- Input: key **H** on desktop; on touch, a tap in a small horn zone in the top-centre of the screen. `Input.honk: bool` (pressed this frame).
- Honks are spatialised so other cars' horns are heard from their position; they travel over the network (a flag bit in input frames and an event bit in snapshots).
- AI honk occasionally: when overtaking or being blocked (personality-dependent, rate-limited).

## 4. Weather + time of day, picked from the menu
- Title/garage menu gets a "Weather" chooser: **Clear, Foggy, Snow, Heavy Rain, Stormy** and a **Day / Night** toggle (also dusk/golden if cheap). Defaults: Clear + Day.
- URL params for tests: `?weather=clear|fog|snow|rain|storm&time=day|night`.
- Visuals: fog density/colour; falling snow particles + snow-dusted ground/foliage tint; heavy rain streaks + wet road (darker, glossier, more puddle reflection) + rain on the lens; storm = rain + wind gusts in foliage + lightning flashes (sky + light pulse) + darker sky.
- Audio: rain bed, thunder (delayed after lightning), wind, muffled snow ambience.
- Physics: surface grip multiplier by weather (rain/storm ~0.8, snow ~0.65 on road), small extra drag in snow.
- Multiplayer: the host's weather/time is sent to clients in the race-start control message.
- Must stay cheap on iPad: particle counts scale with quality tier.

## 5. Rank indicator
- A small translucent rank at the **top-left**, e.g. `3/10`, updated live during the race (this is an explicit owner request and overrides the original zero-HUD rule — keep everything else HUD-free).
- Style: hand-painted / chalk feel, ~40% opacity background, readable but unobtrusive, safe-area aware.
