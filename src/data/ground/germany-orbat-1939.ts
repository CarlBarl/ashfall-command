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

// ─── Army Group North (Bock) ───
// 3rd Army (East Prussia, rows 50-54, cols 40-50) + 4th Army (Pomerania, rows 3-4, cols 15-22)
// 10 infantry, 3 panzer, 2 artillery

const AGN_ID = 'de-ag-north'

const agnInfantry: GroundUnit[] = [
  // 3rd Army — East Prussia, attacking south toward Warsaw
  makeInfantry(1, AGN_ID, 42, 52),
  makeInfantry(2, AGN_ID, 44, 53),
  makeInfantry(3, AGN_ID, 46, 51),
  makeInfantry(4, AGN_ID, 48, 52),
  makeInfantry(5, AGN_ID, 50, 50),
  // 4th Army — Pomerania, attacking east across the Corridor
  makeInfantry(6, AGN_ID, 15, 4),
  makeInfantry(7, AGN_ID, 17, 3),
  makeInfantry(8, AGN_ID, 19, 4),
  makeInfantry(9, AGN_ID, 21, 3),
  makeInfantry(10, AGN_ID, 22, 4),
]

const agnPanzer: GroundUnit[] = [
  makePanzer(1, AGN_ID, 43, 54),  // 3rd Army panzer
  makePanzer(2, AGN_ID, 16, 3),   // 4th Army panzer
  makePanzer(3, AGN_ID, 20, 3),   // 4th Army panzer
]

const agnArtillery: GroundUnit[] = [
  makeArtillery(1, AGN_ID, 45, 52),  // 3rd Army artillery
  makeArtillery(2, AGN_ID, 18, 4),   // 4th Army artillery
]

// ─── Army Group South (Rundstedt) ───
// 8th Army (rows 2-4, cols 10-14) + 10th Army (rows 2-4, cols 16-22) + 14th Army (rows 1-3, cols 26-32)
// 10 infantry, 3 panzer, 2 artillery

const AGS_ID = 'de-ag-south'

const agsInfantry: GroundUnit[] = [
  // 8th Army — near Breslau area
  makeInfantry(11, AGS_ID, 10, 3),
  makeInfantry(12, AGS_ID, 12, 2),
  makeInfantry(13, AGS_ID, 14, 4),
  // 10th Army — Silesia, main thrust toward Lodz/Warsaw
  makeInfantry(14, AGS_ID, 16, 2),
  makeInfantry(15, AGS_ID, 18, 3),
  makeInfantry(16, AGS_ID, 20, 2),
  makeInfantry(17, AGS_ID, 22, 3),
  // 14th Army — Slovakia border, aimed at Krakow
  makeInfantry(18, AGS_ID, 26, 1),
  makeInfantry(19, AGS_ID, 28, 2),
  makeInfantry(20, AGS_ID, 30, 3),
]

const agsPanzer: GroundUnit[] = [
  makePanzer(4, AGS_ID, 11, 2),   // 8th Army panzer
  makePanzer(5, AGS_ID, 17, 2),   // 10th Army panzer
  makePanzer(6, AGS_ID, 27, 2),   // 14th Army panzer
]

const agsArtillery: GroundUnit[] = [
  makeArtillery(3, AGS_ID, 19, 3),  // 10th Army artillery
  makeArtillery(4, AGS_ID, 29, 1),  // 14th Army artillery
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
    currentOrder: { type: 'ADVANCE', objectiveCol: 35, objectiveRow: 30 },
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
    currentOrder: { type: 'ADVANCE', objectiveCol: 30, objectiveRow: 22 },
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
    sectorStartCol: 15,
    sectorEndCol: 50,
  },
  {
    id: AGS_ID as string,
    name: 'Army Group South',
    nation: 'germany' as string,
    generalId: 'de-gen-rundstedt' as string,
    divisionIds: southDivisionIds,
    sectorStartCol: 10,
    sectorEndCol: 32,
  },
]
