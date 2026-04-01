import { create } from 'zustand'
import type { UnitId } from '@/types/game'

export type LeftPanel = 'orbat' | 'stats' | 'economy' | null

interface UIState {
  // Selection
  selectedUnitIds: Set<UnitId>
  selectedUnitId: UnitId | null
  hoveredUnitId: UnitId | null

  // Map overlays
  showRangeRings: boolean

  // Left sidebar — radio group (only one at a time)
  leftPanel: LeftPanel

  // Backward compat booleans (derived from leftPanel)
  showOrbat: boolean
  showStats: boolean
  showEconomy: boolean

  // Actions — selection
  selectUnit: (id: UnitId | null) => void
  toggleUnitSelection: (id: UnitId) => void
  selectMultipleUnits: (ids: UnitId[]) => void
  clearSelection: () => void
  hoverUnit: (id: UnitId | null) => void

  // Actions — map
  toggleRangeRings: () => void

  // Actions — panels
  setLeftPanel: (panel: LeftPanel) => void
  toggleLeftPanel: (panel: 'orbat' | 'stats' | 'economy') => void

  // COMPAT — these delegate to strike-store but exist here for migration
  targetUnitId: UnitId | null
  targetingMode: boolean
  showCommand: boolean
  showAttackPlan: boolean
  setTarget: (id: UnitId | null) => void
  enterTargetingMode: () => void
  exitTargetingMode: () => void
  togglePanel: (panel: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedUnitIds: new Set(),
  selectedUnitId: null,
  hoveredUnitId: null,
  showRangeRings: false,
  leftPanel: null,
  showOrbat: false,
  showStats: false,
  showEconomy: false,

  // Selection
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

  // Map
  toggleRangeRings: () => set((s) => ({ showRangeRings: !s.showRangeRings })),

  // COMPAT shims — will be removed when old panels are deleted
  targetUnitId: null,
  targetingMode: false,
  showCommand: false,
  showAttackPlan: false,
  setTarget: (id) => set({ targetUnitId: id, targetingMode: false }),
  enterTargetingMode: () => set({ targetingMode: true }),
  exitTargetingMode: () => set({ targetingMode: false }),
  togglePanel: (panel) => {
    if (panel === 'orbat' || panel === 'stats' || panel === 'economy') {
      set((s) => {
        const next = s.leftPanel === panel ? null : panel
        return { leftPanel: next, showOrbat: next === 'orbat', showStats: next === 'stats', showEconomy: next === 'economy' }
      })
    } else if (panel === 'attackPlan') {
      set((s) => ({ showAttackPlan: !s.showAttackPlan }))
    } else if (panel === 'command') {
      set((s) => ({ showCommand: !s.showCommand }))
    }
  },

  // Panels — radio group
  setLeftPanel: (panel) => set({
    leftPanel: panel,
    showOrbat: panel === 'orbat',
    showStats: panel === 'stats',
    showEconomy: panel === 'economy',
  }),

  toggleLeftPanel: (panel) => set((s) => {
    const next = s.leftPanel === panel ? null : panel
    return {
      leftPanel: next,
      showOrbat: next === 'orbat',
      showStats: next === 'stats',
      showEconomy: next === 'economy',
    }
  }),
}))
