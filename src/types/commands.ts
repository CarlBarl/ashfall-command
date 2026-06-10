import type { GameTime, IntelBudget, NationId, Position, ROE, TrackQuality, UnitId, WeaponId } from './game'

export type Command =
  | { type: 'MOVE_UNIT'; unitId: UnitId; waypoints: Position[] }
  | { type: 'LAUNCH_MISSILE'; launcherId: UnitId; weaponId: WeaponId; targetId: UnitId; waypoints?: Position[]; trackQuality?: TrackQuality }
  | { type: 'LAUNCH_SALVO'; launcherId: UnitId; weaponId: WeaponId; targetId: UnitId; count: number; waypoints?: Position[] }
  | { type: 'SET_ROE'; unitId: UnitId; roe: ROE }
  | { type: 'SET_SPEED'; speed: GameTime['speed'] }
  | { type: 'DECLARE_WAR'; target: NationId }
  | { type: 'CEASE_FIRE'; target: NationId }
  | { type: 'LAUNCH_SAM'; launcherId: UnitId; weaponId: WeaponId; missileId: string }
  | { type: 'SET_HEADING'; unitId: UnitId; heading: number }
  | { type: 'SET_INTEL_BUDGET'; budget: IntelBudget }
  | { type: 'SET_DRONE_MISSION'; unitId: UnitId; mission: 'military' | 'shipping_interdiction' }
  | { type: 'OFFER_CEASEFIRE'; target: NationId }
  | { type: 'RESIGN' }
  | { type: 'TASK_SATELLITE_PASS'; assetId: string; target: Position; cloudPct?: number }
  | { type: 'TASK_AGENT'; agentId: string }
  | { type: 'REST_AGENT'; agentId: string }
  | { type: 'EXFILTRATE_AGENT'; agentId: string }
  | { type: 'OPSEC_SWEEP' }
  | { type: 'SET_EMCON'; unitId: UnitId; emcon: boolean }
