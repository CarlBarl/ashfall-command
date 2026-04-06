import { create } from 'zustand'

interface GroundStore {
  /** Currently selected army group in the General panel */
  selectedArmyGroupId: string | null
  /** Currently selected general (usually derived from army group) */
  selectedGeneralId: string | null
  /** True when the player is clicking the map to set an objective */
  orderingMode: boolean
  /** Target position set by map click (lat/lng for the objective marker) */
  orderTarget: { lat: number; lng: number } | null

  // Actions
  selectArmyGroup: (id: string | null) => void
  selectGeneral: (id: string | null) => void
  setOrderingMode: (on: boolean) => void
  setOrderTarget: (pos: { lat: number; lng: number } | null) => void
}

export const useGroundStore = create<GroundStore>((set) => ({
  selectedArmyGroupId: null,
  selectedGeneralId: null,
  orderingMode: false,
  orderTarget: null,

  selectArmyGroup: (id) => set({ selectedArmyGroupId: id }),
  selectGeneral: (id) => set({ selectedGeneralId: id }),
  setOrderingMode: (on) => set({ orderingMode: on, orderTarget: on ? null : null }),
  setOrderTarget: (pos) => set({ orderTarget: pos, orderingMode: false }),
}))
