import type { GameState, Unit } from '@/types/game'
import type { ElevationGrid } from './elevation'
import { haversine, bearing, destination, ktsToKmh } from '../utils/geo'
import { weaponSpecs } from '@/data/weapons/missiles'
import { findNavalRoute } from './route-planner'

const ARRIVAL_THRESHOLD_KM = 0.5
const NAVAL_CATEGORIES = new Set(['ship', 'submarine', 'carrier_group', 'naval_base'])

/** Complete the movement lifecycle once all waypoints are exhausted (any path: arrival or terrain skip). */
function finishMovement(unit: Unit): void {
  if (unit.deploy_time_sec != null) {
    unit.readiness = 'deploying'
    unit.readinessTimer = unit.deploy_time_sec
  }
  unit.status = 'ready'
  unit.speed_kts = 0
}

/** Process movement for all units with waypoints. Called each tick (= 1 game second). */
export function processMovement(state: GameState, elevationGrid?: ElevationGrid | null): void {
  for (const unit of state.units.values()) {
    if (unit.waypoints.length === 0 || unit.status === 'destroyed') continue
    if (unit.maxSpeed_kts === 0) continue // static installations

    // Skip units that are packing or deploying — they can't move during transitions
    if (unit.readiness === 'packing' || unit.readiness === 'deploying') continue

    const isNaval = NAVAL_CATEGORIES.has(unit.category)
    const isAircraft = unit.category === 'aircraft'
    const target = unit.waypoints[0]
    const dist = haversine(unit.position, target)

    // Distance this unit can travel in 1 second
    const speedKmPerSec = ktsToKmh(unit.maxSpeed_kts) / 3600

    if (dist <= ARRIVAL_THRESHOLD_KM || dist <= speedKmPerSec) {
      // Arrived at waypoint
      unit.position = { ...target }
      unit.waypoints.shift()

      if (unit.waypoints.length === 0) finishMovement(unit)
    } else {
      // Move toward waypoint
      const brng = bearing(unit.position, target)
      const nextPos = destination(unit.position, brng, speedKmPerSec)

      // Terrain validation: ships stay on water, land units stay on land (aircraft ignore terrain)
      if (elevationGrid && !isAircraft) {
        const nextIsWater = elevationGrid.isWater(nextPos.lat, nextPos.lng)
        if (isNaval && !nextIsWater) {
          // Ship hitting land — re-route on water toward the final destination
          const dest = unit.waypoints[unit.waypoints.length - 1]
          const route = findNavalRoute(unit.position, dest, elevationGrid)
          if (route && route.length > 0) {
            const probeBrng = bearing(unit.position, route[0])
            const probe = destination(unit.position, probeBrng, speedKmPerSec)
            // Only accept a re-route whose first step is clear, else we'd re-route every tick
            if (elevationGrid.isWater(probe.lat, probe.lng)) {
              unit.waypoints = [...route, dest]
              continue
            }
          }
          // No water route — skip this waypoint
          unit.waypoints.shift()
          if (unit.waypoints.length === 0) finishMovement(unit)
          continue
        }
        if (!isNaval && nextIsWater) {
          // Land unit hitting water — halt and tell the player instead of silently
          // skipping waypoints (which read as "my order vanished")
          unit.waypoints = []
          finishMovement(unit)
          const event = {
            type: 'ORDER_REJECTED' as const,
            unitId: unit.id,
            reason: 'route blocked by water',
            tick: state.time.tick,
          }
          state.events.push(event)
          state.pendingEvents.push(event)
          continue
        }
      }

      unit.position = nextPos
      unit.heading = brng
      unit.status = 'moving'
      unit.speed_kts = unit.maxSpeed_kts
    }
  }

  // Terrain following for cruise-phase missiles
  if (elevationGrid) {
    for (const missile of state.missiles.values()) {
      if (missile.status !== 'inflight') continue
      if (missile.is_interceptor) continue // SAM interceptors have their own altitude model (combat.ts)
      if (missile.phase !== 'cruise') continue
      if (missile.path.length === 0) continue

      // Get current missile position for terrain check.
      // On first tick, path contains pre-computed great-circle points ending at the TARGET.
      // The actual current position is the FIRST point (launch position) or most recently
      // appended tick position. Use path[0] on first ticks, then the last appended point.
      // Since updateMissilePositions pops future points and appends current, after first tick
      // the last point IS the current position. But we need to handle the initial state safely.
      // Use the interpolated position based on the missile's timestamps.
      const currentTime = state.time.timestamp
      let curPos: [number, number] | null = null
      if (missile.timestamps.length > 0 && missile.timestamps[0] <= currentTime) {
        // Find the path point closest to current time
        for (let i = missile.timestamps.length - 1; i >= 0; i--) {
          if (missile.timestamps[i] <= currentTime) {
            curPos = missile.path[i]
            break
          }
        }
      }
      if (!curPos) curPos = missile.path[0] // fallback to launch position
      const terrainElev = elevationGrid.getElevation(curPos[1], curPos[0]) // path is [lng, lat]
      const spec = weaponSpecs[missile.weaponId]
      const clearance = 50 // meters above terrain
      const cruiseAltM = (spec?.flight_altitude_ft ?? 200) * 0.3048 // ft to meters

      const requiredAlt = Math.max(cruiseAltM, terrainElev + clearance)

      if (missile.altitude_m < requiredAlt) {
        // Terrain-following climb — cruise missiles can climb rapidly (up to 150m/s)
        // This altitude gain is preserved by updateMissileAltitudes (which takes max of spec/current)
        const climbRate = Math.min(requiredAlt - missile.altitude_m, 150) // max 150m/tick climb
        missile.altitude_m += climbRate
        if (missile.fuel_remaining_sec > 0) {
          missile.fuel_remaining_sec -= climbRate * 0.001 // small climb fuel penalty
        }
      } else if (missile.altitude_m > requiredAlt + 100) {
        // Descend back toward cruise altitude — don't descend below required
        missile.altitude_m = Math.max(requiredAlt, missile.altitude_m - 50)
      }

      // Modern cruise missiles have TERCOM/DSMAC terrain avoidance — they don't crash
      // into mountains. If still below terrain after climb attempt, force altitude to clear.
      if (missile.altitude_m < terrainElev) {
        missile.altitude_m = terrainElev + clearance
      }
    }
  }
}
