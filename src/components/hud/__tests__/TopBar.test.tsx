import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import TopBar from '../TopBar'
import { useGameStore } from '@/store/game-store'
import { useUIStore } from '@/store/ui-store'
import { useMenuStore } from '@/store/menu-store'
import { sendCommand } from '@/store/bridge'
import { audioManager, AUDIO_STORAGE_KEYS } from '@/audio/audio-manager'
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
    intel: {
      assets: [],
      agents: [],
      products: [],
      taskings: [],
      leakLevel: 0,
      paranoiaBand: 'LOW',
      encryptionUpgradedUntilTick: null,
    },
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

  it('sends DECLARE_WAR when confirmed inside the countdown window', () => {
    render(<TopBar />)

    fireEvent.click(screen.getByText('DECLARE WAR'))
    expect(sendCommand).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText(/CONFIRM WAR/))
    expect(sendCommand).toHaveBeenCalledWith({ type: 'DECLARE_WAR', target: 'iran' })
  })

  it('shows a live countdown on CONFIRM WAR and disarms when it expires', () => {
    vi.useFakeTimers()
    try {
      render(<TopBar />)
      fireEvent.click(screen.getByText('DECLARE WAR'))
      expect(screen.getByText('CONFIRM WAR 5')).toBeTruthy()

      act(() => { vi.advanceTimersByTime(1100) })
      expect(screen.getByText('CONFIRM WAR 4')).toBeTruthy()

      act(() => { vi.advanceTimersByTime(4000) })
      expect(screen.getByText('DECLARE WAR')).toBeTruthy()
      expect(sendCommand).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
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

describe('TopBar main menu exit', () => {
  beforeEach(() => {
    useMenuStore.getState().setScreen('playing')
  })

  it('returns to the main menu only after the two-step confirm', () => {
    useUIStore.setState({ showIntel: true })
    render(<TopBar />)

    fireEvent.click(screen.getByText('···'))
    fireEvent.click(screen.getByText('MAIN MENU'))
    expect(useMenuStore.getState().screen).toBe('playing')

    fireEvent.click(screen.getByText('CONFIRM EXIT?'))
    expect(useMenuStore.getState().screen).toBe('start')
    expect(useUIStore.getState().showIntel).toBe(false)
  })

  it('disarms CONFIRM EXIT? after 4 seconds without confirming', () => {
    vi.useFakeTimers()
    try {
      render(<TopBar />)
      fireEvent.click(screen.getByText('···'))
      fireEvent.click(screen.getByText('MAIN MENU'))
      expect(screen.getByText('CONFIRM EXIT?')).toBeTruthy()

      act(() => { vi.advanceTimersByTime(4100) })
      expect(screen.getByText('MAIN MENU')).toBeTruthy()
      expect(useMenuStore.getState().screen).toBe('playing')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('TopBar sound toggle', () => {
  beforeEach(() => {
    audioManager.setMuted(false)
    useUIStore.setState({ audioMuted: false })
  })

  it('toggles mute in the ui-store and persists it', () => {
    render(<TopBar />)
    const btn = screen.getByLabelText('Sound on/off')
    expect(btn.getAttribute('title')).toBe('Sound on/off')

    fireEvent.click(btn)
    expect(useUIStore.getState().audioMuted).toBe(true)
    expect(localStorage.getItem(AUDIO_STORAGE_KEYS.muted)).toBe('1')
    expect(audioManager.isMuted()).toBe(true)

    fireEvent.click(btn)
    expect(useUIStore.getState().audioMuted).toBe(false)
    expect(localStorage.getItem(AUDIO_STORAGE_KEYS.muted)).toBe('0')
  })
})

describe('TopBar time controls', () => {
  function setSpeed(speed: number) {
    setStore(makeViewState({ time: { tick: 100, timestamp: 1_000_000, speed, tickIntervalMs: 100 } }))
  }

  it('slider at max sends 1h/s (engine speed 360)', () => {
    render(<TopBar />)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '1000' } })
    expect(sendCommand).toHaveBeenCalledWith({ type: 'SET_SPEED', speed: 360 })
  })

  it('slider snaps near-detent positions to the detent', () => {
    render(<TopBar />)
    // pos 500 ≈ multiplier 59.8 → snaps to the 60× detent → engine speed 6
    fireEvent.change(screen.getByRole('slider'), { target: { value: '500' } })
    expect(sendCommand).toHaveBeenCalledWith({ type: 'SET_SPEED', speed: 6 })
  })

  it('slider at zero pauses', () => {
    render(<TopBar />)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } })
    expect(sendCommand).toHaveBeenCalledWith({ type: 'SET_SPEED', speed: 0 })
  })

  it('shows PAUSED when speed is 0 and ×N otherwise', () => {
    setSpeed(0)
    const { unmount } = render(<TopBar />)
    expect(screen.getByText('PAUSED')).toBeTruthy()
    unmount()

    setSpeed(1) // multiplier 10
    render(<TopBar />)
    expect(screen.getByText('×10')).toBeTruthy()
  })

  it('pause button stops the clock and resumes to the last nonzero speed', () => {
    setSpeed(1)
    const { unmount } = render(<TopBar />)
    fireEvent.click(screen.getByLabelText('Pause'))
    expect(sendCommand).toHaveBeenCalledWith({ type: 'SET_SPEED', speed: 0 })
    unmount()

    setSpeed(0)
    render(<TopBar />)
    fireEvent.click(screen.getByLabelText('Resume'))
    expect(sendCommand).toHaveBeenCalledWith({ type: 'SET_SPEED', speed: 0.1 })
  })

  it('toggles the LIVE feeds window', () => {
    useUIStore.setState({ liveFeedsOpen: false })
    render(<TopBar />)
    fireEvent.click(screen.getByText('LIVE'))
    expect(useUIStore.getState().liveFeedsOpen).toBe(true)
  })
})

describe('TopBar air ops', () => {
  it('toggles the air ops panel with the AIR button', () => {
    useUIStore.setState({ showAirOps: false })
    render(<TopBar />)
    fireEvent.click(screen.getByText('AIR'))
    expect(useUIStore.getState().showAirOps).toBe(true)
    fireEvent.click(screen.getByText('AIR'))
    expect(useUIStore.getState().showAirOps).toBe(false)
  })

  it('shows the SURGE chip only while surge ops is active', () => {
    setStore(makeViewState({ surgeOps: true }))
    const { unmount } = render(<TopBar />)
    expect(screen.getByText('SURGE')).toBeTruthy()
    unmount()

    setStore(makeViewState({}))
    render(<TopBar />)
    expect(screen.queryByText('SURGE')).toBeNull()
  })
})
