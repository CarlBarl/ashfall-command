import type { Nation, Position } from '@/types/game'
import type { FrontlineSegment } from '@/types/ground'
import type { ViewArmyGroup, ViewGeneral, ViewGroundUnit } from '@/types/view'
import { haversine } from '@/engine/utils/geo'

export const FRONTLINE_PROXIMITY_KM = 60

export interface FrontlineArmyGroupSummary {
  id: string
  name: string
  divisionCount: number
  generalName: string | null
  avgStrength: number
}

export interface FrontlineSideSummary {
  nationId: string
  nationLabel: string
  divisions: number
  attacking: number
  defending: number
  avgStrength: number
  avgMorale: number
  armyGroups: FrontlineArmyGroupSummary[]
}

export interface FrontlineSummary {
  segmentId: string
  sideA: FrontlineSideSummary
  sideB: FrontlineSideSummary
  lengthKm: number
  anchor: Position
}

export interface FrontlineGeoJSONFeatureProperties {
  id: string
  segmentId: string
  sideA: string
  sideB: string
  sideALabel: string
  sideBLabel: string
  color: string
  highlightColor: string
  lengthKm: number
  anchorLng: number
  anchorLat: number
  hovered: 0 | 1
  selected: 0 | 1
}

export function getFrontlineSegmentId(segment: FrontlineSegment, index: number): string {
  const first = segment.coordinates[0]
  const last = segment.coordinates[segment.coordinates.length - 1]
  return [
    'frontline',
    index,
    segment.sideA,
    segment.sideB,
    Math.round(first?.[0] * 100),
    Math.round(first?.[1] * 100),
    Math.round(last?.[0] * 100),
    Math.round(last?.[1] * 100),
  ].join('-')
}

export function getNationLabel(nationId: string, nations: Nation[]): string {
  return nations.find((nation) => nation.id === nationId)?.name ?? nationId.toUpperCase()
}

export function calculatePolylineLengthKm(coordinates: [number, number][]): number {
  let total = 0
  for (let i = 0; i < coordinates.length - 1; i++) {
    total += haversine(
      { lng: coordinates[i][0], lat: coordinates[i][1] },
      { lng: coordinates[i + 1][0], lat: coordinates[i + 1][1] },
    )
  }
  return total
}

export function calculatePolylineAnchor(coordinates: [number, number][]): Position {
  if (coordinates.length === 0) return { lng: 0, lat: 0 }
  if (coordinates.length === 1) return { lng: coordinates[0][0], lat: coordinates[0][1] }

  const totalLength = calculatePolylineLengthKm(coordinates)
  if (totalLength <= 0) {
    const mid = coordinates[Math.floor(coordinates.length / 2)]
    return { lng: mid[0], lat: mid[1] }
  }

  const target = totalLength / 2
  let traversed = 0

  for (let i = 0; i < coordinates.length - 1; i++) {
    const start = { lng: coordinates[i][0], lat: coordinates[i][1] }
    const end = { lng: coordinates[i + 1][0], lat: coordinates[i + 1][1] }
    const segmentLength = haversine(start, end)

    if (traversed + segmentLength >= target) {
      const fraction = segmentLength > 0 ? (target - traversed) / segmentLength : 0
      return {
        lng: start.lng + (end.lng - start.lng) * fraction,
        lat: start.lat + (end.lat - start.lat) * fraction,
      }
    }

    traversed += segmentLength
  }

  const last = coordinates[coordinates.length - 1]
  return { lng: last[0], lat: last[1] }
}

export function pointToPolylineDistanceKm(point: Position, coordinates: [number, number][]): number {
  if (coordinates.length === 0) return Infinity
  if (coordinates.length === 1) {
    return haversine(point, { lng: coordinates[0][0], lat: coordinates[0][1] })
  }

  let best = Infinity
  for (let i = 0; i < coordinates.length - 1; i++) {
    const candidate = pointToLineDistKm(
      point,
      { lng: coordinates[i][0], lat: coordinates[i][1] },
      { lng: coordinates[i + 1][0], lat: coordinates[i + 1][1] },
    )
    if (candidate < best) best = candidate
  }
  return best
}

