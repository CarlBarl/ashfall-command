import type { GameState, GameEvent, Unit, UnitId, NationId, SupplyLine } from '@/types/game'
import type { SupplyShipment, NationalStockpile } from '@/types/logistics'
import { nationalStockpiles } from '@/data/supply/national-stockpiles'
import { haversine } from '@/engine/utils/geo'

// ═══════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════

const RESUPPLY_INTERVAL = 60       // Process every 60 ticks (1 game minute)
const PRODUCTION_INTERVAL = 3600   // Production every 3600 ticks (1 game hour)
const SUPPLY_SPEED_KMH_OVERLAND = 80 // km/h for truck convoys
const RESUPPLY_THRESHOLD = 0.5     // Request resupply when below 50% capacity
const MAX_FIELD_RESUPPLY_RANGE = 300 // km — field units must be within this distance of a base

// ═══════════════════════════════════════════════
//  MODULE-LEVEL STATE
//
//  CRITICAL: All mutable module-level state MUST
//  be cleared in resetLogisticsState(). Failure
//  to do so causes stale state on save/load.
// ═══════════════════════════════════════════════

/** Active shipments in transit */
let activeShipments = new Map<string, SupplyShipment>()

/** Throughput used per supply line this hour (lineId → units shipped) */
let hourlyThroughput = new Map<string, number>()

/** Monotonic counter for shipment IDs */
let shipmentCounter = 0

/** Deep copy of national stockpile state (mutable at runtime) */
let runtimeStockpiles: Record<string, NationalStockpile> | null = null

// ═══════════════════════════════════════════════
//  PUBLIC API — matches logistics.ts interface
// ═══════════════════════════════════════════════

export function resetLogisticsState(): void {
  activeShipments = new Map()
  hourlyThroughput = new Map()
  shipmentCounter = 0
  runtimeStockpiles = null
}

export function processLogistics(state: GameState): void {
  const tick = state.time.tick

  // Lazily initialize runtime stockpile state on first call
  if (runtimeStockpiles === null) {
    runtimeStockpiles = deepCopyStockpiles(nationalStockpiles)
  }

  // Hourly: national production + reset throughput tracker
  if (tick > 0 && tick % PRODUCTION_INTERVAL === 0) {
    processNationalProduction(state)
    processBaseProduction(state)
    hourlyThroughput.clear()
  }

  // Every minute: deliver shipments, then generate new ones
  if (tick > 0 && tick % RESUPPLY_INTERVAL === 0) {
    processArrivingShipments(state)
    processResupplyRequests(state)
  }
}

// ═══════════════════════════════════════════════
//  SERIALIZATION — for save/load support
// ═══════════════════════════════════════════════

export function getShipmentsSnapshot(): SupplyShipment[] {
  return Array.from(activeShipments.values())
}

export function loadShipments(shipments: SupplyShipment[]): void {
  activeShipments.clear()
  for (const s of shipments) {
    activeShipments.set(s.id, s)
    // Restore shipment counter above loaded IDs
    const num = parseInt(s.id.replace('shipment_', ''), 10)
    if (!isNaN(num) && num >= shipmentCounter) {
      shipmentCounter = num + 1
    }
  }
}

export function getStockpilesSnapshot(): Record<string, NationalStockpile> | null {
  return runtimeStockpiles ? deepCopyStockpiles(runtimeStockpiles) : null
}

export function loadStockpiles(stockpiles: Record<string, NationalStockpile>): void {
  runtimeStockpiles = deepCopyStockpiles(stockpiles)
}

// ═══════════════════════════════════════════════
//  1. NATIONAL STOCKPILE PRODUCTION
// ═══════════════════════════════════════════════

function processNationalProduction(state: GameState): void {
  if (!runtimeStockpiles) return

  for (const nationId of ['usa', 'iran'] as NationId[]) {
    const stockpile = runtimeStockpiles[nationId]

    // If the depot unit is destroyed, no production
    const depotUnit = state.units.get(stockpile.depotId)
    if (!depotUnit || depotUnit.status === 'destroyed') continue

    for (const prod of stockpile.production) {
      const stock = stockpile.stocks.find(s => s.weaponId === prod.weaponId)
      if (!stock) continue

      const produced = prod.ratePerHour * prod.efficiency
      stock.count = Math.min(stock.count + produced, stock.maxCount)
    }
  }
}

// ═══════════════════════════════════════════════
//  2. ARRIVING SHIPMENTS
// ═══════════════════════════════════════════════

