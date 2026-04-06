import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from '../ui-store'

// ── Reset store before each test ─────────────────────────────────

beforeEach(() => {
  const store = useUIStore.getState()
  // Reset to initial state
  store.clearSelection()
  store.hoverUnit(null)
  store.clearSelectedFrontline()
  store.setHoveredFrontline(null)
  // Reset map toggles to false
  if (store.showRangeRings) store.toggleRangeRings()
  if (store.showElevation) store.toggleElevation()
  if (store.losFilter !== 'off') useUIStore.setState({ losFilter: 'off' })
  if (store.showIntel) store.toggleIntel()
  // Reset map mode to dark
  if (store.mapMode !== 'dark') store.cycleMapMode()
  // Reset left panel
  store.setLeftPanel(null)
})

// ── Selection tests ───────────────────────────────────────────────

describe('selectUnit', () => {
  it('selects a single unit', () => {
    useUIStore.getState().selectUnit('unit_1')
    const state = useUIStore.getState()
    expect(state.selectedUnitId).toBe('unit_1')
    expect(state.selectedUnitIds.has('unit_1')).toBe(true)
    expect(state.selectedUnitIds.size).toBe(1)
  })

  it('replaces previous selection', () => {
    useUIStore.getState().selectUnit('unit_1')
    useUIStore.getState().selectUnit('unit_2')
    const state = useUIStore.getState()
    expect(state.selectedUnitId).toBe('unit_2')
    expect(state.selectedUnitIds.has('unit_1')).toBe(false)
    expect(state.selectedUnitIds.has('unit_2')).toBe(true)
  })

  it('clears selection when null is passed', () => {
    useUIStore.getState().selectUnit('unit_1')
    useUIStore.getState().selectUnit(null)
    const state = useUIStore.getState()
    expect(state.selectedUnitId).toBeNull()
    expect(state.selectedUnitIds.size).toBe(0)
  })
})

describe('clearSelection', () => {
  it('clears all selected units', () => {
    useUIStore.getState().selectMultipleUnits(['unit_1', 'unit_2', 'unit_3'])
    useUIStore.getState().clearSelection()
    const state = useUIStore.getState()
    expect(state.selectedUnitId).toBeNull()
    expect(state.selectedUnitIds.size).toBe(0)
  })
})

describe('toggleUnitSelection', () => {
  it('adds unit to selection', () => {
    useUIStore.getState().selectUnit('unit_1')
    useUIStore.getState().toggleUnitSelection('unit_2')
    const state = useUIStore.getState()
    expect(state.selectedUnitIds.size).toBe(2)
    expect(state.selectedUnitIds.has('unit_1')).toBe(true)
    expect(state.selectedUnitIds.has('unit_2')).toBe(true)
  })

  it('removes unit from selection if already selected', () => {
    useUIStore.getState().selectMultipleUnits(['unit_1', 'unit_2'])
    useUIStore.getState().toggleUnitSelection('unit_1')
    const state = useUIStore.getState()
    expect(state.selectedUnitIds.has('unit_1')).toBe(false)
    expect(state.selectedUnitIds.has('unit_2')).toBe(true)
  })
})

describe('selectMultipleUnits', () => {
  it('selects multiple units at once', () => {
    useUIStore.getState().selectMultipleUnits(['unit_1', 'unit_2', 'unit_3'])
    const state = useUIStore.getState()
    expect(state.selectedUnitIds.size).toBe(3)
    expect(state.selectedUnitId).toBe('unit_1') // first one becomes primary
  })

  it('sets selectedUnitId to null for empty array', () => {
    useUIStore.getState().selectMultipleUnits([])
    const state = useUIStore.getState()
    expect(state.selectedUnitId).toBeNull()
    expect(state.selectedUnitIds.size).toBe(0)
  })
})

describe('hoverUnit', () => {
  it('sets hovered unit', () => {
    useUIStore.getState().hoverUnit('unit_1')
    expect(useUIStore.getState().hoveredUnitId).toBe('unit_1')
  })

  it('clears hovered unit when null is passed', () => {
    useUIStore.getState().hoverUnit('unit_1')
    useUIStore.getState().hoverUnit(null)
    expect(useUIStore.getState().hoveredUnitId).toBeNull()
  })
})

describe('frontline selection', () => {
  it('stores the selected frontline id', () => {
    useUIStore.getState().setSelectedFrontline('frontline-a')
    expect(useUIStore.getState().selectedFrontlineId).toBe('frontline-a')
  })

  it('clears the selected frontline id', () => {
    useUIStore.getState().setSelectedFrontline('frontline-a')
    useUIStore.getState().clearSelectedFrontline()
    expect(useUIStore.getState().selectedFrontlineId).toBeNull()
  })

  it('stores the hovered frontline id', () => {
    useUIStore.getState().setHoveredFrontline('frontline-b')
    expect(useUIStore.getState().hoveredFrontlineId).toBe('frontline-b')
  })
})

// ── Map mode tests ────────────────────────────────────────────────

