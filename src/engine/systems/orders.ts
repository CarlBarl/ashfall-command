import type { GameState, ROE, UnitId } from '@/types/game'
import { haversine } from '../utils/geo'
import { detectThreats } from './detection'
import type { ElevationGrid } from './elevation'

/**
 * Per-unit set of missile IDs that weapons_tight units should NOT engage this tick.
 * Cleared at the start of each processOrders call.
 */
const suppressedMissiles = new Map<UnitId, Set<string>>()

/** Reset module-level state — must be called on save/load */
export function resetOrdersState(): void {
  suppressedMissiles.clear()
}

const WEAPONS_TIGHT_RANGE_KM = 50

/**
 * Enforce ROE each tick: weapons_tight units only keep engagements that threaten
 * themselves or nearby friendlies (within 50km).
 */
export function processOrders(state: GameState, elevationGrid?: ElevationGrid | null): void {
  // Clear per-tick per-unit suppression state before re-evaluating
  suppressedMissiles.clear()

  // Enforce weapons_tight ROE constraints
  // (hold_fire is enforced in combat.ts; weapons_free needs no filtering)
  enforceWeaponsTight(state, elevationGrid)
}

/**
 * For weapons_tight units, mark non-threatening missiles so combat.ts skips them.
 * A missile is threatening if it targets:
 *   - The unit itself
 *   - Any friendly unit within 50km of the AD unit
 */
function enforceWeaponsTight(state: GameState, elevationGrid?: ElevationGrid | null): void {
  for (const unit of state.units.values()) {
    if (unit.status === 'destroyed') continue
    if (unit.roe !== 'weapons_tight') continue

    // Gather nearby friendly unit IDs (within 50km)
    const nearbyFriendlyIds = new Set<UnitId>()
    nearbyFriendlyIds.add(unit.id)
    for (const other of state.units.values()) {
      if (other.id === unit.id) continue
      if (other.nation !== unit.nation) continue
      if (other.status === 'destroyed') continue
      if (haversine(unit.position, other.position) <= WEAPONS_TIGHT_RANGE_KM) {
        nearbyFriendlyIds.add(other.id)
      }
    }

    // Check detected threats — filter out those not targeting nearby friendlies
    const threats = detectThreats(state, unit, elevationGrid)
    for (const threat of threats) {
      if (!nearbyFriendlyIds.has(threat.missile.targetId)) {
        // Not a local threat for THIS unit — mark per-unit so combat skips engagement
        if (!suppressedMissiles.has(unit.id)) suppressedMissiles.set(unit.id, new Set())
        suppressedMissiles.get(unit.id)!.add(threat.missile.id)
      }
    }
  }
}

/** Check if a missile is suppressed for a given unit (weapons_tight filtering) */
export function isSuppressedForTight(missileId: string, unit: { id: UnitId; roe: ROE }): boolean {
  if (unit.roe !== 'weapons_tight') return false
  return suppressedMissiles.get(unit.id)?.has(missileId) ?? false
}
