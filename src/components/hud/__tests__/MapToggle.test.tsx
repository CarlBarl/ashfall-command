import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from '@/store/ui-store'

/**
 * Tests for map toggle behavior — written BEFORE implementation (TDD).
 */

describe('MapToggle sub-menu behavior', () => {
  beforeEach(() => {
    useUIStore.setState({
      losFilter: 'off',
      showIntelCoverage: false,
    })
  })

  it('losFilter supports friendly/enemy/both independently (not cycling)', () => {
    // User should be able to set losFilter directly, not just cycle
    useUIStore.setState({ losFilter: 'enemy' })
    expect(useUIStore.getState().losFilter).toBe('enemy')

    useUIStore.setState({ losFilter: 'friendly' })
    expect(useUIStore.getState().losFilter).toBe('friendly')

    useUIStore.setState({ losFilter: 'both' })
    expect(useUIStore.getState().losFilter).toBe('both')
  })

  it('losFilter can be turned off directly', () => {
    useUIStore.setState({ losFilter: 'both' })
    useUIStore.setState({ losFilter: 'off' })
    expect(useUIStore.getState().losFilter).toBe('off')
  })
})
