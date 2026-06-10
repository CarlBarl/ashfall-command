import { create } from 'zustand'
import type { UnitId } from '@/types/game'
import type { MapMode } from '@/styles/map-providers'

export type LeftPanel = 'orbat' | 'stats' | 'economy' | null

export interface MapFocus {
  lng: number
  lat: number
  zoom?: number
  /** Increments per request so refocusing the same spot still triggers consumers */
  nonce: number
}

export interface AutoPauseSettings {
  warDeclared: boolean
  ownUnitDestroyed: boolean
  ceasefireOffered: boolean
}

interface UIState {
  // Selection
  selectedUnitIds: Set<UnitId>
  selectedUnitId: UnitId | null
  hoveredUnitId: UnitId | null
  // Map overlays
  rngFilter: 'off' | 'friendly' | 'enemy' | 'both'

  // Map display
  mapMode: MapMode
  showElevation: boolean

  // Left sidebar — radio group (only one at a time)
  leftPanel: LeftPanel

  // Backward compat booleans (derived from leftPanel)
  showOrbat: boolean
  showStats: boolean
  showEconomy: boolean

  // Right-side panels (independent toggles)
  showIntel: boolean

  // Camera focus request (consumed by GameMap)
  mapFocus: MapFocus | null

  // Auto-pause triggers (session-only, applied by AlertFeed)
  autoPause: AutoPauseSettings

  // Actions — selection
  selectUnit: (id: UnitId | null) => void
  toggleUnitSelection: (id: UnitId) => void
  selectMultipleUnits: (ids: UnitId[]) => void
  clearSelection: () => void
  hoverUnit: (id: UnitId | null) => void
  // Map overlays
  showIntelCoverage: boolean
  losFilter: 'off' | 'friendly' | 'enemy' | 'both'

  // Actions — map
  cycleMapMode: () => void
  toggleElevation: () => void
  toggleIntelCoverage: () => void

  // Actions — panels
  setLeftPanel: (panel: LeftPanel) => void
  toggleLeftPanel: (panel: 'orbat' | 'stats' | 'economy') => void

  // Right-side panels
  toggleIntel: () => void

  // Camera focus
  focusMap: (lng: number, lat: number, zoom?: number) => void

  // Auto-pause
  toggleAutoPause: (key: keyof AutoPauseSettings) => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedUnitIds: new Set(),
  selectedUnitId: null,
  hoveredUnitId: null,
  mapMode: 'dark' as MapMode,
  showElevation: false,
  showIntelCoverage: false,
  losFilter: 'off' as 'off' | 'friendly' | 'enemy' | 'both',
  rngFilter: 'off' as 'off' | 'friendly' | 'enemy' | 'both',
  leftPanel: null,
  showOrbat: false,
  showStats: false,
  showEconomy: false,
  showIntel: false,
  mapFocus: null,
  autoPause: { warDeclared: true, ownUnitDestroyed: true, ceasefireOffered: true },

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
  cycleMapMode: () => set((s) => ({ mapMode: (s.mapMode === 'dark' ? 'satellite' : 'dark') as MapMode })),
  toggleElevation: () => set((s) => ({ showElevation: !s.showElevation })),
  toggleIntelCoverage: () => set((s) => ({ showIntelCoverage: !s.showIntelCoverage })),

  toggleIntel: () => set((s) => ({ showIntel: !s.showIntel })),

  focusMap: (lng, lat, zoom) => set((s) => ({
    mapFocus: { lng, lat, zoom, nonce: (s.mapFocus?.nonce ?? 0) + 1 },
  })),

  toggleAutoPause: (key) => set((s) => ({
    autoPause: { ...s.autoPause, [key]: !s.autoPause[key] },
  })),

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
