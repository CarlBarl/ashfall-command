import { describe, it, expect, beforeEach } from 'vitest'
import { useMapIntelStore } from '@/store/map-intel-store'
import type { TrackPoint } from '@/store/map-intel-store'
import type { ViewUnit } from '@/types/view'
import type { GameEvent } from '@/types/game'

function makeUnit(overrides: Partial<ViewUnit> & { id: string }): ViewUnit {
  return {
    name: 'Surface contact',
    nation: 'iran',
    category: 'ship',
    position: { lng: 52, lat: 26 },
    heading: 0,
    speed_kts: 12,
    status: 'moving',
    health: 100,
    maxHealth: 100,
    logistics: 100,
    supplyStocks: [],
    weapons: [],
    pointDefense: [],
    sensors: [],
    roe: 'weapons_tight',
    waypoints: [],
    subordinateIds: [],
    visibility: 'tracked',
    stale: false,
    ...overrides,
  }
}

function killed(unitId: string, tick: number): GameEvent {
  return { type: 'UNIT_DESTROYED', unitId, tick }
}

beforeEach(() => {
  useMapIntelStore.setState({ killMarkers: [], killSeenIds: {}, trackHistory: {} })
})

describe('kill markers', () => {
  it('appends a marker at the destroyed unit position', () => {
    const units = [makeUnit({ id: 'e1', position: { lng: 55, lat: 27 } })]
    useMapIntelStore.getState().ingestKillEvents([killed('e1', 100)], units, 5000)

    expect(useMapIntelStore.getState().killMarkers).toEqual([
      { id: 'e1', position: [55, 27], tick: 100, addedAtMs: 5000 },
    ])
  })

  it('does not duplicate markers when the cumulative event log is re-ingested', () => {
    const units = [makeUnit({ id: 'e1' })]
    const log = [killed('e1', 100)]
    useMapIntelStore.getState().ingestKillEvents(log, units, 5000)
    useMapIntelStore.getState().ingestKillEvents(log, units, 6000)
    useMapIntelStore.getState().ingestKillEvents([...log, killed('e1', 100)], units, 7000)

    expect(useMapIntelStore.getState().killMarkers).toHaveLength(1)
  })

  it('falls back to the last trail point when the unit is gone from the snapshot', () => {
    const trail: TrackPoint[] = [
      { position: [50, 25], tick: 10 },
      { position: [51, 25.5], tick: 40 },
    ]
    useMapIntelStore.setState({ trackHistory: { e2: trail } })
    useMapIntelStore.getState().ingestKillEvents([killed('e2', 60)], [], 5000)

    expect(useMapIntelStore.getState().killMarkers).toEqual([
      { id: 'e2', position: [51, 25.5], tick: 60, addedAtMs: 5000 },
    ])
  })

  it('skips units with no known position, permanently', () => {
    useMapIntelStore.getState().ingestKillEvents([killed('ghost', 10)], [], 5000)
    expect(useMapIntelStore.getState().killMarkers).toEqual([])

    // Once processed, a later snapshot containing the unit must not resurrect the event
    useMapIntelStore.getState().ingestKillEvents([killed('ghost', 10)], [makeUnit({ id: 'ghost' })], 6000)
    expect(useMapIntelStore.getState().killMarkers).toEqual([])
  })

  it('caps at 60 markers, dropping the oldest', () => {
    const units: ViewUnit[] = []
    const log: GameEvent[] = []
    for (let i = 0; i < 70; i++) {
      units.push(makeUnit({ id: `u${i}`, position: { lng: 50 + i * 0.1, lat: 26 } }))
      log.push(killed(`u${i}`, i))
    }
    useMapIntelStore.getState().ingestKillEvents(log, units, 5000)

    const markers = useMapIntelStore.getState().killMarkers
    expect(markers).toHaveLength(60)
    expect(markers[0].id).toBe('u10')
    expect(markers[59].id).toBe('u69')
  })

  it('clears markers when the event log resets (new game)', () => {
    useMapIntelStore.getState().ingestKillEvents([killed('e1', 1)], [makeUnit({ id: 'e1' })], 5000)
    expect(useMapIntelStore.getState().killMarkers).toHaveLength(1)

    useMapIntelStore.getState().ingestKillEvents([], [], 6000)
    expect(useMapIntelStore.getState().killMarkers).toEqual([])
    expect(useMapIntelStore.getState().killSeenIds).toEqual({})
  })
})

describe('track history sampling', () => {
  const sample = (units: ViewUnit[], tick: number) =>
    useMapIntelStore.getState().sampleTrackHistory(units, tick, 'usa')

  it('starts buffers for tracked/identified enemy contacts only', () => {
    sample([
      makeUnit({ id: 'e1', visibility: 'tracked' }),
      makeUnit({ id: 'e2', visibility: 'identified' }),
      makeUnit({ id: 'e3', visibility: 'detected' }),
      makeUnit({ id: 'own1', nation: 'usa' }),
      makeUnit({ id: 'dead1', status: 'destroyed' }),
    ], 0)

    expect(Object.keys(useMapIntelStore.getState().trackHistory).sort()).toEqual(['e1', 'e2'])
  })

  it('samples on the 30-tick cadence', () => {
    const unitAt = (lng: number) => [makeUnit({ id: 'e1', position: { lng, lat: 26 } })]
    sample(unitAt(50), 0)
    sample(unitAt(50.1), 10)
    sample(unitAt(50.2), 29)
    expect(useMapIntelStore.getState().trackHistory.e1).toHaveLength(1)

    sample(unitAt(50.3), 30)
    expect(useMapIntelStore.getState().trackHistory.e1).toEqual([
      { position: [50, 26], tick: 0 },
      { position: [50.3, 26], tick: 30 },
    ])
  })

  it('caps each buffer at 24 points, dropping the oldest', () => {
    for (let i = 0; i <= 40; i++) {
      sample([makeUnit({ id: 'e1', position: { lng: 50 + i, lat: 26 } })], i * 30)
    }
    const buf = useMapIntelStore.getState().trackHistory.e1
    expect(buf).toHaveLength(24)
    expect(buf[0].tick).toBe(17 * 30)
    expect(buf[23].tick).toBe(40 * 30)
  })

  it('clears the buffer when the contact disappears from the snapshot', () => {
    sample([makeUnit({ id: 'e1' })], 0)
    expect(useMapIntelStore.getState().trackHistory.e1).toBeDefined()

    sample([], 30)
    expect(useMapIntelStore.getState().trackHistory).toEqual({})
  })

  it('drops the buffer when the contact is destroyed', () => {
    sample([makeUnit({ id: 'e1' })], 0)
    sample([makeUnit({ id: 'e1', status: 'destroyed' })], 30)
    expect(useMapIntelStore.getState().trackHistory).toEqual({})
  })

  it('retains but does not extend the buffer while the contact is stale', () => {
    sample([makeUnit({ id: 'e1' })], 0)
    sample([makeUnit({ id: 'e1', stale: true })], 60)

    expect(useMapIntelStore.getState().trackHistory.e1).toHaveLength(1)

    // Track regained → sampling resumes
    sample([makeUnit({ id: 'e1' })], 90)
    expect(useMapIntelStore.getState().trackHistory.e1).toHaveLength(2)
  })

  it('resets the buffer when the tick regresses (new run)', () => {
    sample([makeUnit({ id: 'e1' })], 300)
    sample([makeUnit({ id: 'e1', position: { lng: 53, lat: 26.5 } })], 0)

    expect(useMapIntelStore.getState().trackHistory.e1).toEqual([
      { position: [53, 26.5], tick: 0 },
    ])
  })
})
