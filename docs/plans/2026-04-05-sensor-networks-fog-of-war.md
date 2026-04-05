# Sensor Networks, Fog of War & Missile Routing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add fog of war, sensor networks with destroyable hubs, intel planning overlay, and cruise missile route planning through radar blind spots.

**Architecture:** Each tick, the engine builds a sensor network graph per nation (who connects to which hub). Only units detected by the player's network appear in the view state. SAMs engage network-detected targets with accuracy modifiers. The UI adds intel overlay (estimated enemy positions) and route planning (waypoints with threat/exposure coloring).

**Tech Stack:** TypeScript, Zustand, MapLibre GL, deck.gl, @turf/destination, existing ElevationGrid

---

## Phase 1: Fog of War Engine

### Task 1: Add detection types and network interfaces

**Files:**
- Modify: `src/types/game.ts`
- Create: `src/engine/systems/sensor-network.ts`

**Step 1: Add types to game.ts**

Add to `src/types/game.ts`:
```ts
export type DetectionState = 'unknown' | 'estimated' | 'detected' | 'tracked'

// Add to Unit interface:
datalink_range_km?: number  // hub units only — range of datalink to share detection
```

**Step 2: Create sensor-network.ts skeleton**

Create `src/engine/systems/sensor-network.ts`:
```ts
import type { GameState, NationId, UnitId, Unit, Missile } from '@/types/game'
import type { ElevationGrid } from './elevation'
import { haversine } from '../utils/geo'
import { detectThreats, type DetectedThreat } from './detection'

export interface NetworkDetection {
  missile: Missile
  detectedBy: UnitId
  quality: 'tracked' | 'detected'
  distKm: number
  timeToImpactMs: number
}

export interface SensorNetwork {
  // unit → hub IDs it's connected to
  connections: Map<UnitId, UnitId[]>
  // nation → missile ID → detection
  sharedDetections: Map<NationId, Map<string, NetworkDetection>>
}

/** Build the sensor network graph and compute shared detections */
export function buildSensorNetwork(
  state: GameState,
  grid?: ElevationGrid | null,
): SensorNetwork {
  const connections = new Map<UnitId, UnitId[]>()
  const sharedDetections = new Map<NationId, Map<string, NetworkDetection>>()

  // 1. Find all hubs (units with datalink_range_km > 0)
  const hubs: Unit[] = []
  for (const unit of state.units.values()) {
    if (unit.status === 'destroyed') continue
    if (unit.datalink_range_km && unit.datalink_range_km > 0) {
      hubs.push(unit)
    }
  }

  // 2. Connect units to hubs within datalink range
  for (const unit of state.units.values()) {
    if (unit.status === 'destroyed') continue
    if (unit.sensors.length === 0) continue
    const connectedHubs: UnitId[] = []
    for (const hub of hubs) {
      if (hub.nation !== unit.nation) continue
      if (haversine(unit.position, hub.position) <= hub.datalink_range_km!) {
        connectedHubs.push(hub.id)
      }
    }
    connections.set(unit.id, connectedHubs)
  }

  // 3. Each radar unit detects locally
  const localDetections = new Map<UnitId, DetectedThreat[]>()
  for (const unit of state.units.values()) {
    if (unit.status === 'destroyed') continue
    if (unit.sensors.length === 0) continue
    const threats = detectThreats(state, unit, grid)
    if (threats.length > 0) {
      localDetections.set(unit.id, threats)
    }
  }

  // 4. Propagate detections through network
  for (const [nationId] of Object.entries(state.nations)) {
    const nationDetections = new Map<string, NetworkDetection>()

    for (const [unitId, threats] of localDetections) {
      const unit = state.units.get(unitId)!
      if (unit.nation !== nationId) continue

      for (const threat of threats) {
        const existing = nationDetections.get(threat.missile.id)
        // Keep the best quality detection
        if (!existing || threat.distKm < existing.distKm) {
          nationDetections.set(threat.missile.id, {
            missile: threat.missile,
            detectedBy: unitId,
            quality: 'tracked', // local detection = tracked quality
            distKm: threat.distKm,
            timeToImpactMs: threat.timeToImpactMs,
          })
        }
      }
    }

    // Share through hubs: any unit connected to the same hub as a detecting unit gets the data
    for (const [unitId, threats] of localDetections) {
      const unit = state.units.get(unitId)!
      if (unit.nation !== nationId) continue
      const unitHubs = connections.get(unitId) ?? []

      for (const threat of threats) {
        // Find all units connected to the same hubs
        for (const [otherUnitId, otherHubs] of connections) {
          const otherUnit = state.units.get(otherUnitId)
          if (!otherUnit || otherUnit.nation !== nationId) continue
          if (otherUnitId === unitId) continue

          // Check if they share a hub
          const sharesHub = otherHubs.some(h => unitHubs.includes(h))
          if (sharesHub) {
            const existing = nationDetections.get(threat.missile.id)
            if (!existing) {
              nationDetections.set(threat.missile.id, {
                missile: threat.missile,
                detectedBy: unitId,
                quality: 'detected', // network-shared = detected quality
                distKm: threat.distKm,
                timeToImpactMs: threat.timeToImpactMs,
              })
            }
          }
        }
      }
    }

    sharedDetections.set(nationId as NationId, nationDetections)
  }

  return { connections, sharedDetections }
}

/** Get threats visible to a specific unit via the network */
export function detectThreatsNetworked(
  state: GameState,
  adUnit: Unit,
  network: SensorNetwork,
  grid?: ElevationGrid | null,
): (DetectedThreat & { networkQuality: 'own' | 'tracked' | 'detected' })[] {
  // Own detections
  const ownThreats = detectThreats(state, adUnit, grid)
  const result = ownThreats.map(t => ({ ...t, networkQuality: 'own' as const }))
  const seen = new Set(ownThreats.map(t => t.missile.id))

  // Network detections
  const nationDetections = network.sharedDetections.get(adUnit.nation)
  if (nationDetections) {
    for (const [missileId, nd] of nationDetections) {
      if (seen.has(missileId)) continue
      // Only share if this unit is connected to the network
      const unitHubs = network.connections.get(adUnit.id) ?? []
      const detectorHubs = network.connections.get(nd.detectedBy) ?? []
      const sharesHub = unitHubs.some(h => detectorHubs.includes(h))
      if (sharesHub) {
        result.push({
          missile: nd.missile,
          distKm: nd.distKm,
          timeToImpactMs: nd.timeToImpactMs,
          networkQuality: nd.quality,
        })
      }
    }
  }

  return result
}
```

