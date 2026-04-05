# Map System Overhaul: Vector Tiles, Satellite, Elevation & Radar LOS

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace CARTO raster tiles with OpenFreeMap vector + ESRI satellite, add elevation grid for terrain-aware radar LOS and cruise missile terrain following, add map/elevation/LOS toggle UI.

**Architecture:** One elevation Float32Array grid (0.05 deg, ~1.8MB) covers the theater and serves all systems: detection, movement, placement, visualization. Map styles are generated programmatically from tile URLs in one config file — swap providers by changing URLs. LOS visualization uses raycasting from radar positions against the elevation grid.

**Tech Stack:** MapLibre GL JS 4.7+, OpenFreeMap (vector tiles, OpenMapTiles schema), ESRI World Imagery (satellite raster), AWS/Mapzen terrain-RGB (DEM source for offline grid build), @turf/helpers, Python rasterio (offline grid build).

---

## Task 1: Elevation Grid Data Pipeline (offline script)

**Files:**
- Create: `scripts/build-elevation-grid.py`
- Create: `public/data/theater-elevation.bin`

**Step 1: Install Python dependencies**

```bash
pip3 install rasterio numpy requests
```

**Step 2: Write the grid builder script**

The script:
1. Downloads SRTM 30m tiles from OpenTopography (or CGIAR mirror) covering lat 12-43, lng 32-70
2. Merges tiles into one raster
3. Downsamples to 0.05 deg resolution (620 x 760 cells)
4. Sets ocean cells to 0 (water)
5. Exports as raw little-endian Float32 binary

Header format: first 20 bytes = `[latMin, latMax, lngMin, lngMax, resolution]` as Float32, then grid data row-major (south to north, west to east).

**Step 3: Run the script**

```bash
python3 scripts/build-elevation-grid.py
```
Expected: `public/data/theater-elevation.bin` created, ~1.8MB

**Step 4: Commit**

```bash
git add scripts/build-elevation-grid.py public/data/theater-elevation.bin
git commit -m "feat: add elevation grid data pipeline and theater DEM"
```

---

## Task 2: ElevationGrid Engine Class

**Files:**
- Create: `src/engine/systems/elevation.ts`
- Modify: `src/types/game.ts` (add elevation_m to Position, antenna_height_m to Sensor)

**Step 1: Add type extensions**

In `src/types/game.ts`, add to `Position`:
```ts
elevation_m?: number
```

Add to `Sensor`:
```ts
antenna_height_m?: number  // height above ground, defaults vary by system
```

**Step 2: Write ElevationGrid class**

`src/engine/systems/elevation.ts`:
```ts
export class ElevationGrid {
  private grid: Float32Array
  private latMin: number
  private lngMin: number
  private latRange: number
  private lngRange: number
  private rows: number
  private cols: number
  private resolution: number

  constructor(buffer: ArrayBuffer) {
    // Parse header: 5 x Float32 = 20 bytes
    const header = new Float32Array(buffer, 0, 5)
    this.latMin = header[0]
    const latMax = header[1]
    this.lngMin = header[2]
    const lngMax = header[3]
    this.resolution = header[4]
    this.latRange = latMax - this.latMin
    this.lngRange = lngMax - this.lngMin
    this.rows = Math.round(this.latRange / this.resolution)
    this.cols = Math.round(this.lngRange / this.resolution)
    this.grid = new Float32Array(buffer, 20)
  }

  getElevation(lat: number, lng: number): number {
    const row = Math.floor((lat - this.latMin) / this.resolution)
    const col = Math.floor((lng - this.lngMin) / this.resolution)
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return 0
    return this.grid[row * this.cols + col]
  }

  isWater(lat: number, lng: number): boolean {
    return this.getElevation(lat, lng) <= 0
  }

  sampleLine(from: Position, to: Position, samples: number): number[] {
    const result: number[] = []
    for (let i = 0; i <= samples; i++) {
      const t = i / samples
      const lat = from.lat + (to.lat - from.lat) * t
      const lng = from.lng + (to.lng - from.lng) * t
      result.push(this.getElevation(lat, lng))
    }
    return result
  }
}
```