function processArrivingShipments(state: GameState): void {
  const events: GameEvent[] = []
  const arrived: string[] = []

  for (const [id, shipment] of activeShipments) {
    if (state.time.timestamp < shipment.arrivesAt) continue

    // Deliver to destination base
    const destUnit = state.units.get(shipment.toBaseId)
    if (destUnit && destUnit.status !== 'destroyed') {
      const stock = destUnit.supplyStocks.find(s => s.weaponId === shipment.weaponId)
      if (stock) {
        stock.count = Math.min(stock.count + shipment.count, stock.maxCount)
      } else {
        // Base doesn't have this weapon type in supplyStocks — add it
        destUnit.supplyStocks.push({
          weaponId: shipment.weaponId,
          count: shipment.count,
          maxCount: shipment.count * 2, // Reasonable max
          productionRate: 0,
        })
      }

      events.push({
        type: 'RESUPPLIED',
        unitId: destUnit.id,
        weaponId: shipment.weaponId,
        count: shipment.count,
        fromBaseId: shipment.fromBaseId,
        tick: state.time.tick,
      })
    }
    // If destination is destroyed, shipment is lost (cargo destroyed)

    arrived.push(id)
  }

  for (const id of arrived) {
    activeShipments.delete(id)
  }

  emitEvents(state, events)
}

// ═══════════════════════════════════════════════
//  3. RESUPPLY REQUESTS (generate new shipments)
// ═══════════════════════════════════════════════

function processResupplyRequests(state: GameState): void {
  if (!runtimeStockpiles) return

  const graph = buildSupplyGraph(state)

  // Collect bases per nation for proximity lookups
  const basesByNation = new Map<NationId, Unit[]>()
  for (const unit of state.units.values()) {
    if (!isBase(unit) || unit.status === 'destroyed') continue
    if (!basesByNation.has(unit.nation)) basesByNation.set(unit.nation, [])
    basesByNation.get(unit.nation)!.push(unit)
  }

  for (const unit of state.units.values()) {
    if (unit.status === 'destroyed') continue

    for (const weapon of unit.weapons) {
      if (weapon.count >= weapon.maxCount * RESUPPLY_THRESHOLD) continue

      const needed = weapon.maxCount - weapon.count

      // Find the unit's nearest base (or itself if it is a base)
      const nearestBase = findNearestOwnBase(unit, basesByNation.get(unit.nation) ?? [])
      if (!nearestBase) continue

      // Try to get supply from connected bases (BFS)
      const fulfilled = tryResupplyFromConnectedBases(
        state, graph, nearestBase, unit, weapon.weaponId, needed,
      )

      // If nothing from local bases, try the national stockpile depot
      if (fulfilled < needed) {
        tryResupplyFromNationalStockpile(
          state, graph, nearestBase, unit, weapon.weaponId, needed - fulfilled,
        )
      }
    }
  }
}

/**
 * Try to resupply from connected bases (nearest first).
 * Returns the number of units for which shipments were created.
 */
function tryResupplyFromConnectedBases(
  state: GameState,
  graph: Map<UnitId, UnitId[]>,
  nearestBase: Unit,
  requestingUnit: Unit,
  weaponId: string,
  needed: number,
): number {
  const connectedIds = findConnectedBases(nearestBase.id, graph)
  connectedIds.add(nearestBase.id)

  // Gather connected bases with the weapon, sorted by distance to the requesting unit
  const candidates: { base: Unit; dist: number }[] = []
  for (const baseId of connectedIds) {
    if (baseId === requestingUnit.id) continue // Don't resupply from self
    const base = state.units.get(baseId)
    if (!base || base.status === 'destroyed' || base.logistics <= 0) continue

    const stock = base.supplyStocks.find(s => s.weaponId === weaponId && s.count > 0)
    if (!stock) continue

    candidates.push({ base, dist: haversine(requestingUnit.position, base.position) })
  }
  candidates.sort((a, b) => a.dist - b.dist)

  let fulfilled = 0

  for (const { base } of candidates) {
    if (fulfilled >= needed) break

    const stock = base.supplyStocks.find(s => s.weaponId === weaponId)
    if (!stock || stock.count <= 0) continue

    // Find supply line between base and the requesting unit's nearest base
    const supplyLine = findSupplyLineBetween(state, base.id, nearestBase.id)
    if (!supplyLine) continue

    // Check capacity remaining this hour
    const remaining = getRemainingCapacity(supplyLine)
    if (remaining <= 0) continue

    const transfer = Math.min(needed - fulfilled, stock.count, remaining)
    if (transfer <= 0) continue

    // Deduct from source immediately
    stock.count -= transfer

    // Calculate transit time with health penalty
    const transitMs = computeTransitTime(supplyLine)

    // Create shipment
    const shipment: SupplyShipment = {
      id: `shipment_${shipmentCounter++}`,
      supplyLineId: supplyLine.id,
      fromBaseId: base.id,
      toBaseId: isBase(requestingUnit) ? requestingUnit.id : nearestBase.id,
      weaponId,
      count: transfer,
      departedAt: state.time.timestamp,
      arrivesAt: state.time.timestamp + transitMs,
    }
    activeShipments.set(shipment.id, shipment)

    // Track throughput
    recordThroughput(supplyLine.id, transfer)

    fulfilled += transfer
  }

  return fulfilled
}