describe('cycleMapMode', () => {
  it('cycles from dark to satellite', () => {
    expect(useUIStore.getState().mapMode).toBe('dark')
    useUIStore.getState().cycleMapMode()
    expect(useUIStore.getState().mapMode).toBe('satellite')
  })

  it('cycles from satellite back to dark', () => {
    useUIStore.getState().cycleMapMode() // dark -> satellite
    useUIStore.getState().cycleMapMode() // satellite -> dark
    expect(useUIStore.getState().mapMode).toBe('dark')
  })
})

// ── Toggle tests ──────────────────────────────────────────────────

describe('toggleElevation', () => {
  it('toggles elevation overlay on', () => {
    expect(useUIStore.getState().showElevation).toBe(false)
    useUIStore.getState().toggleElevation()
    expect(useUIStore.getState().showElevation).toBe(true)
  })

  it('toggles elevation overlay off', () => {
    useUIStore.getState().toggleElevation()
    useUIStore.getState().toggleElevation()
    expect(useUIStore.getState().showElevation).toBe(false)
  })
})

describe('cycleLOSFilter', () => {
  it('cycles through off → both → friendly → enemy → off', () => {
    expect(useUIStore.getState().losFilter).toBe('off')
    useUIStore.getState().cycleLOSFilter()
    expect(useUIStore.getState().losFilter).toBe('both')
    useUIStore.getState().cycleLOSFilter()
    expect(useUIStore.getState().losFilter).toBe('friendly')
    useUIStore.getState().cycleLOSFilter()
    expect(useUIStore.getState().losFilter).toBe('enemy')
    useUIStore.getState().cycleLOSFilter()
    expect(useUIStore.getState().losFilter).toBe('off')
  })
})

describe('toggleRangeRings', () => {
  it('toggles range rings on', () => {
    expect(useUIStore.getState().showRangeRings).toBe(false)
    useUIStore.getState().toggleRangeRings()
    expect(useUIStore.getState().showRangeRings).toBe(true)
  })

  it('toggles range rings off', () => {
    useUIStore.getState().toggleRangeRings()
    useUIStore.getState().toggleRangeRings()
    expect(useUIStore.getState().showRangeRings).toBe(false)
  })
})

describe('toggleIntel', () => {
  it('toggles intel panel on', () => {
    expect(useUIStore.getState().showIntel).toBe(false)
    useUIStore.getState().toggleIntel()
    expect(useUIStore.getState().showIntel).toBe(true)
  })

  it('toggles intel panel off', () => {
    useUIStore.getState().toggleIntel()
    useUIStore.getState().toggleIntel()
    expect(useUIStore.getState().showIntel).toBe(false)
  })
})

// ── Left panel tests ──────────────────────────────────────────────

describe('setLeftPanel', () => {
  it('sets left panel to orbat', () => {
    useUIStore.getState().setLeftPanel('orbat')
    const state = useUIStore.getState()
    expect(state.leftPanel).toBe('orbat')
    expect(state.showOrbat).toBe(true)
    expect(state.showStats).toBe(false)
    expect(state.showEconomy).toBe(false)
  })

  it('sets left panel to stats', () => {
    useUIStore.getState().setLeftPanel('stats')
    const state = useUIStore.getState()
    expect(state.leftPanel).toBe('stats')
    expect(state.showOrbat).toBe(false)
    expect(state.showStats).toBe(true)
    expect(state.showEconomy).toBe(false)
  })

  it('sets left panel to null (close all)', () => {
    useUIStore.getState().setLeftPanel('orbat')
    useUIStore.getState().setLeftPanel(null)
    const state = useUIStore.getState()
    expect(state.leftPanel).toBeNull()
    expect(state.showOrbat).toBe(false)
    expect(state.showStats).toBe(false)
    expect(state.showEconomy).toBe(false)
  })
})

describe('toggleLeftPanel', () => {
  it('opens panel when closed', () => {
    useUIStore.getState().toggleLeftPanel('economy')
    const state = useUIStore.getState()
    expect(state.leftPanel).toBe('economy')
    expect(state.showEconomy).toBe(true)
  })

  it('closes panel when already open (toggle off)', () => {
    useUIStore.getState().toggleLeftPanel('economy')
    useUIStore.getState().toggleLeftPanel('economy')
    const state = useUIStore.getState()
    expect(state.leftPanel).toBeNull()
    expect(state.showEconomy).toBe(false)
  })

  it('switches from one panel to another (radio group behavior)', () => {
    useUIStore.getState().toggleLeftPanel('orbat')
    useUIStore.getState().toggleLeftPanel('stats')
    const state = useUIStore.getState()
    expect(state.leftPanel).toBe('stats')
    expect(state.showOrbat).toBe(false)
    expect(state.showStats).toBe(true)
  })
})

describe('togglePanel (legacy compat)', () => {
  it('toggles left panel via string name', () => {
    useUIStore.getState().togglePanel('orbat')
    expect(useUIStore.getState().leftPanel).toBe('orbat')
    expect(useUIStore.getState().showOrbat).toBe(true)

    useUIStore.getState().togglePanel('orbat')
    expect(useUIStore.getState().leftPanel).toBeNull()
    expect(useUIStore.getState().showOrbat).toBe(false)
  })

  it('ignores unknown panel names', () => {
    useUIStore.getState().togglePanel('unknown_panel')
    const state = useUIStore.getState()
    expect(state.leftPanel).toBeNull()
  })
})
