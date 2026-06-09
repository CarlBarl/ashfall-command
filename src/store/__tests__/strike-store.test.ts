import { describe, it, expect, beforeEach } from 'vitest'
import { useStrikeStore } from '../strike-store'

describe('strike-store panel lifecycle', () => {
  beforeEach(() => {
    useStrikeStore.getState().reset()
  })

  it('closeStrike clears the direct-fire target so autoShowDirect cannot reopen the panel', () => {
    useStrikeStore.getState().setTargetUnitId('iran_1')
    expect(useStrikeStore.getState().open).toBe(true)

    useStrikeStore.getState().closeStrike()
    const s = useStrikeStore.getState()
    expect(s.open).toBe(false)
    expect(s.targetUnitId).toBeNull()
  })

  it('closeStrike exits targeting and routing modes', () => {
    useStrikeStore.getState().setTargetingMode(true)
    useStrikeStore.getState().setRoutingMode(true)

    useStrikeStore.getState().closeStrike()
    const s = useStrikeStore.getState()
    expect(s.targetingMode).toBe(false)
    expect(s.routingMode).toBe(false)
  })

  it('clearing the target keeps the panel open in the empty-target state', () => {
    useStrikeStore.getState().setTargetUnitId('iran_1')
    useStrikeStore.getState().setTargetUnitId(null)

    const s = useStrikeStore.getState()
    expect(s.open).toBe(true)
    expect(s.targetUnitId).toBeNull()
  })

  it('setActiveLauncherId exposes the firing launcher for the map preview', () => {
    useStrikeStore.getState().setActiveLauncherId('ddg_89')
    expect(useStrikeStore.getState().activeLauncherId).toBe('ddg_89')

    useStrikeStore.getState().setActiveLauncherId(null)
    expect(useStrikeStore.getState().activeLauncherId).toBeNull()
  })
})
