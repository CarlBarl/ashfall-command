import { describe, it, expect } from 'vitest'
import { haversine } from '../../utils/geo'
import { computeInterceptPoint } from '../combat'

/**
 * Tests for the quadratic intercept solver used by SAM/AD fire control.
 *
 * The solver finds the exact point where interceptor and target arrive
 * simultaneously, using the classic missile guidance quadratic equation:
 *   (St² - Si²)t² + 2(d·Vt)t + |d|² = 0
 */

describe('quadratic intercept solver', () => {
  const MACH = 343 * 3.6 // 1 Mach in km/h

  it('intercept point is ahead of target flying north', () => {
    const launcher = { lat: 26.0, lng: 52.0 }
    const target: [number, number] = [52.0, 27.0] // 111km north
    const heading = 0 // north
    const targetSpeed = 2 * MACH
    const intSpeed = 4 * MACH

    const result = computeInterceptPoint(launcher, target, heading, targetSpeed, intSpeed)
    expect(result).not.toBeNull()
    // Intercept point must be NORTH of current target position
    expect(result!.lat).toBeGreaterThan(27.0)
    expect(result!.timeToInterceptSec).toBeGreaterThan(0)
  })

  it('intercept point accounts for crossing geometry', () => {
    // Target flying east, launcher is south — intercept point should be NE of target
    const launcher = { lat: 26.0, lng: 52.0 }
    const target: [number, number] = [52.0, 27.0] // north of launcher
    const heading = 90 // east
    const targetSpeed = 2 * MACH
    const intSpeed = 4 * MACH

    const result = computeInterceptPoint(launcher, target, heading, targetSpeed, intSpeed)
    expect(result).not.toBeNull()
    // Intercept longitude should be east of current target position
    expect(result!.lng).toBeGreaterThan(52.0)
    expect(result!.timeToInterceptSec).toBeGreaterThan(0)
  })

  it('head-on geometry gives shorter intercept time', () => {
    const launcher = { lat: 26.0, lng: 52.0 }
    const target: [number, number] = [52.0, 27.0]
    const intSpeed = 4 * MACH
    const targetSpeed = 2 * MACH

    // Target flying south (toward launcher)
    const headOn = computeInterceptPoint(launcher, target, 180, targetSpeed, intSpeed)
    // Target flying north (away from launcher)
    const tailChase = computeInterceptPoint(launcher, target, 0, targetSpeed, intSpeed)

    expect(headOn).not.toBeNull()
    expect(tailChase).not.toBeNull()
    // Head-on closes faster than tail chase
    expect(headOn!.timeToInterceptSec).toBeLessThan(tailChase!.timeToInterceptSec)
  })

  it('returns null when target outruns interceptor directly away', () => {
    const launcher = { lat: 26.0, lng: 52.0 }
    const target: [number, number] = [52.0, 27.0]
    const heading = 0 // flying away (north)
    // Target faster than interceptor
    const result = computeInterceptPoint(launcher, target, heading, 6 * MACH, 3 * MACH)
    // Should be null — can't catch it
    expect(result).toBeNull()
  })

  it('stationary target: intercept point is at target position', () => {
    const launcher = { lat: 26.0, lng: 52.0 }
    const target: [number, number] = [52.0, 27.0]

    const result = computeInterceptPoint(launcher, target, 0, 0, 4 * MACH)
    expect(result).not.toBeNull()
    // Should be very close to target's current position
    expect(result!.lat).toBeCloseTo(27.0, 1)
    expect(result!.lng).toBeCloseTo(52.0, 1)
  })

  it('both arrive at intercept point at the same time (self-consistency)', () => {
    const launcher = { lat: 26.0, lng: 52.0 }
    const target: [number, number] = [52.0, 27.0]
    const heading = 45 // NE
    const targetSpeed = 2 * MACH
    const intSpeed = 4 * MACH

    const result = computeInterceptPoint(launcher, target, heading, targetSpeed, intSpeed)
    expect(result).not.toBeNull()

    // Distance interceptor travels = intSpeed * t
    const intDist = haversine(launcher, result!)
    const intTime = (intDist / intSpeed) * 3600

    // Distance target travels = targetSpeed * t
    const targetCurrent = { lat: target[1], lng: target[0] }
    const targetDist = haversine(targetCurrent, result!)
    const targetTime = (targetDist / targetSpeed) * 3600

    // Both should arrive at roughly the same time (within 10% — haversine vs flat-earth)
    expect(Math.abs(intTime - targetTime) / result!.timeToInterceptSec).toBeLessThan(0.10)
  })

  it('faster targets produce larger lead distances', () => {
    const launcher = { lat: 26.0, lng: 52.0 }
    const target: [number, number] = [52.0, 27.0]
    const intSpeed = 4 * MACH

    const slow = computeInterceptPoint(launcher, target, 0, 0.8 * MACH, intSpeed)
    const fast = computeInterceptPoint(launcher, target, 0, 3 * MACH, intSpeed)

    expect(slow).not.toBeNull()
    expect(fast).not.toBeNull()

    const slowLead = haversine({ lat: target[1], lng: target[0] }, slow!)
    const fastLead = haversine({ lat: target[1], lng: target[0] }, fast!)

    expect(fastLead).toBeGreaterThan(slowLead)
  })
})
