import type { GameState, Missile, NationId, UnitId, Unit } from '@/types/game'
import type { ElevationGrid } from './elevation'
import { detectThreats, type DetectedThreat } from './detection'
import { haversine } from '../utils/geo'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NetworkDetection {
  missile: Missile
  detectedBy: UnitId
  quality: 'tracked' | 'detected'
  distKm: number
  timeToImpactMs: number
}

export interface SensorNetwork {
  /** unit → hub IDs it's connected to */
  connections: Map<UnitId, UnitId[]>
  /** nation → missileId → best detection from any networked unit */
  sharedDetections: Map<NationId, Map<string, NetworkDetection>>
  /** nation → set of enemy unit IDs detected via ELINT (radar emission interception) */
  elintDetections: Map<NationId, Set<UnitId>>
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

/**
 * Build the sensor network graph for this tick.
 *
 * 1. Find all hubs (units with datalink_range_km > 0, not destroyed)
 * 2. Connect each sensor-capable unit to hubs within datalink range (same nation)
 * 3. Run detectThreats() for each radar unit → local detections
 * 4. Propagate: if unit A detects missile X and shares a hub with unit B,
 *    unit B also gets the detection (at 'detected' quality)
 */
export function buildSensorNetwork(
  state: GameState,
  grid?: ElevationGrid | null,
): SensorNetwork {
  const connections = new Map<UnitId, UnitId[]>()
  const sharedDetections = new Map<NationId, Map<string, NetworkDetection>>()

  // --- Step 1: identify hubs ---
  const hubs: Unit[] = []
  for (const unit of state.units.values()) {
    if (unit.status === 'destroyed') continue
    if (unit.datalink_range_km && unit.datalink_range_km > 0) {
      hubs.push(unit)
    }
  }

  // --- Step 2: connect sensor-capable units to hubs ---
  for (const unit of state.units.values()) {
    if (unit.status === 'destroyed') continue
    if (unit.sensors.length === 0) continue

    const unitHubs: UnitId[] = []
    for (const hub of hubs) {
      if (hub.nation !== unit.nation) continue
      const dist = haversine(unit.position, hub.position)
      if (dist <= hub.datalink_range_km!) {
        unitHubs.push(hub.id)
      }
    }
    if (unitHubs.length > 0) {
      connections.set(unit.id, unitHubs)
    }
  }

  // --- Step 3: run local detections per radar unit ---
  // Map: nation → missileId → best local detection (closest detector = 'tracked')
  const localDetections = new Map<UnitId, DetectedThreat[]>()

  for (const unit of state.units.values()) {
    if (unit.status === 'destroyed') continue
    if (unit.sensors.length === 0) continue
    if (!unit.sensors.some(s => s.type === 'radar')) continue

    const threats = detectThreats(state, unit, grid)
    if (threats.length > 0) {
      localDetections.set(unit.id, threats)
    }
  }

  // --- Step 4: propagate through hubs ---
  // First, aggregate all detections per hub
  // hub → missileId → best NetworkDetection
  const hubDetections = new Map<UnitId, Map<string, NetworkDetection>>()

  for (const [unitId, threats] of localDetections) {
    const unitHubs = connections.get(unitId)
    if (!unitHubs) continue

    for (const threat of threats) {
      for (const hubId of unitHubs) {
        let hubMap = hubDetections.get(hubId)
        if (!hubMap) {
          hubMap = new Map()
          hubDetections.set(hubId, hubMap)
        }

        const existing = hubMap.get(threat.missile.id)
        // Keep the closest detection (best quality)
        if (!existing || threat.distKm < existing.distKm) {
          hubMap.set(threat.missile.id, {
            missile: threat.missile,
            detectedBy: unitId,
            quality: 'tracked', // original detector has tracked quality
            distKm: threat.distKm,
            timeToImpactMs: threat.timeToImpactMs,
          })
        }
      }
    }
  }

  // Now build per-nation shared detections by collecting from all hubs
  for (const unit of state.units.values()) {
    if (unit.status === 'destroyed') continue
    if (unit.sensors.length === 0) continue

    const unitHubs = connections.get(unit.id)
    if (!unitHubs) continue

    let nationMap = sharedDetections.get(unit.nation)
    if (!nationMap) {
      nationMap = new Map()
      sharedDetections.set(unit.nation, nationMap)
    }

    for (const hubId of unitHubs) {
      const hubMap = hubDetections.get(hubId)
      if (!hubMap) continue

      for (const [missileId, detection] of hubMap) {
        const existing = nationMap.get(missileId)

        // Determine quality: if this unit is the original detector, quality is 'tracked';
        // otherwise it's a shared 'detected' quality
        const isOwnDetection = detection.detectedBy === unit.id
        const quality: 'tracked' | 'detected' = isOwnDetection ? 'tracked' : 'detected'

        if (!existing || quality === 'tracked' && existing.quality !== 'tracked') {
          nationMap.set(missileId, {
            ...detection,
            quality,
          })
        }
      }
    }
  }

  // --- Step 5: ELINT — detect enemy radar emissions ---
  // Any unit with sensors within 1.5× an enemy radar's range can detect its emissions
  const elintDetections = new Map<NationId, Set<UnitId>>()

  for (const unit of state.units.values()) {
    if (unit.status === 'destroyed') continue
    if (unit.sensors.length === 0) continue // need sensors to detect emissions

    for (const enemy of state.units.values()) {
      if (enemy.status === 'destroyed') continue
      if (enemy.nation === unit.nation) continue // same nation — skip

      // Check each enemy radar sensor
      for (const sensor of enemy.sensors) {
        if (sensor.type !== 'radar') continue
        const elintRange = sensor.range_km * 1.5 // emissions detectable at 1.5x radar range
        const dist = haversine(unit.position, enemy.position)
        if (dist <= elintRange) {
          // Add enemy unit to ELINT detections for detecting unit's nation
          let nationSet = elintDetections.get(unit.nation)
          if (!nationSet) {
            nationSet = new Set()
            elintDetections.set(unit.nation, nationSet)
          }
          nationSet.add(enemy.id)
          break // already detected this enemy, no need to check remaining sensors
        }
      }
    }
  }

  return { connections, sharedDetections, elintDetections }
}

// ---------------------------------------------------------------------------
// Networked threat detection for a specific AD unit
// ---------------------------------------------------------------------------

export interface NetworkedThreat extends DetectedThreat {
  /** 'own' = detected by this unit's radar, 'tracked'/'detected' = from network */
  networkQuality: 'own' | 'tracked' | 'detected'
}

/**
 * Get threats visible to an AD unit, combining own radar + network data.
 *
 * 1. Get own local detections via detectThreats()
 * 2. Query network for threats detected by other units on shared hubs
 * 3. Merge, deduplicate by missile ID, prefer own detections
 */
export function detectThreatsNetworked(
  state: GameState,
  adUnit: Unit,
  network: SensorNetwork,
  grid?: ElevationGrid | null,
): NetworkedThreat[] {
  const resultMap = new Map<string, NetworkedThreat>()

  // --- Own local detections (highest priority) ---
  const ownThreats = detectThreats(state, adUnit, grid)
  for (const threat of ownThreats) {
    resultMap.set(threat.missile.id, {
      ...threat,
      networkQuality: 'own',
    })
  }

  // --- Network detections from shared hubs ---
  const unitHubs = network.connections.get(adUnit.id)
  if (unitHubs && unitHubs.length > 0) {
    const nationMap = network.sharedDetections.get(adUnit.nation)
    if (nationMap) {
      for (const [missileId, detection] of nationMap) {
        // Skip if already detected by own radar (own > network)
        if (resultMap.has(missileId)) continue

        resultMap.set(missileId, {
          missile: detection.missile,
          distKm: detection.distKm,
          timeToImpactMs: detection.timeToImpactMs,
          networkQuality: detection.quality,
        })
      }
    }
  }

  // Sort by urgency (shortest time to impact first)
  const results = Array.from(resultMap.values())
  results.sort((a, b) => a.timeToImpactMs - b.timeToImpactMs)
  return results
}

// ---------------------------------------------------------------------------
// ELINT helper
// ---------------------------------------------------------------------------

/** Check if a unit has been detected via ELINT by a given nation */
export function isDetectedByELINT(
  network: SensorNetwork,
  nation: NationId,
  unitId: UnitId,
): boolean {
  return network.elintDetections.get(nation)?.has(unitId) ?? false
}
