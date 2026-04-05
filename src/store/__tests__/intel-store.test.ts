import { describe, it, expect, beforeEach } from 'vitest'
import { useIntelStore } from '../intel-store'
import type { UnitCatalogEntry } from '@/types/scenario'

// ── Mock catalog entry ─────────────────────────────────────────

const mockEntry: UnitCatalogEntry = {
  id: 'iran_s300',
  name: 'S-300PMU2 Battalion',
  nation: 'iran',
  category: 'sam_site',
  cost_millions: 300,
  description: 'Long-range SAM system',
  template: {
    name: 'S-300PMU2 Battalion',
    nation: 'iran',
    category: 'sam_site',
    heading: 0,
    speed_kts: 0,
    maxSpeed_kts: 0,
    health: 100,
    hardness: 100,
    logistics: 0,
    supplyStocks: [],
    weapons: [],
    sensors: [
      { type: 'radar', range_km: 300, detection_prob: 0.85 },
    ],
    roe: 'weapons_free',
  },
}

const mockEntryNoSensors: UnitCatalogEntry = {
  id: 'iran_missile_battery',
  name: 'Soumar Battery',
  nation: 'iran',
  category: 'missile_battery',
  cost_millions: 50,
  description: 'Ground-launched cruise missile',
  template: {
    name: 'Soumar Battery',
    nation: 'iran',
    category: 'missile_battery',
    heading: 0,
    speed_kts: 0,
    maxSpeed_kts: 0,
    health: 100,
    hardness: 80,
    logistics: 0,
    supplyStocks: [],
    weapons: [],
    sensors: [],
    roe: 'weapons_free',
  },
}

// ── Tests ───────────────────────────────────────────────────────

describe('intel-store', () => {
  beforeEach(() => {
    useIntelStore.getState().reset()
  })

  it('addEstimate adds a unit with correct fields', () => {
    const pos = { lat: 32.5, lng: 51.7 }
    useIntelStore.getState().addEstimate(mockEntry, pos)

    const { estimatedUnits } = useIntelStore.getState()
    expect(estimatedUnits).toHaveLength(1)

    const unit = estimatedUnits[0]
    expect(unit.catalogId).toBe('iran_s300')
    expect(unit.name).toBe('S-300PMU2 Battalion')
    expect(unit.category).toBe('sam_site')
    expect(unit.position).toEqual(pos)
    expect(unit.confirmed).toBe(false)
    expect(unit.sensors).toEqual([
      { type: 'radar', range_km: 300, detection_prob: 0.85 },
    ])
    expect(unit.id).toMatch(/^intel_/)
  })

  it('addEstimate handles entry with no sensors', () => {
    useIntelStore.getState().addEstimate(mockEntryNoSensors, { lat: 30, lng: 50 })

    const unit = useIntelStore.getState().estimatedUnits[0]
    expect(unit.sensors).toEqual([])
  })

  it('addEstimate clears placingCatalogId after placing', () => {
    useIntelStore.getState().setPlacing('iran_s300')
    expect(useIntelStore.getState().placingCatalogId).toBe('iran_s300')

    useIntelStore.getState().addEstimate(mockEntry, { lat: 32, lng: 51 })
    expect(useIntelStore.getState().placingCatalogId).toBeNull()
  })

  it('addEstimate generates unique IDs', () => {
    useIntelStore.getState().addEstimate(mockEntry, { lat: 32, lng: 51 })
    useIntelStore.getState().addEstimate(mockEntry, { lat: 33, lng: 52 })

    const ids = useIntelStore.getState().estimatedUnits.map(u => u.id)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('removeEstimate removes by id', () => {
    useIntelStore.getState().addEstimate(mockEntry, { lat: 32, lng: 51 })
    useIntelStore.getState().addEstimate(mockEntryNoSensors, { lat: 33, lng: 52 })

    const id = useIntelStore.getState().estimatedUnits[0].id
    useIntelStore.getState().removeEstimate(id)

    const { estimatedUnits } = useIntelStore.getState()
    expect(estimatedUnits).toHaveLength(1)
    expect(estimatedUnits[0].catalogId).toBe('iran_missile_battery')
  })

  it('removeEstimate with non-existent id does nothing', () => {
    useIntelStore.getState().addEstimate(mockEntry, { lat: 32, lng: 51 })
    useIntelStore.getState().removeEstimate('nonexistent')

    expect(useIntelStore.getState().estimatedUnits).toHaveLength(1)
  })

  it('moveEstimate updates position', () => {
    useIntelStore.getState().addEstimate(mockEntry, { lat: 32, lng: 51 })
    const id = useIntelStore.getState().estimatedUnits[0].id

    const newPos = { lat: 35.0, lng: 53.0 }
    useIntelStore.getState().moveEstimate(id, newPos)

    expect(useIntelStore.getState().estimatedUnits[0].position).toEqual(newPos)
  })

  it('confirmEstimate sets confirmed to true', () => {
    useIntelStore.getState().addEstimate(mockEntry, { lat: 32, lng: 51 })
    const id = useIntelStore.getState().estimatedUnits[0].id

    expect(useIntelStore.getState().estimatedUnits[0].confirmed).toBe(false)
    useIntelStore.getState().confirmEstimate(id)
    expect(useIntelStore.getState().estimatedUnits[0].confirmed).toBe(true)
  })

  it('setPlacing sets and clears placingCatalogId', () => {
    expect(useIntelStore.getState().placingCatalogId).toBeNull()

    useIntelStore.getState().setPlacing('iran_s300')
    expect(useIntelStore.getState().placingCatalogId).toBe('iran_s300')

    useIntelStore.getState().setPlacing(null)
    expect(useIntelStore.getState().placingCatalogId).toBeNull()
  })

  it('reset clears everything', () => {
    useIntelStore.getState().addEstimate(mockEntry, { lat: 32, lng: 51 })
    useIntelStore.getState().setPlacing('iran_s300')

    expect(useIntelStore.getState().estimatedUnits).toHaveLength(1)
    expect(useIntelStore.getState().placingCatalogId).toBe('iran_s300')

    useIntelStore.getState().reset()

    expect(useIntelStore.getState().estimatedUnits).toHaveLength(0)
    expect(useIntelStore.getState().placingCatalogId).toBeNull()
  })
})
