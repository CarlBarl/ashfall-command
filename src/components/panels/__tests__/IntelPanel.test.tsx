import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import IntelPanel from '../IntelPanel'
import { useGameStore } from '@/store/game-store'
import { useIntelStore } from '@/store/intel-store'
import { sendCommand } from '@/store/bridge'
import type { GameViewState, IntelViewState, ViewUnit } from '@/types/view'

vi.mock('@/store/bridge', () => ({
  sendCommand: vi.fn(),
  getFullState: vi.fn(),
  loadState: vi.fn(),
}))

vi.mock('@/intel/osint-feed', () => ({
  useOsintFeed: () => [
    {
      id: 'post_1',
      handle: '@GulfPlaneWatch',
      displayName: 'Gulf Plane Watch',
      color: '#7fb3d5',
      tick: 600,
      text: 'Heavy tanker activity out of Al Udeid this morning.',
    },
  ],
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

function makeIntel(over: Partial<IntelViewState> = {}): IntelViewState {
  return {
    assets: [
      {
        id: 'kh11',
        nation: 'usa',
        name: 'KH-11 CRYSTAL',
        kind: 'optical_sat',
        status: 'active',
        revisit_min: 240,
        lastCollectionTick: 0,
        niirs: 8,
      },
      {
        id: 'rc135',
        nation: 'usa',
        name: 'RC-135 RIVET JOINT',
        kind: 'sigint_air',
        status: 'active',
        revisit_min: 0,
        lastCollectionTick: 0,
      },
    ],
    agents: [
      {
        id: 'amber',
        codename: 'AMBER',
        placement: 'Port logistics clerk, Bandar Abbas',
        product: 'Naval activity in the Bandar Abbas-Jask complex',
        status: 'active',
        exposure: 25,
        lastTaskedTick: -999_999,
      },
    ],
    products: [
      {
        id: 'prod_1',
        kind: 'sigint',
        tick: 1200,
        classification: 'TOP SECRET//SI',
        caption: 'Air-defense net: calibration chatter, sectors quiet.',
        precedence: 'ROUTINE',
      },
    ],
    taskings: [],
    leakLevel: 25,
    paranoiaBand: 'LOW',
    encryptionUpgradedUntilTick: null,
    ...over,
  }
}

function setStore(intel: IntelViewState, units: ViewUnit[]) {
  const viewState: GameViewState = {
    playerNation: 'usa',
    initialized: true,
    time: { tick: TICK, timestamp: 0, speed: 0, tickIntervalMs: 100 },
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
    intel,
  }
  useGameStore.setState({ viewState, eventLog: [] })
}

const defaultUnits = () => [
  makeUnit('usa_ddg', 'usa', {
    name: 'USS Gravely',
    sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.9 }],
  }),
  makeUnit('iran_ffg', 'iran', { name: 'IRIS Jamaran', visibility: 'tracked' }),
]

beforeEach(() => {
  vi.mocked(sendCommand).mockClear()
  useIntelStore.setState({ activeTab: 'isr', estimatedUnits: [], placingCatalogId: null })
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
  setStore(makeIntel(), defaultUnits())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('IntelPanel tabs', () => {
  it('switches between the five tabs', () => {
    render(<IntelPanel />)

    // ISR is the default tab
    expect(screen.getByText('KH-11 CRYSTAL')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'SIGINT' }))
    expect(screen.getByText(/calibration chatter/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'HUMINT' }))
    expect(screen.getByText('AMBER')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'OSINT' }))
    expect(screen.getByText('@GulfPlaneWatch')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'OPSEC' }))
    expect(screen.getByText('OPSEC SWEEP')).toBeTruthy()
  })
})

