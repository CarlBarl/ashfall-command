import { create } from 'zustand'
import type { NationId, Unit, Position } from '@/types/game'
import type { UnitCatalogEntry } from '@/types/scenario'
import { useMenuStore } from './menu-store'
import { usaCatalog } from '@/data/catalog/usa-catalog'
import { iranCatalog } from '@/data/catalog/iran-catalog'
import { buildUnit } from '@/engine/systems/ai-placement'
import { generateAIForce } from '@/engine/systems/ai-placement'
import { SeededRNG } from '@/engine/utils/rng'

const CATALOGS: Record<NationId, UnitCatalogEntry[]> = {
  usa: usaCatalog,
  iran: iranCatalog,
}

const DEFAULT_ENEMY_BUDGET = 5_000

interface PlacedUnit {
  entry: UnitCatalogEntry
  position: Position
}

interface DeploymentState {
  unplacedUnits: UnitCatalogEntry[]
  placedUnits: PlacedUnit[]
  activeIndex: number
  enemyUnits: Unit[]
  selectedPlacedIndex: number | null  // index of placed unit selected for repositioning

  init(playerNation: NationId, enemyNation: NationId): void
  placeUnit(position: Position): void
  moveUnit(index: number, position: Position): void
  selectPlaced(index: number | null): void
  undoLast(): void
  confirmDeployment(): Unit[]
  reset(): void
}

export const useDeploymentStore = create<DeploymentState>((set, get) => ({
  unplacedUnits: [],
  placedUnits: [],
  activeIndex: 0,
  enemyUnits: [],
  selectedPlacedIndex: null,

  init(playerNation, enemyNation) {
    const menuState = useMenuStore.getState()
    const playerCatalog = CATALOGS[playerNation]
    const enemyCatalog = CATALOGS[enemyNation]

    // Look up each selected FreeModeUnit in the real catalog
    const catalogById = new Map<string, UnitCatalogEntry>()
    for (const entry of playerCatalog) catalogById.set(entry.id, entry)

    const unplaced: UnitCatalogEntry[] = []
    for (const fu of menuState.freeUnits) {
      const entry = catalogById.get(fu.catalogId)
      if (entry) unplaced.push(entry)
    }

    // Generate enemy units
    const rng = new SeededRNG(Date.now())
    let enemies: Unit[]

    if (menuState.freeEnemyUnits.length > 0) {
      // User selected enemy units — look up and auto-place with AI placement
      const enemyById = new Map<string, UnitCatalogEntry>()
      for (const entry of enemyCatalog) enemyById.set(entry.id, entry)

      const selectedEnemyCatalog: UnitCatalogEntry[] = []
      for (const fu of menuState.freeEnemyUnits) {
        const entry = enemyById.get(fu.catalogId)
        if (entry) selectedEnemyCatalog.push(entry)
      }

      // Use generateAIForce with a budget high enough to buy all selected units
      // But we want exactly the user's picks, so build them directly
      enemies = selectedEnemyCatalog.map((entry, i) => {
        // Simple deterministic placement using AI zones
        const latBase = enemyNation === 'iran' ? 32 + rng.next() * 6 : 25 + rng.next() * 4
        const lngBase = enemyNation === 'iran' ? 48 + rng.next() * 8 : 47 + rng.next() * 8
        return buildUnit(entry, { lat: latBase, lng: lngBase }, enemyNation, i)
      })
    } else {
      // AI generates enemy force
      enemies = generateAIForce(enemyNation, DEFAULT_ENEMY_BUDGET, enemyCatalog, rng)
    }

    set({
      unplacedUnits: unplaced,
      placedUnits: [],
      activeIndex: 0,
      enemyUnits: enemies,
    })
  },

  placeUnit(position) {
    const { unplacedUnits, placedUnits, activeIndex } = get()
    if (activeIndex >= unplacedUnits.length) return

    const entry = unplacedUnits[activeIndex]
    set({
      placedUnits: [...placedUnits, { entry, position }],
      activeIndex: activeIndex + 1,
    })
  },

  moveUnit(index, position) {
    const { placedUnits } = get()
    if (index < 0 || index >= placedUnits.length) return
    const updated = [...placedUnits]
    updated[index] = { ...updated[index], position }
    set({ placedUnits: updated })
  },

  selectPlaced(index) {
    set({ selectedPlacedIndex: index })
  },

  undoLast() {
    const { placedUnits, activeIndex } = get()
    if (placedUnits.length === 0) return

    set({
      placedUnits: placedUnits.slice(0, -1),
      activeIndex: activeIndex - 1,
    })
  },

  confirmDeployment() {
    const { placedUnits, enemyUnits } = get()

    const playerUnits: Unit[] = placedUnits.map((pu, i) =>
      buildUnit(pu.entry, pu.position, pu.entry.nation, i),
    )
    // Override ID prefix for player units
    for (let i = 0; i < playerUnits.length; i++) {
      playerUnits[i].id = `free_player_${i}`
    }

    return [...playerUnits, ...enemyUnits]
  },

  reset() {
    set({
      unplacedUnits: [],
      placedUnits: [],
      activeIndex: 0,
      enemyUnits: [],
      selectedPlacedIndex: null,
    })
  },
}))
