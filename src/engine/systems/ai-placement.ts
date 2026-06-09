import type { NationId, Unit, Position } from '@/types/game'
import type { UnitCatalogEntry } from '@/types/scenario'
import type { SeededRNG } from '../utils/rng'

// ═══════════════════════════════════════════════
//  DOCTRINE-BASED PLACEMENT TEMPLATES
//
//  Key positions for each nation with role tags.
//  AI will scatter units around these with random
//  offsets from the SeededRNG for variation.
// ═══════════════════════════════════════════════

interface PlacementZone {
  center: Position
  label: string
  roles: string[] // catalog id prefixes that fit this zone
  /** Zone center is in open water — only ships/subs/carriers placed here */
  naval?: boolean
  /** Max random offset in degrees (default 0.4) — tighter for confined waters */
  jitter_deg?: number
}

const IRAN_ZONES: PlacementZone[] = [
  // Strategic AD around key cities
  { center: { lat: 35.69, lng: 51.39 }, label: 'Tehran', roles: ['iran_s300', 'iran_bavar373', 'iran_khordad', 'iran_tor', 'iran_airbase'] },
  { center: { lat: 32.66, lng: 51.68 }, label: 'Isfahan', roles: ['iran_s300', 'iran_bavar373', 'iran_khordad', 'iran_tor', 'iran_airbase'] },
  { center: { lat: 28.97, lng: 50.83 }, label: 'Bushehr', roles: ['iran_s300', 'iran_tor', 'iran_airbase', 'iran_coastal'] },
  { center: { lat: 27.18, lng: 56.27 }, label: 'Bandar Abbas', roles: ['iran_khordad', 'iran_tor', 'iran_coastal', 'iran_airbase'] },
  { center: { lat: 29.59, lng: 52.59 }, label: 'Shiraz', roles: ['iran_khordad', 'iran_fateh110', 'iran_airbase'] },

  // Missile launch zones — western Iran (within range of Gulf)
  { center: { lat: 34.31, lng: 47.07 }, label: 'Kermanshah', roles: ['iran_zolfaghar', 'iran_fateh110', 'iran_shahab3', 'iran_soumar'] },
  { center: { lat: 33.49, lng: 48.35 }, label: 'Khorramabad', roles: ['iran_shahab3', 'iran_sejjil2', 'iran_fateh110'] },
  { center: { lat: 32.38, lng: 48.40 }, label: 'Dezful', roles: ['iran_fateh110', 'iran_zolfaghar'] },
  { center: { lat: 35.58, lng: 53.39 }, label: 'Semnan', roles: ['iran_sejjil2', 'iran_shahab3'] },

  // Drone launch zones — dispersed central/western Iran
  { center: { lat: 34.10, lng: 50.90 }, label: 'Central Iran', roles: ['iran_soumar', 'iran_shahed136', 'iran_shahed238'] },
  { center: { lat: 33.00, lng: 49.50 }, label: 'Lorestan', roles: ['iran_shahed136', 'iran_shahed238'] },
  { center: { lat: 31.30, lng: 48.70 }, label: 'Khuzestan', roles: ['iran_shahed136', 'iran_shahed238', 'iran_fateh110'] },

  // Northwest — long range missiles
  { center: { lat: 38.08, lng: 46.29 }, label: 'Tabriz', roles: ['iran_shahab3', 'iran_airbase'] },

  // Naval — Strait of Hormuz eastern approach (open water)
  { center: { lat: 26.5, lng: 56.75 }, label: 'Strait of Hormuz', roles: ['iran_ghadir'], naval: true, jitter_deg: 0.15 },
]