/**
 * Try to get supply from the national stockpile via the depot.
 * This creates a multi-hop shipment: stockpile → depot → nearestBase → unit.
 */
function tryResupplyFromNationalStockpile(
  state: GameState,
  graph: Map<UnitId, UnitId[]>,
  nearestBase: Unit,
  requestingUnit: Unit,
  weaponId: string,
  needed: number,
): void {
  if (!runtimeStockpiles) return

  const stockpile = runtimeStockpiles[requestingUnit.nation]
  const depotUnit = state.units.get(stockpile.depotId)
  if (!depotUnit || depotUnit.status === 'destroyed') return

  // Check if depot is connected to the requesting unit's nearest base
  const connectedToDepot = findConnectedBases(stockpile.depotId, graph)
  connectedToDepot.add(stockpile.depotId)

  if (!connectedToDepot.has(nearestBase.id)) return

  // Find the weapon in the national stockpile
  const nationalStock = stockpile.stocks.find(s => s.weaponId === weaponId)
  if (!nationalStock || nationalStock.count <= 0) return

  // Find supply line from depot toward nearest base (may be multi-hop, use total path distance)
  const pathDistance = computePathDistance(state, graph, stockpile.depotId, nearestBase.id)
  if (pathDistance <= 0) return

  // Check capacity on the first supply line out of depot
  const firstLine = findSupplyLineFrom(state, stockpile.depotId, graph)
  if (!firstLine) return

  const remaining = getRemainingCapacity(firstLine)
  if (remaining <= 0) return

  const transfer = Math.min(needed, Math.floor(nationalStock.count), remaining)
  if (transfer <= 0) return

  // Deduct from national stockpile
  nationalStock.count -= transfer

  // Transit time based on total path distance, with health of worst line on path
  const worstHealth = findWorstHealthOnPath(state, graph, stockpile.depotId, nearestBase.id)
  const baseTransitMs = (pathDistance / SUPPLY_SPEED_KMH_OVERLAND) * 3600 * 1000 // hours → ms
  const healthPenalty = worstHealth > 0 ? (100 / worstHealth) : 10
  const transitMs = Math.round(baseTransitMs * healthPenalty)

  const shipment: SupplyShipment = {
    id: `shipment_${shipmentCounter++}`,
    supplyLineId: firstLine.id,
    fromBaseId: stockpile.depotId,
    toBaseId: isBase(requestingUnit) ? requestingUnit.id : nearestBase.id,
    weaponId,
    count: transfer,
    departedAt: state.time.timestamp,
    arrivesAt: state.time.timestamp + transitMs,
  }
  activeShipments.set(shipment.id, shipment)

  recordThroughput(firstLine.id, transfer)
}

// ═══════════════════════════════════════════════
//  BASE PRODUCTION (local base stocks)
// ═══════════════════════════════════════════════

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

// ═══════════════════════════════════════════════
//  SUPPLY GRAPH UTILITIES
// ═══════════════════════════════════════════════

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

/** Find the nearest base belonging to the same nation, or the unit itself if it is a base */
function findNearestOwnBase(unit: Unit, nationBases: Unit[]): Unit | null {
  if (isBase(unit)) return unit

  let best: Unit | null = null
  let bestDist = Infinity

  for (const base of nationBases) {
    const dist = haversine(unit.position, base.position)
    if (dist < bestDist) {
      bestDist = dist
      best = base
    }
  }

  // Field units too far from any base can't be resupplied
  if (best && bestDist > MAX_FIELD_RESUPPLY_RANGE) return null
  return best
}

/** Find a supply line connecting two bases (direct link) */
function findSupplyLineBetween(state: GameState, baseA: UnitId, baseB: UnitId): SupplyLine | null {
  for (const line of state.supplyLines.values()) {
    if (line.health <= 0) continue
    if (
      (line.fromBaseId === baseA && line.toBaseId === baseB) ||
      (line.fromBaseId === baseB && line.toBaseId === baseA)
    ) {
      return line
    }
  }
  return null
}

