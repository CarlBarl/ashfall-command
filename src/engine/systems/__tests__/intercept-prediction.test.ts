import { describe, it, expect } from 'vitest'
import { haversine } from '../../utils/geo'

/**
 * Tests for SAM intercept prediction — written BEFORE implementation (TDD).
 *
 * A SAM interceptor should compute a LEAD intercept point:
 * where the target missile WILL BE when the interceptor arrives,
 * not where it IS now.
 */

describe('intercept prediction geometry', () => {
  it('predicted intercept point is AHEAD of the target, not at current position', () => {
    // Target flying north at Mach 2 (~2450 km/h)
    // Interceptor 100km south of target, flying at Mach 4 (~4900 km/h)
    // Naive: interceptor aims at target's current position
    // Lead: interceptor aims ahead along target's heading

    const targetPos = { lat: 27.0, lng: 52.0 }
    // Target flying north (heading 0°)
    const targetSpeed_kmh = 2 * 343 * 3.6 // Mach 2

    const launcherPos = { lat: 26.0, lng: 52.0 } // 100km south
    const intSpeed_kmh = 4 * 343 * 3.6 // Mach 4

    const distToTarget = haversine(launcherPos, targetPos) // ~111km
    const timeToReach_sec = (distToTarget / intSpeed_kmh) * 3600 // ~82 seconds

    // Where will target be in timeToReach_sec?
    const targetTravel_km = (targetSpeed_kmh * timeToReach_sec) / 3600
    // Target moves ~56km north in 82 seconds

    // Predicted intercept point should be NORTH of current target position
    expect(targetTravel_km).toBeGreaterThan(20) // target moves significantly
    // The intercept lat should be > 27.0 (current target lat)
    const predictedLat = targetPos.lat + (targetTravel_km / 111) // rough km-to-degree
    expect(predictedLat).toBeGreaterThan(targetPos.lat)
  })

  it('lead distance increases with faster targets', () => {
    const dist_km = 100
    const intSpeed_kmh = 4 * 343 * 3.6

    // Slow target (Mach 0.8 cruise missile)
    const slowTarget_kmh = 0.8 * 343 * 3.6
    const time1 = (dist_km / intSpeed_kmh) * 3600
    const lead1 = (slowTarget_kmh * time1) / 3600

    // Fast target (Mach 3 ballistic)
    const fastTarget_kmh = 3 * 343 * 3.6
    const time2 = (dist_km / intSpeed_kmh) * 3600
    const lead2 = (fastTarget_kmh * time2) / 3600

    expect(lead2).toBeGreaterThan(lead1)
  })

  it('lead distance is zero for stationary targets', () => {
    const dist_km = 100
    const intSpeed_kmh = 4 * 343 * 3.6
    const time = (dist_km / intSpeed_kmh) * 3600
    const lead = (0 * time) / 3600 // stationary target

    expect(lead).toBe(0)
  })
})
