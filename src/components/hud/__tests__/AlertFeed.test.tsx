import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import AlertFeed from '../AlertFeed'
import { useGameStore } from '@/store/game-store'
import { useUIStore } from '@/store/ui-store'
import { sendCommand } from '@/store/bridge'
import { shippingLanes } from '@/data/shipping/shipping-lanes'
import type { GameViewState, ViewUnit } from '@/types/view'
import type { GameEvent, ShippingLane } from '@/types/game'

vi.mock('@/store/bridge', () => ({
  sendCommand: vi.fn(),
}))

const sendCommandMock = vi.mocked(sendCommand)

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

const jamaran: ViewUnit = {
  ...lincoln,
  id: 'irin_jamaran',
  name: 'IRIN Jamaran',
  nation: 'iran',
  category: 'ship',
  position: { lat: 27, lng: 56 },
  visibility: 'tracked',
}

interface ViewOpts {
  speed?: number
  units?: ViewUnit[]
  lanes?: ShippingLane[]
}

function makeViewState(events: GameEvent[], opts: ViewOpts = {}): GameViewState {
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 10, timestamp: 1_000_000, speed: opts.speed ?? 1, tickIntervalMs: 100 },
    nations: [],
    units: opts.units ?? [lincoln, jamaran],
    missiles: [],
    supplyLines: [],
    shippingLanes: opts.lanes ?? shippingLanes,
    events,
    pendingEventCount: 0,
    satelliteDetectedUnitIds: [],
    warSupport: {},
    gameOver: null,
    objectives: [],
    intel: { assets: [], agents: [], products: [], taskings: [], leakLevel: 0, paranoiaBand: 'LOW' as const, encryptionUpgradedUntilTick: null },
  }
}

const destroyed: GameEvent = { type: 'UNIT_DESTROYED', unitId: 'cvn72_lincoln', tick: 1 }
const impact: GameEvent = { type: 'MISSILE_IMPACT', missileId: 'm_504', targetId: 'cvn72_lincoln', damage: 40, tick: 2 }
const intercept: GameEvent = { type: 'MISSILE_INTERCEPTED', missileId: 'm_504', interceptorId: 'cvn72_lincoln', position: { lat: 25, lng: 55 }, tick: 3 }
const resupplied: GameEvent = { type: 'RESUPPLIED', unitId: 'cvn72_lincoln', weaponId: 'sm3_iia', count: 1, fromBaseId: 'base1', tick: 4 }

function setStore(eventLog: GameEvent[], currentBatch: GameEvent[] = [], opts: ViewOpts = {}) {
  useGameStore.setState({
    viewState: makeViewState(currentBatch, opts),
    eventLog,
    visualTimestamp: 1_000_000,
    lastUpdateRealMs: 0,
    visualRate: 0,
  })
}

function expandFeed() {
  fireEvent.click(screen.getByText('EVENTS'))
}

beforeAll(() => {
  // jsdom has no Element.scrollTo (used by the feed's auto-scroll effect)
  Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => {})
})

beforeEach(() => {
  setStore([])
  sendCommandMock.mockClear()
  useUIStore.setState({
    mapFocus: null,
    autoPause: { warDeclared: true, ownUnitDestroyed: true, ceasefireOffered: true },
  })
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

    expandFeed()
    expect(screen.getByText('Events (2)')).toBeTruthy()
    expect(screen.getAllByText(/DESTROYED/)).toHaveLength(1)

    // Collapse and re-expand with the same batch still current
    fireEvent.click(screen.getByText('▲'))
    expect(screen.queryByText('2')).toBeNull()

    expandFeed()
    expect(screen.getByText('Events (2)')).toBeTruthy()
    expect(screen.getAllByText(/DESTROYED/)).toHaveLength(1)
  })

  it('formats SUPPLY_LINE_CUT instead of dumping the raw type', () => {
    const cut: GameEvent = { type: 'SUPPLY_LINE_CUT', lineId: 'bandar_supply', tick: 7 }
    setStore([cut])
    render(<AlertFeed />)
    expect(screen.getByText(/SUPPLY CUT: Bandar Supply/)).toBeTruthy()
  })

  it('renders lane events with the lane display name, not the underscored id', () => {
    const laneEvent: GameEvent = {
      type: 'SHIPPING_LANE_STATUS_CHANGE', laneId: 'bab_el_mandeb',
      newStatus: 'reduced', suppressionFactor: 0.4, tick: 5,
    }
    setStore([laneEvent])
    render(<AlertFeed />)
    expect(screen.getByText(/Bab el-Mandeb: REDUCED/)).toBeTruthy()
    expect(screen.queryByText(/EL_MANDEB/i)).toBeNull()
  })

  it('prettifies lane ids missing from view state instead of leaking the raw enum', () => {
    const laneEvent: GameEvent = {
      type: 'SHIPPING_LANE_STATUS_CHANGE', laneId: 'bab_el_mandeb',
      newStatus: 'blocked', suppressionFactor: 1, tick: 9,
    }
    setStore([laneEvent], [], { lanes: [] })
    render(<AlertFeed />)
    expect(screen.getByText(/Bab el-Mandeb: BLOCKED/)).toBeTruthy()
  })
})

