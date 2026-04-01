import { create } from 'zustand'
import type { AttackPlan, AttackPriority, TimingMode } from '@/types/attack-plan'

interface AttackPlanStore {
  draftPriorities: AttackPriority[]
  draftTiming: TimingMode
  draftName: string
  computedPlan: AttackPlan | null
  executing: boolean
  executionProgress: number

  addPriority: (p: AttackPriority) => void
  removePriority: (id: string) => void
  updatePriority: (id: string, changes: Partial<AttackPriority>) => void
  reorderPriorities: (fromIdx: number, toIdx: number) => void
  setTiming: (t: TimingMode) => void
  setName: (n: string) => void
  setComputedPlan: (plan: AttackPlan | null) => void
  startExecution: () => void
  updateProgress: (p: number) => void
  finishExecution: () => void
  reset: () => void
}

export const useAttackPlanStore = create<AttackPlanStore>((set) => ({
  draftPriorities: [],
  draftTiming: 'simultaneous',
  draftName: 'Strike Plan Alpha',
  computedPlan: null,
  executing: false,
  executionProgress: 0,

  addPriority: (p) =>
    set((s) => ({ draftPriorities: [...s.draftPriorities, p] })),

  removePriority: (id) =>
    set((s) => ({
      draftPriorities: s.draftPriorities.filter((p) => p.id !== id),
    })),

  updatePriority: (id, changes) =>
    set((s) => ({
      draftPriorities: s.draftPriorities.map((p) =>
        p.id === id ? { ...p, ...changes } : p,
      ),
    })),

  reorderPriorities: (fromIdx, toIdx) =>
    set((s) => {
      const arr = [...s.draftPriorities]
      if (
        fromIdx < 0 ||
        fromIdx >= arr.length ||
        toIdx < 0 ||
        toIdx >= arr.length
      ) {
        return s
      }
      const [moved] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, moved)
      return { draftPriorities: arr }
    }),

  setTiming: (t) => set({ draftTiming: t }),

  setName: (n) => set({ draftName: n }),

  setComputedPlan: (plan) => set({ computedPlan: plan }),

  startExecution: () => set({ executing: true, executionProgress: 0 }),

  updateProgress: (p) => set({ executionProgress: p }),

  finishExecution: () => set({ executing: false, executionProgress: 1 }),

  reset: () =>
    set({
      draftPriorities: [],
      draftTiming: 'simultaneous',
      draftName: 'Strike Plan Alpha',
      computedPlan: null,
      executing: false,
      executionProgress: 0,
    }),
}))
