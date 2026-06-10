import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import InfoTooltip from '../InfoTooltip'
import { useGameStore } from '@/store/game-store'
import { useUIStore } from '@/store/ui-store'
import type { GameViewState, ViewUnit } from '@/types/view'

function makeUnit(overrides: Partial<ViewUnit> & Pick<ViewUnit, 'id'>): ViewUnit {
  return {
    name: overrides.id,
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
  } as ViewUnit
}

function setup(unit: ViewUnit) {
  const viewState = {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 0, timestamp: 0, speed: 0, tickIntervalMs: 100 },
    nations: [],
    units: [unit],
    missiles: [],
    supplyLines: [],
    shippingLanes: [],
    events: [],
    pendingEventCount: 0,
    satelliteDetectedUnitIds: [],
    warSupport: {},
    gameOver: null,
    objectives: [],
  } as GameViewState
  useGameStore.setState({ viewState })
  useUIStore.setState({ hoveredUnitId: unit.id })
  return render(<InfoTooltip x={100} y={100} />)
}

describe('InfoTooltip fog of war', () => {
  it('shows only identity and staleness for stale detected contacts', () => {
    setup(makeUnit({ id: 'c1', name: 'Surface contact', visibility: 'detected', stale: true }))
    expect(screen.getByText('Surface contact')).toBeTruthy()
    expect(screen.getByText(/TRACK LOST/)).toBeTruthy()
    expect(screen.getByText('Type')).toBeTruthy()
    expect(screen.queryByText('Health')).toBeNull()
    expect(screen.queryByText('Status')).toBeNull()
    expect(screen.queryByText('ROE')).toBeNull()
  })

  it('shows condition but NO LOADOUT DATA and no ROE for tracked contacts', () => {
    setup(makeUnit({ id: 'c2', name: 'IRIS Sahand', visibility: 'tracked', health: 70, status: 'damaged' }))
    expect(screen.getByText('Health')).toBeTruthy()
    expect(screen.getByText('70%')).toBeTruthy()
    expect(screen.getByText('NO LOADOUT DATA')).toBeTruthy()
    expect(screen.queryByText('ROE')).toBeNull()
    expect(screen.queryByText(/TRACK LOST/)).toBeNull()
  })

  it('shows ROE and weapons for identified units', () => {
    setup(makeUnit({
      id: 'c3',
      name: 'IRIS Jamaran',
      weapons: [{ weaponId: 'mystery_missile', count: 4, maxCount: 8, reloadTimeSec: 60 }],
    }))
    expect(screen.getByText('ROE')).toBeTruthy()
    expect(screen.getByText('mystery_missile')).toBeTruthy()
    expect(screen.getByText('4/8')).toBeTruthy()
    expect(screen.queryByText('NO LOADOUT DATA')).toBeNull()
  })
})
