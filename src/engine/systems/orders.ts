import type { GameState, NationId, ROE, UnitId } from '@/types/game'
import type { Command } from '@/types/commands'
import { haversine } from '../utils/geo'
import { detectThreats } from './detection'

/** Module-level command queue — units can have pending commands */
const commandQueues = new Map<UnitId, Command[]>()

/** Enqueue a command for a unit */
export function enqueueCommand(unitId: UnitId, cmd: Command): void {
  let queue = commandQueues.get(unitId)
  if (!queue) {
    queue = []
    commandQueues.set(unitId, queue)
  }
  queue.push(cmd)
}

/** Dequeue one command per unit per tick. Returns commands to execute. */
function drainQueues(): Command[] {
  const commands: Command[] = []
  for (const [unitId, queue] of commandQueues) {
    if (queue.length > 0) {
      commands.push(queue.shift()!)
    }
    if (queue.length === 0) {
      commandQueues.delete(unitId)
    }
  }
  return commands
}

const WEAPONS_TIGHT_RANGE_KM = 50

/**
 * Process orders each tick:
 * - Drain one queued command per unit
 * - Enforce ROE: weapons_tight units only keep engagements that threaten
 *   themselves or nearby friendlies (within 50km)
 *
 * Returns commands to be executed by the engine.
 */
export function processOrders(state: GameState): Command[] {
  // Clear per-tick suppression state before re-evaluating
  suppressedMissiles.clear()

  // Drain one queued command per unit
  const commands = drainQueues()

  // Enforce weapons_tight ROE constraints
  // (hold_fire is enforced in combat.ts; weapons_free needs no filtering)
  enforceWeaponsTight(state)

  return commands
}

/**
 * For weapons_tight units, mark non-threatening missiles so combat.ts skips them.
 * A missile is threatening if it targets:
 *   - The unit itself
 *   - Any friendly unit within 50km of the AD unit
 */
function enforceWeaponsTight(state: GameState): void {
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
    const threats = detectThreats(state, unit)
    for (const threat of threats) {
      if (!nearbyFriendlyIds.has(threat.missile.targetId)) {
        // Not a local threat — mark missile so combat skips engagement
        // We use a convention: tag the missile id in a module-level set
        suppressedMissiles.add(threat.missile.id)
      }
    }
  }
}

/**
 * Set of missile IDs that weapons_tight units should NOT engage this tick.
 * Cleared at the start of each processOrders call via resetSuppressed().
 */
const suppressedMissiles = new Set<string>()

/** Check if a missile is suppressed for a given unit (weapons_tight filtering) */
export function isSuppressedForTight(missileId: string, unit: { roe: ROE }): boolean {
  if (unit.roe !== 'weapons_tight') return false
  return suppressedMissiles.has(missileId)
}

/**
 * Generate SET_ROE commands for every unit belonging to a nation.
 * Useful for theater-wide ROE presets.
 */
export function setTheaterROE(state: GameState, nation: NationId, roe: ROE): Command[] {
  const commands: Command[] = []
  for (const unit of state.units.values()) {
    if (unit.nation === nation && unit.status !== 'destroyed') {
      commands.push({ type: 'SET_ROE', unitId: unit.id, roe })
    }
  }
  return commands
}
