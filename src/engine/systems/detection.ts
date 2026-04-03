import type { GameState, Missile, Unit } from '@/types/game'
import { haversine } from '../utils/geo'
import { weaponSpecs } from '@/data/weapons/missiles'

export interface DetectedThreat {
  missile: Missile
  distKm: number
  timeToImpactMs: number
}

/** For each AD unit, find incoming missiles within detection range */
export function detectThreats(state: GameState, adUnit: Unit): DetectedThreat[] {
  const threats: DetectedThreat[] = []

  if (adUnit.sensors.length === 0) return threats

  const radarRange = Math.max(...adUnit.sensors
    .filter(s => s.type === 'radar')
    .map(s => s.range_km))

  if (radarRange <= 0) return threats

  for (const missile of state.missiles.values()) {
    if (missile.status !== 'inflight') continue
    if (missile.nation === adUnit.nation) continue // don't track friendly

    // Approximate current missile position from path + timestamps
    const currentPos = interpolateMissilePosition(missile, state.time.timestamp)
    if (!currentPos) continue

    const dist = haversine(adUnit.position, { lat: currentPos[1], lng: currentPos[0] })

    // Detection range modified by missile profile
    const spec = weaponSpecs[missile.weaponId]
    let effectiveRange = radarRange
    if (spec) {
      // Low-altitude cruise missiles are harder to detect at range
      if (spec.flight_altitude_ft < 500) effectiveRange *= 0.4
      else if (spec.flight_altitude_ft < 5000) effectiveRange *= 0.7
      // RCS factor: small targets (drones ~0.1 m²) are harder to detect
      const rcs = spec.rcs_m2 ?? 1.0
      if (rcs < 1.0) effectiveRange *= Math.min(1.0, Math.sqrt(rcs))
    }

    if (dist <= effectiveRange) {
      threats.push({
        missile,
        distKm: dist,
        timeToImpactMs: missile.eta - state.time.timestamp,
      })
    }
  }

  // Sort by urgency (shortest time to impact first)
  threats.sort((a, b) => a.timeToImpactMs - b.timeToImpactMs)
  return threats
}

function interpolateMissilePosition(missile: Missile, currentTime: number): [number, number] | null {
  const { timestamps, path } = missile
  if (timestamps.length < 2) return null

  if (currentTime <= timestamps[0]) return path[0]
  if (currentTime >= timestamps[timestamps.length - 1]) return path[path.length - 1]

  for (let i = 0; i < timestamps.length - 1; i++) {
    if (currentTime >= timestamps[i] && currentTime < timestamps[i + 1]) {
      const t = (currentTime - timestamps[i]) / (timestamps[i + 1] - timestamps[i])
      return [
        path[i][0] + (path[i + 1][0] - path[i][0]) * t,
        path[i][1] + (path[i + 1][1] - path[i][1]) * t,
      ]
    }
  }

  return null
}
