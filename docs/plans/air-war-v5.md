# Air war v5 — squadrons, flights, missions

Binding design for Roadmap Wave C. Research basis: CMO/Falcon/DCS Liberation
convergent design + real 2026 orbat (roadmap-v4.md Wave C). Core principle:
squadrons are pools, flights are transient map tracks, orders exist ONLY at
mission level. No per-airframe anything.

## 1. Data model

```ts
// types/game.ts
export interface SquadronState {
  id: string                 // 'vfa14'
  name: string               // 'VFA-14 Tophatters'
  airframe: AirframeId       // 'fa18e' | 'f35c' | 'ea18g' | 'e2d' | 'f14' | 'mig29' | 'su24' | 'su35'
  total: number              // airframes on the books
  available: number          // ready now (total − airborne − turnaround − maintenance − lost)
  readyAt: number[]          // ticks when turning-around airframes rejoin `available`
}
// Unit gains: airWing?: SquadronState[]   (carrier_group + airbase only)

export interface AirframeSpec {
  id: AirframeId
  name: string
  speed_kts: number          // cruise
  combat_radius_km: number
  sensors: Sensor[]          // radar per airframe (E-2D huge + datalink)
  weapons: WeaponLoadout[]   // per-airframe loadout template by mission
  datalink_range_km?: number // E-2D/E-3 are hubs
  rcs_class: 'stealth' | 'fighter' | 'large'
}

export type AirMissionKind = 'cap' | 'strike' | 'aew'
export interface AirMission {
  id: string
  kind: AirMissionKind
  squadronId: string
  fromUnitId: UnitId
  flightSize: number          // 2-4
  station?: Position          // cap/aew orbit point
  targetId?: UnitId           // strike
  escortSead?: boolean        // EA-18G pair attached (USA only)
  extendedRange?: boolean     // tanker tax: +35% radius, −2 fa18e sorties
  status: 'planning' | 'active' | 'complete' | 'aborted'
  planningCompleteTick?: number
  flightUnitId?: UnitId       // spawned Flight unit
}
// GameState gains: airMissions?: AirMission[]
```

Flights are real `Unit`s, category `'aircraft'`, id `flight_<n>`, name
"2× F/A-18E (VFA-14)" — movement, visibility contacts, SAM engagement,
war-support, datalink all work day one. Flight unit carries the airframe's
sensors/weapons (scaled by flightSize) and `flightMeta` fields on Unit:
`{ missionId, bingoTick, rtbTo: UnitId }` (optional, plain data).

## 2. Sortie economy (CMO numbers)

- CAP quick-turn 90 game-min; strike turnaround 6 h (surge) / 20 h (sustained).
- Carrier ceiling ~100 sorties/day enforced implicitly by pools + turnarounds.
- 30% of each squadron's `total` starts in maintenance (deduct from available
  at init; returns at scenario start + 12-24 h via readyAt).
- SURGE OPS: one global toggle (command). 96 h of halved ready times, then
  ×1.5 sustained for the rest of the war. TopBar chip while active.
- `extendedRange` deducts 2 extra fa18e sorties from the carrier (buddy
  tanking; MQ-25 slipped to 2029).
- Strike planning delay: 2-6 h (rng seeded by mission id) between order and
  launch window — `status: 'planning'`. CAP/AEW launch next tick.

## 3. Mission behavior (engine/systems/air-ops.ts)

Per game-minute evaluation + per-tick movement (movement.ts already moves
aircraft units; air-ops only sets waypoints/decisions):

- **Launch**: pop `available`, spawn Flight at the host position, waypoints to
  station/target. bingoTick = now + 2×(transit time) + on-station allowance
  derived from combat_radius vs distance (never fuel liters).
- **CAP**: orbit station (small 4-waypoint racetrack, re-issued when reached).
  Auto-intercept: nearest enemy `aircraft` contact (tracked+, live) within
  commit range 120 km → engage via AUTO_ENGAGEMENT path with A2A pK table
  (new weapon type 'aam', simple pK per rcs_class; one engagement roll per
  30 game-s within 40 km). Iranian flights symmetric.
- **Strike**: transit to release range of targetId (per loadout weapon),
  spawn EXISTING missiles via launchMissile (trackQuality from the nation
  picture like friendly-ai), then RTB. SEAD escort: while within 80 km of the
  flight, enemy SAM detection_prob×0.6 and pk×0.6 vs this flight's missiles
  AND emitting SAMs within 150 km become 'detected' contacts (ELINT hook).
- **AEW**: orbit station; the Flight has E-2D sensors + datalink_range_km →
  the existing visibility + fire-control network does the rest.
- **RTB**: at bingo or out of weapons → waypoints home, on arrival the Flight
  unit is removed, squadron readyAt += turnaround, `available` restored minus
  losses. Flight destroyed → airframes lost, pilot roll per airframe:
  KIA (−2 war support) / rescued (+1) / POW (−4, OSINT event).
- **Iran AI**: scramble-only — when a detected USA package/flight approaches a
  defended box, spawn an interceptor CAP from the nearest airbase with
  available fighters (ai.ts hook, max 2 concurrent). Su-35 squadron only
  scrambles to defend Hamadan/Tehran. Parked airframes: each Iranian airbase
  exposes `airWing` totals to BDA — airbase damage destroys parked airframes
  proportionally (UNIT damage events → pool reduction; satellite pass caption
  mentions counted airframes).

## 4. Commands

`LAUNCH_AIR_MISSION { kind, squadronId, fromUnitId, flightSize, station?, targetId?, escortSead?, extendedRange? }`,
`CANCEL_AIR_MISSION { missionId }` (RTB immediately), `SET_SURGE_OPS { enabled }`.

## 5. UI — Air Plan board

- New AIR button in TopBar → AirOpsPanel (Panel, draggable like the rest):
  per host (carrier/airbase): squadron rows (name, airframe, available/total,
  next-ready countdown), active missions list (kind, flight, status, BINGO
  countdown, CANCEL), mission composer: kind → squadron → flight size →
  (station: click-map capture like satellite tasking / target: enemy contact
  picker) → SEAD/extended-range checkboxes → LAUNCH. SURGE OPS toggle with
  the 96 h consequence spelled out.
- Map: Flight units render with existing aircraft icon; CAP/AEW stations get
  a small racetrack glyph (IntelLayers-style); strike flights show a target
  line when selected.
- ViewState: `airMissions` slice (player nation only) + squadron pools on
  ViewUnit (own units only, scrubbed for enemies — enemy pools NEVER leak;
  BDA estimates come via imagery product captions only).

## 6. Out of scope (→ BACKLOG)

Individual airframes, fuel-liter modeling, tanker tracks, weather aborts,
A2A missile entities (pK roll abstraction instead), runway cratering state
(airbase health already gates), carrier deck cycles visualization.

## 7. Build split

Scaffold (orchestrator): types + commands + airframe/squadron data files +
air-ops.ts skeleton + game-engine wiring + view slice.
- C1: air-ops.ts full implementation + ai scramble hook + tests.
- C2: AirOpsPanel + TopBar AIR + map glyphs + tests.
- C3: data verification pass (CVW-9 + Iranian orbat numbers vs research),
  BDA/pool wiring on airbase damage + imagery captions, pilot-fate events +
  AlertFeed formatters + OSINT feed coverage, tests.
- T: smoke extension (launch CAP, see flight on map, RTB).
