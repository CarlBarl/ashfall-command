import { create } from 'zustand'
import type { UnitId } from '@/types/game'

interface UIState {
  selectedUnitId: UnitId | null
  hoveredUnitId: UnitId | null
  showRangeRings: boolean
  showUnitInfo: boolean
  showOrbat: boolean
  showEconomy: boolean
  showStats: boolean
  showCommand: boolean

  selectUnit: (id: UnitId | null) => void
  hoverUnit: (id: UnitId | null) => void
  toggleRangeRings: () => void
  togglePanel: (panel: 'unitInfo' | 'orbat' | 'economy' | 'stats' | 'command') => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedUnitId: null,
  hoveredUnitId: null,
  showRangeRings: false,
  showUnitInfo: true,
  showOrbat: false,
  showEconomy: false,
  showStats: false,
  showCommand: false,

  selectUnit: (id) => set({ selectedUnitId: id }),
  hoverUnit: (id) => set({ hoveredUnitId: id }),
  toggleRangeRings: () => set((s) => ({ showRangeRings: !s.showRangeRings })),
  togglePanel: (panel) => {
    const key = `show${panel.charAt(0).toUpperCase() + panel.slice(1)}` as keyof UIState
    set((s) => ({ [key]: !s[key] }))
  },
}))
