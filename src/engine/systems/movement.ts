import type { GameState } from '@/types/game'
import type { ElevationGrid } from './elevation'
import { haversine, bearing, destination, ktsToKmh } from '../utils/geo'
import { weaponSpecs } from '@/data/weapons/missiles'

const ARRIVAL_THRESHOLD_KM = 0.5

/** Process movement for all units with waypoints. Called each tick (= 1 game second). */
export function processMovement(state: GameState, elevationGrid?: ElevationGrid | null): void {
  for (const unit of state.units.values()) {
    if (unit.waypoints.length === 0 || unit.status === 'destroyed') continue
    if (unit.maxSpeed_kts === 0) continue // static installations

    const target = unit.waypoints[0]
    const dist = haversine(unit.position, target)

    // Distance this unit can travel in 1 second
    const speedKmPerSec = ktsToKmh(unit.speed_kts > 0 ? unit.speed_kts : unit.maxSpeed_kts) / 3600

    if (dist <= ARRIVAL_THRESHOLD_KM || dist <= speedKmPerSec) {
      // Arrived at waypoint
      unit.position = { ...target }
      unit.waypoints.shift()

      if (unit.waypoints.length === 0) {
        unit.status = 'ready'
        unit.speed_kts = 0
      }
    } else {
      // Move toward waypoint
      const brng = bearing(unit.position, target)
      unit.position = destination(unit.position, brng, speedKmPerSec)
      unit.heading = brng
      unit.status = 'moving'
      if (unit.speed_kts === 0) {
        unit.speed_kts = unit.maxSpeed_kts
      }
    }
  }

  // Terrain following for cruise-phase missiles
  if (elevationGrid) {
    const missilesToDelete: string[] = []
    for (const missile of state.missiles.values()) {
      if (missile.status !== 'inflight') continue
      if (missile.phase !== 'cruise') continue
      if (missile.path.length === 0) continue

      const lastPt = missile.path[missile.path.length - 1]
      const terrainElev = elevationGrid.getElevation(lastPt[1], lastPt[0]) // path is [lng, lat]
      const spec = weaponSpecs[missile.weaponId]
      const clearance = 50 // meters above terrain
      const cruiseAltM = (spec?.flight_altitude_ft ?? 200) * 0.3048 // ft to meters

      const requiredAlt = Math.max(cruiseAltM, terrainElev + clearance)

      if (missile.altitude_m < requiredAlt) {
        // Climbing — costs extra fuel
        const climbRate = Math.min(requiredAlt - missile.altitude_m, 30) // max 30m/tick climb
        missile.altitude_m += climbRate
        if (missile.fuel_remaining_sec > 0) {
          missile.fuel_remaining_sec -= climbRate * 0.001 // climb fuel penalty
        }
      } else if (missile.altitude_m > requiredAlt + 200) {
        // Descend back to optimal altitude
        missile.altitude_m = Math.max(requiredAlt, missile.altitude_m - 20)
      }

      // Crash into terrain check
      if (missile.altitude_m < terrainElev) {
        missile.status = 'intercepted' // neutralized — won't impact target
        missilesToDelete.push(missile.id)
      }
    }
    for (const id of missilesToDelete) {
      state.missiles.delete(id)
    }
  }
}