**Step 3: Verify types compile**
```bash
npx tsc -b --noEmit
```

**Step 4: Commit**
```bash
git commit -m "feat: add sensor network types and graph builder"
```

---

### Task 2: Integrate sensor network into game engine tick

**Files:**
- Modify: `src/engine/game-engine.ts`

**Step 1: Import and call buildSensorNetwork each tick**

In game-engine.ts tick():
```ts
import { buildSensorNetwork, type SensorNetwork } from './systems/sensor-network'

// In tick(), after processMovement, before processOrders:
const sensorNetwork = buildSensorNetwork(state, this.elevationGrid)
```

Store as `this.sensorNetwork` on the engine class so combat can access it.

**Step 2: Filter viewState to only visible units**

In `getViewState()`, filter enemy units based on whether they were detected:
```ts
// Only include enemy units that are detected by the player's network
const playerDetections = this.sensorNetwork?.sharedDetections.get(state.playerNation)
const visibleUnits = Array.from(state.units.values()).filter(u => {
  if (u.nation === state.playerNation) return true // always see own units
  // Check if any player sensor detected this unit (for ground unit visibility)
  // For now: show all ground units, fog of war applies to missiles only initially
  return true // TODO Phase 1b: implement ground unit fog of war
})
```

Start simple — fog of war for missiles first (detection already works), ground unit fog of war in Phase 1b.

**Step 3: Build and verify**
```bash
npm run build
```

**Step 4: Commit**
```bash
git commit -m "feat: integrate sensor network into game engine tick"
```

---

### Task 3: Use detectThreatsNetworked in combat

