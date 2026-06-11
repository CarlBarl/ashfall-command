import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AirOpsPanel from '../AirOpsPanel'
import { useGameStore } from '@/store/game-store'
import { sendCommand } from '@/store/bridge'
import type { AirMission } from '@/types/game'
import type { GameViewState, ViewUnit } from '@/types/view'

vi.mock('@/store/bridge', () => ({
  sendCommand: vi.fn(),
  getFullState: vi.fn(),
  loadState: vi.fn(),
}))

const TICK = 7200

function makeUnit(id: string, nation: string, overrides: Partial<ViewUnit> = {}): ViewUnit {
  return {
    id,
    name: id,
    nation,
    category: 'ship',
    position: { lat: 26.2, lng: 56.3 },
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

function makeCarrier(): ViewUnit {
  return makeUnit('cvn72', 'usa', {
    name: 'CVN-72 Abraham Lincoln',
    category: 'carrier_group',
    airWing: [
      { id: 'vfa14', name: 'VFA-14 Tophatters', airframe: 'fa18e', total: 12, available: 8, readyAt: [TICK + 5400] },
      { id: 'vaw116', name: 'VAW-116 Sun Kings', airframe: 'e2d', total: 5, available: 3, readyAt: [] },
    ],
  })
}

function setStore(over: Partial<GameViewState> = {}) {
  const viewState: GameViewState = {
    playerNation: 'usa',
    initialized: true,
    time: { tick: TICK, timestamp: 0, speed: 0, tickIntervalMs: 100 },
    nations: [],
    units: [makeCarrier()],
    missiles: [],
    supplyLines: [],
    shippingLanes: [],
    events: [],
    pendingEventCount: 0,
    satelliteDetectedUnitIds: [],
    warSupport: {},
    gameOver: null,
    objectives: [],
    intel: { assets: [], agents: [], products: [], taskings: [], leakLevel: 0, paranoiaBand: 'LOW', encryptionUpgradedUntilTick: null },
    airMissions: [],
    surgeOps: false,
    ...over,
  }
  useGameStore.setState({ viewState, eventLog: [] })
}

function capMission(over: Partial<AirMission> = {}): AirMission {
  return {
    id: 'am_1_10',
    kind: 'cap',
    nation: 'usa',
    squadronId: 'vfa14',
    fromUnitId: 'cvn72',
    flightSize: 2,
    station: { lat: 26.6, lng: 56.5 },
    status: 'active',
    createdTick: 10,
    ...over,
  }
}

beforeEach(() => {
  vi.mocked(sendCommand).mockClear()
  setStore()
})

describe('AirOpsPanel squadron board', () => {
  it('renders squadron rows with airframe label, pool and next-ready countdown', () => {
    render(<AirOpsPanel />)
    expect(screen.getByText('CVN-72 Abraham Lincoln')).toBeTruthy()
    expect(screen.getByText('VFA-14 Tophatters')).toBeTruthy()
    expect(screen.getByText('F/A-18E Super Hornet')).toBeTruthy()
    expect(screen.getByText('8/12')).toBeTruthy()
    // 5400 ticks = 1h 30m until the next turnaround bird rejoins
    expect(screen.getByText('NEXT +1h 30m')).toBeTruthy()
    expect(screen.getByText('NO ACTIVE MISSIONS')).toBeTruthy()
  })

  it('shows the empty state without air wings', () => {
    setStore({ units: [] })
    render(<AirOpsPanel />)
    expect(screen.getByText('NO AIR WINGS IN THEATER')).toBeTruthy()
  })
})

describe('AirOpsPanel mission composer', () => {
  it('launches a CAP at the strait preset with the composed payload', () => {
    render(<AirOpsPanel />)
    fireEvent.change(screen.getByLabelText('Squadron'), { target: { value: 'cvn72|vfa14' } })
    fireEvent.click(screen.getByLabelText('Flight size 3'))
    fireEvent.click(screen.getByText('LAUNCH MISSION'))
    expect(sendCommand).toHaveBeenCalledWith({
      type: 'LAUNCH_AIR_MISSION',
      kind: 'cap',
      squadronId: 'vfa14',
      fromUnitId: 'cvn72',
      flightSize: 3,
      station: { lat: 26.6, lng: 56.5 },
    })
  })

  it('filters squadrons by mission kind (strike needs strike weapons, AEW needs datalink)', () => {
    render(<AirOpsPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'STRIKE' }))
    expect(screen.queryByRole('option', { name: /VAW-116/ })).toBeNull()
    expect(screen.getByRole('option', { name: /VFA-14/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'AEW' }))
    expect(screen.queryByRole('option', { name: /VFA-14/ })).toBeNull()
    expect(screen.getByRole('option', { name: /VAW-116/ })).toBeTruthy()
  })

  it('offers only tracked/identified contacts or fixed enemy bases as strike targets and launches with SEAD', () => {
    setStore({
      units: [
        makeCarrier(),
        makeUnit('iran_ddg', 'iran', { name: 'Jamaran', visibility: 'tracked' }),
        makeUnit('bushehr_ab', 'iran', { name: 'Bushehr AB', category: 'airbase', visibility: 'detected' }),
        makeUnit('iran_tel', 'iran', { name: 'TEL Group', category: 'missile_battery', visibility: 'detected' }),
      ],
    })
    render(<AirOpsPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'STRIKE' }))

    expect(screen.getByRole('option', { name: /Jamaran/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /Bushehr AB/ })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /TEL Group/ })).toBeNull()

    fireEvent.change(screen.getByLabelText('Squadron'), { target: { value: 'cvn72|vfa14' } })
    fireEvent.change(screen.getByLabelText('Target'), { target: { value: 'iran_ddg' } })
    fireEvent.click(screen.getByLabelText('SEAD escort'))
    fireEvent.click(screen.getByText('LAUNCH MISSION'))
    expect(sendCommand).toHaveBeenCalledWith({
      type: 'LAUNCH_AIR_MISSION',
      kind: 'strike',
      squadronId: 'vfa14',
      fromUnitId: 'cvn72',
      flightSize: 2,
      targetId: 'iran_ddg',
      escortSead: true,
    })
  })

  it('launches a CAP at custom coordinates', () => {
    render(<AirOpsPanel />)
    fireEvent.change(screen.getByLabelText('Squadron'), { target: { value: 'cvn72|vfa14' } })
    fireEvent.change(screen.getByLabelText('Station'), { target: { value: 'custom' } })
    fireEvent.change(screen.getByLabelText('Station latitude'), { target: { value: '27.1' } })
    fireEvent.change(screen.getByLabelText('Station longitude'), { target: { value: '55.9' } })
    fireEvent.click(screen.getByText('LAUNCH MISSION'))
    expect(sendCommand).toHaveBeenCalledWith({
      type: 'LAUNCH_AIR_MISSION',
      kind: 'cap',
      squadronId: 'vfa14',
      fromUnitId: 'cvn72',
      flightSize: 2,
      station: { lat: 27.1, lng: 55.9 },
    })
  })

  it('disables LAUNCH when the squadron lacks ready airframes for the flight size', () => {
    render(<AirOpsPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'AEW' }))
    fireEvent.change(screen.getByLabelText('Squadron'), { target: { value: 'cvn72|vaw116' } })
    fireEvent.click(screen.getByLabelText('Flight size 4'))

    const launch = screen.getByText('LAUNCH MISSION') as HTMLButtonElement
    expect(launch.disabled).toBe(true)
    expect(screen.getByText('INSUFFICIENT READY AIRFRAMES')).toBeTruthy()
    fireEvent.click(launch)
    expect(sendCommand).not.toHaveBeenCalled()
  })

  it('hides the USA-only SEAD/extended-range options for other nations', () => {
    setStore({ playerNation: 'iran', units: [] })
    render(<AirOpsPanel />)
    expect(screen.queryByLabelText('SEAD escort')).toBeNull()
    expect(screen.queryByLabelText('Extended range')).toBeNull()
  })
})

