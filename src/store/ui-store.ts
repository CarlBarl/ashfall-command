import { create } from 'zustand'
import type { UnitId } from '@/types/game'
import type { MapMode } from '@/styles/map-providers'

export type LeftPanel = 'orbat' | 'stats' | 'economy' | null

interface UIState {
  // Selection
  selectedUnitIds: Set<UnitId>
  selectedUnitId: UnitId | null
  hoveredUnitId: UnitId | null

  // Map overlays
  showRangeRings: boolean

  // Map display
  mapMode: MapMode
  showElevation: boolean
  showRadarLOS: boolean

  // Left sidebar — radio group (only one at a time)
  leftPanel: LeftPanel

  // Backward compat booleans (derived from leftPanel)
  showOrbat: boolean
  showStats: boolean
  showEconomy: boolean

  // Right-side panels (independent toggles)
  showIntel: boolean

  // Actions — selection
  selectUnit: (id: UnitId | null) => void
  toggleUnitSelection: (id: UnitId) => void
  selectMultipleUnits: (ids: UnitId[]) => void
  clearSelection: () => void
  hoverUnit: (id: UnitId | null) => void

  // Actions — map
  toggleRangeRings: () => void
  cycleMapMode: () => void
  toggleElevation: () => void
  toggleRadarLOS: () => void

  // Actions — panels
  setLeftPanel: (panel: LeftPanel) => void
  toggleLeftPanel: (panel: 'orbat' | 'stats' | 'economy') => void

  // Right-side panels
  toggleIntel: () => void

  // Legacy compat — togglePanel still used by TopBar for left panels
  togglePanel: (panel: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedUnitIds: new Set(),
  selectedUnitId: null,
  hoveredUnitId: null,
  showRangeRings: false,
  mapMode: 'dark' as MapMode,
  showElevation: false,
  showRadarLOS: false,
  leftPanel: null,
  showOrbat: false,
  showStats: false,
  showEconomy: false,
  showIntel: false,

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
  cycleMapMode: () => set((s) => ({ mapMode: (s.mapMode === 'dark' ? 'satellite' : 'dark') as MapMode })),
  toggleElevation: () => set((s) => ({ showElevation: !s.showElevation })),
  toggleRadarLOS: () => set((s) => ({ showRadarLOS: !s.showRadarLOS })),

  toggleIntel: () => set((s) => ({ showIntel: !s.showIntel })),

  togglePanel: (panel) => {
    if (panel === 'orbat' || panel === 'stats' || panel === 'economy') {
      set((s) => {
        const next = s.leftPanel === panel ? null : panel
        return { leftPanel: next, showOrbat: next === 'orbat', showStats: next === 'stats', showEconomy: next === 'economy' }
      })
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
