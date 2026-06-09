import { describe, it, expect } from 'vitest'
// Import the registry exactly like main-thread consumers (StrikePanel, attack-planner)
// do — without the worker-only game-engine side-effect imports.
import { weaponSpecs } from '@/data/weapons/missiles'
import { adSystems } from '@/data/weapons/air-defense'
import { pointDefenseSpecs } from '@/data/weapons/point-defense'
import { usaUnits } from '@/data/units/usa-orbat'
import { iranUnits } from '@/data/units/iran-orbat'
import { usaCatalog } from '@/data/catalog/usa-catalog'
import { iranCatalog } from '@/data/catalog/iran-catalog'
import { usaBaseSupply, usaSupplyLines } from '@/data/supply/usa-supply'
import { iranBaseSupply, iranSupplyLines } from '@/data/supply/iran-supply'

const allUnits = [...usaUnits, ...iranUnits]
const allCatalogs = [...usaCatalog, ...iranCatalog]
const allBaseSupply = { ...usaBaseSupply, ...iranBaseSupply }
const allSupplyLines = [...usaSupplyLines, ...iranSupplyLines]
const unitIds = new Set(allUnits.map(u => u.id))

describe('weapon registry (main-thread view)', () => {
  it('registers Shahed drone specs without the worker bundle', () => {
    for (const id of ['shahed_136', 'shahed_131', 'shahed_238']) {
      expect(weaponSpecs[id], id).toBeDefined()
      expect(weaponSpecs[id].type).toBe('loitering_munition')
    }
  })

  it('applies interceptor pK vs loitering munitions at module load', () => {
    expect(weaponSpecs.pac3_mse.pk.loitering_munition).toBe(0.95)
    expect(weaponSpecs.sm2_iiia.pk.loitering_munition).toBe(0.85)
    expect(weaponSpecs.tor_m1_int.pk.loitering_munition).toBe(0.80)
  })

  it('resolves every ORBAT weaponId', () => {
    for (const unit of allUnits) {
      for (const w of unit.weapons) {
        expect(weaponSpecs[w.weaponId], `${unit.id} -> ${w.weaponId}`).toBeDefined()
      }
    }
  })

  it('resolves every catalog template weaponId', () => {
    for (const entry of allCatalogs) {
      for (const w of entry.template.weapons) {
        expect(weaponSpecs[w.weaponId], `${entry.id} -> ${w.weaponId}`).toBeDefined()
      }
    }
  })

  it('resolves every base supply stock weaponId', () => {
    for (const [baseId, stocks] of Object.entries(allBaseSupply)) {
      for (const s of stocks) {
        expect(weaponSpecs[s.weaponId], `${baseId} -> ${s.weaponId}`).toBeDefined()
      }
    }
  })

  it('resolves every point-defense specId', () => {
    for (const unit of [...allUnits, ...allCatalogs.map(c => c.template)]) {
      for (const pd of unit.pointDefense ?? []) {
        expect(pointDefenseSpecs[pd.specId], `${unit.name} -> ${pd.specId}`).toBeDefined()
      }
    }
  })
})

describe('air defense systems', () => {
  it('resolves every interceptorId', () => {
    for (const sys of Object.values(adSystems)) {
      expect(weaponSpecs[sys.interceptorId], `${sys.id} -> ${sys.interceptorId}`).toBeDefined()
    }
  })

  it('never claims an engagement range beyond its interceptor range', () => {
    for (const sys of Object.values(adSystems)) {
      const interceptor = weaponSpecs[sys.interceptorId]
      expect(
        sys.engagement_range_km,
        `${sys.id} engagement vs ${sys.interceptorId} range`,
      ).toBeLessThanOrEqual(interceptor.range_km)
    }
  })

  it('matches aegis_sm2 engagement range to the SM-2 IIIA', () => {
    expect(adSystems.aegis_sm2.engagement_range_km).toBe(weaponSpecs.sm2_iiia.range_km)
  })
})

describe('supply network wiring', () => {
  it('keys every base supply entry to an ORBAT unit', () => {
    for (const baseId of Object.keys(allBaseSupply)) {
      expect(unitIds.has(baseId), `baseSupply key ${baseId}`).toBe(true)
    }
  })

  it('terminates every supply line at ORBAT units', () => {
    for (const line of allSupplyLines) {
      expect(unitIds.has(line.fromBaseId), `${line.id} from ${line.fromBaseId}`).toBe(true)
      expect(unitIds.has(line.toBaseId), `${line.id} to ${line.toBaseId}`).toBe(true)
    }
  })
})

describe('naval repair prerequisites', () => {
  it('gives each nation a naval_base so ships and submarines can repair', () => {
    for (const [nation, units] of [['usa', usaUnits], ['iran', iranUnits]] as const) {
      const navalBases = units.filter(u => u.category === 'naval_base')
      expect(navalBases.length, `${nation} naval_base count`).toBeGreaterThan(0)
      for (const base of navalBases) {
        // Repair requires logistics > 0; the engine grants it via a baseSupply entry
        expect(allBaseSupply[base.id], `${base.id} supply stocks`).toBeDefined()
        expect(allBaseSupply[base.id].length).toBeGreaterThan(0)
      }
    }
  })
})