describe('AirOpsPanel mission board', () => {
  it('lists an active mission and cancels it', () => {
    setStore({ airMissions: [capMission()] })
    render(<AirOpsPanel />)
    expect(screen.getByText('2× F/A-18E')).toBeTruthy()
    // Squadron board + mission row both name the squadron
    expect(screen.getAllByText('VFA-14 Tophatters').length).toBe(2)
    expect(screen.getByText('ACTIVE')).toBeTruthy()

    fireEvent.click(screen.getByText('CANCEL'))
    expect(sendCommand).toHaveBeenCalledWith({ type: 'CANCEL_AIR_MISSION', missionId: 'am_1_10' })
  })

  it('shows a planning countdown to the launch window', () => {
    setStore({
      airMissions: [capMission({
        id: 'am_2_10',
        kind: 'strike',
        station: undefined,
        targetId: 'iran_ddg',
        status: 'planning',
        planningCompleteTick: TICK + 3600,
      })],
    })
    render(<AirOpsPanel />)
    expect(screen.getByText('PLANNING T-1h 00m')).toBeTruthy()
  })

  it('hides completed missions', () => {
    setStore({ airMissions: [capMission({ status: 'complete' })] })
    render(<AirOpsPanel />)
    expect(screen.getByText('NO ACTIVE MISSIONS')).toBeTruthy()
  })
})

describe('AirOpsPanel surge ops', () => {
  it('dispatches SET_SURGE_OPS with the consequence copy visible', () => {
    render(<AirOpsPanel />)
    expect(screen.getByText('96h halved ready times, then ×1.5 sustained')).toBeTruthy()
    fireEvent.click(screen.getByText('SURGE OPS: OFF'))
    expect(sendCommand).toHaveBeenCalledWith({ type: 'SET_SURGE_OPS', enabled: true })
  })

  it('reflects an active surge and toggles it off', () => {
    setStore({ surgeOps: true })
    render(<AirOpsPanel />)
    fireEvent.click(screen.getByText('SURGE OPS: ON'))
    expect(sendCommand).toHaveBeenCalledWith({ type: 'SET_SURGE_OPS', enabled: false })
  })
})
