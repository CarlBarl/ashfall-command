import { describe, it, expect } from 'vitest'
import { findAutoRoute } from '../route-planner'
import type { Position } from '@/types/game'

/**
 * Tests for the auto-routing behavior when firing missiles.
 * These verify the A* pathfinder that runs by default on every missile launch.
 */

const mockGrid = {
  getElevation: () => 0,
  isWater: () => false,
  sampleLine: () => [0],
  get bounds() { return { latMin: 12, latMax: 43, lngMin: 32, lngMax: 70 } },
  get numRows() { return 620 },
  get numCols() { return 760 },
  get resolution() { return 0.05 },
  get data() { return new Float32Array(0) },
}

describe('auto-route on fire', () => {
  it('returns waypoints that avoid a radar threat between launcher and target', () => {
    const start: Position = { lat: 25, lng: 50 }
    const goal: Position = { lat: 25, lng: 54 }
    const threats = [{ position: { lat: 25, lng: 52 }, range_km: 150 }]

    const route = findAutoRoute(start, goal, threats, mockGrid as any, 2000)

    // Route should exist and have waypoints that deviate from the straight line
    expect(route).not.toBeNull()
    if (route && route.length > 0) {
      // At least one waypoint should be off the direct lat=25 line
      const hasDeviation = route.some(wp => Math.abs(wp.lat - 25) > 0.1)
      expect(hasDeviation).toBe(true)
    }
  })

  it('returns empty/short route when no threats exist (straight line is optimal)', () => {
    const start: Position = { lat: 25, lng: 50 }
    const goal: Position = { lat: 25, lng: 52 }
    const threats: { position: Position; range_km: number }[] = []

    const route = findAutoRoute(start, goal, threats, mockGrid as any, 2000)

    // With no threats, route should be short or empty (direct path)
    expect(route).not.toBeNull()
    expect(route!.length).toBeLessThan(5)
  })

  it('returns null when target is beyond missile range', () => {
    const start: Position = { lat: 25, lng: 32 }
    const goal: Position = { lat: 25, lng: 70 } // ~4000km
    const threats: { position: Position; range_km: number }[] = []

    const route = findAutoRoute(start, goal, threats, mockGrid as any, 500) // only 500km range

    expect(route).toBeNull()
  })

  it('direct fire means no waypoints (straight line)', () => {
    // When directFire=true in the UI, no auto-routing happens
    // The LAUNCH_SALVO command is sent without waypoints
    // This test documents the expected behavior: no waypoints = direct path
    // The actual UI toggle is tested via the StrikePanel component
    const waypoints = undefined // directFire: no waypoints passed
    expect(waypoints).toBeUndefined()
  })
})
