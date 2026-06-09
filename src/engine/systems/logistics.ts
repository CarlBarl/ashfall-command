import type { GameState, GameEvent, Unit, UnitId, NationId } from '@/types/game'
import { haversine } from '@/engine/utils/geo'

const RESUPPLY_INTERVAL = 60 // Process every 60 ticks (1 game minute)
const PRODUCTION_INTERVAL = 3600 // Production every 3600 ticks (1 game hour)

/** Tracks which supply lines have already emitted the SUPPLY_LINE_INTERDICTED event */
const interdictedLines = new Set<string>()

export function resetLogisticsState(): void {
  interdictedLines.clear()
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

  // Resupply and supply line interdiction run every minute
  if (tick > 0 && tick % RESUPPLY_INTERVAL === 0) {
    processResupply(state)
    processSupplyLineInterdiction(state)
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
      // Base transfer is 1 per minute; logistics efficiency gates whether it happens
      const transfer = logisticsMultiplier >= 0.5 ? Math.min(available, needed, 1) : 0
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
//  SUPPLY LINE INTERDICTION
// ===============================================

/** Threat profile per unit category for supply line interdiction */
const INTERDICTION_THREATS: Partial<Record<string, { range_km: number; weight: number }>> = {
  ship:            { range_km: 150, weight: 0.15 },
  carrier_group:   { range_km: 150, weight: 0.15 },
  submarine:       { range_km: 200, weight: 0.15 },
  missile_battery: { range_km: 300, weight: 0.15 },
  minefield:       { range_km: 0,   weight: 0.20 }, // range_km is dynamic (unit.radius_km)
}

/** Linear interpolation of a Position along a line at fraction t ∈ [0, 1] */
function lerpPosition(a: { lat: number; lng: number }, b: { lat: number; lng: number }, t: number): { lat: number; lng: number } {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  }
}

export function processSupplyLineInterdiction(state: GameState): void {
  const events: GameEvent[] = []

  for (const line of state.supplyLines.values()) {
    const fromBase = state.units.get(line.fromBaseId)
    const toBase   = state.units.get(line.toBaseId)

    // Skip if either base is missing or destroyed
    if (!fromBase || fromBase.status === 'destroyed') continue
    if (!toBase   || toBase.status === 'destroyed')   continue

    // Determine the supply line's owning nation from the fromBase
    const baseNation = state.nations[fromBase.nation]
    if (!baseNation) continue

    // Sample 5 points along the line (t = 0.1, 0.3, 0.5, 0.7, 0.9)
    const sampleFractions = [0.1, 0.3, 0.5, 0.7, 0.9]
    const samplePoints = sampleFractions.map(t =>
      lerpPosition(fromBase.position, toBase.position, t),
    )

    let totalThreatWeight = 0
    let firstThreatUnitId: string | null = null

    for (const unit of state.units.values()) {
      if (unit.status === 'destroyed') continue

      // Only consider enemy units (units whose nation is at war with the base nation)
      if (!baseNation.atWar.includes(unit.nation)) continue

      const threatProfile = INTERDICTION_THREATS[unit.category]
      if (!threatProfile) continue

      // Resolve range — minefields use unit.radius_km
      const range_km = unit.category === 'minefield'
        ? (unit.radius_km ?? 0)
        : threatProfile.range_km

      if (range_km <= 0) continue

      // Check each sample point against this unit
      for (const point of samplePoints) {
        const dist = haversine(
          { lat: point.lat, lng: point.lng },
          unit.position,
        )
        if (dist <= range_km) {
          totalThreatWeight += threatProfile.weight
          if (firstThreatUnitId === null) firstThreatUnitId = unit.id
          break // One hit per unit is enough — don't double-count the same enemy
        }
      }
    }

    const prevHealth = line.health

    if (totalThreatWeight > 0) {
      // Degrade health proportional to threat weight
      line.health -= totalThreatWeight * 5
    } else {
      // Recover when no threats are present
      line.health += 2
    }

    // Clamp to [0, 100]
    line.health = Math.max(0, Math.min(100, line.health))

    // ---- Event: first crossing below 50 ----
    if (line.health < 50 && prevHealth >= 50 && !interdictedLines.has(line.id)) {
      interdictedLines.add(line.id)
      events.push({
        type: 'SUPPLY_LINE_INTERDICTED',
        lineId: line.id,
        threatUnitId: firstThreatUnitId ?? line.fromBaseId,
        healthAfter: line.health,
        tick: state.time.tick,
      })
    }

    // ---- Event: health hits 0 ----
    if (line.health <= 0 && prevHealth > 0) {
      events.push({
        type: 'SUPPLY_LINE_CUT',
        lineId: line.id,
        tick: state.time.tick,
      })
    }

    // ---- Clear interdiction record when health recovers above 50 ----
    if (line.health > 50 && interdictedLines.has(line.id)) {
      interdictedLines.delete(line.id)
    }
  }

  emitEvents(state, events)
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
