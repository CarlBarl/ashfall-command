import type { GameState } from '@/types/game'
import { haversine, bearing, destination, ktsToKmh } from '../utils/geo'

const ARRIVAL_THRESHOLD_KM = 0.5

/** Process movement for all units with waypoints. Called each tick (= 1 game minute). */
export function processMovement(state: GameState): void {
  for (const unit of state.units.values()) {
    if (unit.waypoints.length === 0 || unit.status === 'destroyed') continue
    if (unit.maxSpeed_kts === 0) continue // static installations

    const target = unit.waypoints[0]
    const dist = haversine(unit.position, target)

    // Distance this unit can travel in 1 minute
    const speedKmPerMin = ktsToKmh(unit.speed_kts > 0 ? unit.speed_kts : unit.maxSpeed_kts) / 60

    if (dist <= ARRIVAL_THRESHOLD_KM || dist <= speedKmPerMin) {
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
      unit.position = destination(unit.position, brng, speedKmPerMin)
      unit.heading = brng
      unit.status = 'moving'
      if (unit.speed_kts === 0) {
        unit.speed_kts = unit.maxSpeed_kts
      }
    }
  }
}
