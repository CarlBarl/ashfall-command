import type { GameState, GameEvent, Unit, UnitCategory } from '@/types/game'
import { haversine } from '../utils/geo'

// Permanent damage rule (applied in combat.ts resolveImpacts by team lead):
// When a hit brings unit below 30 HP, reduce maxHealth by 25% of the damage dealt.
// Example: 40 damage on unit at 50 HP -> health=10, maxHealth reduced by 10 -> maxHealth=90
// Unit can never repair above maxHealth=90 again.

const REPAIR_INTERVAL = 60 // Process every 60 ticks (1 game minute)

/** Maximum distance (km) a land/air unit can be from a friendly base to receive repairs */
const LAND_SUPPLY_RANGE_KM = 300
/** Maximum distance (km) a ship must be from a naval base or port for repairs */
const SHIP_SUPPLY_RANGE_KM = 50

/** HP restored per game minute, per unit category */
const REPAIR_MULT: Record<UnitCategory, number> = {
  airbase: 0.5,         // runway damage slow to fix
  naval_base: 0.5,      // port infrastructure complex
  sam_site: 1.5,        // modular, easier to repair
  missile_battery: 2.0, // TELs mobile, easily replaced
  ship: 0.3,            // needs drydock for major repairs
  carrier_group: 0.2,   // extremely complex
  submarine: 0.1,       // must return to port
  aircraft: 1.0,
}

const BASE_REPAIR_RATE = 1.0 // HP per game minute

// No module-level mutable state — everything lives in GameState.
// Export reset for consistency with other systems (save/load pattern).
export function resetRepairState(): void {
  // No module-level state to reset.
}

// ===============================================
//  MAIN ENTRY POINT
// ===============================================

export function processRepair(state: GameState): void {
  if (state.time.tick % REPAIR_INTERVAL !== 0) return

  const events: GameEvent[] = []

  for (const unit of state.units.values()) {
    // Skip destroyed units — they stay dead forever
    if (unit.status === 'destroyed') continue
    // Skip units at full health
    if (unit.health >= unit.maxHealth) continue
    // Only process units that are damaged or already repairing
    if (unit.status !== 'damaged' && unit.status !== 'repairing') continue

    // Find nearest friendly base for supply connection
    const nearestBase = findNearestFriendlyBase(unit, state)

    // Compute repair rate
    const repairRate = computeRepairRate(unit, nearestBase)
    if (repairRate <= 0) continue

    // Apply repair
    const oldHealth = unit.health
    unit.health = Math.min(unit.maxHealth, unit.health + repairRate)
    const healthRestored = unit.health - oldHealth

    // Status transitions
    updateRepairStatus(unit)

    // Emit repair event (once per repair cycle showing total HP restored)
    if (healthRestored > 0) {
      events.push({
        type: 'UNIT_REPAIRED',
        unitId: unit.id,
        healthRestored: Math.round(healthRestored * 10) / 10, // 1 decimal precision
        tick: state.time.tick,
      })
    }
  }

  emitEvents(state, events)
}

// ===============================================
//  SUPPLY CONNECTION
// ===============================================

function isBase(unit: Unit): boolean {
  return unit.category === 'airbase' || unit.category === 'naval_base'
}

/**
 * Find the nearest friendly base within supply range.
 * Ships need to be within 50km of a naval base.
 * Land/air units need to be within 300km of any friendly base.
 * Bases can self-repair (they ARE the supply source).
 */
function findNearestFriendlyBase(unit: Unit, state: GameState): Unit | null {
  // Bases can self-repair — they are their own supply source
  if (isBase(unit) && unit.logistics > 0) {
    return unit
  }

  const isNaval = unit.category === 'ship' || unit.category === 'carrier_group' || unit.category === 'submarine'
  const maxRange = isNaval ? SHIP_SUPPLY_RANGE_KM : LAND_SUPPLY_RANGE_KM

  let bestBase: Unit | null = null
  let bestDist = Infinity

  for (const candidate of state.units.values()) {
    // Must be a base
    if (!isBase(candidate)) continue
    // Must be same nation
    if (candidate.nation !== unit.nation) continue
    // Must not be destroyed
    if (candidate.status === 'destroyed') continue
    // Must have logistics capability
    if (candidate.logistics <= 0) continue

    // Naval units need a naval base specifically
    if (isNaval && candidate.category !== 'naval_base') continue

    const dist = haversine(unit.position, candidate.position)
    if (dist <= maxRange && dist < bestDist) {
      bestDist = dist
      bestBase = candidate
    }
  }

  return bestBase
}

// ===============================================
//  REPAIR RATE COMPUTATION
// ===============================================

function computeRepairRate(unit: Unit, nearestBase: Unit | null): number {
  // No base nearby = no repair (no supply connection)
  if (!nearestBase) return 0

  const categoryMultiplier = REPAIR_MULT[unit.category] ?? 1.0
  const logisticsFactor = nearestBase.logistics / 100 // 0-1

  return BASE_REPAIR_RATE * categoryMultiplier * logisticsFactor
}

// ===============================================
//  STATUS TRANSITIONS
// ===============================================

/**
 * Update unit status based on repair progress.
 * Never overrides 'moving' or 'engaged' status with 'repairing'.
 */
function updateRepairStatus(unit: Unit): void {
  if (unit.health >= unit.maxHealth) {
    // Fully repaired (up to maxHealth cap) — back to ready
    unit.status = 'ready'
  } else if (unit.status !== 'moving' && unit.status !== 'engaged') {
    // Still needs repair and not otherwise occupied
    unit.status = 'repairing'
  }
}

// ===============================================
//  HELPERS
// ===============================================

function emitEvents(state: GameState, events: GameEvent[]): void {
  state.events.push(...events)
  if (state.events.length > 2000) {
    state.events.splice(0, state.events.length - 2000)
  }
  state.pendingEvents.push(...events)
}
