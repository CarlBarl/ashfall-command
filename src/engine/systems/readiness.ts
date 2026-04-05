import type { GameState } from '@/types/game'

/**
 * Process readiness timers for units transitioning between states.
 * Called each tick (1 tick = 1 game second).
 *
 * State machine: deployed -> packing -> moving -> deploying -> deployed
 * - deployed: can fire, cannot move (operational)
 * - packing: cannot fire, cannot move (tearing down)
 * - moving: cannot fire, can move (in transit)
 * - deploying: cannot fire, cannot move (setting up)
 *
 * Units without readiness (undefined) are always operational (ships, airbases, AWACS).
 */
export function processReadiness(state: GameState): void {
  for (const unit of state.units.values()) {
    if (!unit.readiness || !unit.readinessTimer) continue
    if (unit.readiness !== 'packing' && unit.readiness !== 'deploying') continue

    // Count down timer (1 tick = 1 second)
    unit.readinessTimer--

    if (unit.readinessTimer <= 0) {
      if (unit.readiness === 'packing') {
        // Done packing -> start moving
        unit.readiness = 'moving'
        unit.readinessTimer = 0
      } else if (unit.readiness === 'deploying') {
        // Done deploying -> operational
        unit.readiness = 'deployed'
        unit.readinessTimer = 0
      }
    }
  }
}
