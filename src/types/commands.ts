import type { GameTime, IntelBudget, NationId, Position, ROE, UnitId, WeaponId } from './game'
import type { ArmyGroupId, GeneralId, GeneralOrder, GroundUnitId, TechId } from './ground'

export type Command =
  | { type: 'MOVE_UNIT'; unitId: UnitId; waypoints: Position[] }
  | { type: 'LAUNCH_MISSILE'; launcherId: UnitId; weaponId: WeaponId; targetId: UnitId; waypoints?: Position[] }
  | { type: 'LAUNCH_SALVO'; launcherId: UnitId; weaponId: WeaponId; targetId: UnitId; count: number; waypoints?: Position[] }
  | { type: 'SET_ROE'; unitId: UnitId; roe: ROE }
  | { type: 'SET_SPEED'; speed: GameTime['speed'] }
  | { type: 'DECLARE_WAR'; target: NationId }
  | { type: 'CEASE_FIRE'; target: NationId }
  | { type: 'LAUNCH_SAM'; launcherId: UnitId; weaponId: WeaponId; missileId: string }
  | { type: 'SET_HEADING'; unitId: UnitId; heading: number }
  | { type: 'SET_INTEL_BUDGET'; budget: IntelBudget }
  // ─── Ground warfare commands ───
  | { type: 'GENERAL_ORDER'; generalId: GeneralId; order: GeneralOrder }
  | { type: 'REASSIGN_DIVISION'; divisionId: GroundUnitId; targetArmyGroupId: ArmyGroupId }
  | { type: 'SET_RESEARCH'; nation: NationId; techId: TechId }
  | { type: 'SET_RESEARCH_BUDGET'; nation: NationId; budget: number }
