import { create } from 'zustand'

interface ResearchStore {
  /** Currently selected tech category filter (null = show all) */
  selectedCategory: string | null
  /** Tech node being previewed / inspected */
  previewTechId: string | null

  // Actions
  selectCategory: (cat: string | null) => void
  previewTech: (id: string | null) => void
}

export const useResearchStore = create<ResearchStore>((set) => ({
  selectedCategory: null,
  previewTechId: null,

  selectCategory: (cat) => set({ selectedCategory: cat }),
  previewTech: (id) => set({ previewTechId: id }),
}))
