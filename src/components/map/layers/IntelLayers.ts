import { LineLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import type { Layer } from '@deck.gl/core'
import type { ViewUnit } from '@/types/view'
import type { SatTasking } from '@/types/game'
import type { AdsbAircraft } from '@/store/map-intel-store'

const MONO_FONT = 'JetBrains Mono, Fira Code, monospace'
const TEXT_OUTLINE: [number, number, number, number] = [13, 17, 23, 220]

const TICKS_PER_GAME_MINUTE = 60
const AOU_MAX_RADIUS_KM = 60
const TASKING_SWATH_KM = 60
const RADAR_HORIZON_COEF = 4.12
const SURFACE_TARGET_HEIGHT_M = 20
const ADSB_HEADING_TICK_KM = 3.5

const AOU_AMBER: [number, number, number, number] = [212, 168, 84, 128]
const SENSOR_CYAN: [number, number, number, number] = [64, 224, 240, 200]
const SENSOR_CYAN_DIM: [number, number, number, number] = [64, 224, 240, 90]
const SWATH_WHITE: [number, number, number, number] = [235, 235, 235, 130]
const ADSB_GRAY: [number, number, number, number] = [168, 174, 180, 153]

type LngLat = [number, number]

const KM_PER_DEG_LAT = 110.574
const KM_PER_DEG_LON_EQ = 111.32

function offsetKm(lng: number, lat: number, eastKm: number, northKm: number): LngLat {
  const dLat = northKm / KM_PER_DEG_LAT
  const dLng = eastKm / (KM_PER_DEG_LON_EQ * Math.cos((lat * Math.PI) / 180))
  return [lng + dLng, lat + dLat]
}

function circlePath(lng: number, lat: number, radiusKm: number, segments = 72): LngLat[] {
  const pts: LngLat[] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    pts.push(offsetKm(lng, lat, Math.sin(a) * radiusKm, Math.cos(a) * radiusKm))
  }
  return pts
}

// Dashed ring as separate short arcs — PathStyleExtension is not a dependency
function dashedCirclePaths(lng: number, lat: number, radiusKm: number, dashes = 40): LngLat[][] {
  const paths: LngLat[][] = []
  const slot = (Math.PI * 2) / dashes
  for (let i = 0; i < dashes; i++) {
    const start = i * slot
    const arc: LngLat[] = []
    for (let j = 0; j <= 3; j++) {
      const a = start + (j / 3) * slot * 0.55
      arc.push(offsetKm(lng, lat, Math.sin(a) * radiusKm, Math.cos(a) * radiusKm))
    }
    paths.push(arc)
  }
  return paths
}

export function aouRadiusKm(minutesStale: number): number {
  return Math.min(AOU_MAX_RADIUS_KM, 4 + minutesStale * 0.5)
}

export function radarHorizonKm(antennaHeightM: number): number {
  return RADAR_HORIZON_COEF * (Math.sqrt(antennaHeightM) + Math.sqrt(SURFACE_TARGET_HEIGHT_M))
}

interface AouDatum {
  id: string
  position: LngLat
  radiusM: number
}

/** Area-of-uncertainty rings: stale enemy contacts grow until refreshed */
export function createAouLayers(
  units: ViewUnit[],
  staleSince: Record<string, number>,
  tick: number,
  playerNation: string,
): Layer[] {
  const data: AouDatum[] = []
  for (const u of units) {
    if (u.nation === playerNation || !u.stale || u.status === 'destroyed') continue
    const since = staleSince[u.id]
    const minutesStale = since === undefined ? 0 : Math.max(0, (tick - since) / TICKS_PER_GAME_MINUTE)
    data.push({
      id: u.id,
      position: [u.position.lng, u.position.lat],
      radiusM: aouRadiusKm(minutesStale) * 1000,
    })
  }
  if (data.length === 0) return []
  return [
    new ScatterplotLayer<AouDatum>({
      id: 'intel-aou-rings',
      data,
      getPosition: (d) => d.position,
      getRadius: (d) => d.radiusM,
      radiusUnits: 'meters',
      filled: false,
      stroked: true,
      getLineColor: AOU_AMBER,
      lineWidthUnits: 'pixels',
      getLineWidth: 1,
      lineWidthMinPixels: 1,
      pickable: false,
    }),
  ]
}

