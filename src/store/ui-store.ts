import { create } from 'zustand'
import type { UnitId } from '@/types/game'

interface UIState {
  /** Multi-select: set of selected unit IDs */
  selectedUnitIds: Set<UnitId>
  /** Backward compat: first selected unit, or null */
  selectedUnitId: UnitId | null
  hoveredUnitId: UnitId | null
  targetUnitId: UnitId | null
  targetingMode: boolean
  showRangeRings: boolean
  showUnitInfo: boolean
  showOrbat: boolean
  showEconomy: boolean
  showStats: boolean
  showCommand: boolean
  showAttackPlan: boolean

  selectUnit: (id: UnitId | null) => void
  toggleUnitSelection: (id: UnitId) => void
  selectMultipleUnits: (ids: UnitId[]) => void
  clearSelection: () => void
  hoverUnit: (id: UnitId | null) => void
  setTarget: (id: UnitId | null) => void
  enterTargetingMode: () => void
  exitTargetingMode: () => void
  toggleRangeRings: () => void
  togglePanel: (panel: 'unitInfo' | 'orbat' | 'economy' | 'stats' | 'command' | 'attackPlan') => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedUnitIds: new Set(),
  selectedUnitId: null,
  hoveredUnitId: null,
  targetUnitId: null,
  targetingMode: false,
  showRangeRings: false,
  showUnitInfo: true,
  showOrbat: false,
  showEconomy: false,
  showStats: false,
  showCommand: false,
  showAttackPlan: false,

  selectUnit: (id) => set({
    selectedUnitIds: id ? new Set([id]) : new Set(),
    selectedUnitId: id,
  }),

  toggleUnitSelection: (id) => set((s) => {
    const next = new Set(s.selectedUnitIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    const first = next.size > 0 ? Array.from(next)[0] : null
    return { selectedUnitIds: next, selectedUnitId: first }
  }),

  selectMultipleUnits: (ids) => set({
    selectedUnitIds: new Set(ids),
    selectedUnitId: ids[0] ?? null,
  }),

  clearSelection: () => set({
    selectedUnitIds: new Set(),
    selectedUnitId: null,
  }),

  hoverUnit: (id) => set({ hoveredUnitId: id }),
  setTarget: (id) => set({ targetUnitId: id, targetingMode: false }),
  enterTargetingMode: () => set({ targetingMode: true }),
  exitTargetingMode: () => set({ targetingMode: false }),
  toggleRangeRings: () => set((s) => ({ showRangeRings: !s.showRangeRings })),
  togglePanel: (panel) => {
    const key = `show${panel.charAt(0).toUpperCase() + panel.slice(1)}` as keyof UIState
    set((s) => ({ [key]: !s[key] }))
  },
}))
