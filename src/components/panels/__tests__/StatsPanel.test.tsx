import { describe, it, expect } from 'vitest'
import { computeNationStats } from '../StatsPanel'
import type { GameEvent } from '@/types/game'
import type { ViewUnit } from '@/types/view'

function makeUnit(id: string, nation: string): ViewUnit {
  return {
    id,
    name: id,
    nation,
    category: 'missile_battery',
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
    roe: 'weapons_free',
    waypoints: [],
    subordinateIds: [],
  } as ViewUnit
}

function launched(launcherId: string, targetId: string, tick: number): GameEvent {
  return { type: 'MISSILE_LAUNCHED', missileId: `m_${tick}`, launcherId, targetId, weaponName: 'test', tick }
}

function intercepted(interceptorId: string, tick: number): GameEvent {
  return { type: 'MISSILE_INTERCEPTED', missileId: `m_${tick}`, interceptorId, position: { lat: 26, lng: 56 }, tick }
}

describe('computeNationStats interception rate', () => {
  const units = [makeUnit('usa_sam', 'usa'), makeUnit('usa_base', 'usa'), makeUnit('iran_tel', 'iran')]
  const events: GameEvent[] = [
    launched('iran_tel', 'usa_base', 1),
    launched('iran_tel', 'usa_base', 2),
    launched('iran_tel', 'usa_base', 3),
    launched('iran_tel', 'usa_sam', 4),
    launched('usa_base', 'iran_tel', 5),
    launched('usa_base', 'iran_tel', 6),
    intercepted('usa_sam', 7),
    intercepted('usa_sam', 8),
    intercepted('usa_sam', 9),
  ]

  it('counts incoming shots separately from own offensive launches', () => {
    const usa = computeNationStats(units, events, 'usa')
    expect(usa.missilesLaunched).toBe(2)
    expect(usa.missilesIncoming).toBe(4)
    expect(usa.missilesIntercepted).toBe(3)
  })

  it('keeps intercepts bounded by incoming shots (rate cannot exceed 100%)', () => {
    // Regression: rate was intercepted/ownLaunches → 3/2 = 150% for the USA here
    const usa = computeNationStats(units, events, 'usa')
    expect(usa.missilesIntercepted).toBeLessThanOrEqual(usa.missilesIncoming)
    expect(Math.round((usa.missilesIntercepted / usa.missilesIncoming) * 100)).toBe(75)
  })

  it('mirrors the totals for the opposing nation', () => {
    const iran = computeNationStats(units, events, 'iran')
    expect(iran.missilesLaunched).toBe(4)
    expect(iran.missilesIncoming).toBe(2)
    expect(iran.missilesIntercepted).toBe(0)
  })
})
