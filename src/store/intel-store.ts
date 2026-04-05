import { create } from 'zustand'
import type { Position, UnitCategory, Sensor } from '@/types/game'
import type { UnitCatalogEntry } from '@/types/scenario'

export interface EstimatedUnit {
  id: string
  catalogId: string
  position: Position
  name: string
  category: UnitCategory
  sensors: Sensor[]
  confirmed: boolean
}

interface IntelState {
  estimatedUnits: EstimatedUnit[]
  placingCatalogId: string | null

  addEstimate: (entry: UnitCatalogEntry, position: Position) => void
  removeEstimate: (id: string) => void
  moveEstimate: (id: string, position: Position) => void
  confirmEstimate: (id: string) => void
  setPlacing: (catalogId: string | null) => void
  reset: () => void
}

let counter = 0

const INITIAL_STATE = {
  estimatedUnits: [] as EstimatedUnit[],
  placingCatalogId: null as string | null,
}

export const useIntelStore = create<IntelState>((set) => ({
  ...INITIAL_STATE,

  addEstimate: (entry, position) => set((s) => ({
    estimatedUnits: [
      ...s.estimatedUnits,
      {
        id: `intel_${counter++}`,
        catalogId: entry.id,
        position,
        name: entry.name,
        category: entry.category,
        sensors: entry.template.sensors ?? [],
        confirmed: false,
      },
    ],
    placingCatalogId: null,
  })),

  removeEstimate: (id) => set((s) => ({
    estimatedUnits: s.estimatedUnits.filter((u) => u.id !== id),
  })),

  moveEstimate: (id, position) => set((s) => ({
    estimatedUnits: s.estimatedUnits.map((u) =>
      u.id === id ? { ...u, position } : u,
    ),
  })),

  confirmEstimate: (id) => set((s) => ({
    estimatedUnits: s.estimatedUnits.map((u) =>
      u.id === id ? { ...u, confirmed: true } : u,
    ),
  })),

  setPlacing: (catalogId) => set({ placingCatalogId: catalogId }),

  reset: () => { counter = 0; set({ ...INITIAL_STATE }) },
}))
