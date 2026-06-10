import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import AlertFeed from '../AlertFeed'
import { useGameStore } from '@/store/game-store'
import type { GameViewState, ViewUnit } from '@/types/view'
import type { GameEvent } from '@/types/game'

const lincoln = {
  id: 'cvn72_lincoln',
  name: 'CVN-72 Abraham Lincoln',
  nation: 'usa',
  category: 'carrier_group',
  position: { lat: 25, lng: 55 },
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
} as ViewUnit

function makeViewState(events: GameEvent[]): GameViewState {
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 10, timestamp: 1_000_000, speed: 1, tickIntervalMs: 100 },
    nations: [],
    units: [lincoln],
    missiles: [],
    supplyLines: [],
    shippingLanes: [],
    events,
    pendingEventCount: 0,
    satelliteDetectedUnitIds: [],
    warSupport: {},
    gameOver: null,
    objectives: [],
  }
}

const destroyed: GameEvent = { type: 'UNIT_DESTROYED', unitId: 'cvn72_lincoln', tick: 1 }
const impact: GameEvent = { type: 'MISSILE_IMPACT', missileId: 'm_504', targetId: 'cvn72_lincoln', damage: 40, tick: 2 }
const intercept: GameEvent = { type: 'MISSILE_INTERCEPTED', missileId: 'm_504', interceptorId: 'cvn72_lincoln', position: { lat: 25, lng: 55 }, tick: 3 }
const resupplied: GameEvent = { type: 'RESUPPLIED', unitId: 'cvn72_lincoln', weaponId: 'sm3_iia', count: 1, fromBaseId: 'base1', tick: 4 }

function setStore(eventLog: GameEvent[], currentBatch: GameEvent[] = []) {
  useGameStore.setState({
    viewState: makeViewState(currentBatch),
    eventLog,
    visualTimestamp: 1_000_000,
    lastUpdateRealMs: 0,
    visualRate: 0,
  })
}

beforeAll(() => {
  // jsdom has no Element.scrollTo (used by the feed's auto-scroll effect)
  Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => {})
})

beforeEach(() => {
  setStore([])
})

describe('AlertFeed', () => {
  it('shows history from the persistent store log on mount (mobile LOG tab)', () => {
    setStore([destroyed])
    render(<AlertFeed />)
    expect(screen.getByText(/DESTROYED CVN-72 Abraham Lincoln/)).toBeTruthy()
  })

  it('renders human names instead of raw internal ids', () => {
    setStore([intercept])
    render(<AlertFeed />)
    expect(screen.getByText(/INTERCEPT by CVN-72 Abraham Lincoln/)).toBeTruthy()
    expect(screen.queryByText(/m_504/)).toBeNull()
  })

  it('filters RESUPPLIED noise out of the feed', () => {
    setStore([resupplied])
    const { container } = render(<AlertFeed />)
    expect(container.firstChild).toBeNull()
  })

  it('does not duplicate entries or unread counts when toggling expand/collapse within one batch', () => {
    render(<AlertFeed />)
    act(() => {
      setStore([destroyed, impact], [destroyed, impact])
    })

    // Batch arrived while collapsed → unread badge shows 2
    expect(screen.getByText('2')).toBeTruthy()

    fireEvent.click(screen.getByText('EVENTS'))
    expect(screen.getByText('Events (2)')).toBeTruthy()
    expect(screen.getAllByText(/DESTROYED/)).toHaveLength(1)

    // Collapse and re-expand with the same batch still current
    fireEvent.click(screen.getByText('▲'))
    expect(screen.queryByText('2')).toBeNull()

    fireEvent.click(screen.getByText('EVENTS'))
    expect(screen.getByText('Events (2)')).toBeTruthy()
    expect(screen.getAllByText(/DESTROYED/)).toHaveLength(1)
  })

  it('formats SUPPLY_LINE_CUT instead of dumping the raw type', () => {
    const cut: GameEvent = { type: 'SUPPLY_LINE_CUT', lineId: 'bandar_supply', tick: 7 }
    setStore([cut])
    render(<AlertFeed />)
    expect(screen.getByText(/SUPPLY CUT: BANDAR SUPPLY/)).toBeTruthy()
  })
})
