import { PathLayer, IconLayer } from '@deck.gl/layers'
import { PathStyleExtension } from '@deck.gl/extensions'
import type { Missile, NationId } from '@/types/game'
import type { ViewUnit } from '@/types/view'
import { weaponSpecs } from '@/data/weapons/missiles'

const TRAIL_COLORS: Record<string, [number, number, number]> = {
  usa: [60, 130, 210],
  iran: [210, 60, 60],
}

const HEAD_COLORS: Record<string, [number, number, number, number]> = {
  usa: [140, 200, 255, 255],
  iran: [255, 140, 120, 255],
}

const INTERCEPTOR_COLOR: [number, number, number, number] = [200, 200, 200, 220]
const INTERCEPTOR_TRAIL: [number, number, number] = [140, 140, 140]

const ICON_MAPPING: Record<string, { x: number; y: number; width: number; height: number; mask: boolean }> = {
  cruise:    { x: 0,  y: 0, width: 64, height: 64, mask: true },
  ballistic: { x: 64, y: 0, width: 64, height: 64, mask: true },
}

interface MissileRender {
  id: string
  trail: [number, number][]       // traveled path (solid line)
  predicted: [number, number][]   // current pos → target (dashed line)
  position: [number, number]      // current head position
  nation: NationId
  type: 'cruise' | 'ballistic'
  bearing: number
  isInterceptor: boolean
}

/** Interpolate missile position along its path at the given game time */
function getMissilePosition(m: Missile, currentTime: number): [number, number] | null {
  const { timestamps, path } = m
  if (timestamps.length < 2) return null

  if (currentTime <= timestamps[0]) return path[0]
  if (currentTime >= timestamps[timestamps.length - 1]) return path[path.length - 1]

  for (let i = 0; i < timestamps.length - 1; i++) {
    if (currentTime >= timestamps[i] && currentTime < timestamps[i + 1]) {
      const t = (currentTime - timestamps[i]) / (timestamps[i + 1] - timestamps[i])
      return [
        path[i][0] + (path[i + 1][0] - path[i][0]) * t,
        path[i][1] + (path[i + 1][1] - path[i][1]) * t,
      ]
    }
  }
  return null
}

/** Compute bearing from last two relevant path segments */
function getMissileBearing(m: Missile, currentTime: number): number {
  const { timestamps, path } = m
  if (path.length < 2) return 0

  let idx = path.length - 2
  for (let i = 0; i < timestamps.length - 1; i++) {
    if (currentTime >= timestamps[i] && currentTime < timestamps[i + 1]) {
      idx = i
      break
    }
  }

  const [lng1, lat1] = path[idx]
  const [lng2, lat2] = path[Math.min(idx + 1, path.length - 1)]
  const dLng = (lng2 - lng1) * Math.PI / 180
  const lat1r = lat1 * Math.PI / 180
  const lat2r = lat2 * Math.PI / 180
  const y = Math.sin(dLng) * Math.cos(lat2r)
  const x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLng)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

/** Split missile path into trail (past) and predicted (future) */
function splitPath(
  m: Missile,
  currentTime: number,
  currentPos: [number, number],
  targetPos: [number, number] | null,
): { trail: [number, number][]; predicted: [number, number][] } {
  const trail: [number, number][] = []

  // Collect path points up to currentTime
  for (let i = 0; i < m.timestamps.length; i++) {
    if (m.timestamps[i] <= currentTime) {
      trail.push(m.path[i])
    }
  }
  // Add interpolated current position as the trail endpoint
  trail.push(currentPos)

  // Predicted: straight line from current pos to target
  const predicted: [number, number][] = [currentPos]
  if (targetPos) {
    predicted.push(targetPos)
  }

  return { trail, predicted }
}

export function createMissileLayers(
  missiles: Missile[],
  currentTime: number,
  units: ViewUnit[],
  onHover?: (id: string | null, x?: number, y?: number) => void,
) {
  const inflight = missiles.filter(m => m.status === 'inflight')

  // Build unit position lookup for target resolution
  const unitPositions = new Map<string, [number, number]>()
  for (const u of units) {
    unitPositions.set(u.id, [u.position.lng, u.position.lat])
  }

  // Compute render data for each missile
  const renders: MissileRender[] = []
  for (const m of inflight) {
    const pos = getMissilePosition(m, currentTime)
    if (!pos) continue

    const spec = weaponSpecs[m.weaponId]
    const isBallistic = spec?.type === 'ballistic_missile'
    const targetPos = m.targetId ? unitPositions.get(m.targetId) ?? null : null
    const { trail, predicted } = splitPath(m, currentTime, pos, targetPos)

    renders.push({
      id: m.id,
      trail,
      predicted,
      position: pos,
      nation: m.nation,
      type: isBallistic ? 'ballistic' : 'cruise',
      bearing: getMissileBearing(m, currentTime),
      isInterceptor: m.is_interceptor,
    })
  }

  const offensive = renders.filter(r => !r.isInterceptor)

  return [
    // Solid trail — where the missile has been (subtle)
    new PathLayer<MissileRender>({
      id: 'missile-trail',
      data: renders,
      getPath: (d) => d.trail,
      getColor: (d) => d.isInterceptor
        ? INTERCEPTOR_TRAIL
        : TRAIL_COLORS[d.nation] ?? [180, 180, 180],
      widthMinPixels: 0.5,
      widthMaxPixels: 1,
      jointRounded: true,
      capRounded: true,
      opacity: 0.35,
      updateTriggers: { getPath: currentTime },
    }),

    // Dashed predicted path — very faint, only shows direction
    new (PathLayer as any)({
      id: 'missile-predicted',
      data: offensive.filter(r => r.predicted.length >= 2),
      getPath: (d: MissileRender) => d.predicted,
      getColor: (d: MissileRender) => TRAIL_COLORS[d.nation] ?? [180, 180, 180],
      getDashArray: [4, 8],
      widthMinPixels: 0.5,
      widthMaxPixels: 1,
      jointRounded: true,
      capRounded: true,
      opacity: 0.12,
      extensions: [new PathStyleExtension({ dash: true })],
      dashJustified: true,
      updateTriggers: { getPath: currentTime },
    }),

    // Directional arrow heads
    new IconLayer<MissileRender>({
      id: 'missile-heads',
      data: renders,
      pickable: true,
      iconAtlas: '/sprites/missile-atlas.svg',
      iconMapping: ICON_MAPPING,
      getIcon: (d) => d.type,
      getPosition: (d) => d.position,
      getSize: (d) => {
        if (d.isInterceptor) return 14
        return d.type === 'ballistic' ? 20 : 16
      },
      getColor: (d) => d.isInterceptor
        ? INTERCEPTOR_COLOR
        : HEAD_COLORS[d.nation] ?? [255, 255, 255, 255],
      getAngle: (d) => -d.bearing,
      sizeUnits: 'pixels',
      sizeMinPixels: 10,
      sizeMaxPixels: 24,
      billboard: true,
      onHover: (info) => {
        onHover?.(info.object?.id ?? null, info.x, info.y)
      },
      updateTriggers: {
        getPosition: currentTime,
        getAngle: currentTime,
      },
    }),
  ]
}