/** Radar rings for the selected own unit: solid at the surface horizon, dashed at nominal range */
export function createSensorRingLayers(selected: ViewUnit | undefined): Layer[] {
  if (!selected || selected.emcon === true || selected.status === 'destroyed') return []
  const radars = (selected.sensors ?? []).filter((s) => s.type === 'radar')
  if (radars.length === 0) return []

  const { lng, lat } = selected.position
  const solid: { path: LngLat[] }[] = []
  const dashed: { path: LngLat[] }[] = []
  for (const radar of radars) {
    const horizon = radarHorizonKm(radar.antenna_height_m ?? 15)
    solid.push({ path: circlePath(lng, lat, Math.min(radar.range_km, horizon)) })
    if (radar.range_km > horizon) {
      for (const path of dashedCirclePaths(lng, lat, radar.range_km, 48)) dashed.push({ path })
    }
  }

  const layers: Layer[] = [
    new PathLayer<{ path: LngLat[] }>({
      id: 'intel-sensor-ring-horizon',
      data: solid,
      getPath: (d) => d.path,
      getColor: SENSOR_CYAN,
      widthUnits: 'pixels',
      getWidth: 1,
      widthMinPixels: 1,
      pickable: false,
    }),
  ]
  if (dashed.length > 0) {
    layers.push(
      new PathLayer<{ path: LngLat[] }>({
        id: 'intel-sensor-ring-nominal',
        data: dashed,
        getPath: (d) => d.path,
        getColor: SENSOR_CYAN_DIM,
        widthUnits: 'pixels',
        getWidth: 1,
        widthMinPixels: 1,
        pickable: false,
      }),
    )
  }
  return layers
}

/** Queued satellite taskings: 60 km dashed AOI ring + PASS QUEUED tag */
export function createTaskingSwathLayers(taskings: SatTasking[]): Layer[] {
  if (taskings.length === 0) return []
  const ringPaths = taskings.flatMap((t) =>
    dashedCirclePaths(t.target.lng, t.target.lat, TASKING_SWATH_KM, 48).map((path) => ({ path })),
  )
  return [
    new PathLayer<{ path: LngLat[] }>({
      id: 'intel-tasking-swaths',
      data: ringPaths,
      getPath: (d) => d.path,
      getColor: SWATH_WHITE,
      widthUnits: 'pixels',
      getWidth: 1,
      widthMinPixels: 1,
      pickable: false,
    }),
    new TextLayer<SatTasking>({
      id: 'intel-tasking-labels',
      data: taskings,
      getPosition: (t) => [t.target.lng, t.target.lat],
      getText: () => 'PASS QUEUED',
      getSize: 10,
      getColor: [235, 235, 235, 190],
      getPixelOffset: [0, -12],
      fontFamily: MONO_FONT,
      fontWeight: 700,
      outlineWidth: 2,
      outlineColor: TEXT_OUTLINE,
      sizeUnits: 'pixels',
      billboard: true,
      pickable: false,
    }),
  ]
}

/** Live ADS-B traffic: ambient gray dots + heading ticks, callsigns when zoomed in */
export function createAdsbLayers(aircraft: AdsbAircraft[], showCallsigns: boolean): Layer[] {
  if (aircraft.length === 0) return []
  const layers: Layer[] = [
    new ScatterplotLayer<AdsbAircraft>({
      id: 'intel-adsb-aircraft',
      data: aircraft,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 2.5,
      radiusUnits: 'pixels',
      getFillColor: ADSB_GRAY,
      stroked: false,
      pickable: false,
    }),
  ]

  const withTrack = aircraft.filter((a) => a.track !== null)
  if (withTrack.length > 0) {
    layers.push(
      new LineLayer<AdsbAircraft>({
        id: 'intel-adsb-heading-ticks',
        data: withTrack,
        getSourcePosition: (d) => [d.lon, d.lat],
        getTargetPosition: (d) => {
          const rad = ((d.track ?? 0) * Math.PI) / 180
          return offsetKm(d.lon, d.lat, Math.sin(rad) * ADSB_HEADING_TICK_KM, Math.cos(rad) * ADSB_HEADING_TICK_KM)
        },
        getColor: [168, 174, 180, 140],
        getWidth: 1,
        widthUnits: 'pixels',
        pickable: false,
      }),
    )
  }

  if (showCallsigns) {
    layers.push(
      new TextLayer<AdsbAircraft>({
        id: 'intel-adsb-callsigns',
        data: aircraft.filter((a) => a.callsign !== ''),
        getPosition: (d) => [d.lon, d.lat],
        getText: (d) => d.callsign,
        getSize: 9,
        getColor: [168, 174, 180, 150],
        getPixelOffset: [0, -10],
        fontFamily: MONO_FONT,
        fontWeight: 600,
        outlineWidth: 2,
        outlineColor: TEXT_OUTLINE,
        sizeUnits: 'pixels',
        billboard: true,
        pickable: false,
      }),
    )
  }
  return layers
}

export interface IntelMapLayerInputs {
  intelOverlaysOn: boolean
  adsbOn: boolean
  units: ViewUnit[]
  playerNation: string
  tick: number
  staleSince: Record<string, number>
  selectedUnit: ViewUnit | undefined
  taskings: SatTasking[]
  aircraft: AdsbAircraft[]
  showCallsigns: boolean
}

export function createIntelMapLayers(opts: IntelMapLayerInputs): Layer[] {
  const layers: Layer[] = []
  if (opts.adsbOn) {
    layers.push(...createAdsbLayers(opts.aircraft, opts.showCallsigns))
  }
  if (opts.intelOverlaysOn) {
    layers.push(...createAouLayers(opts.units, opts.staleSince, opts.tick, opts.playerNation))
    layers.push(...createTaskingSwathLayers(opts.taskings))
    layers.push(...createSensorRingLayers(opts.selectedUnit))
  }
  return layers
}
