import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TopBar from '../TopBar'
import { useGameStore } from '@/store/game-store'
import { sendCommand } from '@/store/bridge'
import type { GameViewState } from '@/types/view'
import type { GameEvent, Nation } from '@/types/game'

vi.mock('@/store/bridge', () => ({
  sendCommand: vi.fn(),
  getFullState: vi.fn(),
  loadState: vi.fn(),
}))

function makeNation(id: string, name: string, atWar: string[]): Nation {
  return {
    id,
    name,
    economy: {
      gdp_billions: 0,
      military_budget_billions: 0,
      military_budget_pct_gdp: 0,
      oil_revenue_billions: 0,
      sanctions_impact: 0,
      war_cost_per_day_millions: 0,
      reserves_billions: 0,
    },
    relations: {},
    atWar,
  }
}

function makeViewState(over: Partial<GameViewState> & { atWar?: boolean }): GameViewState {
  const { atWar = false, ...rest } = over
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 100, timestamp: 1_000_000, speed: 1, tickIntervalMs: 100 },
    nations: [
      makeNation('usa', 'USA', atWar ? ['iran'] : []),
      makeNation('iran', 'Iran', atWar ? ['usa'] : []),
    ],
    units: [],
    missiles: [],
    supplyLines: [],
    shippingLanes: [],
    events: [],
    pendingEventCount: 0,
    satelliteDetectedUnitIds: [],
    warSupport: { usa: 72, iran: 41 },
    gameOver: null,
    objectives: [],
    ...rest,
  }
}

function setStore(viewState: GameViewState, eventLog: GameEvent[] = []) {
  useGameStore.setState({ viewState, eventLog })
}

beforeEach(() => {
  vi.mocked(sendCommand).mockClear()
  setStore(makeViewState({}))
})

describe('TopBar war controls', () => {
  it('shows DECLARE WAR at peace and no ceasefire or war-support UI', () => {
    render(<TopBar />)
    expect(screen.getByText('DECLARE WAR')).toBeTruthy()
    expect(screen.queryByText('OFFER CEASEFIRE')).toBeNull()
    expect(screen.queryByText('72%')).toBeNull()
  })

  it('swaps DECLARE WAR for OFFER CEASEFIRE at war', () => {
    setStore(makeViewState({ atWar: true }))
    render(<TopBar />)
    expect(screen.queryByText('DECLARE WAR')).toBeNull()
    expect(screen.getByText('OFFER CEASEFIRE')).toBeTruthy()
  })

  it('shows both war-support bars with numeric % at war', () => {
    setStore(makeViewState({ atWar: true }))
    const { container } = render(<TopBar />)
    expect(container.querySelector('[title="War support"]')).toBeTruthy()
    expect(screen.getByText('72%')).toBeTruthy()
    expect(screen.getByText('41%')).toBeTruthy()
  })

  it('sends OFFER_CEASEFIRE only after the two-step confirm', () => {
    setStore(makeViewState({ atWar: true }))
    render(<TopBar />)

    fireEvent.click(screen.getByText('OFFER CEASEFIRE'))
    expect(sendCommand).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('CONFIRM OFFER'))
    expect(sendCommand).toHaveBeenCalledWith({ type: 'OFFER_CEASEFIRE', target: 'iran' })
  })

  it('shows ACCEPT CEASEFIRE after an enemy offer and sends CEASE_FIRE on click', () => {
    setStore(makeViewState({ atWar: true }), [
      { type: 'CEASEFIRE_OFFERED', by: 'iran', tick: 50 },
    ])
    render(<TopBar />)

    expect(screen.queryByText('OFFER CEASEFIRE')).toBeNull()
    fireEvent.click(screen.getByText('ACCEPT CEASEFIRE'))
    expect(sendCommand).toHaveBeenCalledWith({ type: 'CEASE_FIRE', target: 'iran' })
  })

  it('clears the enemy offer once the war has ended', () => {
    setStore(makeViewState({ atWar: true }), [
      { type: 'CEASEFIRE_OFFERED', by: 'iran', tick: 50 },
      { type: 'WAR_ENDED', outcome: 'ceasefire', tick: 60 },
    ])
    render(<TopBar />)
    expect(screen.queryByText('ACCEPT CEASEFIRE')).toBeNull()
    expect(screen.getByText('OFFER CEASEFIRE')).toBeTruthy()
  })

  it('ignores ceasefire offers made by the player', () => {
    setStore(makeViewState({ atWar: true }), [
      { type: 'CEASEFIRE_OFFERED', by: 'usa', tick: 50 },
    ])
    render(<TopBar />)
    expect(screen.queryByText('ACCEPT CEASEFIRE')).toBeNull()
  })

  it('shows the objectives chip at war and opens the panel rows', () => {
    setStore(makeViewState({
      atWar: true,
      objectives: [
        { id: 'hormuz_open', label: 'Keep Hormuz open', progress: 0.8, status: 'good', detail: 'Lane open 80% of war time' },
      ],
    }))
    render(<TopBar />)

    fireEvent.click(screen.getByText(/OBJECTIVES/))
    expect(screen.getByText('Keep Hormuz open')).toBeTruthy()
    expect(screen.getByText('Lane open 80% of war time')).toBeTruthy()
  })

  it('hides the objectives chip at peace', () => {
    setStore(makeViewState({
      objectives: [
        { id: 'hormuz_open', label: 'Keep Hormuz open', progress: 0.8, status: 'good', detail: 'Lane open 80% of war time' },
      ],
    }))
    render(<TopBar />)
    expect(screen.queryByText(/OBJECTIVES/)).toBeNull()
  })

  it('sends RESIGN from the overflow menu only after the two-step confirm', () => {
    setStore(makeViewState({ atWar: true }))
    render(<TopBar />)

    fireEvent.click(screen.getByText('···'))
    fireEvent.click(screen.getByText('RESIGN'))
    expect(sendCommand).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('CONFIRM RESIGN'))
    expect(sendCommand).toHaveBeenCalledWith({ type: 'RESIGN' })
  })

  it('does not offer RESIGN at peace', () => {
    render(<TopBar />)
    fireEvent.click(screen.getByText('···'))
    expect(screen.queryByText('RESIGN')).toBeNull()
  })
})
