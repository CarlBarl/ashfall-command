import type { GameTime, NationId, Position, ROE, UnitId, WeaponId } from './game'

export type Command =
  | { type: 'MOVE_UNIT'; unitId: UnitId; waypoints: Position[] }
  | { type: 'LAUNCH_MISSILE'; launcherId: UnitId; weaponId: WeaponId; targetId: UnitId }
  | { type: 'SET_ROE'; unitId: UnitId; roe: ROE }
  | { type: 'SET_SPEED'; speed: GameTime['speed'] }
  | { type: 'DECLARE_WAR'; target: NationId }
  | { type: 'CEASE_FIRE'; target: NationId }
  | { type: 'LAUNCH_SAM'; launcherId: UnitId; weaponId: WeaponId; missileId: string }
  | { type: 'SET_HEADING'; unitId: UnitId; heading: number }
