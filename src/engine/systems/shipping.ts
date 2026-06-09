import type { GameState, Unit } from '@/types/game'
import type { SeededRNG } from '../utils/rng'
import { haversine } from '../utils/geo'

const TICKS_PER_MINUTE = 60

// ═══════════════════════════════════════════════
//  Module-level state — must be resettable for save/load
// ═══════════════════════════════════════════════

let lastStatus = new Map<string, string>()

export function resetShippingState(): void {
  lastStatus = new Map()
}

// ═══════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════

/** Returns minimum haversine distance (km) from a point to any segment endpoint on a polyline path */
function minDistToPath(lat: number, lng: number, path: [number, number][]): number {
  const point = { lat, lng }
  let min = Infinity
  for (const p of path) {
    const d = haversine(point, { lat: p[1], lng: p[0] })
    if (d < min) min = d
  }
  return min
}

// ═══════════════════════════════════════════════
//  Public API
// ═══════════════════════════════════════════════

export function processShipping(state: GameState, rng: SeededRNG): void {
  if (state.time.tick % TICKS_PER_MINUTE !== 0) return

  const playerNation = state.playerNation
  const enemyNation = playerNation === 'usa' ? 'iran' : 'usa'

  // Pre-partition units once to avoid repeated full scans
  const minefields: Unit[] = []
  const enemyNaval: Unit[] = []
  const droneInterdictors: Unit[] = []

  for (const unit of state.units.values()) {
    if (unit.status === 'destroyed') continue

    if (unit.category === 'minefield' && unit.health > 0 && (unit.mine_count ?? 0) > 0) {
      minefields.push(unit)
    }

    if (
      unit.nation === enemyNation &&
      (unit.category === 'ship' || unit.category === 'submarine' || unit.category === 'carrier_group')
    ) {
      enemyNaval.push(unit)
    }

    if (
      unit.droneMission === 'shipping_interdiction' &&
      unit.weapons.some(w => w.weaponId.includes('shahed'))
    ) {
      droneInterdictors.push(unit)
    }
  }

  // ── Shipping lane suppression ────────────────
  for (const lane of state.shippingLanes.values()) {
    // 1. Minefield suppression
    let mineSuppression = 0
    for (const unit of minefields) {
      const radius = (unit.radius_km ?? 0) + 20
      const dist = minDistToPath(unit.position.lat, unit.position.lng, lane.path)
      if (dist <= radius) {
        const contribution = Math.min(0.3, ((unit.mine_count ?? 0) / 1000) * 0.3) * (unit.health / 100)
        mineSuppression += contribution
      }
    }
    mineSuppression = Math.min(1.0, mineSuppression)

    // 2. Enemy naval suppression
    let navalSuppression = 0
    for (const unit of enemyNaval) {
      const dist = minDistToPath(unit.position.lat, unit.position.lng, lane.path)
      if (dist <= 100) {
        navalSuppression += 0.1
        if (navalSuppression >= 0.4) break
      }
    }
    navalSuppression = Math.min(0.4, navalSuppression)

    // 3. Drone interdiction suppression
    let droneSuppression = 0
    for (const unit of droneInterdictors) {
      const dist = minDistToPath(unit.position.lat, unit.position.lng, lane.path)
      if (dist <= 500) {
        droneSuppression += 0.15
        if (droneSuppression >= 0.3) break
      }
    }
    droneSuppression = Math.min(0.3, droneSuppression)

    // 4. Aggregate
    const suppressionFactor = Math.min(1.0, mineSuppression + navalSuppression + droneSuppression)
    lane.suppressionFactor = suppressionFactor
    lane.currentThroughput_mbd = lane.baseThroughput_mbd * (1 - suppressionFactor)

    // 5. Status
    const newStatus: typeof lane.status =
      suppressionFactor < 0.2 ? 'open' :
      suppressionFactor < 0.7 ? 'reduced' :
      'blocked'
    lane.status = newStatus

    // Status change event
    const prev = lastStatus.get(lane.id)
    if (prev !== newStatus) {
      lastStatus.set(lane.id, newStatus)
      const event = {
        type: 'SHIPPING_LANE_STATUS_CHANGE' as const,
        laneId: lane.id,
        newStatus,
        suppressionFactor,
        tick: state.time.tick,
      }
      state.events.push(event)
      state.pendingEvents.push(event)
    }
  }

  // ── Mine contacts ────────────────────────────
  for (const minefield of minefields) {
    const radius = minefield.radius_km ?? 0

    for (const unit of state.units.values()) {
      if (unit.nation === minefield.nation) continue
      if (unit.category !== 'ship' && unit.category !== 'submarine' && unit.category !== 'carrier_group') continue
      if (unit.status === 'destroyed') continue

      const dist = haversine(minefield.position, unit.position)
      if (dist > radius) continue

      if (rng.next() >= 0.15) continue

      // Contact — apply damage, consume mine
      const damage = minefield.damage_per_contact ?? 10
      unit.health = Math.max(0, unit.health - damage)
      minefield.mine_count = (minefield.mine_count ?? 0) - 1

      const event = {
        type: 'MINE_CONTACT' as const,
        minefieldId: minefield.id,
        targetId: unit.id,
        damage,
        tick: state.time.tick,
      }
      state.events.push(event)
      state.pendingEvents.push(event)

      if ((minefield.mine_count ?? 0) <= 0) {
        minefield.status = 'destroyed'
        break // no more mines to trigger
      }
    }
  }
}
