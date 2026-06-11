import { LineLayer, PathLayer } from '@deck.gl/layers'
import type { Layer } from '@deck.gl/core'
import type { AirMission } from '@/types/game'
import type { ViewUnit } from '@/types/view'

type LngLat = [number, number]

const KM_PER_DEG_LAT = 110.574
const KM_PER_DEG_LON_EQ = 111.32

const CAP_CYAN: [number, number, number, number] = [64, 224, 240, 170]
const AEW_WHITE: [number, number, number, number] = [235, 235, 235, 150]
const STRIKE_AMBER: [number, number, number, number] = [212, 168, 84, 230]
const STRIKE_AMBER_DIM: [number, number, number, number] = [212, 168, 84, 102]

const RACETRACK_LEG_KM = 18
const RACETRACK_RADIUS_KM = 7

function offsetKm(lng: number, lat: number, eastKm: number, northKm: number): LngLat {
  const dLat = northKm / KM_PER_DEG_LAT
  const dLng = eastKm / (KM_PER_DEG_LON_EQ * Math.cos((lat * Math.PI) / 180))
  return [lng + dLng, lat + dLat]
}

/** Point on a stadium (racetrack) perimeter at arc-distance d, in local km offsets */
function stadiumPointKm(d: number, legKm: number, rKm: number): [number, number] {
  const arc = Math.PI * rKm
  if (d < legKm) return [-legKm / 2 + d, rKm]
  d -= legKm
  if (d < arc) {
    const a = d / rKm
    return [legKm / 2 + Math.sin(a) * rKm, Math.cos(a) * rKm]
  }
  d -= arc
  if (d < legKm) return [legKm / 2 - d, -rKm]
  d -= legKm
  const a = d / rKm
  return [-legKm / 2 - Math.sin(a) * rKm, -Math.cos(a) * rKm]
}

// Dashed oval as separate short arcs — PathStyleExtension is not a dependency
function dashedRacetrackPaths(lng: number, lat: number, dashes = 28): LngLat[][] {
  const total = 2 * RACETRACK_LEG_KM + 2 * Math.PI * RACETRACK_RADIUS_KM
  const slot = total / dashes
  const paths: LngLat[][] = []
  for (let i = 0; i < dashes; i++) {
    const arc: LngLat[] = []
    for (let j = 0; j <= 3; j++) {
      const [e, n] = stadiumPointKm((i * slot + (j / 3) * slot * 0.55) % total, RACETRACK_LEG_KM, RACETRACK_RADIUS_KM)
      arc.push(offsetKm(lng, lat, e, n))
    }
    paths.push(arc)
  }
  return paths
}

interface StationDashDatum {
  path: LngLat[]
  kind: AirMission['kind']
}

interface StrikeLineDatum {
  id: string
  source: LngLat
  target: LngLat
  selected: boolean
}

export interface AirMapLayerInputs {
  missions: AirMission[]
  units: ViewUnit[]
  selectedUnitId: string | null
}

/** CAP/AEW station racetracks + strike flight→target lines. Missions arrive pre-filtered to the player nation. */
export function createAirMapLayers(opts: AirMapLayerInputs): Layer[] {
  const { missions, units, selectedUnitId } = opts
  const unitById = new Map(units.map((u) => [u.id, u]))

  const dashData: StationDashDatum[] = []
  const lineData: StrikeLineDatum[] = []
  for (const m of missions) {
    if ((m.kind === 'cap' || m.kind === 'aew') && m.station && (m.status === 'active' || m.status === 'planning')) {
      for (const path of dashedRacetrackPaths(m.station.lng, m.station.lat)) {
        dashData.push({ path, kind: m.kind })
      }
    }
    if (m.kind === 'strike' && m.status === 'active' && m.flightUnitId !== undefined && m.targetId !== undefined) {
      const flight = unitById.get(m.flightUnitId)
      const target = unitById.get(m.targetId)
      if (!flight || !target || flight.status === 'destroyed') continue
      lineData.push({
        id: m.id,
        source: [flight.position.lng, flight.position.lat],
        target: [target.position.lng, target.position.lat],
        selected: selectedUnitId === flight.id,
      })
    }
  }

  const layers: Layer[] = []
  if (dashData.length > 0) {
    layers.push(
      new PathLayer<StationDashDatum>({
        id: 'air-station-racetracks',
        data: dashData,
        getPath: (d) => d.path,
        getColor: (d) => (d.kind === 'aew' ? AEW_WHITE : CAP_CYAN),
        widthUnits: 'pixels',
        getWidth: 1,
        widthMinPixels: 1,
        pickable: false,
      }),
    )
  }
  if (lineData.length > 0) {
    layers.push(
      new LineLayer<StrikeLineDatum>({
        id: 'air-strike-lines',
        data: lineData,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        // Unselected flights keep a faint intent line (40%); selection brings it up
        getColor: (d) => (d.selected ? STRIKE_AMBER : STRIKE_AMBER_DIM),
        getWidth: 1,
        widthUnits: 'pixels',
        pickable: false,
      }),
    )
  }
  return layers
}