const USA_ZONES: PlacementZone[] = [
  // Gulf state airbases
  { center: { lat: 25.1, lng: 51.3 }, label: 'Qatar', roles: ['usa_f35_squadron', 'usa_forward_base', 'usa_patriot'] },
  { center: { lat: 24.4, lng: 54.5 }, label: 'UAE', roles: ['usa_f35_squadron', 'usa_forward_base', 'usa_patriot', 'usa_thaad'] },
  { center: { lat: 24.0, lng: 47.6 }, label: 'Saudi Arabia', roles: ['usa_f35_squadron', 'usa_forward_base', 'usa_patriot'] },
  { center: { lat: 29.3, lng: 47.5 }, label: 'Kuwait', roles: ['usa_f35_squadron', 'usa_forward_base', 'usa_patriot'] },

  // Naval — Persian Gulf
  { center: { lat: 26.2, lng: 52.5 }, label: 'Persian Gulf', roles: ['usa_ddg', 'usa_ssn'], naval: true },
  { center: { lat: 24.8, lng: 57.5 }, label: 'Gulf of Oman', roles: ['usa_ddg', 'usa_ssn'], naval: true },

  // Naval — Arabian Sea (carriers, subs)
  { center: { lat: 23.5, lng: 60.0 }, label: 'Arabian Sea', roles: ['usa_csg', 'usa_ddg', 'usa_ssn'], naval: true },
  { center: { lat: 22.0, lng: 63.0 }, label: 'Arabian Sea South', roles: ['usa_csg', 'usa_ddg'], naval: true },
]

// ═══════════════════════════════════════════════
//  BUDGET ALLOCATION BY DOCTRINE
// ═══════════════════════════════════════════════

interface BudgetAllocation {
  ad: number        // air defense fraction
  offensive: number // offensive missiles fraction
  flex: number      // drones (Iran) or naval (USA) fraction
  base: number      // airbases fraction
}

const IRAN_BUDGET: BudgetAllocation = { ad: 0.30, offensive: 0.30, flex: 0.20, base: 0.20 }
// USA offensive missiles come built into ships and airbases, so that share lives in flex
const USA_BUDGET: BudgetAllocation = { ad: 0.30, offensive: 0, flex: 0.50, base: 0.20 }

// Catalog IDs grouped by role for budget allocation
const ROLE_MAP: Record<string, Record<keyof BudgetAllocation, string[]>> = {
  iran: {
    ad: ['iran_s300', 'iran_bavar373', 'iran_khordad', 'iran_tor'],
    offensive: ['iran_shahab3', 'iran_sejjil2', 'iran_fateh110', 'iran_zolfaghar', 'iran_soumar'],
    flex: ['iran_shahed136', 'iran_shahed238', 'iran_coastal', 'iran_ghadir'],
    base: ['iran_airbase'],
  },
  usa: {
    ad: ['usa_patriot', 'usa_thaad'],
    offensive: [],  // USA doesn't buy standalone offensive — it's on ships/airbases
    flex: ['usa_ddg', 'usa_csg', 'usa_ssn'],
    base: ['usa_f35_squadron', 'usa_forward_base'],
  },
}

// ═══════════════════════════════════════════════
//  MAIN GENERATION FUNCTION
// ═══════════════════════════════════════════════

/**
 * Generate a balanced AI force for the given nation within budget.
 * Uses doctrine-based budget allocation and placement templates
 * with seeded random variation for deterministic but varied results.
 */
