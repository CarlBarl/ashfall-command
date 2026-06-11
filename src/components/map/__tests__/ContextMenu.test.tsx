import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ContextMenu, { isUnitMovable } from '../ContextMenu'
import { useUIStore } from '@/store/ui-store'
import { useGameStore } from '@/store/game-store'
import type { GameViewState, ViewUnit } from '@/types/view'

function makeUnit(over: Partial<ViewUnit> & Pick<ViewUnit, 'id' | 'category'>): ViewUnit {
  return {
    name: over.id,
    nation: 'iran',
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
    roe: 'hold_fire',
    waypoints: [],
    subordinateIds: [],
    visibility: 'identified',
    stale: false,
    ...over,
  } as ViewUnit
}

function makeViewState(units: ViewUnit[]): GameViewState {
  return {
    playerNation: 'iran',
    initialized: true,
    time: { tick: 0, timestamp: 0, speed: 0, tickIntervalMs: 100 },
    nations: [],
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
    intel: { assets: [], agents: [], products: [], taskings: [], leakLevel: 0, paranoiaBand: 'LOW' as const, encryptionUpgradedUntilTick: null },
  }
}

describe('isUnitMovable', () => {
  it('treats inherently mobile categories as movable', () => {
    for (const category of ['ship', 'submarine', 'carrier_group', 'aircraft'] as const) {
      expect(isUnitMovable({ category, readiness: undefined })).toBe(true)
    }
  })

  it('treats land units with a readiness lifecycle as movable', () => {
    expect(isUnitMovable({ category: 'missile_battery', readiness: 'deployed' })).toBe(true)
    expect(isUnitMovable({ category: 'sam_site', readiness: 'moving' })).toBe(true)
  })

  it('treats fixed installations as immovable', () => {
    expect(isUnitMovable({ category: 'minefield', readiness: undefined })).toBe(false)
    expect(isUnitMovable({ category: 'missile_battery', readiness: undefined })).toBe(false)
    expect(isUnitMovable({ category: 'sam_site', readiness: undefined })).toBe(false)
    expect(isUnitMovable({ category: 'airbase', readiness: undefined })).toBe(false)
    expect(isUnitMovable({ category: 'naval_base', readiness: undefined })).toBe(false)
  })
})

describe('ContextMenu move option', () => {
  beforeEach(() => {
    useUIStore.getState().clearSelection()
  })

  function renderForUnit(unit: ViewUnit) {
    useGameStore.setState({ viewState: makeViewState([unit]) })
    useUIStore.setState({ selectedUnitId: unit.id, selectedUnitIds: new Set([unit.id]) })
    return render(
      <ContextMenu x={10} y={10} lngLat={{ lng: 56, lat: 26 }} shiftKey={false} onClose={() => {}} />,
    )
  }

  it('does not offer Move for a minefield', () => {
    renderForUnit(makeUnit({ id: 'mines_hormuz', category: 'minefield' }))
    expect(screen.queryByText(/^Move /)).toBeNull()
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  it('does not offer Move for a fixed coastal missile battery', () => {
    renderForUnit(makeUnit({ id: 'hormuz_coastal', category: 'missile_battery' }))
    expect(screen.queryByText(/^Move /)).toBeNull()
  })

  it('offers Move for a ship', () => {
    renderForUnit(makeUnit({ id: 'ddg_milius', category: 'ship' }))
    expect(screen.getByText(/^Move /)).toBeTruthy()
  })

  it('offers Move for a TEL with a readiness lifecycle', () => {
    renderForUnit(makeUnit({ id: 'shahab_tabriz', category: 'missile_battery', readiness: 'deployed' }))
    expect(screen.getByText(/^Move /)).toBeTruthy()
  })
})
