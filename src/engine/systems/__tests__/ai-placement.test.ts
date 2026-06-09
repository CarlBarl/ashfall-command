import { describe, it, expect } from 'vitest'
import { buildUnit, generateAIForce, pickPlacementPosition } from '../ai-placement'
import { SeededRNG } from '../../utils/rng'
import { usaCatalog } from '@/data/catalog/usa-catalog'
import { iranCatalog } from '@/data/catalog/iran-catalog'
import type { Position } from '@/types/game'

const USA_NAVAL_BOXES = [
  { center: { lat: 26.2, lng: 52.5 }, jitter: 0.4 },  // Persian Gulf
  { center: { lat: 24.8, lng: 57.5 }, jitter: 0.4 },  // Gulf of Oman
  { center: { lat: 23.5, lng: 60.0 }, jitter: 0.4 },  // Arabian Sea
  { center: { lat: 22.0, lng: 63.0 }, jitter: 0.4 },  // Arabian Sea South
]

const IRAN_NAVAL_BOXES = [
  { center: { lat: 26.5, lng: 56.75 }, jitter: 0.15 }, // Strait of Hormuz
]

function inBox(pos: Position, box: { center: Position; jitter: number }): boolean {
  const eps = 1e-9
  return Math.abs(pos.lat - box.center.lat) <= box.jitter + eps &&
    Math.abs(pos.lng - box.center.lng) <= box.jitter + eps
}

function entry(catalog: typeof usaCatalog, id: string) {
  const e = catalog.find(c => c.id === id)
  if (!e) throw new Error(`catalog entry ${id} missing`)
  return e
}

describe('buildUnit', () => {
  it('deep-copies weapons so clones from one template do not share ammo state', () => {
    const ddg = entry(usaCatalog, 'usa_ddg')
    const a = buildUnit(ddg, { lat: 25, lng: 55 }, 'usa', 0)
    const b = buildUnit(ddg, { lat: 25, lng: 56 }, 'usa', 1)

    a.weapons[0].count -= 5
    expect(b.weapons[0].count).toBe(ddg.template.weapons[0].count)
    expect(ddg.template.weapons[0].count).not.toBe(a.weapons[0].count)
    expect(a.weapons[0]).not.toBe(b.weapons[0])
  })

  it('deep-copies sensors, supplyStocks and pointDefense', () => {
    const ddg = entry(usaCatalog, 'usa_ddg')
    const a = buildUnit(ddg, { lat: 25, lng: 55 }, 'usa', 0)
    const b = buildUnit(ddg, { lat: 25, lng: 56 }, 'usa', 1)

    expect(a.sensors[0]).not.toBe(b.sensors[0])
    expect(a.sensors).not.toBe(ddg.template.sensors)
    expect(a.supplyStocks).not.toBe(ddg.template.supplyStocks)
    expect(a.pointDefense).not.toBe(b.pointDefense)
  })
})

describe('pickPlacementPosition', () => {
  it('places USA naval units only inside naval zone boxes', () => {
    const rng = new SeededRNG(7)
    for (const id of ['usa_ddg', 'usa_csg', 'usa_ssn']) {
      const e = entry(usaCatalog, id)
      for (let i = 0; i < 50; i++) {
        const pos = pickPlacementPosition(e, 'usa', rng)
        expect(USA_NAVAL_BOXES.some(box => inBox(pos, box)), `${id} at ${pos.lat},${pos.lng}`).toBe(true)
      }
    }
  })

  it('places Iranian submarines in the Strait of Hormuz water zone', () => {
    const rng = new SeededRNG(13)
    const e = entry(iranCatalog, 'iran_ghadir')
    for (let i = 0; i < 50; i++) {
      const pos = pickPlacementPosition(e, 'iran', rng)
      expect(IRAN_NAVAL_BOXES.some(box => inBox(pos, box)), `iran_ghadir at ${pos.lat},${pos.lng}`).toBe(true)
    }
  })

  it('never places land units in a naval zone', () => {
    const rng = new SeededRNG(21)
    for (const e of [...usaCatalog, ...iranCatalog]) {
      if (['ship', 'submarine', 'carrier_group'].includes(e.category)) continue
      const boxes = e.nation === 'usa' ? USA_NAVAL_BOXES : IRAN_NAVAL_BOXES
      for (let i = 0; i < 20; i++) {
        const pos = pickPlacementPosition(e, e.nation, rng)
        expect(boxes.some(box => inBox(pos, box)), `${e.id} at ${pos.lat},${pos.lng}`).toBe(false)
      }
    }
  })
})

describe('generateAIForce', () => {
  it('keeps generated naval units inside naval zone boxes', () => {
    for (const seed of [1, 42, 1234]) {
      const units = generateAIForce('usa', 20_000, usaCatalog, new SeededRNG(seed))
      const naval = units.filter(u => ['ship', 'submarine', 'carrier_group'].includes(u.category))
      expect(naval.length).toBeGreaterThan(0)
      for (const u of naval) {
        expect(
          USA_NAVAL_BOXES.some(box => inBox(u.position, box)),
          `${u.id} (${u.category}) at ${u.position.lat},${u.position.lng}`,
        ).toBe(true)
      }
    }
  })

  it('builds units with independent weapon loadouts', () => {
    const units = generateAIForce('iran', 5_000, iranCatalog, new SeededRNG(99))
    const armed = units.filter(u => u.weapons.length > 0)
    expect(armed.length).toBeGreaterThan(1)
    const [first, ...rest] = armed
    first.weapons[0].count = -777
    for (const u of rest) {
      for (const w of u.weapons) {
        expect(w.count).not.toBe(-777)
      }
    }
  })
})
