import { describe, expect, it } from 'vitest'
import type { Nation } from '@/types/game'
import type { FrontlineSegment } from '@/types/ground'
import type { ViewArmyGroup, ViewGeneral, ViewGroundUnit } from '@/types/view'
import {
  FRONTLINE_PROXIMITY_KM,
  buildFrontlineSummaryMap,
  calculatePolylineLengthKm,
  getFrontlineSegmentId,
  pointToPolylineDistanceKm,
} from '../frontline-utils'

const nations: Nation[] = [
  {
    id: 'germany' as Nation['id'],
    name: 'Third Reich',
    economy: {
      gdp_billions: 0,
      military_budget_billions: 0,
      military_budget_pct_gdp: 0,
      oil_revenue_billions: 0,
      sanctions_impact: 0,
      war_cost_per_day_millions: 0,
      reserves_billions: 0,
    },
    relations: {},
    atWar: [],
  },
  {
    id: 'poland' as Nation['id'],
    name: 'Second Polish Republic',
    economy: {
      gdp_billions: 0,
      military_budget_billions: 0,
      military_budget_pct_gdp: 0,
      oil_revenue_billions: 0,
      sanctions_impact: 0,
      war_cost_per_day_millions: 0,
      reserves_billions: 0,
    },
    relations: {},
    atWar: [],
  },
]

const frontlines: FrontlineSegment[] = [
  {
    sideA: 'germany' as FrontlineSegment['sideA'],
    sideB: 'poland' as FrontlineSegment['sideB'],
    coordinates: [
      [20, 50],
      [20, 51],
    ],
  },
]

const groundUnits: ViewGroundUnit[] = [
  {
    id: 'de-1' as ViewGroundUnit['id'],
    name: '1. Armee',
    nation: 'germany' as ViewGroundUnit['nation'],
    type: 'infantry',
    armyGroupId: 'ag-north' as ViewGroundUnit['armyGroupId'],
    lat: 50.3,
    lng: 19.7,
    strength: 88,
    morale: 82,
    organization: 80,
    stance: 'attack',
    status: 'active',
    supplyState: 80,
    entrenched: 10,
  },
  {
    id: 'de-2' as ViewGroundUnit['id'],
    name: '2. Armee',
    nation: 'germany' as ViewGroundUnit['nation'],
    type: 'armor',
    armyGroupId: 'ag-north' as ViewGroundUnit['armyGroupId'],
    lat: 50.6,
    lng: 19.75,
    strength: 92,
    morale: 79,
    organization: 85,
    stance: 'attack',
    status: 'active',
    supplyState: 82,
    entrenched: 5,
  },
  {
    id: 'pl-1' as ViewGroundUnit['id'],
    name: 'Pomorze',
    nation: 'poland' as ViewGroundUnit['nation'],
    type: 'infantry',
    armyGroupId: 'ag-pomorze' as ViewGroundUnit['armyGroupId'],
    lat: 50.4,
    lng: 20.18,
    strength: 74,
    morale: 71,
    organization: 73,
    stance: 'defend',
    status: 'active',
    supplyState: 69,
    entrenched: 35,
  },
  {
    id: 'pl-2' as ViewGroundUnit['id'],
    name: 'Poznan',
    nation: 'poland' as ViewGroundUnit['nation'],
    type: 'infantry',
    armyGroupId: 'ag-poznan' as ViewGroundUnit['armyGroupId'],
    lat: 50.7,
    lng: 20.2,
    strength: 79,
    morale: 76,
    organization: 75,
    stance: 'attack',
    status: 'active',
    supplyState: 72,
    entrenched: 12,
  },
  {
    id: 'pl-far' as ViewGroundUnit['id'],
    name: 'Reserve',
    nation: 'poland' as ViewGroundUnit['nation'],
    type: 'infantry',
    armyGroupId: 'ag-reserve' as ViewGroundUnit['armyGroupId'],
    lat: 50.7,
    lng: 21.6,
    strength: 90,
    morale: 90,
    organization: 80,
    stance: 'defend',
    status: 'active',
    supplyState: 90,
    entrenched: 40,
  },
]

