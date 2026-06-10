import { describe, it, expect } from 'vitest'
import { createUnitLayer, createSatelliteDetectionLayer } from '../UnitLayer'
import type { ViewUnit } from '@/types/view'

function makeUnit(overrides: Partial<ViewUnit>): ViewUnit {
  return {
    id: 'u1',
    name: 'Test Unit',
    nation: 'iran',
    category: 'ship',
    position: { lat: 26, lng: 56 },
    heading: 0,
    speed_kts: 0,
    status: 'ready',
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
    visibility: 'identified',
    stale: false,
    ...overrides,
  }
}

const noop = () => {}

function layerById(layers: { id: string; props: { data: unknown } }[], id: string) {
  return layers.find(l => l.id === id)!
}

describe('createUnitLayer minefield handling', () => {
  const ship = makeUnit({ id: 'ship1', category: 'ship', position: { lat: 26, lng: 56 } })
  const minefield = makeUnit({ id: 'mine1', category: 'minefield', position: { lat: 26.05, lng: 56.05 } })

  it('keeps minefields out of the icon layer (no glyph in the atlas)', () => {
    const layers = createUnitLayer([ship, minefield], null, null, null, false, noop, noop, noop, null, 4)
    const iconData = layerById(layers, 'unit-layer').props.data as { id: string }[]
    expect(iconData.map(d => d.id)).toEqual(['ship1'])
  })

  it('keeps minefields clickable via the pick layer', () => {
    const layers = createUnitLayer([ship, minefield], null, null, null, false, noop, noop, noop, null, 4)
    const pickData = layerById(layers, 'unit-pick-layer').props.data as { id: string }[]
    expect(pickData.map(d => d.id)).toContain('mine1')
  })

  it('does not absorb minefields into nearby clusters', () => {
    const ship2 = makeUnit({ id: 'ship2', category: 'ship', position: { lat: 26.01, lng: 56.01 } })
    const layers = createUnitLayer([ship, ship2, minefield], null, null, null, false, noop, noop, noop, null, 4)
    const iconData = layerById(layers, 'unit-layer').props.data as { id: string; count: number }[]
    const cluster = iconData.find(d => d.id.startsWith('cluster_'))
    expect(cluster?.count).toBe(2)
  })

  it('excludes destroyed minefields from the pick layer', () => {
    const dead = makeUnit({ id: 'mine_dead', category: 'minefield', status: 'destroyed' })
    const layers = createUnitLayer([ship, dead], null, null, null, false, noop, noop, noop, null, 4)
    const pickData = layerById(layers, 'unit-pick-layer').props.data as { id: string }[]
    expect(pickData.map(d => d.id)).not.toContain('mine_dead')
  })
})

type Datum = { id: string; isCluster: boolean }
type ColorFn = (d: Datum) => [number, number, number, number]

function colorOf(layers: { id: string; props: { data: unknown } }[], id: string) {
  const layer = layerById(layers, 'unit-layer') as unknown as { props: { data: Datum[]; getColor: ColorFn } }
  const datum = layer.props.data.find(d => d.id === id)!
  return layer.props.getColor(datum)
}