**Step 3: Verify types compile**

```bash
npx tsc -b --noEmit
```

**Step 4: Commit**

```bash
git add src/engine/systems/elevation.ts src/types/game.ts
git commit -m "feat: add ElevationGrid class with O(1) terrain lookups"
```

---

## Task 3: Load Elevation Grid in Worker

**Files:**
- Modify: `src/engine/game-engine.ts` (add elevationGrid property)
- Modify: `src/engine/worker.ts` (add loadElevation method, fetch .bin on init)

**Step 1: Add grid to GameEngine**

In `game-engine.ts`, add property:
```ts
elevationGrid: ElevationGrid | null = null
```

Add method:
```ts
setElevationGrid(grid: ElevationGrid): void {
  this.elevationGrid = grid
}
```

**Step 2: Add worker method to load elevation**

In `worker.ts`, add to the api object:
```ts
async loadElevation(): Promise<void> {
  const resp = await fetch('/data/theater-elevation.bin')
  const buf = await resp.arrayBuffer()
  engine.setElevationGrid(new ElevationGrid(buf))
}
```

**Step 3: Call loadElevation from bridge on init**

In `src/store/bridge.ts`, after `initBridge()` creates the worker, call `api.loadElevation()`.

**Step 4: Build and verify**

```bash
npm run build
```

**Step 5: Commit**

```bash
git add src/engine/game-engine.ts src/engine/worker.ts src/store/bridge.ts
git commit -m "feat: load elevation grid in worker on bridge init"
```

---

## Task 4: Radar LOS in Detection System

**Files:**
- Modify: `src/engine/systems/detection.ts` (add horizon + terrain masking)

**Step 1: Add radar horizon function**

```ts
/** Radar horizon distance in km using 4/3 earth model */
function radarHorizon(antennaHeightM: number, targetHeightM: number): number {
  return 4.12 * (Math.sqrt(Math.max(0, antennaHeightM)) + Math.sqrt(Math.max(0, targetHeightM)))
}
```

**Step 2: Add LOS check function**

```ts
/** Check line-of-sight between radar and target using elevation grid */
function hasLineOfSight(
  radar: Position, radarAltM: number,
  target: { lat: number; lng: number }, targetAltM: number,
  grid: ElevationGrid,
): boolean {
  const samples = grid.sampleLine(radar, { lat: target.lat, lng: target.lng }, 10)
  const distKm = haversine(radar, { lat: target.lat, lng: target.lng })
  
  for (let i = 1; i < samples.length - 1; i++) {
    const t = i / (samples.length - 1)
    const losHeight = radarAltM + (targetAltM - radarAltM) * t
    if (samples[i] > losHeight) return false // terrain blocks LOS
  }
  return true
}
```

**Step 3: Integrate into detectThreats()**

Before the existing `if (dist <= effectiveRange)` check, add:
```ts
// Radar horizon check
const radarElevation = grid?.getElevation(adUnit.position.lat, adUnit.position.lng) ?? 0
const antennaHeight = (adUnit.sensors.find(s => s.type === 'radar')?.antenna_height_m ?? 15)
const radarAltM = radarElevation + antennaHeight
const targetAltM = missile.altitude_m ?? 50

const horizonKm = radarHorizon(radarAltM, targetAltM)
if (dist > horizonKm) continue

// Terrain masking check  
if (grid && !hasLineOfSight(adUnit.position, radarAltM, currentPos, targetAltM, grid)) continue
```

Pass the grid into `detectThreats` as a parameter — `detectThreats(state, adUnit, grid?)`.

**Step 4: Update callers**

In `combat.ts`, pass `engine.elevationGrid` when calling `detectThreats`.

**Step 5: Build and verify**

```bash
npm run build
```

**Step 6: Commit**

```bash
git add src/engine/systems/detection.ts src/engine/systems/combat.ts
git commit -m "feat: add radar horizon and terrain LOS masking to detection"
```

---

## Task 5: Cruise Missile Terrain Following

**Files:**
- Modify: `src/engine/systems/movement.ts` (terrain-aware altitude for cruise missiles)
- Modify: `src/engine/systems/combat.ts` (pre-sample path on launch)

