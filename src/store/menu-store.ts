import { create } from 'zustand'
import type { NationId, UnitCategory } from '@/types/game'

// ── Fallback types (until @/types/scenario exists) ──────────────────

export interface FreeModeUnit {
  catalogId: string
  name: string
  category: UnitCategory
  cost_millions: number
}

export interface GameModeConfig {
  mode: 'scenario' | 'free'
  playerNation: NationId
  scenarioId?: string
  freeBudget?: number
  freeUnits?: FreeModeUnit[]
  freeEnemyUnits?: FreeModeUnit[]
}

// ── Store ───────────────────────────────────────────────────────────

interface MenuState {
  screen: 'start' | 'scenario-select' | 'free-lobby' | 'deployment' | 'playing'
  selectedMode: 'scenario' | 'free' | null
  selectedNation: NationId
  selectedScenarioId: string | null
  mapCenter: { longitude: number; latitude: number; zoom: number } | null
  freeBudget: number
  freeUnits: FreeModeUnit[]
  freeEnemyUnits: FreeModeUnit[]
  setScreen: (screen: MenuState['screen']) => void
  setSelectedMode: (mode: 'scenario' | 'free') => void
  setSelectedNation: (nation: NationId) => void
  setSelectedScenarioId: (id: string | null) => void
  setMapCenter: (center: { longitude: number; latitude: number; zoom: number } | null) => void
  setFreeBudget: (budget: number) => void
  addFreeUnit: (unit: FreeModeUnit) => void
  removeFreeUnit: (index: number) => void
  addFreeEnemyUnit: (unit: FreeModeUnit) => void
  removeFreeEnemyUnit: (index: number) => void
  resetFreeMode: () => void
  getGameConfig: (scenarioId?: string) => GameModeConfig
}

const DEFAULT_BUDGET = 15_000 // millions USD

export const useMenuStore = create<MenuState>((set, get) => ({
  screen: 'start',
  selectedMode: null,
  selectedNation: 'usa',
  selectedScenarioId: null,
  mapCenter: null,
  freeBudget: DEFAULT_BUDGET,
  freeUnits: [],
  freeEnemyUnits: [],

  setScreen: (screen) => set({ screen }),

  setSelectedMode: (mode) => set({ selectedMode: mode }),

  setSelectedNation: (nation) => set({ selectedNation: nation }),

  setSelectedScenarioId: (id) => set({ selectedScenarioId: id }),

  setMapCenter: (center) => set({ mapCenter: center }),

  setFreeBudget: (budget) => set({ freeBudget: budget }),

  addFreeUnit: (unit) =>
    set((s) => {
      const remaining = s.freeBudget - unit.cost_millions
      if (remaining < 0) return s
      return { freeUnits: [...s.freeUnits, unit], freeBudget: remaining }
    }),

  removeFreeUnit: (index) =>
    set((s) => {
      const removed = s.freeUnits[index]
      if (!removed) return s
      const next = s.freeUnits.filter((_, i) => i !== index)
      return { freeUnits: next, freeBudget: s.freeBudget + removed.cost_millions }
    }),

  addFreeEnemyUnit: (unit) =>
    set((s) => ({ freeEnemyUnits: [...s.freeEnemyUnits, unit] })),

  removeFreeEnemyUnit: (index) =>
    set((s) => ({
      freeEnemyUnits: s.freeEnemyUnits.filter((_, i) => i !== index),
    })),

  resetFreeMode: () =>
    set({ freeBudget: DEFAULT_BUDGET, freeUnits: [], freeEnemyUnits: [] }),

  getGameConfig: (scenarioId) => {
    const s = get()
    return {
      mode: s.selectedMode ?? 'scenario',
      playerNation: s.selectedNation,
      scenarioId,
      freeBudget: s.freeBudget,
      freeUnits: s.freeUnits,
      freeEnemyUnits: s.freeEnemyUnits,
    }
  },
}))