describe('fog of war rendering', () => {
  const identified = makeUnit({ id: 'id1', visibility: 'identified', position: { lat: 20, lng: 50 } })
  const tracked = makeUnit({ id: 'tr1', visibility: 'tracked', position: { lat: 28, lng: 58 } })
  const detected = makeUnit({ id: 'de1', visibility: 'detected', position: { lat: 24, lng: 54 } })
  const staleDetected = makeUnit({ id: 'de2', visibility: 'detected', stale: true, position: { lat: 22, lng: 52 } })
  const all = [identified, tracked, detected, staleDetected]

  it('renders alpha buckets per visibility level', () => {
    const layers = createUnitLayer(all, null, null, null, false, noop, noop, noop, null, 10)
    expect(colorOf(layers, 'id1')[3]).toBe(255)
    expect(colorOf(layers, 'tr1')[3]).toBe(204)
    expect(colorOf(layers, 'de1')[3]).toBe(191)
    expect(colorOf(layers, 'de2')[3]).toBe(140)
  })

  it('desaturates detected contacts toward gray', () => {
    const layers = createUnitLayer(all, null, null, null, false, noop, noop, noop, null, 10)
    const [r, g] = colorOf(layers, 'de1')
    const [baseR, baseG] = colorOf(layers, 'id1')
    expect(r).toBeLessThan(baseR)
    expect(g).toBeGreaterThan(baseG)
    expect(r - g).toBeLessThan(baseR - baseG)
  })

  it('marks detected contacts with a ? badge and a contact ring', () => {
    const layers = createUnitLayer(all, null, null, null, false, noop, noop, noop, null, 10)
    const badge = layerById(layers, 'contact-badges') as unknown as { props: { data: Datum[]; getText: (d: Datum) => string } }
    expect(badge.props.data.map(d => d.id).sort()).toEqual(['de1', 'de2'])
    expect(badge.props.getText(badge.props.data[0])).toBe('?')
    const ring = layerById(layers, 'contact-rings')
    expect((ring.props.data as Datum[]).map(d => d.id).sort()).toEqual(['de1', 'de2'])
  })

  it('shows ? instead of an exact count on detected-only clusters', () => {
    const d1 = makeUnit({ id: 'cd1', visibility: 'detected', position: { lat: 26, lng: 56 } })
    const d2 = makeUnit({ id: 'cd2', visibility: 'detected', position: { lat: 26.05, lng: 56.05 } })
    const layers = createUnitLayer([d1, d2], null, null, null, false, noop, noop, noop, null, 6)
    const badge = layerById(layers, 'cluster-badges') as unknown as { props: { data: Datum[]; getText: (d: Datum) => string } }
    expect(badge.props.data).toHaveLength(1)
    expect(badge.props.getText(badge.props.data[0])).toBe('?')
    const labels = layerById(layers, 'unit-labels') as unknown as { props: { data: Datum[]; getText: (d: Datum) => string } }
    const clusterLabel = labels.props.data.find(d => d.isCluster)!
    expect(labels.props.getText(clusterLabel)).toContain('[?]')
  })

  it('keeps exact counts on clusters containing tracked units', () => {
    const d1 = makeUnit({ id: 'cd1', visibility: 'detected', position: { lat: 26, lng: 56 } })
    const t1 = makeUnit({ id: 'ct1', visibility: 'tracked', position: { lat: 26.05, lng: 56.05 } })
    const layers = createUnitLayer([d1, t1], null, null, null, false, noop, noop, noop, null, 6)
    const badge = layerById(layers, 'cluster-badges') as unknown as { props: { data: Datum[]; getText: (d: Datum) => string } }
    expect(badge.props.data).toHaveLength(1)
    expect(badge.props.getText(badge.props.data[0])).toBe('2')
  })

  it('keeps detected contacts targetable in targeting mode', () => {
    let targeted: string | null = null
    const layers = createUnitLayer(
      [detected], null, null, null, true, noop, noop, (id) => { targeted = id }, 'usa', 10,
    )
    expect(colorOf(layers, 'de1')).toEqual([255, 80, 80, 255])
    const icon = layerById(layers, 'unit-layer') as unknown as { props: { data: Datum[]; onClick: (info: { object: Datum }) => void } }
    icon.props.onClick({ object: icon.props.data[0] })
    expect(targeted).toBe('de1')
  })
})

describe('createSatelliteDetectionLayer', () => {
  it('renders rings only for detected, non-destroyed units', () => {
    const a = makeUnit({ id: 'a' })
    const b = makeUnit({ id: 'b' })
    const dead = makeUnit({ id: 'dead', status: 'destroyed' })
    const layer = createSatelliteDetectionLayer([a, b, dead], ['a', 'dead', 'missing'])
    const data = layer.props.data as ViewUnit[]
    expect(data.map(d => d.id)).toEqual(['a'])
  })

  it('renders nothing when there are no detections', () => {
    const layer = createSatelliteDetectionLayer([makeUnit({ id: 'a' })], [])
    expect(layer.props.data).toEqual([])
  })
})
