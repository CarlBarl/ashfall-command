import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useUIStore } from '@/store/ui-store'
import { useMapIntelStore } from '@/store/map-intel-store'
import type { ViewUnit } from '@/types/view'

/**
 * Tests for map toggle behavior — written BEFORE implementation (TDD).
 */

describe('MapToggle sub-menu behavior', () => {
  beforeEach(() => {
    useUIStore.setState({
      losFilter: 'off',
      showIntelCoverage: false,
    })
  })

  it('losFilter supports friendly/enemy/both independently (not cycling)', () => {
    // User should be able to set losFilter directly, not just cycle
    useUIStore.setState({ losFilter: 'enemy' })
    expect(useUIStore.getState().losFilter).toBe('enemy')

    useUIStore.setState({ losFilter: 'friendly' })
    expect(useUIStore.getState().losFilter).toBe('friendly')

    useUIStore.setState({ losFilter: 'both' })
    expect(useUIStore.getState().losFilter).toBe('both')
  })

  it('losFilter can be turned off directly', () => {
    useUIStore.setState({ losFilter: 'both' })
    useUIStore.setState({ losFilter: 'off' })
    expect(useUIStore.getState().losFilter).toBe('off')
  })
})

function mkUnit(id: string, nation: string, stale: boolean, status = 'ready'): ViewUnit {
  return { id, nation, stale, status } as unknown as ViewUnit
}

describe('map-intel-store toggles', () => {
  beforeEach(() => {
    useMapIntelStore.getState().setAdsbLive(false)
    useMapIntelStore.setState({ intelOverlays: false, reconMosaic: false, staleSince: {}, adsbAircraft: [] })
  })

  afterEach(() => {
    useMapIntelStore.getState().setAdsbLive(false)
    vi.unstubAllGlobals()
  })

  it('defaults: all layers off', () => {
    const s = useMapIntelStore.getState()
    expect(s.intelOverlays).toBe(false)
    expect(s.reconMosaic).toBe(false)
    expect(s.adsbLive).toBe(false)
    expect(s.adsbAircraft).toEqual([])
  })

  it('intel overlays and recon mosaic toggle independently', () => {
    useMapIntelStore.getState().toggleIntelOverlays()
    expect(useMapIntelStore.getState().intelOverlays).toBe(true)
    expect(useMapIntelStore.getState().reconMosaic).toBe(false)

    useMapIntelStore.getState().toggleReconMosaic()
    expect(useMapIntelStore.getState().reconMosaic).toBe(true)

    useMapIntelStore.getState().toggleIntelOverlays()
    expect(useMapIntelStore.getState().intelOverlays).toBe(false)
    expect(useMapIntelStore.getState().reconMosaic).toBe(true)
  })

  it('ADS-B on: fetches aircraft, caps at 80, trims callsigns', async () => {
    const ac = Array.from({ length: 100 }, (_, i) => ({
      hex: `hex${i}`,
      flight: `GULF${i}  `,
      lat: 26 + i * 0.01,
      lon: 54,
      track: 90,
    }))
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ac }),
    })))

    useMapIntelStore.getState().setAdsbLive(true)
    await vi.waitFor(() => {
      expect(useMapIntelStore.getState().adsbAircraft.length).toBe(80)
    })
    expect(useMapIntelStore.getState().adsbAircraft[0]).toEqual({
      id: 'hex0',
      callsign: 'GULF0',
      lat: 26,
      lon: 54,
      track: 90,
    })
  })

  it('ADS-B skips aircraft without a usable position', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ac: [
          { hex: 'nopos', flight: 'GHOST1' },
          { hex: 'good', flight: 'REAL1', lat: 26.5, lon: 54.2 },
          { hex: 'lastpos', lastPosition: { lat: 27.1, lon: 53.9 } },
        ],
      }),
    })))

    useMapIntelStore.getState().setAdsbLive(true)
    await vi.waitFor(() => {
      expect(useMapIntelStore.getState().adsbAircraft.length).toBe(2)
    })
    const ids = useMapIntelStore.getState().adsbAircraft.map(a => a.id)
    expect(ids).toEqual(['good', 'lastpos'])
    expect(useMapIntelStore.getState().adsbAircraft[1].track).toBeNull()
  })

  it('ADS-B fetch failure is silent and leaves no aircraft', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    useMapIntelStore.getState().setAdsbLive(true)
    await new Promise(r => setTimeout(r, 10))
    expect(useMapIntelStore.getState().adsbLive).toBe(true)
    expect(useMapIntelStore.getState().adsbAircraft).toEqual([])
  })

  it('ADS-B off clears aircraft', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ac: [{ hex: 'a1', flight: 'X', lat: 26, lon: 54, track: 10 }] }),
    })))
    useMapIntelStore.getState().setAdsbLive(true)
    await vi.waitFor(() => {
      expect(useMapIntelStore.getState().adsbAircraft.length).toBe(1)
    })
    useMapIntelStore.getState().setAdsbLive(false)
    expect(useMapIntelStore.getState().adsbAircraft).toEqual([])
    expect(useMapIntelStore.getState().adsbLive).toBe(false)
  })
})

describe('map-intel-store stale-since bookkeeping', () => {
  beforeEach(() => {
    useMapIntelStore.setState({ staleSince: {} })
  })

  it('anchors a stale enemy contact at the tick it first went stale', () => {
    const sync = useMapIntelStore.getState().syncStaleContacts
    sync([mkUnit('e1', 'iran', true)], 100, 'usa')
    expect(useMapIntelStore.getState().staleSince).toEqual({ e1: 100 })

    // Still stale later → anchor preserved, not re-stamped
    sync([mkUnit('e1', 'iran', true)], 500, 'usa')
    expect(useMapIntelStore.getState().staleSince).toEqual({ e1: 100 })
  })

  it('clears the anchor when the contact refreshes or disappears', () => {
    const sync = useMapIntelStore.getState().syncStaleContacts
    sync([mkUnit('e1', 'iran', true), mkUnit('e2', 'iran', true)], 100, 'usa')
    expect(Object.keys(useMapIntelStore.getState().staleSince)).toHaveLength(2)

    // e1 refreshes (stale=false), e2 disappears entirely
    sync([mkUnit('e1', 'iran', false)], 200, 'usa')
    expect(useMapIntelStore.getState().staleSince).toEqual({})

    // Going stale again re-anchors at the new tick
    sync([mkUnit('e1', 'iran', true)], 300, 'usa')
    expect(useMapIntelStore.getState().staleSince).toEqual({ e1: 300 })
  })

  it('ignores own-nation and destroyed units', () => {
    const sync = useMapIntelStore.getState().syncStaleContacts
    sync([
      mkUnit('own1', 'usa', true),
      mkUnit('dead1', 'iran', true, 'destroyed'),
      mkUnit('e1', 'iran', true),
    ], 50, 'usa')
    expect(useMapIntelStore.getState().staleSince).toEqual({ e1: 50 })
  })
})