/** Find the first healthy supply line originating from a base */
function findSupplyLineFrom(state: GameState, baseId: UnitId, graph: Map<UnitId, UnitId[]>): SupplyLine | null {
  const neighbors = graph.get(baseId)
  if (!neighbors || neighbors.length === 0) return null

  for (const neighborId of neighbors) {
    const line = findSupplyLineBetween(state, baseId, neighborId)
    if (line) return line
  }
  return null
}

/**
 * Compute total distance along BFS shortest path between two bases.
 * Returns 0 if no path exists.
 */
function computePathDistance(
  state: GameState,
  graph: Map<UnitId, UnitId[]>,
  fromId: UnitId,
  toId: UnitId,
): number {
  if (fromId === toId) return 0

  // BFS to find shortest path (by hop count)
  const visited = new Map<UnitId, UnitId | null>() // node → parent
  const queue: UnitId[] = [fromId]
  visited.set(fromId, null)

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current === toId) break

    const neighbors = graph.get(current)
    if (!neighbors) continue

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.set(neighbor, current)
        queue.push(neighbor)
      }
    }
  }

  if (!visited.has(toId)) return 0

  // Walk back from toId to fromId summing supply line distances
  let totalDistance = 0
  let current: UnitId | null = toId

  while (current !== null && current !== fromId) {
    const parent: UnitId | null = visited.get(current) ?? null
    if (parent === null) break
    const line = findSupplyLineBetween(state, parent, current)
    if (line) {
      totalDistance += line.distance_km
    }
    current = parent
  }

  return totalDistance
}

/**
 * Find the worst (lowest) health on the BFS path between two bases.
 * Returns 100 if same base, 0 if no path.
 */
function findWorstHealthOnPath(
  state: GameState,
  graph: Map<UnitId, UnitId[]>,
  fromId: UnitId,
  toId: UnitId,
): number {
  if (fromId === toId) return 100

  // BFS
  const visited = new Map<UnitId, UnitId | null>()
  const queue: UnitId[] = [fromId]
  visited.set(fromId, null)

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current === toId) break

    const neighbors = graph.get(current)
    if (!neighbors) continue

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.set(neighbor, current)
        queue.push(neighbor)
      }
    }
  }

  if (!visited.has(toId)) return 0

  let worstHealth = 100
  let current: UnitId | null = toId

  while (current !== null && current !== fromId) {
    const parent: UnitId | null = visited.get(current) ?? null
    if (parent === null) break
    const line = findSupplyLineBetween(state, parent, current)
    if (line && line.health < worstHealth) {
      worstHealth = line.health
    }
    current = parent
  }

  return worstHealth
}

// ═══════════════════════════════════════════════
//  CAPACITY & TRANSIT HELPERS
// ═══════════════════════════════════════════════

/** Get remaining hourly capacity on a supply line */
function getRemainingCapacity(line: SupplyLine): number {
  const used = hourlyThroughput.get(line.id) ?? 0
  return Math.max(0, line.capacity - used)
}

/** Record throughput used on a supply line */
function recordThroughput(lineId: string, amount: number): void {
  const current = hourlyThroughput.get(lineId) ?? 0
  hourlyThroughput.set(lineId, current + amount)
}

/**
 * Compute transit time for a single supply line segment in milliseconds.
 * Damaged lines (health < 100) slow transit: transitTime *= (100 / health)
 */
function computeTransitTime(line: SupplyLine): number {
  // Base transit: distance / speed → hours → ms
  const baseHours = line.distance_km / SUPPLY_SPEED_KMH_OVERLAND
  const baseMs = baseHours * 3600 * 1000

  // Health penalty
  const healthPenalty = line.health > 0 ? (100 / line.health) : 10
  return Math.round(baseMs * healthPenalty)
}

// ═══════════════════════════════════════════════
//  GENERAL HELPERS
// ═══════════════════════════════════════════════

function isBase(unit: Unit): boolean {
  return unit.category === 'airbase' || unit.category === 'naval_base'
}

function emitEvents(state: GameState, events: GameEvent[]): void {
  state.events.push(...events)
  if (state.events.length > 2000) {
    state.events.splice(0, state.events.length - 2000)
  }
  state.pendingEvents.push(...events)
}

/** Deep copy stockpile data to avoid mutating the static definitions */
function deepCopyStockpiles(src: Record<string, NationalStockpile>): Record<string, NationalStockpile> {
  return {
    usa: {
      ...src.usa,
      stocks: src.usa.stocks.map(s => ({ ...s })),
      production: src.usa.production.map(p => ({ ...p })),
    },
    iran: {
      ...src.iran,
      stocks: src.iran.stocks.map(s => ({ ...s })),
      production: src.iran.production.map(p => ({ ...p })),
    },
  }
}
