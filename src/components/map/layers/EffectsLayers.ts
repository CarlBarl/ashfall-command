import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import type { Layer } from '@deck.gl/core'
import type { ViewUnit } from '@/types/view'
import type { KillMarker, TrackPoint } from '@/store/map-intel-store'

/** Real-time length of the expanding-ring/blot phase; the faint X persists after */
export const KILL_ANIM_MS = 10_000

const MONO_FONT = 'JetBrains Mono, Fira Code, monospace'

const TRAIL_MAX_RENDERED = 80
const TRAIL_SEGMENTS = 4
/** Per-segment alpha, newest → oldest */
const TRAIL_SEGMENT_ALPHAS = [165, 115, 70, 35]
const TRAIL_WIDTH_PX = 1.2

const MUTED_NATION_COLORS: Record<string, [number, number, number]> = {
  usa: [104, 128, 151],
  iran: [142, 95, 95],
}
const MUTED_FALLBACK: [number, number, number] = [120, 124, 128]

const KILL_RING_COLOR: [number, number, number] = [255, 235, 210]
const KILL_BLOT_COLOR: [number, number, number] = [255, 244, 230]
const KILL_X_COLOR: [number, number, number, number] = [170, 175, 180, 140]

type Rgba = [number, number, number, number]

function killProgress(m: KillMarker, nowMs: number): number {
  return Math.min(1, Math.max(0, (nowMs - m.addedAtMs) / KILL_ANIM_MS))
}

/** DEFCON-style death sites: expanding ring + fading blot for ~10 s, persistent faint X */
function createKillMarkerLayers(markers: KillMarker[], nowMs: number): Layer[] {
  if (markers.length === 0) return []
  const layers: Layer[] = [
    new TextLayer<KillMarker>({
      id: 'fx-kill-x',
      data: markers,
      getPosition: (d) => d.position,
      getText: () => 'x',
      getSize: 11,
      getColor: KILL_X_COLOR,
      fontFamily: MONO_FONT,
      fontWeight: 700,
      sizeUnits: 'pixels',
      billboard: true,
      pickable: false,
    }),
  ]

  const animating = markers.filter((m) => nowMs - m.addedAtMs < KILL_ANIM_MS)
  if (animating.length > 0) {
    const animKey = Math.floor(nowMs)
    layers.push(
      new ScatterplotLayer<KillMarker>({
        id: 'fx-kill-blots',
        data: animating,
        getPosition: (d) => d.position,
        getRadius: (d) => 10 - killProgress(d, nowMs) * 4,
        radiusUnits: 'pixels',
        filled: true,
        stroked: false,
        getFillColor: (d) => [...KILL_BLOT_COLOR, Math.round((1 - killProgress(d, nowMs)) * 185)] as Rgba,
        pickable: false,
        updateTriggers: { getRadius: animKey, getFillColor: animKey },
      }),
      new ScatterplotLayer<KillMarker>({
        id: 'fx-kill-rings',
        data: animating,
        getPosition: (d) => d.position,
        getRadius: (d) => 6 + killProgress(d, nowMs) * 26,
        radiusUnits: 'pixels',
        filled: false,
        stroked: true,
        getLineColor: (d) => [...KILL_RING_COLOR, Math.round((1 - killProgress(d, nowMs)) * 200)] as Rgba,
        lineWidthUnits: 'pixels',
        getLineWidth: 1.5,
        lineWidthMinPixels: 1,
        pickable: false,
        updateTriggers: { getRadius: animKey, getLineColor: animKey },
      }),
    )
  }
  return layers
}

interface TrailSegment {
  path: [number, number][]
  color: Rgba
}

/** Track-history trails for live enemy contacts, brightest at the newest end */
function createTrailLayers(
  trackHistory: Record<string, TrackPoint[]>,
  units: ViewUnit[],
  playerNation: string,
): Layer[] {
  const ids = Object.keys(trackHistory)
  if (ids.length === 0) return []

  const unitById = new Map(units.map((u) => [u.id, u]))
  const segments: TrailSegment[] = []
  let rendered = 0
  for (const id of ids) {
    if (rendered >= TRAIL_MAX_RENDERED) break
    const unit = unitById.get(id)
    if (!unit || unit.nation === playerNation || unit.status === 'destroyed') continue
    if (unit.visibility !== 'tracked' && unit.visibility !== 'identified') continue
    const buf = trackHistory[id]
    if (!buf || buf.length === 0) continue

    const points = buf.map((p) => p.position)
    // Live head so the trail meets the moving icon between samples
    if (!unit.stale) points.push([unit.position.lng, unit.position.lat])
    const n = points.length
    if (n < 2) continue
    rendered++

    const base = MUTED_NATION_COLORS[unit.nation] ?? MUTED_FALLBACK
    const chunk = Math.max(1, Math.ceil((n - 1) / TRAIL_SEGMENTS))
    let end = n - 1
    let segIdx = 0
    while (end > 0 && segIdx < TRAIL_SEGMENTS) {
      const start = Math.max(0, end - chunk)
      segments.push({
        path: points.slice(start, end + 1),
        color: [...base, TRAIL_SEGMENT_ALPHAS[segIdx]] as Rgba,
      })
      end = start
      segIdx++
    }
  }
  if (segments.length === 0) return []

  return [
    new PathLayer<TrailSegment>({
      id: 'fx-track-trails',
      data: segments,
      getPath: (d) => d.path,
      getColor: (d) => d.color,
      widthUnits: 'pixels',
      getWidth: TRAIL_WIDTH_PX,
      widthMinPixels: 1,
      pickable: false,
    }),
  ]
}

export interface EffectsLayerInputs {
  killMarkers: KillMarker[]
  trackHistory: Record<string, TrackPoint[]>
  units: ViewUnit[]
  playerNation: string
  /** Real-time clock (performance.now) driving the kill animations */
  nowMs: number
}

export function createEffectsLayers(opts: EffectsLayerInputs): Layer[] {
  return [
    ...createTrailLayers(opts.trackHistory, opts.units, opts.playerNation),
    ...createKillMarkerLayers(opts.killMarkers, opts.nowMs),
  ]
}
