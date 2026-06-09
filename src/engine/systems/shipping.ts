import type { GameState, NationId, Position, Unit } from '@/types/game'
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

// Equirectangular projection per segment — accurate enough at lane scales (<300 km)
function distToSegment(point: Position, a: [number, number], b: [number, number]): number {
  const kx = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180)
  const ax = a[0] * kx
  const ay = a[1]
  const dx = b[0] * kx - ax
  const dy = b[1] - ay
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((point.lng * kx - ax) * dx + (point.lat - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return haversine(point, { lat: ay + t * dy, lng: (ax + t * dx) / kx })
}

/** Returns minimum distance (km) from a point to a polyline path, point-to-segment */
function minDistToPath(lat: number, lng: number, path: [number, number][]): number {
  const point = { lat, lng }
  if (path.length === 1) return haversine(point, { lat: path[0][1], lng: path[0][0] })
  let min = Infinity
  for (let i = 0; i < path.length - 1; i++) {
    const d = distToSegment(point, path[i], path[i + 1])
    if (d < min) min = d
  }
  return min
}

// ═══════════════════════════════════════════════
//  Public API
// ═══════════════════════════════════════════════

export function processShipping(state: GameState, rng: SeededRNG): void {
  if (state.time.tick % TICKS_PER_MINUTE !== 0) return

  // Suppression and mine contacts are gated on the owning nation being at war —
  // pre-placed minefields stay dormant at peacetime
  const isBelligerent = (nation: NationId): boolean =>
    (state.nations[nation]?.atWar.length ?? 0) > 0

  // Pre-partition units once to avoid repeated full scans
  const minefields: Unit[] = []
  const belligerentNaval: Unit[] = []
  const droneInterdictors: Unit[] = []

  for (const unit of state.units.values()) {
    if (unit.status === 'destroyed') continue
    if (!isBelligerent(unit.nation)) continue

    if (unit.category === 'minefield' && unit.health > 0 && (unit.mine_count ?? 0) > 0) {
      minefields.push(unit)
    }

    if (unit.category === 'ship' || unit.category === 'submarine' || unit.category === 'carrier_group') {
      belligerentNaval.push(unit)
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

    // 2. Belligerent naval suppression
    let navalSuppression = 0
    for (const unit of belligerentNaval) {
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

    // Seed prev from lane.status so first tick / load never emits a no-change event
    const prev = lastStatus.get(lane.id) ?? lane.status
    lane.status = newStatus
    lastStatus.set(lane.id, newStatus)

    if (prev !== newStatus) {
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
    const ownerAtWarWith = state.nations[minefield.nation]?.atWar ?? []

    for (const unit of state.units.values()) {
      if (!ownerAtWarWith.includes(unit.nation)) continue
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

      if (unit.health <= 0) {
        unit.status = 'destroyed'
        const destroyedEvent = {
          type: 'UNIT_DESTROYED' as const,
          unitId: unit.id,
          tick: state.time.tick,
        }
        state.events.push(destroyedEvent)
        state.pendingEvents.push(destroyedEvent)
      } else if (unit.health < 50) {
        unit.status = 'damaged'
      }

      if ((minefield.mine_count ?? 0) <= 0) {
        minefield.status = 'destroyed'
        break // no more mines to trigger
      }
    }
  }
}
