import { describe, it, expect } from 'vitest'
import { haversine, bearing, destination, greatCirclePath, ktsToKmh, machToKmh } from '../geo'

// ── Tests ───────────────────────────────────────────────────────

describe('haversine', () => {
  it('returns 0 for identical points', () => {
    const p = { lat: 25, lng: 51 }
    expect(haversine(p, p)).toBe(0)
  })

  it('calculates known distance: London to Paris (~343 km)', () => {
    const london = { lat: 51.5074, lng: -0.1278 }
    const paris = { lat: 48.8566, lng: 2.3522 }
    const dist = haversine(london, paris)
    // Accepted range: 340-350 km
    expect(dist).toBeGreaterThan(340)
    expect(dist).toBeLessThan(350)
  })

  it('calculates known distance: New York to Los Angeles (~3940 km)', () => {
    const ny = { lat: 40.7128, lng: -74.0060 }
    const la = { lat: 34.0522, lng: -118.2437 }
    const dist = haversine(ny, la)
    // Accepted range: 3930-3960 km
    expect(dist).toBeGreaterThan(3930)
    expect(dist).toBeLessThan(3960)
  })

  it('is symmetric: haversine(a, b) === haversine(b, a)', () => {
    const a = { lat: 25, lng: 51 }
    const b = { lat: 30, lng: 55 }
    expect(haversine(a, b)).toBeCloseTo(haversine(b, a), 10)
  })

  it('handles equatorial distance correctly', () => {
    // 1 degree of longitude at equator ≈ 111.32 km
    const a = { lat: 0, lng: 0 }
    const b = { lat: 0, lng: 1 }
    const dist = haversine(a, b)
    expect(dist).toBeGreaterThan(110)
    expect(dist).toBeLessThan(112)
  })
})

describe('bearing', () => {
  it('returns ~0 for due north', () => {
    const a = { lat: 25, lng: 51 }
    const b = { lat: 26, lng: 51 }
    const brg = bearing(a, b)
    expect(brg).toBeCloseTo(0, 0)
  })

  it('returns ~90 for due east', () => {
    const a = { lat: 0, lng: 0 }
    const b = { lat: 0, lng: 1 }
    const brg = bearing(a, b)
    expect(brg).toBeCloseTo(90, 0)
  })

  it('returns ~180 for due south', () => {
    const a = { lat: 26, lng: 51 }
    const b = { lat: 25, lng: 51 }
    const brg = bearing(a, b)
    expect(brg).toBeCloseTo(180, 0)
  })

  it('returns ~270 for due west', () => {
    const a = { lat: 0, lng: 1 }
    const b = { lat: 0, lng: 0 }
    const brg = bearing(a, b)
    expect(brg).toBeCloseTo(270, 0)
  })

  it('returns a value in [0, 360)', () => {
    const a = { lat: 25, lng: 51 }
    const b = { lat: 30, lng: 40 }
    const brg = bearing(a, b)
    expect(brg).toBeGreaterThanOrEqual(0)
    expect(brg).toBeLessThan(360)
  })
})

describe('destination', () => {
  it('going north increases latitude', () => {
    const start = { lat: 25, lng: 51 }
    const dest = destination(start, 0, 100)
    expect(dest.lat).toBeGreaterThan(start.lat)
    // Longitude should stay roughly the same
    expect(dest.lng).toBeCloseTo(start.lng, 1)
  })

  it('going east increases longitude', () => {
    const start = { lat: 0, lng: 51 }
    const dest = destination(start, 90, 100)
    expect(dest.lng).toBeGreaterThan(start.lng)
    // Latitude should stay roughly the same
    expect(dest.lat).toBeCloseTo(start.lat, 1)
  })

  it('round-trip: bearing + distance recovers approximate destination', () => {
    const a = { lat: 25, lng: 51 }
    const b = { lat: 26, lng: 52 }
    const brg = bearing(a, b)
    const dist = haversine(a, b)
    const recovered = destination(a, brg, dist)
    expect(recovered.lat).toBeCloseTo(b.lat, 1)
    expect(recovered.lng).toBeCloseTo(b.lng, 1)
  })

  it('distance 0 returns the same point', () => {
    const start = { lat: 35, lng: 55 }
    const dest = destination(start, 45, 0)
    expect(dest.lat).toBeCloseTo(start.lat, 10)
    expect(dest.lng).toBeCloseTo(start.lng, 10)
  })
})

describe('greatCirclePath', () => {
  it('returns numPoints + 1 points (inclusive of start and end)', () => {
    const a = { lat: 25, lng: 51 }
    const b = { lat: 30, lng: 55 }
    const points = greatCirclePath(a, b, 10)
    expect(points).toHaveLength(11) // 0..10 inclusive
  })

  it('first point is near start, last point is near end', () => {
    const a = { lat: 25, lng: 51 }
    const b = { lat: 30, lng: 55 }
    const points = greatCirclePath(a, b, 10)
    // Points are [lng, lat] format
    expect(points[0][0]).toBeCloseTo(a.lng, 1)
    expect(points[0][1]).toBeCloseTo(a.lat, 1)
    expect(points[points.length - 1][0]).toBeCloseTo(b.lng, 1)
    expect(points[points.length - 1][1]).toBeCloseTo(b.lat, 1)
  })
})

describe('unit conversions', () => {
  it('ktsToKmh converts knots to km/h', () => {
    // 1 knot = 1.852 km/h
    expect(ktsToKmh(1)).toBeCloseTo(1.852)
    expect(ktsToKmh(100)).toBeCloseTo(185.2)
    expect(ktsToKmh(0)).toBe(0)
  })

  it('machToKmh converts Mach to km/h at sea level', () => {
    // Mach 1 at sea level ≈ 1235 km/h
    expect(machToKmh(1)).toBeCloseTo(1235)
    expect(machToKmh(2)).toBeCloseTo(2470)
    expect(machToKmh(0)).toBe(0)
  })
})
