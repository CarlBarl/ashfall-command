import { ElevationGrid } from '@/engine/systems/elevation'
import type { Position } from '@/types/game'
import type { Feature, Polygon } from 'geojson'

// ────────────────────────────────────────────────
//  Main-thread elevation grid singleton
// ────────────────────────────────────────────────

let mainThreadGrid: ElevationGrid | null = null
let gridLoadPromise: Promise<ElevationGrid> | null = null

/**
 * Load the elevation grid on the main thread (separate from the worker copy).
 * Returns the cached grid on subsequent calls.
 */
export async function ensureMainThreadGrid(): Promise<ElevationGrid> {
  if (mainThreadGrid) return mainThreadGrid
  if (gridLoadPromise) return gridLoadPromise

  gridLoadPromise = fetch('/data/theater-elevation.bin')
    .then((resp) => {
      if (!resp.ok) throw new Error(`Failed to load elevation grid: ${resp.status}`)
      return resp.arrayBuffer()
    })
    .then((buf) => {
      mainThreadGrid = new ElevationGrid(buf)
      return mainThreadGrid
    })
    .catch((err) => {
      gridLoadPromise = null
      throw err
    })

  return gridLoadPromise
}

/** Synchronous getter — returns null if grid hasn't loaded yet. */
export function getMainThreadGrid(): ElevationGrid | null {
  return mainThreadGrid
}

// ────────────────────────────────────────────────
//  LOS polygon computation
// ────────────────────────────────────────────────

interface LOSInput {
  position: Position
  radarRange_km: number
  antennaHeight_m: number
  elevationGrid: ElevationGrid
  heading: number      // unit heading in degrees (0-360)
  sectorDeg: number    // coverage arc (360 = omnidirectional)
}

/** Number of rays cast around 360 degrees */
const NUM_RAYS = 360

/** Step size along each ray in km */
const STEP_KM = 2

/** Coverage is shown against an air target this far above ground — high enough
 *  that desert dunes and coastal berms don't shadow rays, only real mountains */
const TARGET_AGL_M = 500

/** Median window (± rays) — kills single-ray needles from elevation-grid aliasing */
const SMOOTH_WINDOW = 2

function medianOf(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** Median-smooth ray distances; circular wrap for full rings, clamped for sectors */
function smoothDistances(dists: number[], circular: boolean): number[] {
  const n = dists.length
  if (n < SMOOTH_WINDOW * 2 + 1) return dists
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const window: number[] = []
    for (let o = -SMOOTH_WINDOW; o <= SMOOTH_WINDOW; o++) {
      const j = circular ? (i + o + n) % n : Math.min(n - 1, Math.max(0, i + o))
      window.push(dists[j])
    }
    out[i] = medianOf(window)
  }
  return out
}

/**
 * Compute the radar coverage polygon by raycasting from the radar position.
 *
 * Matches the engine model (2026-06-11): coverage is the effective radius
 * (nominal range × elevation bonus — height pays, no horizon cap), trimmed
 * only where terrain physically shadows a low-flying air target (100 m AGL).
 * Over open water this renders as a clean radius/sector arc; real mountain
 * ranges still carve shadows.
 */
