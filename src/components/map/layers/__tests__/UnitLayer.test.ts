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