export function buildFrontlineSummaryMap(
  frontlines: FrontlineSegment[],
  groundUnits: ViewGroundUnit[],
  armyGroups: ViewArmyGroup[],
  generals: ViewGeneral[],
  nations: Nation[],
  proximityKm = FRONTLINE_PROXIMITY_KM,
): Map<string, FrontlineSummary> {
  const summaryMap = new Map<string, FrontlineSummary>()
  const armyGroupMap = new Map(armyGroups.map((group) => [group.id, group]))
  const generalMap = new Map(generals.map((general) => [general.id, general]))

  frontlines.forEach((frontline, index) => {
    const segmentId = getFrontlineSegmentId(frontline, index)
    const lengthKm = calculatePolylineLengthKm(frontline.coordinates)
    const anchor = calculatePolylineAnchor(frontline.coordinates)

    const sideAUnits = groundUnits.filter((unit) =>
      unit.nation === frontline.sideA &&
      pointToPolylineDistanceKm({ lat: unit.lat, lng: unit.lng }, frontline.coordinates) <= proximityKm,
    )
    const sideBUnits = groundUnits.filter((unit) =>
      unit.nation === frontline.sideB &&
      pointToPolylineDistanceKm({ lat: unit.lat, lng: unit.lng }, frontline.coordinates) <= proximityKm,
    )

    summaryMap.set(segmentId, {
      segmentId,
      sideA: summarizeFrontlineSide(frontline.sideA, sideAUnits, armyGroupMap, generalMap, nations),
      sideB: summarizeFrontlineSide(frontline.sideB, sideBUnits, armyGroupMap, generalMap, nations),
      lengthKm,
      anchor,
    })
  })

  return summaryMap
}

function summarizeFrontlineSide(
  nationId: string,
  units: ViewGroundUnit[],
  armyGroupMap: Map<string, ViewArmyGroup>,
  generalMap: Map<string, ViewGeneral>,
  nations: Nation[],
): FrontlineSideSummary {
  const attacking = units.filter((unit) => unit.stance === 'attack').length
  const defending = units.filter((unit) => unit.stance === 'defend' || unit.stance === 'fortify').length
  const avgStrength = units.length > 0
    ? units.reduce((sum, unit) => sum + unit.strength, 0) / units.length
    : 0
  const avgMorale = units.length > 0
    ? units.reduce((sum, unit) => sum + unit.morale, 0) / units.length
    : 0

  const grouped = new Map<string, ViewGroundUnit[]>()
  for (const unit of units) {
    const existing = grouped.get(unit.armyGroupId)
    if (existing) existing.push(unit)
    else grouped.set(unit.armyGroupId, [unit])
  }

  const armyGroups = Array.from(grouped.entries())
    .map(([armyGroupId, groupUnits]) => {
      const armyGroup = armyGroupMap.get(armyGroupId)
      const general = armyGroup ? generalMap.get(armyGroup.generalId) : null
      const avgGroupStrength = groupUnits.reduce((sum, unit) => sum + unit.strength, 0) / groupUnits.length
      return {
        id: armyGroupId,
        name: armyGroup?.name ?? armyGroupId,
        divisionCount: groupUnits.length,
        generalName: general?.name ?? null,
        avgStrength: avgGroupStrength,
      }
    })
    .sort((a, b) => b.divisionCount - a.divisionCount || b.avgStrength - a.avgStrength || a.name.localeCompare(b.name))
    .slice(0, 2)

  return {
    nationId,
    nationLabel: getNationLabel(nationId, nations),
    divisions: units.length,
    attacking,
    defending,
    avgStrength,
    avgMorale,
    armyGroups,
  }
}

function pointToLineDistKm(point: Position, lineStart: Position, lineEnd: Position): number {
  const avgLat = (lineStart.lat + lineEnd.lat + point.lat) / 3
  const cosLat = Math.cos((avgLat * Math.PI) / 180)
  const kmPerDegLat = 111.32
  const kmPerDegLng = 111.32 * cosLat

  const px = (point.lng - lineStart.lng) * kmPerDegLng
  const py = (point.lat - lineStart.lat) * kmPerDegLat

  const lx = (lineEnd.lng - lineStart.lng) * kmPerDegLng
  const ly = (lineEnd.lat - lineStart.lat) * kmPerDegLat

  const lenSq = lx * lx + ly * ly
  if (lenSq === 0) return Math.sqrt(px * px + py * py)

  let t = (px * lx + py * ly) / lenSq
  t = Math.max(0, Math.min(1, t))

  const cx = t * lx
  const cy = t * ly
  const dx = px - cx
  const dy = py - cy
  return Math.sqrt(dx * dx + dy * dy)
}