**Files:**
- Modify: `src/engine/systems/combat.ts`

**Step 1: Replace detectThreats with detectThreatsNetworked**

In `runADEngagement()`:
```ts
import { detectThreatsNetworked } from './sensor-network'

// Replace: const threats = detectThreats(state, unit, elevationGrid)
// With:
const threats = detectThreatsNetworked(state, unit, sensorNetwork, elevationGrid)
```

Thread `sensorNetwork` parameter through `processCombat()` → `runADEngagement()`.

**Step 2: Apply accuracy modifier based on networkQuality**

When computing kill probability:
```ts
const qualityModifier = threat.networkQuality === 'own' ? 1.0
  : threat.networkQuality === 'tracked' ? 0.7
  : 0.4 // 'detected'
const effectivePK = basePK * qualityModifier
```

**Step 3: Build and verify**
```bash
npm run build
```

**Step 4: Commit**
```bash
git commit -m "feat: use networked detection in combat with accuracy modifiers"
```

---

## Phase 2: Network Hub Units

### Task 4: Add AWACS and EW units to orbat + catalog

**Files:**
- Modify: `src/data/units/usa-orbat.ts`
- Modify: `src/data/units/iran-orbat.ts`
- Modify: `src/data/catalog/usa-catalog.ts`
- Modify: `src/data/catalog/iran-catalog.ts`

**Step 1: Add USA hub units**

In usa-orbat.ts, add:
- E-3 Sentry AWACS: aircraft category, position {lat: 26, lng: 50} (orbiting Gulf), speed 300kts, sensors [{type:'radar', range_km:400, detection_prob:0.95, antenna_height_m:10000, sector_deg:360}], datalink_range_km: 600
- E-2D Hawkeye: on carrier (position near CVN), speed 280kts, sensors [{type:'radar', range_km:300, detection_prob:0.92, antenna_height_m:8000, sector_deg:360}], datalink_range_km: 400

Set datalink_range_km on existing units:
- Airbases: datalink_range_km: 150
- Aegis DDGs: datalink_range_km: 300
- CVN CSG: datalink_range_km: 300

In usa-catalog.ts, add AWACS catalog entries.

**Step 2: Add Iran hub units**

In iran-orbat.ts, add:
- Nebo SVU EW radar: sam_site category (fixed), position near Tehran, sensors [{type:'radar', range_km:400, detection_prob:0.90, antenna_height_m:30, sector_deg:360}], datalink_range_km: 300
- Mobile command post: missile_battery category (mobile), speed 40kts, sensors [{type:'radar', range_km:100, detection_prob:0.80, antenna_height_m:10}], datalink_range_km: 300

Set datalink_range_km on existing units:
- Airbases: datalink_range_km: 150
- Ships: datalink_range_km: 100

In iran-catalog.ts, add entries.

**Step 3: Build and verify**
```bash
npm run build
```

**Step 4: Commit**
```bash
git commit -m "feat: add AWACS, EW radar, command post units with datalink"
```

---

## Phase 3: Intel Overlay

### Task 5: Create intel store

**Files:**
- Create: `src/store/intel-store.ts`

**Step 1: Write the store**

```ts
import { create } from 'zustand'
import type { Position, UnitCategory, Sensor } from '@/types/game'
import type { UnitCatalogEntry } from '@/types/scenario'

export interface EstimatedUnit {
  id: string
  catalogId: string
  position: Position
  name: string
  category: UnitCategory
  sensors: Sensor[]
  confirmed: boolean
}

interface IntelState {
  estimatedUnits: EstimatedUnit[]
  placingCatalogId: string | null // currently placing this unit type

  addEstimate(entry: UnitCatalogEntry, position: Position): void
  removeEstimate(id: string): void
  moveEstimate(id: string, position: Position): void
  confirmEstimate(id: string): void
  setPlacing(catalogId: string | null): void
  reset(): void
}

let counter = 0

export const useIntelStore = create<IntelState>((set) => ({
  estimatedUnits: [],
  placingCatalogId: null,

  addEstimate: (entry, position) => set(s => ({
    estimatedUnits: [...s.estimatedUnits, {
      id: `intel_${counter++}`,
      catalogId: entry.id,
      position,
      name: entry.name,
      category: entry.category,
      sensors: entry.template.sensors ?? [],
      confirmed: false,
    }],
    placingCatalogId: null,
  })),

  removeEstimate: (id) => set(s => ({
    estimatedUnits: s.estimatedUnits.filter(u => u.id !== id),
  })),

  moveEstimate: (id, position) => set(s => ({
    estimatedUnits: s.estimatedUnits.map(u =>
      u.id === id ? { ...u, position } : u
    ),
  })),

  confirmEstimate: (id) => set(s => ({
    estimatedUnits: s.estimatedUnits.map(u =>
      u.id === id ? { ...u, confirmed: true } : u
    ),
  })),

  setPlacing: (catalogId) => set({ placingCatalogId: catalogId }),
  reset: () => set({ estimatedUnits: [], placingCatalogId: null }),
}))
```