**Step 1: Add terrain following to missile movement**

In `movement.ts`, for cruise-phase missiles, after position update:
```ts
if (grid && missile.phase === 'cruise') {
  const terrainElev = grid.getElevation(missile.position.lat, missile.position.lng)
  const clearance = 50 // meters above terrain
  const minAlt = terrainElev + clearance
  const cruiseAlt = missile.flight_altitude_ft * 0.3048 // ft to meters
  
  const requiredAlt = Math.max(cruiseAlt, minAlt)
  
  if (missile.altitude_m < requiredAlt) {
    // Climbing — costs extra fuel
    const climbRate = Math.min(requiredAlt - missile.altitude_m, 30) // max 30m/tick climb
    missile.altitude_m += climbRate
    missile.fuel_remaining -= climbRate * 0.001 // climb fuel penalty
  } else if (missile.altitude_m > requiredAlt + 200) {
    // Descend back to optimal altitude
    missile.altitude_m = Math.max(requiredAlt, missile.altitude_m - 20)
  }
}
```

**Step 2: Pass grid through movement system**

Update `processMovement(state)` signature to accept optional grid, pass from game-engine tick.

**Step 3: Build and verify**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/engine/systems/movement.ts src/engine/game-engine.ts
git commit -m "feat: cruise missile terrain following with climb fuel penalty"
```

---

## Task 6: Map Provider Config

**Files:**
- Create: `src/styles/map-providers.ts`
- Delete: `src/styles/map-style.json`

**Step 1: Write map-providers.ts**

```ts
import type { StyleSpecification } from 'maplibre-gl'

export type MapMode = 'dark' | 'satellite'

const OPENFREE_TILES = 'https://tiles.openfreemap.org/planet-osm/{z}/{x}/{y}.pbf'
const ESRI_SAT_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

export function getMapStyle(mode: MapMode): StyleSpecification {
  return mode === 'dark' ? buildDarkStyle() : buildSatelliteStyle()
}

function buildDarkStyle(): StyleSpecification {
  // OpenFreeMap vector tiles with CIC military styling
  // Dark navy water, dark gray land, green-tinted contours, muted borders
  return { ... } // Full style spec with layers
}

