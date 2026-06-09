import { create } from 'zustand'
import type { UnitId, Position } from '@/types/game'
import type { AttackPriority, TimingMode, AttackPlan } from '@/types/attack-plan'

export type StrikeMode = 'direct' | 'plan'

export interface ClusterTarget {
  id: string
  name: string
}

interface StrikeStore {
  // Panel visibility
  open: boolean
  mode: StrikeMode

  // Single target (for direct fire mode)
  targetUnitId: UnitId | null
  targetingMode: boolean
  // Cluster targeting (multi-target direct fire)
  strikeClusterUnits: ClusterTarget[]
  /** Launcher the direct-fire panel will actually fire from (map route preview reads this) */
  activeLauncherId: UnitId | null

  // Plan mode (presidential planner)
  planPriorities: AttackPriority[]
  planTiming: TimingMode
  planName: string
  computedPlan: AttackPlan | null

  // Route planning
  routingMode: boolean
  routeWaypoints: Position[]

  // Execution
  executing: boolean
  executionProgress: number

  // Actions — panel
  openStrike: (mode?: StrikeMode) => void
  closeStrike: () => void
  setMode: (mode: StrikeMode) => void

  // Actions — targeting
  setTargetUnitId: (id: UnitId | null) => void
  setTargetingMode: (on: boolean) => void
  setStrikeCluster: (units: ClusterTarget[]) => void
  setActiveLauncherId: (id: UnitId | null) => void

  // Actions — plan mode
  addPlanPriority: (p: AttackPriority) => void
  removePlanPriority: (id: string) => void
  updatePlanPriority: (id: string, changes: Partial<AttackPriority>) => void
  reorderPlanPriorities: (from: number, to: number) => void
  setPlanTiming: (t: TimingMode) => void
  setComputedPlan: (plan: AttackPlan | null) => void

  // Actions — route planning
  setRoutingMode: (on: boolean) => void
  addRouteWaypoint: (pos: Position) => void
  removeRouteWaypoint: (index: number) => void
  clearRouteWaypoints: () => void

  // Actions — execution
  startExecution: () => void
  updateProgress: (p: number) => void
  finishExecution: () => void

  // Reset
  reset: () => void
}

const INITIAL_STATE = {
  open: false,
  mode: 'direct' as StrikeMode,
  targetUnitId: null,
  targetingMode: false,
  strikeClusterUnits: [] as ClusterTarget[],
  activeLauncherId: null,
  routingMode: false,
  routeWaypoints: [] as Position[],
  planPriorities: [],
  planTiming: 'simultaneous' as TimingMode,
  planName: 'Strike Plan Alpha',
  computedPlan: null,
  executing: false,
  executionProgress: 0,
}

export const useStrikeStore = create<StrikeStore>((set) => ({
  ...INITIAL_STATE,

  // Panel
  openStrike: (mode = 'direct') => set({ open: true, mode }),
  // Also clear the direct-fire target — otherwise autoShowDirect reopens the panel instantly
  closeStrike: () => set({ open: false, targetUnitId: null, targetingMode: false, routingMode: false }),
  setMode: (mode) => set({ mode, open: true }),

  // Targeting
  setTargetUnitId: (id) => set(id
    ? { targetUnitId: id, targetingMode: false, open: true, mode: 'direct' as StrikeMode, strikeClusterUnits: [] }
    : { targetUnitId: null, targetingMode: false, strikeClusterUnits: [] }
  ),
  setTargetingMode: (on) => set({ targetingMode: on }),
  setActiveLauncherId: (activeLauncherId) => set({ activeLauncherId }),
  setStrikeCluster: (units) => set({
    strikeClusterUnits: units,
    targetUnitId: null,
    targetingMode: false,
    open: true,
    mode: 'direct' as StrikeMode,
  }),

  // Plan mode
  addPlanPriority: (p) => set((s) => ({ planPriorities: [...s.planPriorities, p] })),
  removePlanPriority: (id) => set((s) => ({ planPriorities: s.planPriorities.filter(p => p.id !== id) })),
  updatePlanPriority: (id, changes) => set((s) => ({
    planPriorities: s.planPriorities.map(p => p.id === id ? { ...p, ...changes } : p),
  })),
  reorderPlanPriorities: (from, to) => set((s) => {
    const arr = [...s.planPriorities]
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    return { planPriorities: arr }
  }),
  setPlanTiming: (planTiming) => set({ planTiming }),
  setComputedPlan: (computedPlan) => set({ computedPlan }),

  // Route planning
  setRoutingMode: (on) => set({ routingMode: on, routeWaypoints: [] }),
  addRouteWaypoint: (pos) => set((s) => ({ routeWaypoints: [...s.routeWaypoints, pos] })),
  removeRouteWaypoint: (index) => set((s) => ({
    routeWaypoints: s.routeWaypoints.filter((_, i) => i !== index),
  })),
  clearRouteWaypoints: () => set({ routeWaypoints: [] }),

  // Execution
  startExecution: () => set({ executing: true, executionProgress: 0 }),
  updateProgress: (p) => set({ executionProgress: p }),
  finishExecution: () => set({ executing: false, executionProgress: 1 }),

  // Reset
  reset: () => set(INITIAL_STATE),
}))
