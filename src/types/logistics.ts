import type { NationId, UnitId, WeaponId } from './game'

export interface NationalStockpile {
  nationId: NationId
  depotId: UnitId // the main depot unit (e.g. 'diego_garcia' for USA, 'mehrabad' for Iran)
  stocks: StockpileEntry[]
  production: ProductionEntry[]
}

export interface StockpileEntry {
  weaponId: WeaponId
  count: number
  maxCount: number
}

export interface ProductionEntry {
  weaponId: WeaponId
  ratePerHour: number // units produced per game hour
  efficiency: number // 0-1, degraded by bombing/sanctions
}

export interface SupplyShipment {
  id: string
  supplyLineId: string
  fromBaseId: UnitId
  toBaseId: UnitId
  weaponId: WeaponId
  count: number
  departedAt: number // game timestamp ms
  arrivesAt: number // game timestamp ms
}