**Step 2: Build and commit**
```bash
npm run build
git commit -m "feat: add intel store for estimated enemy positions"
```

---

### Task 6: Create Intel Panel UI

**Files:**
- Create: `src/components/panels/IntelPanel.tsx`
- Modify: `src/components/hud/TopBar.tsx` (add INTEL button)

**Step 1: Create IntelPanel.tsx**

A panel that shows the enemy unit catalog and list of placed estimates. Player clicks a catalog entry → enters placement mode → clicks map to place. Shows list of estimates with remove buttons.

Style matches existing panels (dark military theme, monospace font).

**Step 2: Add INTEL button to TopBar**

Add next to ORBAT/SITREP/ECON/STRIKE buttons.

**Step 3: Wire into App.tsx or GameMap.tsx**

Map click handler checks `useIntelStore.placingCatalogId` — if set, place an estimate instead of selecting a unit.

**Step 4: Build and commit**
```bash
npm run build
git commit -m "feat: add Intel Panel for estimated enemy placement"
```

---

### Task 7: Render estimated units and coverage on map

**Files:**
- Create: `src/components/map/layers/IntelLayer.ts`
- Modify: `src/components/map/GameMap.tsx`

**Step 1: Create IntelLayer.ts**

Renders estimated units as deck.gl IconLayer with dashed/dotted styling (reduced opacity, "?" badge). Renders estimated radar coverage as dashed MapLibre polygons using the same LOSLayer computation but with dashed line style.

**Step 2: Integrate into GameMap**

Read `useIntelStore.estimatedUnits`, render IntelLayer, render coverage polygons.

**Step 3: Build and commit**
```bash
npm run build
git commit -m "feat: render estimated enemy units and coverage on map"
```

---

## Phase 4: Missile Route Planning

### Task 8: Add waypoint support to missile launch

**Files:**
- Modify: `src/types/commands.ts` (add waypoints to LAUNCH_MISSILE)
- Modify: `src/engine/systems/combat.ts` (use waypoints in path generation)

**Step 1: Add waypoints to LAUNCH_MISSILE command**

```ts
{ type: 'LAUNCH_MISSILE'; launcherId: UnitId; weaponId: string; targetId: UnitId; waypoints?: Position[] }
```

**Step 2: Modify launchMissile to use waypoints**

When waypoints are provided, generate the great-circle path through waypoints instead of direct launcher→target. Each segment is a great-circle arc. Total path distance must not exceed weapon range.

**Step 3: Build and commit**
```bash
npm run build
git commit -m "feat: support waypoints in missile launch path"
```

---

### Task 9: Route planning UI in StrikePanel

**Files:**
- Modify: `src/components/panels/StrikePanel.tsx`
- Create: `src/components/map/layers/RouteLayer.ts`
- Modify: `src/components/map/GameMap.tsx`

**Step 1: Add PLAN ROUTE button**

In StrikePanel DirectFireTab, add "PLAN ROUTE" button next to FIRE. When clicked:
- Store enters routing mode (new state in strike-store: `routingMode: boolean`, `routeWaypoints: Position[]`)
- Map shows threat overlay (enemy radar coverage in red)
- Clicks add waypoints to the route

