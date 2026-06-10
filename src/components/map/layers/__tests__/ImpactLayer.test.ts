import { describe, it, expect } from 'vitest'
import { createImpactLayers } from '../ImpactLayer'
import type { GameEvent } from '@/types/game'
import type { ViewUnit } from '@/types/view'

const target = {
  id: 'tgt1',
  name: 'Target',
  nation: 'iran',
  category: 'sam_site',
  position: { lat: 27, lng: 52 },
  heading: 0,
  speed_kts: 0,
  status: 'damaged',
  health: 50,
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
} as ViewUnit

function impactAt(tick: number): GameEvent {
  return { type: 'MISSILE_IMPACT', missileId: `m_${tick}`, targetId: 'tgt1', damage: 40, tick }
}

describe('createImpactLayers event windows', () => {
  it('shows recent impacts and hides expired ones', () => {
    const [impactLayer] = createImpactLayers([impactAt(80), impactAt(40)], [target], 100)
    const data = impactLayer.props.data as { tick: number }[]
    expect(data.map(d => d.tick)).toEqual([80])
  })

  it('ignores future-tick events (stale log after loading an earlier save)', () => {
    const [impactLayer, interceptLayer] = createImpactLayers(
      [
        impactAt(500),
        { type: 'MISSILE_INTERCEPTED', missileId: 'm_x', interceptorId: 'sam1', position: { lat: 27, lng: 52 }, tick: 500 },
      ],
      [target],
      100,
    )
    expect(impactLayer.props.data).toEqual([])
    expect(interceptLayer.props.data).toEqual([])
  })

  it('keeps impact markers visible at theater zoom via a pixel floor', () => {
    const [impactLayer] = createImpactLayers([impactAt(95)], [target], 100)
    expect(impactLayer.props.radiusMinPixels).toBeGreaterThanOrEqual(4)
  })
})