describe('AlertFeed click-to-zoom', () => {
  it('clicking an event with a position sets ui-store mapFocus', () => {
    setStore([intercept])
    render(<AlertFeed />)
    expandFeed()

    fireEvent.click(screen.getByText(/INTERCEPT by CVN-72 Abraham Lincoln/))
    expect(useUIStore.getState().mapFocus).toMatchObject({ lng: 55, lat: 25, nonce: 1 })
  })

  it('resolves impact position from the target unit in viewState', () => {
    setStore([impact])
    render(<AlertFeed />)
    expandFeed()

    fireEvent.click(screen.getByText(/IMPACT on CVN-72 Abraham Lincoln/))
    expect(useUIStore.getState().mapFocus).toMatchObject({ lng: 55, lat: 25 })
  })

  it('resolves lane events to the lane midpoint', () => {
    const laneEvent: GameEvent = {
      type: 'SHIPPING_LANE_STATUS_CHANGE', laneId: 'hormuz',
      newStatus: 'blocked', suppressionFactor: 1, tick: 5,
    }
    setStore([laneEvent])
    render(<AlertFeed />)
    expandFeed()

    fireEvent.click(screen.getByText(/Strait of Hormuz: BLOCKED/))
    expect(useUIStore.getState().mapFocus).toMatchObject({ lng: 56.3, lat: 26.5 })
  })

  it('refocusing bumps the nonce so the camera re-flies', () => {
    setStore([intercept])
    render(<AlertFeed />)
    expandFeed()

    const row = screen.getByText(/INTERCEPT by CVN-72 Abraham Lincoln/)
    fireEvent.click(row)
    fireEvent.click(row)
    expect(useUIStore.getState().mapFocus?.nonce).toBe(2)
  })

  it('leaves rows without a resolvable position non-clickable', () => {
    const oil: GameEvent = { type: 'OIL_PRICE_CHANGE', newPrice: 120, oldPrice: 80, tick: 6 }
    const orphanDestroyed: GameEvent = { type: 'UNIT_DESTROYED', unitId: 'gone_unit', tick: 7 }
    setStore([oil, orphanDestroyed])
    render(<AlertFeed />)
    expandFeed()

    fireEvent.click(screen.getByText(/OIL \$120/))
    fireEvent.click(screen.getByText(/DESTROYED gone_unit/))
    expect(useUIStore.getState().mapFocus).toBeNull()
  })
})

describe('AlertFeed auto-pause', () => {
  it('sends SET_SPEED 0 when an own unit is destroyed and the trigger is enabled', () => {
    render(<AlertFeed />)
    act(() => {
      setStore([destroyed], [destroyed], { speed: 360 })
    })
    expect(sendCommandMock).toHaveBeenCalledWith({ type: 'SET_SPEED', speed: 0 })
  })

  it('does not pause for enemy unit losses', () => {
    const enemyDown: GameEvent = { type: 'UNIT_DESTROYED', unitId: 'irin_jamaran', tick: 1 }
    render(<AlertFeed />)
    act(() => {
      setStore([enemyDown], [enemyDown], { speed: 360 })
    })
    expect(sendCommandMock).not.toHaveBeenCalled()
  })

  it('pauses on WAR_DECLARED and CEASEFIRE_OFFERED', () => {
    const war: GameEvent = { type: 'WAR_DECLARED', attacker: 'iran', defender: 'usa', tick: 1 }
    render(<AlertFeed />)
    act(() => {
      setStore([war], [war], { speed: 6 })
    })
    expect(sendCommandMock).toHaveBeenCalledWith({ type: 'SET_SPEED', speed: 0 })

    sendCommandMock.mockClear()
    const offer: GameEvent = { type: 'CEASEFIRE_OFFERED', by: 'iran', tick: 2 }
    act(() => {
      setStore([war, offer], [offer], { speed: 6 })
    })
    expect(sendCommandMock).toHaveBeenCalledWith({ type: 'SET_SPEED', speed: 0 })
  })

  it('does nothing when the trigger is disabled', () => {
    useUIStore.setState({
      autoPause: { warDeclared: false, ownUnitDestroyed: false, ceasefireOffered: false },
    })
    const war: GameEvent = { type: 'WAR_DECLARED', attacker: 'iran', defender: 'usa', tick: 1 }
    render(<AlertFeed />)
    act(() => {
      setStore([war, destroyed], [war, destroyed], { speed: 360 })
    })
    expect(sendCommandMock).not.toHaveBeenCalled()
  })

  it('does nothing when already paused', () => {
    render(<AlertFeed />)
    act(() => {
      setStore([destroyed], [destroyed], { speed: 0 })
    })
    expect(sendCommandMock).not.toHaveBeenCalled()
  })

  it('does not re-fire for the same batch on unrelated re-renders', () => {
    render(<AlertFeed />)
    act(() => {
      setStore([destroyed], [destroyed], { speed: 360 })
    })
    expect(sendCommandMock).toHaveBeenCalledTimes(1)

    expandFeed()
    fireEvent.click(screen.getByText('▲'))
    expect(sendCommandMock).toHaveBeenCalledTimes(1)
  })

  it('gear popover toggles the persisted triggers', () => {
    setStore([destroyed])
    render(<AlertFeed />)
    expandFeed()

    fireEvent.click(screen.getByLabelText('Auto-pause settings'))
    fireEvent.click(screen.getByLabelText('War declared'))
    expect(useUIStore.getState().autoPause.warDeclared).toBe(false)

    fireEvent.click(screen.getByLabelText('War declared'))
    expect(useUIStore.getState().autoPause.warDeclared).toBe(true)
    expect(useUIStore.getState().autoPause.ownUnitDestroyed).toBe(true)
  })
})