**Step 2: Create RouteLayer.ts**

Renders the planned route as a deck.gl PathLayer. Each segment color-coded:
- Green: no radar coverage at cruise altitude
- Yellow: near edge of coverage
- Red: within enemy radar coverage

Check exposure using the same `radarHorizon` + `hasLineOfSight` functions against all known + estimated enemy radars.

Show fuel remaining as a label at the route endpoint.

**Step 3: Add CONFIRM ROUTE and AUTO-ROUTE buttons**

CONFIRM ROUTE: fires the missile with the waypoints.
AUTO-ROUTE: calls the A* pathfinder (Task 10).

**Step 4: Build and commit**
```bash
npm run build
git commit -m "feat: add route planning UI with threat overlay and exposure coloring"
```

---

## Phase 5: Auto-Routing

### Task 10: A* pathfinder for missile routes

**Files:**
- Create: `src/engine/systems/route-planner.ts`

**Step 1: Implement grid-based A***

Uses the elevation grid (0.05° cells). Cost function:
- baseCost: distance
- radarExposureCost: 100× if cell within enemy radar coverage at cruise altitude
- climbCost: elevation_change × 0.01

Returns simplified waypoint array (every Nth A* node → waypoint).

Runs on main thread. ~100ms for the theater at 5km resolution.

**Step 2: Integrate into StrikePanel AUTO-ROUTE button**

**Step 3: Build and commit**
```bash
npm run build
git commit -m "feat: add A* auto-routing for cruise missiles"
```

---

## Phase 6: ELINT

### Task 11: Radar emission detection

**Files:**
- Modify: `src/engine/systems/sensor-network.ts`

**Step 1: Add ELINT to buildSensorNetwork**

For each friendly unit, check if any enemy radar is within 1.5× the enemy radar's range. If so, the enemy unit is added to detections with `detectedVia: 'elint'`.

This reveals enemy radar positions without visual detection.

**Step 2: Build and commit**
```bash
npm run build
git commit -m "feat: add ELINT radar emission detection"
```

---

## Phase 7: Satellites

### Task 12: Satellite reconnaissance

**Files:**
- Create: `src/engine/systems/satellites.ts`
- Modify: `src/types/game.ts` (add SatellitePass to nation state)
- Modify: `src/engine/game-engine.ts` (run satellite system each tick)

**Step 1: Satellite model**

Each nation has satellite assets that periodically pass over the theater. A satellite pass reveals all ground units in a swath for a brief window.

```ts
interface SatellitePass {
  id: string
  nation: NationId
  type: 'optical' | 'radar_sat'  // optical = clear weather only, radar = all weather
  swathWidth_km: number           // ~50km for optical, ~200km for radar
  revisitInterval_sec: number     // time between passes (3600-7200 = 1-2 game hours)
  lastPassTick: number
  groundTrack: { startLat: number; startLng: number; endLat: number; endLng: number }
}
```

**USA satellites:** 2 optical (high-res, 50km swath, 1hr revisit), 1 radar (all-weather, 200km swath, 2hr revisit)
**Iran satellites:** 1 optical (lower-res, 30km swath, 3hr revisit)

**Step 2: Each tick, check if a satellite pass is due**

When `tick - lastPassTick >= revisitInterval_sec`:
- Sweep the ground track
- All enemy ground units within swathWidth of the track → detected for 60 seconds
- After 60 seconds without re-detection → fade to "last known position"

**Step 3: Add satellite pass visualization**

Brief animated line sweeping across the map during a pass. Subtle — just a faint line moving across.

**Step 4: Build and commit**
```bash
npm run build
git commit -m "feat: add satellite reconnaissance with periodic passes"
```

---

## Phase 8: Espionage Budget (HUMINT/SIGINT)

### Task 13: Intelligence budget system

**Files:**
- Modify: `src/types/game.ts` (add intel budget to Nation)
- Create: `src/engine/systems/espionage.ts`
- Modify: `src/engine/game-engine.ts` (run espionage each tick)

**Step 1: Add intel budget to Nation**

