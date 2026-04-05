import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from '../ui-store'

describe('map toggle state', () => {
  beforeEach(() => {
    // Reset store between tests
    useUIStore.setState({
      mapMode: 'dark',
      showElevation: false,
      losFilter: 'off',
      showIntelCoverage: false,
    })
  })

  it('cycleMapMode toggles between dark and satellite', () => {
    expect(useUIStore.getState().mapMode).toBe('dark')
    useUIStore.getState().cycleMapMode()
    expect(useUIStore.getState().mapMode).toBe('satellite')
    useUIStore.getState().cycleMapMode()
    expect(useUIStore.getState().mapMode).toBe('dark')
  })

  it('toggleElevation flips showElevation', () => {
    expect(useUIStore.getState().showElevation).toBe(false)
    useUIStore.getState().toggleElevation()
    expect(useUIStore.getState().showElevation).toBe(true)
    useUIStore.getState().toggleElevation()
    expect(useUIStore.getState().showElevation).toBe(false)
  })

  it('cycleLOSFilter cycles off → both → friendly → enemy → off', () => {
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

  it('toggleIntelCoverage flips showIntelCoverage', () => {
    expect(useUIStore.getState().showIntelCoverage).toBe(false)
    useUIStore.getState().toggleIntelCoverage()
    expect(useUIStore.getState().showIntelCoverage).toBe(true)
    useUIStore.getState().toggleIntelCoverage()
    expect(useUIStore.getState().showIntelCoverage).toBe(false)
  })

  it('all map toggles are independent', () => {
    useUIStore.getState().toggleElevation()
    useUIStore.getState().cycleLOSFilter()
    useUIStore.getState().toggleIntelCoverage()

    const s = useUIStore.getState()
    expect(s.showElevation).toBe(true)
    expect(s.losFilter).toBe('both') // cycled once from 'off'
    expect(s.showIntelCoverage).toBe(true)
    expect(s.mapMode).toBe('dark') // unchanged
  })
})
