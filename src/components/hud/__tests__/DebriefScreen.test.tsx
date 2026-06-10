import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DebriefScreen, { formatDuration } from '../DebriefScreen'
import { useGameStore } from '@/store/game-store'
import { useMenuStore } from '@/store/menu-store'
import { useStrikeStore } from '@/store/strike-store'
import { useIntelStore } from '@/store/intel-store'
import { useUIStore } from '@/store/ui-store'
import type { GameViewState, ObjectiveStatus } from '@/types/view'
import type { GameOverReport, Nation } from '@/types/game'

function makeNation(id: string, name: string): Nation {
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
    atWar: [],
  }
}

const objectives: ObjectiveStatus[] = [
  {
    id: 'preserve_carrier',
    label: 'Preserve the carrier group',
    progress: 1,
    status: 'good',
    detail: 'Carrier group intact',
  },
  {
    id: 'hormuz_open',
    label: 'Keep Hormuz open',
    progress: 0.25,
    status: 'bad',
    detail: 'Lane open 25% of war time',
  },
]

const victoryReport: GameOverReport = {
  outcome: 'victory',
  loser: 'iran',
  endTick: 200_000,
  stats: {
    durationTicks: 187_200,
    unitsLost: { usa: 4, iran: 11 },
    missilesFired: { usa: 84, iran: 142 },
    missilesIntercepted: { usa: 51, iran: 12 },
    oilPeak: 131,
    hormuzReducedTicks: 36_000,
    hormuzBlockedTicks: 7_200,
  },
}

function makeViewState(over: Partial<GameViewState>): GameViewState {
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 200_000, timestamp: 1_000_000, speed: 1, tickIntervalMs: 100 },
    nations: [makeNation('usa', 'USA'), makeNation('iran', 'Iran')],
    units: [],
    missiles: [],
    supplyLines: [],
    shippingLanes: [],
    events: [],
    pendingEventCount: 0,
    satelliteDetectedUnitIds: [],
    warSupport: { usa: 64, iran: 0 },
    gameOver: victoryReport,
    objectives,
    intel: { assets: [], agents: [], products: [], taskings: [], leakLevel: 0, paranoiaBand: 'LOW' as const, encryptionUpgradedUntilTick: null },
    ...over,
  }
}

beforeEach(() => {
  useGameStore.setState({ viewState: makeViewState({}), eventLog: [] })
  useMenuStore.setState({ screen: 'playing' })
  useStrikeStore.getState().reset()
  useIntelStore.getState().reset()
  useUIStore.getState().clearSelection()
})

describe('formatDuration', () => {
  it('formats days, hours and minutes by magnitude', () => {
    expect(formatDuration(187_200)).toBe('2d 4h')
    expect(formatDuration(7_200)).toBe('2h 0m')
    expect(formatDuration(540)).toBe('9m')
    expect(formatDuration(0)).toBe('0m')
  })
})

describe('DebriefScreen', () => {
  it('renders nothing when the war has not been decided', () => {
    useGameStore.setState({ viewState: makeViewState({ gameOver: null }) })
    const { container } = render(<DebriefScreen onDismiss={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the victory headline with capitulation verdict and stats table', () => {
    render(<DebriefScreen onDismiss={() => {}} />)

    expect(screen.getByText('VICTORY')).toBeTruthy()
    expect(screen.getByText('IRAN CAPITULATED')).toBeTruthy()

    expect(screen.getByText('4')).toBeTruthy()
    expect(screen.getByText('11')).toBeTruthy()
    expect(screen.getByText('84')).toBeTruthy()
    expect(screen.getByText('142')).toBeTruthy()
    expect(screen.getByText('51')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()

    expect(screen.getByText('2d 4h')).toBeTruthy()
    expect(screen.getByText('$131/bbl')).toBeTruthy()
    expect(screen.getByText('2h 0m')).toBeTruthy()
    expect(screen.getByText('10h 0m')).toBeTruthy()
  })

  it('shows both nations final war support', () => {
    render(<DebriefScreen onDismiss={() => {}} />)
    expect(screen.getByText('64%')).toBeTruthy()
    expect(screen.getByText('0%')).toBeTruthy()
  })

  it('frames a ceasefire as a scored draw naming who held the upper hand', () => {
    useGameStore.setState({
      viewState: makeViewState({
        gameOver: { ...victoryReport, outcome: 'ceasefire', loser: undefined },
        warSupport: { usa: 62, iran: 38 },
      }),
    })
    render(<DebriefScreen onDismiss={() => {}} />)

    expect(screen.getByText('CEASEFIRE')).toBeTruthy()
    expect(screen.getByText('USA HELD THE UPPER HAND')).toBeTruthy()
    expect(screen.getByText('62%')).toBeTruthy()
    expect(screen.getByText('38%')).toBeTruthy()
  })

  it('lists the final objectives', () => {
    render(<DebriefScreen onDismiss={() => {}} />)
    expect(screen.getByText('Preserve the carrier group')).toBeTruthy()
    expect(screen.getByText('Keep Hormuz open')).toBeTruthy()
    expect(screen.getByText('Lane open 25% of war time')).toBeTruthy()
  })

  it('CONTINUE OBSERVING dismisses without touching the menu', () => {
    const onDismiss = vi.fn()
    render(<DebriefScreen onDismiss={onDismiss} />)
    fireEvent.click(screen.getByText('CONTINUE OBSERVING'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(useMenuStore.getState().screen).toBe('playing')
  })

  it('MAIN MENU returns to the start screen and resets client stores', () => {
    useStrikeStore.getState().openStrike('plan')
    useUIStore.getState().selectUnit('ddg_milius')
    useUIStore.getState().setLeftPanel('orbat')

    render(<DebriefScreen onDismiss={() => {}} />)
    fireEvent.click(screen.getByText('MAIN MENU'))

    expect(useMenuStore.getState().screen).toBe('start')
    expect(useStrikeStore.getState().open).toBe(false)
    expect(useIntelStore.getState().estimatedUnits).toEqual([])
    expect(useUIStore.getState().selectedUnitId).toBeNull()
    expect(useUIStore.getState().leftPanel).toBeNull()
  })
})
