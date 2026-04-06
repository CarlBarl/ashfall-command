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

// ─── Army Pomorze (defending the Corridor, rows 5-7, cols 15-22): 3 infantry, 1 cavalry ───

const APOM_ID = 'pl-ag-pomorze'

const apomInfantry: GroundUnit[] = [
  makeInfantry(1, APOM_ID, 16, 6),
  makeInfantry(2, APOM_ID, 19, 5),
  makeInfantry(3, APOM_ID, 21, 7),
]

const apomCavalry: GroundUnit[] = [
  makeCavalry(1, APOM_ID, 18, 7),
]

const apomArtillery: GroundUnit[] = [
  makeArtillery(1, APOM_ID, 17, 6),
]

// ─── Army Poznan (western flank, rows 6-8, cols 10-16): 4 infantry, 1 cavalry ───

const AP_ID = 'pl-ag-poznan'

const apInfantry: GroundUnit[] = [
  makeInfantry(4, AP_ID, 11, 7),
  makeInfantry(5, AP_ID, 13, 6),
  makeInfantry(6, AP_ID, 15, 8),
  makeInfantry(7, AP_ID, 14, 7),
]

const apCavalry: GroundUnit[] = [
  makeCavalry(2, AP_ID, 12, 8),
]

const apArtillery: GroundUnit[] = [
  makeArtillery(2, AP_ID, 13, 7),
]

// ─── Army Lodz (central sector, rows 5-7, cols 20-26): 3 infantry, 1 cavalry ───

const AL_ID = 'pl-ag-lodz'

const alInfantry: GroundUnit[] = [
  makeInfantry(8, AL_ID, 21, 6),
  makeInfantry(9, AL_ID, 23, 5),
  makeInfantry(10, AL_ID, 25, 7),
]

const alCavalry: GroundUnit[] = [
  makeCavalry(3, AL_ID, 22, 7),
]

const alArtillery: GroundUnit[] = [
  makeArtillery(3, AL_ID, 24, 6),
]

// ─── Army Krakow (southern sector, rows 5-7, cols 28-34): 3 infantry, 1 cavalry ───

const AK_ID = 'pl-ag-krakow'

const akInfantry: GroundUnit[] = [
  makeInfantry(11, AK_ID, 29, 6),
  makeInfantry(12, AK_ID, 31, 5),
  makeInfantry(13, AK_ID, 33, 7),
]

const akCavalry: GroundUnit[] = [
  makeCavalry(4, AK_ID, 30, 7),
]

const akArtillery: GroundUnit[] = [
  makeArtillery(4, AK_ID, 32, 6),
]

// ─── Army Modlin (reserve behind the line, rows 8-10, cols 30-36): 2 infantry ───

const AM_ID = 'pl-ag-modlin'

const amInfantry: GroundUnit[] = [
  makeInfantry(14, AM_ID, 31, 9),
  makeInfantry(15, AM_ID, 34, 10),
]

const amArtillery: GroundUnit[] = [
  makeArtillery(5, AM_ID, 33, 8),
]

// ─── Exports ───

export const polishGroundUnits: GroundUnit[] = [
  ...apomInfantry, ...apomCavalry, ...apomArtillery,
  ...apInfantry, ...apCavalry, ...apArtillery,
  ...alInfantry, ...alCavalry, ...alArtillery,
  ...akInfantry, ...akCavalry, ...akArtillery,
  ...amInfantry, ...amArtillery,
]

export const polishGenerals: General[] = [
  {
    id: 'pl-gen-bortnowski' as string,
    name: 'Wladyslaw Bortnowski',
    nation: 'poland' as string,
    armyGroupId: APOM_ID as string,
    traits: {
      aggression: 5,
      caution: 6,
      logistics: 4,
      innovation: 4,
      morale: 5,
    },
    currentOrder: { type: 'HOLD_LINE' },
    lastReportTick: 0,
    pendingReports: [],
  },
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
    id: 'pl-gen-rommel' as string,
    name: 'Juliusz Rommel',
    nation: 'poland' as string,
    armyGroupId: AL_ID as string,
    traits: {
      aggression: 5,
      caution: 5,
      logistics: 5,
      innovation: 5,
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
  {
    id: 'pl-gen-krukowicz' as string,
    name: 'Emil Krukowicz-Przedrzymirski',
    nation: 'poland' as string,
    armyGroupId: AM_ID as string,
    traits: {
      aggression: 4,
      caution: 6,
      logistics: 5,
      innovation: 4,
      morale: 5,
    },
    currentOrder: { type: 'HOLD_LINE' },
    lastReportTick: 0,
    pendingReports: [],
  },
]

const pomorzeDivisionIds = [...apomInfantry, ...apomCavalry, ...apomArtillery].map(u => u.id)
const poznanDivisionIds = [...apInfantry, ...apCavalry, ...apArtillery].map(u => u.id)
const lodzDivisionIds = [...alInfantry, ...alCavalry, ...alArtillery].map(u => u.id)
const krakowDivisionIds = [...akInfantry, ...akCavalry, ...akArtillery].map(u => u.id)
const modlinDivisionIds = [...amInfantry, ...amArtillery].map(u => u.id)

export const polishArmyGroups: ArmyGroup[] = [
  {
    id: APOM_ID as string,
    name: 'Army Pomorze',
    nation: 'poland' as string,
    generalId: 'pl-gen-bortnowski' as string,
    divisionIds: pomorzeDivisionIds,
    sectorStartCol: 15,
    sectorEndCol: 22,
  },
  {
    id: AP_ID as string,
    name: 'Army Poznan',
    nation: 'poland' as string,
    generalId: 'pl-gen-kutrzeba' as string,
    divisionIds: poznanDivisionIds,
    sectorStartCol: 10,
    sectorEndCol: 16,
  },
  {
    id: AL_ID as string,
    name: 'Army Lodz',
    nation: 'poland' as string,
    generalId: 'pl-gen-rommel' as string,
    divisionIds: lodzDivisionIds,
    sectorStartCol: 20,
    sectorEndCol: 26,
  },
  {
    id: AK_ID as string,
    name: 'Army Krakow',
    nation: 'poland' as string,
    generalId: 'pl-gen-szylling' as string,
    divisionIds: krakowDivisionIds,
    sectorStartCol: 28,
    sectorEndCol: 34,
  },
  {
    id: AM_ID as string,
    name: 'Army Modlin',
    nation: 'poland' as string,
    generalId: 'pl-gen-krukowicz' as string,
    divisionIds: modlinDivisionIds,
    sectorStartCol: 30,
    sectorEndCol: 36,
  },
]
