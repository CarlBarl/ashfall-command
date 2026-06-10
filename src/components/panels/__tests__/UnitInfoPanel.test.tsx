import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import UnitInfoPanel from '../UnitInfoPanel'
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
    intel: { assets: [], agents: [], products: [], taskings: [], leakLevel: 0, paranoiaBand: 'LOW' as const, encryptionUpgradedUntilTick: null },
  } as GameViewState
  useGameStore.setState({ viewState })
  useUIStore.setState({ selectedUnitId: unit.id, selectedUnitIds: new Set([unit.id]) })
  return render(<UnitInfoPanel units={[unit]} />)
}

describe('UnitInfoPanel fog of war', () => {
  it('shows TRACK LOST banner and hides condition data for stale detected contacts', () => {
    setup(makeUnit({ id: 'c1', name: 'Surface contact', visibility: 'detected', stale: true }))
    expect(screen.getByText(/TRACK LOST/)).toBeTruthy()
    expect(screen.getByText('contact')).toBeTruthy()
    expect(screen.queryByText('HEALTH')).toBeNull()
    expect(screen.queryByText('ROE')).toBeNull()
    expect(screen.queryByText('Armament')).toBeNull()
  })

  it('shows condition but NO LOADOUT DATA for tracked contacts', () => {
    setup(makeUnit({
      id: 'c2',
      name: 'IRIS Sahand',
      visibility: 'tracked',
      status: 'damaged',
      health: 62,
      speed_kts: 18,
    }))
    expect(screen.getByText('HEALTH')).toBeTruthy()
    expect(screen.getByText('SPEED')).toBeTruthy()
    expect(screen.getByText('NO LOADOUT DATA')).toBeTruthy()
    expect(screen.queryByText(/TRACK LOST/)).toBeNull()
    expect(screen.queryByText('ROE')).toBeNull()
  })

  it('shows everything for identified units', () => {
    setup(makeUnit({
      id: 'c3',
      name: 'IRIS Jamaran',
      weapons: [{ weaponId: 'noor_ashm', count: 4, maxCount: 8, reloadTimeSec: 60 }],
    }))
    expect(screen.getByText('HEALTH')).toBeTruthy()
    expect(screen.getByText('ROE')).toBeTruthy()
    expect(screen.getByText('Armament')).toBeTruthy()
    expect(screen.queryByText('NO LOADOUT DATA')).toBeNull()
  })
})
