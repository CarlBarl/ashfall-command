import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { UnitCatalogEntry } from '@/types/scenario'
import type { Unit } from '@/types/game'

// ── Mock external deps before importing the store ──────────────

const mockCatalogEntry: UnitCatalogEntry = {
  id: 'usa_patriot',
  name: 'Patriot Battalion',
  nation: 'usa',
  category: 'sam_site',
  cost_millions: 500,
  description: 'Medium-range SAM',
  template: {
    name: 'Patriot Battalion',
    nation: 'usa',
    category: 'sam_site',
    heading: 0,
    speed_kts: 0,
    maxSpeed_kts: 0,
    health: 100,
    hardness: 100,
    logistics: 0,
    supplyStocks: [],
    weapons: [],
    sensors: [{ type: 'radar', range_km: 180, detection_prob: 0.95 }],
    roe: 'weapons_free',
  },
}

const mockCatalogEntry2: UnitCatalogEntry = {
  id: 'usa_thaad',
  name: 'THAAD Battery',
  nation: 'usa',
  category: 'sam_site',
  cost_millions: 1000,
  description: 'Terminal High Altitude Area Defense',
  template: {
    name: 'THAAD Battery',
    nation: 'usa',
    category: 'sam_site',
    heading: 0,
    speed_kts: 0,
    maxSpeed_kts: 0,
    health: 100,
    hardness: 100,
    logistics: 0,
    supplyStocks: [],
    weapons: [],
    sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.90 }],
    roe: 'weapons_free',
  },
}

const mockIranEntry: UnitCatalogEntry = {
  id: 'iran_s300',
  name: 'S-300PMU2',
  nation: 'iran',
  category: 'sam_site',
  cost_millions: 300,
  description: 'Long-range SAM',
  template: {
    name: 'S-300PMU2',
    nation: 'iran',
    category: 'sam_site',
    heading: 0,
    speed_kts: 0,
    maxSpeed_kts: 0,
    health: 100,
    hardness: 100,
    logistics: 0,
    supplyStocks: [],
    weapons: [],
    sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.85 }],
    roe: 'weapons_free',
  },
}

// Mock buildUnit to return a simple Unit object
vi.mock('@/engine/systems/ai-placement', () => ({
  buildUnit: (entry: UnitCatalogEntry, position: { lat: number; lng: number }, nation: string, index: number): Unit => ({
    id: `${nation}_${index}`,
    name: entry.name,
    nation: nation as 'usa' | 'iran',
    category: entry.category,
    position,
    heading: 0,
    speed_kts: 0,
    maxSpeed_kts: 0,
    health: 100,
    maxHealth: 100,
    hardness: 100,
    logistics: 0,
    supplyStocks: [],
    weapons: [],
    pointDefense: [],
    sensors: entry.template.sensors ?? [],
    roe: 'weapons_free',
    status: 'ready',
    waypoints: [],
    subordinateIds: [],
  }),
  generateAIForce: (_nation: string, _budget: number, _catalog: UnitCatalogEntry[]) => [],
}))

vi.mock('@/data/catalog/usa-catalog', () => ({
  usaCatalog: [mockCatalogEntry, mockCatalogEntry2],
}))

vi.mock('@/data/catalog/iran-catalog', () => ({
  iranCatalog: [mockIranEntry],
}))

vi.mock('@/store/menu-store', () => ({
  useMenuStore: {
    getState: () => ({
      freeUnits: [
        { catalogId: 'usa_patriot', name: 'Patriot', category: 'sam_site', cost_millions: 500 },
        { catalogId: 'usa_thaad', name: 'THAAD', category: 'sam_site', cost_millions: 1000 },
      ],
      freeEnemyUnits: [],
    }),
  },
}))

vi.mock('@/engine/utils/rng', () => ({
  SeededRNG: class {
    next() { return 0.5 }
  },
}))

// Import store AFTER mocks are set up
const { useDeploymentStore } = await import('../deployment-store')

// ── Reset store before each test ─────────────────────────────────

beforeEach(() => {
  useDeploymentStore.getState().reset()
})

// ── Tests ───────────────────────────────────────────────────────

describe('init', () => {
  it('populates unplacedUnits from menu store selections', () => {
    useDeploymentStore.getState().init('usa', 'iran')
    const state = useDeploymentStore.getState()
    expect(state.unplacedUnits).toHaveLength(2)
    expect(state.unplacedUnits[0].id).toBe('usa_patriot')
    expect(state.unplacedUnits[1].id).toBe('usa_thaad')
  })

  it('resets placedUnits and activeIndex on init', () => {
    const store = useDeploymentStore.getState()
    store.init('usa', 'iran')
    // Place a unit first
    store.placeUnit({ lat: 25, lng: 51 })
    // Re-init should reset
    store.init('usa', 'iran')
    const state = useDeploymentStore.getState()
    expect(state.placedUnits).toHaveLength(0)
    expect(state.activeIndex).toBe(0)
  })
})

