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

  it('losFilter accepts off, both, friendly, enemy', () => {
    expect(useUIStore.getState().losFilter).toBe('off')
    for (const f of ['both', 'friendly', 'enemy', 'off'] as const) {
      useUIStore.setState({ losFilter: f })
      expect(useUIStore.getState().losFilter).toBe(f)
    }
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
    useUIStore.setState({ losFilter: 'both' })
    useUIStore.getState().toggleIntelCoverage()

    const s = useUIStore.getState()
    expect(s.showElevation).toBe(true)
    expect(s.losFilter).toBe('both')
    expect(s.showIntelCoverage).toBe(true)
    expect(s.mapMode).toBe('dark') // unchanged
  })
})