export function generateAIForce(
  nation: NationId,
  budget: number,
  catalog: UnitCatalogEntry[],
  rng: SeededRNG,
): Unit[] {
  const allocation = nation === 'iran' ? IRAN_BUDGET : USA_BUDGET
  const roles = ROLE_MAP[nation]

  // Build catalog lookup
  const catalogById = new Map<string, UnitCatalogEntry>()
  for (const entry of catalog) {
    if (entry.nation === nation) {
      catalogById.set(entry.id, entry)
    }
  }

  const units: Unit[] = []
  let counter = 0
  let remaining = budget

  const budgetPools: { role: keyof BudgetAllocation; amount: number }[] = []
  for (const role of ['ad', 'offensive', 'flex', 'base'] as const) {
    const poolBudget = Math.floor(budget * allocation[role])
    if (poolBudget > 0 && roles[role].length > 0) {
      budgetPools.push({ role, amount: poolBudget })
    }
  }

  for (const pool of budgetPools) {
    let poolRemaining = pool.amount
    const validIds = roles[pool.role]
    if (validIds.length === 0) continue

    // Get valid catalog entries sorted by cost descending
    const poolEntries = validIds
      .map(id => catalogById.get(id))
      .filter((e): e is UnitCatalogEntry => e != null)
      .sort((a, b) => b.cost_millions - a.cost_millions)

    if (poolEntries.length === 0) continue

    // Buy units until budget depleted or nothing affordable
    let attempts = 0
    while (poolRemaining > 0 && attempts < 100) {
      attempts++

      // Filter to affordable entries
      const affordable = poolEntries.filter(e => e.cost_millions <= poolRemaining)
      if (affordable.length === 0) break

      // Weighted random selection — bias toward variety
      const entry = affordable[rng.int(0, affordable.length - 1)]
      poolRemaining -= entry.cost_millions
      remaining -= entry.cost_millions

      const position = pickPlacementPosition(entry, nation, rng)

      const unit = buildUnit(entry, position, nation, counter)
      units.push(unit)
      counter++
    }
  }

  // If there's remaining budget and cheap units available, keep buying
  if (remaining > 0) {
    const allEntries = Array.from(catalogById.values())
      .sort((a, b) => a.cost_millions - b.cost_millions)

    let attempts = 0
    while (remaining > 0 && attempts < 50) {
      attempts++
      const affordable = allEntries.filter(e => e.cost_millions <= remaining)
      if (affordable.length === 0) break

      const entry = affordable[rng.int(0, affordable.length - 1)]
      remaining -= entry.cost_millions

      const position = pickPlacementPosition(entry, nation, rng)
      units.push(buildUnit(entry, position, nation, counter))
      counter++
    }
  }

  return units
}

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════

const NAVAL_CATEGORIES = new Set<string>(['ship', 'submarine', 'carrier_group'])

/**
 * Pick a doctrine zone matching the entry's role (and water/land compatibility)
 * and return a jittered position inside it.
 */
export function pickPlacementPosition(
  entry: UnitCatalogEntry,
  nation: NationId,
  rng: SeededRNG,
): Position {
  const zones = nation === 'iran' ? IRAN_ZONES : USA_ZONES
  const isNaval = NAVAL_CATEGORIES.has(entry.category)
  const compatible = zones.filter(z => (z.naval ?? false) === isNaval)
  const pool = compatible.length > 0 ? compatible : zones
  const suitable = pool.filter(z => z.roles.includes(entry.id))
  const candidates = suitable.length > 0 ? suitable : pool
  const zone = candidates[rng.int(0, candidates.length - 1)]
  return jitterPosition(zone.center, rng, zone.jitter_deg ?? 0.4)
}

/** Apply a random offset of up to +-maxOffsetDeg degrees to a position */
function jitterPosition(center: Position, rng: SeededRNG, maxOffsetDeg = 0.4): Position {
  const latOffset = (rng.next() - 0.5) * 2 * maxOffsetDeg
  const lngOffset = (rng.next() - 0.5) * 2 * maxOffsetDeg
  return {
    lat: center.lat + latOffset,
    lng: center.lng + lngOffset,
  }
}

/** Build a full Unit from a catalog entry template */
export function buildUnit(
  entry: UnitCatalogEntry,
  position: Position,
  nation: NationId,
  index: number,
): Unit {
  return {
    ...entry.template,
    maxHealth: entry.template.maxHealth ?? 100,
    weapons: entry.template.weapons.map(w => ({ ...w })),
    sensors: entry.template.sensors.map(s => ({ ...s })),
    supplyStocks: entry.template.supplyStocks.map(s => ({ ...s })),
    pointDefense: (entry.template.pointDefense ?? []).map(p => ({ ...p })),
    id: `ai_${nation}_${index}`,
    position,
    status: 'ready',
    waypoints: [],
    subordinateIds: [],
  }
}
