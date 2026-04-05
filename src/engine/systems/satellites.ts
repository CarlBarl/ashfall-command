import type { GameState, UnitId, Position } from '@/types/game'

// ---------------------------------------------------------------------------
// Module-level state — tracks recently revealed units (fades after 60 ticks)
// ---------------------------------------------------------------------------

/** unitId → tick when satellite detected it */
const satelliteDetections = new Map<UnitId, number>()

/** How many ticks a satellite detection remains visible before fading */
const DETECTION_FADE_TICKS = 60

/** Reset module-level state (call on save/load) */
export function resetSatelliteState(): void {
  satelliteDetections.clear()
}

/** Get the set of currently-visible satellite detections */
export function getSatelliteDetections(currentTick: number): Set<UnitId> {
  const visible = new Set<UnitId>()
  for (const [unitId, detectedTick] of satelliteDetections) {
    if (currentTick - detectedTick <= DETECTION_FADE_TICKS) {
      visible.add(unitId)
    } else {
      satelliteDetections.delete(unitId)
    }
  }
  return visible
}

// ---------------------------------------------------------------------------
// Core processing
// ---------------------------------------------------------------------------

/**
 * Process all satellite passes for this tick.
 * Returns IDs of enemy units revealed by satellite passes this tick.
 */
export function processSatellites(state: GameState): UnitId[] {
  const revealed: UnitId[] = []

  for (const nation of Object.values(state.nations)) {
    if (!nation.satellites) continue

    for (const sat of nation.satellites) {
      // Check if pass is due
      if (state.time.tick - sat.lastPassTick < sat.revisitInterval_sec) continue

      // Pass is happening now — sweep the ground track
      sat.lastPassTick = state.time.tick

      const trackStart: Position = { lat: sat.groundTrack.startLat, lng: sat.groundTrack.startLng }
      const trackEnd: Position = { lat: sat.groundTrack.endLat, lng: sat.groundTrack.endLng }

      for (const unit of state.units.values()) {
        if (unit.nation === nation.id) continue // don't reveal own units
        if (unit.status === 'destroyed') continue

        const dist = pointToLineDistKm(unit.position, trackStart, trackEnd)
        if (dist <= sat.swathWidth_km / 2) {
          revealed.push(unit.id)
          satelliteDetections.set(unit.id, state.time.tick)
        }
      }
    }
  }

  return revealed
}

// ---------------------------------------------------------------------------
// Geometry: perpendicular distance from a point to a line segment (km)
// ---------------------------------------------------------------------------

/**
 * Compute the approximate distance in km from a point to the nearest point
 * on a line segment defined by two endpoints.
 *
 * Uses a flat-earth approximation scaled by cos(latitude) which is adequate
 * for the theater scale (~2000 km). For short/medium distances in the
 * Middle East theater this is accurate to within a few percent.
 */
function pointToLineDistKm(
  point: Position,
  lineStart: Position,
  lineEnd: Position,
): number {
  // Convert to approximate km using flat-earth projection
  const avgLat = (lineStart.lat + lineEnd.lat + point.lat) / 3
  const cosLat = Math.cos((avgLat * Math.PI) / 180)
  const KM_PER_DEG_LAT = 111.32
  const KM_PER_DEG_LNG = 111.32 * cosLat

  // Project to flat km coordinates
  const px = (point.lng - lineStart.lng) * KM_PER_DEG_LNG
  const py = (point.lat - lineStart.lat) * KM_PER_DEG_LAT

  const lx = (lineEnd.lng - lineStart.lng) * KM_PER_DEG_LNG
  const ly = (lineEnd.lat - lineStart.lat) * KM_PER_DEG_LAT

  const lenSq = lx * lx + ly * ly
  if (lenSq === 0) {
    // Degenerate line: start == end, just return distance to start
    return Math.sqrt(px * px + py * py)
  }

  // Parameter t of the closest point on the infinite line
  let t = (px * lx + py * ly) / lenSq

  // Clamp to segment
  t = Math.max(0, Math.min(1, t))

  // Closest point on segment
  const cx = t * lx
  const cy = t * ly

  const dx = px - cx
  const dy = py - cy

  return Math.sqrt(dx * dx + dy * dy)
}
