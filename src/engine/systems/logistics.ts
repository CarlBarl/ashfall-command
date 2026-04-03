import type { GameState, GameEvent, Unit, UnitId, NationId } from '@/types/game'
import { haversine } from '@/engine/utils/geo'

const RESUPPLY_INTERVAL = 60 // Process every 60 ticks (1 game minute)
const PRODUCTION_INTERVAL = 3600 // Production every 3600 ticks (1 game hour)

// No module-level mutable state needed — everything lives in GameState.
// Export reset for consistency with other systems.
export function resetLogisticsState(): void {
  // No module-level state to reset.
}

// ===============================================
//  MAIN ENTRY POINT
// ===============================================

export function processLogistics(state: GameState): void {
  const tick = state.time.tick

  // Base production runs every hour
  if (tick > 0 && tick % PRODUCTION_INTERVAL === 0) {
    processBaseProduction(state)
  }

  // Resupply runs every minute
  if (tick > 0 && tick % RESUPPLY_INTERVAL === 0) {
    processResupply(state)
  }
}

// ===============================================
//  SUPPLY GRAPH
// ===============================================

/** Build an adjacency list from healthy supply lines */
function buildSupplyGraph(state: GameState): Map<UnitId, UnitId[]> {
  const graph = new Map<UnitId, UnitId[]>()

  for (const line of state.supplyLines.values()) {
    if (line.health <= 0) continue

    if (!graph.has(line.fromBaseId)) graph.set(line.fromBaseId, [])
    if (!graph.has(line.toBaseId)) graph.set(line.toBaseId, [])

    graph.get(line.fromBaseId)!.push(line.toBaseId)
    graph.get(line.toBaseId)!.push(line.fromBaseId)
  }

  return graph
}

/** BFS to find all bases connected to a given start base */
function findConnectedBases(startId: UnitId, graph: Map<UnitId, UnitId[]>): Set<UnitId> {
  const visited = new Set<UnitId>()
  const queue: UnitId[] = [startId]
  visited.add(startId)

  while (queue.length > 0) {
    const current = queue.shift()!
    const neighbors = graph.get(current)
    if (!neighbors) continue

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }
  }

  return visited
}

// ===============================================
//  RESUPPLY
// ===============================================

function isBase(unit: Unit): boolean {
  return unit.category === 'airbase' || unit.category === 'naval_base'
}

function processResupply(state: GameState): void {
  const graph = buildSupplyGraph(state)
  const events: GameEvent[] = []

  // Collect all bases per nation
  const basesByNation = new Map<NationId, Unit[]>()
  for (const unit of state.units.values()) {
    if (!isBase(unit)) continue
    if (unit.status === 'destroyed') continue
    if (!basesByNation.has(unit.nation)) basesByNation.set(unit.nation, [])
    basesByNation.get(unit.nation)!.push(unit)
  }

  // For each unit with depleted weapons, try to resupply from nearest connected base
  for (const unit of state.units.values()) {
    if (unit.status === 'destroyed') continue

    for (const weapon of unit.weapons) {
      if (weapon.count >= weapon.maxCount) continue // Already full

      // Find nearest connected base with matching supply stock
      const nearestBase = findNearestSupplyBase(
        unit,
        weapon.weaponId,
        basesByNation.get(unit.nation) ?? [],
        graph,
      )
      if (!nearestBase) continue

      // Find the matching stock at the base
      const stock = nearestBase.supplyStocks.find(s => s.weaponId === weapon.weaponId)
      if (!stock || stock.count <= 0) continue

      // Transfer: min(available, needed, 1) scaled by logistics health
      const logisticsMultiplier = nearestBase.logistics / 100
      if (logisticsMultiplier <= 0) continue

      const needed = weapon.maxCount - weapon.count
      const available = stock.count
      // Base transfer is 1 per minute, scaled by logistics efficiency
      // Round down — if logistics < 100, sometimes no transfer occurs
      const transfer = Math.floor(Math.min(available, needed, 1) * logisticsMultiplier)
      if (transfer <= 0) continue

      // Execute the transfer
      stock.count -= transfer
      weapon.count += transfer

      events.push({
        type: 'RESUPPLIED',
        unitId: unit.id,
        weaponId: weapon.weaponId,
        count: transfer,
        fromBaseId: nearestBase.id,
        tick: state.time.tick,
      })
    }
  }

  emitEvents(state, events)
}

/**
 * Find the nearest base (same nation) that:
 * 1. Has the requested weapon in supplyStocks with count > 0
 * 2. Is connected to the unit's nearest base via healthy supply lines
 * 3. Has logistics > 0
 */
function findNearestSupplyBase(
  unit: Unit,
  weaponId: string,
  nationBases: Unit[],
  graph: Map<UnitId, UnitId[]>,
): Unit | null {
  // If the unit IS a base, check supply graph connectivity directly from itself
  const unitIsBase = isBase(unit)

  // Find the base closest to this unit (or itself if it's a base)
  let nearestOwnBase: Unit | null = null
  let nearestOwnDist = Infinity

  if (unitIsBase) {
    nearestOwnBase = unit
    nearestOwnDist = 0
  } else {
    for (const base of nationBases) {
      const dist = haversine(unit.position, base.position)
      if (dist < nearestOwnDist) {
        nearestOwnDist = dist
        nearestOwnBase = base
      }
    }
  }

  // Units too far from any base can't be resupplied (300km max for field units)
  if (!nearestOwnBase || (!unitIsBase && nearestOwnDist > 300)) return null

  // Find all bases connected to the nearest base
  const connectedBases = findConnectedBases(nearestOwnBase.id, graph)

  // Also include the nearest base itself (self-supply for bases)
  connectedBases.add(nearestOwnBase.id)

  // Find the nearest connected base with the weapon in stock
  let bestBase: Unit | null = null
  let bestDist = Infinity

  for (const base of nationBases) {
    if (!connectedBases.has(base.id)) continue
    if (base.logistics <= 0) continue

    const stock = base.supplyStocks.find(s => s.weaponId === weaponId && s.count > 0)
    if (!stock) continue

    const dist = haversine(unit.position, base.position)
    if (dist < bestDist) {
      bestDist = dist
      bestBase = base
    }
  }

  return bestBase
}

// ===============================================
//  BASE PRODUCTION
// ===============================================

function processBaseProduction(state: GameState): void {
  for (const unit of state.units.values()) {
    if (!isBase(unit)) continue
    if (unit.status === 'destroyed') continue

    for (const stock of unit.supplyStocks) {
      if (stock.productionRate <= 0) continue
      if (stock.count >= stock.maxCount) continue

      // productionRate is units per hour — add that many
      const produced = Math.min(stock.productionRate, stock.maxCount - stock.count)
      stock.count += produced
    }
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
