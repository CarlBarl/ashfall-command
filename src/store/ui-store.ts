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

export interface PanelOffset {
  dx: number
  dy: number
}

/** Mutable ref so Panel can swap its close callback without re-registering (which would reset focus order) */
export interface PanelCloseRef {
  current: (() => void) | undefined
}

interface PanelRegistration {
  closeRef: PanelCloseRef
  lastFocus: number
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

  // Intel suite v3
  liveFeedsOpen: boolean
  /** IMINT product open in the full-screen viewer (null = closed) */
  viewedProductId: string | null
  /** Contact the ISR FMV quadrant is staring at */
  fmvTargetId: UnitId | null

  // Camera focus request (consumed by GameMap)
  mapFocus: MapFocus | null

  // Auto-pause triggers (session-only, applied by AlertFeed)
  autoPause: AutoPauseSettings

  // Panel window management (session-only, keyed by panel title)
  panelOffsets: Record<string, PanelOffset>
  panelRegistry: Record<string, PanelRegistration>
  panelFocusCounter: number

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

  // Intel suite v3
  toggleLiveFeeds: () => void
  setViewedProduct: (id: string | null) => void
  setFmvTarget: (id: UnitId | null) => void

  // Camera focus
  focusMap: (lng: number, lat: number, zoom?: number) => void

  // Auto-pause
  toggleAutoPause: (key: keyof AutoPauseSettings) => void

  // Panel window management
  setPanelOffset: (title: string, offset: PanelOffset) => void
  registerPanel: (title: string, closeRef: PanelCloseRef) => void
  unregisterPanel: (title: string) => void
  focusPanel: (title: string) => void
  /** Closes the topmost registered panel that has a close callback; false if none */
  closeTopPanel: () => boolean
}

export const useUIStore = create<UIState>((set, get) => ({
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
  liveFeedsOpen: false,
  viewedProductId: null,
  fmvTargetId: null,
  mapFocus: null,
  autoPause: { warDeclared: true, ownUnitDestroyed: true, ceasefireOffered: true },
  panelOffsets: {},
  panelRegistry: {},
  panelFocusCounter: 0,

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

  toggleLiveFeeds: () => set((s) => ({ liveFeedsOpen: !s.liveFeedsOpen })),
  setViewedProduct: (id) => set({ viewedProductId: id }),
  setFmvTarget: (id) => set({ fmvTargetId: id }),

  focusMap: (lng, lat, zoom) => set((s) => ({
    mapFocus: { lng, lat, zoom, nonce: (s.mapFocus?.nonce ?? 0) + 1 },
  })),

  toggleAutoPause: (key) => set((s) => ({
    autoPause: { ...s.autoPause, [key]: !s.autoPause[key] },
  })),

  // Panel window management
  setPanelOffset: (title, offset) => set((s) => ({
    panelOffsets: { ...s.panelOffsets, [title]: offset },
  })),

  registerPanel: (title, closeRef) => set((s) => {
    const counter = s.panelFocusCounter + 1
    return {
      panelFocusCounter: counter,
      panelRegistry: { ...s.panelRegistry, [title]: { closeRef, lastFocus: counter } },
    }
  }),

  unregisterPanel: (title) => set((s) => {
    if (!(title in s.panelRegistry)) return {}
    const next = { ...s.panelRegistry }
    delete next[title]
    return { panelRegistry: next }
  }),

  focusPanel: (title) => set((s) => {
    const reg = s.panelRegistry[title]
    if (!reg) return {}
    const isTop = Object.values(s.panelRegistry).every((r) => r.lastFocus <= reg.lastFocus)
    if (isTop) return {}
    const counter = s.panelFocusCounter + 1
    return {
      panelFocusCounter: counter,
      panelRegistry: { ...s.panelRegistry, [title]: { ...reg, lastFocus: counter } },
    }
  }),

  closeTopPanel: () => {
    let top: PanelRegistration | undefined
    for (const reg of Object.values(get().panelRegistry)) {
      if (reg.closeRef.current && (!top || reg.lastFocus > top.lastFocus)) top = reg
    }
    if (!top) return false
    top.closeRef.current?.()
    return true
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
