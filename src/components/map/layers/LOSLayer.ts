import { destination } from '@turf/destination'
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

/** Earth radius in km */
const R_EARTH = 6371

/** Standard atmospheric refraction factor (4/3 earth radius model) */
const K_REFRACTION = 4 / 3

/** Number of rays cast around 360 degrees */
const NUM_RAYS = 360

/** Step size along each ray in km */
const STEP_KM = 2

/**
 * Compute visible-area polygon by raycasting from a radar position.
 *
 * Algorithm:
 * 1. Cast 360 rays (1 per degree) from the radar position
 * 2. March outward in ~2km steps up to radarRange_km
 * 3. At each step, compute LOS line height accounting for earth curvature
 *    and compare against terrain elevation
 * 4. If terrain > LOS height, the ray is blocked at this distance
 * 5. Build a polygon from the 360 endpoint coordinates
 *
 * Curvature drop at distance d: drop = d^2 / (2 * R * k)
 * where R = 6371km, k = 4/3 (atmospheric refraction)
 */
export function computeLOSPolygon(input: LOSInput): Feature<Polygon> {
  const { position, radarRange_km, antennaHeight_m, elevationGrid, heading, sectorDeg } = input

  const origin: [number, number] = [position.lng, position.lat]
  const radarGroundElev = elevationGrid.getElevation(position.lat, position.lng)
  const radarAlt = radarGroundElev + antennaHeight_m

  const numSteps = Math.max(1, Math.ceil(radarRange_km / STEP_KM))

  /** Raycast a single bearing and return the farthest visible point */
  const castRay = (bearing: number): [number, number] => {
    let maxVisibleDist_km = 0

    for (let step = 1; step <= numSteps; step++) {
      const dist_km = (step / numSteps) * radarRange_km

      // Compute curvature drop at this distance
      // drop = d^2 / (2 * R * k) in meters (d in km, result in km, convert to m)
      const curvatureDrop_m = ((dist_km * dist_km) / (2 * R_EARTH * K_REFRACTION)) * 1000

      // LOS line height at this distance (straight line from antenna, minus curvature)
      const losHeight_m = radarAlt - curvatureDrop_m

      // Get terrain elevation at this point
      const pt = destination(origin, dist_km, bearing, { units: 'kilometers' })
      const coords = pt.geometry.coordinates
      const terrainElev = elevationGrid.getElevation(coords[1], coords[0])

      if (terrainElev > losHeight_m) {
        // Terrain blocks LOS at this distance
        break
      }

      maxVisibleDist_km = dist_km
    }

    if (maxVisibleDist_km <= 0) {
      return origin
    }
    const ep = destination(origin, maxVisibleDist_km, bearing, { units: 'kilometers' })
    return ep.geometry.coordinates as [number, number]
  }

  const ring: [number, number][] = []

  if (sectorDeg >= 360) {
    // Full circle — existing 360° behavior
    for (let ray = 0; ray < NUM_RAYS; ray++) {
      const bearing = (ray * 360) / NUM_RAYS
      ring.push(castRay(bearing))
    }
    // Close the polygon ring
    ring.push(ring[0])
  } else {
    // Sector wedge
    const startAngle = heading - sectorDeg / 2
    const endAngle = heading + sectorDeg / 2
    const numRays = Math.max(3, Math.round(sectorDeg)) // ~1 ray per degree within sector

    // Start at radar position (center of wedge)
    ring.push(origin)

    for (let i = 0; i <= numRays; i++) {
      const azimuth = startAngle + (i / numRays) * (endAngle - startAngle)
      ring.push(castRay(azimuth))
    }

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

let cachedKey: string | null = null
let cachedPolygon: Feature<Polygon> | null = null

/**
 * Get the LOS polygon for a unit, using a cache keyed on unit ID + position + heading + sector.
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

  // Check cache — reuse if unit, position, heading, and sector haven't changed
  const cacheKey = `${unitId}_${position.lat}_${position.lng}_${heading}_${sectorDeg}`
  if (cachedPolygon && cachedKey === cacheKey) {
    return cachedPolygon
  }

  cachedKey = cacheKey

  cachedPolygon = computeLOSPolygon({
    position,
    radarRange_km,
    antennaHeight_m,
    elevationGrid: grid,
    heading,
    sectorDeg,
  })

  return cachedPolygon
}
