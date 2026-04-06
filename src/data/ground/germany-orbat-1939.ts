import type { GroundUnit, General, ArmyGroup } from '@/types/ground'

/**
 * German division stats from division-templates.ts (de_inf_1939, de_panzer_1939, de_arty_1939).
 * Hardcoded here to avoid type issues with extra fields on the template data.
 */

// Infantry: softAttack 45, hardAttack 8, defense 55, breakthrough 12, hardness 0.05
// Panzer: softAttack 35, hardAttack 55, defense 30, breakthrough 65, hardness 0.70
// Artillery: softAttack 60, hardAttack 15, defense 8, breakthrough 2, hardness 0.10

function makeInfantry(index: number, armyGroupId: string, col: number, row: number): GroundUnit {
  return {
    id: `de-inf-${index}` as string,
    name: `${ordinal(index)} Infantry Division`,
    nation: 'germany' as string,
    type: 'infantry',
    armyGroupId: armyGroupId as string,
    gridCol: col,
    gridRow: row,
    strength: 100,
    morale: 80,
    experience: 1.0,
    organization: 100,
    softAttack: 45,
    hardAttack: 8,
    defense: 55,
    breakthrough: 12,
    hardness: 0.05,
    supplyState: 100,
    fuelState: 100,
    ammoState: 100,
    stance: 'attack',
    entrenched: 0,
    combatWidth: 3,
    status: 'active',
  }
}

function makePanzer(index: number, armyGroupId: string, col: number, row: number): GroundUnit {
  return {
    id: `de-pz-${index}` as string,
    name: `${ordinal(index)} Panzer Division`,
    nation: 'germany' as string,
    type: 'armor',
    armyGroupId: armyGroupId as string,
    gridCol: col,
    gridRow: row,
    strength: 100,
    morale: 85,
    experience: 1.1,
    organization: 100,
    softAttack: 35,
    hardAttack: 55,
    defense: 30,
    breakthrough: 65,
    hardness: 0.70,
    supplyState: 100,
    fuelState: 100,
    ammoState: 100,
    stance: 'attack',
    entrenched: 0,
    combatWidth: 4,
    status: 'active',
  }
}

function makeArtillery(index: number, armyGroupId: string, col: number, row: number): GroundUnit {
  return {
    id: `de-arty-${index}` as string,
    name: `${ordinal(index)} Artillery Regiment`,
    nation: 'germany' as string,
    type: 'artillery',
    armyGroupId: armyGroupId as string,
    gridCol: col,
    gridRow: row,
    strength: 100,
    morale: 70,
    experience: 1.0,
    organization: 100,
    softAttack: 60,
    hardAttack: 15,
    defense: 8,
    breakthrough: 2,
    hardness: 0.10,
    supplyState: 100,
    fuelState: 100,
    ammoState: 100,
    stance: 'attack',
    entrenched: 0,
    combatWidth: 1,
    status: 'active',
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// ─── Army Group North (Bock): cols 0-3, advancing toward Danzig/Warsaw ───
// 10 infantry, 3 panzer, 2 artillery

const AGN_ID = 'de-ag-north'

const agnInfantry: GroundUnit[] = [
  makeInfantry(1, AGN_ID, 0, 2),
  makeInfantry(2, AGN_ID, 0, 3),
  makeInfantry(3, AGN_ID, 1, 2),
  makeInfantry(4, AGN_ID, 1, 3),
  makeInfantry(5, AGN_ID, 2, 2),
  makeInfantry(6, AGN_ID, 2, 3),
  makeInfantry(7, AGN_ID, 3, 2),
  makeInfantry(8, AGN_ID, 3, 3),
  makeInfantry(9, AGN_ID, 1, 4),
  makeInfantry(10, AGN_ID, 2, 4),
]

const agnPanzer: GroundUnit[] = [
  makePanzer(1, AGN_ID, 1, 2),
  makePanzer(2, AGN_ID, 2, 2),
  makePanzer(3, AGN_ID, 3, 3),
]

const agnArtillery: GroundUnit[] = [
  makeArtillery(1, AGN_ID, 1, 3),
  makeArtillery(2, AGN_ID, 2, 3),
]

// ─── Army Group South (Rundstedt): cols 4-6, advancing through Krakow ───
// 10 infantry, 3 panzer, 2 artillery

const AGS_ID = 'de-ag-south'

const agsInfantry: GroundUnit[] = [
  makeInfantry(11, AGS_ID, 4, 2),
  makeInfantry(12, AGS_ID, 4, 3),
  makeInfantry(13, AGS_ID, 5, 2),
  makeInfantry(14, AGS_ID, 5, 3),
  makeInfantry(15, AGS_ID, 6, 2),
  makeInfantry(16, AGS_ID, 6, 3),
  makeInfantry(17, AGS_ID, 4, 4),
  makeInfantry(18, AGS_ID, 5, 4),
  makeInfantry(19, AGS_ID, 6, 4),
  makeInfantry(20, AGS_ID, 5, 2),
]

const agsPanzer: GroundUnit[] = [
  makePanzer(4, AGS_ID, 4, 2),
  makePanzer(5, AGS_ID, 5, 3),
  makePanzer(6, AGS_ID, 6, 2),
]

const agsArtillery: GroundUnit[] = [
  makeArtillery(3, AGS_ID, 5, 3),
  makeArtillery(4, AGS_ID, 6, 3),
]

// ─── Exports ───

export const germanGroundUnits: GroundUnit[] = [
  ...agnInfantry, ...agnPanzer, ...agnArtillery,
  ...agsInfantry, ...agsPanzer, ...agsArtillery,
]

export const germanGenerals: General[] = [
  {
    id: 'de-gen-bock' as string,
    name: 'Fedor von Bock',
    nation: 'germany' as string,
    armyGroupId: AGN_ID as string,
    traits: {
      aggression: 8,
      caution: 3,
      logistics: 5,
      innovation: 4,
      morale: 6,
    },
    currentOrder: { type: 'ADVANCE', objectiveCol: 2, objectiveRow: 30 },
    lastReportTick: 0,
    pendingReports: [],
  },
  {
    id: 'de-gen-rundstedt' as string,
    name: 'Gerd von Rundstedt',
    nation: 'germany' as string,
    armyGroupId: AGS_ID as string,
    traits: {
      aggression: 6,
      caution: 5,
      logistics: 7,
      innovation: 6,
      morale: 7,
    },
    currentOrder: { type: 'ADVANCE', objectiveCol: 5, objectiveRow: 30 },
    lastReportTick: 0,
    pendingReports: [],
  },
]

const northDivisionIds = [...agnInfantry, ...agnPanzer, ...agnArtillery].map(u => u.id)
const southDivisionIds = [...agsInfantry, ...agsPanzer, ...agsArtillery].map(u => u.id)

export const germanArmyGroups: ArmyGroup[] = [
  {
    id: AGN_ID as string,
    name: 'Army Group North',
    nation: 'germany' as string,
    generalId: 'de-gen-bock' as string,
    divisionIds: northDivisionIds,
    sectorStartCol: 0,
    sectorEndCol: 3,
  },
  {
    id: AGS_ID as string,
    name: 'Army Group South',
    nation: 'germany' as string,
    generalId: 'de-gen-rundstedt' as string,
    divisionIds: southDivisionIds,
    sectorStartCol: 4,
    sectorEndCol: 6,
  },
]
