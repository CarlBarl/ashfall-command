import type { GroundUnit, General, ArmyGroup } from '@/types/ground'

/**
 * Polish division stats from division-templates.ts (pl_inf_1939, pl_cav_1939).
 * Hardcoded here to avoid type issues with extra fields on the template data.
 *
 * Infantry: softAttack 40, hardAttack 5, defense 50, breakthrough 10, hardness 0.03
 * Cavalry: softAttack 30, hardAttack 3, defense 35, breakthrough 20, hardness 0.02
 * Artillery: softAttack 55, hardAttack 12, defense 10, breakthrough 2, hardness 0.08
 */

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function makeInfantry(index: number, armyGroupId: string, col: number, row: number): GroundUnit {
  return {
    id: `pl-inf-${index}` as string,
    name: `${ordinal(index)} Infantry Division`,
    nation: 'poland' as string,
    type: 'infantry',
    armyGroupId: armyGroupId as string,
    gridCol: col,
    gridRow: row,
    strength: 100,
    morale: 75,
    experience: 0.8,
    organization: 100,
    softAttack: 40,
    hardAttack: 5,
    defense: 50,
    breakthrough: 10,
    hardness: 0.03,
    supplyState: 90,
    fuelState: 80,
    ammoState: 85,
    stance: 'defend',
    entrenched: 30,
    combatWidth: 3,
    status: 'active',
  }
}

function makeCavalry(index: number, armyGroupId: string, col: number, row: number): GroundUnit {
  return {
    id: `pl-cav-${index}` as string,
    name: `${ordinal(index)} Cavalry Brigade`,
    nation: 'poland' as string,
    type: 'infantry', // cavalry treated as mobile infantry in this system
    armyGroupId: armyGroupId as string,
    gridCol: col,
    gridRow: row,
    strength: 100,
    morale: 80,
    experience: 0.9,
    organization: 100,
    softAttack: 30,
    hardAttack: 3,
    defense: 35,
    breakthrough: 20,
    hardness: 0.02,
    supplyState: 85,
    fuelState: 100, // horses don't need fuel
    ammoState: 80,
    stance: 'defend',
    entrenched: 10,
    combatWidth: 2,
    status: 'active',
  }
}

function makeArtillery(index: number, armyGroupId: string, col: number, row: number): GroundUnit {
  return {
    id: `pl-arty-${index}` as string,
    name: `${ordinal(index)} Artillery Regiment`,
    nation: 'poland' as string,
    type: 'artillery',
    armyGroupId: armyGroupId as string,
    gridCol: col,
    gridRow: row,
    strength: 100,
    morale: 70,
    experience: 0.7,
    organization: 100,
    softAttack: 55,
    hardAttack: 12,
    defense: 10,
    breakthrough: 2,
    hardness: 0.08,
    supplyState: 80,
    fuelState: 70,
    ammoState: 75,
    stance: 'defend',
    entrenched: 20,
    combatWidth: 1,
    status: 'active',
  }
}

// ─── Army Poznan (western front, cols 0-3): 8 infantry, 2 cavalry, 1 artillery ───

const AP_ID = 'pl-ag-poznan'

const apInfantry: GroundUnit[] = [
  makeInfantry(1, AP_ID, 0, 6),
  makeInfantry(2, AP_ID, 0, 7),
  makeInfantry(3, AP_ID, 1, 6),
  makeInfantry(4, AP_ID, 1, 7),
  makeInfantry(5, AP_ID, 2, 6),
  makeInfantry(6, AP_ID, 2, 7),
  makeInfantry(7, AP_ID, 3, 6),
  makeInfantry(8, AP_ID, 3, 7),
]

const apCavalry: GroundUnit[] = [
  makeCavalry(1, AP_ID, 1, 8),
  makeCavalry(2, AP_ID, 2, 8),
]

const apArtillery: GroundUnit[] = [
  makeArtillery(1, AP_ID, 2, 7),
]

// ─── Army Krakow (southern front, cols 4-6): 7 infantry, 1 cavalry, 1 artillery ───

const AK_ID = 'pl-ag-krakow'

const akInfantry: GroundUnit[] = [
  makeInfantry(9, AK_ID, 4, 6),
  makeInfantry(10, AK_ID, 4, 7),
  makeInfantry(11, AK_ID, 5, 6),
  makeInfantry(12, AK_ID, 5, 7),
  makeInfantry(13, AK_ID, 6, 6),
  makeInfantry(14, AK_ID, 6, 7),
  makeInfantry(15, AK_ID, 5, 8),
]

const akCavalry: GroundUnit[] = [
  makeCavalry(3, AK_ID, 5, 6),
]

const akArtillery: GroundUnit[] = [
  makeArtillery(2, AK_ID, 5, 7),
]

// ─── Exports ───

export const polishGroundUnits: GroundUnit[] = [
  ...apInfantry, ...apCavalry, ...apArtillery,
  ...akInfantry, ...akCavalry, ...akArtillery,
]

export const polishGenerals: General[] = [
  {
    id: 'pl-gen-kutrzeba' as string,
    name: 'Tadeusz Kutrzeba',
    nation: 'poland' as string,
    armyGroupId: AP_ID as string,
    traits: {
      aggression: 6,
      caution: 5,
      logistics: 4,
      innovation: 7,
      morale: 6,
    },
    currentOrder: { type: 'HOLD_LINE' },
    lastReportTick: 0,
    pendingReports: [],
  },
  {
    id: 'pl-gen-szylling' as string,
    name: 'Antoni Szylling',
    nation: 'poland' as string,
    armyGroupId: AK_ID as string,
    traits: {
      aggression: 4,
      caution: 7,
      logistics: 5,
      innovation: 3,
      morale: 5,
    },
    currentOrder: { type: 'HOLD_LINE' },
    lastReportTick: 0,
    pendingReports: [],
  },
]

const poznanDivisionIds = [...apInfantry, ...apCavalry, ...apArtillery].map(u => u.id)
const krakowDivisionIds = [...akInfantry, ...akCavalry, ...akArtillery].map(u => u.id)

export const polishArmyGroups: ArmyGroup[] = [
  {
    id: AP_ID as string,
    name: 'Army Poznan',
    nation: 'poland' as string,
    generalId: 'pl-gen-kutrzeba' as string,
    divisionIds: poznanDivisionIds,
    sectorStartCol: 0,
    sectorEndCol: 3,
  },
  {
    id: AK_ID as string,
    name: 'Army Krakow',
    nation: 'poland' as string,
    generalId: 'pl-gen-szylling' as string,
    divisionIds: krakowDivisionIds,
    sectorStartCol: 4,
    sectorEndCol: 6,
  },
]