```ts
// Add to Nation.economy or as separate field:
interface IntelBudget {
  total_pct: number        // % of military budget allocated to intel (0-30%)
  humint_pct: number       // % of intel budget on HUMINT (human intelligence)
  sigint_pct: number       // % of intel budget on SIGINT (signals intelligence)
  satellite_pct: number    // % of intel budget on satellite reconnaissance
}
```

Higher budget → better detection:
- **HUMINT**: reveals enemy unit positions with delay (hours). Random chance per unit per game-hour. Higher budget = more frequent reveals. Represents spies, informants.
- **SIGINT**: same as ELINT but passive — intercept enemy communications to reveal movements and intentions. Higher budget = wider coverage.
- **Satellite**: more budget = more satellite passes, better resolution (wider swath).

**Step 2: Create espionage.ts**

```ts
export function processEspionage(state: GameState, rng: SeededRNG): void {
  for (const nation of Object.values(state.nations)) {
    const budget = nation.intelBudget
    if (!budget) continue
    
    const enemyNation = nation.id === 'usa' ? 'iran' : 'usa'
    
    // HUMINT: random chance to reveal enemy units
    // Base chance per unit per hour: 0.5% * (humint_pct / 10)
    // At 30% total, 50% humint → ~1.5% per unit per hour
    if (state.time.tick % 3600 === 0) { // check once per game-hour
      const humintChance = 0.005 * (budget.humint_pct / 10) * (budget.total_pct / 10)
      for (const unit of state.units.values()) {
        if (unit.nation !== enemyNation) continue
        if (unit.status === 'destroyed') continue
        if (rng.chance(humintChance)) {
          // Reveal this unit — add to detection map with 'detected' quality
          // Position has ±20km jitter (HUMINT isn't precise)
        }
      }
    }
    
    // SIGINT: passive detection of radio/radar emissions
    // Higher budget = detect at greater range (1.5x → 2.0x radar range)
    const sigintMultiplier = 1.5 + (budget.sigint_pct / 100) * 0.5
    // Applied in ELINT detection (Task 11) as range multiplier
  }
}
```

**Step 3: Build and commit**
```bash
npm run build
git commit -m "feat: add espionage system with HUMINT/SIGINT/satellite budget"
```

---

### Task 14: Intel budget UI

**Files:**
- Create: `src/components/panels/IntelBudgetPanel.tsx`
- Modify: `src/components/panels/EconomyPanel.tsx` or create new tab

**Step 1: Create budget sliders**

A panel accessible from the Intel Panel or Economy Panel with:
- **Total Intel Budget**: slider 0-30% of military budget
- **HUMINT**: slider showing % allocation (of intel budget)
- **SIGINT**: slider showing % allocation
- **Satellite**: slider showing % allocation
- Three sliders must sum to 100% — adjusting one auto-adjusts others

Shows effects:
- "HUMINT: ~2 enemy units revealed per hour"
- "SIGINT: detect radar emissions at 2.0× range"
- "Satellites: 3 passes per hour, 50km swath"

**Step 2: Send budget changes as commands to worker**

New command: `SET_INTEL_BUDGET` with the allocation percentages.

**Step 3: Build and commit**
```bash
npm run build
git commit -m "feat: add intel budget UI with HUMINT/SIGINT/satellite sliders"
```

---

## Dependency Graph

```
Task 1 (types + network) → Task 2 (engine integration) → Task 3 (combat integration)
                                                              ↓
                                                         Task 4 (hub units)

Task 5 (intel store) → Task 6 (intel panel) → Task 7 (intel rendering)
                                                  ↓
                                             Task 14 (budget UI)

Task 8 (waypoint launch) → Task 9 (route UI) → Task 10 (auto-routing)

Task 11 (ELINT) — depends on Task 1 only
Task 12 (satellites) — depends on Task 1 only  
Task 13 (espionage) — depends on Task 1 + Task 11

Parallelizable groups:
- Group A (engine): Tasks 1→2→3→4
- Group B (intel UI): Tasks 5→6→7→14
- Group C (routing): Tasks 8→9→10 (after Task 3)
- Group D (detection extras): Tasks 11, 12, 13 (after Task 1)
```