export function computeLOSPolygon(input: LOSInput): Feature<Polygon> {
  const { position, radarRange_km, antennaHeight_m, elevationGrid, heading, sectorDeg } = input

  const origin: [number, number] = [position.lng, position.lat]
  const radarGroundElev = elevationGrid.getElevation(position.lat, position.lng)
  const radarAlt = radarGroundElev + antennaHeight_m

  // Mirrors detection.ts elevationRangeBonus: +50% range at 10 km of site+antenna height
  const effectiveRange_km = radarRange_km * (1 + 0.5 * Math.min(1, Math.max(0, radarAlt) / 10000))

  const numSteps = Math.max(1, Math.ceil(effectiveRange_km / STEP_KM))

  // Equirectangular stepping instead of turf destination() — this runs
  // ~rays x steps times per polygon and geodesic precision is irrelevant
  // for a visualization overlay at theater scale
  const latPerKm = 1 / 110.574
  const lngPerKm = 1 / (111.32 * Math.cos((position.lat * Math.PI) / 180))

  /** Raycast a single bearing: farthest distance (km) where a TARGET_AGL_M
   *  target is still visible over all terrain passed so far. Bare-ground
   *  visibility was the old criterion — it let every 30 m coastal berm shadow
   *  the whole ray and drew spiky fans instead of coverage arcs. */
  const castRayDistance = (bearing: number): number => {
    const rad = (bearing * Math.PI) / 180
    const northPerKm = Math.cos(rad)
    const eastPerKm = Math.sin(rad)

    let maxVisibleDist_km = 0
    let maxObstacleAngle = -Infinity // highest "look angle" to any terrain seen so far

    for (let step = 1; step <= numSteps; step++) {
      const dist_km = (step / numSteps) * effectiveRange_km

      const lat = position.lat + dist_km * northPerKm * latPerKm
      const lng = position.lng + dist_km * eastPerKm * lngPerKm
      const terrainElev = elevationGrid.getElevation(lat, lng)

      // A target flying TARGET_AGL_M above this ground is visible if its look
      // angle clears every terrain obstacle between it and the radar
      const targetAngle = Math.atan2(terrainElev + TARGET_AGL_M - radarAlt, dist_km * 1000)
      if (targetAngle >= maxObstacleAngle) {
        maxVisibleDist_km = dist_km
      }

      // The bare terrain here shadows whatever sits behind it
      const obstacleAngle = Math.atan2(terrainElev - radarAlt, dist_km * 1000)
      if (obstacleAngle > maxObstacleAngle) {
        maxObstacleAngle = obstacleAngle
      }
    }

    return maxVisibleDist_km
  }

  const pointAt = (bearing: number, dist_km: number): [number, number] => {
    if (dist_km <= 0) return origin
    const rad = (bearing * Math.PI) / 180
    return [
      position.lng + dist_km * Math.sin(rad) * lngPerKm,
      position.lat + dist_km * Math.cos(rad) * latPerKm,
    ]
  }

  const ring: [number, number][] = []

  if (sectorDeg >= 360) {
    // Full circle
    const bearings = Array.from({ length: NUM_RAYS }, (_, ray) => (ray * 360) / NUM_RAYS)
    const dists = smoothDistances(bearings.map(castRayDistance), true)
    for (let i = 0; i < bearings.length; i++) ring.push(pointAt(bearings[i], dists[i]))
    // Close the polygon ring
    ring.push(ring[0])
  } else {
    // Sector wedge
    const startAngle = heading - sectorDeg / 2
    const endAngle = heading + sectorDeg / 2
    const numRays = Math.max(3, Math.round(sectorDeg)) // ~1 ray per degree within sector

    const bearings = Array.from({ length: numRays + 1 }, (_, i) => startAngle + (i / numRays) * (endAngle - startAngle))
    const dists = smoothDistances(bearings.map(castRayDistance), false)

    // Start at radar position (center of wedge)
    ring.push(origin)
    for (let i = 0; i < bearings.length; i++) ring.push(pointAt(bearings[i], dists[i]))
    // Close back to radar position
    ring.push(origin)
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
  }
}

// ────────────────────────────────────────────────
//  Cached computation (avoid recomputing every frame)
// ────────────────────────────────────────────────

const losCache = new Map<string, { key: string; polygon: Feature<Polygon> }>()

/**
 * Get the LOS polygon for a unit, using a per-unit cache so sibling units
 * never evict each other. Position is quantized (~110m) and heading is
 * ignored for omnidirectional radars to avoid float-churn recomputes.
 * Returns null if the grid isn't loaded yet.
 */
export function getLOSPolygon(
  unitId: string,
  position: Position,
  radarRange_km: number,
  antennaHeight_m: number,
  heading: number,
  sectorDeg: number,
): Feature<Polygon> | null {
  const grid = getMainThreadGrid()
  if (!grid) return null

  const headingKey = sectorDeg >= 360 ? 0 : Math.round(heading)
  const cacheKey = `${position.lat.toFixed(3)}_${position.lng.toFixed(3)}_${radarRange_km}_${antennaHeight_m}_${headingKey}_${sectorDeg}`
  const cached = losCache.get(unitId)
  if (cached && cached.key === cacheKey) {
    return cached.polygon
  }

  const polygon = computeLOSPolygon({
    position,
    radarRange_km,
    antennaHeight_m,
    elevationGrid: grid,
    heading,
    sectorDeg,
  })

  losCache.set(unitId, { key: cacheKey, polygon })
  return polygon
}
