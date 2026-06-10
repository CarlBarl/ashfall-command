# Game Loop v2 — fog of war, war termination, product polish

Branch `feature/game-loop-v2`. Goal: turn the sim into a game. Wars must be winnable and
losable, and the intel layer must actually gate what the player sees. Everything here is
designed around contracts scaffolded in `types/game.ts`, `types/view.ts`,
`types/commands.ts` and stubs in `engine/systems/visibility.ts` / `war-support.ts` —
implementers fill the stubs, they do not reshape the contracts.

## 1. Fog of war (visibility)

Per observing nation, per enemy unit, a `VisibilityContact { level, lastSeenTick,
lastKnownPosition }` with levels `unseen → detected → tracked → identified`.

Sources, evaluated in `processVisibility` each tick (all inputs already computed by the
engine — consume, don't reinvent):

| Source | Result | Notes |
|---|---|---|
| Own radar / sensor network coverage | `tracked`; `identified` if also within 60% of radar range | use `buildSensorNetwork` output + `detection.ts` LOS logic |
| Satellite pass (`getSatelliteDetections`) | `detected` (optical: `tracked`) | already per-nation |
| HUMINT (`lastEspionageResult.humintRevealed`) | `identified` | sticky 30 game-min |
| ELINT (`sensor-network` `isDetectedByELINT` × `sigintMultiplier`) | `detected` of EMITTING units (radar on) | this finally wires the dead ELINT path + SIGINT slider |
| This-tick `MISSILE_LAUNCHED` events (scan `state.events` tail by `tick`) | launcher → `tracked` | launch plume |
| `MINE_CONTACT` | minefield → `identified` | you found it the hard way |

Decay when not refreshed: `identified→tracked` after 10 game-min, `tracked→detected`
after 10, `detected→unseen` after 30. Exception: FIXED categories (airbase, naval_base,
minefield once identified, sam_site that has not moved since last seen) never decay below
`detected`, and airbase/naval_base are permanently `identified` once identified — bases
don't walk away. Mobile categories (ship, submarine, carrier_group, missile_battery with
readiness, aircraft) decay normally; on decay below `tracked`, freeze
`lastKnownPosition`.

Snapshot rules (`getViewState`, already wired to call the visibility module):
- Own units: always `visibility: 'identified'`, `stale: false`, full data.
- Enemy `unseen`: excluded from `units[]` entirely.
- Enemy `detected`: included with `stale: true` when the live track is gone — position =
  `lastKnownPosition`, and SCRUB weapons/supplyStocks/pointDefense to `[]`, sensors to
  `[]`, health to 100 (you don't know). Name: generic per category ("Unknown contact").
- Enemy `tracked`: live position, real name, health visible, weapons scrubbed.
- Enemy `identified`: everything.
- Missiles: always visible (radar-bright, both sides). AI keeps using full state (the AI
  may cheat in v1).
- SITREP/StatsPanel enemy "Active" count becomes known contacts; strike-panel target
  lists inherit filtering for free since they read `viewState.units`.

Save/load: `state.visibility` serializes; absent in old saves → starts empty (fair: you
re-acquire the picture).

## 2. War termination (war support)

Per nation `WarStatus { warSupport 0-100, warStartTick, ceasefireOffered }`. Computed in
`processWarSupport` once per game-minute (tick % 60) by scanning this-tick events via a
module watermark over `state.events` (same pattern as attackCounters — do NOT read
pendingEvents).

Drains (tuned so a fought war resolves in 1-3 game-weeks at typical intensity):
- Own unit destroyed: carrier 12, naval_base/airbase 6, ship/submarine 4, sam_site 2,
  missile_battery 1.5, minefield 0.5.
- War duration: 0.15 per game-hour at war.
- Economy: reserves below 25% of start: extra 0.3/h. USA only: oil price above $110
  drains 0.2/h (political pressure). Iran only: Hormuz lane status `blocked` drains Iran
  0.2/h too (their own exports die — closing Hormuz is a sword with two edges).
- Gains: enemy unit destroyed gives the killer +0.5 (capped contribution +10 total).

Thresholds:
- ≤ 35: `WAR_SUPPORT_CRITICAL` event once per crossing; AI nation at ≤ 35 offers
  ceasefire (`CEASEFIRE_OFFERED` event, `ceasefireOffered = true`) and its ai.ts phase
  drops back to DEFENSIVE (stand down offensive salvos).
- 0: capitulation → `WAR_ENDED { outcome: 'capitulation', loser }`, `state.gameOver`
  set with stats, all units `hold_fire`, atWar cleared.

Ceasefire mechanics:
- Player → `OFFER_CEASEFIRE` command. AI accepts iff its warSupport <
  playerSupport + 10 OR its offensive missile stock < 25% of start. Accept →
  `WAR_ENDED { outcome: 'ceasefire' }` + gameOver report; reject →
  `CEASEFIRE_REJECTED` event (no state change, 6h cooldown before re-offer).
- AI offer pending → player accepts via existing `CEASE_FIRE` command (now =
  "accept standing offer"), or ignores it (offer stands).
- `RESIGN` command → immediate `WAR_ENDED`, outcome defeat for player.

Outcome mapping for the player: enemy capitulates = victory; own capitulation/resign =
defeat; ceasefire = scored draw — debrief shows who held the upper hand (higher
warSupport).

`GameOverReport.stats` (`WarStats`): duration, units lost per nation, missiles fired /
intercepted per nation, peak oil price, ticks Hormuz spent blocked/reduced. Track inside
war-support.ts from events + lane state; do not add engine-wide counters.

Objectives (computed in war-support.ts, shipped as `GameViewState.objectives`, both for
the player's side):
- USA: "Keep Hormuz open" (share of war time lane ≠ blocked), "Destroy Iran's strategic
  missile force" (fraction of initial missile_battery+TEL units killed), "Preserve the
  carrier group" (binary).
- Iran: "Close the Strait" (share of war time lane ≠ open), "Attrit the US fleet"
  (fraction of initial US naval units killed), "Preserve strategic forces" (fraction of
  own batteries surviving).
Status: good ≥ 0.66 progress, contested ≥ 0.33, else bad. These are drivers shown to the
player; warSupport is the actual win meter.

## 3. UI

- TopBar: two compact war-support bars (player blue / enemy red) visible when at war;
  DECLARE WAR swaps to OFFER CEASEFIRE while at war; banner chip when the enemy has
  offered (click = accept). Objectives chip opens a mini panel listing
  `ObjectiveStatus` rows.
- DebriefScreen: full-screen overlay when `gameOver` arrives — outcome headline, stats
  table (losses, missiles, interceptions, oil peak, duration), objectives final state,
  buttons: "Return to command" (keep watching the world) and "Main menu" (menu-store
  back to start; engine re-init already safe).
- Fog rendering (UnitLayer): `identified` full icon; `tracked` full icon at 80% alpha;
  `detected` generic diamond contact marker with "?" badge, dashed when `stale`;
  tooltips/panels show only the data the level grants.
- AlertFeed: clicking an event with a position flies the camera there (ui-store
  `mapFocus` consumed by GameMap); gear popover with auto-pause toggles (on war
  declared / own unit destroyed / ceasefire offered) — client-side, sends SET_SPEED 0.
- Branding unified to ASHFALL COMMAND (StartScreen, index.html title, README).

## 4. Explicitly out of scope (stay in BACKLOG.md)

Aircraft/sortie system, additional scenarios, multi-slot saves, strike timing modes
engine-side, mobile layout, mission editor.