describe('placeUnit', () => {
  it('adds unit to placedUnits at given position', () => {
    useDeploymentStore.getState().init('usa', 'iran')
    useDeploymentStore.getState().placeUnit({ lat: 25, lng: 51 })
    const state = useDeploymentStore.getState()
    expect(state.placedUnits).toHaveLength(1)
    expect(state.placedUnits[0].position).toEqual({ lat: 25, lng: 51 })
    expect(state.placedUnits[0].entry.id).toBe('usa_patriot')
  })

  it('advances activeIndex after placing', () => {
    useDeploymentStore.getState().init('usa', 'iran')
    expect(useDeploymentStore.getState().activeIndex).toBe(0)
    useDeploymentStore.getState().placeUnit({ lat: 25, lng: 51 })
    expect(useDeploymentStore.getState().activeIndex).toBe(1)
    useDeploymentStore.getState().placeUnit({ lat: 26, lng: 52 })
    expect(useDeploymentStore.getState().activeIndex).toBe(2)
  })

  it('does nothing when all units are already placed', () => {
    useDeploymentStore.getState().init('usa', 'iran')
    useDeploymentStore.getState().placeUnit({ lat: 25, lng: 51 })
    useDeploymentStore.getState().placeUnit({ lat: 26, lng: 52 })
    // Both units placed, activeIndex=2 which equals unplacedUnits.length
    useDeploymentStore.getState().placeUnit({ lat: 27, lng: 53 })
    expect(useDeploymentStore.getState().placedUnits).toHaveLength(2)
  })
})

describe('undoLast', () => {
  it('removes the last placed unit', () => {
    useDeploymentStore.getState().init('usa', 'iran')
    useDeploymentStore.getState().placeUnit({ lat: 25, lng: 51 })
    useDeploymentStore.getState().placeUnit({ lat: 26, lng: 52 })
    useDeploymentStore.getState().undoLast()
    const state = useDeploymentStore.getState()
    expect(state.placedUnits).toHaveLength(1)
    expect(state.activeIndex).toBe(1)
  })

  it('decrements activeIndex', () => {
    useDeploymentStore.getState().init('usa', 'iran')
    useDeploymentStore.getState().placeUnit({ lat: 25, lng: 51 })
    expect(useDeploymentStore.getState().activeIndex).toBe(1)
    useDeploymentStore.getState().undoLast()
    expect(useDeploymentStore.getState().activeIndex).toBe(0)
  })

  it('does nothing when no units have been placed', () => {
    useDeploymentStore.getState().init('usa', 'iran')
    useDeploymentStore.getState().undoLast()
    const state = useDeploymentStore.getState()
    expect(state.placedUnits).toHaveLength(0)
    expect(state.activeIndex).toBe(0)
  })
})

describe('selectPlaced', () => {
  it('sets selectedPlacedIndex', () => {
    useDeploymentStore.getState().selectPlaced(2)
    expect(useDeploymentStore.getState().selectedPlacedIndex).toBe(2)
  })

  it('clears selectedPlacedIndex with null', () => {
    useDeploymentStore.getState().selectPlaced(2)
    useDeploymentStore.getState().selectPlaced(null)
    expect(useDeploymentStore.getState().selectedPlacedIndex).toBeNull()
  })
})

describe('moveUnit', () => {
  it('repositions a placed unit', () => {
    useDeploymentStore.getState().init('usa', 'iran')
    useDeploymentStore.getState().placeUnit({ lat: 25, lng: 51 })
    useDeploymentStore.getState().moveUnit(0, { lat: 30, lng: 55 })
    const state = useDeploymentStore.getState()
    expect(state.placedUnits[0].position).toEqual({ lat: 30, lng: 55 })
  })

  it('does nothing for out-of-bounds index (negative)', () => {
    useDeploymentStore.getState().init('usa', 'iran')
    useDeploymentStore.getState().placeUnit({ lat: 25, lng: 51 })
    useDeploymentStore.getState().moveUnit(-1, { lat: 30, lng: 55 })
    // Original position unchanged
    expect(useDeploymentStore.getState().placedUnits[0].position).toEqual({ lat: 25, lng: 51 })
  })

  it('does nothing for out-of-bounds index (too high)', () => {
    useDeploymentStore.getState().init('usa', 'iran')
    useDeploymentStore.getState().placeUnit({ lat: 25, lng: 51 })
    useDeploymentStore.getState().moveUnit(10, { lat: 30, lng: 55 })
    expect(useDeploymentStore.getState().placedUnits[0].position).toEqual({ lat: 25, lng: 51 })
  })
})

describe('confirmDeployment', () => {
  it('returns built Unit objects for all placed units', () => {
    useDeploymentStore.getState().init('usa', 'iran')
    useDeploymentStore.getState().placeUnit({ lat: 25, lng: 51 })
    useDeploymentStore.getState().placeUnit({ lat: 26, lng: 52 })
    const units = useDeploymentStore.getState().confirmDeployment()
    // 2 player units + enemy units (mocked as empty)
    expect(units.length).toBeGreaterThanOrEqual(2)
    // Player units should have overridden IDs
    expect(units[0].id).toBe('free_player_0')
    expect(units[1].id).toBe('free_player_1')
  })
})

describe('reset', () => {
  it('resets all state', () => {
    useDeploymentStore.getState().init('usa', 'iran')
    useDeploymentStore.getState().placeUnit({ lat: 25, lng: 51 })
    useDeploymentStore.getState().reset()
    const state = useDeploymentStore.getState()
    expect(state.unplacedUnits).toHaveLength(0)
    expect(state.placedUnits).toHaveLength(0)
    expect(state.activeIndex).toBe(0)
    expect(state.enemyUnits).toHaveLength(0)
  })
})