const armyGroups: ViewArmyGroup[] = [
  {
    id: 'ag-north' as ViewArmyGroup['id'],
    name: 'Army Group North',
    nation: 'germany' as ViewArmyGroup['nation'],
    generalId: 'gen-bock' as ViewArmyGroup['generalId'],
    divisionIds: ['de-1', 'de-2'] as ViewArmyGroup['divisionIds'],
  },
  {
    id: 'ag-pomorze' as ViewArmyGroup['id'],
    name: 'Pomorze Army',
    nation: 'poland' as ViewArmyGroup['nation'],
    generalId: 'gen-bortnowski' as ViewArmyGroup['generalId'],
    divisionIds: ['pl-1'] as ViewArmyGroup['divisionIds'],
  },
  {
    id: 'ag-poznan' as ViewArmyGroup['id'],
    name: 'Poznan Army',
    nation: 'poland' as ViewArmyGroup['nation'],
    generalId: 'gen-kutrzeba' as ViewArmyGroup['generalId'],
    divisionIds: ['pl-2'] as ViewArmyGroup['divisionIds'],
  },
]

const generals: ViewGeneral[] = [
  {
    id: 'gen-bock' as ViewGeneral['id'],
    name: 'Fedor von Bock',
    nation: 'germany' as ViewGeneral['nation'],
    armyGroupId: 'ag-north' as ViewGeneral['armyGroupId'],
    traits: { aggression: 0, caution: 0, logistics: 0, innovation: 0, morale: 0 },
    currentOrder: null,
  },
  {
    id: 'gen-bortnowski' as ViewGeneral['id'],
    name: 'Wladyslaw Bortnowski',
    nation: 'poland' as ViewGeneral['nation'],
    armyGroupId: 'ag-pomorze' as ViewGeneral['armyGroupId'],
    traits: { aggression: 0, caution: 0, logistics: 0, innovation: 0, morale: 0 },
    currentOrder: null,
  },
  {
    id: 'gen-kutrzeba' as ViewGeneral['id'],
    name: 'Tadeusz Kutrzeba',
    nation: 'poland' as ViewGeneral['nation'],
    armyGroupId: 'ag-poznan' as ViewGeneral['armyGroupId'],
    traits: { aggression: 0, caution: 0, logistics: 0, innovation: 0, morale: 0 },
    currentOrder: null,
  },
]

describe('frontline-utils', () => {
  it('computes summary counts for both sides near the frontline', () => {
    const summaryMap = buildFrontlineSummaryMap(frontlines, groundUnits, armyGroups, generals, nations)
    const segmentId = getFrontlineSegmentId(frontlines[0], 0)
    const summary = summaryMap.get(segmentId)

    expect(summary).toBeDefined()
    expect(summary?.sideA.nationLabel).toBe('Third Reich')
    expect(summary?.sideA.divisions).toBe(2)
    expect(summary?.sideA.attacking).toBe(2)
    expect(summary?.sideA.defending).toBe(0)
    expect(summary?.sideA.armyGroups[0].name).toBe('Army Group North')
    expect(summary?.sideA.armyGroups[0].generalName).toBe('Fedor von Bock')

    expect(summary?.sideB.nationLabel).toBe('Second Polish Republic')
    expect(summary?.sideB.divisions).toBe(2)
    expect(summary?.sideB.attacking).toBe(1)
    expect(summary?.sideB.defending).toBe(1)
    expect(summary?.sideB.armyGroups).toHaveLength(2)
  })

  it('ignores units outside the proximity threshold', () => {
    const distance = pointToPolylineDistanceKm(
      { lat: groundUnits[4].lat, lng: groundUnits[4].lng },
      frontlines[0].coordinates,
    )
    expect(distance).toBeGreaterThan(FRONTLINE_PROXIMITY_KM)

    const summaryMap = buildFrontlineSummaryMap(frontlines, groundUnits, armyGroups, generals, nations)
    const summary = summaryMap.get(getFrontlineSegmentId(frontlines[0], 0))
    expect(summary?.sideB.divisions).toBe(2)
  })

  it('computes a positive polyline length for the rendered segment', () => {
    expect(calculatePolylineLengthKm(frontlines[0].coordinates)).toBeGreaterThan(100)
  })
})