describe('ISR tab', () => {
  it('shows a TASK PASS button on taskable assets only', () => {
    render(<IntelPanel />)
    expect(screen.getAllByText('TASK PASS')).toHaveLength(1) // kh11 yes, rc135 no
  })

  it('shows next-pass countdown from lastCollectionTick + revisit', () => {
    render(<IntelPanel />)
    // kh11: 240min revisit, last pass tick 0, now 7200 → 7200s left = 2h
    expect(screen.getByText(/NEXT PASS 2h 00m/)).toBeTruthy()
    // rc135: revisit 0 → continuous
    expect(screen.getByText(/NEXT PASS CONTINUOUS/)).toBeTruthy()
  })

  it('queues a pass without cloudPct when the weather fetch fails', async () => {
    render(<IntelPanel />)
    fireEvent.click(screen.getByText('TASK PASS'))
    fireEvent.click(screen.getByText('IRIS Jamaran'))

    await waitFor(() => {
      expect(sendCommand).toHaveBeenCalledWith({
        type: 'TASK_SATELLITE_PASS',
        assetId: 'kh11',
        target: { lat: 26.2, lng: 56.3 },
      })
    })
  })

  it('passes real cloud cover as cloudPct when the fetch succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ current: { cloud_cover: 42 } }),
    })))
    render(<IntelPanel />)
    fireEvent.click(screen.getByText('TASK PASS'))
    fireEvent.click(screen.getByText('IRIS Jamaran'))

    await waitFor(() => {
      expect(sendCommand).toHaveBeenCalledWith({
        type: 'TASK_SATELLITE_PASS',
        assetId: 'kh11',
        target: { lat: 26.2, lng: 56.3 },
        cloudPct: 42,
      })
    })
  })

  it('lists queued taskings', () => {
    setStore(
      makeIntel({
        taskings: [{ id: 'task_1', assetId: 'kh11', target: { lat: 27.1, lng: 56.0 }, queuedTick: 7000 }],
      }),
      defaultUnits(),
    )
    render(<IntelPanel />)
    expect(screen.getByText('Queued Taskings')).toBeTruthy()
    expect(screen.getByText('27.10N 56.00E')).toBeTruthy()
  })
})

describe('SIGINT tab', () => {
  it('shows the encryption blackout banner with countdown when upgraded', () => {
    setStore(makeIntel({ encryptionUpgradedUntilTick: TICK + 3600 }), defaultUnits())
    render(<IntelPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'SIGINT' }))
    expect(screen.getByText(/COLLECTION DARK/)).toBeTruthy()
    expect(screen.getByText(/resume in 1h 00m/)).toBeTruthy()
  })

  it('hides the banner when the blackout has expired', () => {
    setStore(makeIntel({ encryptionUpgradedUntilTick: TICK - 1 }), defaultUnits())
    render(<IntelPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'SIGINT' }))
    expect(screen.queryByText(/COLLECTION DARK/)).toBeNull()
  })
})

describe('HUMINT tab', () => {
  it('TASK dispatches TASK_AGENT', () => {
    render(<IntelPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'HUMINT' }))
    fireEvent.click(screen.getByText('TASK'))
    expect(sendCommand).toHaveBeenCalledWith({ type: 'TASK_AGENT', agentId: 'amber' })
  })

  it('disables TASK during the 1h cooldown', () => {
    const intel = makeIntel()
    intel.agents[0].lastTaskedTick = TICK - 600 // tasked 10min ago
    setStore(intel, defaultUnits())
    render(<IntelPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'HUMINT' }))

    const task = screen.getByText('TASK') as HTMLButtonElement
    expect(task.disabled).toBe(true)
    fireEvent.click(task)
    expect(sendCommand).not.toHaveBeenCalled()
  })

  it('renders arrested agents as tombstones without action buttons', () => {
    const intel = makeIntel()
    intel.agents[0].status = 'arrested'
    setStore(intel, defaultUnits())
    render(<IntelPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'HUMINT' }))

    expect(screen.getByText('ARRESTED')).toBeTruthy()
    expect(screen.queryByText('TASK')).toBeNull()
    expect(screen.queryByText('EXFILTRATE')).toBeNull()
  })
})

describe('OPSEC tab', () => {
  it('OPSEC SWEEP dispatches OPSEC_SWEEP', () => {
    render(<IntelPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'OPSEC' }))
    fireEvent.click(screen.getByText('OPSEC SWEEP'))
    expect(sendCommand).toHaveBeenCalledWith({ type: 'OPSEC_SWEEP' })
  })

  it('toggles EMCON on own radar units', () => {
    render(<IntelPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'OPSEC' }))

    expect(screen.getByText('USS Gravely')).toBeTruthy()
    fireEvent.click(screen.getByText('RADIATING'))
    expect(sendCommand).toHaveBeenCalledWith({ type: 'SET_EMCON', unitId: 'usa_ddg', emcon: true })
  })

  it('shows the Iranian counterintel posture band', () => {
    setStore(makeIntel({ paranoiaBand: 'SEVERE' }), defaultUnits())
    render(<IntelPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'OPSEC' }))
    expect(screen.getByText('SEVERE')).toBeTruthy()
  })
})
