import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatsPanel, { computeNationStats } from '../StatsPanel'
import { useGameStore } from '@/store/game-store'
import type { GameEvent, Nation } from '@/types/game'
import type { GameViewState, ViewUnit } from '@/types/view'

function makeUnit(id: string, nation: string, overrides: Partial<ViewUnit> = {}): ViewUnit {
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
    visibility: 'identified',
    stale: false,
    ...overrides,
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

function setStore(units: ViewUnit[], eventLog: GameEvent[] = []) {
  const viewState: GameViewState = {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 0, timestamp: 0, speed: 0, tickIntervalMs: 100 },
    nations: [
      { id: 'usa', name: 'United States' } as Nation,
      { id: 'iran', name: 'Iran' } as Nation,
    ],
    units,
    missiles: [],
    supplyLines: [],
    shippingLanes: [],
    events: [],
    pendingEventCount: 0,
    satelliteDetectedUnitIds: [],
    warSupport: {},
    gameOver: null,
    objectives: [],
  }
  useGameStore.setState({ viewState, eventLog, visualTimestamp: 0, lastUpdateRealMs: 0, visualRate: 0 })
}

describe('StatsPanel under fog of war', () => {
  const offensive = { weaponId: 'tomahawk', count: 5, maxCount: 10, reloadTimeSec: 60 }
  const sam = { weaponId: 'pac3_mse', count: 8, maxCount: 16, reloadTimeSec: 60 }

  it('labels the enemy unit count as Contacts, own side stays Active', () => {
    setStore([
      makeUnit('usa_base', 'usa'),
      makeUnit('iran_c1', 'iran', { visibility: 'detected', stale: true }),
      makeUnit('iran_c2', 'iran', { visibility: 'tracked' }),
    ])
    render(<StatsPanel />)
    expect(screen.getByText('Active')).toBeTruthy()
    expect(screen.getByText('Contacts')).toBeTruthy()
    expect(screen.getByText(/EST\. ORBAT: 2 contacts/)).toBeTruthy()
  })

  it('replaces enemy inventory bars with the contact summary even when loadout data exists', () => {
    setStore([
      makeUnit('usa_base', 'usa', { weapons: [offensive, sam] }),
      makeUnit('iran_id', 'iran', { weapons: [offensive, sam] }),
    ])
    render(<StatsPanel />)
    expect(screen.getAllByText('Offensive Missiles')).toHaveLength(1)
    expect(screen.getAllByText('SAM Interceptors')).toHaveLength(1)
    expect(screen.getByText(/EST\. ORBAT: 1 contact/)).toBeTruthy()
  })

  it('keeps observed fired / shot-down counters for both sides', () => {
    setStore(
      [makeUnit('usa_base', 'usa'), makeUnit('iran_tel', 'iran', { visibility: 'tracked' })],
      [launched('iran_tel', 'usa_base', 1)],
    )
    render(<StatsPanel />)
    expect(screen.getAllByText('Fired (offensive)')).toHaveLength(2)
    expect(screen.getAllByText('Shot down (AD)')).toHaveLength(2)
  })
})