function buildSatelliteStyle(): StyleSpecification {
  // ESRI World Imagery raster
  return {
    version: 8,
    sources: {
      'esri-sat': { type: 'raster', tiles: [ESRI_SAT_TILES], tileSize: 256 }
    },
    layers: [{ id: 'satellite', type: 'raster', source: 'esri-sat' }]
  }
}
```

**Step 2: Update GameMap.tsx and DeploymentOverlay.tsx**

Replace `import baseStyle from '@/styles/map-style.json'` with:
```ts
import { getMapStyle } from '@/styles/map-providers'
```

Use `mapStyle={getMapStyle(mapMode)}` where `mapMode` comes from ui-store.

**Step 3: Delete map-style.json**

**Step 4: Build and verify**

```bash
npm run build
```

**Step 5: Commit**

```bash
git add src/styles/map-providers.ts src/components/map/GameMap.tsx src/components/menu/DeploymentOverlay.tsx
git rm src/styles/map-style.json
git commit -m "feat: replace CARTO raster with OpenFreeMap vector + ESRI satellite"
```

---

## Task 7: Map Toggle UI + UI Store

**Files:**
- Create: `src/components/hud/MapToggle.tsx`
- Modify: `src/store/ui-store.ts` (add mapMode, showElevation, showRadarLOS)

**Step 1: Add map state to ui-store**

```ts
mapMode: 'dark' | 'satellite'
showElevation: boolean
showRadarLOS: boolean
cycleMapMode: () => void
toggleElevation: () => void
toggleRadarLOS: () => void
```

**Step 2: Create MapToggle.tsx**

Three stacked buttons in bottom-left corner. Military styling matching existing HUD. Labels: MAP / ELV / LOS. Active buttons get accent border.

**Step 3: Add to GameMap.tsx and DeploymentOverlay.tsx render tree**

**Step 4: Build and verify visually**

```bash
npm run dev
```

**Step 5: Commit**

```bash
git add src/components/hud/MapToggle.tsx src/store/ui-store.ts src/components/map/GameMap.tsx
git commit -m "feat: add MAP/ELV/LOS toggle UI in bottom-left corner"
```

---

## Task 8: LOS Visualization Layer

**Files:**
- Create: `src/components/map/layers/LOSLayer.ts`
- Modify: `src/components/map/GameMap.tsx` (add LOS layer)

**Step 1: Write LOSLayer**

Given a radar unit position, antenna height, and the elevation grid:
1. Cast 360 rays (1 per degree) from radar outward
2. March each ray in 1km steps up to radar range
3. Check LOS at each step: if terrain > LOS line, mark as blocked
4. Build GeoJSON polygon of visible area
5. Return as MapLibre-compatible GeoJSON source + fill layer

Color coding:
- Green fill (alpha 0.15): full visibility
- Absent: terrain-masked zones

Cache result per unit ID + position — recompute only on unit change.

**Step 2: Integrate into GameMap**

When `showRadarLOS` is true and a unit is hovered, OR when a radar unit is selected:
- Compute LOS polygon
- Render as a MapLibre `<Source>` + `<Layer>` (fill type)

**Step 3: Build and test visually**

```bash
npm run dev
```

Select an S-300 on a mountain — verify coverage polygon shows terrain shadows.

**Step 4: Commit**

```bash
git add src/components/map/layers/LOSLayer.ts src/components/map/GameMap.tsx
git commit -m "feat: add radar LOS visualization with terrain masking"
```

---

## Task 9: Update Deployment Placement Validation

**Files:**
- Modify: `src/store/deployment-store.ts` (use elevation grid for water check)
- Modify: `src/components/menu/DeploymentOverlay.tsx` (use vector tile queryRenderedFeatures)
- Delete: `src/data/theater-water.ts`

**Step 1: Update deployment-store to use elevation grid**

Replace `isValidPlacement` from theater-water.ts with:
```ts
const isWater = elevationGrid.isWater(lat, lng)
```

For deployment (before game init), the main thread needs access to the grid too. Either:
- Load the grid on main thread as well (separate fetch), or
- Use `queryRenderedFeatures` on the vector tile water layer in the overlay

Use vector tile query in DeploymentOverlay (main thread) and elevation grid in worker (game engine).

**Step 2: Delete theater-water.ts**

**Step 3: Build and verify**

```bash
npm run build
```

**Step 4: Commit**

```bash
git rm src/data/theater-water.ts
git add src/store/deployment-store.ts src/components/menu/DeploymentOverlay.tsx
git commit -m "feat: replace polygon water detection with vector tile queries + elevation grid"
```

---

## Task 10: Integration Test + Playtester

**Step 1: Full build**

```bash
npx tsc -b && npm run build
```

**Step 2: Run playtester agent**

Test the complete flow:
- Dark map renders with CIC styling
- Toggle to satellite and back
- Toggle elevation overlay
- Free mode → deploy → place land unit on land (pass), on water (reject)
- Place ship on water (pass), on land (reject)
- Launch game, fire cruise missile over mountains → altitude climbs
- Select S-300 → LOS visualization shows terrain shadows
- Toggle LOS hover on/off

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: map overhaul — vector tiles, satellite, elevation, radar LOS, terrain following"
git push origin main
```

---

## Dependency Graph

```
Task 1 (elevation data) ──→ Task 2 (grid class) ──→ Task 3 (worker load)
                                                          │
                                              ┌───────────┼───────────┐
                                              ▼           ▼           ▼
                                         Task 4      Task 5      Task 9
                                        (radar LOS) (terrain    (placement
                                                    following)  validation)

Task 6 (map providers) ──→ Task 7 (toggle UI) ──→ Task 8 (LOS viz)

Task 10 (integration test) depends on all above
```

**Parallelizable groups:**
- Group A (engine): Tasks 4, 5 (after Task 3)
- Group B (UI): Tasks 6, 7 (independent of engine tasks)
- Task 8 depends on Tasks 4 + 7
- Task 9 depends on Tasks 3 + 6
