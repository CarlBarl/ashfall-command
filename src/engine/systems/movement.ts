import type { GameState } from '@/types/game'
import { haversine, bearing, destination, ktsToKmh } from '../utils/geo'

const ARRIVAL_THRESHOLD_KM = 0.5

/** Process movement for all units with waypoints. Called each tick (= 1 game second). */
export function processMovement(state: GameState): void {
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
}
