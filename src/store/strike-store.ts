import { create } from 'zustand'
import type { UnitId, WeaponId, UnitCategory } from '@/types/game'
import type { AttackPriority, TimingMode, AttackPlan } from '@/types/attack-plan'
import type { UnitCluster } from '@/components/map/layers/cluster'

export type StrikeMode = 'direct' | 'configure' | 'plan'

export interface LauncherAllocation {
  unitId: UnitId
  unitName: string
  weaponId: WeaponId
  count: number
  maxAvailable: number
}

export interface StrikeTarget {
  unitId: UnitId
  name: string
  category: UnitCategory
  health: number
  checked: boolean
}

interface StrikeStore {
  // Panel visibility
  open: boolean
  mode: StrikeMode

  // Target cluster (set when TARGET GROUP is clicked)
  strikeCluster: UnitCluster | null
  // Individual targets within the cluster (with checkboxes)
  targets: StrikeTarget[]
  // Single target (for direct fire mode)
  targetUnitId: UnitId | null
  targetingMode: boolean

  // Launcher allocations (per-launcher weapon counts)
  allocations: LauncherAllocation[]

  // Configure mode settings
  severity: 'surgical' | 'standard' | 'overwhelming'
  seadFirst: boolean
  distribution: 'even' | 'weighted' | 'manual'

  // Plan mode (presidential planner)
  planPriorities: AttackPriority[]
  planTiming: TimingMode
  planName: string
  computedPlan: AttackPlan | null

  // Execution
  executing: boolean
  executionProgress: number

  // Actions — panel
  openStrike: (mode?: StrikeMode) => void
  closeStrike: () => void
  setMode: (mode: StrikeMode) => void

  // Actions — targeting
  setStrikeCluster: (cluster: UnitCluster) => void
  setTargetUnitId: (id: UnitId | null) => void
  setTargetingMode: (on: boolean) => void
  toggleTargetCheck: (unitId: UnitId) => void
  setTargets: (targets: StrikeTarget[]) => void

  // Actions — allocation
  setAllocations: (allocs: LauncherAllocation[]) => void
  updateAllocation: (unitId: UnitId, weaponId: WeaponId, count: number) => void

  // Actions — configure
  setSeverity: (s: 'surgical' | 'standard' | 'overwhelming') => void
  setSeadFirst: (on: boolean) => void
  setDistribution: (d: 'even' | 'weighted' | 'manual') => void

  // Actions — plan mode
  addPlanPriority: (p: AttackPriority) => void
  removePlanPriority: (id: string) => void
  updatePlanPriority: (id: string, changes: Partial<AttackPriority>) => void
  reorderPlanPriorities: (from: number, to: number) => void
  setPlanTiming: (t: TimingMode) => void
  setComputedPlan: (plan: AttackPlan | null) => void

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
  strikeCluster: null,
  targets: [],
  targetUnitId: null,
  targetingMode: false,
  allocations: [],
  severity: 'standard' as const,
  seadFirst: true,
  distribution: 'even' as const,
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
  closeStrike: () => set({ open: false }),
  setMode: (mode) => set({ mode, open: true }),

  // Targeting
  setStrikeCluster: (cluster) => set({
    strikeCluster: cluster,
    targets: cluster.units.map(u => ({
      unitId: u.id,
      name: u.name,
      category: u.category,
      health: u.health,
      checked: true,
    })),
    targetUnitId: cluster.primary.id, // auto-set for DIRECT FIRE tab
    open: true,
    mode: 'configure',
  }),
  setTargetUnitId: (id) => set(id
    ? { targetUnitId: id, targetingMode: false, open: true, mode: 'direct' as StrikeMode }
    : { targetUnitId: null, targetingMode: false, open: false }
  ),
  setTargetingMode: (on) => set({ targetingMode: on }),
  toggleTargetCheck: (unitId) => set((s) => ({
    targets: s.targets.map(t => t.unitId === unitId ? { ...t, checked: !t.checked } : t),
  })),
  setTargets: (targets) => set({ targets }),

  // Allocation
  setAllocations: (allocs) => set({ allocations: allocs }),
  updateAllocation: (unitId, weaponId, count) => set((s) => ({
    allocations: s.allocations.map(a =>
      a.unitId === unitId && a.weaponId === weaponId ? { ...a, count: Math.max(0, Math.min(count, a.maxAvailable)) } : a
    ),
  })),

  // Configure
  setSeverity: (severity) => set({ severity }),
  setSeadFirst: (seadFirst) => set({ seadFirst }),
  setDistribution: (distribution) => set({ distribution }),

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

  // Execution
  startExecution: () => set({ executing: true, executionProgress: 0 }),
  updateProgress: (p) => set({ executionProgress: p }),
  finishExecution: () => set({ executing: false, executionProgress: 1 }),

  // Reset
  reset: () => set(INITIAL_STATE),
}))
