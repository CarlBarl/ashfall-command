import type { GameState, SquadronState, Unit } from '@/types/game'

/**
 * BDA on parked airframes — design: docs/plans/air-war-v5.md §3 (Iran AI):
 * airbase/carrier damage destroys parked airframes proportionally. Event-driven:
 * scans this tick's MISSILE_IMPACT / UNIT_DESTROYED events against airWing
 * hosts. Wire processAirBda(state) into game-engine tick() after every system
 * that can emit those events this tick (combat AND shipping mine kills).
 */

/** Hardened shelters absorb half the proportional ramp loss */
export const SHELTER_FACTOR = 0.5

/** Airframes on the ground right now: ready + in turnaround (rest are airborne) */
export function parkedAirframes(squadron: SquadronState): number {
  return squadron.available + squadron.readyAt.length
}

export function processAirBda(state: GameState): void {
  const tick = state.time.tick
  const events = state.events
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.tick !== tick) break
    if (e.type === 'MISSILE_IMPACT') {
      const unit = state.units.get(e.targetId)
      if (unit?.airWing) applyRampDamage(unit, e.damage)
    } else if (e.type === 'UNIT_DESTROYED') {
      const unit = state.units.get(e.unitId)
      if (unit?.airWing) destroyParked(unit)
    }
  }
}

function applyRampDamage(host: Unit, damage: number): void {
  for (const squadron of host.airWing ?? []) {
    const parked = parkedAirframes(squadron)
    const lost = Math.min(parked, Math.floor((damage / 100) * parked * SHELTER_FACTOR))
    if (lost <= 0) continue
    squadron.total = Math.max(0, squadron.total - lost)
    const fromAvailable = Math.min(squadron.available, lost)
    squadron.available -= fromAvailable
    const fromQueue = lost - fromAvailable
    if (fromQueue > 0) squadron.readyAt.splice(squadron.readyAt.length - fromQueue, fromQueue)
  }
}

/** Host destroyed: everything on the deck/ramp is gone — only airborne airframes remain on the books */
function destroyParked(host: Unit): void {
  for (const squadron of host.airWing ?? []) {
    squadron.total = Math.max(0, squadron.total - parkedAirframes(squadron))
    squadron.available = 0
    squadron.readyAt = []
  }
}
