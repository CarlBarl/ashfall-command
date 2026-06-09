import { describe, it, expect, beforeAll, vi } from 'vitest'
import { ensureMainThreadGrid, computeLOSPolygon, getLOSPolygon, getMainThreadGrid } from '../LOSLayer'

/** 20x20 flat sea-level grid: lat 20-30, lng 40-50, 0.5 deg resolution */
function makeElevationBuffer(): ArrayBuffer {
  const rows = 20
  const cols = 20
  const buf = new ArrayBuffer(20 + rows * cols * 4)
  const header = new Float32Array(buf, 0, 5)
  header[0] = 20 // latMin
  header[1] = 30 // latMax
  header[2] = 40 // lngMin
  header[3] = 50 // lngMax
  header[4] = 0.5 // resolution
  return buf
}

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => makeElevationBuffer(),
  })))
  await ensureMainThreadGrid()
})

describe('getLOSPolygon per-unit cache', () => {
  const posA = { lat: 25, lng: 45 }
  const posB = { lat: 26, lng: 46 }

  it('caches polygons per unit — sibling units do not evict each other', () => {
    const a1 = getLOSPolygon('unit_a', posA, 50, 15, 0, 360)
    const b1 = getLOSPolygon('unit_b', posB, 50, 15, 0, 360)
    const a2 = getLOSPolygon('unit_a', posA, 50, 15, 0, 360)
    const b2 = getLOSPolygon('unit_b', posB, 50, 15, 0, 360)

    expect(a1).not.toBeNull()
    expect(b1).not.toBeNull()
    expect(a2).toBe(a1)
    expect(b2).toBe(b1)
  })

  it('recomputes when a unit moves meaningfully', () => {
    const before = getLOSPolygon('mover', posA, 50, 15, 0, 360)
    const after = getLOSPolygon('mover', { lat: 25.5, lng: 45 }, 50, 15, 0, 360)
    expect(after).not.toBe(before)
  })

  it('ignores sub-quantum float jitter in position', () => {
    const before = getLOSPolygon('jitter', posA, 50, 15, 0, 360)
    const after = getLOSPolygon('jitter', { lat: 25.0001, lng: 45.0001 }, 50, 15, 0, 360)
    expect(after).toBe(before)
  })

  it('ignores heading changes for omnidirectional radars', () => {
    const before = getLOSPolygon('omni', posA, 50, 15, 0, 360)
    const after = getLOSPolygon('omni', posA, 50, 15, 137, 360)
    expect(after).toBe(before)
  })

  it('recomputes when a sector radar rotates', () => {
    const before = getLOSPolygon('sector', posA, 50, 15, 0, 90)
    const after = getLOSPolygon('sector', posA, 50, 15, 90, 90)
    expect(after).not.toBe(before)
  })
})

describe('computeLOSPolygon geometry', () => {
  it('produces a closed ring reaching full range over flat terrain', () => {
    const grid = getMainThreadGrid()!
    const poly = computeLOSPolygon({
      position: { lat: 25, lng: 45 },
      radarRange_km: 100,
      antennaHeight_m: 15,
      elevationGrid: grid,
      heading: 0,
      sectorDeg: 360,
    })

    const ring = poly.geometry.coordinates[0]
    expect(ring[0]).toEqual(ring[ring.length - 1])

    // Over a flat sea grid every ray should reach ~full range (here: due north)
    const northPoint = ring[0]
    const distKm = (northPoint[1] - 25) * 110.574
    expect(distKm).toBeGreaterThan(95)
    expect(distKm).toBeLessThanOrEqual(101)
  })
})
